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

// Helper to get effective date from K column (dateStr) or fallback to createdAt
export function getNoteDateMillis(note: Note): number {
  if (note.dateStr) {
    const parsed = new Date(note.dateStr.replace(/\//g, "-"));
    if (!isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }
  return note.createdAt;
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

// Main logic to filter notes based on dates
export function getFilteredNotes(notes: Note[], filterStart: string, filterEnd: string): Note[] {
  const startTime = filterStart ? new Date(filterStart + "T00:00:00").getTime() : null;
  const endTime = filterEnd ? new Date(filterEnd + "T23:59:59").getTime() : null;

  return notes.filter(n => {
    const dTime = getNoteDateMillis(n);
    if (startTime && dTime < startTime) return false;
    if (endTime && dTime > endTime) return false;
    
    // Convert keywords to folder name to check if excluded
    const folderName = getFolderFromKeywords(n.keywords);
    return true;
  });
}

/**
 * 1. Heatmap Data Parser
 * X-Axis: Dates (sorted)
 * Y-Axis: WikiLink dynamic keywords (top keywords inside selected range)
 * Value: Appearance frequency on that day
 */
export function parseHeatmapData(notes: Note[], filterStart: string, filterEnd: string, limit: number = 10, excludedKeywords: string[] = [], isWeekly: boolean = false): HeatmapData {
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

  const sortedTopKeywords = Object.keys(kwFrequency)
    .sort((a, b) => kwFrequency[b] - kwFrequency[a])
    .slice(0, limit);

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
export function parseCoOccurData(notes: Note[], filterStart: string, filterEnd: string, nodeLimit: number = 40, excludedKeywords: string[] = []): CoOccurData {
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

  // Sort and narrow down top keywords to keep graph focused and beautiful
  const topKeywords = Object.keys(keywordCounts)
    .sort((a, b) => keywordCounts[b] - keywordCounts[a])
    .slice(0, nodeLimit);

  const nodeSet = new Set(topKeywords);

  const nodes = topKeywords.map(kw => ({
    id: kw,
    count: keywordCounts[kw]
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
export function parseStreamData(notes: Note[], filterStart: string, filterEnd: string, kwLimit: number = 8, excludedKeywords: string[] = [], isWeekly: boolean = false): StreamData {
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

  const sortedTopKeywords = Object.keys(kwFrequency)
    .sort((a, b) => kwFrequency[b] - kwFrequency[a])
    .slice(0, kwLimit);

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
export function parseBubbleData(notes: Note[], filterStart: string, filterEnd: string, excludedKeywords: string[] = [], isWeekly: boolean = false, excludedCategories: string[] = []): BubblePoint[] {
  const filtered = getFilteredNotes(notes, filterStart, filterEnd);
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

  return Object.values(bubblePointsMap).sort((a, b) => {
    if (a.date === "Unknown") return 1;
    if (b.date === "Unknown") return -1;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
}
