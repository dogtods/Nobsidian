/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Note, LearningQuestion, QuestionGenerationConfig, QuestionType, QuestionChoice, QuestionEvidence, ReviewState } from "../types";

/**
 * 外部AI (ChatGPT, Claude, Gemini Web等) 用の問題生成プロンプトを組み立てる
 */
export function buildQuestionPrompt(note: Note, config: QuestionGenerationConfig): string {
  const { count, type, difficulty } = config;

  let formatInstruction = "";
  if (type === "single_choice") {
    formatInstruction = "【単一選択式 (4択問題)】各問に選択肢(A〜Dの4つ)を用意し、正解は必ず1つにしてください。";
  } else if (type === "multiple_choice") {
    formatInstruction = "【複数選択式】各問に選択肢(A〜Dの4つ)を用意し、正解となる選択肢を2つ以上設定してください。";
  } else if (type === "true_false") {
    formatInstruction = "【正誤判定 (○×問題)】提示された命題がノート内容に照らして正しいか(○)誤りか(×)を判定させ、誤りの場合は何が違うのかを解説に明記してください。";
  } else if (type === "short_answer") {
    formatInstruction = "【短文記述式】キーワードや定義、理由を簡潔に記述させる問題とし、模範解答をcorrectAnswerに設定してください。choicesは空配列[]にしてください。";
  } else {
    formatInstruction = "【ミックス形式】4択選択式・○×正誤判定・短文記述式をバランスよく組み合わせて作成してください。";
  }

  let difficultyInstruction = "";
  if (difficulty === "easy") {
    difficultyInstruction = "【基礎レベル】ノートに直接書かれている主要なキーワード・定義・基本概念の確認問題。";
  } else if (difficulty === "medium") {
    difficultyInstruction = "【標準レベル】事実同士の関係性、因果関係、理由やメカニズムを理解しているかを問う問題。";
  } else {
    difficultyInstruction = "【応用・発展レベル】比較・分析、条件分岐、背景にある課題や影響度を深く考察させる良問。";
  }

  const rawNoteText = (note.content || note.summary || note.rawContent || "").trim();
  const truncatedContent = rawNoteText.length > 4000 ? rawNoteText.substring(0, 4000) + "\n...[以降省略]" : rawNoteText;

  return `あなたは教育工学とアクティブ・リコール（能動的想起）に基づく問題作成のエキスパートです。
以下の【提供ノート】の内容だけを唯一の情報源として、理解度測定・記憶定着のための学習問題を【厳密に ${count} 問】作成してください。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 最重要制約・作成ルール（必ず厳守してください）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 【忠実性の原則（ハルシネーション禁止）】
   提供ノートに明確に書かれている事実・数値・定義・因果関係のみを根拠として出題してください。ノートに記載のない一般知識や推測を混ぜないでください。

2. 【出題根拠（evidence.quote）の必須引用】
   各問題について、正解の直接の裏付けとなるノート本文の文章を、一文字一句違わずそのまま "quote" に引用してください。

3. 【問題形式・明確性の原則】
   ${formatInstruction}
   ※問題文(question)は、単なる文章の切り抜きや曖昧な穴埋めではなく、何を問われているのか（背景概念、理由、因果関係、定義など）が初見でも明確に伝わる具体的な文面としてください。

4. 【難易度】
   ${difficultyInstruction}

5. 【出力形式（最重要・厳格なJSON出力）】
   以下のJSONスキーマに従った「JSON配列 [ ... ] のみ」を出力してください。
   ※前置きや挨拶文、マークダウンのコードブロック以外の余計なテキストは含めないでください。
   ※必ず先頭文字を '[' 、末尾文字を ']' にしてください。
   ※JSONの中にコメント（ // 等）は絶対に含めないでください（エラーの原因になります）。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 期待するJSONスキーマ例
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[
  {
    "type": "single_choice",
    "question": "問題文をここに具体的に記述してください。",
    "choices": [
      {
        "label": "A",
        "text": "選択肢Aのテキスト",
        "isCorrect": true,
        "explanation": "選択肢Aが正解である理由"
      },
      {
        "label": "B",
        "text": "選択肢Bのテキスト",
        "isCorrect": false,
        "explanation": "選択肢Bが誤りである理由"
      },
      {
        "label": "C",
        "text": "選択肢Cのテキスト",
        "isCorrect": false,
        "explanation": "選択肢Cが誤りである理由"
      },
      {
        "label": "D",
        "text": "選択肢Dのテキスト",
        "isCorrect": false,
        "explanation": "選択肢Dが誤りである理由"
      }
    ],
    "correctAnswer": "正解のテキスト（選択肢テキストまたは正解記号、○/×、模範解答）",
    "explanation": "なぜそれが正解なのか、根拠に基づく詳細で丁寧な解説。",
    "difficulty": "${difficulty}",
    "tags": ["関連キーワード1", "関連キーワード2"],
    "evidence": {
      "quote": "問題および正解の根拠となった提供ノート本文内の文章をそのまま抜粋引用してください。",
      "section": "参照元の見出しや位置（任意）"
    }
  }
]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 提供ノート
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
タイトル: ${note.title || "無題のノート"}
${note.keywords ? `タグ/キーワード: ${note.keywords}\n` : ""}
${note.summary ? `要約:\n${note.summary}\n` : ""}
本文:
${truncatedContent}
`;
}

