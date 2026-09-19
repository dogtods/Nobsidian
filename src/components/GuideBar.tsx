import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Play,
  Pause,
  ChevronUp,
  ChevronDown,
  X
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

// スピード選択肢 (0.5, 0.8, 1.0, 1.2, 1.5, 2.0秒)
export const SPEED_OPTIONS = [0.5, 0.8, 1.0, 1.2, 1.5, 2.0] as const;
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

  // 再生スピード（デフォルト 1.0秒）
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

  // 漢字自動減速機能のON/OFFステート
  const [isKanjiSlowdownEnabled, setIsKanjiSlowdownEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("cn_kanji_slowdown_enabled");
      if (saved !== null) return saved === "true";
    } catch (_) {}
    return true; // デフォルトで有効
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

  // 自動行送りタイマー処理（漢字の数に応じた速度調整機能付き）
  useEffect(() => {
    if (!isPlaying || !isOpen) return;

    const rawContent = activeNote?.content || "";
    const lines = rawContent.split("\n").filter(l => l.trim().length > 0);
    
    let lineText = "";
    if (lines.length > 0 && totalLines > 0) {
      const lineIdx = Math.min(Math.floor((currentLineIndex / totalLines) * lines.length), lines.length - 1);
      lineText = lines[lineIdx] || "";
    } else {
      lineText = lines[currentLineIndex] || rawContent;
    }

    const totalChars = lineText.replace(/\s+/g, "").length;

    let multiplier = 1.0;
    if (isKanjiSlowdownEnabled && totalChars > 0) {
      const kanjiMatches = lineText.match(/[\u4e00-\u9faf\u3400-\u4dbf]/g);
      const kanjiCount = kanjiMatches ? kanjiMatches.length : 0;
      const kanjiRatio = kanjiCount / totalChars;

      if (kanjiRatio >= 0.6) {
        multiplier = 1.5; // 漢字が大半・全部（60%以上）なら1.5倍遅く
      } else if (kanjiRatio >= 0.3) {
        multiplier = 1.3; // 漢字が半分程度（30%以上）なら1.3倍遅く
      } else if (kanjiCount > 0) {
        multiplier = 1.1; // 漢字が一部含まれるなら1.1倍遅く
      }
    }

    const intervalMs = speed * 1000 * multiplier;
    const timer = setTimeout(() => {
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

    return () => clearTimeout(timer);
  }, [isPlaying, isOpen, speed, currentLineIndex, totalLines, activeNote?.content, onNextArticle, onLineChange, onClose]);

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

      {/* 🟡 位置固定トグルボタン (選択式・上位50%位置) */}
      {onTogglePositionFixed && (
        <button
          type="button"
          onClick={onTogglePositionFixed}
          className={`h-7 px-2.5 rounded-full flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer shrink-0 ${
            isPositionFixed
              ? "bg-yellow-400 text-black shadow-sm"
              : "bg-[#0d1117] text-gray-400 hover:text-white border border-[#30363d]"
          }`}
          title={isPositionFixed ? "位置固定: ON (画面中央 上位50%の位置に固定) [Fキー]" : "位置固定: OFF (通常追従) [Fキー]"}
        >
          <span>位置固定</span>
          <span className={`text-[10px] font-mono px-1 rounded ${
            isPositionFixed ? "bg-black/20 text-black font-extrabold" : "bg-black/40 text-gray-400"
          }`}>
            {isPositionFixed ? "ON" : "OFF"}
          </span>
        </button>
      )}

      <div className="h-4 w-[1px] bg-[#30363d] mx-0.5" />

      {/* 🟡 漢字減速トグルボタン */}
      <button
        type="button"
        onClick={() => {
          const nextVal = !isKanjiSlowdownEnabled;
          setIsKanjiSlowdownEnabled(nextVal);
          try {
            localStorage.setItem("cn_kanji_slowdown_enabled", String(nextVal));
          } catch (_) {}
        }}
        className={`h-7 px-2.5 rounded-full flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer shrink-0 ${
          isKanjiSlowdownEnabled
            ? "bg-yellow-400 text-black shadow-sm"
            : "bg-[#0d1117] text-gray-400 hover:text-white border border-[#30363d]"
        }`}
        title={isKanjiSlowdownEnabled ? "漢字自動減速: ON (漢字の量に応じて速度を自動調整します)" : "漢字自動減速: OFF"}
      >
        <span>漢字減速</span>
        <span className={`text-[10px] font-mono px-1 rounded ${
          isKanjiSlowdownEnabled ? "bg-black/20 text-black font-extrabold" : "bg-black/40 text-gray-400"
        }`}>
          {isKanjiSlowdownEnabled ? "ON" : "OFF"}
        </span>
      </button>

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
