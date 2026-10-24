/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useRef, useState } from "react";
import { Note } from "../types";
import { CausalLink, edgeSignature } from "../utils/causalDiffUtils";
import {
  LagAnalysis,
  LagRow,
  MATCH_MODE_LABEL,
  MIN_WEEKS,
  MatchMode,
  Preprocess,
  VERDICT_LABEL,
  Verdict,
  analyzeLag,
  countWeekly,
  formatP,
  prepareNotes,
  verdictSentence,
  getAllKeywordsStats,
  scanAllKeywordsLag,
  KeywordScanItem
} from "../utils/lagCorrelation";
import {
  Search,
  ArrowRight,
  Zap,
  TrendingUp,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles
} from "lucide-react";

interface Props {
  links: CausalLink[];
  notes: Note[];
}

const VERDICT_CLS: Record<Verdict, string> = {
  forward: "bg-emerald-500/25 text-emerald-300",
  simultaneous: "bg-blue-500/25 text-blue-300",
  reverse: "bg-orange-500/25 text-orange-300",
  none: "bg-[#30363d] text-[var(--muted)]",
  insufficient: "bg-[#30363d] text-[var(--muted)]"
};

const VERDICT_ORDER: Record<Verdict, number> = { forward: 0, simultaneous: 1, reverse: 2, none: 3, insufficient: 4 };

/* ---------------- Charts (inline SVG) ---------------- */