/**
 * 外部AIまたはAPIから返されたJSON文字列を解析・バリデーションする
 */
export function validateQuestionJson(
  inputJsonText: string,
  sourceNote?: Note
): { isValid: boolean; questions: LearningQuestion[]; errors: string[] } {
  const errors: string[] = [];

  if (!inputJsonText || inputJsonText.trim() === "") {
    return { isValid: false, questions: [], errors: ["JSONテキストが空です。外部AIから返された結果を貼り付けてください。"] };
  }

  let cleaned = inputJsonText.trim();

  // 1. マークダウンコードブロックの剥離 (```json ... ``` または ``` ... ```)
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // 2. JSON配列 [ ... ] またはオブジェクト { ... } の境界を検出
  const firstBracket = cleaned.indexOf("[");
  const firstBrace = cleaned.indexOf("{");
  let startIndex = -1;
  let isArray = true;

  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    startIndex = firstBracket;
    isArray = true;
  } else if (firstBrace !== -1) {
    startIndex = firstBrace;
    isArray = false;
  }

  if (startIndex > 0) {
    cleaned = cleaned.substring(startIndex);
  }

  const lastBracket = cleaned.lastIndexOf("]");
  const lastBrace = cleaned.lastIndexOf("}");
  const endIndex = isArray ? lastBracket : lastBrace;

  if (endIndex !== -1 && endIndex < cleaned.length - 1) {
    cleaned = cleaned.substring(0, endIndex + 1);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseErr: any) {
    return {
      isValid: false,
      questions: [],
      errors: [
        `JSON構文エラー: 正しいJSON形式ではありません (${parseErr.message})。`,
        "前後の不要な文章や余分な改行・引用符がないか確認してください。"
      ]
    };
  }

  // 配列形式に統一
  let items: any[] = [];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed.questions)) {
      items = parsed.questions;
    } else if (Array.isArray(parsed.data)) {
      items = parsed.data;
    } else if (Array.isArray(parsed.items)) {
      items = parsed.items;
    } else if (parsed.question) {
      items = [parsed];
    } else {
      errors.push("JSONオブジェクト内に問題の配列(questions/data等)が見つかりません。");
    }
  }

  if (items.length === 0 && errors.length === 0) {
    errors.push("問題データが1件も見つかりませんでした。配列形式 [ { ... } ] で指定してください。");
  }

  const validatedQuestions: LearningQuestion[] = [];
  const now = Date.now();

  items.forEach((item, idx) => {
    const itemNum = idx + 1;
    const itemErrors: string[] = [];

    // 必須項目: question
    const questionText = typeof item.question === "string" ? item.question.trim() : "";
    if (!questionText || questionText.length < 4) {
      itemErrors.push(`問題 #${itemNum}: 問題文 (question) が空か短すぎます。`);
    }

    // 問題形式: type
    let qType: QuestionType = "single_choice";
    const rawType = String(item.type || "").toLowerCase().trim();
    if (["single_choice", "single", "multiple_choice_single", "4択"].includes(rawType)) {
      qType = "single_choice";
    } else if (["multiple_choice", "multiple", "multi", "複数選択"].includes(rawType)) {
      qType = "multiple_choice";
    } else if (["true_false", "boolean", "tf", "正誤", "○×"].includes(rawType)) {
      qType = "true_false";
    } else if (["short_answer", "text", "essay", "記述", "短文記述"].includes(rawType)) {
      qType = "short_answer";
    } else {
      // 選択肢の数等から推測
      if (Array.isArray(item.choices) && item.choices.length > 0) {
        qType = "single_choice";
      } else {
        qType = "short_answer";
      }
    }

    // 正解: correctAnswer
    const correctAnswer = typeof item.correctAnswer === "string"
      ? item.correctAnswer.trim()
      : typeof item.correct_answer === "string"
      ? item.correct_answer.trim()
      : typeof item.answer === "string"
      ? item.answer.trim()
      : "";

    if (!correctAnswer) {
      itemErrors.push(`問題 #${itemNum}: 正解 (correctAnswer) が指定されていません。`);
    }

    // 解説: explanation
    const explanation = typeof item.explanation === "string" ? item.explanation.trim() : "";
    if (!explanation) {
      itemErrors.push(`問題 #${itemNum}: 解説 (explanation) が指定されていません。`);
    }

    // 選択肢の検証 (選択式または正誤判定の場合)
    const choices: QuestionChoice[] = [];
    if (qType === "single_choice" || qType === "multiple_choice" || qType === "true_false") {
      if (Array.isArray(item.choices) && item.choices.length >= 2) {
        let hasCorrectChoice = false;
        item.choices.forEach((c: any, cIdx: number) => {
          const choiceText = typeof c === "string" ? c.trim() : typeof c.text === "string" ? c.text.trim() : "";
          const isCorrect = typeof c === "object"
            ? (c.isCorrect === true || String(c.isCorrect).toLowerCase() === "true" || choiceText === correctAnswer || c.label === correctAnswer)
            : (choiceText === correctAnswer);

          if (isCorrect) hasCorrectChoice = true;

          choices.push({
            id: `c_${now}_${idx}_${cIdx}`,
            order: cIdx + 1,
            label: typeof c === "object" && c.label ? String(c.label) : String.fromCharCode(65 + cIdx),
            text: choiceText || `選択肢 ${String.fromCharCode(65 + cIdx)}`,
            isCorrect: isCorrect,
            explanation: typeof c === "object" && c.explanation ? String(c.explanation) : ""
          });
        });

        if (!hasCorrectChoice && choices.length > 0) {
          // 正解ラベルやテキストと一致する選択肢を探す
          const matched = choices.find(ch => ch.label.toLowerCase() === correctAnswer.toLowerCase() || ch.text.toLowerCase() === correctAnswer.toLowerCase());
          if (matched) {
            matched.isCorrect = true;
          } else {
            // 先頭を正解にするか警告
            choices[0].isCorrect = true;
          }
        }
      } else if (qType === "true_false") {
        // ○×用の選択肢を自動生成
        const isTrueCorrect = ["○", "true", "正しい", "t", "yes"].includes(correctAnswer.toLowerCase());
        choices.push(
          { id: `c_${now}_${idx}_0`, order: 1, label: "A", text: "○ (正しい)", isCorrect: isTrueCorrect },
          { id: `c_${now}_${idx}_1`, order: 2, label: "B", text: "× (誤り)", isCorrect: !isTrueCorrect }
        );
      } else {
        itemErrors.push(`問題 #${itemNum}: 選択式問題ですが選択肢 (choices) が2つ以上定義されていません。`);
      }
    }

    // 根拠 (evidence) の検証
    let evidenceObj: QuestionEvidence | undefined = undefined;
    let quoteStr = "";
    if (typeof item.evidence === "string") {
      quoteStr = item.evidence.trim();
      evidenceObj = {
        id: `ev_${now}_${idx}`,
        quote: quoteStr,
        noteId: sourceNote ? sourceNote.id : "",
        noteTitle: sourceNote ? sourceNote.title : ""
      };
    } else if (item.evidence && typeof item.evidence === "object") {
      quoteStr = typeof item.evidence.quote === "string" ? item.evidence.quote.trim() : "";
      evidenceObj = {
        id: `ev_${now}_${idx}`,
        quote: quoteStr,
        section: typeof item.evidence.section === "string" ? item.evidence.section.trim() : "",
        noteId: sourceNote ? sourceNote.id : "",
        noteTitle: sourceNote ? sourceNote.title : ""
      };
    }

    if (!quoteStr) {
      itemErrors.push(`問題 #${itemNum}: 出題の根拠となる引用 (evidence.quote) が見つかりません。`);
    }

    if (itemErrors.length > 0) {
      errors.push(...itemErrors);
    } else {
      validatedQuestions.push({
        id: `q_${now}_${idx}_${Math.floor(Math.random() * 1000)}`,
        noteId: sourceNote ? sourceNote.id : (item.noteId || ""),
        noteTitle: sourceNote ? sourceNote.title : (item.noteTitle || "無題のノート"),
        type: qType,
        question: questionText,
        correctAnswer: correctAnswer,
        explanation: explanation,
        difficulty: (["easy", "medium", "hard"].includes(item.difficulty) ? item.difficulty : "medium") as any,
        tags: Array.isArray(item.tags) ? item.tags : sourceNote?.keywords ? sourceNote.keywords.split(",").map(k => k.trim()) : [],
        source: "external_ai_prompt",
        status: "approved",
        choices: choices.length > 0 ? shuffleChoices(choices) : undefined,
        evidence: evidenceObj,
        createdAt: now,
        updatedAt: now,
        isApproved: true
      });
    }
  });

  return {
    isValid: errors.length === 0,
    questions: validatedQuestions,
    errors: errors
  };
}

