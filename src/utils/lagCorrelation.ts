/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Note } from "../types";
import { extractKeywordsSectionLinks, extractNoteKeywords, getNoteYMD } from "./graphDataParser";
import { normalizeTerm } from "./causalDiffUtils";

/** 用語の数え方 */
export type MatchMode = "keywords" | "keywords+tags" | "text";
/** 前処理 */
export type Preprocess = "raw" | "diff";

export const MATCH_MODE_LABEL: Record<MatchMode, string> = {
  keywords: "【キーワード】欄の [[用語]]（既存グラフと同じ）",
  "keywords+tags": "キーワード欄＋本文[[ ]]＋タグ列",
  text: "タイトル・要約への部分一致"
};

const DAY = 24 * 60 * 60 * 1000;
const MAX_WEEKS = 520; // 異常な日付で週軸が巨大化するのを防ぐ (約10年)

interface PreparedNote {
  week: number; // 週インデックス (0 = 最初の週)
  terms: Set<string>;
  text: string;
}

export interface PreparedData {
  mode: MatchMode;
  weekKeys: string[]; // 各週の月曜 YYYY-MM-DD
  notes: PreparedNote[];
  totalNotes: number;
  datedNotes: number;
  outOfRange: number;
  keywordNotes: number; // 用語を1つ以上持つノート数
  uniqueTerms: number;
  first: string;
  last: string;
}

