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
  verdictSentence
} from "../utils/lagCorrelation";

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
  // B[t] を t-shift の位置に描く → B[t+shift] が A[t] と揃う
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

/* ---------------- Panel ---------------- */

const CausalLagPanel: React.FC<Props> = ({ links, notes }) => {
  const [mode, setMode] = useState<MatchMode>("keywords");
  const [pre, setPre] = useState<Preprocess>("diff");
  const [maxLag, setMaxLag] = useState(8);
  const [selKey, setSelKey] = useState("");
  const [shiftOverride, setShiftOverride] = useState<number | null>(null);
  const [batch, setBatch] = useState<{ sig: string; items: { key: string; source: string; target: string; a: LagAnalysis }[] } | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const prepared = useMemo(() => prepareNotes(notes, mode), [notes, mode]);

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

  const selected = edges.find(e => e.key === selKey) || edges[0];

  const seriesA = useMemo(() => (selected ? countWeekly(prepared, selected.source) : []), [prepared, selected]);
  const seriesB = useMemo(() => (selected ? countWeekly(prepared, selected.target) : []), [prepared, selected]);
  const analysis = useMemo(() => analyzeLag(seriesA, seriesB, maxLag, pre), [seriesA, seriesB, maxLag, pre]);

  const condSig = `${mode}|${pre}|${maxLag}|${edges.length}|${notes.length}`;
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

  const pickEdge = (key: string) => {
    setSelKey(key);
    setShiftOverride(null);
    setTimeout(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
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

  if (edges.length === 0) {
    return (
      <div className="max-w-4xl mx-auto text-center text-xs text-[var(--muted)] py-12">
        因果リンクがありません。先に因果リンクを追加してください。
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div ref={topRef} />

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

      {/* 条件 */}
      <div className={cardCls}>
        <h3 className="text-sm font-bold text-[var(--bright)]">⚙ 条件</h3>
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
              <option value="diff">階差（前週との変化）</option>
              <option value="raw">そのまま（件数）</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="block font-semibold text-[var(--bright)]">最大ラグ</span>
            <select value={maxLag} onChange={e => { setMaxLag(Number(e.target.value)); setShiftOverride(null); }} className={selectCls}>
              {[4, 8, 12].map(n => <option key={n} value={n}>±{n}週</option>)}
            </select>
          </label>
        </div>
        <p className="text-[10px] text-[var(--muted)]">
          既定の「階差」は、共通の上昇・下降トレンドによる見せかけの相関を減らします。
        </p>
      </div>

      {/* 個別リンク */}
      <div className={cardCls}>
        <h3 className="text-sm font-bold text-[var(--bright)]">🔗 リンクを選んで確認</h3>
        <select
          value={selected.key}
          onChange={e => { setSelKey(e.target.value); setShiftOverride(null); }}
          className={selectCls}
        >
          {edges.map(e => (
            <option key={e.key} value={e.key}>{e.source} ➔ {e.target}</option>
          ))}
        </select>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--muted)]">
          <span><span className="text-emerald-400 font-bold">A</span> {selected.source}：{analysis.totalA}件・{analysis.nzA}週に登場</span>
          <span><span className="text-blue-400 font-bold">B</span> {selected.target}：{analysis.totalB}件・{analysis.nzB}週に登場</span>
        </div>

        {analysis.status === "insufficient" ? (
          <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-500/30 rounded p-3 leading-relaxed">
            <b>データ不足:</b> {analysis.reason}
            {mode === "keywords" && "。語が【キーワード】欄に載っていない可能性があります。数え方を変えて確認してください。"}
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
            <p className="text-xs text-[var(--text)] leading-relaxed">{verdictSentence(analysis, selected.source, selected.target)}</p>

            <div className="bg-[#0d1117] border border-[var(--border2)] rounded-lg p-2">
              <div className="text-[10px] text-[var(--muted)] mb-1">ラグ相関（橙=有意な正、赤点線=有意ライン、白枠=ピーク）</div>
              <LagBarChart rows={analysis.rows} peak={analysis.peak} />
            </div>

            <div className="bg-[#0d1117] border border-[var(--border2)] rounded-lg p-2 space-y-2">
              <div className="text-[10px] text-[var(--muted)]">週次の言及数（Bをずらして重ねて見る）</div>
              <OverlayChart weekKeys={prepared.weekKeys} a={seriesA} b={seriesB} shift={shift} nameA={selected.source} nameB={selected.target} />
              <div className="flex items-center gap-2 text-xs">
                <input
                  type="range"
                  min={-maxLag}
                  max={maxLag}
                  step={1}
                  value={shift}
                  onChange={e => setShiftOverride(Number(e.target.value))}
                  className="flex-1"
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
      </div>

      {/* 一括判定 */}
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

        {batch && batchFresh && (
          <div className="space-y-2">
            <div className="text-[11px] text-[var(--muted)]">
              {(["forward", "simultaneous", "reverse", "none", "insufficient"] as Verdict[])
                .map(v => `${VERDICT_LABEL[v].split("（")[0]} ${batch.items.filter(i => i.a.verdict === v).length}`)
                .join(" / ")}
            </div>
            <div className="text-[10px] text-[var(--muted)]">
              ※ 多数のリンクを同時に見ると、偶然の当たりが数%混ざります。「順向き」は候補として扱い、元ノートで確認してください。
            </div>
            <div className="space-y-1.5">
              {batch.items.map(it => (
                <button
                  key={it.key}
                  onClick={() => pickEdge(it.key)}
                  className="w-full text-left bg-[#161b22] hover:bg-[#1c2128] border border-[var(--border2)] rounded-lg p-2.5 cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[var(--bright)] min-w-0 break-words">{it.source} ➔ {it.target}</span>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded font-bold text-[9px] ${VERDICT_CLS[it.a.verdict]}`}>{VERDICT_LABEL[it.a.verdict].split("（")[0]}</span>
                  </div>
                  <div className="text-[10px] text-[var(--muted)] mt-0.5">
                    {it.a.status === "ok" && it.a.peak
                      ? `ラグ ${it.a.peak.lag > 0 ? "+" : ""}${it.a.peak.lag}週 / r=${it.a.peak.r.toFixed(2)} / ${formatP(it.a.pValue ?? 1)}`
                      : it.a.reason}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 見方 */}
      <details className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-[11px] text-[var(--muted)] leading-relaxed">
        <summary className="cursor-pointer text-xs font-bold text-[var(--bright)]">見方と注意</summary>
        <ul className="mt-2 space-y-1 list-disc pl-4">
          <li>ラグ +k は「Aの言及が増えたk週後にBの言及が増える」関係の強さです。</li>
          <li>ここで測るのは<b>ニュースでの言及の連動</b>であり、現実の因果の証明ではありません。共通の原因や報道サイクルでも同じ形が出ます。</li>
          <li>有意判定は、全ラグから最大を選んだことの多重比較と、系列の自己相関を補正しています。</li>
          <li>言及が少ない語（合計8件未満・6週未満）や20週未満の期間は判定しません。</li>
          <li>ピークが+側でも、元のノートを読んで因果の根拠を確認してください。</li>
        </ul>
      </details>
    </div>
  );
};

export default CausalLagPanel;
