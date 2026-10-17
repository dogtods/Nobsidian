/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import {
  PairHeatmapRow,
  PeriodColumn,
  PairPeriodData,
  HeatmapSettings,
  DEFAULT_EXCLUDED_WORDS,
  parseCoOccurCsv,
  generatePeriods,
  aggregatePairHeatmap
} from "../utils/pairHeatmapUtils";
import { X, Sliders, Search, Download, Calendar, ArrowUpDown, Sparkles, AlertCircle, ExternalLink } from "lucide-react";

interface PairHeatmapModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawCsvData?: string; // Optional raw CSV string passed from parent or loaded
}

// Dummy CSV data for testing & standalone demo when no CSV is provided
const DUMMY_CSV = `Source,Target,CoOccurCount,JaccardCorrelation,Folders,Dates,ArticleTitles
半導体,AIチップ,12,0.45,ハードウェア;AI,"2026/10/12;2026/09/28 14:20:00;2026/09/15","次世代半導体AIチップ量産開始;AI専用半導体の動向;半導体不足の解消へ"
生成AI,LLM,18,0.62,AI;ソフトウェア,"2026/10/14;2026/10/01;2026/08/20","最新LLMベンチマーク比較;生成AIのビジネス活用;マルチモーダルLLMの進化"
再生可能エネルギー,蓄電池,9,0.38,エネルギー;環境,"2026/10/10;2026/08/11","再エネ導入と蓄電池の必須化;系統用蓄電池の市場拡大"
EV,充電インフラ,15,0.51,自動車;インフラ,"2026/10/13;2026/09/02;2026/07/19","EV普及の鍵を握る充電インフラ整備;次世代急速充電器の設置ラッシュ"
量子コンピューティング,暗号資産,4,0.18,テクノロジー;金融,"2026/10/05;2026/06/12","量子耐性暗号への移行期;量子コンピュータの脅威と対策"
半導体,サプライチェーン,8,0.31,ハードウェア;経済,"2026/10/08;2026/05/20","半導体サプライチェーンの強靭化;地政学リスクと調達先多角化"
産業動向,実務対応,25,0.80,管理;ビジネス,"2026/10/14;2026/09/01","産業動向レポート2026;法改正に伴う実務対応"
生成AI,著作権,11,0.42,AI;法律,"2026/10/11;2026/08/05","生成AIと著作権法制の論点整理;クリエイター保護の新たなガイドライン"
蓄電池,EV,7,0.29,エネルギー;自動車,"2026/09/25;2026/07/10","車載蓄電池のリユース市場;EVとV2Hシステム構築"`;

