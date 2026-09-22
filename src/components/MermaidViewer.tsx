import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { RefreshCw, AlertTriangle } from "lucide-react";

mermaid.initialize({
  startOnLoad: false,
  theme: "base",
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
  },
  themeVariables: {
    fontSize: "16px",
    primaryColor: "#121212",
    primaryTextColor: "#c9d1d9",
    primaryBorderColor: "#30363d",
    lineColor: "#58a6ff",
    secondaryColor: "#161b22",
    tertiaryColor: "#000000",
    backgroundColor: "transparent",
  },
});

interface MermaidViewerProps {
  code: string;
}

function isChunkLoadError(err: any): boolean {
  const msg = err?.message || String(err || "");
  return (
    msg.includes("dynamically imported module") ||
    msg.includes("Failed to fetch") ||
    msg.includes("Loading chunk") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module")
  );
}

export const MermaidViewer: React.FC<MermaidViewerProps> = ({ code }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChunkError, setIsChunkError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!containerRef.current || !code) return;

    // Clear previous
    containerRef.current.innerHTML = "";
    setError(null);
    setIsChunkError(false);

    const renderChart = async () => {
      try {
        await document.fonts.ready;
        const id = `mermaid-svg-${Math.floor(Math.random() * 100000)}`;
        const { svg } = await mermaid.render(id, code);
        if (isMounted && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err: any) {
        console.error("Mermaid parsing error:", err);
        if (isMounted) {
          const chunkErr = isChunkLoadError(err);
          setIsChunkError(chunkErr);
          setError(err?.message || "Invalid diagram syntax");
          if (containerRef.current) containerRef.current.innerHTML = "";
        }
      }
    };

    renderChart();
    return () => {
      isMounted = false;
    };
  }, [code]);

  const handleHardReload = () => {
    window.location.reload();
  };

  return (
    <div className="mermaid-container my-6 border border-[var(--border)] bg-[#0d1117] rounded p-4 overflow-x-auto relative break-inside-avoid [&_svg]:!max-w-full [&_svg]:!h-auto print:bg-white print:border-none print:p-0 group">
      <div className="flex justify-between items-center mb-2 no-print">
        <div className="text-[10px] uppercase text-[var(--subtle)] font-bold tracking-widest">
          Diagram Preview
        </div>
        {error && (
          <div className="flex items-center gap-2">
            {isChunkError && (
              <button
                type="button"
                onClick={handleHardReload}
                className="flex items-center gap-1 text-[11px] bg-amber-600 hover:bg-amber-500 text-white font-medium px-2 py-0.5 rounded transition-colors shadow-sm"
              >
                <RefreshCw size={12} />
                最新キャッシュに更新（ページ再読込）
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setError(null);
              }}
              className="text-[9px] bg-[#30363d] hover:bg-[#444c56] text-[var(--text)] px-1.5 py-0.5 rounded transition-colors"
            >
              Retry
            </button>
          </div>
        )}
      </div>
      {error && (
        <div
          className={`font-mono text-xs whitespace-pre-wrap mb-4 p-3 rounded border ${
            isChunkError
              ? "bg-amber-950/20 text-amber-300 border-amber-800/40"
              : "bg-red-900/10 text-red-400 border-red-900/30"
          }`}
        >
          <div className="font-bold mb-1 flex items-center gap-1.5">
            {isChunkError ? (
              <>
                <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                <span>ブラウザキャッシュ不整合（新バージョンのモジュール更新）：</span>
              </>
            ) : (
              <span>Mermaid Syntax Error:</span>
            )}
          </div>
          <div className="mt-1 text-[11px] leading-relaxed">
            {isChunkError ? (
              <div>
                <p className="mb-2">
                  アプリのデプロイ・更新に伴い、ブラウザが開いたままになっていた古いページが、既に存在しない古いキャッシュファイル（<code>{error}</code>）を探して失敗しました。
                </p>
                <p className="font-semibold text-amber-200">
                  上の「最新キャッシュに更新（ページ再読込）」ボタンを押すか、ブラウザをリロード（Ctrl+F5 / Cmd+Shift+R）してください。
                </p>
              </div>
            ) : (
              error
            )}
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className={`flex justify-center ${error ? "hidden" : ""}`}
      />
    </div>
  );
};