const LagBarChart: React.FC<{ rows: LagRow[]; peak?: LagRow }> = ({ rows, peak }) => {
  const W = 360, H = 190, ml = 34, mr = 8, mt = 12, mb = 28;
  const iw = W - ml - mr, ih = H - mt - mb;
  const maxAbs = Math.max(0.4, ...rows.map(r => Math.max(Math.abs(r.r), r.band)));
  const ymax = Math.min(1, Math.ceil(maxAbs * 10) / 10 + 0.05);
  const step = iw / rows.length;
  const cx = (i: number) => ml + step * (i + 0.5);
  const y = (v: number) => mt + ih / 2 - (v / ymax) * (ih / 2);
  const bandPath = (sign: 1 | -1) => rows.map((r, i) => `${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${y(sign * r.band).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="ラグ相関の棒グラフ">
      <line x1={ml} x2={W - mr} y1={y(0)} y2={y(0)} stroke="#484f58" strokeWidth="1" />
      {[ymax, ymax / 2, -ymax / 2, -ymax].map((v, i) => (
        <g key={i}>
          <line x1={ml} x2={W - mr} y1={y(v)} y2={y(v)} stroke="#21262d" strokeWidth="1" />
          <text x={ml - 4} y={y(v) + 3} fontSize="9" fill="#8b949e" textAnchor="end">{v.toFixed(2)}</text>
        </g>
      ))}
      <text x={ml - 4} y={y(0) + 3} fontSize="9" fill="#8b949e" textAnchor="end">0</text>
      {rows.map((r, i) => {
        const h = Math.abs(y(r.r) - y(0));
        const top = r.r >= 0 ? y(r.r) : y(0);
        const fill = r.significant ? (r.r > 0 ? "#d29922" : "#f85149") : "#484f58";
        const isPeak = peak && r.lag === peak.lag;
        return (
          <g key={r.lag}>
            <rect x={cx(i) - step * 0.35} y={top} width={step * 0.7} height={Math.max(h, 0.5)} fill={fill}
              stroke={isPeak ? "#ffffff" : "none"} strokeWidth="1.2" rx="1.5" />
            {r.lag % 2 === 0 && (
              <text x={cx(i)} y={H - mb + 13} fontSize="9" fill="#8b949e" textAnchor="middle">
                {r.lag > 0 ? `+${r.lag}` : r.lag}
              </text>
            )}
          </g>
        );
      })}
      <path d={bandPath(1)} fill="none" stroke="#f85149" strokeWidth="1" strokeDasharray="3 3" opacity="0.8" />
      <path d={bandPath(-1)} fill="none" stroke="#f85149" strokeWidth="1" strokeDasharray="3 3" opacity="0.8" />
      <text x={W / 2} y={H - 3} fontSize="9" fill="#8b949e" textAnchor="middle">ラグ（週）　+は「AがBに先行」</text>
    </svg>
  );
};

const OverlayChart: React.FC<{
  weekKeys: string[];
  a: number[];
  b: number[];
  shift: number;
  nameA: string;
  nameB: string;
}> = ({ weekKeys, a, b, shift, nameA, nameB }) => {
  const W = 360, H = 150, ml = 8, mr = 8, mt = 10, mb = 22;
  const iw = W - ml - mr, ih = H - mt - mb;
  const n = a.length;
  const maxA = Math.max(1, ...a), maxB = Math.max(1, ...b);
  const x = (i: number) => ml + (n <= 1 ? 0 : (i / (n - 1)) * iw);
  const y = (v: number) => mt + ih - v * ih;
  const pathA = a.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v / maxA).toFixed(1)}`).join(" ");
  const bPts: string[] = [];
  b.forEach((v, t) => {
    const i = t - shift;
    if (i < 0 || i > n - 1) return;
    bPts.push(`${bPts.length === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v / maxB).toFixed(1)}`);
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="週次言及数の重ね合わせ">
      <line x1={ml} x2={W - mr} y1={y(0)} y2={y(0)} stroke="#484f58" strokeWidth="1" />
      <path d={pathA} fill="none" stroke="#3fb950" strokeWidth="1.6" />
      <path d={bPts.join(" ")} fill="none" stroke="#58a6ff" strokeWidth="1.6" />
      <text x={ml} y={H - 8} fontSize="9" fill="#8b949e">{weekKeys[0]}</text>
      <text x={W - mr} y={H - 8} fontSize="9" fill="#8b949e" textAnchor="end">{weekKeys[n - 1]}</text>
      <text x={W / 2} y={H - 8} fontSize="9" fill="#8b949e" textAnchor="middle">（各系列を最大値で正規化）</text>
      <text x={ml + 2} y={mt + 2} fontSize="9" fill="#3fb950">━ {nameA.length > 14 ? nameA.slice(0, 14) + "…" : nameA}</text>
      <text x={W - mr} y={mt + 2} fontSize="9" fill="#58a6ff" textAnchor="end">
        ━ {nameB.length > 12 ? nameB.slice(0, 12) + "…" : nameB}{shift !== 0 ? `（${shift > 0 ? "−" : "+"}${Math.abs(shift)}週）` : ""}
      </text>
    </svg>
  );
};

/* ---------------- Main Panel Component ---------------- */

const CausalLagPanel: React.FC<Props> = ({ links, notes }) => {
  const [analysisType, setAnalysisType] = useState<"causal" | "keyword-pair" | "scan">("scan");
  const [mode, setMode] = useState<MatchMode>("keywords");
  const [pre, setPre] = useState<Preprocess>("diff");
  const [maxLag, setMaxLag] = useState(8);
  const [selKey, setSelKey] = useState("");
  const [keywordA, setKeywordA] = useState("");
  const [keywordB, setKeywordB] = useState("");
  const [shiftOverride, setShiftOverride] = useState<number | null>(null);
  const [batch, setBatch] = useState<{ sig: string; items: { key: string; source: string; target: string; a: LagAnalysis }[] } | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  // 全キーワード自動スキャン用 State
  const [scanResult, setScanResult] = useState<{
    items: KeywordScanItem[];
    totalCandidates: number;
    totalPairs: number;
    analyzedPairs: number;
    sig: string;
  } | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanMinCount, setScanMinCount] = useState<number>(3);
  const [scanFilter, setScanFilter] = useState<"all" | "significant" | "lead" | "positive">("all");
  const [scanSort, setScanSort] = useState<"abs_r" | "pos_r" | "p_value" | "lag">("abs_r");
  const [scanSearch, setScanSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(30);

  const prepared = useMemo(() => prepareNotes(notes, mode), [notes, mode]);
  const keywordStats = useMemo(() => getAllKeywordsStats(prepared), [prepared]);

  React.useEffect(() => {
    if (keywordStats.length >= 2) {
      if (!keywordA) setKeywordA(keywordStats[0].term);
      if (!keywordB) setKeywordB(keywordStats[1].term);
    }
  }, [keywordStats]);

  const edges = useMemo(() => {
    const map = new Map<string, { key: string; source: string; target: string; count: number }>();
    links.forEach(l => {
      const key = edgeSignature(l.source, l.target);
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { key, source: l.source, target: l.target, count: 1 });
    });
    return Array.from(map.values());
  }, [links]);

  const selectedEdge = edges.find(e => e.key === selKey) || edges[0];

  const sourceName = analysisType === "causal" ? (selectedEdge ? selectedEdge.source : "") : keywordA;
  const targetName = analysisType === "causal" ? (selectedEdge ? selectedEdge.target : "") : keywordB;

  const seriesA = useMemo(() => (sourceName ? countWeekly(prepared, sourceName) : []), [prepared, sourceName]);
  const seriesB = useMemo(() => (targetName ? countWeekly(prepared, targetName) : []), [prepared, targetName]);
  const analysis = useMemo(() => analyzeLag(seriesA, seriesB, maxLag, pre), [seriesA, seriesB, maxLag, pre]);

  const condSig = `${analysisType}|${sourceName}|${targetName}|${mode}|${pre}|${maxLag}|${notes.length}`;
  const batchFresh = batch && batch.sig === condSig;

  const shift = shiftOverride !== null ? shiftOverride : analysis.peak ? analysis.peak.lag : 0;

  const runBatch = () => {
    setBatchBusy(true);
    setTimeout(() => {
      const cache = new Map<string, number[]>();
      const series = (term: string) => {
        if (!cache.has(term)) cache.set(term, countWeekly(prepared, term));
        return cache.get(term)!;
      };
      const items = edges.map(e => ({
        key: e.key, source: e.source, target: e.target,
        a: analyzeLag(series(e.source), series(e.target), maxLag, pre)
      }));
      items.sort((p, q) => {
        const d = VERDICT_ORDER[p.a.verdict] - VERDICT_ORDER[q.a.verdict];
        if (d !== 0) return d;
        return Math.abs(q.a.peak?.r || 0) - Math.abs(p.a.peak?.r || 0);
      });
      setBatch({ sig: condSig, items });
      setBatchBusy(false);
    }, 30);
  };

  // 全キーワード自動スキャンの実行
  const handleRunScan = () => {
    setScanBusy(true);
    setTimeout(() => {
      const res = scanAllKeywordsLag(prepared, {
        minCount: scanMinCount,
        minNonzeroWeeks: 2,
        maxLag,
        pre,
        maxCandidates: 60
      });
      setScanResult({
        ...res,
        sig: `${mode}|${pre}|${maxLag}|${scanMinCount}|${notes.length}`
      });
      setScanBusy(false);
      setVisibleCount(30);
    }, 40);
  };

  // スキャン結果の絞り込みとソート
  const filteredScanItems = useMemo(() => {
    if (!scanResult) return [];
    let list = scanResult.items;

    if (scanSearch.trim()) {
      const q = scanSearch.trim().toLowerCase();
      list = list.filter(item =>
        item.termA.toLowerCase().includes(q) ||
        item.termB.toLowerCase().includes(q)
      );
    }

    if (scanFilter === "significant") {
      list = list.filter(item => item.significant);
    } else if (scanFilter === "lead") {
      list = list.filter(item => item.peakLag > 0);
    } else if (scanFilter === "positive") {
      list = list.filter(item => item.peakR > 0);
    }

    const sorted = [...list];
    if (scanSort === "abs_r") {
      sorted.sort((a, b) => Math.abs(b.peakR) - Math.abs(a.peakR));
    } else if (scanSort === "pos_r") {
      sorted.sort((a, b) => b.peakR - a.peakR);
    } else if (scanSort === "p_value") {
      sorted.sort((a, b) => a.pValue - b.pValue || Math.abs(b.peakR) - Math.abs(a.peakR));
    } else if (scanSort === "lag") {
      sorted.sort((a, b) => b.peakLag - a.peakLag || Math.abs(b.peakR) - Math.abs(a.peakR));
    }

    return sorted;
  }, [scanResult, scanSearch, scanFilter, scanSort]);

  // ランキング項目をクリックして詳細グラフへジャンプ
  const handleInspectPair = (termA: string, termB: string, rawLag: number) => {
    setAnalysisType("keyword-pair");
    setKeywordA(termA);
    setKeywordB(termB);
    setShiftOverride(rawLag);
    setTimeout(() => {
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  const datedPct = prepared.totalNotes > 0 ? Math.round((prepared.datedNotes / prepared.totalNotes) * 100) : 0;
  const warnings: string[] = [];
  if (prepared.totalNotes > 0 && prepared.datedNotes < prepared.totalNotes)
    warnings.push(`日付を読み取れないノートが ${prepared.totalNotes - prepared.datedNotes}件あり、集計から除外しています`);
  if (prepared.outOfRange > 0) warnings.push(`期間が長すぎるため古い ${prepared.outOfRange}件を除外しました`);
  if (prepared.weekKeys.length > 0 && prepared.weekKeys.length < MIN_WEEKS)
    warnings.push(`期間が ${prepared.weekKeys.length}週しかありません（${MIN_WEEKS}週以上で判定できます）`);
  if (mode !== "text" && prepared.datedNotes > 0 && prepared.keywordNotes === 0)
    warnings.push("用語を持つノートがありません。数え方を「タイトル・要約への部分一致」に変えてみてください");

  const cardCls = "bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3";
  const selectCls = "w-full bg-[#161b22] border border-[var(--border2)] rounded px-2 py-2 text-xs text-[var(--bright)]";

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div ref={topRef} />

      {/* 分析モード切り替えタブ (3パターン) */}
      <div className="flex flex-wrap items-center gap-1.5 bg-[#161b22] p-1.5 rounded-xl border border-[var(--border)]">
        <button
          onClick={() => { setAnalysisType("scan"); }}
          className={`flex-1 min-w-[130px] py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            analysisType === "scan" ? "bg-purple-600 text-white shadow-md" : "text-[var(--muted)] hover:text-white"
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>⚡ 全自動スキャン・ランキング</span>
        </button>
        <button
          onClick={() => { setAnalysisType("keyword-pair"); setShiftOverride(null); }}
          className={`flex-1 min-w-[130px] py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            analysisType === "keyword-pair" ? "bg-emerald-600 text-white shadow-md" : "text-[var(--muted)] hover:text-white"
          }`}
        >
          <span>🔑 2語を手動で比較（{keywordStats.length}語）</span>
        </button>
        <button
          onClick={() => { setAnalysisType("causal"); setShiftOverride(null); }}
          className={`flex-1 min-w-[130px] py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            analysisType === "causal" ? "bg-blue-600 text-white shadow-md" : "text-[var(--muted)] hover:text-white"
          }`}
        >
          <span>🔗 因果リンクを分析（{edges.length}件）</span>
        </button>
      </div>

      {/* データ診断 */}
      <div className={cardCls}>
        <h3 className="text-sm font-bold text-[var(--bright)]">📊 データ診断</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          {[
            ["ノート", `${prepared.totalNotes.toLocaleString()}件`],
            ["日付あり", `${prepared.datedNotes.toLocaleString()}件 (${datedPct}%)`],
            ["期間", prepared.first ? `${prepared.weekKeys.length}週` : "—"],
            ["用語を持つノート", `${prepared.keywordNotes.toLocaleString()}件`]
          ].map(([k, v]) => (
            <div key={k} className="bg-[#161b22] rounded-lg p-2 border border-[var(--border2)]">
              <div className="text-[10px] text-[var(--muted)]">{k}</div>
              <div className="text-xs font-bold text-[var(--bright)]">{v}</div>
            </div>
          ))}
        </div>
        {prepared.first && (
          <div className="text-[11px] text-[var(--muted)]">
            {prepared.first} 〜 {prepared.last}（週は月曜始まり）／ ユニーク用語 {prepared.uniqueTerms.toLocaleString()}
          </div>
        )}
        {warnings.map((w, i) => (
          <div key={i} className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-500/30 rounded p-2">{w}</div>
        ))}
      </div>

      {/* 条件設定 */}
      <div className={cardCls}>
        <h3 className="text-sm font-bold text-[var(--bright)]">⚙ 集計・分析条件</h3>
        <label className="block space-y-1 text-xs">
          <span className="font-semibold text-[var(--bright)]">用語の数え方</span>
          <select value={mode} onChange={e => { setMode(e.target.value as MatchMode); setShiftOverride(null); }} className={selectCls}>
            {(Object.keys(MATCH_MODE_LABEL) as MatchMode[]).map(m => <option key={m} value={m}>{MATCH_MODE_LABEL[m]}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <label className="space-y-1">
            <span className="block font-semibold text-[var(--bright)]">前処理</span>
            <select value={pre} onChange={e => { setPre(e.target.value as Preprocess); setShiftOverride(null); }} className={selectCls}>
              <option value="diff">階差（前週との変化・トレンド除去）</option>
              <option value="raw">そのまま（週次言及数）</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="block font-semibold text-[var(--bright)]">最大ラグ範囲</span>
            <select value={maxLag} onChange={e => { setMaxLag(Number(e.target.value)); setShiftOverride(null); }} className={selectCls}>
              {[4, 8, 12].map(n => <option key={n} value={n}>±{n}週</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* ---------------- モード 1: 全自動スキャン & ランキング ---------------- */}
      {analysisType === "scan" && (
        <div className={cardCls}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
            <div>
              <h3 className="text-sm font-bold text-purple-300 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-purple-400" />
                <span>全キーワード自動スキャン & 先行・後続ランキング</span>
              </h3>
              <p className="text-[11px] text-[var(--muted)] mt-0.5">
                登録されたキーワードの全組み合わせを総当たりで計算し、時間差で連動するペアを特定します。
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunScan}
              disabled={scanBusy || keywordStats.length < 2}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-all shadow-md flex items-center gap-2 cursor-pointer shrink-0"
            >
              <Zap className={`w-3.5 h-3.5 ${scanBusy ? "animate-spin" : ""}`} />
              <span>{scanBusy ? "全ペア計算中..." : scanResult ? "再スキャンする" : "⚡ 自動スキャンを実行"}</span>
            </button>
          </div>

          {/* スキャン前の案内 または スキャン結果 */}
          {!scanResult ? (
            <div className="bg-[#12161c] border border-[var(--border2)] rounded-lg p-6 text-center space-y-3">
              <Sparkles className="w-8 h-8 text-purple-400 mx-auto opacity-70" />
              <div className="text-xs text-[var(--bright)] font-semibold">
                ボタンを押すと、候補となるキーワード（{keywordStats.filter(s => s.totalCount >= scanMinCount).length}語）の全ペアを自動計算します
              </div>
              <p className="text-[11px] text-[var(--muted)] max-w-lg mx-auto">
                各キーワードの週次出現系列をキャッシュして一括計算するため、通常1秒以内に完了します。
                見つかった候補から「詳細グラフ」を開いて波形を確認できます。
              </p>
              <div className="flex items-center justify-center gap-2 pt-1 text-xs">
                <span className="text-[var(--muted)]">分析対象の最小出現数:</span>
                <select
                  value={scanMinCount}
                  onChange={e => setScanMinCount(Number(e.target.value))}
                  className="bg-[#161b22] border border-[var(--border2)] rounded px-2 py-1 text-xs text-[var(--bright)]"
                >
                  <option value={2}>2件以上（より多くの候補）</option>
                  <option value={3}>3件以上（推奨・ノイズ除去）</option>
                  <option value={5}>5件以上（高頻度語のみ）</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* スキャン概要バッジ */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-[#161b22] rounded-lg border border-[var(--border2)] text-xs">
                <div className="flex items-center gap-3 text-[11px] text-[var(--muted)]">
                  <span>対象語: <b className="text-[var(--bright)]">{scanResult.totalCandidates}語</b></span>
                  <span>総ペア: <b className="text-[var(--bright)]">{scanResult.totalPairs.toLocaleString()}組</b></span>
                  <span>計算完了: <b className="text-emerald-400">{scanResult.analyzedPairs.toLocaleString()}組</b></span>
                </div>
                <div className="text-[11px] text-[var(--muted)]">
                  ヒット: <b className="text-purple-300">{filteredScanItems.length}件</b>
                </div>
              </div>

              {/* フィルター & ソート バー */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                {/* キーワード検索 */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="キーワードで絞り込み..."
                    value={scanSearch}
                    onChange={e => setScanSearch(e.target.value)}
                    className="w-full bg-[#161b22] border border-[var(--border2)] rounded pl-8 pr-3 py-1.5 text-xs text-[var(--bright)] placeholder-[var(--muted)] focus:outline-none focus:border-purple-500"
                  />
                </div>

                {/* 絞り込み条件 */}
                <select
                  value={scanFilter}
                  onChange={e => setScanFilter(e.target.value as any)}
                  className="bg-[#161b22] border border-[var(--border2)] rounded px-2 py-1.5 text-xs text-[var(--bright)]"
                >
                  <option value="all">すべての関係を表示</option>
                  <option value="significant">有意な相関のみ (p &lt; 0.05)</option>
                  <option value="lead">時間差のある先行関係のみ (ラグ≠0)</option>
                  <option value="positive">正の相関のみ (r &gt; 0)</option>
                </select>

                {/* 並び替え */}
                <select
                  value={scanSort}
                  onChange={e => setScanSort(e.target.value as any)}
                  className="bg-[#161b22] border border-[var(--border2)] rounded px-2 py-1.5 text-xs text-[var(--bright)]"
                >
                  <option value="abs_r">相関の強さ順 (|r| 降順)</option>
                  <option value="pos_r">正の相関順 (r 降順)</option>
                  <option value="p_value">統計的有意性順 (p 昇順)</option>
                  <option value="lag">先行週数の大きさ順 (ラグ 降順)</option>
                </select>
              </div>

              {/* ランキング一覧 */}
              {filteredScanItems.length === 0 ? (
                <div className="bg-[#12161c] border border-[var(--border2)] rounded-lg p-6 text-center text-xs text-[var(--muted)]">
                  条件に一致するキーワードペアがありませんでした。
                </div>
              ) : (
                <div className="space-y-2.5 pt-1">
                  {filteredScanItems.slice(0, visibleCount).map((item, idx) => {
                    const isPositive = item.peakR > 0;
                    return (
                      <div
                        key={item.id}
                        className="p-3 bg-[#12161c] hover:bg-[#161b22] border border-[var(--border2)] hover:border-gray-600 rounded-lg transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
                      >
                        <div className="space-y-1.5 min-w-0 flex-1">
                          {/* 順位 & 先行 ➔ 後続 表示 */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="w-6 h-5 rounded bg-[#21262d] text-gray-300 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                              #{idx + 1}
                            </span>

                            {item.direction === "simultaneous" ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-xs text-blue-300 bg-blue-950/40 px-2 py-0.5 rounded border border-blue-500/30">
                                  {item.termA}
                                </span>
                                <span className="text-[10px] text-gray-400">⬌</span>
                                <span className="font-bold text-xs text-blue-300 bg-blue-950/40 px-2 py-0.5 rounded border border-blue-500/30">
                                  {item.termB}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-semibold">
                                  同時連動 (0週)
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-xs text-emerald-300 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                                  <span className="text-[9px] text-emerald-400 font-bold">先行</span>
                                  {item.leader}
                                </span>
                                <ArrowRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span className="font-bold text-xs text-blue-300 bg-blue-950/40 px-2 py-0.5 rounded border border-blue-500/30 flex items-center gap-1">
                                  <span className="text-[9px] text-blue-400 font-bold">後続</span>
                                  {item.follower}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                                  +{item.peakLag}週 先行
                                </span>
                              </div>
                            )}

                            {item.significant && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                                有意 (p &lt; 0.05)
                              </span>
                            )}
                          </div>

                          {/* 統計指標 pills */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--muted)]">
                            <span>
                              相関係数:{" "}
                              <b className={isPositive ? "text-emerald-400" : "text-rose-400"}>
                                r = {item.peakR > 0 ? `+${item.peakR.toFixed(2)}` : item.peakR.toFixed(2)}
                              </b>
                            </span>
                            <span>p値: <b>{formatP(item.pValue)}</b></span>
                            <span className="text-gray-400">
                              出現: {item.termA} ({item.countA}件/{item.nzA}週) ⬌ {item.termB} ({item.countB}件/{item.nzB}週)
                            </span>
                          </div>
                        </div>

                        {/* アクション: 詳細グラフを見る */}
                        <button
                          type="button"
                          onClick={() => handleInspectPair(item.termA, item.termB, item.rawLag)}
                          className="shrink-0 px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] text-blue-400 hover:text-white font-semibold text-xs rounded-md border border-[var(--border2)] transition-colors cursor-pointer flex items-center gap-1"
                          title="この2語を詳細画面にセットし、週次言及の重ね合わせグラフとスライダーを確認します"
                        >
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span>詳細グラフ</span>
                        </button>
                      </div>
                    );
                  })}

                  {/* もっと見る ボタン */}
                  {filteredScanItems.length > visibleCount && (
                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={() => setVisibleCount(prev => prev + 30)}
                        className="px-4 py-1.5 bg-[#21262d] hover:bg-[#30363d] text-xs text-[var(--bright)] rounded-md border border-[var(--border2)] transition-colors cursor-pointer"
                      >
                        さらに表示（残り {filteredScanItems.length - visibleCount}件）
                      </button>
                    </div>
                  )}

                  {/* 統計上の注意書き */}
                  <div className="p-2.5 bg-[#0d1117] rounded-lg border border-[var(--border2)] text-[10px] text-[var(--muted)] leading-relaxed">
                    💡 <b>統計解釈の注意事項</b>:
                    上記は記事の週次言及数をもとに計算された「時間的な連動・先行の統計的候補」です。
                    共通の社会動向（外生要因）による見せかけの相関も含まれ得るため、因果関係の証明ではありません。「詳細グラフ」を開いて実際の波形と記事内容を確認してください。
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------------- モード 2: 2語を手動で比較 / モード 3: 因果リンク分析 ---------------- */}
      {(analysisType === "causal" || analysisType === "keyword-pair") && (
        <div className={cardCls}>
          {analysisType === "causal" ? (
            <>
              <h3 className="text-sm font-bold text-[var(--bright)]">🔗 リンクを選んで確認</h3>
              {edges.length === 0 ? (
                <div className="text-xs text-[var(--muted)] py-4 text-center">因果リンクがありません。</div>
              ) : (
                <select
                  value={selectedEdge?.key || ""}
                  onChange={e => { setSelKey(e.target.value); setShiftOverride(null); }}
                  className={selectCls}
                >
                  {edges.map(e => (
                    <option key={e.key} value={e.key}>{e.source} ➔ {e.target}</option>
                  ))}
                </select>
              )}
            </>
          ) : (
            <>
              <h3 className="text-sm font-bold text-[var(--bright)]">🔑 記事キーワードのペアを自由に選んでラグ分析</h3>
              <p className="text-[11px] text-[var(--muted)]">
                抽出されたキーワード群から2語を選び、タイムラグを持った連動関係をグラフとスライダーで検証できます。
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1 text-xs">
                  <span className="font-semibold text-emerald-400">A（原因・先行候補）</span>
                  <select
                    value={keywordA}
                    onChange={e => { setKeywordA(e.target.value); setShiftOverride(null); }}
                    className={selectCls}
                  >
                    {keywordStats.map(s => (
                      <option key={s.term} value={s.term}>
                        {s.term}（計{s.totalCount}件 / {s.nonzeroWeeks}週）
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-semibold text-blue-400">B（結果・後行候補）</span>
                  <select
                    value={keywordB}
                    onChange={e => { setKeywordB(e.target.value); setShiftOverride(null); }}
                    className={selectCls}
                  >
                    {keywordStats.map(s => (
                      <option key={s.term} value={s.term}>
                        {s.term}（計{s.totalCount}件 / {s.nonzeroWeeks}週）
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}

          {(analysisType === "causal" && edges.length > 0) || (analysisType === "keyword-pair" && keywordA && keywordB) ? (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--muted)] pt-2">
                <span><span className="text-emerald-400 font-bold">A</span> {sourceName}：{analysis.totalA}件・{analysis.nzA}週に登場</span>
                <span><span className="text-blue-400 font-bold">B</span> {targetName}：{analysis.totalB}件・{analysis.nzB}週に登場</span>
              </div>

              {analysis.status === "insufficient" ? (
                <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-500/30 rounded p-3 leading-relaxed">
                  <b>データ不足:</b> {analysis.reason}
                  {mode === "keywords" && "。語が【キーワード】欄に載っていない可能性があります。数え方を「タイトル・要約への部分一致」に変えてみてください。"}
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${VERDICT_CLS[analysis.verdict]}`}>{VERDICT_LABEL[analysis.verdict]}</span>
                    {analysis.peak && (
                      <span className="text-[11px] text-[var(--muted)]">
                        ピーク: ラグ {analysis.peak.lag > 0 ? `+${analysis.peak.lag}` : analysis.peak.lag}週 / r={analysis.peak.r.toFixed(2)} / {formatP(analysis.pValue ?? 1)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text)] leading-relaxed">{verdictSentence(analysis, sourceName, targetName)}</p>

                  <div className="bg-[#0d1117] border border-[var(--border2)] rounded-lg p-2">
                    <div className="text-[10px] text-[var(--muted)] mb-1">ラグ相関（橙=有意な正、赤点線=有意ライン、白枠=ピーク）</div>
                    <LagBarChart rows={analysis.rows} peak={analysis.peak} />
                  </div>

                  <div className="bg-[#0d1117] border border-[var(--border2)] rounded-lg p-2 space-y-2">
                    <div className="text-[10px] text-[var(--muted)]">週次の言及数（Bをずらして重ねて見る）</div>
                    <OverlayChart weekKeys={prepared.weekKeys} a={seriesA} b={seriesB} shift={shift} nameA={sourceName} nameB={targetName} />
                    <div className="flex items-center gap-2 text-xs">
                      <input
                        type="range"
                        min={-maxLag}
                        max={maxLag}
                        step={1}
                        value={shift}
                        onChange={e => setShiftOverride(Number(e.target.value))}
                        className="flex-1 cursor-pointer"
                      />
                      <span className="w-24 text-right text-[var(--bright)] font-bold">B を {shift > 0 ? `${shift}週戻す` : shift < 0 ? `${-shift}週進める` : "ずらさない"}</span>
                    </div>
                    {analysis.peak && shift !== analysis.peak.lag && (
                      <button onClick={() => setShiftOverride(null)} className="text-[11px] text-blue-400 underline cursor-pointer">
                        ピーク（{analysis.peak.lag > 0 ? `+${analysis.peak.lag}` : analysis.peak.lag}週）に合わせる
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* 一括判定 (因果リンクモードのみ) */}
      {analysisType === "causal" && edges.length > 0 && (
        <div className={cardCls}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-[var(--bright)]">📋 全リンクを一括判定（{edges.length}本）</h3>
            <button
              onClick={runBatch}
              disabled={batchBusy}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-md cursor-pointer"
            >
              {batchBusy ? "計算中..." : batchFresh ? "再計算" : "計算する"}
            </button>
          </div>

          {batch && !batchFresh && (
            <div className="text-[11px] text-amber-300">条件やデータが変わりました。「計算する」で更新してください。</div>
          )}

          {batch && (
            <div className="space-y-2 pt-2 max-h-80 overflow-y-auto">
              {batch.items.map(item => (
                <div key={item.key} className="bg-[#161b22] border border-[var(--border2)] rounded-lg p-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-bold text-[var(--bright)] truncate">
                      {item.source} ➔ {item.target}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[var(--muted)]">
                      <span className={`px-1.5 py-0.5 rounded font-bold ${VERDICT_CLS[item.a.verdict]}`}>
                        {VERDICT_LABEL[item.a.verdict]}
                      </span>
                      {item.a.peak && <span>ピーク: {item.a.peak.lag > 0 ? `+${item.a.peak.lag}` : item.a.peak.lag}週 (r={item.a.peak.r.toFixed(2)})</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const found = edges.find(e => e.key === item.key);
                      if (found) {
                        setSelKey(found.key);
                        setShiftOverride(null);
                        topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    }}
                    className="shrink-0 px-2.5 py-1 bg-[#21262d] hover:bg-[#30363d] text-blue-400 font-semibold rounded text-[11px] border border-[var(--border2)] cursor-pointer"
                  >
                    詳細
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CausalLagPanel;
