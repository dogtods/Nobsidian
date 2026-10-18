/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Sparkles,
  Copy,
  Check,
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2,
  Trash2,
  Edit3,
  Save,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Zap,
  RotateCcw,
  RefreshCw,
  Loader2,
  ListChecks,
  Search,
  Layers,
  ArrowRight,
  Clipboard,
  Download,
  Calendar,
  History,
  TrendingUp,
  FileText,
  Sliders,
  Maximize2,
  Minimize2,
  CheckSquare,
  Square
} from "lucide-react";
import {
  Note,
  DeepDiveDecision,
  DeepDiveIssue,
  DeepDiveAnalysisResult,
  DeepDiveReview,
  DeepDivePriority
} from "../types";
import {
  DEFAULT_DEEP_DIVE_PROMPTS,
  buildDeepDiveDecisionPrompt,
  buildDeepDiveIssuesPrompt,
  buildDeepDiveAnalysisPrompt,
  buildDeepDiveBatchAnalysisPrompt,
  buildDeepDiveReviewPrompt,
  extractJsonFromText,
  getStoredDecisions,
  saveStoredDecision,
  getStoredAnalyses,
  saveStoredAnalyses,
  getStoredReviews,
  saveStoredReview,
  getDeepDiveSpreadsheetUrl,
  setDeepDiveSpreadsheetUrl,
  getCustomDeepDivePrompts,
  saveCustomDeepDivePrompts,
  callGeminiForDeepDive
} from "../utils/deepDiveUtils";
import { getNoteYMD } from "../utils/graphDataParser";

interface DeepDiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  note: Note;
  apiPost: (body: any) => Promise<any>;
  onToast: (msg: string) => void;
}

