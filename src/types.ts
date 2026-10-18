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
  columnN?: string;    // N列 (14列目: カテゴリ / ロット情報)
  rowIndex?: number;   // スプレッドシート上の行番号 (2〜lastRow)
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
  folder?: string;
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

// ==== 学習用スプレッドシート & 問題生成用 型定義 ====
export type QuestionType = "single_choice" | "multiple_choice" | "true_false" | "short_answer";

export interface QuestionChoice {
  id?: string;
  order: number;
  label: string; // "A", "B", "C", "D"
  text: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface QuestionEvidence {
  id?: string;
  quote: string; // 根拠となる元ノートの正確な引用
  section?: string;
  noteId?: string;
  noteTitle?: string;
}

export interface LearningQuestion {
  id: string;
  noteId: string;
  noteTitle: string;
  type: QuestionType;
  question: string;
  correctAnswer: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  tags?: string[];
  source: "ai_api" | "external_ai_prompt" | "manual";
  status: "approved" | "draft" | "review" | "mastered" | "excluded";
  choices?: QuestionChoice[];
  evidence?: QuestionEvidence;
  createdAt: number;
  updatedAt: number;
  // 承認UI用の選択状態
  isApproved?: boolean;
}

export interface ReviewLog {
  id: string;
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  timeSpentSeconds: number;
  rating: number; // 1: Again, 2: Hard, 3: Good, 4: Easy, 5: Mastered (出題停止)
  memo?: string;
  answeredAt: number;
}

export interface ReviewState {
  questionId: string;
  totalReviews: number;
  correctCount: number;
  consecutiveCorrect: number;
  easinessFactor: number;
  intervalDays: number;
  lastReviewedAt: number;
  nextReviewDate: string; // YYYY-MM-DD
  masteryLevel: "new" | "learning" | "review" | "mastered" | "excluded";
  updatedAt: number;
}

export interface QuestionGenerationConfig {
  count: number;
  type: QuestionType | "mix";
  difficulty: "easy" | "medium" | "hard";
  mode: "external_prompt" | "api";
}

// ==== 深掘り判断・分析・スプレッドシート蓄積用 型定義 ====
export type DeepDivePriority = "high" | "medium" | "low";

export interface DeepDiveDecision {
  analysisId: string;
  articleId: string;
  articleTitle: string;
  articleUrl: string;
  publishedDate: string;
  registeredDate: string;
  existingSummary: string;
  keywords: string;
  marketTrendSummary: string;
  coreClaim: string;
  articleType: string;
  currentStage: string;
  importanceEval: string;
  currentFeasibility: string;
  priority: DeepDivePriority;
  reasonForDeepDive: string;
  reasonForSkipping: string;
  missingInformation: string;
  recommendedIssues: string[];
  reassessmentConditions: string;
  aiVerdict: string;
  userFinalDecision: string;
  decisionDate: string;
  status: "decided" | "analyzing" | "completed" | "skipped";
  promptVersion?: string;
}

export interface DeepDiveIssue {
  issueId: string; // e.g. "iss-1"
  title: string; // 論点名
  importanceReason: string; // なぜ重要なのか
  knownFacts: string; // 現時点で分かっていること
  unknownPoints: string; // まだ分かっていないこと
  investigationMethod: string; // 何を調べれば判断できるか
  sourcesToVerify: string; // どの資料や情報源を確認すべきか
  conditionsToChangeVerdict: string; // 判断が変わる条件
  selectedForAnalysis: boolean;
}

export interface DeepDiveAnalysisResult {
  analysisId: string;
  articleId: string;
  issueId: string;
  articleTitle: string;
  issueTitle: string;
  researchGoal: string;
  verifiedFacts: string;
  sourceUrlAndEvidence: string;
  sourcePublishedDate: string;
  estimatesAndHypotheses: string;
  unknownsAndGaps: string;
  hinderingFactors: string;
  analysisConclusion: string;
  confidenceScoreAndReason: string;
  futureCheckpoints: string;
  analyzedDate: string;
  userComment: string;
}

export interface DeepDiveReview {
  reviewId: string;
  articleId: string;
  analysisId: string;
  originalForecast: string;
  forecastTarget: string;
  forecastTargetDate: string;
  forecastAssumptions: string;
  verdictAtForecast: string;
  actualOutcome: string;
  alignment: "matched" | "partially_matched" | "diverged" | "unknown";
  reasonForOutcome: string;
  learnings: string;
  reviewDate: string;
}

