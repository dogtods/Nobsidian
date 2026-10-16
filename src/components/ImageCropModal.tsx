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
  Check,
  RefreshCw,
  Image as ImageIcon,
  Move,
  FileText,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Globe,
  Maximize2,
  FolderOpen,
  Sparkles,
  Minimize2,
  Sliders,
  Settings2,
  AlertCircle
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
  apiPost?: (body: any) => Promise<any>;
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
  noteTitle,
  apiPost
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
  const [showSettings, setShowSettings] = useState<boolean>(false);

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

  // Combined and deduplicated list of all candidate links (web page detected + note body links)
  const allCandidateLinks = useMemo(() => {
    const combined: { title: string; url: string; badge?: string; isDetected?: boolean }[] = [];
    const seen = new Set<string>();

    for (const item of detectedPdfLinks) {
      if (!item.url || seen.has(item.url)) continue;
      seen.add(item.url);
      combined.push({
        title: item.title,
        url: item.url,
        badge: "記事内PDF",
        isDetected: true
      });
    }

    for (const item of inlineNoteLinks) {
      if (!item.url || seen.has(item.url)) continue;
      seen.add(item.url);
      combined.push({
        title: item.title,
        url: item.url,
        badge: "リンク"
      });
    }

    return combined;
  }, [detectedPdfLinks, inlineNoteLinks]);

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
    setProcessingStatus(`P.${pageNum} レンダリング中...`);
    setPdfError(null);
    try {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas context could not be created");

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport }).promise;

      const pageDataUrl = canvas.toDataURL("image/png");
      setImageSrc(pageDataUrl);
      setZoom(1);
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
    setProcessingStatus(`PDF「${file.name}」読込中...`);
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
      setPdfError(`PDF読み込み失敗: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  }, [pdfScale, renderPdfPage]);

  // Load PDF or Image from Data URL (e.g. from Google Apps Script fetchDriveFile or Base64)
  const loadPdfFromDataUrl = useCallback(async (dataUrl: string, fileName = "document.pdf") => {
    setIsProcessing(true);
    setProcessingStatus(`「${fileName}」を展開中...`);
    setPdfError(null);
    try {
      if (dataUrl.startsWith("data:image/")) {
        setImageSrc(dataUrl);
        setZoom(1);
        setAltText(fileName.replace(/\.[^.]+$/, ""));
        return;
      }
      const base64Data = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const loadingTask = pdfjsLib.getDocument({
        data: bytes,
        cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/cmaps/",
        cMapPacked: true,
      });
      const doc = await loadingTask.promise;
      setPdfDoc(doc);
      setPdfFileName(fileName);
      setTotalPages(doc.numPages);
      setCurrentPage(1);
      await renderPdfPage(doc, 1, pdfScale);
      setIsUrlInputOpen(false);
    } catch (err: any) {
      console.error("DataURL load error:", err);
      setPdfError(`ファイル展開失敗: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  }, [pdfScale, renderPdfPage]);

  // Load PDF from URL
  const loadPdfFromUrl = useCallback(async (urlToLoad: string) => {
    if (!urlToLoad) return;
    setIsProcessing(true);
    setProcessingStatus("PDF取得中...");
    setPdfError(null);
    try {
      let target = urlToLoad.trim();

      // If it's already a Data URL
      if (target.startsWith("data:")) {
        return await loadPdfFromDataUrl(target);
      }

      // Check if it's Google Drive
      const isDrive = target.includes("drive.google.com") || target.includes("docs.google.com");
      if (isDrive) {
        const driveMatch = target.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || target.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (driveMatch) {
          const fileId = driveMatch[1];
          target = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0`;
        }
      }

      if (target.includes("arxiv.org/abs/") || target.includes("arxiv.org/html/")) {
        target = target.replace(/arxiv\.org\/(?:abs|html)\//, "arxiv.org/pdf/") + ".pdf";
      }

      const proxyUrl = `/api/proxy-pdf?url=${encodeURIComponent(target)}`;
      const res = await fetch(proxyUrl);

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await res.json().catch(() => ({}));
        if (json.detectedPdfLinks && json.detectedPdfLinks.length > 0) {
          setDetectedPdfLinks(json.detectedPdfLinks);
          // If only 1 candidate and it's different from current target, try loading it
          if (json.detectedPdfLinks.length === 1 && json.detectedPdfLinks[0].url !== target) {
            return await loadPdfFromUrl(json.detectedPdfLinks[0].url);
          }
          // Do not treat HTML page as a fatal error if links were found!
          setPdfError(null);
          return;
        }

        // If it was a Google Drive URL and failed with 404/403, try GAS fetchDriveFile
        if (isDrive && apiPost) {
          setProcessingStatus("Google Drive連携経由で取得中...");
          try {
            const gasRes = await apiPost({ action: "fetchDriveFile", url: urlToLoad });
            if (gasRes && gasRes.success && gasRes.dataUrl) {
              return await loadPdfFromDataUrl(gasRes.dataUrl, gasRes.name || "google_drive.pdf");
            }
          } catch (gasErr) {
            console.warn("GAS fetchDriveFile fallback failed:", gasErr);
          }
        }

        throw new Error(json.error || `HTTP ${res.status}`);
      }

      if (!res.ok) {
        // If it was a Google Drive URL and failed, try GAS fetchDriveFile
        if (isDrive && apiPost) {
          setProcessingStatus("Google Drive連携経由で取得中...");
          try {
            const gasRes = await apiPost({ action: "fetchDriveFile", url: urlToLoad });
            if (gasRes && gasRes.success && gasRes.dataUrl) {
              return await loadPdfFromDataUrl(gasRes.dataUrl, gasRes.name || "google_drive.pdf");
            }
          } catch (gasErr) {
            console.warn("GAS fetchDriveFile fallback failed:", gasErr);
          }
        }
        throw new Error(`PDF取得失敗: HTTP ${res.status}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      const headerBytes = new Uint8Array(arrayBuffer.slice(0, 1024));
      const headerStr = String.fromCharCode(...headerBytes);
      if (!headerStr.includes("%PDF-")) {
        throw new Error("指定先はWebページ（HTML）でした。下のリンク候補またはPDFファイルを選択してください。");
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
  }, [pdfScale, renderPdfPage, loadPdfFromDataUrl, apiPost]);

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

  // Handle local file selection
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
      alert("画像ファイル（PNG, JPEG等）またはPDFファイルを選択してください。");
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
        alert("キャンバスの生成に失敗しました。");
        return;
      }

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
      className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-1 sm:p-2 select-none animate-[fadeIn_0.15s_ease-out]"
      onPaste={handlePaste}
      tabIndex={0}
    >
      {/* Maximized Modal Box: No bulky bars at bottom, maximum viewport for the article! */}
      <div className="bg-[#12161f] border border-[#30363d] rounded-xl w-full max-w-[98vw] h-[97vh] max-h-[97vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* ★ ULTRA-COMPACT SLIM TOP TOOLBAR (Height 42px, NO bottom bar needed!) */}
        <div className="h-11 px-3 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between gap-2 shrink-0 text-xs">
          
          {/* Left: Document info & Pager */}
          <div className="flex items-center gap-2 min-w-0">
            {pdfDoc ? (
              <div className="flex items-center gap-1.5 bg-[#0d1117] px-2 py-1 rounded border border-[#30363d]">
                <FileText className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <button
                  type="button"
                  disabled={currentPage <= 1 || isProcessing}
                  onClick={() => goToPage(currentPage - 1)}
                  className="p-0.5 text-gray-400 hover:text-white disabled:opacity-30 cursor-pointer"
                  title="前ページ"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono font-bold text-rose-300 text-[11px] px-1">
                  P.{currentPage}/{totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages || isProcessing}
                  onClick={() => goToPage(currentPage + 1)}
                  className="p-0.5 text-gray-400 hover:text-white disabled:opacity-30 cursor-pointer"
                  title="次ページ"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-gray-300 font-bold text-xs truncate">
                <Crop className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="truncate">切り抜き</span>
              </div>
            )}

            {/* View Mode Switcher */}
            {imageSrc && (
              <div className="flex items-center bg-[#0d1117] rounded border border-[#30363d] p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("fit")}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer flex items-center gap-1 ${
                    viewMode === "fit" ? "bg-sky-600 text-white" : "text-gray-400 hover:text-white"
                  }`}
                  title="画面内に全体を収める"
                >
                  <Minimize2 className="w-3 h-3" />
                  <span>全体</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("width")}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer flex items-center gap-1 ${
                    viewMode === "width" ? "bg-sky-600 text-white" : "text-gray-400 hover:text-white"
                  }`}
                  title="幅いっぱいに拡大"
                >
                  <Maximize2 className="w-3 h-3" />
                  <span>幅</span>
                </button>
              </div>
            )}

            {/* Aspect Ratio Selector (Compact) */}
            {imageSrc && (
              <div className="hidden sm:flex items-center bg-[#0d1117] rounded border border-[#30363d] p-0.5">
                {(["free", "1:1", "4:3", "16:9"] as AspectRatio[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleSetAspectRatio(r)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition cursor-pointer ${
                      aspectRatio === r ? "bg-sky-600 text-white font-bold" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {r === "free" ? "自由" : r}
                  </button>
                ))}
              </div>
            )}

            {/* Resolution Selector (Compact) */}
            {pdfDoc && (
              <div className="hidden md:flex items-center gap-1 text-[10px] text-gray-400">
                {[
                  { label: "1.5x", scale: 1.5 },
                  { label: "2.0x", scale: 2.0 }
                ].map((opt) => (
                  <button
                    key={opt.scale}
                    type="button"
                    disabled={isProcessing}
                    onClick={() => {
                      setPdfScale(opt.scale);
                      renderPdfPage(pdfDoc, currentPage, opt.scale);
                    }}
                    className={`px-1.5 py-0.5 rounded border text-[10px] cursor-pointer ${
                      pdfScale === opt.scale
                        ? "bg-rose-950 text-rose-300 border-rose-500/60 font-bold"
                        : "bg-[#0d1117] text-gray-400 border-[#30363d]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Actions (Paste to Note & Close directly in header!) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Live Size Badge */}
            {imageMeta && (
              <span className="hidden lg:inline text-[10px] font-mono text-sky-400 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-500/30">
                {liveCropW}×{liveCropH}px
              </span>
            )}

            {/* Settings Drawer Toggle (Size & Caption) */}
            {imageSrc && (
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className={`p-1.5 rounded transition cursor-pointer flex items-center gap-1 text-xs border ${
                  showSettings
                    ? "bg-sky-600 text-white border-sky-400"
                    : "bg-[#0d1117] text-gray-300 border-[#30363d] hover:text-white"
                }`}
                title="挿入サイズ・キャプション設定"
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span className="text-[11px] font-mono hidden sm:inline">{imageSize}</span>
              </button>
            )}

            {/* Open other file button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 bg-[#0d1117] hover:bg-gray-800 text-gray-300 hover:text-white border border-[#30363d] rounded transition cursor-pointer text-xs"
              title="別のPDFまたは画像を開く"
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>

            {/* ★ PROMINENT TOP PASTE BUTTON (Zero space taken at bottom!) */}
            <button
              type="button"
              disabled={!imageSrc || isProcessing}
              onClick={handleExecuteCrop}
              className={`px-3.5 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1 shadow cursor-pointer ${
                !imageSrc || isProcessing
                  ? "bg-rose-950/50 text-gray-500 cursor-not-allowed border border-rose-900/30"
                  : "bg-rose-600 hover:bg-rose-500 text-white shadow-md active:scale-95"
              }`}
              title="枠内の図表を切り抜いてノートに貼り付けます"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isProcessing ? "処理中..." : "ノートに貼り付け"}</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition cursor-pointer"
              title="閉じる"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Area: FULL-HEIGHT WORKSPACE FOR THE ARTICLE! */}
        <div className="flex-1 relative flex overflow-hidden bg-[#0a0d13]">
          
          {/* Main Article / PDF Workspace: Maximum Screen Area! */}
          <div className="flex-1 flex flex-col items-center justify-start p-1 sm:p-2 relative overflow-auto h-full">
            {isProcessing && (
              <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 select-none">
                <RefreshCw className="w-8 h-8 animate-spin text-rose-400" />
                <span className="text-xs font-semibold text-gray-200">
                  {processingStatus || "処理中..."}
                </span>
              </div>
            )}

            {imageSrc ? (
              <div className="w-full h-full flex flex-col items-center justify-start">
                {/* PDF Page Canvas with White Paper styling */}
                <div
                  ref={containerRef}
                  onPointerDown={handleContainerPointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className="relative inline-block select-none cursor-crosshair overflow-hidden rounded shadow-2xl touch-none bg-white border border-gray-400"
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
                      maxHeight: viewMode === "fit" ? "calc(94vh - 65px)" : undefined,
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

                    {/* Tiny Center Drag indicator */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                      <div className="px-2 py-0.5 bg-black/75 rounded-full text-white text-[10px] font-medium flex items-center gap-1 shadow border border-sky-400/40">
                        <Move className="w-3 h-3 text-sky-400" />
                        <span>指で移動</span>
                      </div>
                    </div>

                    {/* 4 Corner Resizing Handles */}
                    <div
                      className="absolute -top-3.5 -left-3.5 w-8 h-8 flex items-center justify-center cursor-nwse-resize touch-none z-30"
                      style={{ touchAction: "none" }}
                      onPointerDown={(e) => handlePointerDown(e, "nw")}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                    >
                      <div className="w-3.5 h-3.5 bg-sky-400 border-2 border-white rounded-full shadow" />
                    </div>
                    <div
                      className="absolute -top-3.5 -right-3.5 w-8 h-8 flex items-center justify-center cursor-nesw-resize touch-none z-30"
                      style={{ touchAction: "none" }}
                      onPointerDown={(e) => handlePointerDown(e, "ne")}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                    >
                      <div className="w-3.5 h-3.5 bg-sky-400 border-2 border-white rounded-full shadow" />
                    </div>
                    <div
                      className="absolute -bottom-3.5 -left-3.5 w-8 h-8 flex items-center justify-center cursor-nesw-resize touch-none z-30"
                      style={{ touchAction: "none" }}
                      onPointerDown={(e) => handlePointerDown(e, "sw")}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                    >
                      <div className="w-3.5 h-3.5 bg-sky-400 border-2 border-white rounded-full shadow" />
                    </div>
                    <div
                      className="absolute -bottom-3.5 -right-3.5 w-8 h-8 flex items-center justify-center cursor-nwse-resize touch-none z-30"
                      style={{ touchAction: "none" }}
                      onPointerDown={(e) => handlePointerDown(e, "se")}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                    >
                      <div className="w-3.5 h-3.5 bg-sky-400 border-2 border-white rounded-full shadow" />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Empty State & PDF Selection Area (Clean, minimal text) */
              <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center my-auto overflow-y-auto max-w-xl">
                {pdfError && (
                  <div className="mb-4 p-3.5 bg-red-950/80 border border-red-500/60 rounded-xl text-red-200 text-xs w-full text-left space-y-2 animate-[fadeIn_0.1s_ease-out]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold flex items-center gap-1.5 text-red-300">
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                        <span>リンク先PDFを開けませんでした</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPdfError(null)}
                        className="text-gray-400 hover:text-white text-[11px] px-1.5 py-0.5 rounded border border-gray-600 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    <p className="text-[11px] text-red-300/90 font-mono break-all">{pdfError}</p>
                    <div className="p-2 bg-black/40 rounded border border-red-900/50 text-[11px] text-gray-300 space-y-1">
                      <p className="font-medium text-white">💡 対処のヒント:</p>
                      <ul className="list-disc list-inside space-y-0.5 text-gray-300 text-[10px]">
                        <li>元サイトがログイン制やリンク切れの可能性があります。下の「ファイルを選択」から端末内のPDFを直接開けます。</li>
                        <li>Google Driveの場合は、共有設定が「リンクを知っている全員」になっているかご確認ください。</li>
                        <li>別のPDFリンクをお持ちの場合は、下の「任意のWeb PDF URLから開く」に入力してください。</li>
                      </ul>
                    </div>
                  </div>
                )}

                {/* Candidate PDF links (deduplicated) */}
                {allCandidateLinks.length > 0 && (
                  <div className="w-full mb-3 bg-[#161b22] border border-blue-500/40 rounded-xl p-3 text-left">
                    <div className="flex items-center justify-between text-blue-300 font-bold text-xs mb-2">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                        <span>リンク先PDFを選択して開く:</span>
                      </span>
                      <span className="text-[10px] text-gray-400 font-normal">クリックで直接読込</span>
                    </div>

                    <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                      {allCandidateLinks.map((item, idx) => (
                        <button
                          key={`link-${idx}`}
                          type="button"
                          disabled={isProcessing}
                          onClick={() => loadPdfFromUrl(item.url)}
                          className="w-full text-left p-2.5 bg-[#0d1117] hover:bg-blue-950/40 border border-blue-500/30 hover:border-blue-400 rounded-lg transition flex items-center justify-between gap-2 group cursor-pointer"
                        >
                          <span className="text-xs text-white group-hover:text-blue-200 truncate font-medium flex items-center gap-1.5">
                            <span className="text-blue-400">📄</span>
                            <span className="truncate">{item.title}</span>
                          </span>
                          <span className="px-2.5 py-1 bg-blue-600 group-hover:bg-blue-500 text-white rounded text-[10px] font-bold shrink-0 shadow">
                            {item.badge || "開く"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Local file button */}
                <div className="w-full border-2 border-dashed border-[#30363d] hover:border-rose-500 rounded-xl p-6 bg-[#0d1117]/70 flex flex-col items-center">
                  <div className="flex items-center gap-2 mb-2 text-rose-400">
                    <FileText className="w-6 h-6" />
                    <ImageIcon className="w-6 h-6 text-sky-400" />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1">
                    元記事PDF または 画像を開く
                  </h4>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition shadow cursor-pointer active:scale-95"
                  >
                    ファイルを選択
                  </button>
                </div>

                {/* Optional URL Input */}
                <div className="mt-2.5 w-full">
                  {!isUrlInputOpen ? (
                    <button
                      type="button"
                      onClick={() => setIsUrlInputOpen(true)}
                      className="text-[11px] text-gray-400 hover:text-sky-300 underline cursor-pointer"
                    >
                      🔗 任意のWeb PDF URLから開く
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 bg-[#161b22] border border-[#30363d] p-1.5 rounded-lg">
                      <input
                        type="url"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://.../paper.pdf"
                        className="flex-1 px-2 py-1 bg-[#0d1117] border border-[#30363d] rounded text-xs text-white outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => loadPdfFromUrl(urlInput)}
                        disabled={!urlInput.trim() || isProcessing}
                        className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-bold cursor-pointer"
                      >
                        開く
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

          {/* Floating Settings Side Drawer (Only opens when clicking Settings, leaves 100% space for article by default!) */}
          {showSettings && (
            <div className="absolute right-2 top-2 z-40 w-64 bg-[#161b22]/95 backdrop-blur-md border border-[#30363d] rounded-xl p-3 shadow-2xl flex flex-col gap-2.5 text-xs text-gray-300 animate-[fadeIn_0.1s_ease-out]">
              <div className="flex items-center justify-between pb-1.5 border-b border-[#30363d]">
                <span className="font-bold text-white flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5 text-sky-400" />
                  <span>挿入オプション</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Display Size in Note */}
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">
                  記事内での表示幅: <strong className="text-sky-400 font-mono">{imageSize}</strong>
                </label>
                <div className="grid grid-cols-5 gap-1">
                  {[
                    { label: "極小", val: "160px" },
                    { label: "小", val: "260px" },
                    { label: "中", val: "460px" },
                    { label: "大", val: "720px" },
                    { label: "全幅", val: "100%" }
                  ].map((s) => (
                    <button
                      key={s.val}
                      type="button"
                      onClick={() => setImageSize(s.val)}
                      className={`py-1 text-center rounded text-[10px] font-medium transition cursor-pointer border ${
                        imageSize === s.val
                          ? "bg-sky-600 text-white border-sky-400"
                          : "bg-[#0d1117] text-gray-400 border-[#30363d] hover:text-white"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Insertion Position */}
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">挿入位置:</label>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { id: "cursor", label: "カーソル" },
                    { id: "top", label: "先頭" },
                    { id: "bottom", label: "末尾" }
                  ].map((pos) => (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() => setInsertPosition(pos.id as any)}
                      className={`py-1 text-center rounded text-[10px] font-medium transition cursor-pointer border ${
                        insertPosition === pos.id
                          ? "bg-sky-600 text-white border-sky-400"
                          : "bg-[#0d1117] text-gray-400 border-[#30363d] hover:text-white"
                      }`}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Caption */}
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">キャプション (任意):</label>
                <input
                  type="text"
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  placeholder="例: 図1 比較データ"
                  className="w-full px-2 py-1 bg-[#0d1117] border border-[#30363d] rounded text-xs text-white outline-none"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
