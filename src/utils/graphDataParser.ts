/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Note, HeatmapData, CoOccurData, StreamData, BubblePoint } from "../types";

// WikiLink keyword extraction helper: returns all contents inside [[Keyword]]
export function extractWikiLinks(content: string): string[] {
  if (!content) return [];
  const matches = content.match(/\[\[([^\]]+)\]\]/g) || [];
  return matches.map(m => m.slice(2, -2).trim()).filter(t => t.length > 0);
}

// Extract keywords specifically from E column summary 【キーワード】 section
export function extractKeywordsSectionLinks(summary: string): string[] {
  if (!summary) return [];
  const keywordSectionIdx = summary.indexOf("【キーワード】");
  let targetText = summary;
  if (keywordSectionIdx !== -1) {
    targetText = summary.substring(keywordSectionIdx);
  }
  return extractWikiLinks(targetText);
}

// Comprehensive keyword extractor for an individual note
export function extractNoteKeywords(note: Note): string[] {
  if (!note) return [];
  const set = new Set<string>();

  // 1. From summary E column
  const summaryLinks = extractKeywordsSectionLinks(note.summary || "");
  summaryLinks.forEach(k => {
    const trimmed = k.trim();
    if (trimmed) set.add(trimmed);
  });

  // 2. From content markdown WikiLinks [[...]]
  const contentLinks = extractWikiLinks(note.content || "");
  contentLinks.forEach(k => {
    const trimmed = k.trim();
    if (trimmed) set.add(trimmed);
  });

  // 3. From Column D keywords
  if (note.keywords) {
    const cleanD = note.keywords.replace(/\[folder:[^\]]+\]/gi, '');
    const dWiki = extractWikiLinks(cleanD);
    dWiki.forEach(k => {
      const trimmed = k.trim();
      if (trimmed) set.add(trimmed);
    });

    // Also parse comma/bullet/slash separated plain tags
    const plainParts = cleanD.replace(/\[\[|\]\]/g, '').split(/[,、\/\n・]/);
    plainParts.forEach(p => {
      const trimmed = p.trim().replace(/^#/, '');
      if (trimmed && trimmed !== "未分類" && !trimmed.toLowerCase().startsWith("folder:")) {
        set.add(trimmed);
      }
    });
  }

  return Array.from(set);
}