/**
 * ローカルヒューリスティックによる問題生成 (Zero API call fallback)
 * Gemini APIが利用できない場合や Flash-Lite が失敗した際の最終フォールバック
 */
export function generateQuestionsLocally(note: Note, config: QuestionGenerationConfig): LearningQuestion[] {
  const content = (note.content || note.summary || note.rawContent || "").trim();
  const title = note.title || "無題";
  const now = Date.now();
  const questions: LearningQuestion[] = [];

  // 本文から文章を抽出
  const sentences = content
    .split(/[。\n]+/)
    .map(s => s.trim())
    .filter(s => s.length >= 15 && !s.startsWith("#") && !s.startsWith("- ["));

  if (sentences.length === 0) {
    // 最小限のタイトル確認問題
    questions.push({
      id: `q_${now}_local_0`,
      noteId: note.id,
      noteTitle: title,
      type: "single_choice",
      question: `ノート「${title}」の主要なテーマは何ですか？`,
      correctAnswer: title,
      explanation: `ノートのタイトル「${title}」に基づき、全体要旨を確認する問題です。`,
      difficulty: "easy",
      tags: ["基本概念"],
      source: "manual",
      status: "approved",
      choices: [
        { id: `c_${now}_0_0`, order: 1, label: "A", text: title, isCorrect: true },
        { id: `c_${now}_0_1`, order: 2, label: "B", text: "関連性のない別のトピック", isCorrect: false },
        { id: `c_${now}_0_2`, order: 3, label: "C", text: "未整理の予備メモ", isCorrect: false },
        { id: `c_${now}_0_3`, order: 4, label: "D", text: "過去のアーカイブ資料", isCorrect: false }
      ],
      evidence: {
        id: `ev_${now}_0`,
        quote: title,
        noteId: note.id,
        noteTitle: title
      },
      createdAt: now,
      updatedAt: now,
      isApproved: true
    });
    return questions;
  }

  const targetCount = Math.min(config.count, Math.max(1, sentences.length));

  for (let i = 0; i < targetCount; i++) {
    const sentence = sentences[i % sentences.length];
    
    // キーワード抽出（名詞や重要語句候補）
    const matchWords: string[] = sentence.match(/[A-Za-z0-9_]{3,}|[一-龠]{2,8}|[ァ-ヴー]{3,8}/g) || [];
    const keyword = matchWords.find((w: string) => w.length >= 2 && !["これ", "それ", "ため", "こと", "もの"].includes(w)) || title;

    const clozeQuestion = sentence.replace(keyword, "【　？　】");

    questions.push({
      id: `q_${now}_local_${i}`,
      noteId: note.id,
      noteTitle: title,
      type: "single_choice",
      question: `【空欄補充】以下の文章の空欄【 ？ 】に入る最も適切な語句を選んでください。\n「${clozeQuestion}」`,
      correctAnswer: keyword,
      explanation: `元ノート本文より: 「${sentence}」`,
      difficulty: config.difficulty || "medium",
      tags: [keyword],
      source: "manual",
      status: "approved",
      choices: [
        { id: `c_${now}_${i}_0`, order: 1, label: "A", text: keyword, isCorrect: true },
        { id: `c_${now}_${i}_1`, order: 2, label: "B", text: "関連補足データ", isCorrect: false },
        { id: `c_${now}_${i}_2`, order: 3, label: "C", text: "外部参考情報", isCorrect: false },
        { id: `c_${now}_${i}_3`, order: 4, label: "D", text: "一般的な定義", isCorrect: false }
      ],
      evidence: {
        id: `ev_${now}_${i}`,
        quote: sentence,
        noteId: note.id,
        noteTitle: title
      },
      createdAt: now,
      updatedAt: now,
      isApproved: true
    });
  }

  return questions;
}

