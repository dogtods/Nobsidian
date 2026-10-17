/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PairHeatmapRow {
  pairKey: string; // "A × B"
  source: string;
  target: string;
  coOccurCount: number;
  jaccardCorrelation: number;
  folders: string[];
  dates: string[];
  articleTitles: string[];
}

export interface PeriodColumn {
  periodKey: string; // e.g. "2026-W41" or "2026-10-06"
  label: string; // "10/05 - 10/18"
  startDate: number; // timestamp
  endDate: number; // timestamp
  isCurrent?: boolean;
}

export interface PairPeriodData {
  pairKey: string;
  source: string;
  target: string;
  jaccard: number;
  totalCount: number;
  periodCounts: { [periodKey: string]: number };
  periodArticles: { [periodKey: string]: Array<{ date: string; title: string }> };
  classification: "new" | "surging" | "resurgence" | "continuing" | "low";
  recentPeriodsCount: number; // count in last 3 periods
  lastPeriodCount: number;
  prev4PeriodsAvg: number;
}

export interface HeatmapSettings {
  unit: "2weeks" | "1week" | "month";
  periodCount: number; // 8, 12, or 999 (all)
  excludedWords: string[];
  minTotalCount: number;
  minPeriodsCount: number;
  searchQuery: string;
  sortBy: "surging-priority" | "total" | "jaccard";
  surgingThresholdMult: number;
  surgingMinCount: number;
}

// Default excluded words as per user specs
export const DEFAULT_EXCLUDED_WORDS = ["産業動向", "実務対応", "サステナビリティ", "情報開示"];

/**
 * Parse raw co-occurrence CSV string into PairHeatmapRow[]
 */
export function parseCoOccurCsv(csvText: string): PairHeatmapRow[] {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length <= 1) return [];

  const rows: PairHeatmapRow[] = [];
  // Simple CSV parser handling quotes
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cols = parseCsvLine(line);
    if (cols.length < 7) continue;

    const source = cols[0].trim();
    const target = cols[1].trim();
    const coOccurCount = parseInt(cols[2], 10) || 0;
    const jaccardCorrelation = parseFloat(cols[3]) || 0;
    const folders = cols[4].split(";").map(s => s.trim()).filter(Boolean);
    const dates = cols[5].split(";").map(s => s.trim()).filter(Boolean);
    const articleTitles = cols[6].split(";").map(s => s.trim()).filter(Boolean);

    if (!source || !target) continue;

    rows.push({
      pairKey: `${source} × ${target}`,
      source,
      target,
      coOccurCount,
      jaccardCorrelation,
      folders,
      dates,
      articleTitles
    });
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

/**
 * Get Monday timestamp for a given date
 */
