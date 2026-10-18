/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Note } from "../types";
import { getNoteYMD, getFolderFromKeywords, getFolderFromColumnN } from "./graphDataParser";

export type CausalOrigin = "sample" | "gemini" | "external" | "manual";

export interface CausalLink {
  id: string;
  source: string; // 原因 (Cause)
  target: string; // 結果 (Effect)
  periodKey: string; // ISO週 "2026-W42" (月曜始まり)
  weekLabel: string; // "10/12 - 10/18"
  reason: string; // 因果関係の説明
  articleTitle: string;
  articleId: string;
  isNew?: boolean; // 過去の週に登場していない新規エッジかどうか
  origin?: CausalOrigin;
}

export interface WeeklyCausalGroup {
  periodKey: string;
  weekLabel: string;
  links: CausalLink[];
  newLinks: CausalLink[];
  continuingLinks: CausalLink[];
}

// Dummy initial causal links for instant out-of-the-box rich experience
export const DUMMY_CAUSAL_LINKS: CausalLink[] = [
  {
    id: "cl-1",
    source: "電力逼迫",
    target: "地熱・自営電源",
    periodKey: "2026-W42",
    weekLabel: "10/12 - 10/18",
    reason: "夏季の電力需要ピークと系統制約により、安定したベースロード電源としての地熱および地域内自営電源の導入が急務となっている。",
    articleTitle: "次世代半導体AIチップ量産開始と電力供給の課題",
    articleId: "row_2",
    origin: "sample"
  },
  {
    id: "cl-2",
    source: "生成AI普及",
    target: "電力需要急増",
    periodKey: "2026-W42",
    weekLabel: "10/12 - 10/18",
    reason: "データセンターの大規模化に伴い、AI学習・推論時の消費電力が従来の想定を大きく上回って急増している。",
    articleTitle: "データセンター拡大による電力インフラへの影響",
    articleId: "row_3",
    origin: "sample"
  },
  {
    id: "cl-3",
    source: "半導体不足",
    target: "サプライチェーン再構築",
    periodKey: "2026-W41",
    weekLabel: "10/05 - 10/11",
    reason: "地政学リスクと部品調達難を契機に、国内回帰および調達先の複数化を進める動きが加速している。",
    articleTitle: "半導体サプライチェーンの強靭化と調達先多角化",
    articleId: "row_6",
    origin: "sample"
  },
  {
    id: "cl-4",
    source: "炭素税導入",
    target: "蓄電池投資拡大",
    periodKey: "2026-W40",
    weekLabel: "09/28 - 10/04",
    reason: "排出コスト削減のため、工場やプラントでの自家消費型蓄電池およびEMS（エネルギー管理システム）への投資が急増。",
    articleTitle: "再エネ導入と蓄電池の必須化",
    articleId: "row_4",
    origin: "sample"
  },
  {
    id: "cl-5",
    source: "EV普及",
    target: "充電インフラ不足",
    periodKey: "2026-W40",
    weekLabel: "09/28 - 10/04",
    reason: "EVの販売台数が急速に伸びる一方、集合住宅や高速道路での急速充電器の設置数が追いついていない。",
    articleTitle: "EV普及の鍵を握る充電インフラ整備",
    articleId: "row_5",
    origin: "sample"
  }
];

/* ------------------------------------------------------------------ */
/* 週キー (ISO 8601 週。月曜始まり。例: 2026-W42)                       */
/* ------------------------------------------------------------------ */