// Extract folder/category name from keywords: e.g. [folder:Folder Name] or plain category name (e.g. "太陽光発電", "環境")
export function getFolderFromKeywords(keywordsStr: string): string {
  if (!keywordsStr || typeof keywordsStr !== "string") return "未分類";
  const trimmed = keywordsStr.trim();
  if (!trimmed) return "未分類";

  const match = trimmed.match(/\[folder:(.+?)\]/i);
  if (match) return match[1].trim();

  // Strip wikilinks: [[Category]] -> Category
  let clean = trimmed.replace(/^\[\[|\]\]$/g, '').trim();
  // Strip hashtags: #Category -> Category
  clean = clean.replace(/^#/, '').trim();
  // If multiple words or tags separated by comma, slash, bullet, or newline, take primary
  const first = clean.split(/[,、\/\n・]/)[0].trim();
  return first || "未分類";
}

// Helper to extract normalized YYYY-MM-DD string from a note (西暦・月・日)
export function getNoteYMD(note: Note): string {
  // 1. Check K column (dateStr)
  if (note.dateStr && typeof note.dateStr === "string") {
    const raw = note.dateStr.trim();
    if (raw) {
      // 1-a. Reiwa format: 令和8年8月24日 or R8/8/24
      const reiwaMatch = raw.match(/(?:令和|R)\s*(\d{1,2})\s*年?\s*[\/\-\.月]\s*(\d{1,2})\s*[\/\-\.月日]?\s*(\d{1,2})?/i);
      if (reiwaMatch) {
        const y = 2018 + parseInt(reiwaMatch[1], 10);
        const m = reiwaMatch[2].padStart(2, "0");
        const d = (reiwaMatch[3] || "01").padStart(2, "0");
        return `${y}-${m}-${d}`;
      }

      // 1-b. Japanese format: 2026年8月24日 or 2026年08月24日 (ignores time portion like 14:30)
      const jpMatch = raw.match(/(\d{4})\s*年\s*(\d{1,2})\s*月(?:\s*(\d{1,2})\s*日?)?/);
      if (jpMatch) {
        const y = jpMatch[1];
        const m = jpMatch[2].padStart(2, "0");
        const d = (jpMatch[3] || "01").padStart(2, "0");
        return `${y}-${m}-${d}`;
      }

      // 1-c. Slash, hyphen, dot format: 2026/08/24, 2026-8-24, 2026.8.24 (ignores time portion)
      const numMatch = raw.match(/(\d{4})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{1,2}))?/);
      if (numMatch) {
        const y = numMatch[1];
        const m = numMatch[2].padStart(2, "0");
        const d = (numMatch[3] || "01").padStart(2, "0");
        return `${y}-${m}-${d}`;
      }

      // 1-d. Numeric millisecond timestamp
      if (!isNaN(Number(raw)) && Number(raw) > 100000) {
        const d = new Date(Number(raw));
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${day}`;
        }
      }

      // 1-e. Date string (e.g. ISO string or "Mon Aug 24 2026...")
      const parsed = new Date(raw);
      if (!isNaN(parsed.getTime())) {
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, "0");
        const day = String(parsed.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
    }
  }

  // 2. Fallback to createdAt
  if (note.createdAt && !isNaN(Number(note.createdAt)) && Number(note.createdAt) > 0) {
    const d = new Date(Number(note.createdAt));
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  }

  // 3. Fallback to updatedAt
  if (note.updatedAt && !isNaN(Number(note.updatedAt)) && Number(note.updatedAt) > 0) {
    const d = new Date(Number(note.updatedAt));
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  }

  return "";
}

// Helper to get effective date in local midnight milliseconds based on YYYY-MM-DD
export function getNoteDateMillis(note: Note): number {
  const ymd = getNoteYMD(note);
  if (ymd) {
    const parts = ymd.split("-").map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      const localDate = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
      return localDate.getTime();
    }
  }
  return 0;
}

// Compare two notes by date (西暦・月・日のみで比較し、同一日の場合はタイトル五十音順でソート)
export function compareNotesByDate(a: Note, b: Note, mode: "date-desc" | "date-asc"): number {
  const ymdA = getNoteYMD(a);
  const ymdB = getNoteYMD(b);
  if (mode === "date-desc") {
    if (ymdA && ymdB) {
      const cmp = ymdB.localeCompare(ymdA);
      if (cmp !== 0) return cmp;
    } else if (ymdB) {
      return 1;
    } else if (ymdA) {
      return -1;
    }
    return (a.title || "").localeCompare(b.title || "", "ja");
  } else {
    if (ymdA && ymdB) {
      const cmp = ymdA.localeCompare(ymdB);
      if (cmp !== 0) return cmp;
    } else if (ymdA) {
      return 1;
    } else if (ymdB) {
      return -1;
    }
    return (a.title || "").localeCompare(b.title || "", "ja");
  }
}

// Displayable formatted date for note: e.g. "2026/08/24"
export function getNoteDisplayDate(note: Note): string {
  const ymd = getNoteYMD(note);
  if (ymd) {
    return ymd.replace(/-/g, "/");
  }
  if (note.dateStr && typeof note.dateStr === "string" && note.dateStr.trim()) {
    return note.dateStr.trim();
  }
  return "";
}

// Convert timestamp to YYYY-MM-DD format
export function formatDateStr(timestamp: number): string {
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return "Unknown";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Convert timestamp to Monday's YYYY-MM-DD of that week
export function getMondayOfDate(timestamp: number): string {
  const d = new Date(timestamp);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const dayStr = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayStr}`;
}

// Main logic to filter notes based on dates (西暦・月・日単位で厳密に判定)
export function getFilteredNotes(notes: Note[], filterStart: string, filterEnd: string): Note[] {
  const startYMD = filterStart ? filterStart.trim() : "";
  const endYMD = filterEnd ? filterEnd.trim() : "";

  return notes.filter(n => {
    // 期間指定がない場合は全件表示
    if (!startYMD && !endYMD) return true;

    const noteYMD = getNoteYMD(n);
    // 期間が指定されている場合、日付が取得できないノートは除外
    if (!noteYMD) return false;

    // 開始日・終了日（YYYY-MM-DD）による文字列比較（開始日・終了日が同日の場合はその日のみ完全一致）
    if (startYMD && noteYMD < startYMD) return false;
    if (endYMD && noteYMD > endYMD) return false;

    return true;
  });
}

/**
 * 1. Heatmap Data Parser
 * X-Axis: Dates (sorted)
 * Y-Axis: WikiLink dynamic keywords (top keywords inside selected range or focused note keywords)
 * Value: Appearance frequency on that day
 */
export function parseHeatmapData(
  notes: Note[], 
  filterStart: string, 
  filterEnd: string, 
  limit: number = 10, 
  excludedKeywords: string[] = [], 
  isWeekly: boolean = false,
  focusKeywords?: string[]
): HeatmapData {
  const filtered = getFilteredNotes(notes, filterStart, filterEnd);
  
  const dateWiseKeywordCounts: { [date: string]: { [kw: string]: number } } = {};
  const allKeywordsSet = new Set<string>();
  const allDatesSet = new Set<string>();
  const existingTitlesSet = new Set(notes.map(n => n.title.trim().toLowerCase()));
  const excludedSet = new Set((excludedKeywords || []).map(k => k.toLowerCase()));

  filtered.forEach(note => {
    const dTime = getNoteDateMillis(note);
    const dStr = isWeekly ? getMondayOfDate(dTime) : formatDateStr(dTime);
    allDatesSet.add(dStr);

    if (!dateWiseKeywordCounts[dStr]) {
      dateWiseKeywordCounts[dStr] = {};
    }

    const allLinks = extractKeywordsSectionLinks(note.summary || "");
    const keywords = allLinks.filter(kw => {
      const cleanKw = kw.trim().toLowerCase();
      return !existingTitlesSet.has(cleanKw) && !excludedSet.has(cleanKw);
    });

    keywords.forEach(kw => {
      allKeywordsSet.add(kw);
      dateWiseKeywordCounts[dStr][kw] = (dateWiseKeywordCounts[dStr][kw] || 0) + 1;
    });
  });

  // Calculate global frequency for each keyword to find the top ones
  const kwFrequency: { [kw: string]: number } = {};
  allKeywordsSet.forEach(kw => {
    kwFrequency[kw] = 0;
    Object.keys(dateWiseKeywordCounts).forEach(d => {
      if (dateWiseKeywordCounts[d][kw]) {
        kwFrequency[kw] += dateWiseKeywordCounts[d][kw];
      }
    });
  });

  let sortedTopKeywords: string[] = [];

  if (focusKeywords && focusKeywords.length > 0) {
    const focusSet = new Set(focusKeywords.map(k => k.trim().toLowerCase()));
    // Prioritize keywords in the focus list
    const matchedKws = Array.from(allKeywordsSet).filter(kw => focusSet.has(kw.toLowerCase()));
    // Also include any focus keywords even if count is 0 in date range
    focusKeywords.forEach(k => {
      const clean = k.trim();
      if (clean && !excludedSet.has(clean.toLowerCase()) && !matchedKws.some(m => m.toLowerCase() === clean.toLowerCase())) {
        matchedKws.push(clean);
        if (!kwFrequency[clean]) kwFrequency[clean] = 0;
      }
    });

    sortedTopKeywords = matchedKws
      .sort((a, b) => (kwFrequency[b] || 0) - (kwFrequency[a] || 0))
      .slice(0, Math.max(limit, focusKeywords.length));
  } else {
    sortedTopKeywords = Object.keys(kwFrequency)
      .sort((a, b) => kwFrequency[b] - kwFrequency[a])
      .slice(0, limit);
  }

  // Generate sorted date array or fallback
  let sortedDates = Array.from(allDatesSet).sort((a, b) => {
    if (a === "Unknown") return 1;
    if (b === "Unknown") return -1;
    return new Date(a).getTime() - new Date(b).getTime();
  });

  if (sortedDates.length === 0) {
    // Fallback if empty to keep SVG initialized
    const today = isWeekly ? getMondayOfDate(Date.now()) : formatDateStr(Date.now());
    sortedDates = [today];
  }

  // Generate rendering matrix
  const matrix: number[][] = sortedTopKeywords.map(kw => {
    return sortedDates.map(date => {
      return dateWiseKeywordCounts[date]?.[kw] || 0;
    });
  });

  return {
    dates: sortedDates,
    keywords: sortedTopKeywords,
    matrix
  };
}

/**
 * 2. Co-occurrence Network Data Parser
 * Nodes: WikiLink keywords with size based on frequency
 * Edges: Links between keywords co-occurring inside the same note
 */
export function parseCoOccurData(
  notes: Note[], 
  filterStart: string, 
  filterEnd: string, 
  nodeLimit: number = 40, 
  excludedKeywords: string[] = [],
  focusKeywords?: string[]
): CoOccurData {
  const filtered = getFilteredNotes(notes, filterStart, filterEnd);

  const keywordCounts: { [kw: string]: number } = {};
  const coOccurPairs: { [pairKey: string]: number } = {};
  const existingTitlesSet = new Set(notes.map(n => n.title.trim().toLowerCase()));
  const excludedSet = new Set((excludedKeywords || []).map(k => k.toLowerCase()));

  filtered.forEach(note => {
    // Unique wikilinks in this single note (extracting from summary)
    const allLinks = Array.from(new Set(extractKeywordsSectionLinks(note.summary || "")));
    const links = allLinks.filter(kw => {
      const cleanKw = kw.trim().toLowerCase();
      return !existingTitlesSet.has(cleanKw) && !excludedSet.has(cleanKw);
    });
    
    // Count frequencies
    links.forEach(kw => {
      keywordCounts[kw] = (keywordCounts[kw] || 0) + 1;
    });

    // Create combinations for co-occurrence edges
    for (let i = 0; i < links.length; i++) {
      for (let j = i + 1; j < links.length; j++) {
        const kwA = links[i];
        const kwB = links[j];
        const key = kwA < kwB ? `${kwA}|${kwB}` : `${kwB}|${kwA}`;
        coOccurPairs[key] = (coOccurPairs[key] || 0) + 1;
      }
    }
  });

  let topKeywords: string[] = [];

  if (focusKeywords && focusKeywords.length > 0) {
    const focusLower = new Set(focusKeywords.map(k => k.trim().toLowerCase()));
    
    // 1. Identify active focus keywords present in counts
    const primaryFocusKws: string[] = [];
    Object.keys(keywordCounts).forEach(kw => {
      if (focusLower.has(kw.toLowerCase())) {
        primaryFocusKws.push(kw);
      }
    });

    // Also collect secondary neighbor keywords connected to primary focus keywords
    const neighborScores: { [kw: string]: number } = {};
    Object.keys(coOccurPairs).forEach(pair => {
      const [kwA, kwB] = pair.split("|");
      const aIsFocus = focusLower.has(kwA.toLowerCase());
      const bIsFocus = focusLower.has(kwB.toLowerCase());
      
      if (aIsFocus && !bIsFocus) {
        neighborScores[kwB] = (neighborScores[kwB] || 0) + coOccurPairs[pair];
      } else if (bIsFocus && !aIsFocus) {
        neighborScores[kwA] = (neighborScores[kwA] || 0) + coOccurPairs[pair];
      }
    });

    const sortedNeighbors = Object.keys(neighborScores)
      .sort((a, b) => neighborScores[b] - neighborScores[a]);

    const remainingSlots = Math.max(10, nodeLimit - primaryFocusKws.length);
    topKeywords = [...primaryFocusKws, ...sortedNeighbors.slice(0, remainingSlots)];

    // If still very few, backfill with top overall keywords
    if (topKeywords.length < 5) {
      const extra = Object.keys(keywordCounts)
        .sort((a, b) => keywordCounts[b] - keywordCounts[a])
        .filter(k => !topKeywords.includes(k))
        .slice(0, nodeLimit - topKeywords.length);
      topKeywords.push(...extra);
    }
  } else {
    // Sort and narrow down top keywords to keep graph focused and beautiful
    topKeywords = Object.keys(keywordCounts)
      .sort((a, b) => keywordCounts[b] - keywordCounts[a])
      .slice(0, nodeLimit);
  }

  const nodeSet = new Set(topKeywords);

  const nodes = topKeywords.map(kw => ({
    id: kw,
    count: keywordCounts[kw] || 1
  }));

  const edges: { source: string; target: string; weight: number }[] = [];
  Object.keys(coOccurPairs).forEach(pair => {
    const [kwA, kwB] = pair.split("|");
    if (nodeSet.has(kwA) && nodeSet.has(kwB)) {
      edges.push({
        source: kwA,
        target: kwB,
        weight: coOccurPairs[pair]
      });
    }
  });

  return { nodes, edges };
}

/**
 * 3. Stream Graph Data Parser
 * X-Axis: Sorted range dates
 * Series: Top keywords stream flow trends
 */
export function parseStreamData(
  notes: Note[], 
  filterStart: string, 
  filterEnd: string, 
  kwLimit: number = 8, 
  excludedKeywords: string[] = [], 
  isWeekly: boolean = false,
  focusKeywords?: string[]
): StreamData {
  const filtered = getFilteredNotes(notes, filterStart, filterEnd);

  const dateWiseKeywordCounts: { [date: string]: { [kw: string]: number } } = {};
  const allKeywordsSet = new Set<string>();
  const allDatesSet = new Set<string>();
  const existingTitlesSet = new Set(notes.map(n => n.title.trim().toLowerCase()));
  const excludedSet = new Set((excludedKeywords || []).map(k => k.toLowerCase()));

  filtered.forEach(note => {
    const dTime = getNoteDateMillis(note);
    const dStr = isWeekly ? getMondayOfDate(dTime) : formatDateStr(dTime);
    allDatesSet.add(dStr);

    if (!dateWiseKeywordCounts[dStr]) {
      dateWiseKeywordCounts[dStr] = {};
    }

    const allLinks = extractKeywordsSectionLinks(note.summary || "");
    const keywords = allLinks.filter(kw => {
      const cleanKw = kw.trim().toLowerCase();
      return !existingTitlesSet.has(cleanKw) && !excludedSet.has(cleanKw);
    });

    keywords.forEach(kw => {
      allKeywordsSet.add(kw);
      dateWiseKeywordCounts[dStr][kw] = (dateWiseKeywordCounts[dStr][kw] || 0) + 1;
    });
  });

  // Calculate frequency for top selection
  const kwFrequency: { [kw: string]: number } = {};
  allKeywordsSet.forEach(kw => {
    kwFrequency[kw] = 0;
    Object.keys(dateWiseKeywordCounts).forEach(d => {
      if (dateWiseKeywordCounts[d][kw]) {
        kwFrequency[kw] += dateWiseKeywordCounts[d][kw];
      }
    });
  });

  let sortedTopKeywords: string[] = [];

  if (focusKeywords && focusKeywords.length > 0) {
    const focusLower = new Set(focusKeywords.map(k => k.trim().toLowerCase()));
    const matchedKws = Array.from(allKeywordsSet).filter(kw => focusLower.has(kw.toLowerCase()));
    
    // Add focus keywords even if 0 count
    focusKeywords.forEach(k => {
      const clean = k.trim();
      if (clean && !excludedSet.has(clean.toLowerCase()) && !matchedKws.some(m => m.toLowerCase() === clean.toLowerCase())) {
        matchedKws.push(clean);
        if (!kwFrequency[clean]) kwFrequency[clean] = 0;
      }
    });

    sortedTopKeywords = matchedKws
      .sort((a, b) => (kwFrequency[b] || 0) - (kwFrequency[a] || 0))
      .slice(0, Math.max(kwLimit, focusKeywords.length));
  } else {
    sortedTopKeywords = Object.keys(kwFrequency)
      .sort((a, b) => kwFrequency[b] - kwFrequency[a])
      .slice(0, kwLimit);
  }

  let sortedDates = Array.from(allDatesSet).sort((a, b) => {
    if (a === "Unknown") return 1;
    if (b === "Unknown") return -1;
    return new Date(a).getTime() - new Date(b).getTime();
  });

  if (sortedDates.length === 0) {
    sortedDates = [isWeekly ? getMondayOfDate(Date.now()) : formatDateStr(Date.now())];
  }

  const series = sortedTopKeywords.map(kw => {
    const values = sortedDates.map(dStr => dateWiseKeywordCounts[dStr]?.[kw] || 0);
    return {
      name: kw,
      values
    };
  });

  return {
    dates: sortedDates,
    series
  };
}

/**
 * 4. Bubble Chart Data Parser
 * Plots keywords occurrences grouped by Category (Folder) and Date.
 * Bubble Size: occurrences keyword count on that day.
 */
export function parseBubbleData(
  notes: Note[], 
  filterStart: string, 
  filterEnd: string, 
  excludedKeywords: string[] = [], 
  isWeekly: boolean = false, 
  excludedCategories: string[] = [],
  focusKeywords?: string[],
  focusCategory?: string
): BubblePoint[] {
  let filtered = getFilteredNotes(notes, filterStart, filterEnd);
  
  if (focusCategory) {
    filtered = filtered.filter(n => getFolderFromKeywords(n.keywords).toLowerCase() === focusCategory.toLowerCase());
  }

  const bubblePointsMap: { [key: string]: BubblePoint } = {};
  
  const existingTitlesSet = new Set(notes.map(n => n.title.trim().toLowerCase()));
  const excludedSet = new Set((excludedKeywords || []).map(k => k.toLowerCase()));
  const excludedCatSet = new Set((excludedCategories || []).map(c => c.toLowerCase()));

  filtered.forEach(note => {
    const dTime = getNoteDateMillis(note);
    const dStr = isWeekly ? getMondayOfDate(dTime) : formatDateStr(dTime);
    
    // We are asked to plot Column D counts by date. So category is just Column D (getFolderFromKeywords).
    const category = getFolderFromKeywords(note.keywords);
    
    if (excludedCatSet.has(category.toLowerCase())) {
      return;
    }

    const uniqueKey = `${dStr}|${category}|${category}`;
    if (!bubblePointsMap[uniqueKey]) {
      bubblePointsMap[uniqueKey] = {
        date: dStr,
        category,
        keyword: category, // setting keyword equal to category for plotting
        count: 0
      };
    }
    bubblePointsMap[uniqueKey].count += 1;
  });

  let result = Object.values(bubblePointsMap);

  return result.sort((a, b) => {
    if (a.date === "Unknown") return 1;
    if (b.date === "Unknown") return -1;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
}
