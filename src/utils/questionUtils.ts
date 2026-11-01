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

3. 【問題文の自立性と文脈フレーミング（何を問われているかの明確化）】
   問題文(question)は、「ノートの内容ありき」で文脈が飛んでいて何を問われているのか分からない状態を厳禁とします。『〇〇における〜〜について』のように前提や概念の文脈を自然に補足し、何についての理解・正誤・選択を求めているのかが初見でも明確に伝わる具体的な文面としてください。単なる文章の切り抜きや曖昧な穴埋めは禁止です。

4. 【選択肢の正解位置の分散（回答の偏り防止）】
   ${formatInstruction}
   ※重要：正解の選択肢（A〜D）が常にAやBに偏らないよう、問題ごとに正解位置（A, B, C, D）を均等にランダムにばらけさせて配置してください。複数回答の場合も（AとC、BとD、AとDなど）多様な組み合わせで出題してください。

5. 【難易度】
   ${difficultyInstruction}

6. 【出力形式（最重要・厳格なJSON出力）】
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
    "question": "提供ノートの背景概念を踏まえ、何を問うているか初見でも明確な具体的な問題文を記述してください。",
    "choices": [
      {
        "label": "A",
        "text": "選択肢Aのテキスト（誤答の例）",
        "isCorrect": false,
        "explanation": "選択肢Aが誤りである理由"
      },
      {
        "label": "B",
        "text": "選択肢Bのテキスト（誤答の例）",
        "isCorrect": false,
        "explanation": "選択肢Bが誤りである理由"
      },
      {
        "label": "C",
        "text": "選択肢Cのテキスト（正解の例：正解位置はA〜Dへ均等に分散させてください）",
        "isCorrect": true,
        "explanation": "選択肢Cが正解である理由"
      },
      {
        "label": "D",
        "text": "選択肢Dのテキスト（誤答の例）",
        "isCorrect": false,
        "explanation": "選択肢Dが誤りである理由"
      }
    ],
    "correctAnswer": "C",
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
      const { choices: finalChoices, correctAnswer: finalAnswer } = choices.length > 0
        ? shuffleChoicesAndSyncAnswer(choices, correctAnswer, qType)
        : { choices: undefined, correctAnswer };

      validatedQuestions.push({
        id: `q_${now}_${idx}_${Math.floor(Math.random() * 1000)}`,
        noteId: sourceNote ? sourceNote.id : (item.noteId || ""),
        noteTitle: sourceNote ? sourceNote.title : (item.noteTitle || "無題のノート"),
        type: qType,
        question: questionText,
        correctAnswer: finalAnswer,
        explanation: explanation,
        difficulty: (["easy", "medium", "hard"].includes(item.difficulty) ? item.difficulty : "medium") as any,
        tags: Array.isArray(item.tags) ? item.tags : sourceNote?.keywords ? sourceNote.keywords.split(",").map(k => k.trim()) : [],
        source: "external_ai_prompt",
        status: "approved",
        choices: finalChoices,
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

    const dummyOptions = ["関連補足データ", "外部参考情報", "一般的な定義"];
    const allOptions = [
      { text: keyword, isCorrect: true },
      { text: dummyOptions[0], isCorrect: false },
      { text: dummyOptions[1], isCorrect: false },
      { text: dummyOptions[2], isCorrect: false }
    ];
    for (let j = allOptions.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [allOptions[j], allOptions[k]] = [allOptions[k], allOptions[j]];
    }
    const localChoices: QuestionChoice[] = allOptions.map((opt, optIdx) => ({
      id: `c_${now}_${i}_${optIdx}`,
      order: optIdx + 1,
      label: String.fromCharCode(65 + optIdx),
      text: opt.text,
      isCorrect: opt.isCorrect
    }));
    const correctChoiceItem = localChoices.find(c => c.isCorrect);
    const correctLabel = correctChoiceItem?.label || "A";

    questions.push({
      id: `q_${now}_local_${i}`,
      noteId: note.id,
      noteTitle: title,
      type: "single_choice",
      question: `【空欄補充】以下の文章の空欄【 ？ 】に入る最も適切な語句を選んでください。\n「${clozeQuestion}」`,
      correctAnswer: correctLabel,
      explanation: `元ノート本文より: 「${sentence}」\n正解は選択肢 ${correctLabel}（${keyword}）です。`,
      difficulty: config.difficulty || "medium",
      tags: [keyword],
      source: "manual",
      status: "approved",
      choices: localChoices,
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

/**
 * 汎用配列シャッフル（Fisher-Yatesアルゴリズム）
 */
export function shuffleArray<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function shuffleChoices(choices: QuestionChoice[]): QuestionChoice[] {
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

export function shuffleChoicesAndSyncAnswer(
  choices: QuestionChoice[],
  originalAnswer: string,
  qType: QuestionType
): { choices: QuestionChoice[]; correctAnswer: string } {
  if (!choices || choices.length === 0) {
    return { choices, correctAnswer: originalAnswer };
  }
  const shuffled = [...choices];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  shuffled.forEach((c, idx) => {
    c.order = idx + 1;
    c.label = String.fromCharCode(65 + idx);
  });

  const correctChoices = shuffled.filter(c => c.isCorrect);
  let newAnswer = originalAnswer;
  if (correctChoices.length > 0) {
    if (qType === "multiple_choice" || correctChoices.length > 1) {
      newAnswer = correctChoices.map(c => c.label).join(", ");
    } else {
      newAnswer = correctChoices[0].label;
    }
  }

  return { choices: shuffled, correctAnswer: newAnswer };
}

export interface ExtractedTerm {
  word: string;
  count: number;
}

/**
 * クイズの問題文および4つの選択肢テキストから頻出・重要単語を抽出する
 */
export function extractTopQuizKeywords(
  question: string,
  choices?: (QuestionChoice | { label?: string; text: string })[],
  limit: number = 5
): ExtractedTerm[] {
  const choiceTexts = (choices || []).map(c => c.text || "").join(" ");
  const fullText = `${question || ""} ${choiceTexts}`;

  const stopWords = new Set([
    "これ", "それ", "あれ", "どれ", "この", "その", "あの", "どの",
    "ここ", "そこ", "あそこ", "どこ", "こと", "もの", "ため", "よう",
    "わけ", "はず", "とき", "ところ", "ほう", "など", "ほか", "あと",
    "から", "まで", "より", "ほど", "くらい", "ばかり", "だけ", "しか",
    "でも", "なら", "たら", "ても", "ので", "のに", "ば", "と", "や",
    "か", "ね", "よ", "わ", "ぞ", "ぜ", "さ", "な", "に", "へ", "で",
    "を", "は", "が", "の", "も", "連", "選", "問", "次", "下", "上",
    "問題", "選択肢", "解答", "正解", "不正解", "誤り", "適切", "不適切",
    "最も", "理由", "記述", "内容", "場合", "関係", "状態", "結果", "比較",
    "説明", "以下", "一つ", "二つ", "三つ", "四つ", "全て", "どれか", "選べ",
    "正しい", "誤っている", "適切なもの", "ある", "いる", "する", "なる",
    "いう", "みる", "おく", "いく", "くる", "しまう", "について", "における",
    "による", "によって", "として", "とともに", "に対する", "に対して",
    "および", "ならびに", "または", "もしくは", "ただし", "しかし",
    "なぜ", "どう", "何", "どうなる", "どのような", "どれ", "どちら"
  ]);

  const wordCounts = new Map<string, number>();

  const registerWord = (w: string, weight: number = 1) => {
    const word = (w || "").trim();
    if (!word || word.length < 2) return;
    if (stopWords.has(word)) return;
    if (/^\d+$/.test(word)) return;
    if (/^[a-zA-Z]$/.test(word)) return;

    wordCounts.set(word, (wordCounts.get(word) || 0) + weight);
  };

  // 1. カタカナ語の抽出 (2文字以上)
  const katakanaMatches: string[] = fullText.match(/[\u30A1-\u30FA\u30FC]{2,}/g) || [];
  katakanaMatches.forEach((w: string) => registerWord(w, 1));

  // 2. アルファベット・英数字技術用語 (2文字以上)
  const alphaMatches: string[] = fullText.match(/[A-Za-z0-9_]{2,}/g) || [];
  alphaMatches.forEach((w: string) => registerWord(w.toUpperCase(), 1));

  // 3. 漢字の連続（熟語）抽出 (2文字以上)
  const kanjiMatches: string[] = fullText.match(/[\u4E00-\u9FAF]{2,}/g) || [];
  kanjiMatches.forEach((k: string) => {
    registerWord(k, 1);
  });

  // 問題文に登場する単語には+1の重み付け（問題の本質に直結するため）
  if (question) {
    const qKatakana: string[] = question.match(/[\u30A1-\u30FA\u30FC]{2,}/g) || [];
    qKatakana.forEach((w: string) => registerWord(w, 1));

    const qAlpha: string[] = question.match(/[A-Za-z0-9_]{2,}/g) || [];
    qAlpha.forEach((w: string) => registerWord(w.toUpperCase(), 1));

    const qKanji: string[] = question.match(/[\u4E00-\u9FAF]{2,}/g) || [];
    qKanji.forEach((k: string) => registerWord(k, 1));
  }

  // 出現頻度（降順）→ 文字数（降順：より具体的な熟語を優先）でソート
  const sorted = Array.from(wordCounts.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.word.length - a.word.length;
    });

  const results: ExtractedTerm[] = [];
  for (const item of sorted) {
    if (results.length >= limit) break;
    // 既に選出されたより長い単語に完全に含まれ、かつ出現回数が同等以下の場合は重複排除
    const alreadySubsumed = results.some(r => r.word.includes(item.word) && r.count >= item.count);
    if (!alreadySubsumed) {
      results.push(item);
    }
  }

  // もし重複排除で5語未満になった場合は次点の単語で枠を埋める
  if (results.length < limit) {
    for (const item of sorted) {
      if (results.length >= limit) break;
      if (!results.some(r => r.word === item.word)) {
        results.push(item);
      }
    }
  }

  // それでも枠が余る場合（短い文章等）は問題文と選択肢のすべての有効文字から補完
  if (results.length < limit) {
    const rawTerms = fullText.match(/[\u4E00-\u9FAF\u30A1-\u30FA\u30FC]{2,}/g) || [];
    for (const term of rawTerms) {
      if (results.length >= limit) break;
      if (!stopWords.has(term) && !results.some(r => r.word === term)) {
        results.push({ word: term, count: 1 });
      }
    }
  }

  return results.slice(0, limit);
}

/**
 * クイズ問題および4つの選択肢の中から抽出した頻出単語TOP5について、
 * 日常生活の身近な場面に例えたわかりやすい解説を出力させるプロンプトを生成する
 */
export function buildTop5LifeTermsPrompt(
  question: string,
  choices?: (QuestionChoice | { label?: string; text: string; isCorrect?: boolean })[],
  noteTitle?: string,
  topTerms?: ExtractedTerm[],
  userQuestion?: string,
  checkedTermNames?: string[]
): string {
  const allTerms = (topTerms && topTerms.length > 0)
    ? topTerms
    : extractTopQuizKeywords(question, choices, 5);

  const terms = (checkedTermNames && checkedTermNames.length > 0)
    ? allTerms.filter(t => checkedTermNames.includes(t.word))
    : allTerms;

  const formattedChoices = choices && choices.length > 0
    ? choices.map(c => `${c.label || ""}: ${c.text}`).join("\n")
    : "（選択肢なし）";

  const termsListText = terms.length > 0
    ? terms.map((t, idx) => `${idx + 1}. 【${t.word}】（出現頻度: ${t.count}回）`).join("\n")
    : "1. （チェックされた単語がありません。上のチェックボックスから解説してほしい単語にチェックを入れてください）";

  const targetDescription = (checkedTermNames && checkedTermNames.length > 0)
    ? `以下のクイズ問題および4つの選択肢の中から、ユーザーがチェックを入れて選択した【特に理解したい重要単語（全${terms.length}語）】を抽出しました。`
    : `以下のクイズ問題および4つの選択肢を分析し、最も頻出・重要となる単語上位5個を抽出しました。`;

  return `あなたは専門用語や小難しい概念を、誰にでも直感的に「なるほど！」と腑に落ちさせる天才的な教育メンターです。

${targetDescription}
初学者や中学生でも一瞬でイメージが掴めるように、辞書的な堅苦しい定義や教科書通りの説明は【一切不要】です。

【最重要要件】
それぞれの単語について、
【私たちの身近な日常生活（日々の買い物、スーパーやコンビニ、料理・台所、掃除・部屋の整理、スマホアプリ、天気や季節、友達や家族との日常会話など）】に例えた親しみやすい具体例・身近な生活ストーリーを必ず交えてわかりやすく解説してください。

【対象ノート】
タイトル: ${noteTitle || "学習ノート"}

【クイズ問題】
${question}

【4つの選択肢】
${formattedChoices}

【対象の重要単語リスト】
${termsListText}
${userQuestion && userQuestion.trim() ? `\n【ユーザーの関心・知りたい点】\n${userQuestion.trim()}\n` : ""}
────────────────────────
【出力形式の指定（厳守）】
前置きや挨拶は一切省き、指定された単語について以下のフォーマットで順に出力してください。

### 1. 【単語名】
- 💡 **超簡単まとめ**: 難しい専門用語を使わず、一言で表すと何か（1〜2行）
- 🍳 **身近な生活での具体例**: 買い物・料理・スマホ・片付け・天気など、普段の暮らしに例えた具体的なシーン・たとえ話（2〜3行）
- 🎯 **このクイズでの見分け方**: 問題文や4つの選択肢の中でどういう意味・役割で使われているか、正解を見抜くための着眼点（1〜2行）

（※2番目以降の単語も同様に分かりやすく解説してください）

────────────────────────
⭐ **生活とクイズを結ぶワンポイント総括**:
これら選択された言葉が私たちの身の回りの暮らしとどう繋がっており、この問題の正解を見抜くためにどう役立つかを親しみやすい言葉で2〜3行でまとめて締めくくってください。`;
}



export function buildFolderWeaknessPrompt(
  folderName: string,
  masteryRate: number,
  accuracy: number,
  unmasteredTerms: string[],
  weakQuestions: Array<{ questionText: string; rating: number }>
): string {
  const termsText = unmasteredTerms.length > 0 ? unmasteredTerms.join("、") : "（登録された未理解単語なし）";
  const questionsText = weakQuestions.length > 0
    ? weakQuestions.map((q, idx) => `${idx + 1}. [評価:${q.rating === 1 ? "もう一度" : q.rating === 2 ? "難しい" : "不正解"}] ${q.questionText}`).join("\n")
    : "（記録された不正解・要復習問題なし）";

  return `あなたは学習分析とメタ認知指導のエキスパートです。
以下の学習データ（分野名、習得率、未理解としてチェックされた単語、間違えた／難しいと判定された問題）を深く分析し、ユーザーが「なぜこの分野を理解できていないのか」「何と何を混同しているのか」の根本原因を突き止め、マスターするために必要な核心概念と学習方針を教えてください。

【対象分野（フォルダ）】: ${folderName}
- 習得率: ${masteryRate}%
- 正解率: ${accuracy}%

【ユーザーが未理解としてチェックした単語】
${termsText}

【ユーザーが間違えた・難しいと感じた問題（SRS記録）】
${questionsText}

────────────────────────
【出力形式の指定（厳守）】
1. 🔍【理解のつまずきポイント（なぜ引っかかっているか）】
   ユーザーがどのような誤った前提や概念の混同に陥っているかを端的に分析。

2. 🧩【マスターするために不可欠な核心概念】
   この分野を腑に落ちさせるために真っ上に理解すべき大前提の仕組みや原則。

3. 🗺️【次に取るべき具体的な学習ステップ】
   どの順序でノートを見直し、どのような問題演習を行えばよいかの処方箋。`;
}

export function buildMisunderstandingDiagnosisPrompt(
  question: string,
  choices?: (QuestionChoice | { label?: string; text: string; isCorrect?: boolean })[],
  correctAnswer?: string,
  userAnswer?: string,
  isCorrect?: boolean,
  checkedUnmasteredTerms?: string[],
  noteTitle?: string,
  explanation?: string
): string {
  const formattedChoices = choices && choices.length > 0
    ? choices.map(c => `${c.label || ""}: ${c.text}${c.isCorrect ? " (正解)" : ""}`).join("\n")
    : "（選択肢なし）";

  const checkedTermsText = checkedUnmasteredTerms && checkedUnmasteredTerms.length > 0
    ? checkedUnmasteredTerms.join("、")
    : "（特になし / 正解であっても理解に不安がある単語）";

  return `あなたはメタ認知とつまずき分析の専門家であるプロの教育メンターです。
以下の学習問題において、ユーザーが【間違えてしまった理由】、あるいは【正解はできたもののチェックを入れて「よく分かっていない」と自己申告した単語】をもとに、ユーザーの知識のどこに穴や誤解があるのか、どんな前提概念が理解できていないと推測されるのかを深く診断・解説してください。

【対象ノート】
タイトル: ${noteTitle || "学習ノート"}

【クイズ問題】
${question}

【選択肢と正解】
${formattedChoices}
模範解答: ${correctAnswer}

【ユーザーの解答状況】
- 判定: ${isCorrect ? "正解（ただし不安・未理解単語あり）" : "不正解"}
- ユーザーがチェックした「わからない単語」: ${checkedTermsText}
- 既存の解説: ${explanation || "（なし）"}

────────────────────────
【出力形式の指定（厳守）】
前置きや挨拶は一切省き、以下の構成でわかりやすく分析してください。

1. 🔍【間違えた・つまずいた根本原因の分析】
   なぜこの問題で失点したのか、あるいは正解していてもどの罠にハマりかけていたのかの心理的・知識的メカニズム。

2. 🧩【不足している前提概念・理解できていないポイント】
   この問題を完全に自分のものにするために、ユーザーが現在把握できていない核心概念や定義のギャップ。

3. 🚀【次に立ち返るべき学習アクション】
   ノートのどこを読み返すべきか、どのような思考法に切り替えるべきかの具体的なアドバイス。`;
}