export function getMondayTimestamp(time: number): number {
  const d = new Date(time);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function getWeekKeyFromTimestamp(time: number): { periodKey: string; weekLabel: string } {
  const monday = new Date(getMondayTimestamp(time));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  // ISO年は「その週の木曜」が属する年
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  const isoYear = thursday.getFullYear();
  const jan4Monday = new Date(getMondayTimestamp(new Date(isoYear, 0, 4).getTime()));
  const week = Math.round((monday.getTime() - jan4Monday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;

  const periodKey = `${isoYear}-W${pad2(week)}`;
  const weekLabel = `${pad2(monday.getMonth() + 1)}/${pad2(monday.getDate())} - ${pad2(sunday.getMonth() + 1)}/${pad2(sunday.getDate())}`;
  return { periodKey, weekLabel };
}

/**
 * 旧形式の週キー (例 "2026-W2-1012") を ISO 形式へ移行する。
 * 旧形式は MMDD が「その週の月曜」なので、そこから再計算できる。
 */
export function migrateLinks(links: CausalLink[]): CausalLink[] {
  return links.map(l => {
    const m = /^(\d{4})-W\d-(\d{2})(\d{2})$/.exec(l.periodKey || "");
    if (!m) return l;
    const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime();
    if (isNaN(t)) return l;
    return { ...l, ...getWeekKeyFromTimestamp(t) };
  });
}

/**
 * ノートの日付をタイムスタンプ化。アプリ共通の getNoteYMD を使う
 * (令和表記・年月日・スラッシュ・ミリ秒・createdAt/updatedAt フォールバックに対応)。
 * 日付が全く取れない場合のみ現在時刻。
 */
export function getNoteTimestamp(note: Note): number {
  const ymd = getNoteYMD(note);
  if (ymd) {
    const [y, m, d] = ymd.split("-").map(Number);
    const t = new Date(y, m - 1, d, 12).getTime();
    if (!isNaN(t)) return t;
  }
  return Date.now();
}

/* ------------------------------------------------------------------ */
/* エッジ同一性 (表記ゆれ吸収) と週次差分                               */
/* ------------------------------------------------------------------ */

export function normalizeTerm(s: string): string {
  return String(s || "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

export function edgeSignature(source: string, target: string): string {
  return `${normalizeTerm(source)}->${normalizeTerm(target)}`;
}

/**
 * 週ごとにグルーピングし、過去の全週に無かったエッジ(=新規)を判定する。
 * 同一週内の同一エッジは1本として数える(最初の1件のみ新規/継続に計上)。
 */
export function computeWeeklyCausalDiffs(allLinks: CausalLink[]): WeeklyCausalGroup[] {
  const periodMap = new Map<string, CausalLink[]>();
  allLinks.forEach(link => {
    if (!periodMap.has(link.periodKey)) periodMap.set(link.periodKey, []);
    periodMap.get(link.periodKey)!.push(link);
  });

  const groups: WeeklyCausalGroup[] = [];
  const historicalSignatures = new Set<string>();
  const periodKeys = Array.from(periodMap.keys()).sort();

  periodKeys.forEach(pk => {
    const links = periodMap.get(pk)!;
    const weekLabel = links[0]?.weekLabel || pk;
    const newLinks: CausalLink[] = [];
    const continuingLinks: CausalLink[] = [];
    const seenThisWeek = new Set<string>();
    const weekSigs: string[] = [];

    links.forEach(l => {
      const sig = edgeSignature(l.source, l.target);
      if (seenThisWeek.has(sig)) return; // 同週の重複は数えない
      seenThisWeek.add(sig);
      if (historicalSignatures.has(sig)) {
        continuingLinks.push({ ...l, isNew: false });
      } else {
        newLinks.push({ ...l, isNew: true });
      }
      weekSigs.push(sig);
    });
    weekSigs.forEach(s => historicalSignatures.add(s)); // 同週内で自己参照しないよう週末にまとめて反映

    groups.push({ periodKey: pk, weekLabel, links, newLinks, continuingLinks });
  });

  return groups.reverse();
}

/** 既存エッジで使われている用語を頻度順に返す (外部AIへの表記統一ヒント用) */
export function collectExistingTerms(links: CausalLink[], limit = 60): string[] {
  const freq = new Map<string, { label: string; n: number }>();
  links.forEach(l => {
    [l.source, l.target].forEach(t => {
      const k = normalizeTerm(t);
      if (!k) return;
      const cur = freq.get(k);
      if (cur) cur.n += 1;
      else freq.set(k, { label: t.trim(), n: 1 });
    });
  });
  return Array.from(freq.values())
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
    .map(v => v.label);
}

/* ------------------------------------------------------------------ */
/* 外部AI向けプロンプト生成                                             */
/* ------------------------------------------------------------------ */

export interface PromptOptions {
  maxChars: number; // 1ノートあたりの本文最大文字数
  existingTerms: string[]; // 空なら表記統一ヒントを出さない
  maxEdgesPerNote: number;
  maxEdgesTotal: number;
}

/** 日付の新しい順に、本文のあるノートを count 件選ぶ (日付不明は最後) */
export function selectRecentNotes(notes: Note[], count: number, folderFilter?: string, folderColumnSource: "D" | "N" = "D"): Note[] {
  let filtered = [...notes];
  if (folderFilter && folderFilter !== "all" && folderFilter.trim() !== "") {
    filtered = filtered.filter(n => {
      const f = folderColumnSource === "N" ? getFolderFromColumnN(n) : getFolderFromKeywords(n.keywords);
      return f === folderFilter;
    });
  }
  return filtered
    .filter(n => String((n as any).summary || (n as any).content || "").trim().length > 0)
    .sort((a, b) => (getNoteYMD(b) || "0000-00-00").localeCompare(getNoteYMD(a) || "0000-00-00"))
    .slice(0, Math.max(1, count));
}

function formatNoteDate(note: Note): string {
  const d = new Date(getNoteTimestamp(note));
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

export function buildExternalPrompt(selected: Note[], opts: PromptOptions): string {
  const body = (n: Note) => {
    const raw = String((n as any).summary || (n as any).content || "").trim();
    return raw.length > opts.maxChars ? raw.slice(0, opts.maxChars) + "…（以下省略）" : raw;
  };

  const termsBlock =
    opts.existingTerms.length > 0
      ? `\n# 既存の用語リスト（表記統一用）\n同じ概念は、下記の表記をそのまま再利用してください。該当しない新しい概念は新しい語で構いません。\n${opts.existingTerms.join(" / ")}\n`
      : "";

  const notesBlock = selected
    .map(
      n =>
        `=== NOTE ===\nID: ${n.id}\n日付: ${formatNoteDate(n)}\nタイトル: ${String((n as any).title || "").trim()}\n本文:\n${body(n)}`
    )
    .join("\n\n");

  return `あなたは日本のビジネス・エネルギー・環境・技術分野のアナリストです。
下記の「ノート」から、方向性のある因果関係（「AがBを招く／引き起こす／促す」）だけを抽出し、JSONで返してください。

# 抽出ルール
1. 本文に根拠がある因果のみ。単なる共起・相関・並列・時系列の前後関係は除外する。
2. source = 原因、target = 結果。向きを必ず守り、逆向きにしない。
3. source / target は 2〜20字程度の名詞句にする（例: 電力逼迫、地熱・自営電源）。文章にしない。動作は名詞化する（「電力需要が急増」→「電力需要急増」）。
4. 同じ概念は同じ語で書く。略語と正式名称を混在させない。
5. 1ノートあたり最大${opts.maxEdgesPerNote}件、全体で最大${opts.maxEdgesTotal}件。重要度の高い順。
6. reason は本文に基づく1〜2文（80字以内）。本文にない推測で補わない。
7. noteId は根拠にしたノートの ID をそのまま書く（複数ある場合は最も主要な1つ）。articleTitle はそのノートのタイトル。
8. 該当する因果が無ければ [] を返す。
${termsBlock}
# 出力形式
JSON配列のみを出力。前後の説明文・挨拶は不要。
[
  {
    "source": "原因の名詞句",
    "target": "結果の名詞句",
    "reason": "根拠に基づく簡潔な説明",
    "noteId": "ノートのID",
    "articleTitle": "ノートのタイトル"
  }
]

# ノート（${selected.length}件）
${notesBlock}
`;
}

/* ------------------------------------------------------------------ */
/* 外部AIの結果の解析                                                   */
/* ------------------------------------------------------------------ */

export interface ParsedEdge {
  source: string;
  target: string;
  reason: string;
  noteId?: string;
  articleTitle?: string;
}

export interface ParseIssue {
  index: number; // 0始まりの要素番号 (-1 は全体)
  message: string;
}

export interface ParseResult {
  edges: ParsedEdge[];
  issues: ParseIssue[];
  duplicatesInPaste: number;
  fatal?: string;
}

const pick = (o: any, keys: string[]): any => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

function tryParseJson(text: string): any {
  const attempts: string[] = [];
  const t = text.trim();
  attempts.push(t);
  const a1 = t.indexOf("["), a2 = t.lastIndexOf("]");
  if (a1 >= 0 && a2 > a1) attempts.push(t.slice(a1, a2 + 1));
  const o1 = t.indexOf("{"), o2 = t.lastIndexOf("}");
  if (o1 >= 0 && o2 > o1) attempts.push(t.slice(o1, o2 + 1));

  const variants = (s: string) => [
    s,
    s.replace(/,\s*([}\]])/g, "$1"), // 末尾カンマ
    s.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, "$1") // スマートクォート
  ];

  for (const a of attempts) {
    for (const v of variants(a)) {
      try {
        return JSON.parse(v);
      } catch {
        /* 次の候補へ */
      }
    }
  }
  throw new Error("JSONとして解析できませんでした");
}

export function parseExternalCausalResult(raw: string): ParseResult {
  const empty: ParseResult = { edges: [], issues: [], duplicatesInPaste: 0 };
  const text = String(raw || "").trim();
  if (!text) return { ...empty, fatal: "貼り付け内容が空です" };

  // ```json ... ``` があれば中身を優先
  const fence = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;

  let data: any;
  try {
    data = tryParseJson(candidate);
  } catch {
    try {
      data = tryParseJson(text);
    } catch (e: any) {
      return { ...empty, fatal: "JSONとして解析できませんでした。AIの出力から [ ] で囲まれた部分をそのまま貼り付けてください。" };
    }
  }

  let arr: any[] | null = null;
  if (Array.isArray(data)) arr = data;
  else if (data && typeof data === "object") {
    const inner = pick(data, ["edges", "links", "causal_links", "causalLinks", "results", "items", "因果リンク"]);
    if (Array.isArray(inner)) arr = inner;
    else if (pick(data, ["source", "cause", "原因"]) !== undefined) arr = [data];
  }
  if (!arr) return { ...empty, fatal: "因果リンクの配列が見つかりませんでした。" };
  if (arr.length === 0) return { ...empty, fatal: "配列が空です（該当する因果は検出されませんでした）。" };

  const edges: ParsedEdge[] = [];
  const issues: ParseIssue[] = [];
  const seen = new Set<string>();
  let duplicatesInPaste = 0;

  arr.forEach((it, i) => {
    if (!it || typeof it !== "object") {
      issues.push({ index: i, message: "オブジェクトではありません" });
      return;
    }
    const source = String(pick(it, ["source", "cause", "from", "原因"]) ?? "").trim();
    const target = String(pick(it, ["target", "effect", "to", "結果"]) ?? "").trim();
    const reason = String(pick(it, ["reason", "rationale", "explanation", "理由", "説明"]) ?? "").trim();
    const noteIdRaw = pick(it, ["noteId", "note_id", "articleId", "article_id", "id"]);
    const noteId = noteIdRaw !== undefined ? String(noteIdRaw).replace(/^ID:\s*/i, "").trim() : undefined;
    const articleTitle = String(pick(it, ["articleTitle", "article_title", "title", "タイトル"]) ?? "").trim() || undefined;

    if (!source || !target) {
      issues.push({ index: i, message: "source または target が空です" });
      return;
    }
    if (normalizeTerm(source) === normalizeTerm(target)) {
      issues.push({ index: i, message: `原因と結果が同じです (${source})` });
      return;
    }
    if (source.length > 60 || target.length > 60) {
      issues.push({ index: i, message: "原因/結果が長すぎます（名詞句にしてください）" });
      return;
    }
    const sig = `${edgeSignature(source, target)}|${noteId || articleTitle || ""}`;
    if (seen.has(sig)) {
      duplicatesInPaste += 1;
      return;
    }
    seen.add(sig);
    edges.push({ source, target, reason, noteId, articleTitle });
  });

  return { edges, issues, duplicatesInPaste };
}

/* ------------------------------------------------------------------ */
/* 解析結果 → CausalLink 変換                                           */
/* ------------------------------------------------------------------ */

export function resolveNoteForEdge(edge: ParsedEdge, notes: Note[]): Note | undefined {
  if (edge.noteId) {
    const hit = notes.find(n => String(n.id) === edge.noteId);
    if (hit) return hit;
  }
  if (edge.articleTitle) {
    const t = normalizeTerm(edge.articleTitle);
    if (t) {
      const exact = notes.find(n => normalizeTerm(String((n as any).title || "")) === t);
      if (exact) return exact;
      const part = notes.find(n => {
        const nt = normalizeTerm(String((n as any).title || ""));
        return nt && (nt.includes(t) || t.includes(nt));
      });
      if (part) return part;
    }
  }
  return undefined;
}

export type WeekMode = "article" | "now";

export interface EdgePlacement {
  note?: Note;
  periodKey: string;
  weekLabel: string;
}

export function placeEdge(edge: ParsedEdge, notes: Note[], weekMode: WeekMode): EdgePlacement {
  const note = resolveNoteForEdge(edge, notes);
  const ts = weekMode === "article" && note ? getNoteTimestamp(note) : Date.now();
  return { note, ...getWeekKeyFromTimestamp(ts) };
}

export function linkKey(l: { source: string; target: string; periodKey: string; articleId: string }): string {
  return `${edgeSignature(l.source, l.target)}|${l.periodKey}|${l.articleId}`;
}

export function edgesToLinks(
  edges: ParsedEdge[],
  notes: Note[],
  weekMode: WeekMode,
  origin: CausalOrigin,
  existing: CausalLink[]
): { links: CausalLink[]; skippedDuplicates: number } {
  const existingKeys = new Set(existing.map(linkKey));
  const links: CausalLink[] = [];
  let skippedDuplicates = 0;
  const stamp = Date.now();

  edges.forEach((e, i) => {
    const p = placeEdge(e, notes, weekMode);
    const link: CausalLink = {
      id: `${origin}-${stamp}-${i}`,
      source: e.source,
      target: e.target,
      periodKey: p.periodKey,
      weekLabel: p.weekLabel,
      reason: e.reason || "（理由なし）",
      articleTitle: p.note ? String((p.note as any).title || "") : e.articleTitle || "（ノート未特定）",
      articleId: p.note ? String(p.note.id) : "",
      origin
    };
    const k = linkKey(link);
    if (existingKeys.has(k)) {
      skippedDuplicates += 1;
      return;
    }
    existingKeys.add(k);
    links.push(link);
  });

  return { links, skippedDuplicates };
}
