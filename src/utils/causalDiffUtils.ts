/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Note } from "../types";

export interface CausalLink {
  id: string;
  source: string; // 原因 (Cause)
  target: string; // 結果 (Effect)
  periodKey: string; // "2026-W41" (Monday based week)
  weekLabel: string; // "2026/10/05 - 10/11"
  reason: string; // 因果関係の説明
  articleTitle: string;
  articleId: string;
  isNew?: boolean; // 過去の週に登場していない新規エッジかどうか
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
    articleId: "row_2"
  },
  {
    id: "cl-2",
    source: "生成AI普及",
    target: "電力需要急増",
    periodKey: "2026-W42",
    weekLabel: "10/12 - 10/18",
    reason: "データセンターの大規模化に伴い、AI学習・推論時の消費電力が従来の想定を大きく上回って急増している。",
    articleTitle: "データセンター拡大による電力インフラへの影響",
    articleId: "row_3"
  },
  {
    id: "cl-3",
    source: "半導体不足",
    target: "サプライチェーン再構築",
    periodKey: "2026-W41",
    weekLabel: "10/05 - 10/11",
    reason: "地政学リスクと部品調達難を契機に、国内回帰および調達先の複数化を進める動きが加速している。",
    articleTitle: "半導体サプライチェーンの強靭化と調達先多角化",
    articleId: "row_6"
  },
  {
    id: "cl-4",
    source: "炭素税導入",
    target: "蓄電池投資拡大",
    periodKey: "2026-W40",
    weekLabel: "09/28 - 10/04",
    reason: "排出コスト削減のため、工場やプラントでの自家消費型蓄電池およびEMS（エネルギー管理システム）への投資が急増。",
    articleTitle: "再エネ導入と蓄電池の必須化",
    articleId: "row_4"
  },
  {
    id: "cl-5",
    source: "EV普及",
    target: "充電インフラ不足",
    periodKey: "2026-W40",
    weekLabel: "09/28 - 10/04",
    reason: "EVの販売台数が急速に伸びる一方、集合住宅や高速道路での急速充電器の設置数が追いついていない。",
    articleTitle: "EV普及の鍵を握る充電インフラ整備",
    articleId: "row_5"
  }
];

export function getMondayTimestamp(time: number): number {
  const d = new Date(time);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function getWeekKeyFromTimestamp(time: number): { periodKey: string; weekLabel: string } {
  const monday = getMondayTimestamp(time);
  const d = new Date(monday);
  const endD = new Date(monday + 6 * 24 * 60 * 60 * 1000);
  
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const periodKey = `${y}-W${Math.ceil(d.getDate() / 7)}-${m}${day}`;

  const weekLabel = `${d.getMonth() + 1}/${d.getDate()} - ${endD.getMonth() + 1}/${endD.getDate()}`;
  return { periodKey, weekLabel };
}

/**
 * Group causal links by week and compute weekly new edges (diff against all preceding weeks)
 */
export function computeWeeklyCausalDiffs(allLinks: CausalLink[]): WeeklyCausalGroup[] {
  const sorted = [...allLinks].sort((a, b) => a.periodKey.localeCompare(b.periodKey));

  const periodMap = new Map<string, CausalLink[]>();

  sorted.forEach(link => {
    if (!periodMap.has(link.periodKey)) {
      periodMap.set(link.periodKey, []);
    }
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

    links.forEach(l => {
      const sig = `${l.source.trim().toLowerCase()}->${l.target.trim().toLowerCase()}`;
      if (!historicalSignatures.has(sig)) {
        historicalSignatures.add(sig);
        newLinks.push({ ...l, isNew: true });
      } else {
        continuingLinks.push({ ...l, isNew: false });
      }
    });

    groups.push({
      periodKey: pk,
      weekLabel,
      links,
      newLinks,
      continuingLinks
    });
  });

  return groups.reverse();
}
