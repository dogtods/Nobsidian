/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  X,
  Crop,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Upload,
  Check,
  RefreshCw,
  Image as ImageIcon,
  Move,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  FileText,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Globe,
  FileSearch,
  Maximize2,
  FolderOpen,
  Sparkles,
  ExternalLink,
  Minimize2,
  Sliders,
  Eye
} from "lucide-react";

// Configure PDF.js worker with 3 robust fallbacks: Vite URL -> Local Server -> CDN
if (typeof window !== "undefined") {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker || "/api/pdf.worker.mjs";
  } catch (_) {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/api/pdf.worker.mjs";
    } catch (__) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
    }
  }
}

interface DetectedLink {
  title: string;
  url: string;
}

interface ImageCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertImage: (
    imageDataUrl: string,
    altText?: string,
    size?: string,
    position?: 'cursor' | 'top' | 'bottom'
  ) => void;
  initialImageData?: string | null;
  initialAltText?: string;
  initialSize?: string;
  sourceUrl?: string; // Current note's source URL
  noteContent?: string; // Current note's markdown content to extract links
  noteTitle?: string; // Current note's title
}

type AspectRatio = "free" | "1:1" | "4:3" | "16:9" | "3:2";
type ViewMode = "fit" | "width";

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  onClose,
  onInsertImage,
  initialImageData,
  initialAltText,
  initialSize,
  sourceUrl,
  noteContent,
  noteTitle
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(initialImageData || null);
  const [imageMeta, setImageMeta] = useState<{ width: number; height: number } | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("free");
  const [zoom, setZoom] = useState<number>(1);
  const [viewMode, setViewMode] = useState<ViewMode>("fit"); // "fit" (Page fit, no cutoff) or "width" (Fit width)
  const [altText, setAltText] = useState<string>("");
  // デフォルトサイズは前より一段階小さく設定 (460px -> 260px)
  const [imageSize, setImageSize] = useState<string>(initialSize || "260px");
  const [insertPosition, setInsertPosition] = useState<'cursor' | 'top' | 'bottom'>("cursor");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>("");

  // PDF-specific states (Strict read-only in memory)
  const [pdfDoc, setPdfDoc] = useState<any | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [pdfScale, setPdfScale] = useState<number>(1.75); // 1.75x produces sharp, crisp text and figures
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [detectedPdfLinks, setDetectedPdfLinks] = useState<DetectedLink[]>([]);
  const [urlInput, setUrlInput] = useState<string>("");
  const [isUrlInputOpen, setIsUrlInputOpen] = useState<boolean>(false);

  // Crop box in percentage (0.0 to 1.0)
  const [cropBox, setCropBox] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 0.1,
    y: 0.1,
    width: 0.8,
    height: 0.8
  });

  type DragMode = "move" | "nw" | "ne" | "sw" | "se";
  const [dragMode, setDragMode] = useState<DragMode | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; box: typeof cropBox } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extract all potential PDF or article links from note body and sourceUrl
  const inlineNoteLinks = useMemo(() => {
    const list: DetectedLink[] = [];
    const seen = new Set<string>();

    if (sourceUrl && sourceUrl.trim()) {
      const u = sourceUrl.trim();
      seen.add(u);
      const isDirectPdf = /\.pdf(?:[?#]|$)/i.test(u) || u.includes("arxiv.org") || u.includes("/pdf/");
      list.push({
        title: isDirectPdf ? "元記事の直結PDF" : "元記事リンク",
        url: u
      });
    }

    if (noteContent) {
      // Markdown links: [Title](url)
      const mdRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
      let m: RegExpExecArray | null;
      while ((m = mdRegex.exec(noteContent)) !== null) {
        const text = m[1];
        const u = m[2];
        if (!seen.has(u)) {
          seen.add(u);
          const isPdf = /\.pdf(?:[?#]|$)/i.test(u) || u.includes("drive.google.com") || u.includes("arxiv.org");
          if (isPdf) {
            list.push({ title: `本文内PDF: ${text.length > 30 ? text.slice(0, 30) + '…' : text}`, url: u });
          }
        }
      }

      // Raw URLs ending with .pdf
      const rawPdfRegex = /(https?:\/\/[^\s<>"'\)]+\.pdf(?:\?[^\s<>"'\)]*)?)/gi;
      while ((m = rawPdfRegex.exec(noteContent)) !== null) {
        const u = m[1];
        if (!seen.has(u)) {
          seen.add(u);
          const fn = u.split("/").pop()?.split("?")[0] || "document.pdf";
          list.push({ title: `本文内PDF: ${fn}`, url: u });
        }
      }
    }
    return list;
  }, [sourceUrl, noteContent]);

  // Compute crop box helper given target aspect ratio
  const computeCropBox = useCallback((
    ratio: AspectRatio,
    imgW: number,
    imgH: number,
    prevBox?: { x: number; y: number; width: number; height: number }
  ) => {
    if (ratio === "free") {
      return prevBox || { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
    }

    const targetRatio = ratio === "1:1" ? 1.0
      : ratio === "4:3" ? 4 / 3
      : ratio === "16:9" ? 16 / 9
      : ratio === "3:2" ? 3 / 2
      : 1.0;

    const imgAspect = imgW / imgH;

    let w = 0.8;
    let h = w * (imgAspect / targetRatio);

    if (h > 0.85) {
      h = 0.85;
      w = h * (targetRatio / imgAspect);
    }

    w = Math.min(0.95, Math.max(0.08, w));
    h = Math.min(0.95, Math.max(0.08, h));

    let x = prevBox ? prevBox.x + (prevBox.width - w) / 2 : (1 - w) / 2;
    let y = prevBox ? prevBox.y + (prevBox.height - h) / 2 : (1 - h) / 2;

    x = Math.max(0, Math.min(1 - w, x));
    y = Math.max(0, Math.min(1 - h, y));

    return { x, y, width: w, height: h };
  }, []);

  // Track image load and cache true natural dimensions
  useEffect(() => {
    if (!imageSrc) {
      setImageMeta(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const meta = {
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height
      };
      setImageMeta(meta);
      setCropBox(prev => computeCropBox(aspectRatio, meta.width, meta.height, prev));
    };
    img.src = imageSrc;
  }, [imageSrc, aspectRatio, computeCropBox]);

  // Render a specific page of PDF strictly to an in-memory canvas (Read-Only)
  const renderPdfPage = useCallback(async (doc: any, pageNum: number, scale = pdfScale) => {
    if (!doc) return;
    setIsProcessing(true);
    setProcessingStatus(`P.${pageNum} を高解像度レンダリング中...`);
    setPdfError(null);
    try {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas context could not be created");

      // Fill with crisp pure white background so black text and charts are 100% visible
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport }).promise;

      const pageDataUrl = canvas.toDataURL("image/png");
      setImageSrc(pageDataUrl);
      setZoom(1);
      // Auto-suggest caption if empty or previous page caption
      setAltText(prev => (!prev || /^P\.\d+/.test(prev)) ? `P.${pageNum}` : prev);
    } catch (err: any) {
      console.error("PDF page render error:", err);
      setPdfError(`ページのレンダリングに失敗しました: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  }, [pdfScale]);

  // Load PDF from File (Strictly Read-Only in memory)
  const loadPdfFromFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setProcessingStatus(`PDF「${file.name}」を読み込み中...`);
    setPdfError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer),
        cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/cmaps/",
        cMapPacked: true,
      });
      const doc = await loadingTask.promise;
      setPdfDoc(doc);
      setPdfFileName(file.name);
      setTotalPages(doc.numPages);
      setCurrentPage(1);
      await renderPdfPage(doc, 1, pdfScale);
    } catch (err: any) {
      console.error("PDF loading error:", err);
      setPdfError(`PDFの読み込みに失敗しました: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  }, [pdfScale, renderPdfPage]);

  // Load PDF from URL (e.g. sourceUrl, candidate link, or user URL)
  const loadPdfFromUrl = useCallback(async (urlToLoad: string) => {
    if (!urlToLoad) return;
    setIsProcessing(true);
    setProcessingStatus("リンク先のPDFを取得中...");
    setPdfError(null);
    try {
      let target = urlToLoad.trim();
      const driveMatch = target.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || target.match(/id=([a-zA-Z0-9_-]+)/);
      if (driveMatch && !target.includes("export=download")) {
        target = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
      }

      if (target.includes("arxiv.org/abs/") || target.includes("arxiv.org/html/")) {
        target = target.replace(/arxiv\.org\/(?:abs|html)\//, "arxiv.org/pdf/") + ".pdf";
      }

      // Fetch through backend binary proxy
      const proxyUrl = `/api/proxy-pdf?url=${encodeURIComponent(target)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        if (errJson.detectedPdfLinks && errJson.detectedPdfLinks.length > 0) {
          setDetectedPdfLinks(errJson.detectedPdfLinks);
          // If only 1 link was found, auto-load it immediately!
          if (errJson.detectedPdfLinks.length === 1) {
            setProcessingStatus(`検出されたPDF「${errJson.detectedPdfLinks[0].title}」を取得中...`);
            return await loadPdfFromUrl(errJson.detectedPdfLinks[0].url);
          }
        }
        throw new Error(errJson.error || `HTTP ${res.status}: ${res.statusText}`);
      }

      const arrayBuffer = await res.arrayBuffer();

      // Check for %PDF- header
      const headerBytes = new Uint8Array(arrayBuffer.slice(0, 1024));
      const headerStr = String.fromCharCode(...headerBytes);
      if (!headerStr.includes("%PDF-")) {
        throw new Error("指定されたリンク先はPDFドキュメントではなくWebページ（HTML等）でした。下のリンク一覧またはローカルPDFファイルを選択してください。");
      }

      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer),
        cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/cmaps/",
        cMapPacked: true,
      });
      const doc = await loadingTask.promise;
      setPdfDoc(doc);
      const urlFileName = target.split('/').pop()?.split('?')[0] || "document.pdf";
      setPdfFileName(urlFileName.endsWith('.pdf') ? urlFileName : `${urlFileName}.pdf`);
      setTotalPages(doc.numPages);
      setCurrentPage(1);
      await renderPdfPage(doc, 1, pdfScale);
      setIsUrlInputOpen(false);
    } catch (err: any) {
      console.error("PDF URL load error:", err);
      setPdfError(err.message || "PDFの取得に失敗しました。");
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  }, [pdfScale, renderPdfPage]);

  // Modal open & initial data handling
  useEffect(() => {
    if (!isOpen) return;

    if (initialImageData) {
      setImageSrc(initialImageData);
      setZoom(1);
      setAltText(initialAltText || "");
      setImageSize(initialSize || "260px");
      setPdfDoc(null);
      setPdfFileName("");
      setPdfError(null);
    } else {
      setImageSrc(null);
      setAltText("");
      setImageSize(initialSize || "260px");
      setInsertPosition("cursor");
      setPdfDoc(null);
      setPdfFileName("");
      setPdfError(null);
      setDetectedPdfLinks([]);

      // Auto-load if sourceUrl is present
      if (sourceUrl && sourceUrl.trim()) {
        loadPdfFromUrl(sourceUrl);
      }
    }
  }, [isOpen, initialImageData, initialAltText, initialSize, sourceUrl, loadPdfFromUrl]);

  // Page navigation
  const goToPage = async (page: number) => {
    if (!pdfDoc) return;
    const targetPage = Math.max(1, Math.min(totalPages, page));
    setCurrentPage(targetPage);
    await renderPdfPage(pdfDoc, targetPage, pdfScale);
  };

  // Handle local file selection (Images OR PDFs)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      await loadPdfFromFile(file);
    } else if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setImageSrc(result);
        setPdfDoc(null);
        setPdfFileName("");
        setPdfError(null);
        setZoom(1);
      };
      reader.readAsDataURL(file);
    } else {
      alert("画像ファイル（PNG, JPEG, WebP等）またはPDFファイルを選択してください。");
    }
  };

  // Handle paste directly from clipboard
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const result = event.target?.result as string;
            setImageSrc(result);
            setPdfDoc(null);
            setPdfFileName("");
            setPdfError(null);
            setZoom(1);
          };
          reader.readAsDataURL(blob);
          e.preventDefault();
          break;
        }
      }
    }
  };

  // Aspect ratio switcher
  const handleSetAspectRatio = (ratio: AspectRatio) => {
    setAspectRatio(ratio);
    if (!imageMeta) return;
    setCropBox(prev => computeCropBox(ratio, imageMeta.width, imageMeta.height, prev));
  };

  // Quick alignment helpers
  const alignCrop = (position: "top" | "center" | "bottom" | "left" | "right") => {
    setCropBox(prev => {
      let x = prev.x;
      let y = prev.y;
      if (position === "top") y = 0.02;
      if (position === "center") {
        x = (1 - prev.width) / 2;
        y = (1 - prev.height) / 2;
      }
      if (position === "bottom") y = Math.max(0, 1 - prev.height - 0.02);
      if (position === "left") x = 0.02;
      if (position === "right") x = Math.max(0, 1 - prev.width - 0.02);
      return { ...prev, x, y };
    });
  };

  // Fine-tuning nudge buttons (4% increments)
  const nudgeCrop = (dx: number, dy: number) => {
    setCropBox(prev => {
      const x = Math.max(0, Math.min(1 - prev.width, prev.x + dx));
      const y = Math.max(0, Math.min(1 - prev.height, prev.y + dy));
      return { ...prev, x, y };
    });
  };

  // Touch and pointer dragging
  const handleContainerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== containerRef.current && e.target !== imageRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;

    const newX = Math.max(0, Math.min(1 - cropBox.width, clickX - cropBox.width / 2));
    const newY = Math.max(0, Math.min(1 - cropBox.height, clickY - cropBox.height / 2));

    const updatedBox = { ...cropBox, x: newX, y: newY };
    setCropBox(updatedBox);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    setDragMode("move");
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      box: updatedBox
    });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, mode: DragMode) => {
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    setDragMode(mode);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      box: { ...cropBox }
    });
  };

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragMode || !dragStart || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const deltaX = (e.clientX - dragStart.x) / rect.width;
    const deltaY = (e.clientY - dragStart.y) / rect.height;
    const b = dragStart.box;
    const next = { ...b };

    if (dragMode === "move") {
      next.x = Math.max(0, Math.min(1 - b.width, b.x + deltaX));
      next.y = Math.max(0, Math.min(1 - b.height, b.y + deltaY));
    } else {
      // Corner resizing with aspect ratio constraint
      const targetRatio = aspectRatio === "1:1" ? 1.0
        : aspectRatio === "4:3" ? 4 / 3
        : aspectRatio === "16:9" ? 16 / 9
        : aspectRatio === "3:2" ? 3 / 2
        : null;

      const imgAspect = imageMeta ? imageMeta.width / imageMeta.height : 1;

      if (dragMode === "se") {
        let newW = Math.max(0.08, Math.min(1 - b.x, b.width + deltaX));
        let newH = Math.max(0.08, Math.min(1 - b.y, b.height + deltaY));

        if (targetRatio !== null) {
          newH = newW * (imgAspect / targetRatio);
          if (b.y + newH > 1) {
            newH = 1 - b.y;
            newW = newH * (targetRatio / imgAspect);
          }
          if (b.x + newW > 1) {
            newW = 1 - b.x;
            newH = newW * (imgAspect / targetRatio);
          }
        }
        next.width = Math.max(0.08, newW);
        next.height = Math.max(0.08, newH);
      } else if (dragMode === "sw") {
        let newW = Math.max(0.08, b.width - deltaX);
        let newH = Math.max(0.08, Math.min(1 - b.y, b.height + deltaY));

        if (targetRatio !== null) {
          newH = newW * (imgAspect / targetRatio);
          if (b.y + newH > 1) {
            newH = 1 - b.y;
            newW = newH * (targetRatio / imgAspect);
          }
        }
        const newX = Math.max(0, b.x + (b.width - newW));
        next.width = b.x + b.width - newX;
        next.x = newX;
        next.height = Math.max(0.08, newH);
      } else if (dragMode === "ne") {
        let newW = Math.max(0.08, Math.min(1 - b.x, b.width + deltaX));
        let newH = Math.max(0.08, b.height - deltaY);

        if (targetRatio !== null) {
          newH = newW * (imgAspect / targetRatio);
          if (b.y + b.height - newH < 0) {
            newH = b.y + b.height;
            newW = newH * (targetRatio / imgAspect);
          }
        }
        const newY = Math.max(0, b.y + (b.height - newH));
        next.height = b.y + b.height - newY;
        next.y = newY;
        next.width = Math.max(0.08, newW);
      } else if (dragMode === "nw") {
        let newW = Math.max(0.08, b.width - deltaX);
        let newH = Math.max(0.08, b.height - deltaY);

        if (targetRatio !== null) {
          newH = newW * (imgAspect / targetRatio);
          if (b.y + b.height - newH < 0) {
            newH = b.y + b.height;
            newW = newH * (targetRatio / imgAspect);
          }
        }
        const newX = Math.max(0, b.x + (b.width - newW));
        const newY = Math.max(0, b.y + (b.height - newH));
        next.width = b.x + b.width - newX;
        next.x = newX;
        next.height = b.y + b.height - newY;
        next.y = newY;
      }
    }

    setCropBox(next);
  }, [dragMode, dragStart, aspectRatio, imageMeta]);

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
    setDragMode(null);
    setDragStart(null);
  };

  // Execute crop and produce optimized Base64 with pixel-perfect ratio guarantee
  const handleExecuteCrop = () => {
    if (!imageSrc) return;
    setIsProcessing(true);
    setProcessingStatus("画像を切り抜き処理中...");

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const origW = img.naturalWidth || img.width;
      const origH = img.naturalHeight || img.height;

      let cropX = Math.round(cropBox.x * origW);
      let cropY = Math.round(cropBox.y * origH);
      let cropW = Math.round(cropBox.width * origW);
      let cropH = Math.round(cropBox.height * origH);

      // Strict enforcement for exact aspect ratios (especially 1:1)
      if (aspectRatio === "1:1") {
        const side = Math.min(cropW, cropH);
        cropW = side;
        cropH = side;
      } else if (aspectRatio === "4:3") {
        cropH = Math.round(cropW * (3 / 4));
      } else if (aspectRatio === "16:9") {
        cropH = Math.round(cropW * (9 / 16));
      } else if (aspectRatio === "3:2") {
        cropH = Math.round(cropW * (2 / 3));
      }

      // Clamp within image bounds
      if (cropX + cropW > origW) cropX = Math.max(0, origW - cropW);
      if (cropY + cropH > origH) cropY = Math.max(0, origH - cropH);
      cropW = Math.min(cropW, origW - cropX);
      cropH = Math.min(cropH, origH - cropY);

      // Scale down if extremely large to keep note lightweight
      const maxDim = 1200;
      let finalW = cropW;
      let finalH = cropH;
      if (finalW > maxDim || finalH > maxDim) {
        if (finalW >= finalH) {
          finalH = Math.round((finalH * maxDim) / finalW);
          finalW = maxDim;
        } else {
          finalW = Math.round((finalW * maxDim) / finalH);
          finalH = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, finalW);
      canvas.height = Math.max(1, finalH);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      if (!ctx) {
        setIsProcessing(false);
        setProcessingStatus("");
        alert("キャンバスコンテキストの生成に失敗しました。");
        return;
      }

      // Crisp white background for charts and transparent scans
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.drawImage(
        img,
        cropX,
        cropY,
        cropW,
        cropH,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const outputData = canvas.toDataURL("image/png", 0.92);
      setIsProcessing(false);
      setProcessingStatus("");
      onInsertImage(outputData, altText.trim(), imageSize, insertPosition);
      onClose();
    };
    img.src = imageSrc;
  };

  if (!isOpen) return null;

  // Approximate pixel crop size for real-time display feedback
  const liveCropW = imageMeta ? Math.round(cropBox.width * imageMeta.width) : 0;
  const liveCropH = imageMeta ? (aspectRatio === "1:1" ? liveCropW : Math.round(cropBox.height * imageMeta.height)) : 0;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 select-none animate-[fadeIn_0.15s_ease-out]"
      onPaste={handlePaste}
      tabIndex={0}
    >
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-6xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-[#30363d] bg-[#0d1117]/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
              {pdfDoc ? <FileText className="w-4 h-4" /> : <Crop className="w-4 h-4 text-sky-400" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                <span>{pdfDoc ? "元記事PDF 閲覧 & 切り抜き挿入" : "元記事PDF・画像 切り抜き (トリミング) 挿入"}</span>
                <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>元PDFは編集されません（完全安全・読み取り専用）</span>
                </span>
              </h3>
              <p className="text-[11px] text-gray-400">
                {pdfDoc
                  ? `「${pdfFileName}」を開いています。指で枠を移動して図表やグラフを切り抜き、ノートに挿入します。`
                  : "元記事PDFまたは画像を開き、必要な図表・テキスト・写真を切り抜いて貼り付けます。"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition cursor-pointer"
            title="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PDF Navigation & Display Control Bar (Shows when a PDF is open) */}
        {pdfDoc && (
          <div className="px-3 sm:px-4 py-2 bg-gradient-to-r from-rose-950/40 via-[#1c2128] to-[#0d1117] border-b border-[#30363d] flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
            {/* File name & Page pager */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/20 text-rose-300 rounded-lg border border-rose-500/30 font-semibold text-[11px]">
                <FileText className="w-3.5 h-3.5 text-rose-400" />
                <span className="max-w-[150px] sm:max-w-[240px] truncate" title={pdfFileName}>
                  {pdfFileName || "PDFドキュメント"}
                </span>
              </span>

              {/* Page pager */}
              <div className="flex items-center bg-[#0d1117] border border-[#30363d] rounded-lg p-0.5">
                <button
                  type="button"
                  disabled={currentPage <= 1 || isProcessing}
                  onClick={() => goToPage(currentPage - 1)}
                  className="px-2 py-1 text-gray-300 hover:text-white disabled:opacity-30 hover:bg-gray-800 rounded transition cursor-pointer flex items-center gap-0.5"
                  title="前のページへ"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">前へ</span>
                </button>
                <div className="px-2 py-1 text-xs font-mono font-bold text-rose-300 flex items-center gap-1 border-x border-[#30363d]">
                  <span>P.{currentPage}</span>
                  <span className="text-gray-500">/</span>
                  <span className="text-gray-400">{totalPages}</span>
                </div>
                <button
                  type="button"
                  disabled={currentPage >= totalPages || isProcessing}
                  onClick={() => goToPage(currentPage + 1)}
                  className="px-2 py-1 text-gray-300 hover:text-white disabled:opacity-30 hover:bg-gray-800 rounded transition cursor-pointer flex items-center gap-0.5"
                  title="次のページへ"
                >
                  <span className="hidden sm:inline">次へ</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Jump to page dropdown if > 2 pages */}
              {totalPages > 2 && (
                <select
                  value={currentPage}
                  onChange={(e) => goToPage(Number(e.target.value))}
                  disabled={isProcessing}
                  className="bg-[#0d1117] border border-[#30363d] rounded text-gray-300 text-xs px-2 py-1 outline-none cursor-pointer"
                >
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <option key={p} value={p}>
                      P.{p} に移動
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* View Mode & Zoom deck (Critical for "表示範囲外で見えない" fix) */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Fit Mode Toggle */}
              <div className="flex items-center bg-[#0d1117] border border-[#30363d] rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode("fit");
                    setZoom(1);
                  }}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition cursor-pointer flex items-center gap-1 ${
                    viewMode === "fit"
                      ? "bg-sky-600 text-white shadow"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                  title="画面内にページ全体を収めて全体を見渡します（見切れ防止）"
                >
                  <Minimize2 className="w-3 h-3" />
                  <span>全体表示</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode("width");
                    setZoom(1);
                  }}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition cursor-pointer flex items-center gap-1 ${
                    viewMode === "width"
                      ? "bg-sky-600 text-white shadow"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                  title="幅いっぱいに拡大して細かな図表を切り抜きます（縦スクロール可）"
                >
                  <Maximize2 className="w-3 h-3" />
                  <span>幅に合わせる</span>
                </button>
              </div>

              {/* Scale Resolution selector */}
              <div className="flex items-center gap-1 text-[11px] text-gray-400">
                <span className="hidden sm:inline">解像度:</span>
                {[
                  { label: "1.5x", scale: 1.5 },
                  { label: "2.0x (高精細)", scale: 2.0 },
                  { label: "2.5x (最高)", scale: 2.5 }
                ].map((opt) => (
                  <button
                    key={opt.scale}
                    type="button"
                    disabled={isProcessing}
                    onClick={() => {
                      setPdfScale(opt.scale);
                      renderPdfPage(pdfDoc, currentPage, opt.scale);
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] border transition cursor-pointer ${
                      pdfScale === opt.scale
                        ? "bg-rose-600/30 text-rose-300 border-rose-500/50 font-bold"
                        : "bg-[#0d1117] text-gray-400 border-[#30363d] hover:text-white"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Change PDF / Open other file */}
              <button
                type="button"
                onClick={() => {
                  setPdfDoc(null);
                  setPdfFileName("");
                  setImageSrc(null);
                }}
                className="px-2 py-1 text-gray-400 hover:text-rose-300 hover:bg-gray-800 rounded transition cursor-pointer text-[11px] flex items-center gap-1"
                title="他のPDFまたは画像を開く"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>別のファイル</span>
              </button>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col md:flex-row gap-4 bg-[#0d1117]/40 min-h-[360px]">
          {/* Left / Center: Image / PDF Canvas Workspace */}
          {/* IMPORTANT: Removed my-auto so content cleanly aligns to top (justify-start) to eliminate negative scroll cutoffs! */}
          <div className="flex-1 flex flex-col items-center justify-start bg-[#090d13] border border-[#30363d] rounded-xl p-3 relative overflow-y-auto max-h-[72vh] min-h-[360px]">
            {isProcessing && (
              <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 select-none">
                <RefreshCw className="w-8 h-8 animate-spin text-rose-400" />
                <span className="text-sm font-semibold text-gray-200">
                  {processingStatus || "PDFページを高精細レンダリング中..."}
                </span>
                <span className="text-xs text-gray-400">（元PDFは編集されず安全に保持されます）</span>
              </div>
            )}

            {imageSrc ? (
              <div className="flex flex-col items-center w-full py-1">
                {/* Viewport Notice Badge for Users */}
                {pdfDoc && (
                  <div className="w-full max-w-lg mb-2 flex items-center justify-between px-2 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1 text-rose-300">
                      <Eye className="w-3.5 h-3.5" />
                      <span>{viewMode === "fit" ? "📄 ページ全体表示中（見切れなし）" : "📄 幅合わせ拡大中（スクロール可）"}</span>
                    </span>
                    <span className="font-mono">P.{currentPage} / {totalPages}</span>
                  </div>
                )}

                {/* PDF Page Canvas with White Paper styling */}
                <div
                  ref={containerRef}
                  onPointerDown={handleContainerPointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className="relative inline-block select-none cursor-crosshair overflow-hidden rounded-lg shadow-2xl touch-none bg-white border border-gray-400"
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: "center top",
                    transition: dragMode ? "none" : "transform 0.15s ease-out",
                    touchAction: "none"
                  }}
                >
                  <img
                    ref={imageRef}
                    src={imageSrc}
                    alt="Crop preview"
                    draggable={false}
                    className="block bg-white select-none"
                    style={{
                      maxHeight: viewMode === "fit" ? (pdfDoc ? "56vh" : "54vh") : undefined,
                      maxWidth: "100%",
                      display: "block",
                      backgroundColor: "#ffffff",
                      objectFit: "contain"
                    }}
                  />

                  {/* Interactive Crop Box Overlay with full Finger Drag Support */}
                  <div
                    className="absolute border-2 border-sky-400 cursor-move pointer-events-auto touch-none select-none active:border-sky-300"
                    style={{
                      left: `${cropBox.x * 100}%`,
                      top: `${cropBox.y * 100}%`,
                      width: `${cropBox.width * 100}%`,
                      height: `${cropBox.height * 100}%`,
                      boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55), 0 0 12px rgba(56, 189, 248, 0.6)",
                      touchAction: "none"
                    }}
                    onPointerDown={(e) => handlePointerDown(e, "move")}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    {/* Grid Lines (Rule of Thirds) */}
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40">
                      <div className="border-r border-b border-sky-300" />
                      <div className="border-r border-b border-sky-300" />
                      <div className="border-b border-sky-300" />
                      <div className="border-r border-b border-sky-300" />
                      <div className="border-r border-b border-sky-300" />
                      <div className="border-b border-sky-300" />
                      <div className="border-r border-sky-300" />
                      <div className="border-r border-sky-300" />
                      <div />
                    </div>

                    {/* Center Helper Badge (Touch drag indicator) */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                      <div className="px-2 py-0.5 bg-black/75 backdrop-blur-sm rounded-full text-white/95 text-[10px] font-medium flex items-center gap-1 shadow border border-sky-400/40">
                        <Move className="w-3 h-3 text-sky-400" />
                        <span>指でドラッグして移動</span>
                      </div>
                    </div>

                    {/* 4 Corner Resizing Handles */}
                    <div
                      className="absolute -top-4 -left-4 w-10 h-10 flex items-center justify-center cursor-nwse-resize touch-none z-30"
                      style={{ touchAction: "none" }}
                      onPointerDown={(e) => handlePointerDown(e, "nw")}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                    >
                      <div className="w-4 h-4 bg-sky-400 border-2 border-white rounded-full shadow-lg" />
                    </div>
                    <div
                      className="absolute -top-4 -right-4 w-10 h-10 flex items-center justify-center cursor-nesw-resize touch-none z-30"
                      style={{ touchAction: "none" }}
                      onPointerDown={(e) => handlePointerDown(e, "ne")}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                    >
                      <div className="w-4 h-4 bg-sky-400 border-2 border-white rounded-full shadow-lg" />
                    </div>
                    <div
                      className="absolute -bottom-4 -left-4 w-10 h-10 flex items-center justify-center cursor-nesw-resize touch-none z-30"
                      style={{ touchAction: "none" }}
                      onPointerDown={(e) => handlePointerDown(e, "sw")}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                    >
                      <div className="w-4 h-4 bg-sky-400 border-2 border-white rounded-full shadow-lg" />
                    </div>
                    <div
                      className="absolute -bottom-4 -right-4 w-10 h-10 flex items-center justify-center cursor-nwse-resize touch-none z-30"
                      style={{ touchAction: "none" }}
                      onPointerDown={(e) => handlePointerDown(e, "se")}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                    >
                      <div className="w-4 h-4 bg-sky-400 border-2 border-white rounded-full shadow-lg" />
                    </div>
                  </div>
                </div>

                {/* Finger Operation Control Deck: Live Size, Quick Align, and 4-way Nudge */}
                <div className="mt-3 flex flex-col gap-2 w-full max-w-lg bg-[#161b22] border border-[#30363d] p-2.5 rounded-xl text-xs text-gray-300 shrink-0">
                  {/* Top row: Status & Live pixel readout */}
                  <div className="flex items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-300">
                      <Move className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span>枠を指でドラッグ、またはタップで移動</span>
                    </div>
                    {imageMeta && (
                      <div className="text-[11px] font-mono text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-500/30 font-semibold shrink-0">
                        {aspectRatio === "1:1" ? "1:1 正方形" : aspectRatio} : {liveCropW} × {liveCropH} px
                      </div>
                    )}
                  </div>

                  {/* Bottom row: Preset Align buttons and Fine Nudge Arrows */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-[#30363d]/60">
                    {/* Align presets */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-400 mr-0.5">位置:</span>
                      <button
                        type="button"
                        onClick={() => alignCrop("top")}
                        className="px-2 py-1 bg-[#0d1117] hover:bg-gray-800 text-gray-300 hover:text-white rounded border border-[#30363d] text-[11px] font-medium transition cursor-pointer"
                        title="上部に配置"
                      >
                        上
                      </button>
                      <button
                        type="button"
                        onClick={() => alignCrop("center")}
                        className="px-2 py-1 bg-[#0d1117] hover:bg-gray-800 text-gray-300 hover:text-white rounded border border-[#30363d] text-[11px] font-medium transition cursor-pointer"
                        title="中央に配置"
                      >
                        中央
                      </button>
                      <button
                        type="button"
                        onClick={() => alignCrop("bottom")}
                        className="px-2 py-1 bg-[#0d1117] hover:bg-gray-800 text-gray-300 hover:text-white rounded border border-[#30363d] text-[11px] font-medium transition cursor-pointer"
                        title="下部に配置"
                      >
                        下
                      </button>
                      <button
                        type="button"
                        onClick={() => alignCrop("left")}
                        className="px-2 py-1 bg-[#0d1117] hover:bg-gray-800 text-gray-300 hover:text-white rounded border border-[#30363d] text-[11px] font-medium transition cursor-pointer"
                        title="左端に配置"
                      >
                        左
                      </button>
                      <button
                        type="button"
                        onClick={() => alignCrop("right")}
                        className="px-2 py-1 bg-[#0d1117] hover:bg-gray-800 text-gray-300 hover:text-white rounded border border-[#30363d] text-[11px] font-medium transition cursor-pointer"
                        title="右端に配置"
                      >
                        右
                      </button>
                    </div>

                    {/* 4-way Nudge Arrows */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-400 mr-0.5">微調整:</span>
                      <button
                        type="button"
                        onClick={() => nudgeCrop(0, -0.04)}
                        className="p-1.5 bg-[#0d1117] hover:bg-gray-800 active:bg-sky-500/20 text-gray-300 hover:text-white rounded border border-[#30363d] transition cursor-pointer"
                        title="上へ移動"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => nudgeCrop(0, 0.04)}
                        className="p-1.5 bg-[#0d1117] hover:bg-gray-800 active:bg-sky-500/20 text-gray-300 hover:text-white rounded border border-[#30363d] transition cursor-pointer"
                        title="下へ移動"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => nudgeCrop(-0.04, 0)}
                        className="p-1.5 bg-[#0d1117] hover:bg-gray-800 active:bg-sky-500/20 text-gray-300 hover:text-white rounded border border-[#30363d] transition cursor-pointer"
                        title="左へ移動"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => nudgeCrop(0.04, 0)}
                        className="p-1.5 bg-[#0d1117] hover:bg-gray-800 active:bg-sky-500/20 text-gray-300 hover:text-white rounded border border-[#30363d] transition cursor-pointer"
                        title="右へ移動"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Empty State & PDF / Link Selection Workspace */
              <div className="w-full h-full min-h-[300px] flex flex-col items-center justify-start p-3 sm:p-4 text-center my-auto overflow-y-auto">
                {pdfError && (
                  <div className="mb-4 p-3.5 bg-red-950/70 border border-red-500/50 rounded-xl text-red-200 text-xs w-full max-w-xl text-left shadow-lg">
                    <p className="font-bold mb-1 flex items-center gap-1.5 text-red-300">
                      <span>⚠️ リンク先からの読み込みについて</span>
                    </p>
                    <p className="leading-relaxed">{pdfError}</p>
                    <p className="mt-2 text-[11px] text-gray-300 bg-black/40 p-2 rounded">
                      💡 <strong>解決策:</strong> 下の「検出されたPDFリンク」または「ローカルPDFを選択」から開くと、直ちに高画質で表示・切り抜きできます。
                    </p>
                  </div>
                )}

                {/* PROMINENT SECTION: Detected PDF links from Web page or Note */}
                {(detectedPdfLinks.length > 0 || inlineNoteLinks.length > 0) && (
                  <div className="w-full max-w-xl mb-4 bg-gradient-to-br from-blue-950/50 via-[#161b22] to-[#0d1117] border border-blue-500/40 rounded-2xl p-4 text-left shadow-xl">
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-blue-500/20">
                      <div className="flex items-center gap-2 text-blue-300 font-bold text-xs">
                        <Sparkles className="w-4 h-4 text-blue-400" />
                        <span>🔗 リンク先のPDFを選択して開く（推奨）:</span>
                      </div>
                      <span className="text-[10px] text-gray-400">クリックして即時閲覧</span>
                    </div>

                    <div className="flex flex-col gap-2">
                      {/* Detected from HTML page scrape */}
                      {detectedPdfLinks.map((item, idx) => (
                        <button
                          key={`detected-${idx}`}
                          type="button"
                          disabled={isProcessing}
                          onClick={() => loadPdfFromUrl(item.url)}
                          className="w-full text-left p-2.5 bg-[#0d1117] hover:bg-blue-900/30 border border-blue-500/30 hover:border-blue-400 rounded-xl transition flex items-center justify-between gap-3 group cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileText className="w-4 h-4 text-rose-400 shrink-0" />
                            <div className="min-w-0">
                              <span className="text-xs font-semibold text-white group-hover:text-blue-300 block truncate">
                                {item.title || "PDFドキュメント"}
                              </span>
                              <span className="text-[10px] text-gray-400 font-mono block truncate">
                                {item.url}
                              </span>
                            </div>
                          </div>
                          <span className="px-2.5 py-1 bg-blue-600 group-hover:bg-blue-500 text-white rounded text-[11px] font-bold shrink-0 transition shadow">
                            開く 📄
                          </span>
                        </button>
                      ))}

                      {/* Detected from Note content & sourceUrl */}
                      {inlineNoteLinks.map((item, idx) => (
                        <button
                          key={`inline-${idx}`}
                          type="button"
                          disabled={isProcessing}
                          onClick={() => loadPdfFromUrl(item.url)}
                          className="w-full text-left p-2.5 bg-[#0d1117] hover:bg-gray-800 border border-[#30363d] hover:border-sky-500/50 rounded-xl transition flex items-center justify-between gap-3 group cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Globe className="w-4 h-4 text-sky-400 shrink-0" />
                            <div className="min-w-0">
                              <span className="text-xs font-semibold text-gray-200 group-hover:text-white block truncate">
                                {item.title}
                              </span>
                              <span className="text-[10px] text-gray-400 font-mono block truncate">
                                {item.url}
                              </span>
                            </div>
                          </div>
                          <span className="px-2.5 py-1 bg-[#1f242c] group-hover:bg-sky-600 text-gray-300 group-hover:text-white rounded text-[11px] font-medium shrink-0 transition">
                            読み込む
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Local File Drop / Select Area */}
                <div className="w-full max-w-xl border-2 border-dashed border-[#30363d] hover:border-rose-500/80 rounded-2xl p-6 bg-[#0d1117]/70 flex flex-col items-center transition group shadow-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center shadow border border-rose-500/20">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center shadow border border-sky-500/20">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  </div>

                  <h4 className="text-sm font-bold text-white mb-1.5">
                    元記事のPDF または 画像ファイルを開く
                  </h4>
                  <p className="text-xs text-gray-400 max-w-sm mb-4 leading-relaxed">
                    PDFの図表・グラフや、PNG/JPEG画像を読み込み、必要な部分を四角い枠で切り抜いてノートに挿入できます。
                  </p>

                  <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full justify-center">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full sm:w-auto px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                    >
                      <FolderOpen className="w-4 h-4" />
                      <span>PDF または 画像ファイルを選択</span>
                    </button>
                  </div>

                  <p className="text-[10px] text-emerald-400/90 mt-3.5 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                    <span>元のPDFファイルは一切編集・変更されません（完全安全・読み取り専用）</span>
                  </p>
                </div>

                {/* Manual URL Input */}
                <div className="mt-3 w-full max-w-xl">
                  {!isUrlInputOpen ? (
                    <button
                      type="button"
                      onClick={() => setIsUrlInputOpen(true)}
                      className="text-xs text-gray-400 hover:text-sky-300 underline cursor-pointer"
                    >
                      🔗 任意のWeb上のPDF / Google DriveのURLから開く
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 bg-[#161b22] border border-[#30363d] p-1.5 rounded-xl">
                      <input
                        type="url"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://example.com/paper.pdf または Google Driveリンク"
                        className="flex-1 px-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-xs text-white outline-none focus:border-sky-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => loadPdfFromUrl(urlInput)}
                        disabled={!urlInput.trim() || isProcessing}
                        className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                      >
                        開く
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsUrlInputOpen(false)}
                        className="p-1 text-gray-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Right Toolbar / Parameter Deck */}
          <div className="w-full md:w-80 flex flex-col gap-3.5 text-gray-300 shrink-0">
            {/* Aspect Ratio Selector */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-3">
              <label className="text-xs font-bold text-gray-200 mb-2 flex items-center justify-between">
                <span>縦横比 (アスペクト比)</span>
                <span className="text-[10px] text-gray-400 font-normal">
                  {aspectRatio === "1:1" ? "1:1 正方形 (厳格)" : aspectRatio}
                </span>
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "free", label: "自由比率" },
                  { id: "1:1", label: "1:1 正方形" },
                  { id: "4:3", label: "4:3 標準" },
                  { id: "16:9", label: "16:9 横長" },
                  { id: "3:2", label: "3:2 写真" }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSetAspectRatio(item.id as AspectRatio)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium transition cursor-pointer border ${
                      aspectRatio === item.id
                        ? "bg-sky-600 text-white border-sky-400 shadow"
                        : "bg-[#0d1117] text-gray-400 border-[#30363d] hover:text-white hover:bg-gray-800"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Display Size in Note Selector (ユーザー要望: もう一段階小さく設定 & 極小160px追加) */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-gray-200">
                  記事内での表示幅
                </label>
                <span className="text-[10px] font-mono text-sky-400 font-bold bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-500/20">
                  {imageSize}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1 mb-2">
                {[
                  { label: "極小", val: "160px" },
                  { label: "小", val: "260px" },
                  { label: "中", val: "460px" },
                  { label: "大", val: "720px" },
                  { label: "最大", val: "100%" }
                ].map((s) => (
                  <button
                    key={s.val}
                    type="button"
                    onClick={() => setImageSize(s.val)}
                    className={`py-1.5 text-center rounded-lg text-[11px] font-medium transition cursor-pointer border ${
                      imageSize === s.val
                        ? "bg-sky-600 text-white border-sky-400 shadow"
                        : "bg-[#0d1117] text-gray-400 border-[#30363d] hover:text-white hover:bg-gray-800"
                    }`}
                    title={s.val}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-400 shrink-0">自由指定:</span>
                <input
                  type="text"
                  value={imageSize}
                  onChange={(e) => setImageSize(e.target.value)}
                  placeholder="例: 200px, 320px, 80%"
                  className="w-full px-2 py-1 bg-[#0d1117] border border-[#30363d] rounded text-xs text-white outline-none focus:border-sky-500 font-mono"
                />
              </div>
            </div>

            {/* Insertion Position */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-3">
              <label className="text-xs font-bold text-gray-200 mb-2 block">
                ノートへの挿入位置
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "cursor", label: "カーソル位置" },
                  { id: "top", label: "ノート先頭" },
                  { id: "bottom", label: "ノート末尾" }
                ].map((pos) => (
                  <button
                    key={pos.id}
                    type="button"
                    onClick={() => setInsertPosition(pos.id as any)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium transition cursor-pointer border ${
                      insertPosition === pos.id
                        ? "bg-sky-600 text-white border-sky-400 shadow"
                        : "bg-[#0d1117] text-gray-400 border-[#30363d] hover:text-white hover:bg-gray-800"
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Caption / Comment Input */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-3">
              <label className="text-xs font-bold text-gray-200 mb-1.5 flex items-center justify-between">
                <span>図表キャプション（任意）</span>
                <span className="text-[10px] text-gray-400 font-normal">空欄で非表示</span>
              </label>
              <input
                type="text"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder="例: 図1 実験結果の比較グラフ"
                className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-xs text-white placeholder-gray-500 outline-none focus:border-sky-500"
              />
              <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
                ※音声読み上げ時は画像・キャプションを完全にスキップして文章のみを読み上げます。
              </p>
            </div>

            {/* Quick Action Buttons for Changing Image / Reset */}
            {imageSrc && !pdfDoc && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 py-2 px-3 bg-[#161b22] hover:bg-gray-800 border border-[#30363d] rounded-xl text-xs text-gray-300 hover:text-white transition cursor-pointer flex items-center justify-center gap-1.5 shadow"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>別の画像を開く</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer Bar */}
        <div className="px-4 sm:px-5 py-3 border-t border-[#30363d] bg-[#0d1117]/90 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {imageSrc ? (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Check className="w-4 h-4" />
                <span>切り抜き枠をドラッグして位置を決定してください</span>
              </span>
            ) : (
              <span>PDFまたは画像を選択して切り抜きを開始してください</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="button"
              disabled={!imageSrc || isProcessing}
              onClick={handleExecuteCrop}
              className={`px-5 py-2 text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-md cursor-pointer ${
                !imageSrc || isProcessing
                  ? "bg-rose-900/40 text-gray-500 cursor-not-allowed border border-rose-800/30"
                  : "bg-rose-600 hover:bg-rose-500 text-white"
              }`}
            >
              <Check className="w-4 h-4" />
              <span>{isProcessing ? "処理中..." : "✂️ 切り抜いてノートに貼り付け"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