export default function DeepDiveModal({
  isOpen,
  onClose,
  note,
  apiPost,
  onToast
}: DeepDiveModalProps) {
  // タブ: 'decision' | 'issues' | 'analysis' | 'review' | 'history' | 'prompts' | 'spreadsheet'
  const [activeTab, setActiveTab] = useState<
    "decision" | "issues" | "analysis" | "review" | "history" | "prompts" | "spreadsheet"
  >("decision");

  // 現在の分析セッション
  const [analysisId, setAnalysisId] = useState<string>(() => `dd-${note.id}-${Date.now()}`);

  // Deep Dive Decision State
  const [decision, setDecision] = useState<DeepDiveDecision>(() => {
    const past = getStoredDecisions(note.id);
    if (past.length > 0) {
      return past[0];
    }
    const ymd = getNoteYMD(note) || (note.dateStr ? note.dateStr.slice(0, 10) : new Date(note.createdAt).toLocaleDateString("ja-JP"));
    return {
      analysisId: `dd-${note.id}-${Date.now()}`,
      articleId: note.id,
      articleTitle: note.title || "",
      articleUrl: note.sourceUrl || "",
      publishedDate: ymd,
      registeredDate: new Date(note.createdAt).toISOString().slice(0, 10),
      existingSummary: note.summary || "",
      keywords: note.keywords || "",
      marketTrendSummary: note.timeline || "",
      coreClaim: "",
      articleType: "新技術",
      currentStage: "実証実験",
      importanceEval: "",
      currentFeasibility: "",
      priority: "medium",
      reasonForDeepDive: "",
      reasonForSkipping: "",
      missingInformation: "",
      recommendedIssues: [],
      reassessmentConditions: "",
      aiVerdict: "",
      userFinalDecision: "",
      decisionDate: new Date().toISOString(),
      status: "decided"
    };
  });

  // Issues State (STEP 3)
  const [issues, setIssues] = useState<DeepDiveIssue[]>([]);
  const [isGeneratingIssues, setIsGeneratingIssues] = useState(false);

  // Analysis Results State (STEP 4)
  const [analysisResults, setAnalysisResults] = useState<DeepDiveAnalysisResult[]>(() => {
    return getStoredAnalyses(decision.analysisId);
  });
  const [analyzingIssueIndex, setAnalyzingIssueIndex] = useState<number | null>(null);

  // Review State (STEP 5)
  const [reviews, setReviews] = useState<DeepDiveReview[]>(() => {
    return getStoredReviews(note.id);
  });
  const [newReviewOutcome, setNewReviewOutcome] = useState("");
  const [isGeneratingReview, setIsGeneratingReview] = useState(false);

  // Prompts State
  const [prompts, setPrompts] = useState(getCustomDeepDivePrompts());

  // Spreadsheet URL State
  const [spreadsheetUrl, setSpreadsheetUrlState] = useState(getDeepDiveSpreadsheetUrl());
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [saveErrorMessage, setSaveErrorMessage] = useState("");

  // AI Loading & External AI Support
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [externalPromptText, setExternalPromptText] = useState("");
  const [externalJsonInput, setExternalJsonInput] = useState("");
  const [showExternalAiModal, setShowExternalAiModal] = useState(false);
  const [externalTargetTab, setExternalTargetTab] = useState<"decision" | "issues" | "analysis" | "review">("decision");
  const [externalAnalysisIssueId, setExternalAnalysisIssueId] = useState<string>("all");
  const [isCopiedExternalPrompt, setIsCopiedExternalPrompt] = useState(false);

  // Synchronize when note changes
  useEffect(() => {
    const past = getStoredDecisions(note.id);
    if (past.length > 0) {
      setDecision(past[0]);
      setAnalysisId(past[0].analysisId);
      setAnalysisResults(getStoredAnalyses(past[0].analysisId));
    } else {
      const newId = `dd-${note.id}-${Date.now()}`;
      setAnalysisId(newId);
      const ymd = getNoteYMD(note) || (note.dateStr ? note.dateStr.slice(0, 10) : new Date(note.createdAt).toLocaleDateString("ja-JP"));
      setDecision({
        analysisId: newId,
        articleId: note.id,
        articleTitle: note.title || "",
        articleUrl: note.sourceUrl || "",
        publishedDate: ymd,
        registeredDate: new Date(note.createdAt).toISOString().slice(0, 10),
        existingSummary: note.summary || "",
        keywords: note.keywords || "",
        marketTrendSummary: note.timeline || "",
        coreClaim: "",
        articleType: "新技術",
        currentStage: "実証実験",
        importanceEval: "",
        currentFeasibility: "",
        priority: "medium",
        reasonForDeepDive: "",
        reasonForSkipping: "",
        missingInformation: "",
        recommendedIssues: [],
        reassessmentConditions: "",
        aiVerdict: "",
        userFinalDecision: "",
        decisionDate: new Date().toISOString(),
        status: "decided"
      });
      setIssues([]);
      setAnalysisResults([]);
    }
    setReviews(getStoredReviews(note.id));
  }, [note.id]);

  if (!isOpen) return null;

  /* ================================================================== */
  /* 外部AIプロンプト生成ヘルパー（全STEP 1〜4 対応）                        */
  /* ================================================================== */

  const getAnalysisPromptForTarget = (targetIssueId: string) => {
    if (targetIssueId === "all") {
      const targets = issues.filter(iss => iss.selectedForAnalysis);
      const listToUse = targets.length > 0 ? targets : issues;
      if (listToUse.length === 0) {
        const tempIssue: DeepDiveIssue = {
          issueId: "iss-default",
          title: decision.coreClaim || note.title || "主要論点の検証",
          importanceReason: decision.importanceEval || "新技術・市場への影響評価",
          knownFacts: note.summary || "",
          unknownPoints: decision.missingInformation || "実用化コストと普及障壁",
          investigationMethod: "追加公開情報の調査",
          sourcesToVerify: "企業IR・論文・専門統計",
          conditionsToChangeVerdict: "前提条件の乖離",
          selectedForAnalysis: true
        };
        return buildDeepDiveAnalysisPrompt(note, tempIssue, prompts.ANALYSIS);
      } else if (listToUse.length === 1) {
        return buildDeepDiveAnalysisPrompt(note, listToUse[0], prompts.ANALYSIS);
      } else {
        return buildDeepDiveBatchAnalysisPrompt(note, listToUse);
      }
    } else {
      const targetIss = issues.find(i => i.issueId === targetIssueId) || issues[0];
      if (targetIss) {
        return buildDeepDiveAnalysisPrompt(note, targetIss, prompts.ANALYSIS);
      }
      return "";
    }
  };

  const openExternalAiModal = (
    targetTab: "decision" | "issues" | "analysis" | "review",
    issueId?: string
  ) => {
    setExternalTargetTab(targetTab);
    setExternalJsonInput("");
    setIsCopiedExternalPrompt(false);
    if (targetTab === "decision") {
      setExternalPromptText(buildDeepDiveDecisionPrompt(note, prompts.DECISION));
    } else if (targetTab === "issues") {
      setExternalPromptText(buildDeepDiveIssuesPrompt(note, decision, prompts.ISSUES));
    } else if (targetTab === "analysis") {
      const selId = issueId || "all";
      setExternalAnalysisIssueId(selId);
      setExternalPromptText(getAnalysisPromptForTarget(selId));
    } else if (targetTab === "review") {
      const outcome = newReviewOutcome.trim() || "（後日判明した事実・実際の動向をここに入力するか、プロンプト内で修正してください）";
      setExternalPromptText(buildDeepDiveReviewPrompt(note, decision, outcome, prompts.REVIEW));
    }
    setShowExternalAiModal(true);
  };

  /* ================================================================== */
  /* STEP 1 & 2: 深掘り判断実行                                           */
  /* ================================================================== */

  const handleRunDecisionAI = async () => {
    const apiKey = localStorage.getItem("cn_gemini_key");
    const prompt = buildDeepDiveDecisionPrompt(note, prompts.DECISION);

    if (!apiKey) {
      openExternalAiModal("decision");
      return;
    }

    setIsEvaluating(true);
    try {
      const responseText = await callGeminiForDeepDive(prompt, apiKey);
      const parsed = extractJsonFromText(responseText);

      const updated: DeepDiveDecision = {
        ...decision,
        analysisId,
        articleId: note.id,
        articleTitle: note.title || "",
        articleUrl: note.sourceUrl || "",
        coreClaim: parsed.coreClaim || "",
        articleType: parsed.articleType || "新技術",
        currentStage: parsed.currentStage || "実証実験",
        importanceEval: parsed.importanceEval || "",
        currentFeasibility: parsed.currentFeasibility || "",
        priority: (parsed.priority === "high" || parsed.priority === "low") ? parsed.priority : "medium",
        reasonForDeepDive: parsed.reasonForDeepDive || "",
        reasonForSkipping: parsed.reasonForSkipping || "",
        missingInformation: parsed.missingInformation || "",
        recommendedIssues: Array.isArray(parsed.recommendedIssues) ? parsed.recommendedIssues : [],
        reassessmentConditions: parsed.reassessmentConditions || "",
        aiVerdict: parsed.aiVerdict || "",
        userFinalDecision: parsed.priority === "high" ? "深掘り推奨" : parsed.priority === "medium" ? "条件付き深掘り" : "深掘り見送り",
        decisionDate: new Date().toISOString(),
        status: "decided"
      };

      setDecision(updated);
      saveStoredDecision(updated);
      onToast("深掘り判断が完了しました ✦");

      // 初期の論点リストを提案されたものから自動作成
      if (Array.isArray(parsed.recommendedIssues) && parsed.recommendedIssues.length > 0) {
        const initialIssues: DeepDiveIssue[] = parsed.recommendedIssues.slice(0, 5).map((txt: string, idx: number) => ({
          issueId: `iss-${idx + 1}`,
          title: txt.replace(/^論点\d+[:：]\s*/, "").trim(),
          importanceReason: "意思決定において検証すべき重要な論点",
          knownFacts: "記事および公開情報に基づく概要",
          unknownPoints: "不確実なコスト、技術的ボトルネック、または市場需要",
          investigationMethod: "専門機関レポート、業界統計、企業開示情報の精査",
          sourcesToVerify: "企業IR、業界専門誌、特許公報、学術論文",
          conditionsToChangeVerdict: "前提を覆す定量的データまたは法規制の変化",
          selectedForAnalysis: true
        }));
        setIssues(initialIssues);
      }
    } catch (err: any) {
      console.error(err);
      alert(`深掘り判断エラー: ${err.message || String(err)}`);
    } finally {
      setIsEvaluating(false);
    }
  };

  /* ================================================================== */
  /* STEP 3: 調査論点の自動抽出                                           */
  /* ================================================================== */

  const handleGenerateIssues = async () => {
    const apiKey = localStorage.getItem("cn_gemini_key");
    const prompt = buildDeepDiveIssuesPrompt(note, decision, prompts.ISSUES);

    if (!apiKey) {
      openExternalAiModal("issues");
      return;
    }

    setIsGeneratingIssues(true);
    try {
      const responseText = await callGeminiForDeepDive(prompt, apiKey);
      const parsed = extractJsonFromText(responseText);

      if (Array.isArray(parsed) && parsed.length > 0) {
        const newIssues: DeepDiveIssue[] = parsed.slice(0, 5).map((item: any, idx: number) => ({
          issueId: `iss-${Date.now()}-${idx + 1}`,
          title: item.title || `論点 ${idx + 1}`,
          importanceReason: item.importanceReason || "",
          knownFacts: item.knownFacts || "",
          unknownPoints: item.unknownPoints || "",
          investigationMethod: item.investigationMethod || "",
          sourcesToVerify: item.sourcesToVerify || "",
          conditionsToChangeVerdict: item.conditionsToChangeVerdict || "",
          selectedForAnalysis: true
        }));
        setIssues(newIssues);
        onToast("調査論点を提案しました ✦");
      }
    } catch (err: any) {
      console.error(err);
      alert(`論点抽出エラー: ${err.message || String(err)}`);
    } finally {
      setIsGeneratingIssues(false);
    }
  };

  /* ================================================================== */
  /* STEP 4: 選択論点の順次深掘り分析                                       */
  /* ================================================================== */

  const handleRunAnalysisForIssue = async (issue: DeepDiveIssue, index: number) => {
    const apiKey = localStorage.getItem("cn_gemini_key");
    const prompt = buildDeepDiveAnalysisPrompt(note, issue, prompts.ANALYSIS);

    if (!apiKey) {
      openExternalAiModal("analysis", issue.issueId);
      return;
    }

    setAnalyzingIssueIndex(index);
    try {
      const responseText = await callGeminiForDeepDive(prompt, apiKey);
      const parsed = extractJsonFromText(responseText);

      const result: DeepDiveAnalysisResult = {
        analysisId: decision.analysisId,
        articleId: note.id,
        issueId: issue.issueId,
        articleTitle: note.title || "",
        issueTitle: issue.title,
        researchGoal: parsed.researchGoal || issue.importanceReason,
        verifiedFacts: parsed.verifiedFacts || "",
        sourceUrlAndEvidence: parsed.sourceUrlAndEvidence || "",
        sourcePublishedDate: parsed.sourcePublishedDate || "",
        estimatesAndHypotheses: parsed.estimatesAndHypotheses || "",
        unknownsAndGaps: parsed.unknownsAndGaps || "",
        hinderingFactors: parsed.hinderingFactors || "",
        analysisConclusion: parsed.analysisConclusion || "",
        confidenceScoreAndReason: parsed.confidenceScoreAndReason || "",
        futureCheckpoints: parsed.futureCheckpoints || "",
        analyzedDate: new Date().toISOString(),
        userComment: ""
      };

      setAnalysisResults(prev => {
        const next = prev.filter(r => r.issueId !== issue.issueId);
        next.push(result);
        saveStoredAnalyses(next);
        return next;
      });

      onToast(`論点「${issue.title}」の深掘り分析が完了しました ✦`);
    } catch (err: any) {
      console.error(err);
      alert(`論点分析エラー: ${err.message || String(err)}`);
    } finally {
      setAnalyzingIssueIndex(null);
    }
  };

  const handleRunAllSelectedAnalyses = async () => {
    const targets = issues.filter(iss => iss.selectedForAnalysis);
    if (targets.length === 0) {
      alert("分析対象の論点が選択されていません。チェックボックスをONにしてください。");
      return;
    }
    for (let i = 0; i < issues.length; i++) {
      if (issues[i].selectedForAnalysis) {
        await handleRunAnalysisForIssue(issues[i], i);
      }
    }
    onToast("選択された全ての論点の深掘り分析が完了しました！");
  };

  /* ================================================================== */
  /* STEP 5: 予測と実績の振り返り                                          */
  /* ================================================================== */

  const handleGenerateReview = async () => {
    if (!newReviewOutcome.trim()) {
      alert("実際に起きたこと・判明した事実を入力してください。");
      return;
    }
    const apiKey = localStorage.getItem("cn_gemini_key");
    const prompt = buildDeepDiveReviewPrompt(note, decision, newReviewOutcome, prompts.REVIEW);

    if (!apiKey) {
      openExternalAiModal("review");
      return;
    }

    setIsGeneratingReview(true);
    try {
      const responseText = await callGeminiForDeepDive(prompt, apiKey);
      const parsed = extractJsonFromText(responseText);

      const rev: DeepDiveReview = {
        reviewId: `rev-${Date.now()}`,
        articleId: note.id,
        analysisId: decision.analysisId,
        originalForecast: decision.coreClaim || decision.importanceEval,
        forecastTarget: decision.articleTitle,
        forecastTargetDate: decision.publishedDate,
        forecastAssumptions: decision.currentFeasibility,
        verdictAtForecast: decision.aiVerdict || decision.userFinalDecision,
        actualOutcome: newReviewOutcome.trim(),
        alignment: parsed.alignment || "unknown",
        reasonForOutcome: parsed.reasonForOutcome || "",
        learnings: parsed.learnings || "",
        reviewDate: new Date().toISOString()
      };

      setReviews(prev => [rev, ...prev]);
      saveStoredReview(rev);
      setNewReviewOutcome("");
      onToast("振り返り分析を記録しました ✦");
    } catch (err: any) {
      console.error(err);
      alert(`振り返り生成エラー: ${err.message || String(err)}`);
    } finally {
      setIsGeneratingReview(false);
    }
  };

  /* ================================================================== */
  /* Google スプレッドシート保存処理                                        */
  /* ================================================================== */

  const handleSaveToSpreadsheet = async () => {
    setSaveStatus("saving");
    setSaveErrorMessage("");

    try {
      // 1. 判断データの保存
      const decRes = await apiPost({
        action: "saveDeepDiveDecision",
        decision: decision,
        deepDiveSpreadsheetUrl: spreadsheetUrl
      });
      if (decRes && decRes.error) {
        throw new Error(decRes.error);
      }

      // 2. 分析結果がある場合は保存
      if (analysisResults.length > 0) {
        const anaRes = await apiPost({
          action: "saveDeepDiveAnalysis",
          analyses: analysisResults,
          deepDiveSpreadsheetUrl: spreadsheetUrl
        });
        if (anaRes && anaRes.error) {
          throw new Error(anaRes.error);
        }
      }

      // 3. 振り返りデータがある場合は保存
      if (reviews.length > 0) {
        for (const rev of reviews) {
          await apiPost({
            action: "saveDeepDiveReview",
            review: rev,
            deepDiveSpreadsheetUrl: spreadsheetUrl
          });
        }
      }

      setSaveStatus("success");
      onToast("Googleスプレッドシートへの保存に成功しました ✦");
    } catch (err: any) {
      console.error("Spreadsheet save failed:", err);
      setSaveStatus("error");
      setSaveErrorMessage(err.message || String(err));
    }
  };

  const handleInitializeSheets = async () => {
    setSaveStatus("saving");
    setSaveErrorMessage("");
    try {
      const res = await apiPost({
        action: "initDeepDiveSheets",
        deepDiveSpreadsheetUrl: spreadsheetUrl
      });
      if (res && res.error) {
        throw new Error(res.error);
      }
      setSaveStatus("success");
      onToast("スプレッドシートの3タブを正常に初期化・確認しました ✦");
    } catch (err: any) {
      console.error(err);
      setSaveStatus("error");
      setSaveErrorMessage(err.message || String(err));
    }
  };

  /* ================================================================== */
  /* 外部AI返答のパース適用                                                */
  /* ================================================================== */

  const handleApplyExternalJson = () => {
    try {
      const parsed = extractJsonFromText(externalJsonInput);

      if (externalTargetTab === "decision") {
        const updatedDecision: DeepDiveDecision = {
          ...decision,
          coreClaim: parsed.coreClaim || decision.coreClaim,
          articleType: parsed.articleType || decision.articleType,
          currentStage: parsed.currentStage || decision.currentStage,
          importanceEval: parsed.importanceEval || decision.importanceEval,
          currentFeasibility: parsed.currentFeasibility || decision.currentFeasibility,
          priority: (parsed.priority === "high" || parsed.priority === "low") ? parsed.priority : "medium",
          reasonForDeepDive: parsed.reasonForDeepDive || decision.reasonForDeepDive,
          reasonForSkipping: parsed.reasonForSkipping || decision.reasonForSkipping,
          missingInformation: parsed.missingInformation || decision.missingInformation,
          recommendedIssues: Array.isArray(parsed.recommendedIssues) ? parsed.recommendedIssues : decision.recommendedIssues,
          reassessmentConditions: parsed.reassessmentConditions || decision.reassessmentConditions,
          aiVerdict: parsed.aiVerdict || decision.aiVerdict,
          userFinalDecision: parsed.priority === "high" ? "深掘り推奨" : parsed.priority === "medium" ? "条件付き深掘り" : "深掘り見送り"
        };
        setDecision(updatedDecision);
        saveStoredDecision(updatedDecision);
        onToast("外部AIの深掘り判断（Step 1）を適用・保存しました ✦");
      } else if (externalTargetTab === "issues") {
        let items: any[] = [];
        if (Array.isArray(parsed)) {
          items = parsed;
        } else if (parsed && Array.isArray(parsed.issues)) {
          items = parsed.issues;
        } else if (parsed && typeof parsed === "object") {
          items = [parsed];
        }

        if (items.length > 0) {
          const newIssues: DeepDiveIssue[] = items.map((item: any, idx: number) => ({
            issueId: `iss-ext-${Date.now()}-${idx + 1}`,
            title: item.title || item.issueTitle || `論点 ${idx + 1}`,
            importanceReason: item.importanceReason || item.reason || "",
            knownFacts: item.knownFacts || "",
            unknownPoints: item.unknownPoints || "",
            investigationMethod: item.investigationMethod || "",
            sourcesToVerify: item.sourcesToVerify || "",
            conditionsToChangeVerdict: item.conditionsToChangeVerdict || "",
            selectedForAnalysis: true
          }));
          setIssues(newIssues);
          onToast(`外部AIの調査論点提案（Step 2: ${newIssues.length}件）を適用しました ✦`);
        } else {
          throw new Error("有効な論点リストが見つかりませんでした。");
        }
      } else if (externalTargetTab === "analysis") {
        let items: any[] = [];
        if (Array.isArray(parsed)) {
          items = parsed;
        } else if (parsed && Array.isArray(parsed.analyses)) {
          items = parsed.analyses;
        } else if (parsed && typeof parsed === "object") {
          items = [parsed];
        }

        if (items.length === 0) {
          throw new Error("有効な分析結果JSONが見つかりませんでした。");
        }

        const newResults: DeepDiveAnalysisResult[] = [];
        items.forEach((item: any, idx: number) => {
          const matchingIssue =
            issues.find(iss => iss.issueId === item.issueId || iss.title === item.issueTitle || (item.issueTitle && iss.title.includes(item.issueTitle))) ||
            (externalAnalysisIssueId !== "all" ? issues.find(iss => iss.issueId === externalAnalysisIssueId) : null) ||
            issues[idx] || {
              issueId: `iss-ext-${Date.now()}-${idx + 1}`,
              title: item.issueTitle || `論点 #${idx + 1}`,
              importanceReason: ""
            };

          newResults.push({
            analysisId: decision.analysisId,
            articleId: note.id,
            issueId: matchingIssue.issueId,
            articleTitle: note.title || "",
            issueTitle: item.issueTitle || matchingIssue.title,
            researchGoal: item.researchGoal || matchingIssue.importanceReason || "",
            verifiedFacts: item.verifiedFacts || "",
            sourceUrlAndEvidence: item.sourceUrlAndEvidence || "",
            sourcePublishedDate: item.sourcePublishedDate || "",
            estimatesAndHypotheses: item.estimatesAndHypotheses || "",
            unknownsAndGaps: item.unknownsAndGaps || "",
            hinderingFactors: item.hinderingFactors || "",
            analysisConclusion: item.analysisConclusion || "",
            confidenceScoreAndReason: item.confidenceScoreAndReason || "",
            futureCheckpoints: item.futureCheckpoints || "",
            analyzedDate: new Date().toISOString(),
            userComment: ""
          });
        });

        setAnalysisResults(prev => {
          const next = [...prev];
          newResults.forEach(res => {
            const existingIdx = next.findIndex(r => r.issueId === res.issueId);
            if (existingIdx >= 0) {
              next[existingIdx] = res;
            } else {
              next.push(res);
            }
          });
          saveStoredAnalyses(next);
          return next;
        });

        onToast(`外部AIによる深掘り分析結果（Step 3: ${newResults.length}件）を適用・保存しました ✦`);
      } else if (externalTargetTab === "review") {
        const rev: DeepDiveReview = {
          reviewId: `rev-ext-${Date.now()}`,
          articleId: note.id,
          analysisId: decision.analysisId,
          originalForecast: decision.coreClaim || decision.importanceEval,
          forecastTarget: decision.articleTitle || note.title,
          forecastTargetDate: decision.publishedDate,
          forecastAssumptions: decision.currentFeasibility,
          verdictAtForecast: decision.aiVerdict || decision.userFinalDecision,
          actualOutcome: newReviewOutcome.trim() || parsed.actualOutcome || "外部入力による実績動向",
          alignment: parsed.alignment || "matched",
          reasonForOutcome: parsed.reasonForOutcome || "",
          learnings: parsed.learnings || "",
          reviewDate: new Date().toISOString()
        };
        setReviews(prev => [rev, ...prev]);
        saveStoredReview(rev);
        setNewReviewOutcome("");
        onToast("外部AIによる予測振り返り（Step 4）を適用・記録しました ✦");
      }
      setShowExternalAiModal(false);
      setExternalJsonInput("");
    } catch (e: any) {
      alert("JSONパース・適用エラー: " + e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] bg-black/80 flex items-center justify-center p-2 sm:p-4 text-[var(--text)] animate-[fadeIn_0.15s_ease-out]">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-5xl h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Top Header */}
        <div className="px-4 py-3 border-b border-[var(--border)] bg-[#161b22] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 font-bold flex items-center justify-center shrink-0">
              <Search className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-[var(--bright)] truncate">深掘り判断・分析・蓄積</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  decision.priority === "high" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" :
                  decision.priority === "medium" ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" :
                  "bg-slate-500/20 text-slate-300 border border-slate-500/40"
                }`}>
                  優先度: {decision.priority === "high" ? "高（積極深掘り）" : decision.priority === "medium" ? "中（条件付き）" : "低（見送り）"}
                </span>
              </div>
              <p className="text-[11px] text-[var(--muted)] truncate max-w-xl">
                対象: {note.title || "無題"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleSaveToSpreadsheet}
              disabled={saveStatus === "saving"}
              className="px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white font-bold text-xs rounded-md transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="深掘り判断と分析結果をGoogleスプレッドシートに保存"
            >
              {saveStatus === "saving" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5" />
              )}
              <span>スプレッドシート保存</span>
            </button>
            <button
              onClick={onClose}
              className="px-2 py-1 text-[var(--muted)] hover:text-white text-base font-bold transition-colors cursor-pointer"
              title="閉じる"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-4 py-2 border-b border-[var(--border)] bg-[#0d1117] flex items-center gap-1.5 overflow-x-auto text-xs font-semibold shrink-0">
          <button
            onClick={() => setActiveTab("decision")}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "decision" ? "bg-sky-600 text-white" : "text-[var(--subtle)] hover:text-white hover:bg-[#21262d]"
            }`}
          >
            <span>1. 深掘り判断</span>
          </button>
          <button
            onClick={() => setActiveTab("issues")}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "issues" ? "bg-sky-600 text-white" : "text-[var(--subtle)] hover:text-white hover:bg-[#21262d]"
            }`}
          >
            <span>2. 調査論点の設定</span>
            {issues.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px] font-mono">{issues.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("analysis")}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "analysis" ? "bg-sky-600 text-white" : "text-[var(--subtle)] hover:text-white hover:bg-[#21262d]"
            }`}
          >
            <span>3. 深掘り分析結果</span>
            {analysisResults.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-900/60 text-emerald-300 text-[10px] font-mono">{analysisResults.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("review")}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "review" ? "bg-sky-600 text-white" : "text-[var(--subtle)] hover:text-white hover:bg-[#21262d]"
            }`}
          >
            <span>4. 予測振り返り</span>
            {reviews.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-purple-900/60 text-purple-300 text-[10px] font-mono">{reviews.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "history" ? "bg-sky-600 text-white" : "text-[var(--subtle)] hover:text-white hover:bg-[#21262d]"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>履歴</span>
          </button>
          <button
            onClick={() => setActiveTab("spreadsheet")}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "spreadsheet" ? "bg-sky-600 text-white" : "text-[var(--subtle)] hover:text-white hover:bg-[#21262d]"
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>シート設定</span>
          </button>
          <button
            onClick={() => setActiveTab("prompts")}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "prompts" ? "bg-sky-600 text-white" : "text-[var(--subtle)] hover:text-white hover:bg-[#21262d]"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>プロンプト管理</span>
          </button>
        </div>

        {/* Status notification banner if needed */}
        {saveStatus === "error" && (
          <div className="px-4 py-2 bg-red-950/40 border-b border-red-500/30 text-red-300 text-xs flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>スプレッドシートへの保存に失敗しました: {saveErrorMessage}</span>
            </div>
            <button
              onClick={handleSaveToSpreadsheet}
              className="px-2.5 py-1 bg-red-800 hover:bg-red-700 text-white font-bold rounded text-xs transition-colors"
            >
              再試行
            </button>
          </div>
        )}
        {saveStatus === "success" && (
          <div className="px-4 py-1.5 bg-emerald-950/30 border-b border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Googleスプレッドシート（3タブ）に最新の判断・分析・振り返り結果が正常に同期されました。</span>
            </div>
            <button onClick={() => setSaveStatus("idle")} className="text-emerald-400 hover:text-white">✕</button>
          </div>
        )}

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

          {/* ======================================================== */}
          {/* TAB 1: 深掘り判断 (STEP 1 & 2)                             */}
          {/* ======================================================== */}
          {activeTab === "decision" && (
            <div className="space-y-6 max-w-4xl mx-auto">
              
              {/* Context Summary Box */}
              <div className="p-4 bg-[#161b22] border border-[var(--border2)] rounded-xl space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border2)] pb-2">
                  <span className="font-bold text-[var(--bright)] text-sm flex items-center gap-1.5">
                    <span>📰</span> 既存記事データ（再生成せずそのまま利用）
                  </span>
                  <span className="text-[var(--muted)]">掲載日: {decision.publishedDate}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-[11px]">
                  <div>
                    <span className="text-[var(--muted)] font-bold block mb-0.5">保存済み要約:</span>
                    <p className="text-[var(--text)] line-clamp-3 bg-[#0d1117] p-2 rounded border border-[var(--border2)]">
                      {note.summary || "（保存済み要約はありません。記事本文を利用します）"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[var(--muted)] font-bold block mb-0.5">抽出済みキーワード / 市場動向:</span>
                    <div className="text-[var(--text)] bg-[#0d1117] p-2 rounded border border-[var(--border2)] space-y-1">
                      <div><span className="text-[var(--subtle)]">KW:</span> {note.keywords || "未設定"}</div>
                      <div className="line-clamp-2"><span className="text-[var(--subtle)]">動向:</span> {note.timeline || "未設定"}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Trigger Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-gradient-to-r from-sky-950/20 via-blue-950/20 to-transparent border border-sky-500/20 rounded-xl">
                <div>
                  <h3 className="text-sm font-bold text-[var(--bright)]">STEP 1 & 2: 深掘りする意味があるか判定</h3>
                  <p className="text-xs text-[var(--muted)]">
                    影響の大きさと実現可能性を区別し、追加調査で不確実性を解消できるかを評価します。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRunDecisionAI}
                    disabled={isEvaluating}
                    className="px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    {isEvaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    <span>{isEvaluating ? "深掘り判断中..." : "深掘りする意味を判定"}</span>
                  </button>
                  <button
                    onClick={() => openExternalAiModal("decision")}
                    className="px-3 py-2 bg-[#21262d] hover:bg-[#30363d] text-[var(--bright)] font-semibold text-xs rounded-lg border border-[var(--border2)] transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                    title="外部AI（ChatGPT等）用の深掘り判断プロンプトを表示してコピー"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>外部AI用プロンプト</span>
                  </button>
                </div>
              </div>

              {/* Decision Results Form (Editable by User) */}
              <div className="bg-[#161b22] border border-[var(--border2)] rounded-xl p-5 space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-[var(--border2)] pb-3">
                  <h4 className="font-bold text-[var(--bright)] text-sm flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-sky-400" />
                    <span>深掘り判断結果（AI判定・ユーザー編集可能）</span>
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--muted)] font-semibold">深掘り優先度:</span>
                    {(["high", "medium", "low"] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setDecision(prev => ({ ...prev, priority: p }))}
                        className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                          decision.priority === p
                            ? p === "high" ? "bg-emerald-600 text-white shadow"
                              : p === "medium" ? "bg-amber-600 text-white shadow"
                              : "bg-slate-600 text-white shadow"
                            : "bg-[#21262d] text-[var(--muted)] hover:text-white"
                        }`}
                      >
                        {p === "high" ? "高（深掘り推奨）" : p === "medium" ? "中（条件付き）" : "低（見送り）"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-[var(--bright)] mb-1">記事の主要な主張</label>
                    <textarea
                      value={decision.coreClaim}
                      onChange={e => setDecision(prev => ({ ...prev, coreClaim: e.target.value }))}
                      placeholder="この記事が提示している最も核心的な主張..."
                      className="w-full bg-[#0d1117] border border-[var(--border2)] rounded-lg p-2.5 text-xs text-[var(--bright)] h-20 resize-none focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[var(--bright)] mb-1">AIの総合判定要約</label>
                    <textarea
                      value={decision.aiVerdict}
                      onChange={e => setDecision(prev => ({ ...prev, aiVerdict: e.target.value }))}
                      placeholder="AIによる深掘り価値の判定理由..."
                      className="w-full bg-[#0d1117] border border-[var(--border2)] rounded-lg p-2.5 text-xs text-[var(--bright)] h-20 resize-none focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-[var(--bright)] mb-1">重要性・影響規模の評価（一時的か長期的か）</label>
                    <textarea
                      value={decision.importanceEval}
                      onChange={e => setDecision(prev => ({ ...prev, importanceEval: e.target.value }))}
                      placeholder="経済・産業・社会への影響規模と持続性..."
                      className="w-full bg-[#0d1117] border border-[var(--border2)] rounded-lg p-2.5 text-xs text-[var(--bright)] h-20 resize-none focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[var(--bright)] mb-1">現時点の実現可能性・前提条件</label>
                    <textarea
                      value={decision.currentFeasibility}
                      onChange={e => setDecision(prev => ({ ...prev, currentFeasibility: e.target.value }))}
                      placeholder="何が事実で、何が期待・推測か。前提条件..."
                      className="w-full bg-[#0d1117] border border-[var(--border2)] rounded-lg p-2.5 text-xs text-[var(--bright)] h-20 resize-none focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-[var(--bright)] mb-1">
                      {decision.priority === "low" ? "深掘りしない場合の理由" : "深掘りする意味がある理由"}
                    </label>
                    <textarea
                      value={decision.priority === "low" ? decision.reasonForSkipping : decision.reasonForDeepDive}
                      onChange={e => setDecision(prev => ({
                        ...prev,
                        [decision.priority === "low" ? "reasonForSkipping" : "reasonForDeepDive"]: e.target.value
                      }))}
                      placeholder="なぜ追加調査を行う価値があるのか、あるいは無いのか..."
                      className="w-full bg-[#0d1117] border border-[var(--border2)] rounded-lg p-2.5 text-xs text-[var(--bright)] h-20 resize-none focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[var(--bright)] mb-1">現時点で不足している情報 / 再評価すべき条件</label>
                    <textarea
                      value={decision.missingInformation}
                      onChange={e => setDecision(prev => ({ ...prev, missingInformation: e.target.value }))}
                      placeholder="判断のために追加で調べる必要がある事項..."
                      className="w-full bg-[#0d1117] border border-[var(--border2)] rounded-lg p-2.5 text-xs text-[var(--bright)] h-20 resize-none focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                {/* Bottom Control buttons */}
                <div className="pt-2 border-t border-[var(--border2)] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        saveStoredDecision(decision);
                        onToast("深掘り判断をローカルに保存しました 💾");
                      }}
                      className="px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] text-[var(--bright)] font-semibold rounded-md border border-[var(--border2)] transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5 text-sky-400" />
                      <span>判定を保存</span>
                    </button>
                    <button
                      onClick={handleSaveToSpreadsheet}
                      className="px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white font-bold rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>スプレッドシートへ保存</span>
                    </button>
                  </div>

                  {decision.priority !== "low" && (
                    <button
                      onClick={() => setActiveTab("issues")}
                      className="px-4 py-1.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold rounded-md transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <span>次へ: 論点を設定して深掘りを開始</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: 調査論点の設定 (STEP 3)                              */}
          {/* ======================================================== */}
          {activeTab === "issues" && (
            <div className="space-y-6 max-w-4xl mx-auto">
              
              <div className="p-4 bg-gradient-to-r from-sky-950/20 via-blue-950/20 to-transparent border border-sky-500/20 rounded-xl flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[var(--bright)] flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-sky-400" />
                    <span>STEP 3: 調査すべき重要論点の設定（最大5件）</span>
                  </h3>
                  <p className="text-xs text-[var(--muted)]">
                    新技術の成立条件・市場の需要・将来予測のシナリオに基づき、優先して調べる論点を選定します。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGenerateIssues}
                    disabled={isGeneratingIssues}
                    className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    {isGeneratingIssues ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>AIに論点を再提案させる</span>
                  </button>
                  <button
                    onClick={() => openExternalAiModal("issues")}
                    className="px-3 py-2 bg-[#21262d] hover:bg-[#30363d] text-[var(--bright)] font-semibold text-xs rounded-lg border border-[var(--border2)] transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                    title="外部AI（ChatGPT等）用の調査論点提案プロンプトを表示してコピー"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>外部AI用プロンプト</span>
                  </button>
                  <button
                    onClick={() => {
                      const newIss: DeepDiveIssue = {
                        issueId: `iss-manual-${Date.now()}`,
                        title: "新しい調査論点",
                        importanceReason: "",
                        knownFacts: "",
                        unknownPoints: "",
                        investigationMethod: "",
                        sourcesToVerify: "",
                        conditionsToChangeVerdict: "",
                        selectedForAnalysis: true
                      };
                      setIssues(prev => [...prev, newIss]);
                    }}
                    className="px-3 py-2 bg-[#21262d] hover:bg-[#30363d] text-[var(--bright)] font-semibold text-xs rounded-lg border border-[var(--border2)] transition-colors cursor-pointer"
                  >
                    ＋ 論点を追加
                  </button>
                </div>
              </div>

              {issues.length === 0 ? (
                <div className="text-center py-12 bg-[#161b22] border border-[var(--border2)] rounded-xl space-y-3">
                  <div className="text-3xl">📋</div>
                  <h4 className="text-sm font-bold text-[var(--bright)]">論点がまだ設定されていません</h4>
                  <p className="text-xs text-[var(--muted)] max-w-md mx-auto">
                    「AIに論点を再提案させる」を押すか、外部AIプロンプトを利用して調査を進めてください。
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={handleGenerateIssues}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-md cursor-pointer shadow-sm"
                    >
                      論点をAI提案させる
                    </button>
                    <button
                      onClick={() => openExternalAiModal("issues")}
                      className="px-3.5 py-2 bg-[#21262d] hover:bg-[#30363d] text-[var(--bright)] font-semibold text-xs rounded-md border border-[var(--border2)] transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-400" />
                      <span>外部AI用プロンプト</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {issues.map((iss, idx) => (
                    <div
                      key={iss.issueId}
                      className={`p-4 bg-[#161b22] border rounded-xl space-y-3 transition-all ${
                        iss.selectedForAnalysis ? "border-sky-500/40 shadow-sm" : "border-[var(--border2)] opacity-70"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-[var(--border2)] pb-2.5">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <label className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={iss.selectedForAnalysis}
                              onChange={e => {
                                const checked = e.target.checked;
                                setIssues(prev => prev.map((item, i) => i === idx ? { ...item, selectedForAnalysis: checked } : item));
                              }}
                              className="w-4 h-4 text-sky-600 rounded"
                            />
                            <span className="text-xs font-bold text-sky-400">論点 #{idx + 1}</span>
                          </label>
                          <input
                            type="text"
                            value={iss.title}
                            onChange={e => {
                              const val = e.target.value;
                              setIssues(prev => prev.map((item, i) => i === idx ? { ...item, title: val } : item));
                            }}
                            className="flex-1 bg-[#0d1117] border border-[var(--border2)] rounded px-2.5 py-1 text-xs text-[var(--bright)] font-bold focus:outline-none focus:border-sky-500"
                            placeholder="論点名..."
                          />
                        </div>
                        <button
                          onClick={() => setIssues(prev => prev.filter((_, i) => i !== idx))}
                          className="text-[var(--muted)] hover:text-red-400 p-1 cursor-pointer transition-colors"
                          title="この論点を削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">なぜ重要なのか</label>
                          <textarea
                            value={iss.importanceReason}
                            onChange={e => {
                              const val = e.target.value;
                              setIssues(prev => prev.map((item, i) => i === idx ? { ...item, importanceReason: val } : item));
                            }}
                            className="w-full bg-[#0d1117] border border-[var(--border2)] rounded p-2 text-xs text-[var(--text)] h-16 resize-none"
                            placeholder="意思決定や実現性においてなぜ決定的なのか..."
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">何を調べれば判断できるか</label>
                          <textarea
                            value={iss.investigationMethod}
                            onChange={e => {
                              const val = e.target.value;
                              setIssues(prev => prev.map((item, i) => i === idx ? { ...item, investigationMethod: val } : item));
                            }}
                            className="w-full bg-[#0d1117] border border-[var(--border2)] rounded p-2 text-xs text-[var(--text)] h-16 resize-none"
                            placeholder="具体的な調査方針や検証項目..."
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] pt-1">
                        <div>
                          <span className="text-[var(--muted)] font-semibold block mb-0.5">現時点で分かっていること:</span>
                          <input
                            type="text"
                            value={iss.knownFacts}
                            onChange={e => {
                              const val = e.target.value;
                              setIssues(prev => prev.map((item, i) => i === idx ? { ...item, knownFacts: val } : item));
                            }}
                            className="w-full bg-[#0d1117] border border-[var(--border2)] rounded px-2 py-1 text-xs"
                            placeholder="記事の事実..."
                          />
                        </div>
                        <div>
                          <span className="text-[var(--muted)] font-semibold block mb-0.5">まだ分かっていないこと:</span>
                          <input
                            type="text"
                            value={iss.unknownPoints}
                            onChange={e => {
                              const val = e.target.value;
                              setIssues(prev => prev.map((item, i) => i === idx ? { ...item, unknownPoints: val } : item));
                            }}
                            className="w-full bg-[#0d1117] border border-[var(--border2)] rounded px-2 py-1 text-xs"
                            placeholder="盲点やコスト..."
                          />
                        </div>
                        <div>
                          <span className="text-[var(--muted)] font-semibold block mb-0.5">確認すべき情報源:</span>
                          <input
                            type="text"
                            value={iss.sourcesToVerify}
                            onChange={e => {
                              const val = e.target.value;
                              setIssues(prev => prev.map((item, i) => i === idx ? { ...item, sourcesToVerify: val } : item));
                            }}
                            className="w-full bg-[#0d1117] border border-[var(--border2)] rounded px-2 py-1 text-xs"
                            placeholder="IR、特許、論文..."
                          />
                        </div>
                      </div>

                      <div className="pt-1 flex items-center justify-end gap-2">
                        <button
                          onClick={() => openExternalAiModal("analysis", iss.issueId)}
                          className="px-2.5 py-1 bg-[#21262d] hover:bg-[#30363d] text-[var(--bright)] border border-[var(--border2)] font-semibold rounded text-xs transition-colors flex items-center gap-1 cursor-pointer"
                          title="この論点単体の外部AI分析プロンプト"
                        >
                          <Download className="w-3 h-3 text-amber-400" />
                          <span>外部AIプロンプト</span>
                        </button>
                        <button
                          onClick={() => {
                            setActiveTab("analysis");
                            handleRunAnalysisForIssue(iss, idx);
                          }}
                          className="px-3 py-1 bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/40 font-bold rounded text-xs transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Zap className="w-3 h-3 text-sky-400" />
                          <span>この論点を個別分析</span>
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="p-4 bg-[#161b22] border border-[var(--border2)] rounded-xl flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-[var(--muted)]">
                      選択中: {issues.filter(i => i.selectedForAnalysis).length} / {issues.length} 件
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openExternalAiModal("analysis", "all")}
                        className="px-3.5 py-2 bg-[#21262d] hover:bg-[#30363d] text-[var(--bright)] font-semibold text-xs rounded-lg border border-[var(--border2)] transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                        title="選択したすべての論点を一括分析するプロンプト"
                      >
                        <Download className="w-3.5 h-3.5 text-amber-400" />
                        <span>外部AI用プロンプト（一括）</span>
                      </button>
                      <button
                        onClick={() => {
                          setActiveTab("analysis");
                          handleRunAllSelectedAnalyses();
                        }}
                        className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                      >
                        <Zap className="w-4 h-4" />
                        <span>選択した論点を順番に深掘り分析する</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: 深掘り分析結果 (STEP 4)                              */}
          {/* ======================================================== */}
          {activeTab === "analysis" && (
            <div className="space-y-6 max-w-4xl mx-auto">
              
              <div className="p-4 bg-gradient-to-r from-emerald-950/20 via-teal-950/20 to-transparent border border-emerald-500/20 rounded-xl flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[var(--bright)] flex items-center gap-2">
                    <Zap className="w-4 h-4 text-emerald-400" />
                    <span>STEP 4: 論点ごとの深掘り分析結果</span>
                  </h3>
                  <p className="text-xs text-[var(--muted)]">
                    客観的事実・推定・ボトルネック・今後の確認指標を峻別して記録します。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openExternalAiModal("analysis", "all")}
                    className="px-3.5 py-2 bg-[#21262d] hover:bg-[#30363d] text-[var(--bright)] font-semibold text-xs rounded-lg border border-[var(--border2)] transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                    title="外部AI（ChatGPT等）用の深掘り分析プロンプトを表示してコピー"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>外部AI用プロンプト</span>
                  </button>
                  <button
                    onClick={handleRunAllSelectedAnalyses}
                    disabled={analyzingIssueIndex !== null}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    {analyzingIssueIndex !== null ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    <span>全論点を再分析</span>
                  </button>
                </div>
              </div>

              {analysisResults.length === 0 ? (
                <div className="text-center py-12 bg-[#161b22] border border-[var(--border2)] rounded-xl space-y-3">
                  <div className="text-3xl">🔍</div>
                  <h4 className="text-sm font-bold text-[var(--bright)]">まだ深掘り分析が実行されていません</h4>
                  <p className="text-xs text-[var(--muted)] max-w-md mx-auto">
                    「2. 調査論点の設定」タブで論点を選択し、「深掘り分析する」を実行するか、外部AIプロンプトを利用してください。
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setActiveTab("issues")}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-md cursor-pointer shadow-sm"
                    >
                      論点一覧を開く
                    </button>
                    <button
                      onClick={() => openExternalAiModal("analysis", "all")}
                      className="px-3.5 py-2 bg-[#21262d] hover:bg-[#30363d] text-[var(--bright)] font-semibold text-xs rounded-md border border-[var(--border2)] transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-400" />
                      <span>外部AI用プロンプト（一括）</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {analysisResults.map((res, idx) => (
                    <div
                      key={res.issueId}
                      className="p-5 bg-[#161b22] border border-[var(--border2)] rounded-xl space-y-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border2)] pb-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px] shrink-0">
                            論点 #{idx + 1}
                          </span>
                          <h4 className="font-bold text-sm text-[var(--bright)] truncate">{res.issueTitle}</h4>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => openExternalAiModal("analysis", res.issueId)}
                            className="px-2 py-1 bg-[#0d1117] hover:bg-[#21262d] text-amber-300 border border-amber-500/30 rounded text-[10.5px] font-semibold transition flex items-center gap-1 cursor-pointer"
                            title="この論点単体の外部AI分析プロンプト"
                          >
                            <Download className="w-3 h-3 text-amber-400" />
                            <span>外部AIプロンプト</span>
                          </button>
                          <span className="text-[10px] text-[var(--muted)]">
                            分析日時: {new Date(res.analyzedDate).toLocaleString("ja-JP")}
                          </span>
                        </div>
                      </div>

                      {/* Main Analysis Conclusion */}
                      <div className="p-3 bg-[#0d1117] rounded-lg border border-[var(--border2)] space-y-1.5">
                        <span className="text-[11px] font-bold text-emerald-400 block">分析結果・結論:</span>
                        <p className="text-xs text-[var(--text)] leading-relaxed whitespace-pre-wrap">
                          {res.analysisConclusion}
                        </p>
                        <div className="pt-2 border-t border-[var(--border2)]/60 flex items-center justify-between text-[11px] text-[var(--muted)]">
                          <span>確度評価: <strong className="text-white">{res.confidenceScoreAndReason}</strong></span>
                        </div>
                      </div>

                      {/* Distinct Categories: Facts vs Hypotheses vs Obstacles */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                        <div className="p-3 bg-[#0d1117] rounded-lg border border-blue-500/20">
                          <span className="text-[11px] font-bold text-blue-400 block mb-1">✓ 確認できた事実:</span>
                          <p className="text-[11px] text-[var(--text)] leading-relaxed">
                            {res.verifiedFacts || "特になし"}
                          </p>
                        </div>
                        <div className="p-3 bg-[#0d1117] rounded-lg border border-purple-500/20">
                          <span className="text-[11px] font-bold text-purple-400 block mb-1">💡 推定・作業仮説:</span>
                          <p className="text-[11px] text-[var(--text)] leading-relaxed">
                            {res.estimatesAndHypotheses || "特になし"}
                          </p>
                        </div>
                        <div className="p-3 bg-[#0d1117] rounded-lg border border-amber-500/20">
                          <span className="text-[11px] font-bold text-amber-400 block mb-1">⚠️ 実現を妨げるボトルネック:</span>
                          <p className="text-[11px] text-[var(--text)] leading-relaxed">
                            {res.hinderingFactors || "特になし"}
                          </p>
                        </div>
                      </div>

                      {/* Sources and Future checkpoints */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="p-2.5 bg-[#0d1117] rounded border border-[var(--border2)]">
                          <span className="text-[11px] font-bold text-[var(--muted)] block mb-0.5">根拠・出典（情報源）:</span>
                          <p className="text-[11px] text-[var(--subtle)]">{res.sourceUrlAndEvidence || "記事本文"}</p>
                        </div>
                        <div className="p-2.5 bg-[#0d1117] rounded border border-[var(--border2)]">
                          <span className="text-[11px] font-bold text-[var(--muted)] block mb-0.5">今後の確認事項・マイルストーン:</span>
                          <p className="text-[11px] text-[var(--subtle)]">{res.futureCheckpoints || "半年〜1年後の動向"}</p>
                        </div>
                      </div>

                      {/* User's comment on this issue */}
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">ユーザーコメント・考察メモ</label>
                        <input
                          type="text"
                          value={res.userComment}
                          onChange={e => {
                            const val = e.target.value;
                            setAnalysisResults(prev => prev.map((item, i) => i === idx ? { ...item, userComment: val } : item));
                            saveStoredAnalyses(analysisResults);
                          }}
                          placeholder="自身の考察や現場の所感をメモ..."
                          className="w-full bg-[#0d1117] border border-[var(--border2)] rounded px-3 py-1.5 text-xs text-[var(--bright)] focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>
                  ))}

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={handleSaveToSpreadsheet}
                      className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>分析結果をスプレッドシート（シート2）へ保存</span>
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 4: 予測振り返り (STEP 5)                                */}
          {/* ======================================================== */}
          {activeTab === "review" && (
            <div className="space-y-6 max-w-4xl mx-auto">
              
              <div className="p-4 bg-gradient-to-r from-purple-950/20 via-indigo-950/20 to-transparent border border-purple-500/20 rounded-xl">
                <h3 className="text-sm font-bold text-[var(--bright)] flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-purple-400" />
                  <span>STEP 5: 予測と実績の振り返り（シート3: DeepDiveReview）</span>
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  後日、実際の動向が判明した際に「当時の判断と何が一致・乖離したか」を検証し、判断精度を振り返ります。
                </p>
              </div>

              {/* Input for new outcome */}
              <div className="p-5 bg-[#161b22] border border-[var(--border2)] rounded-xl space-y-3 text-xs">
                <h4 className="font-bold text-[var(--bright)] text-sm">新しい実績動向の入力・検証</h4>
                <div className="p-3 bg-[#0d1117] rounded-lg border border-[var(--border2)] text-[11px] space-y-1">
                  <div><strong className="text-purple-300">当時の予測・判断:</strong> {decision.coreClaim || decision.importanceEval || "未入力"}</div>
                  <div><strong className="text-[var(--muted)]">前提条件:</strong> {decision.currentFeasibility || "未入力"}</div>
                </div>

                <div>
                  <label className="block font-semibold text-[var(--bright)] mb-1">実際に起きたこと・判明した事実（ニュースや決算など）</label>
                  <textarea
                    value={newReviewOutcome}
                    onChange={e => setNewReviewOutcome(e.target.value)}
                    placeholder="例: ○○社が商用化の中止を発表した、または予想を上回る量産体制に入った..."
                    className="w-full bg-[#0d1117] border border-[var(--border2)] rounded-lg p-2.5 text-xs text-[var(--bright)] h-24 resize-none focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="flex justify-end items-center gap-2">
                  <button
                    onClick={() => openExternalAiModal("review")}
                    className="px-3.5 py-2 bg-[#21262d] hover:bg-[#30363d] text-[var(--bright)] font-semibold text-xs rounded-lg border border-[var(--border2)] transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                    title="外部AI（ChatGPT等）用の予測振り返りプロンプトを表示してコピー"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>外部AI用プロンプト</span>
                  </button>
                  <button
                    onClick={handleGenerateReview}
                    disabled={isGeneratingReview || !newReviewOutcome.trim()}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    {isGeneratingReview ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>振り返り評価を実行</span>
                  </button>
                </div>
              </div>

              {/* Saved Reviews List */}
              {reviews.length > 0 && (
                <div className="space-y-4">
                  <h4 className="font-bold text-[var(--bright)] text-sm">過去の振り返り記録 ({reviews.length}件)</h4>
                  {reviews.map((rev, idx) => (
                    <div key={rev.reviewId} className="p-4 bg-[#161b22] border border-[var(--border2)] rounded-xl space-y-2 text-xs">
                      <div className="flex items-center justify-between border-b border-[var(--border2)] pb-2">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                          rev.alignment === "matched" ? "bg-emerald-500/20 text-emerald-300" :
                          rev.alignment === "partially_matched" ? "bg-amber-500/20 text-amber-300" :
                          "bg-rose-500/20 text-rose-300"
                        }`}>
                          {rev.alignment === "matched" ? "予測的中・一致" : rev.alignment === "partially_matched" ? "一部一致" : "乖離・想定外"}
                        </span>
                        <span className="text-[10px] text-[var(--muted)]">再評価日: {new Date(rev.reviewDate).toLocaleDateString("ja-JP")}</span>
                      </div>
                      <div className="space-y-1">
                        <div><strong className="text-[var(--bright)]">実際に起きたこと:</strong> {rev.actualOutcome}</div>
                        <div><strong className="text-[var(--bright)]">乖離/的中した理由:</strong> {rev.reasonForOutcome}</div>
                        <div><strong className="text-purple-300">得られた学び:</strong> {rev.learnings}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 5: 過去履歴の表示                                       */}
          {/* ======================================================== */}
          {activeTab === "history" && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div className="p-4 bg-[#161b22] border border-[var(--border2)] rounded-xl space-y-2">
                <h3 className="text-sm font-bold text-[var(--bright)] flex items-center gap-2">
                  <History className="w-4 h-4 text-sky-400" />
                  <span>この記事の過去の深掘り判断・分析履歴</span>
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  同じ記事を再分析した場合でも過去の記録は上書きされず、時系列の分析履歴として安全に蓄積されます。
                </p>
              </div>

              {getStoredDecisions(note.id).length === 0 ? (
                <div className="text-center py-10 text-xs text-[var(--muted)]">
                  この記事に対する保存済みの判断履歴はまだありません。
                </div>
              ) : (
                <div className="space-y-4">
                  {getStoredDecisions(note.id).map(d => (
                    <div key={d.analysisId} className="p-4 bg-[#161b22] border border-[var(--border2)] rounded-xl space-y-2 text-xs">
                      <div className="flex items-center justify-between border-b border-[var(--border2)] pb-2">
                        <span className="font-bold text-sky-400">ID: {d.analysisId}</span>
                        <span className="text-[var(--muted)]">判断日時: {new Date(d.decisionDate).toLocaleString("ja-JP")}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                        <div><strong className="text-[var(--bright)]">主張:</strong> {d.coreClaim}</div>
                        <div><strong className="text-[var(--bright)]">優先度:</strong> {d.priority} ({d.userFinalDecision})</div>
                        <div><strong className="text-[var(--bright)]">影響評価:</strong> {d.importanceEval}</div>
                        <div><strong className="text-[var(--bright)]">不足情報:</strong> {d.missingInformation}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 6: スプレッドシート設定 & 同期状態                        */}
          {/* ======================================================== */}
          {activeTab === "spreadsheet" && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div className="p-5 bg-[#161b22] border border-[var(--border2)] rounded-xl space-y-4 text-xs">
                <div className="flex items-center gap-2 border-b border-[var(--border2)] pb-3">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-[var(--bright)]">Google スプレッドシート蓄積設定</h3>
                </div>

                <p className="text-[var(--muted)] leading-relaxed">
                  深掘り判断・分析結果・予測振り返りは、既存のノート用スプレッドシートとは別の独立したスプレッドシートに蓄積されます。
                  既存シートのURL、または新しく作成したGoogleスプレッドシートのURLを指定してください。
                  （※ヘッダーの「📥 取り込み ＆ 同期ハブ」の最下段でも共通設定でき、常に連動します）
                </p>

                <div>
                  <label className="block font-semibold text-[var(--bright)] mb-1">深掘り専用スプレッドシートURL / ID</label>
                  <input
                    type="text"
                    value={spreadsheetUrl}
                    onChange={e => {
                      const val = e.target.value;
                      setSpreadsheetUrlState(val);
                      setDeepDiveSpreadsheetUrl(val);
                    }}
                    placeholder="https://docs.google.com/spreadsheets/d/... (空欄の場合は現在のアクティブシートに保存)"
                    className="w-full bg-[#0d1117] border border-[var(--border2)] rounded px-3 py-2 text-xs text-[var(--bright)] font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="p-3 bg-[#0d1117] rounded-lg border border-[var(--border2)] space-y-2 text-[11px]">
                  <span className="font-bold text-[var(--bright)] block">自動生成される3つのタブ（独立蓄積）:</span>
                  <ul className="list-disc list-inside space-y-1 text-[var(--muted)]">
                    <li><strong className="text-sky-300">シート1: DeepDiveDecisions</strong> - 1記事につき1行の深掘り判断（24列）</li>
                    <li><strong className="text-emerald-300">シート2: DeepDiveAnalysis</strong> - 1論点につき1行の詳細分析結果（17列）</li>
                    <li><strong className="text-purple-300">シート3: DeepDiveReview</strong> - 将来の予測と実績の振り返り（12列）</li>
                  </ul>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button
                    onClick={handleInitializeSheets}
                    disabled={saveStatus === "saving"}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs rounded-md transition-colors cursor-pointer"
                  >
                    タブを初期化・確認する
                  </button>
                  <button
                    onClick={handleSaveToSpreadsheet}
                    disabled={saveStatus === "saving"}
                    className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white font-bold text-xs rounded-md transition-colors cursor-pointer"
                  >
                    現在の判断・分析を同期保存
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 7: プロンプト管理                                       */}
          {/* ======================================================== */}
          {activeTab === "prompts" && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div className="p-4 bg-[#161b22] border border-[var(--border2)] rounded-xl flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[var(--bright)] flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    <span>深掘り機能 プロンプト管理</span>
                  </h3>
                  <p className="text-xs text-[var(--muted)]">
                    判断用、論点抽出用、論点分析用、予測振り返り用の各プロンプトを個別に編集・カスタマイズできます。
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm("深掘りプロンプトをデフォルトにリセットしますか？")) {
                      setPrompts(DEFAULT_DEEP_DIVE_PROMPTS);
                      saveCustomDeepDivePrompts(DEFAULT_DEEP_DIVE_PROMPTS);
                      onToast("プロンプトをリセットしました ✦");
                    }
                  }}
                  className="px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] text-[var(--muted)] hover:text-white text-xs rounded border border-[var(--border2)] transition-colors cursor-pointer"
                >
                  デフォルトに戻す
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-[var(--bright)] mb-1">1. 深掘り判断・トリアージ用プロンプト (DECISION)</label>
                  <textarea
                    value={prompts.DECISION}
                    onChange={e => {
                      const val = e.target.value;
                      setPrompts(prev => ({ ...prev, DECISION: val }));
                      saveCustomDeepDivePrompts({ DECISION: val });
                    }}
                    className="w-full bg-[#0d1117] border border-[var(--border2)] rounded-lg p-3 text-[11px] font-mono text-[var(--bright)] h-44 resize-y"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[var(--bright)] mb-1">2. 調査論点の設定用プロンプト (ISSUES)</label>
                  <textarea
                    value={prompts.ISSUES}
                    onChange={e => {
                      const val = e.target.value;
                      setPrompts(prev => ({ ...prev, ISSUES: val }));
                      saveCustomDeepDivePrompts({ ISSUES: val });
                    }}
                    className="w-full bg-[#0d1117] border border-[var(--border2)] rounded-lg p-3 text-[11px] font-mono text-[var(--bright)] h-40 resize-y"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[var(--bright)] mb-1">3. 論点ごとの深掘り分析用プロンプト (ANALYSIS)</label>
                  <textarea
                    value={prompts.ANALYSIS}
                    onChange={e => {
                      const val = e.target.value;
                      setPrompts(prev => ({ ...prev, ANALYSIS: val }));
                      saveCustomDeepDivePrompts({ ANALYSIS: val });
                    }}
                    className="w-full bg-[#0d1117] border border-[var(--border2)] rounded-lg p-3 text-[11px] font-mono text-[var(--bright)] h-44 resize-y"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[var(--bright)] mb-1">4. 予測と実績の振り返り用プロンプト (REVIEW)</label>
                  <textarea
                    value={prompts.REVIEW}
                    onChange={e => {
                      const val = e.target.value;
                      setPrompts(prev => ({ ...prev, REVIEW: val }));
                      saveCustomDeepDivePrompts({ REVIEW: val });
                    }}
                    className="w-full bg-[#0d1117] border border-[var(--border2)] rounded-lg p-3 text-[11px] font-mono text-[var(--bright)] h-36 resize-y"
                  />
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* External AI Modal (Prompt export & Result Paste) */}
      {showExternalAiModal && (
        <div className="fixed inset-0 z-[1300] bg-black/80 flex items-center justify-center p-3 animate-[fadeIn_0.1s_ease-out]">
          <div className="bg-[#161b22] border border-[var(--border)] rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col p-5 space-y-3.5 shadow-2xl overflow-y-auto">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-[var(--bright)]">外部AI（ChatGPT / Claude等）連携</h3>
              </div>
              <button
                onClick={() => setShowExternalAiModal(false)}
                className="text-[var(--muted)] hover:text-white px-2 py-0.5 rounded text-xs"
              >
                ✕
              </button>
            </div>

            {/* Step Selector Tabs (1〜4 All Supported) */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#0d1117] rounded-lg border border-[var(--border2)] text-xs">
              <button
                type="button"
                onClick={() => openExternalAiModal("decision")}
                className={`px-2.5 py-1 rounded font-semibold transition cursor-pointer flex items-center gap-1 ${
                  externalTargetTab === "decision"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-[var(--muted)] hover:text-[var(--bright)]"
                }`}
              >
                <span>1. 深掘り判断</span>
              </button>

              <button
                type="button"
                onClick={() => openExternalAiModal("issues")}
                className={`px-2.5 py-1 rounded font-semibold transition cursor-pointer flex items-center gap-1 ${
                  externalTargetTab === "issues"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-[var(--muted)] hover:text-[var(--bright)]"
                }`}
              >
                <span>2. 調査論点の設定</span>
              </button>

              <button
                type="button"
                onClick={() => openExternalAiModal("analysis", "all")}
                className={`px-2.5 py-1 rounded font-semibold transition cursor-pointer flex items-center gap-1 ${
                  externalTargetTab === "analysis"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-[var(--muted)] hover:text-[var(--bright)]"
                }`}
              >
                <span>3. 深掘り分析結果</span>
              </button>

              <button
                type="button"
                onClick={() => openExternalAiModal("review")}
                className={`px-2.5 py-1 rounded font-semibold transition cursor-pointer flex items-center gap-1 ${
                  externalTargetTab === "review"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-[var(--muted)] hover:text-[var(--bright)]"
                }`}
              >
                <span>4. 予測振り返り</span>
              </button>
            </div>

            {/* Analysis Issue Selector (Only shown when target is analysis) */}
            {externalTargetTab === "analysis" && issues.length > 0 && (
              <div className="flex items-center gap-2 bg-[#0d1117] p-2 rounded-lg border border-[var(--border2)] text-xs">
                <span className="font-semibold text-amber-300 text-[11px] whitespace-nowrap">対象論点:</span>
                <select
                  value={externalAnalysisIssueId}
                  onChange={(e) => {
                    const selId = e.target.value;
                    setExternalAnalysisIssueId(selId);
                    setExternalPromptText(getAnalysisPromptForTarget(selId));
                  }}
                  className="flex-1 bg-[#161b22] border border-[var(--border2)] rounded px-2 py-1 text-xs text-[var(--bright)] focus:outline-none focus:border-amber-500"
                >
                  <option value="all">【全論点一括】選択中のすべての論点（{issues.filter(i => i.selectedForAnalysis).length}件）</option>
                  {issues.map((iss, i) => (
                    <option key={iss.issueId} value={iss.issueId}>
                      論点 #{i + 1}: {iss.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Expected format guide */}
            <div className="p-2.5 bg-amber-950/20 border border-amber-500/30 rounded-lg text-[11px] text-amber-200/90 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-300">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  {externalTargetTab === "decision" && "【Step 1】深掘り判断用プロンプト・期待される出力形式 (JSON)"}
                  {externalTargetTab === "issues" && "【Step 2】調査論点提案用プロンプト・期待される出力形式 (JSON配列)"}
                  {externalTargetTab === "analysis" && "【Step 3】深掘り詳細分析用プロンプト・期待される出力形式 (JSON配列または単体)"}
                  {externalTargetTab === "review" && "【Step 4】予測と実績の振り返り用プロンプト・期待される出力形式 (JSON)"}
                </span>
              </div>
              <p className="text-[10px] text-gray-300 leading-relaxed">
                {externalTargetTab === "decision" && "主要主張、現状段階、影響度、実現性、優先度（high/medium/low）、深掘り理由等を含むJSONを出力させます。"}
                {externalTargetTab === "issues" && "重要度順の最大5件の論点（論点名、重要理由、既知事実、未解明事項、調査方法、確認情報源、判断が変わる条件）を出力させます。"}
                {externalTargetTab === "analysis" && "事実・仮説・ボトルネック・分析結論（200〜400字）・確度評価・今後の確認指標を含む詳細分析を出力させます。"}
                {externalTargetTab === "review" && "当時の予測と実績動向を比較し、一致度（matched/partially_matched/diverged）、理由、教訓を出力させます。"}
              </p>
            </div>

            {/* Prompt Display & Copy */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--bright)] text-xs">
                  外部AI（ChatGPT / Claude等）に貼り付けるプロンプト:
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(externalPromptText);
                      setIsCopiedExternalPrompt(true);
                      onToast("プロンプトをクリップボードにコピーしました 📋");
                      setTimeout(() => setIsCopiedExternalPrompt(false), 2500);
                    } catch {}
                  }}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded text-[11px] flex items-center gap-1 cursor-pointer transition shadow-sm"
                >
                  {isCopiedExternalPrompt ? <Check className="w-3 h-3 text-white" /> : <Copy className="w-3 h-3" />}
                  <span>{isCopiedExternalPrompt ? "コピー完了！" : "プロンプトをコピー"}</span>
                </button>
              </div>
              <textarea
                readOnly
                value={externalPromptText}
                onFocus={e => e.currentTarget.select()}
                className="w-full h-36 bg-[#0d1117] border border-[var(--border2)] rounded-lg p-2.5 text-[11px] font-mono text-[var(--bright)] resize-y focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* External JSON Response Input */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--bright)] text-xs">外部AIからの返答JSONを貼り付け:</span>
                <span className="text-[10px] text-[var(--muted)]">（```json ... ``` の囲みがあっても自動抽出されます）</span>
              </div>
              <textarea
                value={externalJsonInput}
                onChange={e => setExternalJsonInput(e.target.value)}
                placeholder={'外部AIが返したJSON（またはコードブロック）をそのままここに貼り付けてください...'}
                className="w-full h-32 bg-[#0d1117] border border-[var(--border2)] rounded-lg p-2.5 text-[11px] font-mono text-[var(--bright)] resize-y focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
              <span className="text-[10px] text-[var(--muted)]">
                反映先: <strong className="text-amber-300">
                  {externalTargetTab === "decision" && "1. 深掘り判断（シート1）"}
                  {externalTargetTab === "issues" && "2. 調査論点（シート1）"}
                  {externalTargetTab === "analysis" && "3. 深掘り分析結果（シート2）"}
                  {externalTargetTab === "review" && "4. 予測振り返り（シート3）"}
                </strong>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowExternalAiModal(false)}
                  className="px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] text-[var(--subtle)] rounded text-xs cursor-pointer transition"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleApplyExternalJson}
                  disabled={!externalJsonInput.trim()}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded text-xs cursor-pointer transition shadow-sm flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>JSONを解析して適用</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