function ymdToUtc(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function mondayUtc(t: number): number {
  const dow = new Date(t).getUTCDay(); // 0=日
  return t - ((dow + 6) % 7) * DAY;
}

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

function termsOf(note: Note, mode: MatchMode): Set<string> {
  const raw =
    mode === "keywords+tags"
      ? extractNoteKeywords(note)
      : mode === "keywords"
      ? extractKeywordsSectionLinks(String((note as any).summary || ""))
      : [];
  const set = new Set<string>();
  raw.forEach(t => {
    const n = normalizeTerm(t);
    if (n) set.add(n);
  });
  return set;
}

/** ノート群を週インデックス付きに前処理する (用語の数え方を切り替え可能) */
export function prepareNotes(notes: Note[], mode: MatchMode): PreparedData {
  const dated: { ymdT: number; note: Note }[] = [];
  notes.forEach(n => {
    const ymd = getNoteYMD(n);
    if (!ymd) return;
    const t = ymdToUtc(ymd);
    if (!isNaN(t)) dated.push({ ymdT: t, note: n });
  });

  if (dated.length === 0) {
    return {
      mode, weekKeys: [], notes: [], totalNotes: notes.length, datedNotes: 0, outOfRange: 0,
      keywordNotes: 0, uniqueTerms: 0, first: "", last: ""
    };
  }

  let minM = Infinity, maxM = -Infinity;
  dated.forEach(d => {
    const m = mondayUtc(d.ymdT);
    if (m < minM) minM = m;
    if (m > maxM) maxM = m;
  });
  // 週軸が長すぎる場合は新しい側 MAX_WEEKS 週に絞る
  if ((maxM - minM) / (7 * DAY) + 1 > MAX_WEEKS) minM = maxM - (MAX_WEEKS - 1) * 7 * DAY;
  const W = Math.round((maxM - minM) / (7 * DAY)) + 1;
  const weekKeys = Array.from({ length: W }, (_, i) => isoDay(minM + i * 7 * DAY));

  const prepared: PreparedNote[] = [];
  const termUniverse = new Set<string>();
  let keywordNotes = 0;
  let outOfRange = 0;

  dated.forEach(({ ymdT, note }) => {
    const m = mondayUtc(ymdT);
    if (m < minM) {
      outOfRange += 1;
      return;
    }
    const week = Math.round((m - minM) / (7 * DAY));
    const terms = termsOf(note, mode);
    if (terms.size > 0) keywordNotes += 1;
    terms.forEach(t => termUniverse.add(t));
    const text = mode === "text" ? normalizeTerm(`${(note as any).title || ""} ${(note as any).summary || ""}`) : "";
    prepared.push({ week, terms, text });
  });

  return {
    mode,
    weekKeys,
    notes: prepared,
    totalNotes: notes.length,
    datedNotes: dated.length,
    outOfRange,
    keywordNotes,
    uniqueTerms: termUniverse.size,
    first: weekKeys[0],
    last: weekKeys[weekKeys.length - 1]
  };
}

/** 用語が登場したノート数を週ごとに数える (データの無い週は 0) */
export function countWeekly(data: PreparedData, term: string): number[] {
  const t = normalizeTerm(term);
  const out = new Array<number>(data.weekKeys.length).fill(0);
  if (!t) return out;
  data.notes.forEach(n => {
    const hit = data.mode === "text" ? n.text.includes(t) : n.terms.has(t);
    if (hit) out[n.week] += 1;
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* 相関                                                                 */
/* ------------------------------------------------------------------ */

export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return NaN;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  const den = Math.sqrt(sxx * syy);
  return den === 0 ? NaN : sxy / den;
}

const diff = (a: number[]) => a.slice(1).map((v, i) => v - a[i]);

export interface LagRow {
  lag: number; // +k = A が B に k 週先行
  r: number;
  n: number;
  band: number; // 多重比較・自己相関を補正した有意ライン (|r|がこれを超えれば有意)
  significant: boolean;
}

export type Verdict = "forward" | "simultaneous" | "reverse" | "none" | "insufficient";

export interface LagAnalysis {
  status: "ok" | "insufficient";
  reason?: string;
  weeks: number;
  totalA: number;
  totalB: number;
  nzA: number; // 登場した週数
  nzB: number;
  rows: LagRow[];
  peak?: LagRow;
  /** ピークの有意確率 (全ラグから最大を選んだ多重比較と自己相関を補正済み) */
  pValue?: number;
  verdict: Verdict;
}

export const MIN_WEEKS = 8;
export const MIN_TOTAL = 3;
export const MIN_NONZERO_WEEKS = 2;

export const ALPHA = 0.05;

export interface KeywordStat {
  term: string;
  totalCount: number;
  nonzeroWeeks: number;
  weekly: number[];
}

export function getAllKeywordsStats(data: PreparedData): KeywordStat[] {
  const map = new Map<string, number[]>();
  data.notes.forEach(n => {
    n.terms.forEach(t => {
      let arr = map.get(t);
      if (!arr) {
        arr = new Array<number>(data.weekKeys.length).fill(0);
        map.set(t, arr);
      }
      arr[n.week] += 1;
    });
  });

  const stats: KeywordStat[] = [];
  map.forEach((weekly, term) => {
    const totalCount = weekly.reduce((a, b) => a + b, 0);
    const nonzeroWeeks = weekly.filter(v => v > 0).length;
    stats.push({ term, totalCount, nonzeroWeeks, weekly });
  });

  stats.sort((a, b) => b.totalCount - a.totalCount || b.nonzeroWeeks - a.nonzeroWeeks);
  return stats;
}

/** 標準正規の累積分布 (Abramowitz-Stegun 7.1.26 による erf 近似) */
function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** 標準正規の上側分位点 (二分法) */
function normQuantile(p: number): number {
  let lo = 0, hi = 10;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (normCdf(mid) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function autocorr(x: number[], j: number): number {
  const n = x.length;
  if (j >= n - 2) return 0;
  const r = pearson(x.slice(0, n - j), x.slice(j));
  return isNaN(r) ? 0 : r;
}

/**
 * Bartlett の分散補正係数。自己相関のある系列同士の相関は見かけ上ばらつきが大きくなる:
 * Var(r) ≈ (1 + 2 Σ ρx(j)ρy(j)) / n
 */
function bartlettFactor(x: number[], y: number[]): number {
  const m = Math.min(10, Math.floor(x.length / 4));
  let sum = 0;
  for (let j = 1; j <= m; j++) sum += autocorr(x, j) * autocorr(y, j);
  return Math.min(4, Math.max(0.5, 1 + 2 * sum));
}

/**
 * 週次系列 a, b のラグ相関。lag=k>0 は corr(a[t], b[t+k]) = A が B に k 週先行。
 */
export function analyzeLag(a: number[], b: number[], maxLag: number, pre: Preprocess): LagAnalysis {
  const weeks = a.length;
  const sum = (v: number[]) => v.reduce((s, x) => s + x, 0);
  const nz = (v: number[]) => v.filter(x => x > 0).length;
  const base = { weeks, totalA: sum(a), totalB: sum(b), nzA: nz(a), nzB: nz(b) };

  const insufficient = (reason: string): LagAnalysis => ({
    ...base, status: "insufficient", reason, rows: [], verdict: "insufficient"
  });

  if (weeks < MIN_WEEKS) return insufficient(`期間が短すぎます（${weeks}週。${MIN_WEEKS}週以上必要）`);
  if (base.totalA < MIN_TOTAL || base.nzA < MIN_NONZERO_WEEKS)
    return insufficient(`原因側の語の登場が少なすぎます（${base.totalA}件・${base.nzA}週）`);
  if (base.totalB < MIN_TOTAL || base.nzB < MIN_NONZERO_WEEKS)
    return insufficient(`結果側の語の登場が少なすぎます（${base.totalB}件・${base.nzB}週）`);

  const x = pre === "diff" ? diff(a) : a;
  const y = pre === "diff" ? diff(b) : b;
  const N = x.length;
  const L = Math.max(1, Math.min(maxLag, Math.floor(N / 3)));

  const bf = bartlettFactor(x, y);
  const M = 2 * L + 1; // 同時に調べるラグ数
  // Šidák 補正: 全ラグ全体で偽陽性 5% になるよう個別ラグの有意水準を下げる
  const perLagAlpha = 1 - Math.pow(1 - ALPHA, 1 / M);
  const zCrit = normQuantile(1 - perLagAlpha / 2);

  const rows: LagRow[] = [];
  for (let k = -L; k <= L; k++) {
    const xs = k >= 0 ? x.slice(0, N - k) : x.slice(-k);
    const ys = k >= 0 ? y.slice(k) : y.slice(0, N + k);
    const n = xs.length;
    let r = pearson(xs, ys);
    if (isNaN(r)) r = 0;
    const se = Math.sqrt(bf / Math.max(n, 1));
    const band = zCrit * se; // 補正済みの有意ライン
    rows.push({ lag: k, r, n, band, significant: Math.abs(r) > band });
  }

  const peak = rows.reduce((best, cur) => (Math.abs(cur.r) / cur.band > Math.abs(best.r) / best.band ? cur : best), rows[0]);
  const zPeak = Math.abs(peak.r) / Math.sqrt(bf / Math.max(peak.n, 1));
  const pSingle = 2 * (1 - normCdf(zPeak));
  const pValue = Math.min(1, 1 - Math.pow(1 - pSingle, M));

  let verdict: Verdict = "none";
  if (pValue < ALPHA && peak.r > 0) {
    if (peak.lag > 0) verdict = "forward";
    else if (peak.lag === 0) verdict = "simultaneous";
    else verdict = "reverse";
  }
  return { ...base, status: "ok", rows, peak, pValue, verdict };
}

export function formatP(p: number): string {
  return p < 0.001 ? "p<0.001" : `p=${p.toFixed(3)}`;
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  forward: "順向き（Aが先行）",
  simultaneous: "同時期",
  reverse: "逆向き（Bが先行）",
  none: "有意な関係なし",
  insufficient: "データ不足"
};

export function verdictSentence(a: LagAnalysis, source: string, target: string): string {
  if (a.status !== "ok" || !a.peak) return a.reason || "計算できませんでした";
  const p = a.peak;
  const r = p.r.toFixed(2);
  const pv = formatP(a.pValue ?? 1);
  switch (a.verdict) {
    case "forward":
      return `「${source}」の言及は、約${p.lag}週後の「${target}」の言及と最も強く連動しています（r=${r}, ${pv}）。因果の向き（A➔B）と整合しますが、因果の証明ではありません。`;
    case "simultaneous":
      return `「${source}」と「${target}」はほぼ同じ週に連動しています（r=${r}, ${pv}）。先行関係は読み取れません。`;
    case "reverse":
      return `「${target}」のほうが約${-p.lag}週先に動いています（r=${r}, ${pv}）。因果の向きA➔Bとは逆、または共通要因の可能性があります。`;
    default:
      return "偶然では説明しにくい連動（p<0.05）は見つかりませんでした。語の数え方や前処理を変えると見え方が変わる場合があります。";
  }
}
