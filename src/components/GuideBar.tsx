import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Play,
  Pause,
  ChevronUp,
  ChevronDown,
  X,
  Pin
} from "lucide-react";
import { Note } from "../types";

export interface GuideBarProps {
  isOpen: boolean;
  onClose: () => void;
  activeNote: Note;
  currentLineIndex: number;
  totalLines?: number;
  onLineChange: (lineIndex: number) => void;
  onNextArticle: () => boolean;
  onPrevArticle?: () => boolean;
  isLastArticle?: boolean;
  isPositionFixed?: boolean;
  onTogglePositionFixed?: () => void;
}

// 0.5秒から2.0秒まで0.5ステップ
export const SPEED_OPTIONS = [0.5, 1.0, 1.5, 2.0] as const;
export type GuideSpeed = typeof SPEED_OPTIONS[number];

export const GuideBar: React.FC<GuideBarProps> = ({
  isOpen,
  onClose,
  activeNote,
  currentLineIndex,
  totalLines: propTotalLines,
  onLineChange,
  onNextArticle,
  onPrevArticle,
  isLastArticle = false,
  isPositionFixed = false,
  onTogglePositionFixed,
}) => {
  // 自動送り再生ステート (デフォルト: 流す/再生中)
  const [isPlaying, setIsPlaying] = useState<boolean>(true);

  // 再生スピード（デフォルト 1.0秒、0.5秒〜2.0秒、0.5ステップ）
  const [speed, setSpeed] = useState<GuideSpeed>(() => {
    try {
      const saved = localStorage.getItem("cn_guidebar_speed");
      if (saved) {
        const val = parseFloat(saved);
        if (SPEED_OPTIONS.includes(val as any)) return val as GuideSpeed;
      }
    } catch (_) {}
    return 1.0;
  });

  // 画面上の視覚行数（propsから渡された場合は最優先）、未計算時はテキスト行数
  const totalLines = useMemo(() => {
    if (propTotalLines !== undefined && propTotalLines > 0) {
      return propTotalLines;
    }
    if (!activeNote?.content) return 1;
    return activeNote.content.split("\n").length;
  }, [propTotalLines, activeNote?.content]);

  const handleSpeedChange = (newSpeed: GuideSpeed) => {
    setSpeed(newSpeed);
    try {
      localStorage.setItem("cn_guidebar_speed", String(newSpeed));
    } catch (_) {}
  };

  // 1行進む
  const handleNextLine = useCallback(() => {
    if (totalLines <= 0) return;
    if (currentLineIndex < totalLines - 1) {
      onLineChange(currentLineIndex + 1);
    } else {
      // 記事最後まで到達 -> フォルダリストの次記事へ（最下段の場合はガイドバー解除）
      const moved = onNextArticle();
      if (!moved) {
        setIsPlaying(false);
        onClose();
      }
    }
  }, [currentLineIndex, totalLines, onLineChange, onNextArticle, onClose]);

  // 1行戻る
  const handlePrevLine = useCallback(() => {
    if (totalLines <= 0) return;
    if (currentLineIndex > 0) {
      onLineChange(currentLineIndex - 1);
    } else if (onPrevArticle) {
      onPrevArticle();
    }
  }, [currentLineIndex, totalLines, onLineChange, onPrevArticle]);

  // 自動行送りタイマー処理
  useEffect(() => {
    if (!isPlaying || !isOpen) return;

    const intervalMs = speed * 1000;
    const timer = setInterval(() => {
      if (currentLineIndex >= totalLines - 1) {
        const moved = onNextArticle();
        if (!moved) {
          setIsPlaying(false);
          onClose();
        }
      } else {
        onLineChange(currentLineIndex + 1);
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, isOpen, speed, currentLineIndex, totalLines, onNextArticle, onLineChange, onClose]);

  // ノート変更時の補正
  useEffect(() => {
    if (currentLineIndex >= totalLines && totalLines > 0) {
      onLineChange(0);
    }
  }, [activeNote?.id, totalLines, currentLineIndex, onLineChange]);

  // Spaceキーで再生/停止、上下キーで行送り
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        setIsPlaying(prev => !prev);
      } else if (e.code === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        handleNextLine();
      } else if (e.code === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        handlePrevLine();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        if (onTogglePositionFixed) {
          onTogglePositionFixed();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleNextLine, handlePrevLine]);

  if (!isOpen || !activeNote) return null;

  return (
    <div
      id="reading-guidebar"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[500] max-w-[95vw] overflow-x-auto flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#30363d] bg-[#161b22]/95 backdrop-blur-md text-[#f0f6fc] shadow-[0_8px_32px_rgba(0,0,0,0.8),0_0_16px_rgba(250,204,21,0.25)] select-none print:hidden transition-all"
    >
      {/* 🟡 再生 / 一時停止ボタン */}
      <button
        type="button"
        onClick={() => setIsPlaying(!isPlaying)}
        className={`h-7 px-3 rounded-full flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer shrink-0 ${
          isPlaying
            ? "bg-yellow-400 text-black hover:bg-yellow-300 shadow-[0_0_10px_rgba(250,204,21,0.5)]"
            : "bg-yellow-400/90 text-black hover:bg-yellow-300"
        }`}
        title={isPlaying ? "一時停止 (Space)" : "流す (Space)"}
      >
        {isPlaying ? (
          <>
            <Pause className="w-3.5 h-3.5 fill-black" />
            <span>一時停止</span>
          </>
        ) : (
          <>
            <Play className="w-3.5 h-3.5 fill-black" />
            <span>流す</span>
          </>
        )}
      </button>

      {/* 前行 / 次行 微調整ボタン */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={handlePrevLine}
          className="p-1 text-gray-400 hover:text-white rounded hover:bg-[#21262d] transition-colors cursor-pointer"
          title="前行 (↑)"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleNextLine}
          className="p-1 text-gray-400 hover:text-white rounded hover:bg-[#21262d] transition-colors cursor-pointer"
          title="次行 (↓)"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* 画面上の行カウント表示 (現在行 / 総行数) */}
      <div 
        className="text-[11px] font-mono text-yellow-300/90 px-1.5 py-0.5 rounded bg-black/40 border border-[#30363d] select-none shrink-0" 
        title="現在行 / 画面上の総行数"
      >
        {totalLines > 0 ? `${currentLineIndex + 1}/${totalLines}` : "-"}
      </div>

      <div className="h-4 w-[1px] bg-[#30363d] mx-0.5" />

      {/* 🟡 ガイドライン位置固定トグルボタン */}
      {onTogglePositionFixed && (
        <>
          <button
            type="button"
            onClick={onTogglePositionFixed}
            className={`h-7 px-2.5 rounded-full flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer shrink-0 ${
              isPositionFixed
                ? "bg-amber-400 text-black shadow-[0_0_10px_rgba(251,191,36,0.5)]"
                : "bg-[#0d1117] text-gray-400 hover:text-white border border-[#30363d]"
            }`}
            title={
              isPositionFixed
                ? "ガイドライン位置固定: ON (画面上の固定位置で文章を送ります) [Fキー]"
                : "ガイドライン位置固定: OFF (通常追従モード) [Fキー]"
            }
          >
            <Pin className={`w-3.5 h-3.5 shrink-0 ${isPositionFixed ? "fill-black" : ""}`} />
            <span>位置固定</span>
            <span className={`text-[10px] font-mono px-1 rounded ${
              isPositionFixed ? "bg-black/20 text-black font-extrabold" : "bg-black/40 text-gray-400"
            }`}>
              {isPositionFixed ? "ON" : "OFF"}
            </span>
          </button>

          <div className="h-4 w-[1px] bg-[#30363d] mx-0.5" />
        </>
      )}

      {/* 🟡 速さの調整 (0.5s 〜 2.0s / 0.5ステップ) */}
      <div className="flex items-center gap-1 bg-[#0d1117] p-0.5 rounded-full border border-[#30363d] shrink-0">
        {SPEED_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => handleSpeedChange(s)}
            className={`px-2 py-0.5 rounded-full text-[11px] font-mono transition-all cursor-pointer ${
              speed === s
                ? "bg-yellow-400 text-black font-bold shadow-sm"
                : "text-gray-400 hover:text-white"
            }`}
            title={`${s}秒ごとに1行進む`}
          >
            {s.toFixed(1)}s
          </button>
        ))}
      </div>

      <div className="h-4 w-[1px] bg-[#30363d] mx-0.5" />

      {/* 閉じるボタン */}
      <button
        type="button"
        onClick={() => {
          setIsPlaying(false);
          onClose();
        }}
        className="p-1 text-gray-400 hover:text-red-400 rounded-full hover:bg-[#21262d] transition-colors cursor-pointer shrink-0"
        title="ガイドを閉じる"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
