import React, { useState, useEffect, useMemo } from "react";
import { Note, TimelineItem } from "../types";
import { getFilteredNotes, extractNoteKeywords } from "../utils/graphDataParser";
import { 
  Calendar, 
  Clock, 
  Search, 
  X, 
  ExternalLink, 
  Filter, 
  Trash2, 
  ArrowUpDown, 
  FileText,
  AlertCircle
} from "lucide-react";

interface TimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
  onSelectNote: (noteId: string) => void;
  toast: (msg: string) => void;
  filterStart?: string;
  filterEnd?: string;
  focusNote?: Note | null;
}

export default function TimelineModal({
  isOpen,
  onClose,
  notes,
  onSelectNote,
  toast,
  filterStart = "",
  filterEnd = "",
  focusNote
}: TimelineModalProps) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  // Extract keywords of the focused note if provided
  const noteKeywords = useMemo(() => {
    return focusNote ? extractNoteKeywords(focusNote) : [];
  }, [focusNote]);

  const [isFocusedMode, setIsFocusedMode] = useState<boolean>(() => {
    return Boolean(focusNote);
  });

  // Re-sync focus mode if focusNote changes
  useEffect(() => {
    if (focusNote) {
      setIsFocusedMode(true);
    } else {
      setIsFocusedMode(false);
    }
  }, [focusNote]);

  // Derive filtered notes based on global date filter
  const filteredNotes = useMemo(() => {
    return getFilteredNotes(notes, filterStart, filterEnd);
  }, [notes, filterStart, filterEnd]);

  useEffect(() => {
    const savedHidden = localStorage.getItem("cn_timeline_hidden_ids");
    if (savedHidden) {
      try {
        setHiddenIds(new Set(JSON.parse(savedHidden)));
      } catch(e) {}
    }
  }, []);

  const handleHideItem = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setHiddenIds(prev => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem("cn_timeline_hidden_ids", JSON.stringify(Array.from(next)));
      return next;
    });
    toast("リストから除外しました");
  };

  // Get list of folders for filter
  const folders = useMemo(() => {
    const list = filteredNotes
      .filter(n => {
        const folderName = n.keywords || "未分類";
        return true;
      })
      .map(n => {
        return n.keywords || "未分類";
      });
    return ["all", ...new Set(list)].filter(Boolean);
  }, [filteredNotes]);

  // Generate a signature of current notes to track changes and dynamically sync chronological events
  const notesSignature = useMemo(() => {
    return filteredNotes.map(n => `${n.id}-${n.updatedAt}-${n.content.length}`).join("|");
  }, [filteredNotes]);

  const isSystemNoiseLine = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();

    // 1. Markdown system blocks / headers e.g. "> [!NOTE] AI要約 (2026/5/16)" or "[!NOTE] AI要約"
    if (
      (trimmed.startsWith(">") && (lower.includes("note") || lower.includes("要約"))) ||
      lower.includes("[!note]") ||
      lower.includes("!note") ||
      (trimmed.startsWith("【") && trimmed.includes("要約") && trimmed.includes("】"))
    ) {
      return true;
    }

    // 2. Exact match of typical short labels preceding single date/time strings
    // Labels matching e.g. "保存日時: 2026/5/14 8:11:21", "保存日：2026/5/14"
    const metadataLabelPattern = /^(?:[->*\s+]*)(?:保存|要約作成|要約|作成|更新|登録|取得|公開|掲載|配信|収集|記録)(?:日時|日付|日)?\s*[:：]\s*[\d/.:\s-〒年万月日時分秒a-z()（）]+$/i;
    
    // Fallback simple checks for metadata prefix labels followed by colon and short value in a single line
    const isMetadataLabel = (
      trimmed.startsWith("保存日時") ||
      trimmed.startsWith("保存日") ||
      trimmed.startsWith("要約作成") ||
      trimmed.startsWith("要約日時") ||
      trimmed.startsWith("要約日") ||
      trimmed.startsWith("作成日時") ||
      trimmed.startsWith("作成日") ||
      trimmed.startsWith("更新日時") ||
      trimmed.startsWith("更新日") ||
      trimmed.startsWith("取得日") ||
      trimmed.startsWith("取得日時") ||
      trimmed.startsWith("登録日") ||
      trimmed.startsWith("登録日時") ||
      trimmed.startsWith("公開日") ||
      trimmed.startsWith("公開日時") ||
      trimmed.startsWith("配信日時") ||
      trimmed.startsWith("配信日")
    ) && (trimmed.includes(":") || trimmed.includes("：")) && trimmed.length < 50;

    if (metadataLabelPattern.test(trimmed) || isMetadataLabel) {
      return true;
    }

    return false;
  };

  const getDateTypeComment = (line: string): string => {
    const lower = line.toLowerCase().trim();
    if (lower.includes("設立") || lower.includes("創立") || lower.includes("創業") || lower.includes("発足")) {
      return "組織設立・発足日";
    }
    if (lower.includes("提携") || lower.includes("協業") || lower.includes("共同") || lower.includes("合意") || lower.includes("契約") || lower.includes("連携")) {
      return "業務提携・協業合意日";
    }
    if (lower.includes("開発") || lower.includes("構築") || lower.includes("設計") || lower.includes("策定") || lower.includes("仕様")) {
      return "製品開発・仕様策定日";
    }
    if (lower.includes("開始") || lower.includes("始動") || lower.includes("稼働") || lower.includes("スタート") || lower.includes("ローンチ") || lower.includes("施行") || lower.includes("導入")) {
      return "サービス開始・稼働導入日";
    }
    if (lower.includes("リリース") || lower.includes("発表") || lower.includes("公開") || lower.includes("掲載")) {
      return "プレス発表・製品リリース日";
    }
    if (lower.includes("計画") || lower.includes("予定") || lower.includes("目標") || lower.includes("方針")) {
      return "今後の計画・目標日程";
    }
    return "本文中での言及・できごと日";
  };

  // Load cached Timeline from localStorage if available, validated by signature
  useEffect(() => {
    if (isOpen) {
      try {
        const saved = localStorage.getItem("cn_timeline_cache");
        const savedSig = localStorage.getItem("cn_timeline_notes_signature");
        if (saved && savedSig === notesSignature) {
          const parsed = JSON.parse(saved) as TimelineItem[];
          
          // Clean loaded items from cache too, in case they look like metadata
          const cleaned = parsed.filter(item => {
            return !isSystemNoiseLine(item.event) && !isSystemNoiseLine(item.dateStr);
          });

          setItems(cleaned);
          if (cleaned.length !== parsed.length) {
            localStorage.setItem("cn_timeline_cache", JSON.stringify(cleaned));
          }
        } else {
          // If signature mismatch or first-time open, auto-run regex extraction to keep the list fresh
          runLocalExtraction();
        }
      } catch (e) {
        runLocalExtraction();
      }
    }
  }, [isOpen, notesSignature]);

  // Helper to filter out system logs, saving timestamp, and summary metadata lines to prevent extraction noise
  const cleanNoteContent = (content: string): string => {
    return content.split(/\n/).filter(line => !isSystemNoiseLine(line)).join("\n");
  };

  // Column L (Timeline) based high-precision extraction (offline, immediate, no API cost, no metadata noise)
  const runLocalExtraction = () => {
    const timelineItemsList: TimelineItem[] = [];

    filteredNotes.forEach(note => {
      const folderName = note.keywords || "未分類";
      
      // Extract strictly if Column L timeline data exists
      if (note.timeline && note.timeline.trim() !== "") {
        const lines = note.timeline.split(/\r?\n/);
        lines.forEach(line => {
          const trimmedLine = line.trim().replace(/^[-*•]\s*/, "");
          if (!trimmedLine) return;

          // Patterns match bracketed dates e.g. [2026/06/18] Event text or [2024年4月] or 【2025-03】
          let datePart = "";
          let eventText = "";

          const bracketMatch = trimmedLine.match(/^[\[【]([\d/.\-年日月\s]+)[\]】]\s*[:：\-ー]?\s*(.*)$/);
          if (bracketMatch) {
            datePart = bracketMatch[1].trim();
            eventText = bracketMatch[2].trim();
          } else {
            // Also match non-bracketed starting date e.g. 2024/04/01 Event, 2024年4月: Event
            const plainMatch = trimmedLine.match(/^(\d{4}[\/.\-年]\d{1,2}(?:[\/.\-月]\d{1,2}日?)?|\d{4}年?)\s*[:：\-ー]?\s+(.*)$/);
            if (plainMatch) {
              datePart = plainMatch[1].trim();
              eventText = plainMatch[2].trim();
            }
          }

          if (datePart && eventText) {
            let year = "";
            let month = "00";
            let day = "00";
            let displayDate = "";

            const ymdMatch = datePart.match(/(\d{4})(?:[\/.\-年](\d{1,2}))?(?:[\/.\-月](\d{1,2}))?/);
            if (ymdMatch) {
              year = ymdMatch[1];
              displayDate = `${year}年`;
              if (ymdMatch[2]) {
                const mNum = parseInt(ymdMatch[2], 10);
                month = String(mNum).padStart(2, "0");
                displayDate += `${mNum}月`;
              }
              if (ymdMatch[3]) {
                const dNum = parseInt(ymdMatch[3], 10);
                day = String(dNum).padStart(2, "0");
                displayDate += `${dNum}日`;
              }
            } else {
              const onlyYear = datePart.match(/(\d{4})/);
              if (onlyYear) {
                year = onlyYear[1];
                displayDate = `${year}年`;
              }
            }

            if (year) {
              const normalized = `${year}-${month}-${day}`;

              timelineItemsList.push({
                id: `timeline-l-${note.id}-${Math.random().toString(36).substring(2, 7)}`,
                dateStr: displayDate || datePart,
                normalizedDate: normalized,
                event: eventText,
                noteId: note.id,
                noteTitle: note.title,
                category: folderName,
                comment: getDateTypeComment(eventText)
              });
            }
          }
        });
      }
    });

    // Sort by date ascending initially
    timelineItemsList.sort((a, b) => a.normalizedDate.localeCompare(b.normalizedDate));
    setItems(timelineItemsList);
    try {
      localStorage.setItem("cn_timeline_cache", JSON.stringify(timelineItemsList));
      localStorage.setItem("cn_timeline_notes_signature", notesSignature);
    } catch {}
    toast(`📂 年表データ（L列）から新たに ${timelineItemsList.length} 件の日程イベントを抽出・反映しました`);
  };

  // Filter & Search Items
  const filteredItems = useMemo(() => {
    let result = items.filter(item => !hiddenIds.has(item.id));

    // Focus Note filter if active
    if (isFocusedMode && focusNote) {
      result = result.filter(item => {
        // Direct match with this note
        if (item.noteId === focusNote.id) return true;
        // Or event/title contains any keyword from this note
        if (noteKeywords.length > 0) {
          const lowerEvent = item.event.toLowerCase();
          const lowerTitle = item.noteTitle.toLowerCase();
          return noteKeywords.some(kw => {
            const lkw = kw.toLowerCase();
            return lowerEvent.includes(lkw) || lowerTitle.includes(lkw);
          });
        }
        return false;
      });
    }

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        item => 
          item.event.toLowerCase().includes(q) || 
          item.dateStr.toLowerCase().includes(q) || 
          item.noteTitle.toLowerCase().includes(q) || 
          item.category?.toLowerCase().includes(q)
      );
    }

    // Folder category filter
    if (selectedFolder !== "all") {
      result = result.filter(item => item.category === selectedFolder);
    }

    // Sorting order
    result.sort((a, b) => {
      return sortOrder === "asc"
        ? a.normalizedDate.localeCompare(b.normalizedDate)
        : b.normalizedDate.localeCompare(a.normalizedDate);
    });

    return result;
  }, [items, searchQuery, selectedFolder, sortOrder, hiddenIds, isFocusedMode, focusNote, noteKeywords]);

  const clearTimelineCache = () => {
    if (window.confirm("抽出した年表キャッシュを消去し、初期化しますか？")) {
      localStorage.removeItem("cn_timeline_cache");
      runLocalExtraction();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-[150] p-4 animate-in fade-in duration-200">
      <div className="bg-[#0f141c] border border-[#2d333b] rounded-2xl w-full max-w-5xl h-[85vh] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 bg-[#161b22] border-b border-[#2d333b] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1 px-2.5 bg-gradient-to-r from-teal-500/20 to-purple-500/20 rounded-md border border-teal-500/30 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-400" />
              <span className="text-xs font-bold text-teal-300 tracking-wide uppercase font-mono">ナレッジ時系列年表 (Chronology)</span>
            </div>
            <p className="text-[11px] text-gray-400 hidden sm:block">
              各ノートに記述された日付と言及イベントをタイムラインへ自動構造化・配列化
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-[#21262d] rounded-lg text-gray-400 hover:text-gray-100 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Focus Note Banner */}
        {focusNote && (
          <div className="px-4 py-2 bg-[#1f293d] border-b border-[#388bfd44] flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full bg-[#388bfd33] text-[#58a6ff] font-bold border border-[#388bfd66] text-[11px] flex items-center gap-1">
                📌 この記事の関連年表
              </span>
              <span className="text-gray-100 font-semibold max-w-[240px] sm:max-w-md truncate" title={focusNote.title}>
                {focusNote.title}
              </span>
              <span className="text-gray-400 text-[11px]">
                (記事本体 + 関連キーワード {noteKeywords.length}件)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex bg-[#161b22] border border-[#30363d] rounded-md p-0.5 text-xs">
                <button
                  onClick={() => setIsFocusedMode(true)}
                  className={`px-3 py-1 font-semibold rounded cursor-pointer transition-all ${
                    isFocusedMode ? "bg-[#388bfd33] text-[#58a6ff] font-bold border border-[#388bfd55]" : "text-gray-400 hover:bg-[#ffffff08]"
                  }`}
                >
                  記事・関連年表 ({filteredItems.length})
                </button>
                <button
                  onClick={() => setIsFocusedMode(false)}
                  className={`px-3 py-1 font-semibold rounded cursor-pointer transition-all ${
                    !isFocusedMode ? "bg-[#21262d] text-gray-200 font-bold" : "text-gray-400 hover:bg-[#ffffff08]"
                  }`}
                >
                  全体年表 ({items.length})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Action Controls Toolbar */}
        <div className="p-4 bg-[#0d1117] border-b border-[#2d333b] flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-2.5 items-center flex-1 min-w-[280px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                <Search className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="年月日、イベント等で検索..."
                className="w-full pl-8 pr-3 py-1 bg-[#161b22] border border-[#30363d] rounded-lg text-xs text-gray-200 outline-none focus:border-teal-500 transition-all placeholder:text-gray-500"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 hover:text-white text-gray-500 text-[10px]"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Folder Dropdown Filter */}
            <div className="relative">
              <select
                value={selectedFolder}
                onChange={(e) => setSelectedFolder(e.target.value)}
                className="bg-[#161b22] border border-[#30363d] rounded-lg text-xs text-gray-300 py-1 px-2 pr-6 outline-none appearance-none cursor-pointer hover:bg-[#21262d] transition-colors"
                title="フォルダカテゴリでフィルタ"
              >
                <option value="all">📁 すべてのカテゴリ</option>
                {folders.filter(f => f !== "all").map(f => (
                  <option key={f} value={f}>📁 {f}</option>
                ))}
              </select>
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[8px] text-gray-400 pointer-events-none">▼</span>
            </div>

            {/* Sort Order Action */}
            <button
              onClick={() => setSortOrder(prev => prev === "asc" ? "desc" : "asc")}
              className="px-2.5 py-1 bg-[#161b22] hover:bg-[#21262d] text-[#c9d1d9] border border-[#30363d] rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer"
              title="時刻昇順/降順をソート"
            >
              <ArrowUpDown className="w-3 h-3 text-teal-400" />
              <span>{sortOrder === "asc" ? "過去 → 未来" : "未来 → 過去"}</span>
            </button>
          </div>

          <div className="flex gap-2 items-center flex-wrap">
            {/* Split Switcher (Card / Table grid) */}
            <div className="flex bg-[#161b22] border border-[#30363d] p-0.5 rounded-lg text-xs">
              <button
                onClick={() => setViewMode("card")}
                className={`px-3 py-1 rounded-md transition cursor-pointer text-[10px] sm:text-xs ${
                  viewMode === "card" 
                    ? "bg-[#21262d] text-teal-400 font-bold" 
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                🏝 タイムライン
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`px-3 py-1 rounded-md transition cursor-pointer text-[10px] sm:text-xs ${
                  viewMode === "table" 
                    ? "bg-[#21262d] text-teal-400 font-bold" 
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                📊 リスト・テーブル表
              </button>
            </div>

            {/* Clear Button */}
            <button
              onClick={clearTimelineCache}
              className="p-1 hover:bg-red-500/20 rounded text-gray-500 hover:text-red-400 transition"
              title="年表キャッシュをクリアしてリロードします"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Modal Main Board */}
        <div className="flex-1 overflow-y-auto bg-[#0d1117] p-6 relative">
          
          {filteredItems.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
              <AlertCircle className="w-12 h-12 text-gray-600 mb-2" />
              <p className="text-sm font-semibold text-gray-300">表示対象の日程イベントがありません</p>
              <p className="text-xs text-gray-500 max-w-sm mt-1">
                GoogleスプレッドシートのL列（年表作成用のデータ）に「[2026/06/18] できごと」のような年月日の情報を入力して再読み込みしてください。
              </p>
            </div>
          ) : viewMode === "card" ? (
            /* Cards Timeline View layout */
            <div className="relative max-w-3xl mx-auto pl-6 sm:pl-10">
              
              {/* Vertical line through timeline */}
              <div className="absolute left-[7px] sm:left-[11px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-teal-500/65 via-purple-500/65 to-teal-500/65" />

              <div className="flex flex-col gap-6">
                {filteredItems.map((item, idx) => (
                  <div 
                    key={item.id} 
                    className="relative flex flex-col gap-1.5 group select-text"
                  >
                    {/* Circle Dot node on the line */}
                    <div className="absolute -left-[24px] sm:-left-[34px] top-1 w-3 sm:w-4 h-3 sm:h-4 rounded-full bg-[#0d1117] border-2 border-teal-400 flex items-center justify-center z-10 transition-transform duration-300 group-hover:scale-125 group-hover:border-purple-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-teal-400 group-hover:bg-purple-400" />
                    </div>

                    {/* Date badge */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 bg-teal-400/10 border border-teal-500/20 rounded-md text-[11px] font-bold text-teal-300 font-mono tracking-wider flex items-center gap-1 shadow-md">
                        <Clock className="w-3 h-3" />
                        {item.dateStr}
                      </span>
                      {item.category && (
                        <span className="px-1.5 py-0.2 bg-[#1f242e] border border-gray-700 rounded text-[9px] text-gray-400">
                          📁 {item.category}
                        </span>
                      )}
                      {item.comment && (
                        <span className="px-1.5 py-0.2 bg-purple-500/10 border border-purple-500/30 rounded text-[9px] text-purple-300 font-bold">
                          💡 {item.comment}
                        </span>
                      )}
                    </div>

                    {/* Action card body */}
                    <div className="bg-[#161b22] hover:bg-[#1f242d] border border-[#2d333b] hover:border-purple-500/40 p-3.5 rounded-xl transition duration-300 shadow-lg flex flex-col gap-2">
                      <p className="text-xs sm:text-sm text-gray-100 font-semibold leading-relaxed">
                        {item.event}
                      </p>
                      
                      <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1.5 border-t border-[#30363d]/60">
                        {/* Source document trigger */}
                        <button
                          onClick={() => {
                            onSelectNote(item.noteId);
                            onClose();
                            toast(`📄 「${item.noteTitle}」を開きました`);
                          }}
                          className="flex items-center gap-1 text-teal-400 hover:text-teal-300 bg-transparent border-0 cursor-pointer text-[10px] p-0 font-bold transition"
                          title="この記事（ノート）を開いて内容を精読します"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span className="underline truncate max-w-[200px] sm:max-w-xs">{item.noteTitle}</span>
                        </button>
                        
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => handleHideItem(item.id, e)}
                            className="flex items-center gap-1 text-[9px] text-gray-500 hover:text-red-400 bg-transparent border-none cursor-pointer p-0 transition"
                            title="リストから除く"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span className="hidden sm:inline">リストから除く</span>
                          </button>
                          <span className="text-[9px] text-gray-500 select-none">
                            #{idx + 1}
                          </span>
                        </div>
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Tabular list layout (Interactive Grid Table) */
            <div className="w-full overflow-x-auto border border-[#2d333b] rounded-xl shadow-2xl bg-[#161b22]">
              <table className="w-full text-left border-collapse text-xs select-text">
                <thead>
                  <tr className="bg-[#0f141c] border-b border-[#2d333b] text-gray-300 font-bold">
                    <th className="py-3 px-4 w-[160px] font-mono whitespace-nowrap">📅 年月日/時期</th>
                    <th className="py-3 px-4 w-[140px] whitespace-nowrap">📁 カテゴリ</th>
                    <th className="py-3 px-4">📝 日程イベント・できごと</th>
                    <th className="py-3 px-4 w-[240px] whitespace-nowrap">根拠ソース記事</th>
                    <th className="py-3 px-4 w-[60px] text-center">除外</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363d]/50">
                  {filteredItems.map((item, idx) => (
                    <tr 
                      key={item.id}
                      className="hover:bg-[#1a202c] transition duration-200"
                    >
                      {/* Date */}
                      <td className="py-3 px-4 font-mono font-bold text-teal-400 text-[11px] whitespace-nowrap">
                        {item.dateStr}
                      </td>
                      
                      {/* Category */}
                      <td className="py-3 px-4 text-gray-400">
                        <span className="px-1.5 py-0.5 bg-[#1a1f29] border border-gray-700/60 rounded text-[9px]">
                          {item.category || "未分類"}
                        </span>
                      </td>

                      {/* Event description */}
                      <td className="py-3 px-4 font-semibold text-gray-100 leading-relaxed text-[11px]">
                        {item.event}
                      </td>

                      {/* Note reference */}
                      <td className="py-3 px-4">
                        <button
                          onClick={() => {
                            onSelectNote(item.noteId);
                            onClose();
                            toast(`📄 「${item.noteTitle}」を開きました`);
                          }}
                          className="flex items-center gap-1.5 text-teal-400 hover:text-teal-300 bg-transparent border-0 cursor-pointer p-0 text-[10px] text-left transition font-bold"
                        >
                          <FileText className="w-3.5 h-3.5 shrink-0" />
                          <span className="underline truncate max-w-[170px] sm:max-w-[220px]" title={item.noteTitle}>
                            {item.noteTitle}
                          </span>
                        </button>
                      </td>

                      {/* Exclude button */}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={(e) => handleHideItem(item.id, e)}
                          className="text-gray-500 hover:text-red-400 bg-transparent border-none cursor-pointer p-1 transition flex items-center justify-center mx-auto"
                          title="リストから除く"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>

        {/* Footer status summary */}
        <div className="p-3 bg-[#161b22] border-t border-[#2d333b] flex items-center justify-between text-[11px] text-gray-400">
          <div className="flex gap-2">
            <span>合計項目数: <strong className="text-gray-200">{filteredItems.length}</strong> 件</span>
            {searchQuery.trim() && (
              <span className="text-gray-500">(フィルタ検索にヒント)</span>
            )}
          </div>
          <p className="text-gray-500 hidden sm:block">
            ※各ノートの記事の文章を変更・追加すると、年表も動的に再アップデートされます。
          </p>
        </div>

      </div>
    </div>
  );
}