/**
 * Gemini APIを利用した問題生成 (APIモード)
 * RULE[AGENTS_md]に準拠した3層フォールバック機構を内蔵
 */
export async function generateQuestionsViaGemini(
  note: Note,
  config: QuestionGenerationConfig,
  apiKey: string,
  modelName?: string
): Promise<{ questions: LearningQuestion[]; fallbackUsed?: string }> {
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("Gemini APIキーが設定されていません。AI設定よりAPIキーを入力してください。");
  }

  const model = modelName || localStorage.getItem("cn_gemini_model") || "gemini-flash-lite-latest";
  const prompt = buildQuestionPrompt(note, config);

  // 1. First Try: Structured Output (JSON Schema)
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.3,
          maxOutputTokens: 2500
        }
      })
    });

    if (res.ok) {
      const data = await res.json();
      const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (textOutput) {
        const validation = validateQuestionJson(textOutput, note);
        if (validation.isValid && validation.questions.length > 0) {
          validation.questions.forEach(q => { q.source = "ai_api"; });
          return { questions: validation.questions };
        }
      }
    }
  } catch (structuredErr) {
    console.warn("[Gemini API] 構造化出力 (JSON mode) が失敗しました。フリーテキスト生成にフォールバックします:", structuredErr);
  }

  // 2. Second Try: Free-text Generation (Flash-liteに最適)
  try {
    const freeTextRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt + "\n\n※注意: 説明文を挟まず、必ず厳密なJSON配列のみを出力してください。" }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 2500
        }
      })
    });

    if (freeTextRes.ok) {
      const freeData = await freeTextRes.json();
      const freeOutput = freeData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (freeOutput) {
        const validation = validateQuestionJson(freeOutput, note);
        if (validation.isValid && validation.questions.length > 0) {
          validation.questions.forEach(q => { q.source = "ai_api"; });
          return { questions: validation.questions, fallbackUsed: "free_text" };
        }
      }
    }
  } catch (freeTextErr) {
    console.warn("[Gemini API] フリーテキスト生成も失敗しました。ローカル抽出にフォールバックします:", freeTextErr);
  }

  // 3. Third Try: Heuristic / Local Text Extraction (Zero API call fallback)
  const localQuestions = generateQuestionsLocally(note, config);
  return { questions: localQuestions, fallbackUsed: "local_heuristic" };
}