export default function PairHeatmapModal({ isOpen, onClose, rawCsvData }: PairHeatmapModalProps) {
  const [settings, setSettings] = useState<HeatmapSettings>({
    unit: "2weeks",
    periodCount: 8,
    excludedWords: DEFAULT_EXCLUDED_WORDS,
    minTotalCount: 2,
    minPeriodsCount: 2,
    searchQuery: "",
    sortBy: "surging-priority",
    surgingThresholdMult: 2,
    surgingMinCount: 2
  });

  const [activeTab, setActiveTab] = useState<"heatmap" | "new" | "surging" | "resurgence">("heatmap");
  const [displayRowsLimit, setDisplayRowsLimit] = useState<number>(15);
  const [selectedCell, setSelectedCell] = useState<{ pairKey: string; periodKey: string; articles: Array<{ date: string; title: string }> } | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [newExcludedInput, setNewExcludedInput] = useState<string>("");

  // Parse CSV and memoize aggregated data
  const { matrixRows, newPairs } = useMemo(() => {
    const csvToParse = rawCsvData && rawCsvData.trim().length > 0 ? rawCsvData : DUMMY_CSV;
    const rows = parseCoOccurCsv(csvToParse);
    const periods = generatePeriods(settings.unit, settings.periodCount);
    return aggregatePairHeatmap(
      rows,
      periods,
      settings.excludedWords,
      settings.minTotalCount,
      settings.minPeriodsCount,
      settings.surgingThresholdMult,
      settings.surgingMinCount
    );
  }, [rawCsvData, settings.unit, settings.periodCount, settings.excludedWords, settings.minTotalCount, settings.minPeriodsCount, settings.surgingThresholdMult, settings.surgingMinCount]);

  const periods = useMemo(() => {
    return generatePeriods(settings.unit, settings.periodCount);
  }, [settings.unit, settings.periodCount]);

  // Filter & Sort matrix rows
  const filteredAndSortedRows = useMemo(() => {
    let list = [...matrixRows];

    // Tab filter
    if (activeTab === "surging") {
      list = list.filter(r => r.classification === "surging");
    } else if (activeTab === "resurgence") {
      list = list.filter(r => r.classification === "resurgence");
    }

    // Search query filter
    if (settings.searchQuery.trim()) {
      const q = settings.searchQuery.toLowerCase();
      list = list.filter(r => r.pairKey.toLowerCase().includes(q));
    }

    // Sorting
    list.sort((a, b) => {
      if (settings.sortBy === "surging-priority") {
        const score = (c: string) => (c === "surging" ? 4 : c === "resurgence" ? 3 : c === "continuing" ? 2 : 1);
        const scoreDiff = score(b.classification) - score(a.classification);
        if (scoreDiff !== 0) return scoreDiff;
        return b.totalCount - a.totalCount;
      } else if (settings.sortBy === "total") {
        return b.totalCount - a.totalCount;
      } else {
        return b.jaccard - a.jaccard;
      }
    });

    return list;
  }, [matrixRows, activeTab, settings.searchQuery, settings.sortBy]);

  const displayedRows = filteredAndSortedRows.slice(0, displayRowsLimit);

  // Tab counts
  const surgingCount = matrixRows.filter(r => r.classification === "surging").length;
  const resurgenceCount = matrixRows.filter(r => r.classification === "resurgence").length;

  // Export CSV
  const handleExportCsv = () => {
    let csv = "data:text/csv;charset=utf-8,\uFEFF";
    csv += "PairKey,Classification,TotalCount,Jaccard," + periods.map(p => p.periodKey).join(",") + "\r\n";
    matrixRows.forEach(r => {
      const counts = periods.map(p => r.periodCounts[p.periodKey] || 0).join(",");
      csv += `"${r.pairKey}","${r.classification}",${r.totalCount},${r.jaccard},${counts}\r\n`;
    });
    const uri = encodeURI(csv);
    const link = document.createElement("a");
    link.setAttribute("href", uri);
    link.setAttribute("download", `pair-time-series-heatmap-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[#0d1117]/90 z-[1100] flex flex-col animate-[fadeIn_0.2s_ease-out] text-[var(--text)]">
      
      {/* Top Header */}
      <div className="p-4 px-6 border-b border-[var(--border)] bg-[var(--surface)] flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 font-bold flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            <span className="text-base font-bold text-[var(--bright)]">ペア時系列ヒートマップ</span>
          </div>
          <span className="text-xs text-[var(--muted)] hidden sm:inline">
            共起ペアの強まりを期間単位で追跡・新興トレンド発見
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] text-[var(--bright)] font-semibold text-xs rounded-md border border-[var(--border2)] transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5 text-blue-400" /> 設定・閾値
          </button>
          <button
            onClick={handleExportCsv}
            className="px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white font-semibold text-xs rounded-md transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Download className="w-3.5 h-3.5" /> CSV出力
          </button>
          <div
            onClick={onClose}
            className="p-1.5 text-[var(--muted)] hover:text-[var(--red)] cursor-pointer text-lg font-bold transition-colors select-none"
            title="閉じる"
          >
            ✕
          </div>
        </div>
      </div>

      {/* Summary Tabs / Header Cards */}
      <div className="p-4 px-6 bg-[#161b22] border-b border-[var(--border)] shrink-0 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setActiveTab("heatmap")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "heatmap" ? "bg-[#388bfd33] text-[#58a6ff] border border-[#388bfd55]" : "bg-[#21262d] text-[var(--subtle)] hover:bg-[#30363d]"
            }`}
          >
            🗺 ヒートマップ本体 ({matrixRows.length})
          </button>
          <button
            onClick={() => setActiveTab("new")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "new" ? "bg-[#23863633] text-[#3fb950] border border-[#23863666]" : "bg-[#21262d] text-[var(--subtle)] hover:bg-[#30363d]"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#3fb950]" /> 今期の新規 ({newPairs.length})
          </button>
          <button
            onClick={() => setActiveTab("surging")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "surging" ? "bg-[#f8514933] text-[#f85149] border border-[#f8514966]" : "bg-[#21262d] text-[var(--subtle)] hover:bg-[#30363d]"
            }`}
          >
            🔥 急増 ({surgingCount})
          </button>
          <button
            onClick={() => setActiveTab("resurgence")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "resurgence" ? "bg-amber-500/25 text-amber-400 border border-amber-500/50" : "bg-[#21262d] text-[var(--subtle)] hover:bg-[#30363d]"
            }`}
          >
            ♻️ 再浮上 ({resurgenceCount})
          </button>
        </div>

        {/* Search & Sort Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="ペア名を検索..."
              value={settings.searchQuery}
              onChange={(e) => setSettings({ ...settings, searchQuery: e.target.value })}
              className="bg-[#0d1117] border border-[var(--border2)] rounded-md pl-8 pr-3 py-1.5 text-xs text-[var(--bright)] placeholder-[var(--muted)] focus:outline-none focus:border-blue-500 w-44"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-[#0d1117] border border-[var(--border2)] rounded-md px-2 py-1">
            <ArrowUpDown className="w-3 h-3 text-[var(--muted)]" />
            <select
              value={settings.sortBy}
              onChange={(e) => setSettings({ ...settings, sortBy: e.target.value as any })}
              className="bg-transparent text-xs text-[var(--bright)] focus:outline-none cursor-pointer"
            >
              <option value="surging-priority">優先度順 (急増・再浮上)</option>
              <option value="total">累計件数順</option>
              <option value="jaccard">Jaccard相関順</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden p-4 px-6 gap-4 min-h-0">

        {/* Tab 1: New Pairs List */}
        {activeTab === "new" && (
          <div className="flex-1 overflow-y-auto bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
            <h3 className="text-sm font-bold text-[var(--bright)] mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#3fb950]" /> 直近14日以内に初登場した新規共起ペア ({newPairs.length}組)
            </h3>
            <p className="text-xs text-[var(--muted)] mb-4">
              これらはヒートマップ本体の行には表示されず、新しく生まれた関連トピックとしてJaccard相関順にリストアップされています。
            </p>

            {newPairs.length === 0 ? (
              <div className="p-8 text-center text-[var(--muted)] bg-[#161b22] rounded-lg border border-dashed border-[var(--border)]">
                直近14日以内の新規ペアはありません。
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {newPairs.map((np, idx) => (
                  <div key={idx} className="p-3 bg-[#161b22] rounded-lg border border-[var(--border2)] flex justify-between items-center">
                    <div>
                      <div className="font-bold text-sm text-[var(--bright)]">{np.pairKey}</div>
                      <div className="text-[10px] text-[var(--muted)] mt-0.5">初登場日: {np.firstDate} / 累計: {np.totalCount}件</div>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-0.5 bg-[#3fb95033] text-[#3fb950] font-mono text-xs font-bold rounded">
                        {Math.round(np.jaccard * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Heatmap Matrix */}
        {activeTab !== "new" && (
          <div className="flex-1 flex flex-col overflow-hidden bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-lg min-h-0">
            
            <div className="overflow-auto flex-1 relative">
              <table className="w-full border-collapse text-xs select-none">
                <thead>
                  <tr className="bg-[#161b22] sticky top-0 z-20 border-b border-[var(--border)]">
                    {/* Fixed Pair Header Column */}
                    <th className="p-2.5 text-left font-bold text-[var(--bright)] sticky left-0 z-30 bg-[#161b22] border-r border-[var(--border)] w-[96px] min-w-[96px] max-w-[96px]">
                      共起ペア / 判定
                    </th>
                    {/* Period Columns */}
                    {periods.map((p, idx) => {
                      const isLast = idx === periods.length - 1;
                      return (
                        <th
                          key={p.periodKey}
                          className={`p-2 px-3 text-center font-semibold text-[var(--subtle)] border-r border-[var(--border2)]/50 min-w-[70px] ${
                            isLast ? "bg-blue-950/30 text-blue-300" : ""
                          }`}
                        >
                          <div className={isLast ? "font-bold text-[var(--bright)]" : ""}>
                            {p.label}
                          </div>
                          {isLast && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.2 bg-blue-500/25 text-blue-300 font-bold text-[9px] rounded uppercase">
                              集計中
                            </span>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map((r, rIdx) => {
                    const badge = 
                      r.classification === "surging" ? { label: "急増", color: "bg-[#f8514925] text-[#f85149] border-[#f8514955]" } :
                      r.classification === "resurgence" ? { label: "再浮上", color: "bg-amber-500/20 text-amber-300 border-amber-500/40" } :
                      r.classification === "continuing" ? { label: "継続", color: "bg-[#388bfd25] text-[#58a6ff] border-[#388bfd44]" } :
                      { label: "低調", color: "bg-[#21262d] text-[var(--muted)] border-[var(--border)]" };

                    return (
                      <tr key={rIdx} className="border-b border-[var(--border2)]/40 hover:bg-[#ffffff04] transition-colors">
                        {/* Fixed Left Pair Name Column (~96px) */}
                        <td className="p-2 py-2.5 sticky left-0 z-10 bg-[var(--surface)] border-r border-[var(--border)] w-[96px] min-w-[96px] max-w-[96px]">
                          <div className="font-bold text-[var(--bright)] leading-snug line-clamp-2 text-[11px]" title={r.pairKey}>
                            {r.pairKey}
                          </div>
                          <div className="mt-1 flex items-center gap-1">
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${badge.color}`}>
                              {badge.label}
                            </span>
                            <span className="text-[9px] font-mono text-[var(--muted)]">
                              ({r.totalCount})
                            </span>
                          </div>
                        </td>

                        {/* Period Cells */}
                        {periods.map(p => {
                          const count = r.periodCounts[p.periodKey] || 0;
                          const articles = r.periodArticles[p.periodKey] || [];
                          
                          // Color level based on count: 0, 1, 2, 3+
                          const cellBg = 
                            count >= 3 ? "bg-blue-600/40 text-blue-100 font-bold" :
                            count === 2 ? "bg-blue-600/25 text-blue-200 font-semibold" :
                            count === 1 ? "bg-blue-600/10 text-blue-300" :
                            "bg-transparent text-[var(--muted)]/40";

                          return (
                            <td
                              key={p.periodKey}
                              onClick={() => setSelectedCell({ pairKey: r.pairKey, periodKey: p.label, articles })}
                              className={`p-1.5 text-center border-r border-[var(--border2)]/30 cursor-pointer transition-all hover:bg-blue-500/20 h-[38px] min-h-[38px] ${cellBg}`}
                              title={`${r.pairKey} (${p.label}): ${count}件の出現`}
                            >
                              <div className="flex items-center justify-center h-full">
                                {count > 0 ? (
                                  <span className="text-xs font-mono">{count}</span>
                                ) : (
                                  <span className="text-[10px] text-transparent select-none">·</span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {displayedRows.length === 0 && (
                    <tr>
                      <td colSpan={periods.length + 1} className="p-8 text-center text-[var(--muted)]">
                        条件に一致する共起ペアがありません。（設定で閾値を変更してお試しください）
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination / Show More */}
            {filteredAndSortedRows.length > displayRowsLimit && (
              <div className="p-3 bg-[#161b22] border-t border-[var(--border)] text-center shrink-0">
                <button
                  onClick={() => setDisplayRowsLimit(prev => prev + 15)}
                  className="px-4 py-1.5 bg-[#21262d] hover:bg-[#30363d] text-[var(--bright)] font-semibold text-xs rounded-md border border-[var(--border2)] cursor-pointer transition-all"
                >
                  もっと見る (表示中 {displayedRows.length} / 全 {filteredAndSortedRows.length} 行)
                </button>
              </div>
            )}

            {/* Color Legend & Footer Info */}
            <div className="p-3 px-6 bg-[#161b22] border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted)] shrink-0">
              <div className="flex items-center gap-3">
                <span className="font-semibold">セルの凡例:</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-transparent border border-[var(--border2)]"></span> 0件</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-600/10 border border-blue-500/20"></span> 1件</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-600/25 border border-blue-500/40"></span> 2件</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-600/40 border border-blue-500/60"></span> 3件以上</span>
              </div>
              <div>
                表示行数: {displayedRows.length} / 該当総数: {filteredAndSortedRows.length}
              </div>
            </div>

          </div>
        )}

        {/* Bottom Tapped Cell Article Inspector */}
        {selectedCell && (
          <div className="p-4 bg-[#161b22] border border-[var(--border)] rounded-xl shrink-0 max-h-[200px] overflow-y-auto animate-[fadeIn_0.15s_ease-out]">
            <div className="flex justify-between items-center mb-2">
              <div className="text-xs font-bold text-[var(--bright)] flex items-center gap-2">
                <span>📌 選択されたセル:</span>
                <span className="text-blue-400 font-bold">[[{selectedCell.pairKey}]]</span>
                <span className="text-[var(--muted)]">({selectedCell.periodKey})</span>
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 font-bold rounded-full text-[10px]">
                  {selectedCell.articles.length} 記事
                </span>
              </div>
              <button
                onClick={() => setSelectedCell(null)}
                className="text-xs text-[var(--muted)] hover:text-white cursor-pointer"
              >
                ✕ 閉じる
              </button>
            </div>

            {selectedCell.articles.length === 0 ? (
              <div className="text-xs text-[var(--muted)] py-2">この期間の該当記事はありません。</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {selectedCell.articles.map((art, aIdx) => (
                  <div key={aIdx} className="p-2 bg-[#0d1117] rounded border border-[var(--border2)] text-xs">
                    <div className="text-[10px] text-blue-400 font-mono mb-0.5">{art.date}</div>
                    <div className="font-semibold text-[var(--bright)] line-clamp-1" title={art.title}>{art.title}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Settings / Threshold Drawer Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-[#00000080] z-[1200] flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
              <h3 className="text-base font-bold text-[var(--bright)] flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-400" /> ヒートマップ設定と閾値調整
              </h3>
              <div onClick={() => setIsSettingsOpen(false)} className="cursor-pointer text-[var(--muted)] hover:text-white">✕</div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[var(--bright)] mb-1">期間単位 (Unit)</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["1week", "2weeks", "month"] as const).map(u => (
                    <button
                      key={u}
                      onClick={() => setSettings({ ...settings, unit: u })}
                      className={`py-2 rounded-md font-semibold border cursor-pointer transition-all ${
                        settings.unit === u ? "bg-blue-600 text-white border-blue-500" : "bg-[#161b22] text-[var(--subtle)] border-[var(--border2)]"
                      }`}
                    >
                      {u === "1week" ? "1週間" : u === "2weeks" ? "2週間 (デフォルト)" : "1ヶ月"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[var(--bright)] mb-1">表示期間数 (Columns)</label>
                <div className="grid grid-cols-3 gap-2">
                  {[8, 12, 16].map(cnt => (
                    <button
                      key={cnt}
                      onClick={() => setSettings({ ...settings, periodCount: cnt })}
                      className={`py-2 rounded-md font-semibold border cursor-pointer transition-all ${
                        settings.periodCount === cnt ? "bg-blue-600 text-white border-blue-500" : "bg-[#161b22] text-[var(--subtle)] border-[var(--border2)]"
                      }`}
                    >
                      直近 {cnt} 期間
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--border2)]/50">
                <div>
                  <label className="block font-semibold text-[var(--bright)] mb-1">表示最小累計件数</label>
                  <input
                    type="number"
                    value={settings.minTotalCount}
                    onChange={(e) => setSettings({ ...settings, minTotalCount: parseInt(e.target.value, 10) || 1 })}
                    className="w-full bg-[#161b22] border border-[var(--border2)] rounded px-3 py-1.5 text-[var(--bright)]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[var(--bright)] mb-1">表示最小出現期間数</label>
                  <input
                    type="number"
                    value={settings.minPeriodsCount}
                    onChange={(e) => setSettings({ ...settings, minPeriodsCount: parseInt(e.target.value, 10) || 1 })}
                    className="w-full bg-[#161b22] border border-[var(--border2)] rounded px-3 py-1.5 text-[var(--bright)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[var(--bright)] mb-1">急増判定 倍率 (前4期平均比)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={settings.surgingThresholdMult}
                    onChange={(e) => setSettings({ ...settings, surgingThresholdMult: parseFloat(e.target.value) || 2 })}
                    className="w-full bg-[#161b22] border border-[var(--border2)] rounded px-3 py-1.5 text-[var(--bright)]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[var(--bright)] mb-1">急増判定 今期最低件数</label>
                  <input
                    type="number"
                    value={settings.surgingMinCount}
                    onChange={(e) => setSettings({ ...settings, surgingMinCount: parseInt(e.target.value, 10) || 2 })}
                    className="w-full bg-[#161b22] border border-[var(--border2)] rounded px-3 py-1.5 text-[var(--bright)]"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--border2)]/50">
                <label className="block font-semibold text-[var(--bright)] mb-1">除外キーワード（トピックではない種別タグなど）</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="除外したい語を追加..."
                    value={newExcludedInput}
                    onChange={(e) => setNewExcludedInput(e.target.value)}
                    className="flex-1 bg-[#161b22] border border-[var(--border2)] rounded px-3 py-1.5 text-[var(--bright)]"
                  />
                  <button
                    onClick={() => {
                      if (newExcludedInput.trim() && !settings.excludedWords.includes(newExcludedInput.trim())) {
                        setSettings({ ...settings, excludedWords: [...settings.excludedWords, newExcludedInput.trim()] });
                        setNewExcludedInput("");
                      }
                    }}
                    className="px-3 py-1.5 bg-blue-600 text-white font-semibold rounded cursor-pointer"
                  >
                    追加
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-[#161b22] rounded border border-[var(--border2)]">
                  {settings.excludedWords.map(w => (
                    <span key={w} className="px-2 py-0.5 rounded bg-[#21262d] border border-[var(--border2)] text-[11px] flex items-center gap-1">
                      {w}
                      <span
                        onClick={() => setSettings({ ...settings, excludedWords: settings.excludedWords.filter(x => x !== w) })}
                        className="cursor-pointer text-red-400 hover:text-red-300 font-bold ml-0.5"
                      >
                        ×
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--border)] text-right">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs cursor-pointer shadow"
              >
                設定を適用して閉じる
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