export function getMondayTimestamp(time: number): number {
  const d = new Date(time);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Generate period columns (e.g. 2-week periods starting Monday)
 */
export function generatePeriods(unit: "2weeks" | "1week" | "month", count: number, maxDateMs: number = Date.now()): PeriodColumn[] {
  const periods: PeriodColumn[] = [];
  const msPerDay = 24 * 60 * 60 * 1000;
  const unitDays = unit === "1week" ? 7 : unit === "2weeks" ? 14 : 30;
  const unitMs = unitDays * msPerDay;

  // Align latest period start to Monday
  let currentStart = getMondayTimestamp(maxDateMs);
  // If unit is 2weeks or month, align accordingly
  if (unit === "2weeks") {
    // ensure alignment to 2-week blocks from a fixed epoch or just step backwards
    const epochMonday = getMondayTimestamp(new Date(2026, 0, 5).getTime()); // Jan 5 2026 Monday
    const diffWeeks = Math.floor((currentStart - epochMonday) / (14 * msPerDay));
    currentStart = epochMonday + diffWeeks * 14 * msPerDay;
  } else if (unit === "month") {
    const d = new Date(maxDateMs);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    currentStart = d.getTime();
  }

  // Generate backwards for `count` periods
  let start = currentStart;
  for (let i = 0; i < count; i++) {
    const end = start + unitMs - 1;
    const startDateObj = new Date(start);
    const endDateObj = new Date(end);
    
    const label = `${startDateObj.getMonth() + 1}/${startDateObj.getDate()} - ${endDateObj.getMonth() + 1}/${endDateObj.getDate()}`;
    const periodKey = `${startDateObj.getFullYear()}-${String(startDateObj.getMonth() + 1).padStart(2, '0')}-${String(startDateObj.getDate()).padStart(2, '0')}`;

    periods.unshift({
      periodKey,
      label,
      startDate: start,
      endDate: end,
      isCurrent: i === 0
    });

    start -= unitMs;
  }

  return periods;
}

/**
 * Core Aggregation function: Build Pair × Period matrix & classify rows
 */
export function aggregatePairHeatmap(
  rows: PairHeatmapRow[],
  periods: PeriodColumn[],
  excludedWords: string[] = DEFAULT_EXCLUDED_WORDS,
  minTotalCount: number = 2,
  minPeriodsCount: number = 2,
  surgingMult: number = 2,
  surgingMinCount: number = 2
): {
  matrixRows: PairPeriodData[];
  newPairs: Array<{ pairKey: string; jaccard: number; totalCount: number; firstDate: string }>;
} {
  const excludedSet = new Set(excludedWords.map(w => w.trim().toLowerCase()));
  const periodKeys = periods.map(p => p.periodKey);

  const pairMap: {
    [pairKey: string]: {
      source: string;
      target: string;
      jaccard: number;
      totalCount: number;
      periodCounts: { [pk: string]: number };
      periodArticles: { [pk: string]: Array<{ date: string; title: string }> };
      firstDateMs: number;
    }
  } = {};

  rows.forEach(row => {
    // Check exclusion
    if (excludedSet.has(row.source.toLowerCase()) || excludedSet.has(row.target.toLowerCase())) {
      return;
    }

    const pairKey = row.pairKey;
    if (!pairMap[pairKey]) {
      pairMap[pairKey] = {
        source: row.source,
        target: row.target,
        jaccard: row.jaccardCorrelation,
        totalCount: 0,
        periodCounts: {},
        periodArticles: {},
        firstDateMs: Infinity
      };
    }

    const pData = pairMap[pairKey];
    pData.jaccard = Math.max(pData.jaccard, row.jaccardCorrelation);

    // Process dates & article titles
    const dates = row.dates;
    const titles = row.articleTitles;

    dates.forEach((dateStr, idx) => {
      // Extract YYYY/MM/DD (first 10 chars)
      const cleanDate = dateStr.trim().substring(0, 10).replace(/-/g, "/");
      if (cleanDate.length < 10) return;

      const dateMs = new Date(cleanDate).getTime();
      if (isNaN(dateMs)) return;

      if (dateMs < pData.firstDateMs) {
        pData.firstDateMs = dateMs;
      }

      // Find matching period
      const matchedPeriod = periods.find(p => dateMs >= p.startDate && dateMs <= p.endDate);
      if (matchedPeriod) {
        const pk = matchedPeriod.periodKey;
        pData.periodCounts[pk] = (pData.periodCounts[pk] || 0) + 1;
        if (!pData.periodArticles[pk]) {
          pData.periodArticles[pk] = [];
        }
        const title = titles[idx] || titles[0] || "関連記事";
        // Avoid duplicate same date+title in same period
        if (!pData.periodArticles[pk].some(a => a.date === cleanDate && a.title === title)) {
          pData.periodArticles[pk].push({ date: cleanDate, title });
        }
        pData.totalCount++;
      }
    });
  });

  const matrixRows: PairPeriodData[] = [];
  const newPairsList: Array<{ pairKey: string; jaccard: number; totalCount: number; firstDate: string }> = [];

  const nowMs = Date.now();
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

  Object.keys(pairMap).forEach(pairKey => {
    const p = pairMap[pairKey];
    
    // Check if "New" (first appearance within last 14 days)
    const isNew = (nowMs - p.firstDateMs) <= fourteenDaysMs;
    if (isNew) {
      const dObj = new Date(p.firstDateMs);
      const firstDateStr = `${dObj.getFullYear()}/${String(dObj.getMonth() + 1).padStart(2, '0')}/${String(dObj.getDate()).padStart(2, '0')}`;
      newPairsList.push({
        pairKey,
        jaccard: p.jaccard,
        totalCount: p.totalCount,
        firstDate: firstDateStr
      });
      return; // New pairs are in a separate list, not heatmap matrix rows
    }

    // Filter criteria for heatmap rows: totalCount >= minTotalCount AND appearing in >= minPeriodsCount periods
    let activePeriodsCount = 0;
    periodKeys.forEach(pk => {
      if ((p.periodCounts[pk] || 0) > 0) activePeriodsCount++;
    });

    if (p.totalCount < minTotalCount || activePeriodsCount < minPeriodsCount) {
      return;
    }

    // Classification calculation
    // Last period (current) count
    const lastPk = periodKeys[periodKeys.length - 1];
    const lastCount = p.periodCounts[lastPk] || 0;

    // Preceding 4 periods counts
    const precedingKeys = periodKeys.slice(Math.max(0, periodKeys.length - 5), periodKeys.length - 1);
    let precedingSum = 0;
    precedingKeys.forEach(pk => {
      precedingSum += (p.periodCounts[pk] || 0);
    });
    const prev4Avg = precedingKeys.length > 0 ? precedingSum / precedingKeys.length : 0;

    // Recent 3 periods counts
    const recentKeys = periodKeys.slice(Math.max(0, periodKeys.length - 3));
    let recentActiveCount = 0;
    recentKeys.forEach(pk => {
      if ((p.periodCounts[pk] || 0) > 0) recentActiveCount++;
    });

    // Preceding 2 periods (just before last) for resurgence check
    const prev2Keys = periodKeys.slice(Math.max(0, periodKeys.length - 5), periodKeys.length - 1);
    let prev2Sum = 0;
    prev2Keys.forEach(pk => {
      prev2Sum += (p.periodCounts[pk] || 0);
    });

    let classification: "new" | "surging" | "resurgence" | "continuing" | "low" = "low";

    if (lastCount >= surgingMinCount && lastCount >= prev4Avg * surgingMult) {
      classification = "surging";
    } else if (p.totalCount >= 2 && lastCount >= 1 && prev2Sum === 0) {
      classification = "resurgence";
    } else if (recentActiveCount >= 2) {
      classification = "continuing";
    } else {
      classification = "low";
    }

    matrixRows.push({
      pairKey,
      source: p.source,
      target: p.target,
      jaccard: p.jaccard,
      totalCount: p.totalCount,
      periodCounts: p.periodCounts,
      periodArticles: p.periodArticles,
      classification,
      recentPeriodsCount: recentActiveCount,
      lastPeriodCount: lastCount,
      prev4PeriodsAvg: prev4Avg
    });
  });

  // Sort new pairs by Jaccard desc
  newPairsList.sort((a, b) => b.jaccard - a.jaccard);

  return { matrixRows, newPairs: newPairsList };
}
