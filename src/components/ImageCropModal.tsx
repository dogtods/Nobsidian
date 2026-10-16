/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
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
  Layers,
  Globe,
  FileSearch
} from "lucide-react";

// Configure PDF.js worker
if (typeof window !== "undefined") {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  } catch (_) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  }
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
  defaultMode?: 'image' | 'pdf';
}

type AspectRatio = "free" | "1:1" | "4:3" | "16:9" | "3:2";

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  onClose,
  onInsertImage,
  initialImageData,
  initialAltText,
  initialSize,
  sourceUrl,
  defaultMode
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(initialImageData || null);
  const [imageMeta, setImageMeta] = useState<{ width: number; height: number } | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("free");
  const [zoom, setZoom] = useState<number>(1);
  const [altText, setAltText] = useState<string>("");
  // デフォルトサイズは前より一段階小さく設定 (460px -> 260px)
  const [imageSize, setImageSize] = useState<string>(initialSize || "260px");
  const [insertPosition, setInsertPosition] = useState<'cursor' | 'top' | 'bottom'>("cursor");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // PDF-specific states (Strict read-only in memory)
  const [pdfDoc, setPdfDoc] = useState<any | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [pdfScale, setPdfScale] = useState<number>(1.75); // 1.75x produces sharp, crisp text and figures
  const [pdfError, setPdfError] = useState<string | null>(null);
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
  const isDraggingRef = useRef<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Exact cropBox calculation according to aspect ratio and image dimensions
  const computeCropBox = useCallback((
    ratio: AspectRatio,
    srcW: number,
    srcH: number,
    prevBox?: { x: number; y: number; width: number; height: number }
  ) => {
    if (ratio === "free") {
      return prevBox || { x: 0.05, y: 0.05, width: 0.9, height: 0.9 };
    }

    const targetRatio = ratio === "1:1" ? 1.0
      : ratio === "4:3" ? 4 / 3
      : ratio === "16:9" ? 16 / 9
      : 3 / 2;

    const imgAspect = (srcW || 1) / (srcH || 1);

    // In percentage coordinates:
    // (boxWidth * srcW) / (boxHeight * srcH) = targetRatio
    // => boxWidth / boxHeight = targetRatio / imgAspect
    let w = 0.85;
    let h = w * (imgAspect / targetRatio);

    if (h > 0.85) {
      h = 0.85;
      w = h * (targetRatio / imgAspect);
    }

    w = Math.min(0.96, Math.max(0.1, w));
    h = Math.min(0.96, Math.max(0.1, h));

    // Preserve existing center if available, otherwise center in image
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

  // Modal open & initial data handling
  useEffect(() => {
    if (initialImageData) {
      setImageSrc(initialImageData);
      setZoom(1);
      setAltText(initialAltText || "");
      setImageSize(initialSize || "260px");
      setPdfDoc(null);
      setPdfFileName("");
    } else {
      setImageSrc(null);
      setAltText("");
      setImageSize(initialSize || "260px");
      setInsertPosition("cursor");
      setPdfDoc(null);
      setPdfFileName("");
      setPdfError(null);
    }
  }, [initialImageData, initialAltText, initialSize, isOpen]);

  // Render a specific page of PDF strictly to an in-memory canvas (Read-Only)
  const renderPdfPage = useCallback(async (doc: any, pageNum: number, scale = pdfScale) => {
    if (!doc) return;
    setIsProcessing(true);
    setPdfError(null);
    try {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas context could not be created");

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
    }
  }, [pdfScale]);

  // Load PDF from File (Strictly Read-Only in memory)
  const loadPdfFromFile = async (file: File) => {
    setIsProcessing(true);
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
    }
  };

  // Load PDF from URL (e.g. sourceUrl or web URL)
  const loadPdfFromUrl = async (urlToLoad: string) => {
    if (!urlToLoad) return;
    setIsProcessing(true);
    setPdfError(null);
    try {
      let target = urlToLoad.trim();
      const driveMatch = target.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (driveMatch) {
        target = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
      }

      // Fetch through backend binary proxy to prevent CORS issues
      const proxyUrl = `/api/proxy-pdf?url=${encodeURIComponent(target)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const arrayBuffer = await res.arrayBuffer();
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
      setPdfError(`URLからのPDF取得に失敗しました: ${err.message || err}。ローカルのPDFファイルを開くか、別のURLをお試しください。`);
    } finally {
      setIsProcessing(false);
    }
  };

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
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("画像ファイル（PNG, JPEG, WebP等）またはPDFファイルを選択してください。");
      return;
    }

    // Standard Image file
    setPdfDoc(null);
    setPdfFileName("");
    setPdfError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setImageSrc(result);
      setZoom(1);
    };
    reader.readAsDataURL(file);
  };

  // Handle clipboard paste inside modal & window level
  const processImageBlob = useCallback((blob: Blob) => {
    setPdfDoc(null);
    setPdfFileName("");
    const reader = new FileReader();
    reader.onload = (event) => {
      setImageSrc(event.target?.result as string);
      setZoom(1);
    };
    reader.readAsDataURL(blob);
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          e.preventDefault();
          processImageBlob(blob);
          break;
        }
      }
    }
  }, [processImageBlob]);

  // Window-level paste listener when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const handleWindowPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            e.preventDefault();
            processImageBlob(blob);
            break;
          }
        }
      }
    };
    window.addEventListener("paste", handleWindowPaste);
    return () => window.removeEventListener("paste", handleWindowPaste);
  }, [isOpen, processImageBlob]);

  // Clean 90-degree clockwise rotation directly on image canvas
  const handleRotateClockwise = () => {
    if (!imageSrc) return;
    setIsProcessing(true);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setIsProcessing(false);
        return;
      }
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      let rotatedData = canvas.toDataURL("image/webp", 0.95);
      if (!rotatedData.startsWith("data:image/webp")) {
        rotatedData = canvas.toDataURL("image/png");
      }
      setImageSrc(rotatedData);
      setIsProcessing(false);
    };
    img.src = imageSrc;
  };

  // Switch aspect ratio with strict mathematical guarantee
  const applyAspectRatio = (ratio: AspectRatio) => {
    setAspectRatio(ratio);
    if (!imageMeta) return;
    setCropBox(prev => computeCropBox(ratio, imageMeta.width, imageMeta.height, prev));
  };

  // Direct Position Presets (Top, Center, Bottom, Left, Right, Maximize)
  const alignCrop = (direction: 'top' | 'center' | 'bottom' | 'left' | 'right' | 'full') => {
    setCropBox(prev => {
      if (direction === 'full') {
        if (aspectRatio === "free") {
          return { x: 0.02, y: 0.02, width: 0.96, height: 0.96 };
        }
        if (imageMeta) {
          return computeCropBox(aspectRatio, imageMeta.width, imageMeta.height);
        }
        return prev;
      }
      let x = prev.x;
      let y = prev.y;
      if (direction === 'top') y = 0;
      if (direction === 'bottom') y = Math.max(0, 1 - prev.height);
      if (direction === 'left') x = 0;
      if (direction === 'right') x = Math.max(0, 1 - prev.width);
      if (direction === 'center') {
        x = Math.max(0, (1 - prev.width) / 2);
        y = Math.max(0, (1 - prev.height) / 2);
      }
      return { ...prev, x, y };
    });
  };

  // Fine Nudge for finger adjustment
  const nudgeCrop = (dx: number, dy: number) => {
    setCropBox(prev => ({
      ...prev,
      x: Math.max(0, Math.min(1 - prev.width, prev.x + dx)),
      y: Math.max(0, Math.min(1 - prev.height, prev.y + dy))
    }));
  };

  // Unified Pointer Down for smooth finger drag on touchscreen, tablet, and mouse
  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    mode: DragMode
  ) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    isDraggingRef.current = false;
    setDragMode(mode);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      box: { ...cropBox }
    });
  };

  // Container Pointer Down: Move box directly to where finger touches on image
  const handleContainerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const touchX = (e.clientX - rect.left) / rect.width;
    const touchY = (e.clientY - rect.top) / rect.height;

    // Check if touch is inside existing crop box
    const inBox = touchX >= cropBox.x && touchX <= cropBox.x + cropBox.width &&
                  touchY >= cropBox.y && touchY <= cropBox.y + cropBox.height;

    if (!inBox) {
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (_) {}

      // Immediately center the crop box on user's finger touch position
      const newX = Math.max(0, Math.min(1 - cropBox.width, touchX - cropBox.width / 2));
      const newY = Math.max(0, Math.min(1 - cropBox.height, touchY - cropBox.height / 2));
      const newBox = { ...cropBox, x: newX, y: newY };
      setCropBox(newBox);

      // Begin dragging immediately so moving finger slides the box
      setDragMode("move");
      setDragStart({
        x: e.clientX,
        y: e.clientY,
        box: newBox
      });
      isDraggingRef.current = true;
    }
  };

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragMode || !dragStart || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    isDraggingRef.current = true;
    const deltaX = (e.clientX - dragStart.x) / rect.width;
    const deltaY = (e.clientY - dragStart.y) / rect.height;

    const b = dragStart.box;
    let next = { ...b };

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

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setIsProcessing(false);
        return;
      }

      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;

      let cropX = Math.round(cropBox.x * srcW);
      let cropY = Math.round(cropBox.y * srcH);
      let cropW = Math.round(cropBox.width * srcW);
      let cropH = Math.round(cropBox.height * srcH);

      // Bounds safety
      cropX = Math.max(0, Math.min(srcW - 10, cropX));
      cropY = Math.max(0, Math.min(srcH - 10, cropY));
      cropW = Math.max(10, Math.min(srcW - cropX, cropW));
      cropH = Math.max(10, Math.min(srcH - cropY, cropH));

      // CRITICAL FIX: Absolute guarantee for 1:1 and target aspect ratios!
      if (aspectRatio === "1:1") {
        const squareSide = Math.min(cropW, cropH);
        cropW = squareSide;
        cropH = squareSide;
        if (cropX + squareSide > srcW) cropX = Math.max(0, srcW - squareSide);
        if (cropY + squareSide > srcH) cropY = Math.max(0, srcH - squareSide);
      } else if (aspectRatio !== "free") {
        const targetRatio = aspectRatio === "4:3" ? 4 / 3
          : aspectRatio === "16:9" ? 16 / 9
          : 3 / 2;
        let w = cropW;
        let h = Math.round(w / targetRatio);
        if (h > cropH || cropY + h > srcH) {
          h = cropH;
          w = Math.round(h * targetRatio);
        }
        if (cropX + w > srcW) {
          w = srcW - cropX;
          h = Math.round(w / targetRatio);
        }
        cropW = Math.max(10, w);
        cropH = Math.max(10, h);
      }

      // Max export dimension (1200px)
      const maxDim = 1200;
      let finalW = cropW;
      let finalH = cropH;

      if (aspectRatio === "1:1") {
        finalW = Math.min(maxDim, cropW);
        finalH = finalW; // Absolutely identical!
      } else if (finalW > maxDim || finalH > maxDim) {
        if (finalW > finalH) {
          finalH = Math.round((finalH * maxDim) / finalW);
          finalW = maxDim;
        } else {
          finalW = Math.round((finalW * maxDim) / finalH);
          finalH = maxDim;
        }
      }

      canvas.width = finalW;
      canvas.height = finalH;

      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, finalW, finalH);

      // Export as WebP / JPEG (quality 0.90)
      let outputData = canvas.toDataURL("image/webp", 0.90);
      if (!outputData.startsWith("data:image/webp")) {
        outputData = canvas.toDataURL("image/jpeg", 0.90);
      }

      setIsProcessing(false);
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
      className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 select-none animate-[fadeIn_0.15s_ease-out]"
      onPaste={handlePaste}
      tabIndex={0}
    >
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-5xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-[#30363d] bg-[#0d1117]/85">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
              {pdfDoc ? <FileText className="w-4 h-4 text-rose-400" /> : <Crop className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                <span>{pdfDoc ? "元記事PDF 閲覧 & 切り抜き挿入" : "画像 & PDF 切り抜き (トリミング) 挿入"}</span>
                <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>元PDFは編集されません（完全読み取り専用）</span>
                </span>
              </h3>
              <p className="text-[11px] text-gray-400">
                {pdfDoc
                  ? "元PDFのページを開いて図表やグラフを指で切り抜き、ノートに画像として貼り付けます"
                  : "画像または元記事PDFを開き、必要な部分だけを切り抜いてノートに挿入します"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PDF Navigation Bar (Shows when a PDF is open) */}
        {pdfDoc && (
          <div className="px-4 py-2 bg-gradient-to-r from-rose-950/40 via-[#1c2128] to-[#0d1117] border-b border-[#30363d] flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/20 text-rose-300 rounded-lg border border-rose-500/30 font-semibold text-[11px]">
                <FileText className="w-3.5 h-3.5 text-rose-400" />
                <span className="max-w-[180px] sm:max-w-[260px] truncate" title={pdfFileName}>
                  {pdfFileName || "PDFドキュメント"}
                </span>
                <span className="opacity-80">({totalPages} ページ)</span>
              </span>

              {/* Page Switcher */}
              <div className="flex items-center gap-1 bg-[#0d1117] border border-[#30363d] rounded-lg p-0.5">
                <button
                  type="button"
                  disabled={currentPage <= 1 || isProcessing}
                  onClick={() => goToPage(currentPage - 1)}
                  className="px-2 py-1 text-gray-300 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent rounded flex items-center gap-0.5 cursor-pointer text-xs"
                  title="前のページへ"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">前へ</span>
                </button>

                <div className="flex items-center gap-1 px-1.5 font-mono text-xs">
                  <span className="text-sky-400 font-bold">{currentPage}</span>
                  <span className="text-gray-500">/</span>
                  <span className="text-gray-400">{totalPages}</span>
                </div>

                <button
                  type="button"
                  disabled={currentPage >= totalPages || isProcessing}
                  onClick={() => goToPage(currentPage + 1)}
                  className="px-2 py-1 text-gray-300 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent rounded flex items-center gap-0.5 cursor-pointer text-xs"
                  title="次のページへ"
                >
                  <span className="hidden sm:inline">次へ</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Page quick slider/jump */}
              {totalPages > 3 && (
                <div className="hidden md:flex items-center gap-1.5 text-[11px] text-gray-400 pl-1">
                  <span>移動:</span>
                  <input
                    type="range"
                    min={1}
                    max={totalPages}
                    value={currentPage}
                    onChange={(e) => goToPage(Number(e.target.value))}
                    className="w-24 accent-rose-500 cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Sharpness / Resolution toggle */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-[#0d1117] border border-[#30363d] px-1.5 py-0.5 rounded-lg text-[10px]">
                <span className="text-gray-400">鮮明度:</span>
                {[
                  { scale: 1.5, label: "標準" },
                  { scale: 2.0, label: "高精細" },
                  { scale: 2.5, label: "最高" }
                ].map(opt => (
                  <button
                    key={opt.scale}
                    type="button"
                    onClick={() => {
                      setPdfScale(opt.scale);
                      renderPdfPage(pdfDoc, currentPage, opt.scale);
                    }}
                    className={`px-1.5 py-0.5 rounded transition cursor-pointer ${
                      pdfScale === opt.scale
                        ? "bg-rose-500/30 text-rose-300 font-bold border border-rose-500/40"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  setPdfDoc(null);
                  setPdfFileName("");
                  setImageSrc(null);
                }}
                className="px-2 py-1 text-[11px] text-gray-400 hover:text-rose-300 hover:bg-rose-950/30 border border-transparent hover:border-rose-500/30 rounded transition cursor-pointer"
                title="別のファイルを選択"
              >
                ✕ PDFを閉じる
              </button>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col md:flex-row gap-4 bg-[#0d1117]/40 min-h-[360px]">
          {/* Left / Center: Image / PDF Canvas Workspace */}
          <div className="flex-1 flex flex-col items-center justify-center bg-[#090d13] border border-[#30363d] rounded-xl p-3 relative overflow-hidden min-h-[340px]">
            {isProcessing && (
              <div className="absolute inset-0 z-50 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center gap-2 select-none">
                <RefreshCw className="w-6 h-6 animate-spin text-rose-400" />
                <span className="text-xs font-semibold text-gray-200">PDFページを高精細レンダリング中...</span>
                <span className="text-[10px] text-gray-400">（元PDFは編集されず安全に保持されます）</span>
              </div>
            )}

            {imageSrc ? (
              <>
                <div
                  ref={containerRef}
                  onPointerDown={handleContainerPointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className="relative inline-block max-w-full max-h-[55vh] select-none cursor-crosshair overflow-hidden rounded shadow-lg touch-none"
                  style={{
                    transform: `scale(${zoom})`,
                    transition: dragMode ? "none" : "transform 0.15s ease-out",
                    touchAction: "none"
                  }}
                >
                  <img
                    ref={imageRef}
                    src={imageSrc}
                    alt="Crop preview"
                    draggable={false}
                    style={{
                      maxHeight: "52vh",
                      maxWidth: "100%",
                      display: "block",
                      userSelect: "none"
                    }}
                  />

                  {/* Darkened Backdrop Outside Crop Box */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      boxShadow: `inset 0 0 0 9999px rgba(0, 0, 0, 0.65)`
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
                        <span>指でドラッグして切り抜き位置を移動</span>
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
                <div className="mt-3 flex flex-col gap-2 w-full max-w-lg bg-[#161b22] border border-[#30363d] p-2.5 rounded-xl text-xs text-gray-300">
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
                        className="px-2 py-1 bg-[#0d1117] hover:bg-gray-800 active:bg-sky-500/20 text-gray-300 hover:text-white rounded border border-[#30363d] text-[10px] font-semibold transition cursor-pointer"
                        title="上部に配置"
                      >
                        上
                      </button>
                      <button
                        type="button"
                        onClick={() => alignCrop("center")}
                        className="px-2 py-1 bg-[#0d1117] hover:bg-gray-800 active:bg-sky-500/20 text-sky-300 hover:text-white rounded border border-[#30363d] text-[10px] font-bold transition cursor-pointer"
                        title="中央に配置"
                      >
                        中央
                      </button>
                      <button
                        type="button"
                        onClick={() => alignCrop("bottom")}
                        className="px-2 py-1 bg-[#0d1117] hover:bg-gray-800 active:bg-sky-500/20 text-gray-300 hover:text-white rounded border border-[#30363d] text-[10px] font-semibold transition cursor-pointer"
                        title="下部に配置"
                      >
                        下
                      </button>
                      <button
                        type="button"
                        onClick={() => alignCrop("left")}
                        className="px-2 py-1 bg-[#0d1117] hover:bg-gray-800 active:bg-sky-500/20 text-gray-300 hover:text-white rounded border border-[#30363d] text-[10px] font-semibold transition cursor-pointer"
                        title="左端に配置"
                      >
                        左
                      </button>
                      <button
                        type="button"
                        onClick={() => alignCrop("right")}
                        className="px-2 py-1 bg-[#0d1117] hover:bg-gray-800 active:bg-sky-500/20 text-gray-300 hover:text-white rounded border border-[#30363d] text-[10px] font-semibold transition cursor-pointer"
                        title="右端に配置"
                      >
                        右
                      </button>
                      <button
                        type="button"
                        onClick={() => alignCrop("full")}
                        className="px-2 py-1 bg-[#0d1117] hover:bg-gray-800 active:bg-sky-500/20 text-gray-300 hover:text-white rounded border border-[#30363d] text-[10px] font-semibold transition cursor-pointer"
                        title="全体サイズ"
                      >
                        全体
                      </button>
                    </div>

                    {/* Fine nudge arrow buttons */}
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
              </>
            ) : (
              /* Empty / File Selection / Drop Zone with PDF support */
              <div className="w-full h-full min-h-[300px] flex flex-col items-center justify-center p-4 text-center">
                {pdfError && (
                  <div className="mb-4 p-3 bg-red-950/60 border border-red-500/40 rounded-xl text-red-200 text-xs max-w-md text-left">
                    <p className="font-bold mb-1">⚠️ 読み込みエラー</p>
                    <p>{pdfError}</p>
                  </div>
                )}

                <div className="w-full max-w-md border-2 border-dashed border-[#30363d] hover:border-sky-500 rounded-2xl p-6 bg-[#0d1117]/60 flex flex-col items-center transition group">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center shadow">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center shadow">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  </div>

                  <h4 className="text-sm font-bold text-white mb-1">
                    元記事のPDF または 画像ファイルを開く
                  </h4>
                  <p className="text-xs text-gray-400 max-w-sm mb-4 leading-relaxed">
                    PDFの図表・グラフや、PNG/JPEG画像を読み込み、必要な部分を切り抜いてノートに挿入できます。
                  </p>

                  <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full justify-center">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full sm:w-auto px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="w-4 h-4" />
                      <span>PDF または 画像ファイルを開く</span>
                    </button>
                  </div>

                  <p className="text-[10px] text-emerald-400/90 mt-3 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>元のPDFファイルは一切編集・変更されません（完全安全・読み取り専用）</span>
                  </p>
                </div>

                {/* Source URL Quick Loader */}
                {sourceUrl && (
                  <div className="mt-3 w-full max-w-md bg-[#161b22] border border-blue-500/30 rounded-xl p-3 flex items-center justify-between gap-3 text-left">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Globe className="w-4 h-4 text-blue-400 shrink-0" />
                      <div className="overflow-hidden">
                        <span className="text-[10px] text-gray-400 block font-semibold">現在のノートの元記事リンク:</span>
                        <span className="text-xs text-blue-300 truncate block font-mono">
                          {sourceUrl}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => loadPdfFromUrl(sourceUrl)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shrink-0 transition cursor-pointer flex items-center gap-1"
                    >
                      <FileSearch className="w-3.5 h-3.5" />
                      <span>読み込む</span>
                    </button>
                  </div>
                )}

                {/* Optional Web URL Input */}
                <div className="mt-2 w-full max-w-md">
                  {!isUrlInputOpen ? (
                    <button
                      type="button"
                      onClick={() => setIsUrlInputOpen(true)}
                      className="text-[11px] text-gray-400 hover:text-sky-300 underline cursor-pointer"
                    >
                      🔗 任意のWeb上のPDF / Google DriveのURLから開く
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 bg-[#161b22] border border-[#30363d] p-1.5 rounded-lg">
                      <input
                        type="url"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://example.com/paper.pdf"
                        className="flex-1 px-2 py-1 bg-[#0d1117] border border-[#30363d] rounded text-xs text-white outline-none focus:border-sky-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => loadPdfFromUrl(urlInput)}
                        disabled={!urlInput.trim()}
                        className="px-3 py-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white rounded text-xs font-bold transition cursor-pointer"
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
          <div className="w-full md:w-72 flex flex-col gap-4 bg-[#161b22] border border-[#30363d] rounded-xl p-4">
            {/* Alt text / Caption input (Default empty) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-300 block">
                写真・図表の下のコメント（未記入なら非表示）
              </label>
              <input
                type="text"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder="未記入（空欄時は写真のみ表示）"
                className="w-full p-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-xs text-white outline-none focus:border-sky-500 placeholder:text-gray-500"
              />
              <p className="text-[10px] text-gray-400 leading-tight">
                ※デフォルトは未記入です。空欄なら写真の下にコメントは一切入りません。
              </p>
            </div>

            {/* Display Size in Article (Includes 極小 160px, default 小 260px) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-gray-300 block">
                  記事内の表示サイズ
                </label>
                <span className="text-[10px] font-mono text-sky-400 font-semibold">{imageSize}</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[
                  { id: "160px", label: "極小", desc: "160px" },
                  { id: "260px", label: "小", desc: "260px" },
                  { id: "460px", label: "中", desc: "460px" },
                  { id: "720px", label: "大", desc: "720px" },
                  { id: "100%", label: "最大", desc: "全幅" },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setImageSize(s.id)}
                    className={`py-1 px-0.5 rounded-lg border text-center transition cursor-pointer flex flex-col items-center justify-center ${
                      imageSize === s.id
                        ? "bg-sky-500/20 text-sky-300 border-sky-400 font-bold"
                        : "bg-[#0d1117] text-gray-400 border-[#30363d] hover:text-white"
                    }`}
                  >
                    <span className="text-xs">{s.label}</span>
                    <span className="text-[8px] opacity-70 leading-none">{s.desc}</span>
                  </button>
                ))}
              </div>
              {/* Custom width input */}
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[10px] text-gray-400">カスタム:</span>
                <input
                  type="text"
                  value={imageSize}
                  onChange={(e) => setImageSize(e.target.value)}
                  placeholder="例: 200px, 80%"
                  className="flex-1 px-2 py-1 bg-[#0d1117] border border-[#30363d] rounded text-[11px] text-white font-mono outline-none focus:border-sky-500 placeholder:text-gray-600"
                />
              </div>
            </div>

            {/* Aspect Ratio Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-gray-300 block">
                  アスペクト比（切り抜き縦横比）
                </label>
                <span className="text-[10px] font-mono text-sky-400 font-semibold">
                  {aspectRatio === "1:1" ? "1:1 正方形" : aspectRatio === "free" ? "自由" : aspectRatio}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(["free", "1:1", "4:3", "16:9", "3:2"] as AspectRatio[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => applyAspectRatio(r)}
                    className={`px-2 py-1.5 text-xs font-medium rounded-lg border transition cursor-pointer text-center ${
                      aspectRatio === r
                        ? "bg-sky-500/20 text-sky-300 border-sky-400 font-bold"
                        : "bg-[#0d1117] text-gray-400 border-[#30363d] hover:text-white"
                    }`}
                  >
                    {r === "free" ? "自由" : r === "1:1" ? "1:1 (正方形)" : r}
                  </button>
                ))}
              </div>
            </div>

            {/* Insert Position in Article */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-300 block">
                添付・挿入する場所
              </label>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { id: "cursor", label: "カーソル位置" },
                  { id: "top", label: "ノート先頭" },
                  { id: "bottom", label: "ノート末尾" },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setInsertPosition(p.id as any)}
                    className={`py-1.5 px-1 rounded-lg border text-center transition cursor-pointer text-[11px] ${
                      insertPosition === p.id
                        ? "bg-purple-500/20 text-purple-300 border-purple-400 font-bold"
                        : "bg-[#0d1117] text-gray-400 border-[#30363d] hover:text-white"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Transform Controls (Rotate & Reset) */}
            <div className="space-y-2.5 pt-2 border-t border-[#30363d]">
              <label className="text-[11px] font-bold text-gray-300 block">
                回転と拡大・縮小
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRotateClockwise}
                  className="flex-1 py-1.5 px-2 bg-[#0d1117] hover:bg-gray-800 border border-[#30363d] rounded-lg text-xs text-gray-300 flex items-center justify-center gap-1.5 cursor-pointer transition"
                  title="90度時計回りに回転"
                >
                  <RotateCw className="w-3.5 h-3.5 text-sky-400" />
                  <span>90° 回転</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setAspectRatio("free");
                    setCropBox({ x: 0.05, y: 0.05, width: 0.9, height: 0.9 });
                  }}
                  className="py-1.5 px-3 bg-[#0d1117] hover:bg-gray-800 border border-[#30363d] rounded-lg text-xs text-gray-400 hover:text-white cursor-pointer transition"
                  title="リセット"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Zoom buttons */}
              <div className="flex items-center justify-between gap-2 pt-1 text-xs text-gray-400">
                <span>ズーム:</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.max(0.6, z - 0.15))}
                    className="p-1 px-2 bg-[#0d1117] hover:bg-gray-800 border border-[#30363d] rounded text-gray-300 cursor-pointer"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-12 text-center font-mono text-[11px]">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(2.0, z + 0.15))}
                    className="p-1 px-2 bg-[#0d1117] hover:bg-gray-800 border border-[#30363d] rounded text-gray-300 cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="mt-auto pt-3 border-t border-[#30363d] space-y-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-1.5 px-3 bg-[#0d1117] hover:bg-gray-800 border border-[#30363d] rounded-lg text-xs text-gray-300 flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                <Upload className="w-3.5 h-3.5 text-gray-400" />
                <span>別のファイルを開く</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-t border-[#30363d] bg-[#0d1117]/90">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition cursor-pointer"
          >
            キャンセル
          </button>

          <div className="flex items-center gap-2">
            {imageSrc && !pdfDoc && (
              <button
                type="button"
                onClick={() => {
                  onInsertImage(imageSrc, altText.trim(), imageSize, insertPosition);
                  onClose();
                }}
                className="px-4 py-2 text-xs font-semibold text-gray-300 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-lg transition cursor-pointer"
              >
                切り抜かずに挿入
              </button>
            )}
            <button
              type="button"
              disabled={!imageSrc || isProcessing}
              onClick={handleExecuteCrop}
              className={`px-5 py-2 text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-md cursor-pointer ${
                !imageSrc || isProcessing
                  ? "bg-sky-900/40 text-gray-500 cursor-not-allowed border border-sky-800/30"
                  : "bg-sky-600 hover:bg-sky-500 text-white"
              }`}
            >
              <Check className="w-4 h-4" />
              <span>{isProcessing ? "処理中..." : "✂️ 切り抜いて記事に挿入"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
