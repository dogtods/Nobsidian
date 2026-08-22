/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Note {
  id: string;
  title: string;
  content: string;
  summary: string;
  keywords: string;
  sourceUrl: string;
  createdAt: number;
  updatedAt: number;
  timeline?: string; // Timeline pattern strings from Column L
  columnJ?: string;  // I列から取り込んだ生メモ情報（J列に保存して非表示）
  rawContent?: string; // I列 (all: 原文テキスト)
  metaInfo?: string;   // J列 (apendix: メタ情報)
  dateStr?: string;    // K列 (date: 発行日・取り込み日)
  source?: string;     // M列 (source: raindrop / drive / mht / app)
  processed?: boolean | string; // G列 (processed)
  nobsidian?: string;  // H列 (nobsidian)
}

export interface FolderRelation {
  source: string;
  target: string;
  reason: string;
}

export interface HeatmapData {
  dates: string[];
  keywords: string[];
  matrix: number[][];
}

export interface CoOccurNode {
  id: string;
  count: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface CoOccurEdge {
  source: string | CoOccurNode;
  target: string | CoOccurNode;
  weight: number;
}

export interface CoOccurData {
  nodes: CoOccurNode[];
  edges: CoOccurEdge[];
}

export interface StreamSeries {
  name: string;
  values: number[];
}

export interface StreamData {
  dates: string[];
  series: StreamSeries[];
}

export interface BubblePoint {
  date: string;
  category: string;
  keyword: string;
  count: number;
}

export interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  content?: string;
  folder?: string;
  linkCount?: number;
  noteCount?: number; // for folders
  notes?: Note[]; // for folders
  z?: number;
  vz?: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

export interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  isMutual?: boolean;
  value?: number; // for folder graph
  type?: 'wiki' | 'ai'; // for folder graph
  label?: string; // for folder graph
  strength?: number; // つながりの強さ (1.0 - 5.0)
}

export interface TimelineItem {
  id: string; // event uuid
  dateStr: string; // "2026年3月", "2025/11/04"
  normalizedDate: string; // "2026-03-00"
  event: string; // "A社がシステム導入を発表"
  noteId: string;
  noteTitle: string;
  category?: string; // category classification
  comment?: string; // What nature of date/event is this (e.g. "設立", "業務提携")
}