/**
 * SuperMemo (SM-2) アルゴリズムによるクライアント即時計算
 * スプレッドシート側の handleSaveReviewLog と完全に同一の計算を即座に実行
 */
export function calculateSM2Review(
  currentState: ReviewState | undefined,
  rating: number,
  isMasteredExplicit: boolean,
  isCorrect: boolean
): {
  totalReviews: number;
  correctCount: number;
  consecutiveCorrect: number;
  easinessFactor: number;
  intervalDays: number;
  masteryLevel: "new" | "learning" | "review" | "mastered";
  nextReviewDate: string;
} {
  const currentTotal = currentState?.totalReviews || 0;
  const currentCorrect = currentState?.correctCount || 0;
  const currentConsecutive = currentState?.consecutiveCorrect || 0;
  let ef = currentState?.easinessFactor || 2.5;
  const currentInterval = currentState?.intervalDays || 1;

  const newTotal = currentTotal + 1;
  const newCorrectCount = currentCorrect + ((isCorrect || isMasteredExplicit) ? 1 : 0);
  const newConsecutive = (isCorrect || isMasteredExplicit) ? (currentConsecutive + 1) : 0;

  let newInterval = 1;
  if (isMasteredExplicit) {
    newInterval = 3650; // 10年後（実質的に出題停止）
    ef = Math.max(2.5, ef + 0.3);
  } else if (isCorrect) {
    if (newConsecutive === 1) {
      newInterval = 1;
    } else if (newConsecutive === 2) {
      newInterval = 3;
    } else {
      newInterval = Math.round(currentInterval * ef);
      if (newInterval < 4) newInterval = 4;
    }
    ef = Math.max(1.3, ef + (0.1 - (4 - rating) * (0.08 + (4 - rating) * 0.02)));
  } else {
    newInterval = 1;
    ef = Math.max(1.3, ef - 0.2);
  }

  let newMastery: "new" | "learning" | "review" | "mastered" = "learning";
  if (isMasteredExplicit || newConsecutive >= 4 || newInterval >= 21) {
    newMastery = "mastered";
  } else if (newConsecutive >= 2) {
    newMastery = "review";
  }

  const nextDueDate = new Date(Date.now() + newInterval * 86400000).toISOString().split("T")[0];

  return {
    totalReviews: newTotal,
    correctCount: newCorrectCount,
    consecutiveCorrect: newConsecutive,
    easinessFactor: Math.round(ef * 100) / 100,
    intervalDays: newInterval,
    masteryLevel: newMastery,
    nextReviewDate: nextDueDate
  };
}

function shuffleChoices(choices: QuestionChoice[]): QuestionChoice[] {
  const shuffled = [...choices];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  shuffled.forEach((c, idx) => {
    c.order = idx + 1;
    c.label = String.fromCharCode(65 + idx);
  });
  return shuffled;
}

