/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Sparkles,
  Copy,
  Check,
  AlertCircle,
  FileSpreadsheet,
  BookOpen,
  CheckCircle2,
  Trash2,
  Edit3,
  Save,
  HelpCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Zap,
  RotateCcw,
  RefreshCw,
  Loader2,
  ListChecks,
  Quote,
  CheckCheck,
  Award,
  Undo2,
  Shuffle
} from "lucide-react";
import {
  Note,
  LearningQuestion,
  QuestionGenerationConfig,
  QuestionType,
  QuestionChoice,
  ReviewState
} from "../types";
import {
  buildQuestionPrompt,
  validateQuestionJson,
  generateQuestionsViaGemini,
  calculateSM2Review,
  shuffleArray
} from "../utils/questionUtils";

interface QuestionGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
  activeNote: Note | null;
  learningApiPost: (body: any) => Promise<any>;
  onSaveToast: (msg: string) => void;
  onOpenSettings: () => void;
}

export default function QuestionGenerationModal({
  isOpen,
  onClose,
  notes,
  activeNote,
  learningApiPost,
  onSaveToast,
  onOpenSettings
}: QuestionGenerationModalProps) {
  // タブ: 'generate' | 'approval' | 'quiz' | 'settings'
  const [activeTab, setActiveTab] = useState<"generate" | "approval" | "quiz" | "settings">("generate");

  // 生成設定
  const [selectedNoteId, setSelectedNoteId] = useState<string>(() => (activeNote ? activeNote.id : (notes[0]?.id || "")));
  const [generationMode, setGenerationMode] = useState<"external_prompt" | "api">("external_prompt");
  const [questionCount, setQuestionCount] = useState<number>(3);
  const [questionType, setQuestionType] = useState<QuestionType | "mix">("single_choice");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  // 外部AIプロンプト表示 & コピー状態
  const [generatedPrompt, setGeneratedPrompt] = useState<string>("");
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // 外部AIの返答JSON貼り付け & バリデーション状態
  const [pastedJsonText, setPastedJsonText] = useState<string>("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState<boolean>(false);

  // 承認待ち問題リスト (APIモード/外部AIモード共通) - ローカル一時記憶対応
  const [candidateQuestions, setCandidateQuestions] = useState<LearningQuestion[]>(() => {
    try {
      const cached = localStorage.getItem("cn_learning_cached_candidate_questions");
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  // 学習用スプレッドシートへの保存状態
  const [isSavingToSheet, setIsSavingToSheet] = useState<boolean>(false);
  const [saveStatusMessage, setSaveStatusMessage] = useState<string | null>(null);

  // API生成ローディング状態
  const [isGeneratingApi, setIsGeneratingApi] = useState<boolean>(false);

  // 保存済み問題一覧 & クイズ状態 - ローカル一時記憶（キャッシュ）による爆速動作
  const [savedQuestions, setSavedQuestions] = useState<LearningQuestion[]>(() => {
    try {
      const cached = localStorage.getItem("cn_learning_cached_questions");
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [reviewStates, setReviewStates] = useState<Record<string, ReviewState>>(() => {
    try {
      const cached = localStorage.getItem("cn_learning_cached_review_states");
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });
  const [quizFilter, setQuizFilter] = useState<"active" | "all" | "mastered">("active");
  const [isLoadingSaved, setIsLoadingSaved] = useState<boolean>(false);
  const [isSyncingBackground, setIsSyncingBackground] = useState<boolean>(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<string>(() => localStorage.getItem("cn_learning_last_synced_at") || "");
  const [currentQuizIndex, setCurrentQuizIndex] = useState<number>(0);
  const [selectedQuizChoices, setSelectedQuizChoices] = useState<string[]>([]);
  const [essayAnswer, setEssayAnswer] = useState<string>("");
  const [isQuizAnswerRevealed, setIsQuizAnswerRevealed] = useState<boolean>(false);
  const [externalAiQuestionInput, setExternalAiQuestionInput] = useState<string>("");
  const [showExternalAiPromptBox, setShowExternalAiPromptBox] = useState<boolean>(false);
  const [pastedExplanation, setPastedExplanation] = useState<string>("");
  const [isSavingExplanationToSheet, setIsSavingExplanationToSheet] = useState<boolean>(false);
  const [isSessionCompleted, setIsSessionCompleted] = useState<boolean>(false);

  // ローカルキャッシュの永続化 (変更時に即時一時記憶)
  useEffect(() => {
    try {
      localStorage.setItem("cn_learning_cached_candidate_questions", JSON.stringify(candidateQuestions));
    } catch (e) {
      console.warn("Failed to cache candidateQuestions:", e);
    }
  }, [candidateQuestions]);

  useEffect(() => {
    try {
      localStorage.setItem("cn_learning_cached_questions", JSON.stringify(savedQuestions));
    } catch (e) {
      console.warn("Failed to cache savedQuestions:", e);
    }
  }, [savedQuestions]);

  useEffect(() => {
    try {
      localStorage.setItem("cn_learning_cached_review_states", JSON.stringify(reviewStates));
    } catch (e) {
      console.warn("Failed to cache reviewStates:", e);
    }
  }, [reviewStates]);

  // 習得済み・未習得の集計とフィルタ
  const masteredCount = useMemo(() => {
    return savedQuestions.filter(q => q.status === "mastered" || reviewStates[q.id]?.masteryLevel === "mastered").length;
  }, [savedQuestions, reviewStates]);

  const todayStr = new Date().toISOString().split("T")[0];

  const activeCount = useMemo(() => {
    return savedQuestions.filter(q => {
      if (q.status === "mastered" || reviewStates[q.id]?.masteryLevel === "mastered") return false;
      const state = reviewStates[q.id];
      // まだ一度も解答していない新規問題（未レビュー）は、必ず最初に出題対象とする
      if (!state || !state.nextReviewDate || !state.lastReviewedAt || (state.totalReviews || 0) === 0 || state.masteryLevel === "new") {
        return true;
      }
      // 一度以上解答した問題は、次回復習期日が今日以前の場合に出題する
      return state.nextReviewDate <= todayStr;
    }).length;
  }, [savedQuestions, reviewStates, todayStr]);

  // ランダム（シャッフル）出題設定（ローカルストレージに永続化）
  const [isQuizShuffled, setIsQuizShuffled] = useState<boolean>(() => {
    return localStorage.getItem("cn_quiz_shuffled") === "true";
  });

  const getQuestionsForFilter = useCallback((
    filter: "active" | "all" | "mastered",
    questions: LearningQuestion[],
    states: Record<string, ReviewState>,
    shuffle?: boolean
  ) => {
    const today = new Date().toISOString().split("T")[0];
    let filtered: LearningQuestion[] = [];
    if (filter === "mastered") {
      filtered = questions.filter(q => q.status === "mastered" || states[q.id]?.masteryLevel === "mastered");
    } else if (filter === "all") {
      filtered = [...questions];
    } else {
      // "active": 新規問題（未解答）または復習期日（nextReviewDate）が今日以前のもの
      filtered = questions.filter(q => {
        if (q.status === "mastered" || states[q.id]?.masteryLevel === "mastered") return false;
        const state = states[q.id];
        // まだ一度も解答していない新規問題（未レビュー）は、必ず最初に出題対象とする
        if (!state || !state.nextReviewDate || !state.lastReviewedAt || (state.totalReviews || 0) === 0 || state.masteryLevel === "new") {
          return true;
        }
        // 一度以上解答した問題は、次回復習期日が今日以前の場合に出題する
        return state.nextReviewDate <= today;
      });
    }
    const shouldShuffle = shuffle !== undefined ? shuffle : isQuizShuffled;
    return shouldShuffle ? shuffleArray(filtered) : filtered;
  }, [isQuizShuffled]);

  // 現在のクイズセッションで解く問題のキュー（解答完了した問題は次回復習期日まで即時非表示となりスワイプ対象からも除外）
  const [sessionQuestions, setSessionQuestions] = useState<LearningQuestion[]>([]);
  const [sessionInitialTotal, setSessionInitialTotal] = useState<number>(0);
  const [sessionCompletedCount, setSessionCompletedCount] = useState<number>(0);

  // タッチスワイプ座標追跡用ref（再レンダリングや状態更新時も確実に維持）
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const handleFilterChange = useCallback((newFilter: "active" | "all" | "mastered") => {
    setQuizFilter(newFilter);
    setIsSessionCompleted(false);
    setCurrentQuizIndex(0);
    setSelectedQuizChoices([]);
    setEssayAnswer("");
    setIsQuizAnswerRevealed(false);
    setShowExternalAiPromptBox(false);
    setExternalAiQuestionInput("");
    const qList = getQuestionsForFilter(newFilter, savedQuestions, reviewStates);
    setSessionQuestions(qList);
    setSessionInitialTotal(qList.length);
    setSessionCompletedCount(0);
  }, [getQuestionsForFilter, savedQuestions, reviewStates]);

  // ランダム（シャッフル）出題の切り替え
  const handleToggleShuffle = useCallback(() => {
    const nextShuffled = !isQuizShuffled;
    setIsQuizShuffled(nextShuffled);
    localStorage.setItem("cn_quiz_shuffled", String(nextShuffled));
    const qList = getQuestionsForFilter(quizFilter, savedQuestions, reviewStates, nextShuffled);
    setSessionQuestions(qList);
    setSessionInitialTotal(qList.length);
    setSessionCompletedCount(0);
    setCurrentQuizIndex(0);
    setIsSessionCompleted(false);
    setSelectedQuizChoices([]);
    setEssayAnswer("");
    setIsQuizAnswerRevealed(false);
    setShowExternalAiPromptBox(false);
    setExternalAiQuestionInput("");
    onSaveToast(nextShuffled ? "出題順をランダム（シャッフル）に設定しました ✦" : "出題順を登録順に戻しました ✦");
  }, [isQuizShuffled, getQuestionsForFilter, quizFilter, savedQuestions, reviewStates, onSaveToast]);

  // 現在のセッション問題を再度シャッフル
  const handleReshuffle = useCallback(() => {
    const qList = getQuestionsForFilter(quizFilter, savedQuestions, reviewStates, true);
    setSessionQuestions(qList);
    setSessionInitialTotal(qList.length);
    setSessionCompletedCount(0);
    setCurrentQuizIndex(0);
    setIsSessionCompleted(false);
    setSelectedQuizChoices([]);
    setEssayAnswer("");
    setIsQuizAnswerRevealed(false);
    setShowExternalAiPromptBox(false);
    setExternalAiQuestionInput("");
    onSaveToast("問題をランダムに再シャッフルしました ✦");
  }, [getQuestionsForFilter, quizFilter, savedQuestions, reviewStates, onSaveToast]);

  // クイズタブを開いた時にセッション問題リストを構築
  useEffect(() => {
    if (activeTab === "quiz") {
      const qList = getQuestionsForFilter(quizFilter, savedQuestions, reviewStates);
      setSessionQuestions(qList);
      setSessionInitialTotal(qList.length);
      setSessionCompletedCount(0);
      setCurrentQuizIndex(0);
      setIsSessionCompleted(false);
      setSelectedQuizChoices([]);
      setEssayAnswer("");
      setIsQuizAnswerRevealed(false);
      setShowExternalAiPromptBox(false);
      setExternalAiQuestionInput("");
    }
  }, [activeTab]);

  // 初回データ取得完了時にセッションが空なら初期化（セッション完了後の意図しない再初期化を防止）
  useEffect(() => {
    if (activeTab === "quiz" && sessionQuestions.length === 0 && savedQuestions.length > 0 && !isSessionCompleted && sessionCompletedCount === 0) {
      const qList = getQuestionsForFilter(quizFilter, savedQuestions, reviewStates);
      setSessionQuestions(qList);
      setSessionInitialTotal(qList.length);
    }
  }, [savedQuestions, activeTab, quizFilter, sessionQuestions.length, getQuestionsForFilter, reviewStates, isSessionCompleted, sessionCompletedCount]);

  // 学習用スプレッドシートURL設定状態
  const [learningSsUrl, setLearningSsUrl] = useState<string>(() => localStorage.getItem("cn_learning_spreadsheet_url") || "");
  const [isInitializingSheets, setIsInitializingSheets] = useState<boolean>(false);
  const [initSheetsResult, setInitSheetsResult] = useState<string | null>(null);

  // モーダルオープン時の初期化
  useEffect(() => {
    if (isOpen) {
      if (activeNote) {
        setSelectedNoteId(activeNote.id);
      } else if (notes.length > 0 && !selectedNoteId) {
        setSelectedNoteId(notes[0].id);
      }
      setLearningSsUrl(localStorage.getItem("cn_learning_spreadsheet_url") || "");
      setValidationErrors([]);
    }
  }, [isOpen, activeNote, notes]);

  // プロンプトの再計算（設定変更時）
  useEffect(() => {
    const targetNote = notes.find(n => n.id === selectedNoteId) || activeNote || notes[0];
    if (targetNote) {
      const config: QuestionGenerationConfig = {
        count: questionCount,
        type: questionType,
        difficulty: difficulty,
        mode: generationMode
      };
      const p = buildQuestionPrompt(targetNote, config);
      setGeneratedPrompt(p);
    }
  }, [selectedNoteId, questionCount, questionType, difficulty, generationMode, notes, activeNote]);

  if (!isOpen) return null;

  const currentTargetNote = notes.find(n => n.id === selectedNoteId) || activeNote || notes[0];

  // プロンプトのワンクリックコピー
  const handleCopyPrompt = async () => {
    if (!generatedPrompt) return;
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setIsCopied(true);
      onSaveToast("プロンプトをクリップボードにコピーしました ✦");
      setTimeout(() => setIsCopied(false), 2500);
    } catch {
      onSaveToast("コピーに失敗しました。手動で選択してコピーしてください。");
    }
  };

  // 外部AI返答JSONの検証と取り込み
  const handleValidateAndImport = () => {
    if (!pastedJsonText.trim()) {
      setValidationErrors(["外部AIの返答テキストが入力されていません。"]);
      return;
    }

    setIsValidating(true);
    setValidationErrors([]);

    const result = validateQuestionJson(pastedJsonText, currentTargetNote);

    setIsValidating(false);

    if (!result.isValid || result.questions.length === 0) {
      setValidationErrors(result.errors);
      return;
    }

    // 既存候補リストに追加（重複排除）
    setCandidateQuestions(prev => {
      const existingIds = new Set(prev.map(q => q.id));
      const newItems = result.questions.filter(q => !existingIds.has(q.id));
      return [...prev, ...newItems];
    });

    setPastedJsonText("");
    setActiveTab("approval");
    onSaveToast(`✓ ${result.questions.length}件の問題を解析・取り込みました。内容を確認して承認してください。`);
  };

  // APIモードでの問題生成
  const handleGenerateViaApi = async () => {
    if (!currentTargetNote) {
      onSaveToast("対象のノートを選択してください。");
      return;
    }

    const apiKey = localStorage.getItem("cn_gemini_key");
    if (!apiKey) {
      onSaveToast("Gemini APIキーが設定されていません。AI設定よりAPIキーを入力してください。");
      onOpenSettings();
      return;
    }

    setIsGeneratingApi(true);
    setValidationErrors([]);

    try {
      const config: QuestionGenerationConfig = {
        count: questionCount,
        type: questionType,
        difficulty: difficulty,
        mode: "api"
      };

      const result = await generateQuestionsViaGemini(currentTargetNote, config, apiKey);
      if (result.questions.length > 0) {
        setCandidateQuestions(prev => [...prev, ...result.questions]);
        setActiveTab("approval");
        onSaveToast(`✓ ${result.questions.length}問の問題をAI生成しました。承認リストで確認してください。`);
      } else {
        setValidationErrors(["問題を生成できませんでした。ノートの内容を確認してください。"]);
      }
    } catch (err: any) {
      setValidationErrors([`API生成エラー: ${err.message || String(err)}`]);
    } finally {
      setIsGeneratingApi(false);
    }
  };

  // 承認状態のトグル
  const handleToggleApproval = (id: string) => {
    setCandidateQuestions(prev =>
      prev.map(q => (q.id === id ? { ...q, isApproved: !q.isApproved } : q))
    );
  };

  // 候補問題の削除
  const handleDeleteCandidate = (id: string) => {
    setCandidateQuestions(prev => prev.filter(q => q.id !== id));
  };

  // 候補問題の内容更新
  const handleUpdateCandidate = (updated: LearningQuestion) => {
    setCandidateQuestions(prev =>
      prev.map(q => (q.id === updated.id ? updated : q))
    );
    setEditingQuestionId(null);
  };

  // 承認済み問題の学習用スプレッドシートへの一括保存
  const handleSaveApprovedQuestions = async () => {
    const approved = candidateQuestions.filter(q => q.isApproved !== false);
    if (approved.length === 0) {
      onSaveToast("承認された問題がありません。保存する問題にチェックを入れてください。");
      return;
    }

    const storedSsUrl = localStorage.getItem("cn_learning_spreadsheet_url");
    if (!storedSsUrl || storedSsUrl.trim() === "") {
      onSaveToast("学習用スプレッドシートURLが未設定です。「設定」タブでURLを入力してください。");
      setActiveTab("settings");
      return;
    }

    setIsSavingToSheet(true);
    setSaveStatusMessage(null);

    // 1. 【即時一時記憶 (0ms)】ローカル保存済みリストへ直ちに追加（クイズタブで即演習可能に）
    setSavedQuestions(prev => {
      const existingIds = new Set(prev.map(q => q.id));
      const newItems = approved.filter(q => !existingIds.has(q.id));
      return [...prev, ...newItems];
    });
    // 候補リストから承認済みを除去
    const approvedIds = new Set(approved.map(q => q.id));
    setCandidateQuestions(prev => prev.filter(q => !approvedIds.has(q.id)));

    try {
      const res = await learningApiPost({
        action: "saveLearningQuestions",
        questions: approved
      });

      if (res && res.success) {
        onSaveToast(`🎉 ${approved.length}件の問題を保存しました！（アプリに一時記憶され、クイズですぐ使えます）`);
        setSaveStatusMessage(`${approved.length}問をスプレッドシートに保存完了しました。`);
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setLastSyncedTime(timeStr);
        localStorage.setItem("cn_learning_last_synced_at", timeStr);
      } else {
        throw new Error(res?.error || "保存処理でエラーが発生しました。");
      }
    } catch (err: any) {
      setSaveStatusMessage(`保存エラー: ${err.message || String(err)}`);
      onSaveToast(`保存失敗: ${err.message || String(err)}`);
    } finally {
      setIsSavingToSheet(false);
    }
  };

  // 5タブ初期化の実行
  const handleInitSheets = async () => {
    const storedSsUrl = localStorage.getItem("cn_learning_spreadsheet_url");
    if (!storedSsUrl || storedSsUrl.trim() === "") {
      onSaveToast("学習用スプレッドシートURLを入力してください。");
      return;
    }

    setIsInitializingSheets(true);
    setInitSheetsResult(null);

    try {
      const res = await learningApiPost({
        action: "initLearningSheets"
      });

      if (res && res.success) {
        setInitSheetsResult("✓ 5つのタブ (Questions, QuestionEvidence, QuestionChoices, ReviewLogs, ReviewState) の作成・検証が完了しました！");
        onSaveToast("学習用スプレッドシートの5タブを正常に初期化しました ✦");
      } else {
        throw new Error(res?.error || "初期化エラー");
      }
    } catch (err: any) {
      setInitSheetsResult(`✕ 初期化に失敗しました: ${err.message || String(err)}`);
    } finally {
      setIsInitializingSheets(false);
    }
  };

  // 保存済み問題の読み込み (クイズ・復習用)
  // isSilent: true の場合はバックグラウンドで静かに取得し、ローカルキャッシュを更新する
  const handleFetchSavedQuestions = async (isSilent = false) => {
    if (!isSilent) setIsLoadingSaved(true);
    else setIsSyncingBackground(true);

    try {
      let res = await learningApiPost({
        action: "getLearningReviewData"
      });
      // Fallback
      if (!res || !res.success || !Array.isArray(res.questions)) {
        res = await learningApiPost({
          action: "getLearningQuestions"
        });
      }
      if (res && res.success && Array.isArray(res.questions)) {
        setSavedQuestions(res.questions);
        if (res.reviewStates && typeof res.reviewStates === "object") {
          setReviewStates(prev => {
            const merged = { ...res.reviewStates };
            for (const [qId, localState] of Object.entries(prev)) {
              const remoteState = merged[qId];
              if (!remoteState || (localState.updatedAt || 0) >= (remoteState.updatedAt || 0)) {
                merged[qId] = localState;
              }
            }
            return merged;
          });
        }
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setLastSyncedTime(timeStr);
        localStorage.setItem("cn_learning_last_synced_at", timeStr);

        if (!isSilent) {
          if (res.questions.length === 0) {
            onSaveToast("保存された問題はまだありません。先に問題を生成して保存してください。");
          } else {
            onSaveToast(`${res.questions.length}件の最新問題をスプレッドシートから読み込みました ✦`);
          }
        }
      } else {
        throw new Error(res?.error || "問題の取得に失敗しました。");
      }
    } catch (err: any) {
      if (!isSilent) {
        onSaveToast(`取得エラー: ${err.message || String(err)}`);
      } else {
        console.warn("Background fetch failed:", err);
      }
    } finally {
      if (!isSilent) setIsLoadingSaved(false);
      else setIsSyncingBackground(false);
    }
  };

  // 個別問題の習得済み（出題停止）/ 出題対象の切り替え (即時反映0ms + バックグラウンド同期)
  const handleToggleMastery = (questionId: string, currentIsMastered: boolean) => {
    const newStatus = currentIsMastered ? "approved" : "mastered";

    // 1. 【即時実行 (0ms)】ローカル状態の即時更新
    setSavedQuestions(prev => prev.map(q => q.id === questionId ? { ...q, status: newStatus } : q));
    setReviewStates(prev => ({
      ...prev,
      [questionId]: {
        ...(prev[questionId] || {
          questionId: questionId,
          totalReviews: 0,
          correctCount: 0,
          consecutiveCorrect: 0,
          easinessFactor: 2.5,
          intervalDays: 1,
          lastReviewedAt: Date.now(),
          nextReviewDate: "",
          updatedAt: Date.now()
        }),
        masteryLevel: newStatus === "mastered" ? "mastered" : "learning",
        intervalDays: newStatus === "mastered" ? 3650 : 1
      }
    }));

    if (newStatus === "mastered") {
      onSaveToast("習得済み（出題停止）に設定しました。次回の通常復習から除外されます ✦");
    } else {
      onSaveToast("出題対象に復元しました（次回復習から出題されます）✦");
    }

    // クイズセッション中に「復習対象」モードで習得済みに設定した場合、キューから直ちに除外（スワイプでも再表示させない）
    if (quizFilter === "active" && newStatus === "mastered") {
      const nextSession = sessionQuestions.filter(q => q.id !== questionId);
      setSessionQuestions(nextSession);
      setSessionCompletedCount(prev => prev + 1);
      if (nextSession.length === 0) {
        setIsSessionCompleted(true);
      } else if (currentQuizIndex >= nextSession.length) {
        setCurrentQuizIndex(nextSession.length - 1);
      }
    } else if (quizFilter === "mastered" && newStatus === "approved") {
      const nextSession = sessionQuestions.filter(q => q.id !== questionId);
      setSessionQuestions(nextSession);
      if (nextSession.length === 0) {
        setIsSessionCompleted(true);
      } else if (currentQuizIndex >= nextSession.length) {
        setCurrentQuizIndex(nextSession.length - 1);
      }
    }

    setSelectedQuizChoices([]);
    setEssayAnswer("");
    setIsQuizAnswerRevealed(false);
    setShowExternalAiPromptBox(false);
    setExternalAiQuestionInput("");

    // 2. 【非同期バックグラウンド同期】裏でスプレッドシートを更新
    setIsSyncingBackground(true);
    learningApiPost({
      action: "updateQuestionStatus",
      questionId: questionId,
      status: newStatus
    }).then(() => {
      setIsSyncingBackground(false);
      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setLastSyncedTime(timeStr);
      localStorage.setItem("cn_learning_last_synced_at", timeStr);
    }).catch(err => {
      console.warn("バックグラウンド更新失敗:", err);
      setIsSyncingBackground(false);
    });
  };

  // 外部AIの図解・解説を取り込んでスプレッドシートに保存・更新
  const handleSaveDiagramExplanation = async (saveMode: "replace" | "append") => {
    if (sessionQuestions.length === 0) return;
    const currentQ = sessionQuestions[currentQuizIndex];
    if (!currentQ || !pastedExplanation.trim()) return;

    const newExplanation = saveMode === "replace"
      ? pastedExplanation.trim()
      : `${currentQ.explanation ? currentQ.explanation + "\n\n" : ""}【図解・詳細解説】\n${pastedExplanation.trim()}`;

    const updatedQ: LearningQuestion = {
      ...currentQ,
      explanation: newExplanation,
      updatedAt: Date.now()
    };

    // 1. 【即時一時記憶 (0ms)】ローカル状態とキャッシュを即時更新
    setSavedQuestions(prev => prev.map(q => q.id === currentQ.id ? updatedQ : q));
    setSessionQuestions(prev => prev.map(q => q.id === currentQ.id ? updatedQ : q));
    setPastedExplanation("");

    // 2. スプレッドシートへ同期保存
    setIsSavingExplanationToSheet(true);
    try {
      const res = await learningApiPost({
        action: "saveLearningQuestions",
        questions: [updatedQ]
      });

      if (res && res.success) {
        onSaveToast("🎉 図解・解説を学習用スプレッドシートに保存・更新しました！");
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setLastSyncedTime(timeStr);
        localStorage.setItem("cn_learning_last_synced_at", timeStr);
      } else {
        throw new Error(res?.error || "スプレッドシートへの保存でエラーが発生しました。");
      }
    } catch (err: any) {
      onSaveToast(`保存エラー: ${err.message || String(err)}`);
    } finally {
      setIsSavingExplanationToSheet(false);
    }
  };

  // クイズの解答判定とレビュー記録 (即時UI更新0ms + バックグラウンド非同期同期)
  const handleSubmitQuizReview = (rating: number) => {
    if (sessionQuestions.length === 0) return;
    const currentQ = sessionQuestions[currentQuizIndex];
    if (!currentQ) return;

    const isMastered = rating === 5;
    let isCorrect = false;
    if (isMastered) {
      isCorrect = true;
    } else if (currentQ.type === "multiple_choice") {
      const correctLabels = currentQ.choices?.filter(c => c.isCorrect).map(c => c.label) || [];
      isCorrect = correctLabels.length === selectedQuizChoices.length && correctLabels.every(l => selectedQuizChoices.includes(l));
    } else if (currentQ.type === "single_choice" || currentQ.type === "true_false") {
      const sel = selectedQuizChoices[0] || null;
      const correctChoice = currentQ.choices?.find(c => c.isCorrect);
      isCorrect = sel === correctChoice?.label || sel === correctChoice?.text || sel === currentQ.correctAnswer;
    } else {
      // 記述式は自己採点 (rating >= 3 で正解扱い)
      isCorrect = rating >= 3;
    }

    // 1. 【即時実行 (0ms)】クライアント側でSM-2アルゴリズムを計算
    const nextState = calculateSM2Review(
      reviewStates[currentQ.id],
      rating,
      isMastered,
      isCorrect
    );

    // ローカル状態を即座に更新
    setReviewStates(prev => ({
      ...prev,
      [currentQ.id]: {
        questionId: currentQ.id,
        totalReviews: nextState.totalReviews,
        correctCount: nextState.correctCount,
        consecutiveCorrect: nextState.consecutiveCorrect,
        easinessFactor: nextState.easinessFactor,
        intervalDays: nextState.intervalDays,
        lastReviewedAt: Date.now(),
        nextReviewDate: nextState.nextReviewDate,
        masteryLevel: nextState.masteryLevel,
        updatedAt: Date.now()
      }
    }));

    if (isMastered) {
      setSavedQuestions(prev => prev.map(q => q.id === currentQ.id ? { ...q, status: "mastered" } : q));
      onSaveToast(`「${currentQ.question.slice(0, 16)}...」を習得済み（出題停止）に設定しました ✦`);
    } else {
      onSaveToast(`自己評価を記録しました（次回出題: ${nextState.intervalDays}日後）✦`);
    }

    // 2. 【即時画面遷移 (0ms)】解答済みの問題をキューから即時除外し、次回復習期日まで非表示にする（スワイプ再表示防止）
    const nextSession = sessionQuestions.filter(q => q.id !== currentQ.id);
    setSessionQuestions(nextSession);
    setSessionCompletedCount(prev => prev + 1);

    if (nextSession.length === 0) {
      onSaveToast("🎉 すべての問題の一巡が完了しました！お疲れ様でした。");
      setIsSessionCompleted(true);
    } else {
      // 現在のインデックスが新しい配列長以上なら最後の問題に合わせる。それ以外は同じ位置（次の未解答問題が繰り上がる）
      if (currentQuizIndex >= nextSession.length) {
        setCurrentQuizIndex(nextSession.length - 1);
      }
    }
    setSelectedQuizChoices([]);
    setEssayAnswer("");
    setIsQuizAnswerRevealed(false);
    setExternalAiQuestionInput("");
    setPastedExplanation("");
    setShowExternalAiPromptBox(false);

    // 3. 【非同期バックグラウンド同期】SpreadSheetへ裏でログ保存（操作を一切止めない）
    setIsSyncingBackground(true);
    learningApiPost({
      action: "saveReviewLog",
      logData: {
        questionId: currentQ.id,
        userAnswer: currentQ.type === "multiple_choice" ? selectedQuizChoices.join(", ") : (selectedQuizChoices[0] || essayAnswer || ""),
        isCorrect: isCorrect,
        rating: rating,
        isMastered: isMastered,
        memo: isMastered ? "習得済み・出題停止" : undefined,
        timeSpentSeconds: 10
      }
    }).then(() => {
      setIsSyncingBackground(false);
      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setLastSyncedTime(timeStr);
      localStorage.setItem("cn_learning_last_synced_at", timeStr);
    }).catch(err => {
      console.warn("バックグラウンド復習ログ同期エラー:", err);
      setIsSyncingBackground(false);
    });
  };

  const approvedCount = candidateQuestions.filter(q => q.isApproved !== false).length;

  return (
    <div className="fixed inset-0 z-[350] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs">
      <div
        className="fixed inset-0"
        onClick={() => !isGeneratingApi && !isSavingToSheet && onClose()}
      />

      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-[860px] max-w-full shadow-2xl relative z-[351] flex flex-col max-h-[92vh] overflow-hidden text-gray-200">
        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-[#30363d] flex items-center justify-between bg-[#1c2128]">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
              <BookOpen className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>学習問題生成 ＆ 復習管理</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-normal border border-indigo-500/30">
                  Active Recall / SRS
                </span>
              </h3>
              <p className="text-[11px] text-gray-400 mt-0.5">
                ノートから良問を作成し、承認した問題を学習専用スプレッドシート（5タブ）へ同期します。
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isGeneratingApi || isSavingToSheet}
            className="text-gray-400 hover:text-gray-100 p-1.5 rounded-lg hover:bg-[#30363d] transition-colors cursor-pointer text-sm shrink-0"
            title="閉じる"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="shrink-0 border-b border-[#30363d] bg-[#12161c] px-4 py-2.5">
          <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-0.5">
            <button
              type="button"
              onClick={() => setActiveTab("generate")}
              className={`min-h-[38px] px-3.5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 shrink-0 transition-all cursor-pointer whitespace-nowrap active:scale-[0.98] ${
                activeTab === "generate"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/40 border border-indigo-400/50"
                  : "bg-[#161b22] text-gray-300 hover:text-white hover:bg-[#21262d] border border-[#30363d]"
              }`}
              title="ノートの内容から学習問題を生成"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
              <span>1. 問題生成</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("approval")}
              className={`min-h-[38px] px-3.5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 shrink-0 transition-all cursor-pointer whitespace-nowrap active:scale-[0.98] ${
                activeTab === "approval"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-950/40 border border-emerald-400/50"
                  : "bg-[#161b22] text-gray-300 hover:text-white hover:bg-[#21262d] border border-[#30363d]"
              }`}
              title="生成・取り込んだ問題の確認・編集・承認フロー"
            >
              <ListChecks className="w-3.5 h-3.5 text-emerald-300" />
              <span>2. 承認・編集</span>
              {candidateQuestions.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
                  activeTab === "approval"
                    ? "bg-black/30 text-emerald-100 border border-white/20"
                    : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                }`}>
                  {candidateQuestions.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("quiz");
                if (savedQuestions.length === 0) handleFetchSavedQuestions();
              }}
              className={`min-h-[38px] px-3.5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 shrink-0 transition-all cursor-pointer whitespace-nowrap active:scale-[0.98] ${
                activeTab === "quiz"
                  ? "bg-sky-600 text-white shadow-md shadow-sky-950/40 border border-sky-400/50"
                  : "bg-[#161b22] text-gray-300 hover:text-white hover:bg-[#21262d] border border-[#30363d]"
              }`}
              title="保存済み問題のクイズ解答と復習・SRS間隔学習"
            >
              <Zap className="w-3.5 h-3.5 text-sky-300" />
              <span>3. クイズ・復習</span>
              {savedQuestions.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
                  activeTab === "quiz"
                    ? "bg-black/30 text-sky-100 border border-white/20"
                    : "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                }`} title={masteredCount > 0 ? `復習対象: ${activeCount}問 (習得済み: ${masteredCount}問)` : `全${savedQuestions.length}問`}>
                  {activeCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("settings")}
              className={`min-h-[38px] px-3.5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 shrink-0 transition-all cursor-pointer whitespace-nowrap active:scale-[0.98] ${
                activeTab === "settings"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-950/40 border border-purple-400/50"
                  : "bg-[#161b22] text-gray-300 hover:text-white hover:bg-[#21262d] border border-[#30363d]"
              }`}
              title="学習用スプレッドシート（5タブ）のURL設定と検証"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-purple-300" />
              <span>4. シート設定</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* TAB 1: GENERATE */}
          {activeTab === "generate" && (
            <div className="space-y-4">
              {/* Generation Mode Switch */}
              <div className="bg-[#1c2128] border border-[#30363d] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>問題生成方法の選択</span>
                  </span>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-gray-400">推奨:</span>
                    <span className="text-emerald-400 font-bold">外部AI用プロンプト (API課金ゼロ)</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Mode 1: External AI Prompt */}
                  <label
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col gap-2 ${
                      generationMode === "external_prompt"
                        ? "bg-emerald-950/20 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                        : "bg-[#0d1117] border-[#30363d] hover:border-gray-600 opacity-75"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="generationMode"
                          value="external_prompt"
                          checked={generationMode === "external_prompt"}
                          onChange={() => setGenerationMode("external_prompt")}
                          className="accent-emerald-500"
                        />
                        <span className="text-xs font-bold text-emerald-300 flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          外部AI用プロンプトを生成
                        </span>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                        API利用料: なし (無料)
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-300 leading-relaxed">
                      アプリ内で問題生成プロンプトを組み立ててコピーします。ChatGPTやGemini等のWeb画面に貼り付けて、得られたJSONを取り込みます。
                    </p>
                    <div className="text-[10px] text-emerald-400/90 bg-emerald-950/40 p-1.5 rounded border border-emerald-500/20 font-medium">
                      🛡️ <strong>外部AIモードではAPIを呼び出しません。</strong> Gemini APIキー不要で無料枠を活用できます。
                    </div>
                  </label>

                  {/* Mode 2: API Generation */}
                  <label
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col gap-2 ${
                      generationMode === "api"
                        ? "bg-purple-950/20 border-purple-500/50 shadow-[0_0_12px_rgba(168,85,247,0.15)]"
                        : "bg-[#0d1117] border-[#30363d] hover:border-gray-600 opacity-75"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="generationMode"
                          value="api"
                          checked={generationMode === "api"}
                          onChange={() => setGenerationMode("api")}
                          className="accent-purple-500"
                        />
                        <span className="text-xs font-bold text-purple-300 flex items-center gap-1">
                          <Zap className="w-3.5 h-3.5" />
                          Gemini APIで自動生成
                        </span>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                        従量課金API
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-300 leading-relaxed">
                      設定画面のGemini APIキーを利用して、アプリ内で直接リクエストを送り問題を瞬時に自動生成します。
                    </p>
                    <div className="text-[10px] text-amber-300/90 bg-amber-950/40 p-1.5 rounded border border-amber-500/20 font-medium">
                      ⚠️ <strong>API利用料が発生する可能性があります。</strong> Google AI Studioの従量課金または利用枠が消費されます。
                    </div>
                  </label>
                </div>
              </div>

              {/* Note Selection & Configuration */}
              <div className="bg-[#1c2128] border border-[#30363d] rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Select Note */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-300 flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <span>出題元ノートの選択</span>
                        {activeNote && selectedNoteId === activeNote.id && (
                          <span className="text-[9px] text-indigo-300 bg-indigo-500/20 px-1.5 py-0.2 rounded border border-indigo-500/30">
                            編集中
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-indigo-400 font-normal">
                        表示中 {notes.length} 件
                      </span>
                    </label>
                    <select
                      value={selectedNoteId}
                      onChange={(e) => setSelectedNoteId(e.target.value)}
                      className="w-full text-xs p-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white outline-none focus:border-indigo-500"
                    >
                      {notes.map(n => (
                        <option key={n.id} value={n.id}>
                          {n.title || "無題のノート"} ({n.content.length}文字)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Question Count */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-300">問題数</label>
                    <div className="flex gap-2">
                      {[1, 3, 5, 10].map(cnt => (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => setQuestionCount(cnt)}
                          className={`flex-1 py-1.5 text-xs rounded-lg font-bold border transition cursor-pointer ${
                            questionCount === cnt
                              ? "bg-indigo-600 text-white border-indigo-500"
                              : "bg-[#0d1117] text-gray-400 border-[#30363d] hover:text-white"
                          }`}
                        >
                          {cnt}問
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Question Type */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-300">問題形式</label>
                    <select
                      value={questionType}
                      onChange={(e) => setQuestionType(e.target.value as any)}
                      className="w-full text-xs p-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white outline-none focus:border-indigo-500"
                    >
                      <option value="single_choice">単一選択式 (4択問題 - 推奨)</option>
                      <option value="multiple_choice">複数選択式 (複数正解あり)</option>
                      <option value="true_false">正誤判定 (○×問題)</option>
                      <option value="short_answer">短文記述式 (用語・定義)</option>
                      <option value="mix">ミックス形式 (バランス良く混在)</option>
                    </select>
                  </div>

                  {/* Difficulty */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-300">難易度</label>
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value as any)}
                      className="w-full text-xs p-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white outline-none focus:border-indigo-500"
                    >
                      <option value="easy">基礎 (主要用語・事実確認)</option>
                      <option value="medium">標準 (因果関係・理由の理解 - 推奨)</option>
                      <option value="hard">応用・発展 (多角的分析・深い考察)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Mode Specific Body */}
              {generationMode === "external_prompt" ? (
                <div className="space-y-4">
                  {/* Step A: Copy Prompt */}
                  <div className="bg-[#1c2128] border border-emerald-500/30 rounded-xl p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold text-xs">
                          A
                        </span>
                        <h4 className="text-xs font-bold text-white">
                          プロンプトをワンクリックでコピー
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyPrompt}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                      >
                        {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{isCopied ? "コピー完了！" : "📋 プロンプトをコピー"}</span>
                      </button>
                    </div>

                    <p className="text-[11px] text-gray-400">
                      以下のプロンプトをコピーし、お好みのAIサービス（ChatGPT, Claude, Gemini Web等）に貼り付けて送信してください。
                    </p>

                    <textarea
                      readOnly
                      rows={6}
                      value={generatedPrompt}
                      className="w-full p-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg font-mono text-[11px] text-gray-300 outline-none leading-relaxed select-all"
                    />

                    {/* Quick AI Links */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-gray-400">
                      <span>無料AIサービスを開く:</span>
                      <a
                        href="https://chatgpt.com"
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-0.5 rounded bg-[#21262d] hover:bg-[#30363d] text-emerald-300 border border-[#30363d] flex items-center gap-1 transition"
                      >
                        <span>ChatGPT</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                      <a
                        href="https://gemini.google.com"
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-0.5 rounded bg-[#21262d] hover:bg-[#30363d] text-sky-300 border border-[#30363d] flex items-center gap-1 transition"
                      >
                        <span>Gemini Web</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                      <a
                        href="https://claude.ai"
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-0.5 rounded bg-[#21262d] hover:bg-[#30363d] text-amber-300 border border-[#30363d] flex items-center gap-1 transition"
                      >
                        <span>Claude</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>

                  {/* Step B: Paste & Validate JSON */}
                  <div className="bg-[#1c2128] border border-indigo-500/30 rounded-xl p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold text-xs">
                          B
                        </span>
                        <h4 className="text-xs font-bold text-white">
                          外部AIが返したJSONを貼り付けて取り込む
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={handleValidateAndImport}
                        disabled={isValidating || !pastedJsonText.trim()}
                        className="px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm active:scale-95"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>構文検証 ＆ 承認リストへ取り込む</span>
                      </button>
                    </div>

                    <p className="text-[11px] text-gray-400">
                      外部AIから返されたJSON文字列（コードブロック記法 ```json ... ``` のままでも可）を貼り付けてください。
                    </p>

                    <textarea
                      rows={6}
                      value={pastedJsonText}
                      onChange={(e) => {
                        setPastedJsonText(e.target.value);
                        if (validationErrors.length > 0) setValidationErrors([]);
                      }}
                      placeholder={`[\n  {\n    "type": "single_choice",\n    "question": "...",\n    "choices": [...],\n    "correctAnswer": "...",\n    "explanation": "...",\n    "evidence": { "quote": "..." }\n  }\n]`}
                      className="w-full p-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg font-mono text-[11px] text-white outline-none focus:border-indigo-500 leading-relaxed"
                    />

                    {/* Validation Errors Feedback */}
                    {validationErrors.length > 0 && (
                      <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-lg text-xs text-red-200 space-y-1.5">
                        <div className="flex items-center gap-1.5 font-bold text-red-300">
                          <AlertCircle className="w-4 h-4 text-red-400" />
                          <span>JSON検証エラー ({validationErrors.length}件):</span>
                        </div>
                        <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-red-200/90">
                          {validationErrors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                        <p className="text-[10px] text-gray-400 pt-1 border-t border-red-500/20">
                          💡 AIに「JSON形式のみを修正して再出力してください」と指示するか、不要な前後の文章を除去してみてください。
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Mode 2: API Generation Execution */
                <div className="bg-[#1c2128] border border-purple-500/30 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-purple-400" />
                        Gemini APIで問題を自動生成
                      </h4>
                      <p className="text-[11px] text-gray-400 mt-1">
                        モデル: <span className="text-purple-300 font-mono">{localStorage.getItem("cn_gemini_model") || "gemini-flash-lite-latest"}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleGenerateViaApi}
                      disabled={isGeneratingApi}
                      className="px-5 py-2.5 rounded-lg text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white transition flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50 active:scale-95"
                    >
                      {isGeneratingApi ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>AI生成中...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>今すぐ問題を生成する</span>
                        </>
                      )}
                    </button>
                  </div>

                  {validationErrors.length > 0 && (
                    <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-lg text-xs text-red-200">
                      {validationErrors.map((err, i) => (
                        <p key={i}>{err}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: APPROVAL & EDIT FLOW */}
          {activeTab === "approval" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-[#1c2128] border border-[#30363d] rounded-xl p-3 px-4">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-white">承認・確認リスト:</span>
                  <span className="text-emerald-400 font-bold">{approvedCount} / {candidateQuestions.length} 問 承認中</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCandidateQuestions(prev => prev.map(q => ({ ...q, isApproved: true })));
                    }}
                    className="text-[11px] text-gray-300 hover:text-white px-2 py-1 rounded bg-[#21262d] border border-[#30363d] cursor-pointer"
                  >
                    すべて選択
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCandidateQuestions(prev => prev.map(q => ({ ...q, isApproved: false })));
                    }}
                    className="text-[11px] text-gray-300 hover:text-white px-2 py-1 rounded bg-[#21262d] border border-[#30363d] cursor-pointer"
                  >
                    すべて解除
                  </button>
                </div>
              </div>

              {candidateQuestions.length === 0 ? (
                <div className="p-10 border border-dashed border-[#30363d] rounded-xl text-center space-y-2">
                  <p className="text-gray-400 text-xs">取り込まれた問題はまだありません。</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("generate")}
                    className="text-xs text-indigo-400 hover:underline font-bold cursor-pointer"
                  >
                    「1. 問題生成」タブから問題を生成または貼り付けてください →
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {candidateQuestions.map((q, idx) => {
                    const isEditing = editingQuestionId === q.id;

                    return (
                      <div
                        key={q.id}
                        className={`border rounded-xl p-4 transition-all space-y-3 ${
                          q.isApproved !== false
                            ? "bg-[#1c2128] border-[#30363d] hover:border-emerald-500/40"
                            : "bg-[#12161c] border-[#252b34] opacity-60"
                        }`}
                      >
                        {/* Top bar */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={q.isApproved !== false}
                              onChange={() => handleToggleApproval(q.id)}
                              className="w-4 h-4 accent-emerald-500 cursor-pointer"
                            />
                            <span className="text-xs font-bold text-gray-400">#{idx + 1}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              {q.type === "single_choice"
                                ? "4択選択式"
                                : q.type === "multiple_choice"
                                ? "複数選択"
                                : q.type === "true_false"
                                ? "○×判定"
                                : "短文記述"}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">
                              難易度: {q.difficulty === "easy" ? "基礎" : q.difficulty === "hard" ? "応用" : "標準"}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-300 border border-blue-500/20">
                              元ノート: {q.noteTitle}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingQuestionId(isEditing ? null : q.id)}
                              className="p-1 text-gray-400 hover:text-indigo-300 rounded hover:bg-[#30363d] transition cursor-pointer"
                              title="問題を編集"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCandidate(q.id)}
                              className="p-1 text-gray-400 hover:text-red-400 rounded hover:bg-[#30363d] transition cursor-pointer"
                              title="この問題を破棄"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Question Prompt */}
                        {isEditing ? (
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-400">問題文の編集:</label>
                            <textarea
                              rows={3}
                              value={q.question}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCandidateQuestions(prev =>
                                  prev.map(item => (item.id === q.id ? { ...item, question: val } : item))
                                );
                              }}
                              className="w-full text-xs p-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white outline-none focus:border-indigo-500"
                            />
                          </div>
                        ) : (
                          <p className="text-xs font-semibold text-white leading-relaxed pl-6">
                            {q.question}
                          </p>
                        )}

                        {/* Choices Display / Edit */}
                        {q.choices && q.choices.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                            {q.choices.map((ch, cIdx) => (
                              <div
                                key={cIdx}
                                className={`p-2 rounded-lg text-xs border flex items-center justify-between ${
                                  ch.isCorrect
                                    ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-200 font-medium"
                                    : "bg-[#0d1117] border-[#30363d] text-gray-300"
                                }`}
                              >
                                <span className="truncate">
                                  <strong className="mr-1.5">{ch.label}:</strong> {ch.text}
                                </span>
                                {ch.isCorrect && (
                                  <span className="text-[10px] font-bold text-emerald-400 shrink-0 ml-1">
                                    [正解]
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Correct Answer & Explanation */}
                        <div className="bg-[#0d1117] border border-[#30363d]/70 rounded-lg p-2.5 pl-3.5 space-y-1 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">正解:</span>
                            <span className="text-white font-bold">{q.correctAnswer}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">解説: </span>
                            <span className="text-gray-300 text-[11px]">{q.explanation}</span>
                          </div>
                        </div>

                        {/* Evidence Citation Quote */}
                        {q.evidence && q.evidence.quote && (
                          <div className="bg-indigo-950/20 border-l-2 border-indigo-500 pl-3 py-1.5 pr-2 rounded-r text-[11px] text-indigo-200/90 flex items-start gap-1.5">
                            <Quote className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <span className="font-bold text-indigo-300 mr-1">出題根拠 (ノート引用):</span>
                              <span className="italic">「{q.evidence.quote}」</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Save to Spreadsheet Action Bar */}
                  <div className="sticky bottom-0 bg-[#161b22] border border-emerald-500/40 rounded-xl p-4 shadow-2xl flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Save className="w-4 h-4 text-emerald-400" />
                        <span>学習用スプレッドシートへ保存</span>
                      </h4>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        承認にチェックを入れた <strong>{approvedCount} 件</strong> の問題のみを専用タブに書き込みます。
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveApprovedQuestions}
                      disabled={isSavingToSheet || approvedCount === 0}
                      className="px-5 py-2.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-2 cursor-pointer shadow-lg disabled:opacity-50 active:scale-95"
                    >
                      {isSavingToSheet ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>スプレッドシートへ保存中...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>💾 承認した {approvedCount} 件を保存する</span>
                        </>
                      )}
                    </button>
                  </div>

                  {saveStatusMessage && (
                    <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-lg text-xs text-emerald-300">
                      {saveStatusMessage}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: QUIZ & PRACTICE */}
          {activeTab === "quiz" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2.5 bg-[#1c2128] border border-[#30363d] rounded-xl p-3 px-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-sky-400" />
                    <span>復習クイズセッション</span>
                  </span>

                  {/* Filter Selector */}
                  <div className="flex items-center gap-1 bg-[#0d1117] p-1 rounded-lg border border-[#30363d] text-[11px]">
                    <button
                      type="button"
                      onClick={() => handleFilterChange("active")}
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer flex items-center gap-1.5 ${
                        quizFilter === "active"
                          ? "bg-sky-600 text-white shadow-xs"
                          : "text-gray-400 hover:text-white"
                      }`}
                      title="習得済みを除いた、現在復習が必要な問題を出題します"
                    >
                      <span>復習対象</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sky-950/80 text-sky-200 border border-sky-400/30">
                        {activeCount}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleFilterChange("all")}
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer flex items-center gap-1.5 ${
                        quizFilter === "all"
                          ? "bg-indigo-600 text-white shadow-xs"
                          : "text-gray-400 hover:text-white"
                      }`}
                      title="習得済みを含むすべての保存済み問題を出題します"
                    >
                      <span>すべて</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-950/80 text-indigo-200 border border-indigo-400/30">
                        {savedQuestions.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleFilterChange("mastered")}
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer flex items-center gap-1.5 ${
                        quizFilter === "mastered"
                          ? "bg-purple-600 text-white shadow-xs"
                          : "text-gray-400 hover:text-white"
                      }`}
                      title="もう出題しない（習得済み）に設定した問題を確認・復元します"
                    >
                      <span>★ 習得済み</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-950/80 text-purple-200 border border-purple-400/30">
                        {masteredCount}
                      </span>
                    </button>
                  </div>

                  {/* Random / Shuffle Selector */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleToggleShuffle}
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer flex items-center gap-1.5 text-[11px] ${
                        isQuizShuffled
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs hover:bg-amber-500/30"
                          : "bg-[#0d1117] text-gray-400 hover:text-white border border-[#30363d] hover:bg-[#1f242c]"
                      }`}
                      title={
                        isQuizShuffled
                          ? "現在ランダム（シャッフル）出題中です。クリックすると登録順に戻します"
                          : "現在登録順に出題中です。クリックするとランダム（シャッフル）出題に切り替えます"
                      }
                    >
                      <Shuffle className={`w-3.5 h-3.5 ${isQuizShuffled ? "text-amber-400" : "text-gray-400"}`} />
                      <span>{isQuizShuffled ? "ランダム出題" : "登録順"}</span>
                    </button>
                    {isQuizShuffled && (
                      <button
                        type="button"
                        onClick={handleReshuffle}
                        className="px-2 py-1 rounded-md bg-[#0d1117] text-amber-300 hover:text-amber-200 hover:bg-[#1f242c] border border-amber-500/30 transition cursor-pointer flex items-center gap-1 text-[11px]"
                        title="問題をもう一度ランダムにシャッフル並び替えします"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span className="hidden sm:inline">再シャッフル</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  {/* Cache & Background Sync status */}
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-md text-[10px]" title="アプリ内に一時記憶（ローカルキャッシュ）されているため、クイズ解答や復習が待ち時間ゼロ（0ms）でサクサク進みます">
                      <Zap className="w-2.5 h-2.5 text-emerald-400" />
                      <span>一時記憶（爆速）</span>
                    </span>
                    {isSyncingBackground ? (
                      <span className="text-sky-300 text-[10px] flex items-center gap-1 bg-sky-950/40 border border-sky-500/30 px-2 py-0.5 rounded-md animate-pulse">
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                        <span>シート同期中...</span>
                      </span>
                    ) : lastSyncedTime ? (
                      <span className="text-gray-400 text-[10px] hidden md:inline">
                        最終同期: {lastSyncedTime}
                      </span>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleFetchSavedQuestions(false)}
                    disabled={isLoadingSaved}
                    className="text-xs px-2.5 py-1 rounded-lg bg-[#21262d] border border-[#30363d] text-gray-200 hover:text-white flex items-center gap-1.5 cursor-pointer shrink-0 transition hover:bg-[#30363d]"
                    title="Googleスプレッドシートから最新の問題データを直接再読み込みして一時記憶を更新します"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingSaved ? "animate-spin" : ""}`} />
                    <span>シートと最新同期</span>
                  </button>
                </div>
              </div>

              {savedQuestions.length === 0 ? (
                <div className="p-10 border border-dashed border-[#30363d] rounded-xl text-center space-y-2">
                  <p className="text-gray-400 text-xs">学習用スプレッドシートに保存された問題がありません。</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("generate")}
                    className="text-xs text-indigo-400 hover:underline font-bold cursor-pointer"
                  >
                    先に問題を生成してスプレッドシートへ保存してください →
                  </button>
                </div>
              ) : isSessionCompleted ? (
                <div className="bg-[#1c2128] border border-emerald-500/40 rounded-xl p-8 text-center space-y-4 animate-[fadeIn_0.2s_ease-out]">
                  <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center shadow-lg border border-emerald-500/30">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-lg font-bold text-white">
                      🎉 本日の問題が一巡しました！お疲れ様でした
                    </h4>
                    <p className="text-xs text-gray-300 max-w-md mx-auto leading-relaxed">
                      出題対象の全 {sessionInitialTotal || sessionCompletedCount} 問の復習・自己評価が完了しました。<br />
                      各問題の解答結果と自己評価に基づき、最適な次回復習間隔（エビングハウスの忘却曲線・SM-2）が自動設定されました。
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsSessionCompleted(false);
                        const qList = getQuestionsForFilter(quizFilter, savedQuestions, reviewStates);
                        const listToUse = qList.length > 0 ? qList : savedQuestions;
                        setSessionQuestions(listToUse);
                        setSessionInitialTotal(listToUse.length);
                        setSessionCompletedCount(0);
                        setCurrentQuizIndex(0);
                        setSelectedQuizChoices([]);
                        setEssayAnswer("");
                        setIsQuizAnswerRevealed(false);
                        setShowExternalAiPromptBox(false);
                        setExternalAiQuestionInput("");
                      }}
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#21262d] hover:bg-[#30363d] text-gray-200 border border-[#30363d] transition cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>もう一度解く</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSessionCompleted(false);
                        const qList = getQuestionsForFilter(quizFilter, savedQuestions, reviewStates, true);
                        const listToUse = qList.length > 0 ? qList : shuffleArray(savedQuestions);
                        setSessionQuestions(listToUse);
                        setSessionInitialTotal(listToUse.length);
                        setSessionCompletedCount(0);
                        setCurrentQuizIndex(0);
                        setSelectedQuizChoices([]);
                        setEssayAnswer("");
                        setIsQuizAnswerRevealed(false);
                        setIsQuizShuffled(true);
                        setShowExternalAiPromptBox(false);
                        setExternalAiQuestionInput("");
                        localStorage.setItem("cn_quiz_shuffled", "true");
                        onSaveToast("問題をランダムにシャッフルして再出題します ✦");
                      }}
                      className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 transition cursor-pointer flex items-center gap-1.5 shadow"
                    >
                      <Shuffle className="w-3.5 h-3.5 text-amber-400" />
                      <span>シャッフルして解き直す</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSessionCompleted(false);
                        setActiveTab("approval");
                      }}
                      className="px-5 py-2 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition cursor-pointer shadow flex items-center gap-1.5"
                    >
                      <ListChecks className="w-3.5 h-3.5" />
                      <span>問題管理リストに戻る</span>
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer shadow"
                    >
                      完了して閉じる
                    </button>
                  </div>
                </div>
              ) : sessionQuestions.length === 0 ? (
                quizFilter === "active" ? (
                  masteredCount === savedQuestions.length && savedQuestions.length > 0 ? (
                    <div className="bg-[#1c2128] border border-purple-500/30 rounded-xl p-8 text-center space-y-3">
                      <div className="w-12 h-12 mx-auto rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center">
                        <Award className="w-6 h-6" />
                      </div>
                      <h4 className="text-base font-bold text-white">
                        すべての問題が習得済み（出題停止中）です！🎉
                      </h4>
                      <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
                        保存されている全 {savedQuestions.length} 問が「もう出題しない（習得済み）」に設定されています。<br />
                        復習を再開したい問題がある場合は「習得済み」タブからいつでも出題対象に戻せます。
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => handleFilterChange("mastered")}
                          className="px-4 py-2 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition cursor-pointer flex items-center gap-1.5"
                        >
                          <Award className="w-4 h-4" />
                          <span>★ 習得済み問題（{masteredCount}問）を確認・復元する</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleFilterChange("all")}
                          className="px-4 py-2 rounded-lg text-xs font-bold bg-[#21262d] hover:bg-[#30363d] text-gray-200 transition cursor-pointer"
                        >
                          <span>全問題を通して通しクイズを行う</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#1c2128] border border-sky-500/30 rounded-xl p-8 text-center space-y-3">
                      <div className="w-12 h-12 mx-auto rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-sky-400" />
                      </div>
                      <h4 className="text-base font-bold text-white">
                        本日の復習はすべて完了しました！🎉
                      </h4>
                      <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
                        今日復習すべき問題はすべて解き終えました。<br />
                        各問題の次回出題予定日になると自動的に再出題されます。「すべて」タブからいつでも通しクイズを練習できます。
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => handleFilterChange("all")}
                          className="px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer"
                        >
                          <span>全問題を通して通しクイズを行う</span>
                        </button>
                        {masteredCount > 0 && (
                          <button
                            type="button"
                            onClick={() => handleFilterChange("mastered")}
                            className="px-4 py-2 rounded-lg text-xs font-bold bg-[#21262d] hover:bg-[#30363d] text-purple-300 border border-purple-500/30 transition cursor-pointer flex items-center gap-1.5"
                          >
                            <Award className="w-4 h-4 text-purple-400" />
                            <span>★ 習得済み問題（{masteredCount}問）を確認・復元する</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                ) : (
                  <div className="bg-[#1c2128] border border-[#30363d] rounded-xl p-8 text-center space-y-3">
                    <div className="w-12 h-12 mx-auto rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center">
                      <BookOpen className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-white">
                      習得済み（出題停止）の問題はまだありません
                    </h4>
                    <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
                      クイズ解答後の自己評価アンケートで「★ 習得済みにする（もう出題しない）」を押すか、問題右上の「★ もう出題しない」ボタンを押すと、この一覧に登録され通常の復習から自動除外されます。
                    </p>
                    <button
                      type="button"
                      onClick={() => handleFilterChange("active")}
                      className="px-4 py-2 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition cursor-pointer"
                    >
                      復習対象の問題に戻る →
                    </button>
                  </div>
                )
              ) : (
                (() => {
                  const currentQ = sessionQuestions[currentQuizIndex] || sessionQuestions[0];
                  if (!currentQ) return null;
                  const isCurrentQMastered = currentQ.status === "mastered" || reviewStates[currentQ.id]?.masteryLevel === "mastered";

                  // タッチスワイプハンドラー
                  const handleTouchStart = (e: React.TouchEvent) => {
                    if (e.touches.length > 0) {
                      touchStartXRef.current = e.touches[0].clientX;
                      touchStartYRef.current = e.touches[0].clientY;
                    }
                  };

                  const handleTouchEnd = (e: React.TouchEvent) => {
                    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
                    const endX = e.changedTouches[0]?.clientX ?? touchStartXRef.current;
                    const endY = e.changedTouches[0]?.clientY ?? touchStartYRef.current;
                    const diffX = endX - touchStartXRef.current;
                    const diffY = endY - touchStartYRef.current;
                    touchStartXRef.current = null;
                    touchStartYRef.current = null;

                    // 縦スクロール優先時はスワイプ判定を無視
                    if (Math.abs(diffY) > Math.abs(diffX)) return;

                    const threshold = 50; // スワイプ判定の最小移動距離(px)

                    if (Math.abs(diffX) >= threshold) {
                      if (diffX > 0) {
                        // 右スワイプ → 前の未解答問題へ
                        if (currentQuizIndex > 0) {
                          setCurrentQuizIndex(prev => prev - 1);
                          setSelectedQuizChoices([]);
                          setEssayAnswer("");
                          setIsQuizAnswerRevealed(false);
                          setShowExternalAiPromptBox(false);
                          setPastedExplanation("");
                          setExternalAiQuestionInput("");
                        }
                      } else {
                        // 左スワイプ → 次の未解答問題へ
                        if (currentQuizIndex < sessionQuestions.length - 1) {
                          setCurrentQuizIndex(prev => prev + 1);
                          setSelectedQuizChoices([]);
                          setEssayAnswer("");
                          setIsQuizAnswerRevealed(false);
                          setShowExternalAiPromptBox(false);
                          setPastedExplanation("");
                          setExternalAiQuestionInput("");
                        }
                      }
                    }
                  };

                  return (
                    <div
                      onTouchStart={handleTouchStart}
                      onTouchEnd={handleTouchEnd}
                      className="bg-[#1c2128] border border-[#30363d] rounded-xl p-5 space-y-4 select-none"
                    >
                      {/* Swipe Guide & Quick Navigation Bar */}
                      <div className="flex items-center justify-between text-[11px] text-gray-300 bg-[#0d1117] px-3 py-2 rounded-lg border border-[#30363d]">
                        <button
                          type="button"
                          disabled={currentQuizIndex === 0}
                          onClick={() => {
                            if (currentQuizIndex > 0) {
                              setCurrentQuizIndex(prev => prev - 1);
                              setSelectedQuizChoices([]);
                              setEssayAnswer("");
                              setIsQuizAnswerRevealed(false);
                              setShowExternalAiPromptBox(false);
                              setPastedExplanation("");
                              setExternalAiQuestionInput("");
                            }
                          }}
                          className={`flex items-center gap-1 font-semibold transition px-2 py-0.5 rounded ${
                            currentQuizIndex === 0
                              ? "text-gray-600 cursor-not-allowed"
                              : "text-sky-400 hover:text-sky-300 hover:bg-[#21262d] cursor-pointer"
                          }`}
                          title="前の未解答問題へ（右スワイプでも移動可能）"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          <span>前の問題</span>
                        </button>

                        <span className="text-[10px] text-gray-400 flex items-center gap-1 hidden sm:flex">
                          <span>💡 左右スワイプまたはボタンで未解答問題を切り替えできます</span>
                        </span>

                        <button
                          type="button"
                          disabled={currentQuizIndex >= sessionQuestions.length - 1}
                          onClick={() => {
                            if (currentQuizIndex < sessionQuestions.length - 1) {
                              setCurrentQuizIndex(prev => prev + 1);
                              setSelectedQuizChoices([]);
                              setEssayAnswer("");
                              setIsQuizAnswerRevealed(false);
                              setShowExternalAiPromptBox(false);
                              setPastedExplanation("");
                              setExternalAiQuestionInput("");
                            }
                          }}
                          className={`flex items-center gap-1 font-semibold transition px-2 py-0.5 rounded ${
                            currentQuizIndex >= sessionQuestions.length - 1
                              ? "text-gray-600 cursor-not-allowed"
                              : "text-sky-400 hover:text-sky-300 hover:bg-[#21262d] cursor-pointer"
                          }`}
                          title="次の未解答問題へ（左スワイプでも移動可能）"
                        >
                          <span>次の問題</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Question meta */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sky-300 font-bold">
                            第 {currentQuizIndex + 1} / {sessionQuestions.length} 問
                          </span>
                          <span className="text-[11px] text-gray-400 font-medium">
                            （未解答: {sessionQuestions.length}問{sessionCompletedCount > 0 ? ` ・ 完了: ${sessionCompletedCount}問` : ""}）
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-gray-800 text-gray-300">
                            {currentQ.type === "single_choice"
                              ? "4択問題"
                              : currentQ.type === "true_false"
                              ? "○×問題"
                              : currentQ.type === "multiple_choice"
                              ? "複数選択問題"
                              : "記述問題"}
                          </span>
                          {isQuizShuffled && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-500/30 font-medium flex items-center gap-1" title="ランダム（シャッフル）順で出題中">
                              <Shuffle className="w-2.5 h-2.5" />
                              <span>ランダム</span>
                            </span>
                          )}
                          {(() => {
                            const st = reviewStates[currentQ.id];
                            if (!st || !st.lastReviewedAt) {
                              return (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-gray-800/80 text-gray-400 font-medium">
                                  前回: 未解答（新規）
                                </span>
                              );
                            }
                            const dt = new Date(st.lastReviewedAt);
                            const dateStr = `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
                            return (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-gray-800/90 text-gray-300 font-medium border border-gray-700/60" title={`前回の解答日時: ${dateStr} (累計復習回数: ${st.totalReviews || 0}回)`}>
                                前回: {dateStr} {st.totalReviews ? `(計${st.totalReviews}回)` : ""}
                              </span>
                            );
                          })()}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400 truncate max-w-[160px] hidden sm:inline" title={currentQ.noteTitle}>
                            ノート: {currentQ.noteTitle}
                          </span>
                          {/* Quick mastery toggle button in header */}
                          {isCurrentQMastered ? (
                            <button
                              type="button"
                              onClick={() => handleToggleMastery(currentQ.id, true)}
                              className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#21262d] hover:bg-[#30363d] text-emerald-300 border border-emerald-500/30 transition cursor-pointer flex items-center gap-1 active:scale-95"
                              title="次回以降の通常復習に出題されるように復元します"
                            >
                              <Undo2 className="w-3 h-3" />
                              <span>↩ 出題対象に戻す</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleMastery(currentQ.id, false)}
                              className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#21262d] hover:bg-purple-950/40 text-purple-300 border border-purple-500/30 transition cursor-pointer flex items-center gap-1 active:scale-95"
                              title="この問題はもう覚えたため、次回以降の通常復習から除外します"
                            >
                              <Award className="w-3 h-3" />
                              <span>★ もう出題しない</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Question Text */}
                      <h4 className="text-sm font-bold text-white leading-relaxed">
                        {currentQ.question}
                      </h4>

                      {/* Choices or Input */}
                      {currentQ.choices && currentQ.choices.length > 0 ? (
                        <div className="space-y-2 pt-2">
                          {(() => {
                            const isMulti = currentQ.type === "multiple_choice" || (currentQ.choices?.filter(c => c.isCorrect).length || 0) > 1 || (currentQ.correctAnswer && (currentQ.correctAnswer.includes(",") || currentQ.correctAnswer.includes("、")));
                            return (
                              <>
                                {isMulti && (
                                  <div className="text-[11px] text-sky-400 font-medium bg-sky-950/30 border border-sky-500/30 px-2.5 py-1.5 rounded-md flex items-center gap-1.5 mb-2">
                                    <span>💡 【複数選択】この問題は正解が複数あります。すべて選択してください。</span>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                          {currentQ.choices.map((ch, idx) => {
                            const isSelected = selectedQuizChoices.includes(ch.label);
                            let choiceStyle = "bg-[#0d1117] border-[#30363d] hover:border-gray-500 text-gray-200";

                            if (isQuizAnswerRevealed) {
                              if (ch.isCorrect) {
                                choiceStyle = "bg-emerald-950/40 border-emerald-500 text-emerald-200 font-bold";
                              } else if (isSelected && !ch.isCorrect) {
                                choiceStyle = "bg-red-950/40 border-red-500 text-red-200";
                              }
                            } else if (isSelected) {
                              choiceStyle = "bg-sky-950/40 border-sky-500 text-sky-200 font-bold";
                            }

                            return (
                              <button
                                key={idx}
                                type="button"
                                disabled={isQuizAnswerRevealed}
                                onClick={() => {
                                  const isMulti = currentQ.type === "multiple_choice" || (currentQ.choices?.filter(c => c.isCorrect).length || 0) > 1 || (currentQ.correctAnswer && (currentQ.correctAnswer.includes(",") || currentQ.correctAnswer.includes("、")));
                                  if (isMulti) {
                                    if (selectedQuizChoices.includes(ch.label)) {
                                      setSelectedQuizChoices(selectedQuizChoices.filter(l => l !== ch.label));
                                    } else {
                                      setSelectedQuizChoices([...selectedQuizChoices, ch.label]);
                                    }
                                  } else {
                                    setSelectedQuizChoices([ch.label]);
                                  }
                                }}
                                className={`w-full p-3 rounded-lg border text-left text-xs transition cursor-pointer flex items-center justify-between ${choiceStyle}`}
                              >
                                <span className="flex items-center gap-2">
                                  <span className={`w-4 h-4 ${currentQ.type === "multiple_choice" ? "rounded" : "rounded-full"} border border-gray-500 flex items-center justify-center text-[10px] ${isSelected ? "bg-sky-500 text-white border-sky-400 font-bold" : "bg-black/20"}`}>
                                    {currentQ.type === "multiple_choice" ? (isSelected ? "✓" : "") : (isSelected ? "●" : "")}
                                  </span>
                                  <span>
                                    <strong className="mr-2 font-mono">{ch.label}:</strong> {ch.text}
                                  </span>
                                </span>
                                {isQuizAnswerRevealed && ch.isCorrect && (
                                  <span className="text-emerald-400 text-xs font-bold">✓ 正解</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        /* Text/Essay input */
                        <div className="space-y-2 pt-2">
                          <textarea
                            rows={3}
                            placeholder="あなたの解答を入力..."
                            value={essayAnswer}
                            onChange={(e) => setEssayAnswer(e.target.value)}
                            disabled={isQuizAnswerRevealed}
                            className="w-full p-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-xs text-white outline-none focus:border-sky-500"
                          />
                        </div>
                      )}

                      {/* Check Answer Button */}
                      {!isQuizAnswerRevealed ? (
                        <div className="pt-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => setIsQuizAnswerRevealed(true)}
                            className="px-5 py-2 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition cursor-pointer shadow-md"
                          >
                            解答を確認する →
                          </button>
                        </div>
                      ) : (
                        /* Revealed explanation & self evaluation */
                        <div className="space-y-3 pt-3 border-t border-[#30363d] animate-[fadeIn_0.15s_ease-out]">
                          <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-3.5 space-y-2.5 text-xs">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-emerald-400">模範解答:</span>
                                <span className="text-white font-bold bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded text-xs">
                                  {currentQ.correctAnswer}
                                </span>
                              </div>
                              {currentQ.explanation && (currentQ.explanation.includes("➔") || currentQ.explanation.includes("->") || currentQ.explanation.includes("▼") || currentQ.explanation.includes("【図解") || currentQ.explanation.includes("──") || currentQ.explanation.includes("│")) && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 font-medium flex items-center gap-1">
                                  <span>📊 図解あり</span>
                                </span>
                              )}
                            </div>
                            <div>
                              <div className="font-bold text-gray-400 mb-1 flex items-center justify-between">
                                <span>解説・図解:</span>
                              </div>
                              <div className="text-gray-200 text-xs whitespace-pre-wrap font-sans leading-relaxed bg-[#161b22] p-3 rounded-lg border border-[#30363d]/80 max-h-72 overflow-y-auto selection:bg-indigo-500/30">
                                {currentQ.explanation || <span className="text-gray-500 italic">解説は未登録です。</span>}
                              </div>
                            </div>
                            {currentQ.evidence && currentQ.evidence.quote && (
                              <div className="pt-2 text-[11px] text-indigo-300 italic border-t border-[#30363d]/60 flex items-start gap-1.5">
                                <span className="shrink-0">📌</span>
                                <div>
                                  <strong>出題根拠:</strong> 「{currentQ.evidence.quote}」
                                </div>
                              </div>
                            )}
                          </div>

                          {/* External AI Prompt Generator & Sheet Saver */}
                          <div className="bg-[#0b0f15] border border-indigo-500/40 rounded-xl p-3.5 space-y-3 text-xs">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                                  <span>🤖 外部AIに図解解説を依頼 ＆ スプレッドシート保存</span>
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-900/40 text-indigo-200 border border-indigo-500/30">
                                  図解特化プロンプト
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowExternalAiPromptBox(!showExternalAiPromptBox)}
                                className="text-xs text-indigo-300 hover:text-white bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/40 px-3 py-1 rounded-lg cursor-pointer transition flex items-center gap-1 font-semibold"
                              >
                                {showExternalAiPromptBox ? "閉じる ▲" : "図解を依頼・保存する ▼"}
                              </button>
                            </div>

                            {showExternalAiPromptBox && (
                              <div className="space-y-3 pt-2 border-t border-[#30363d]/60">
                                {/* Step 1: Prompt Generation */}
                                <div className="space-y-2 bg-[#12161c] p-3 rounded-lg border border-[#30363d]">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-gray-200 text-xs flex items-center gap-1.5">
                                      <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-bold">1</span>
                                      <span>外部AI用プロンプトの作成（視覚的図解・短文指定）</span>
                                    </span>
                                    <span className="text-[10px] text-gray-400">長文防止 / 図解・フローチャート指定</span>
                                  </div>
                                  <p className="text-gray-300 text-[11px] leading-relaxed">
                                    質問や特に知りたい論点があれば入力し、「プロンプトをコピー」を押してChatGPT、Claude、Gemini等の外部AIに貼り付けてください。
                                  </p>
                                  <textarea
                                    rows={2}
                                    value={externalAiQuestionInput}
                                    onChange={(e) => setExternalAiQuestionInput(e.target.value)}
                                    placeholder="例: 正解と選択肢Bの概念の違いを対比させてください。矢印を使った因果フローで図解してください。"
                                    className="w-full p-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-xs text-white outline-none focus:border-indigo-500 leading-relaxed placeholder:text-gray-600"
                                  />
                                  <div className="flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const promptText = `あなたは卓越した要約力と図解力を持つプロの教育AIです。
以下の学習問題について、長文テキストでのダラダラとした説明は避け、
【一目で構造がわかる視覚的な図解（関係図・矢印フロー・対比マップ・箇条書き）】を中心に分かりやすく解説してください。

【対象ノート】
タイトル: ${currentQ.noteTitle || "学習ノート"}

【問題】
${currentQ.question}

${currentQ.choices ? `【選択肢】\n${currentQ.choices.map(c => `${c.label}: ${c.text}${c.isCorrect ? " (正解)" : ""}`).join("\n")}` : ""}

【模範解答】
${currentQ.correctAnswer}

【既存の解説】
${currentQ.explanation}

${currentQ.evidence?.quote ? `【出題根拠引用】\n「${currentQ.evidence.quote}」` : ""}

【ユーザーの質問・知りたい点】
${externalAiQuestionInput.trim() || "なぜこの解答になるのかのロジックや、選択肢の違い・概念の全体像を視覚的に把握したいです。"}

────────────────────────
【出力形式の指定（厳守）】
長文の説明は不要です。以下の3構成で、スマホやPCでも等幅で見やすい図解テキストを出力してください。

1. 📌【コア結論（1行）】
正解となる決定的な理由を1文でズバリ要約。

2. 📊【視覚的図解（矢印・フロー・対比マップ）】
テキストで概念の前後関係、因果の流れ、選択肢の対比をアスキーアート・記号（[概念A] ➔ [概念B] ➔ [結果]、▼、├── などのツリー構造）を使ってわかりやすく描いてください。

3. 🔍【要点まとめ（箇条書き3点以内）】
・正解のポイント: ...
・誤り選択肢との決定的な違い: ...
・覚えておくべきキーワード: ...`;

                                        navigator.clipboard.writeText(promptText);
                                        onSaveToast("✓ 外部AI用の視覚的図解プロンプトをコピーしました！ChatGPTやClaudeに貼り付けて解説を生成してください。");
                                      }}
                                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer flex items-center gap-1.5 shadow"
                                    >
                                      <span>📋 視覚的図解プロンプトをコピー</span>
                                    </button>
                                  </div>
                                </div>

                                {/* Step 2: Paste Diagram & Save to Spreadsheet */}
                                <div className="space-y-2 bg-[#12161c] p-3 rounded-lg border border-[#30363d]">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-gray-200 text-xs flex items-center gap-1.5">
                                      <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center font-bold">2</span>
                                      <span>AIの回答（図解テキスト）をスプレッドシートへ登録</span>
                                    </span>
                                    <span className="text-[10px] text-emerald-400 font-medium">スプレッドシート「Questions」へ保存</span>
                                  </div>
                                  <p className="text-gray-300 text-[11px] leading-relaxed">
                                    外部AIが出力した図解・解説をそのまま以下に貼り付け、「保存」ボタンを押してください。スプレッドシートの解説列が自動更新されます。
                                  </p>
                                  <textarea
                                    rows={4}
                                    value={pastedExplanation}
                                    onChange={(e) => setPastedExplanation(e.target.value)}
                                    placeholder={`外部AIの図解出力をここに貼り付け\n\n例:\n📌【コア結論】...\n\n📊【視覚的図解】\n[金利上昇] ➔ [借入コスト増] ➔ [住宅着工減少]\n       └── [銀行収益改善]\n\n🔍【要点まとめ】\n・...`}
                                    className="w-full p-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-xs text-white outline-none focus:border-emerald-500 leading-relaxed font-mono placeholder:text-gray-600 placeholder:font-sans"
                                  />

                                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                    <span className="text-[10px] text-gray-400">
                                      ※保存すると即座に現在の解説画面が更新され、復習時にも表示されます。
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        disabled={!pastedExplanation.trim() || isSavingExplanationToSheet}
                                        onClick={() => handleSaveDiagramExplanation("append")}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                                          !pastedExplanation.trim() || isSavingExplanationToSheet
                                            ? "bg-[#161b22] text-gray-500 border-[#30363d] cursor-not-allowed"
                                            : "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-600 hover:text-white"
                                        }`}
                                        title="既存の解説を残し、末尾に貼り付けた図解を追加保存します"
                                      >
                                        <span>📎 既存解説の末尾に追記</span>
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!pastedExplanation.trim() || isSavingExplanationToSheet}
                                        onClick={() => handleSaveDiagramExplanation("replace")}
                                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow ${
                                          !pastedExplanation.trim() || isSavingExplanationToSheet
                                            ? "bg-emerald-950/40 text-emerald-700/50 border border-emerald-900/30 cursor-not-allowed"
                                            : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50"
                                        }`}
                                        title="貼り付けた図解で既存の解説を上書き保存します"
                                      >
                                        {isSavingExplanationToSheet ? (
                                          <>
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            <span>シートへ保存中...</span>
                                          </>
                                        ) : (
                                          <>
                                            <Save className="w-3.5 h-3.5" />
                                            <span>💾 図解をスプレッドシートに保存（上書き）</span>
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Self Evaluation Survey Box */}
                          <div className="bg-[#12161c] p-3.5 rounded-xl border border-[#30363d] space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-gray-300 block">
                                自己評価（復習間隔アルゴリズムへ記録）:
                              </span>
                              <span className="text-[10px] text-gray-400">
                                次回出題間隔を自動最適化
                              </span>
                            </div>

                            {/* Standard 4-level SRS Rating */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <button
                                type="button"
                                onClick={() => handleSubmitQuizReview(1)}
                                className="py-2 px-3 rounded-lg text-xs font-bold bg-red-950/30 hover:bg-red-900/40 text-red-300 border border-red-500/30 transition cursor-pointer text-center active:scale-95"
                              >
                                <div>✕ もう一度 (Again)</div>
                                <div className="text-[9px] text-red-400/80 font-normal">明日復習</div>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSubmitQuizReview(2)}
                                className="py-2 px-3 rounded-lg text-xs font-bold bg-amber-950/30 hover:bg-amber-900/40 text-amber-300 border border-amber-500/30 transition cursor-pointer text-center active:scale-95"
                              >
                                <div>△ 難しい (Hard)</div>
                                <div className="text-[9px] text-amber-400/80 font-normal">短期間で再出題</div>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSubmitQuizReview(3)}
                                className="py-2 px-3 rounded-lg text-xs font-bold bg-sky-950/30 hover:bg-sky-900/40 text-sky-300 border border-sky-500/30 transition cursor-pointer text-center active:scale-95"
                              >
                                <div>○ 正解 (Good)</div>
                                <div className="text-[9px] text-sky-400/80 font-normal">標準間隔で出題</div>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSubmitQuizReview(4)}
                                className="py-2 px-3 rounded-lg text-xs font-bold bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-300 border border-emerald-500/30 transition cursor-pointer text-center active:scale-95"
                              >
                                <div>◎ 簡単 (Easy)</div>
                                <div className="text-[9px] text-emerald-400/80 font-normal">長期間隔へ延長</div>
                              </button>
                            </div>

                            {/* Dedicated Survey Action: もう出さなくていいものの設定 */}
                            <div className="pt-2.5 border-t border-[#30363d]/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#0d1117]/60 -mx-1 px-3 py-2.5 rounded-lg border border-[#30363d]/40">
                              <div className="text-[11px] text-gray-300">
                                <div className="font-bold text-purple-300 flex items-center gap-1.5">
                                  <Award className="w-3.5 h-3.5 text-purple-400" />
                                  <span>もう出題しなくてよい問題（完璧に習得・卒業）:</span>
                                </div>
                                <span className="text-[10px] text-gray-400">
                                  自己評価アンケートで選択すると、次回の通常復習から自動的に除外されます
                                </span>
                              </div>

                              {isCurrentQMastered ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleMastery(currentQ.id, true)}
                                  className="shrink-0 py-1.5 px-3 rounded-lg text-xs font-bold bg-[#21262d] hover:bg-[#30363d] text-emerald-300 border border-emerald-500/40 transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                                >
                                  <Undo2 className="w-3.5 h-3.5" />
                                  <span>↩ 出題対象に戻す (復習再開)</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSubmitQuizReview(5)}
                                  className="shrink-0 py-2 px-3.5 rounded-lg text-xs font-bold bg-purple-900/40 hover:bg-purple-800/60 text-purple-200 border border-purple-500/50 shadow-sm transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                                >
                                  <Award className="w-3.5 h-3.5 text-purple-300" />
                                  <span>★ 習得済みにする (もう出題しない)</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {/* TAB 4: SPREADSHEET STORAGE FOUNDATION SETTINGS */}
          {activeTab === "settings" && (
            <div className="space-y-4">
              <div className="bg-[#1c2128] border border-purple-500/30 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-purple-500/20 text-purple-300">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">
                      学習用スプレッドシートの保存基盤設定
                    </h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      問題・出題根拠・選択肢・復習履歴を保存する専用のスプレッドシートURLを設定します（ノート用とは別ファイル）。
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-300">
                    学習用スプレッドシート URL (または ID)
                  </label>
                  <input
                    type="text"
                    value={learningSsUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLearningSsUrl(val);
                      if (val.trim()) {
                        localStorage.setItem("cn_learning_spreadsheet_url", val.trim());
                      } else {
                        localStorage.removeItem("cn_learning_spreadsheet_url");
                      }
                    }}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full text-xs p-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-white font-mono outline-none focus:border-purple-500"
                  />
                  <p className="text-[10px] text-gray-400">
                    ※localStorageキー <code>cn_learning_spreadsheet_url</code> に永続化されます。
                  </p>
                </div>

                {/* 5 Tabs Info */}
                <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-3.5 space-y-2 text-xs">
                  <span className="font-bold text-gray-300 block">
                    【自動構築される5つの専用タブ仕様】
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-gray-400">
                    <div className="p-2 bg-[#161b22] rounded border border-[#30363d]/60">
                      <strong className="text-purple-300 block">1. Questions (問題マスター)</strong>
                      question_id, note_id, question_type, question, correct_answer, explanation, difficulty, tags, status
                    </div>
                    <div className="p-2 bg-[#161b22] rounded border border-[#30363d]/60">
                      <strong className="text-purple-300 block">2. QuestionEvidence (出題根拠)</strong>
                      evidence_id, question_id, note_id, quote (引用文), section, created_at
                    </div>
                    <div className="p-2 bg-[#161b22] rounded border border-[#30363d]/60">
                      <strong className="text-purple-300 block">3. QuestionChoices (選択肢マスター)</strong>
                      choice_id, question_id, choice_order, choice_label, choice_text, is_correct, explanation
                    </div>
                    <div className="p-2 bg-[#161b22] rounded border border-[#30363d]/60">
                      <strong className="text-purple-300 block">4. ReviewLogs (復習解答ログ)</strong>
                      log_id, question_id, user_answer, is_correct, time_spent_seconds, rating, answered_at
                    </div>
                    <div className="p-2 bg-[#161b22] rounded border border-[#30363d]/60 sm:col-span-2">
                      <strong className="text-purple-300 block">5. ReviewState (忘却曲線・SRS習熟状態)</strong>
                      question_id, total_reviews, correct_count, consecutive_correct, easiness_factor, interval_days, next_review_date, mastery_level
                    </div>
                  </div>
                </div>

                {/* Initialize Button */}
                <div className="pt-2 flex items-center justify-between border-t border-[#30363d]">
                  <div className="text-[11px] text-gray-400">
                    既存のシートやデータは削除されず、ヘッダーのみ安全に補完・初期化されます。
                  </div>
                  <button
                    type="button"
                    onClick={handleInitSheets}
                    disabled={isInitializingSheets || !learningSsUrl.trim()}
                    className="px-4 py-2 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isInitializingSheets ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>初期化中...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>🚀 5タブを初期化・検証する</span>
                      </>
                    )}
                  </button>
                </div>

                {initSheetsResult && (
                  <div className={`p-3 rounded-lg text-xs leading-relaxed border ${
                    initSheetsResult.startsWith("✓")
                      ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                      : "bg-red-950/40 border-red-500/40 text-red-300"
                  }`}>
                    {initSheetsResult}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#30363d] bg-[#1c2128] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-[11px] text-gray-400">
            <HelpCircle className="w-3.5 h-3.5 text-gray-500" />
            <span>外部AIモードではAPI通信は発生しません。</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-gray-200 hover:text-white font-medium transition cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
