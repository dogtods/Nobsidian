/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Note,
  DeepDiveDecision,
  DeepDiveIssue,
  DeepDiveAnalysisResult,
  DeepDiveReview,
  DeepDivePriority
} from "../types";
import { getNoteYMD } from "./graphDataParser";

/* ================================================================== */
/* 1. デフォルトプロンプト定義                                            */
/* ================================================================== */

export const DEFAULT_DEEP_DIVE_PROMPTS = {
  // STEP 1 & 2: 深掘り判断・優先度判定プロンプト（厳格なトリアージ選別基準）
  DECISION: `あなたは技術・産業構造・市場動向に精通したシニアアナリストです。
以下の記事情報（本文・既存要約・キーワード・市場動向）を基に、「限られた調査リソースを割いて、この記事をさらに深掘り調査する戦略的価値があるか」を客観的・厳格にトリアージ（選別）し、深掘り優先度を判定してください。

【評価・トリアージの基本姿勢】
1. 【選別の門番としての役割】:
   すべてを好意的に深掘り対象とするのではなく、「日常的なニュースの6〜8割は【low（深掘り見送り）】に落とし、真に調べるべき少数の重要動向にリソースを集中させる」ための厳しいフィルターとして機能してください。
2. 【安易な高評価・深掘りの禁止】:
   「不確実性があるから調べれば何か分かるかもしれない」「話題性があるから」といった理由で安易に medium や high を付けないでください。追加調査によって意思決定や技術・事業評価を覆すほどの具体的・現実的な情報差分が見込める場合のみ、深掘り価値を認めてください。
3. 【誇大宣伝・抽象論・定例PRの厳格な排除】:
   定量データ（性能数値、コスト、投資規模、実証規模など）や客観的根拠がなく、宣伝用バズワードや抽象的な構想のみを語る記事は、どれほど大風呂敷を広げていても【low（低）】と断じてください。

【深掘り優先度（priority）の判定基準】
- high（高・積極的深掘り推奨 / 全体の5〜10%）:
  * 既存の産業構造、サプライチェーン、コスト構造、競合優位性を根本から不可逆的に変えるゲームチェンジャー。
  * 業界長年の致命的ボトルネック（物理限界、製造コスト、量産化技術）を画期的に突破した客観的実証・商業化発表。
  * 巨大な法規制・国家政策の根本的改定により、新市場の強制創出または既存市場の淘汰が決定的な事案。

- medium（中・条件付き深掘り / 全体の20〜30%）:
  * 一定の新規性や構造的インパクトはあるが、対象市場・適用領域が限定的（ニッチ）。
  * 興味深い技術・ビジネスモデルだが、先行他社事例の追試や小規模な実証実験にとどまるもの。
  * 業界主要プレイヤーによる中規模の動きで、今後の動向を定点観測（ウォッチ）しておく価値があるもの。

- low（低・深掘り見送り・スキップ推奨 / 全体の約60〜70%）:
  * 定例プレスリリース、製品・サービスの定期的なマイナーアップデート、スペック微増。
  * 既に業界で広く普及・確立している既存コモディティ技術の単なる他社導入事例。
  * 提携・検討・開始の挨拶レベルの第一報で、具体的な投資額・開発体制・数値目標がないもの。
  * 実証データや第三者検証のない企業の自己PR・マーケティング宣伝。
  * 一時的なキャンペーンや局所的なイベント等、中長期的な技術・産業構造に波及しないもの。
  * ※記事の大半はここに該当すべきです。躊躇なく「low」と判定してください。

【対象記事】
タイトル: {title}
掲載日: {date}
URL: {url}
主要キーワード: {keywords}
既存要約:
"""
{summary}
"""
市場動向の要点:
"""
{marketTrend}
"""
本文（抜粋）:
"""
{content}
"""

【回答すべき問い】
1. この記事の主要な主張は何か。
2. 何が事実として確認されており、何が予測・期待・誇大宣伝なのか。
3. この情報は、産業・技術・市場構造に不可逆的な影響を与えるか、それとも定例・一時的なものか。
4. 現時点で判断するために何が決定的に不足しているか。
5. 追加調査によって、戦略判断を覆すほどの新たな判断材料が得られる見込みはあるか。
6. 深掘り優先度（high: 高 / medium: 中 / low: 低）とその明確な論理的根拠。

【出力形式 (JSON)】
必ず以下のJSONフォーマットのみを出力してください。前後の解説は不要です。
優先度が「low」の場合は、reasonForSkipping に見送り理由を具体的に書き、recommendedIssues は空配列 [] または最小限としてください。
{
  "coreClaim": "記事の主要な主張（60〜120字程度）",
  "articleType": "新技術 / 研究開発 / 市場動向 / 政策・規制 / 将来予測 / 企業PR・定例 のいずれか",
  "currentStage": "基礎研究 / 実証実験 / 製品発表 / 初期導入 / 普及拡大 / 定例・小規模更新 などの現状段階",
  "importanceEval": "産業・社会への影響規模と持続性の評価（一時的か構造的か、100字程度）",
  "currentFeasibility": "現時点で確認できる客観的実現可能性と前提条件（100字程度）",
  "priority": "high または medium または low",
  "reasonForDeepDive": "深掘りする意味がある理由（優先度がhigh/mediumの場合。戦略的価値など）",
  "reasonForSkipping": "深掘りしない場合の理由（優先度がlowの場合。定例PR、影響限定、既知技術など）",
  "missingInformation": "現時点で不足している重要な判断材料",
  "recommendedIssues": [
    "論点1: ○○の実用化コストと既存代替技術との比較",
    "論点2: 量産化に向けたボトルネックと規制の壁"
  ],
  "reassessmentConditions": "将来どのような変化（新発表、法改正、数値の乖離など）が生じたら再評価すべきか",
  "aiVerdict": "AIによる総合判断の要約（80〜150字）"
}`,

  // STEP 3: 調査論点の設定プロンプト
  ISSUES: `あなたは調査リサーチの専門家です。
以下の記事および深掘り判断に基づき、深掘り調査を実施するための【具体的な調査論点】を最大5件、重要度の高い順に提案してください。

【対象記事】
タイトル: {title}
主要な主張: {coreClaim}
深掘り優先度: {priority}
不足している情報: {missingInformation}

【論点策定の観点】
- 新技術: 科学的根拠、技術成熟度、試作と量産の乖離、コスト、安全性・規制、実用化の時間軸
- 市場・産業動向: 市場規模・成長率、需要の根拠、競合環境、供給能力、下振れ要因
- 将来予測: 前提条件、実現要因と阻害要因、シナリオ、観測指標

【出力形式 (JSON)】
必ず以下のJSON配列のみを出力してください。
[
  {
    "title": "論点名（簡潔な見出し）",
    "importanceReason": "なぜこの論点が意思決定において最重要なのか",
    "knownFacts": "記事や現状から既に分かっている客観的事実",
    "unknownPoints": "まだ分かっていない不確実な要素や盲点",
    "investigationMethod": "何を具体的に調べれば判断できるか",
    "sourcesToVerify": "確認すべき資料・統計・企業IR・専門機関名",
    "conditionsToChangeVerdict": "どのようなデータが見つかれば当初の判断が変わるか"
  }
]`,

  // STEP 4: 論点ごとの深掘り分析プロンプト
  ANALYSIS: `あなたは技術・事業開発のデューデリジェンス担当者です。
以下の記事および選択された論点について、深い洞察と客観的証拠に基づいた分析を行ってください。

【対象記事】
タイトル: {title}
本文要約: {summary}

【分析対象論点】
論点名: {issueTitle}
重要性: {importanceReason}
現時点の既知事項: {knownFacts}
未解明事項: {unknownPoints}
調査方針: {investigationMethod}
確認すべき情報源: {sourcesToVerify}

【分析における絶対ルール】
1. 事実（Fact）、推定（Estimate）、仮説（Hypothesis）、未確認事項（Unknown）を明確に区別してください。
2. 科学的根拠・コスト構造・規制・競合の各視点から、実現を妨げるボトルネックを厳しく指摘してください。
3. 新技術の場合、「技術的成立」「商用化（コスト）」「社会普及」を絶対に混同せず切り分けて評価してください。
4. 架空のURLや存在しない資料名を捏造しないでください。確認できないものは「要追加調査資料」として具体的な検索語を提示してください。

【出力形式 (JSON)】
必ず以下のJSONフォーマットのみを出力してください。
{
  "researchGoal": "この論点で何を明らかにするのかの目標設定",
  "verifiedFacts": "記事や公開情報から確認できた客観的事実",
  "sourceUrlAndEvidence": "根拠となる情報源の名称またはURL（推測のURLは記載しない）",
  "sourcePublishedDate": "情報源の公開時期（不明な場合は推定年代）",
  "estimatesAndHypotheses": "事実から導かれる合理的な推定および作業仮説",
  "unknownsAndGaps": "現時点でも残る不確実性や検証不能な事項",
  "hinderingFactors": "実現や普及を妨げる技術的・経済的・制度的ボトルネック",
  "analysisConclusion": "この論点に対する詳細な分析結果と結論（200〜400字程度）",
  "confidenceScoreAndReason": "結論の確度（高/中/低）とその根拠",
  "futureCheckpoints": "今後半年〜1年で注視すべき具体的な数値指標やマイルストーン"
}`,

  // 予測と実績の振り返りプロンプト
  REVIEW: `過去の予測・分析判断と、その後に実際に起きた現実の動向を比較・評価してください。

【対象記事】
タイトル: {title}
当時の予測・判断: {originalForecast}
予測の前提条件: {forecastAssumptions}

【その後に判明した事実・実際の動向】
{actualOutcome}

【出力形式 (JSON)】
必ず以下のJSONフォーマットのみを出力してください。
{
  "alignment": "matched(一致) または partially_matched(一部一致) または diverged(乖離・不一致)",
  "reasonForOutcome": "なぜ当初の判断が的中したのか、あるいは外れたのかの根本要因分析",
  "learnings": "今回の乖離または一致から得られた、今後の技術・市場評価における教訓",
  "verdictSummary": "振り返りの総括評価（150字程度）"
}`
};

/* ================================================================== */
/* 2. プロンプト生成ヘルパー                                            */
/* ================================================================== */

export function buildDeepDiveDecisionPrompt(note: Note, customPromptTemplate?: string): string {
  const tpl = customPromptTemplate || DEFAULT_DEEP_DIVE_PROMPTS.DECISION;
  const ymd = getNoteYMD(note) || (note.dateStr ? note.dateStr.slice(0, 10) : new Date(note.createdAt).toLocaleDateString("ja-JP"));
  
  // トークン節約のため最大文字数を制限
  const rawContent = (note.rawContent || note.columnJ || note.content || "").trim();
  const truncatedContent = rawContent.length > 2500 ? rawContent.slice(0, 2500) + "\n…（以下省略）" : rawContent;
  const summary = (note.summary || "（保存済み要約なし）").trim();
  const keywords = (note.keywords || "（キーワード未設定）").trim();
  const marketTrend = (note.timeline || "（市場動向メモなし）").trim();

  return tpl
    .replace("{title}", note.title || "無題")
    .replace("{date}", ymd)
    .replace("{url}", note.sourceUrl || "（URLなし）")
    .replace("{keywords}", keywords)
    .replace("{summary}", summary)
    .replace("{marketTrend}", marketTrend)
    .replace("{content}", truncatedContent);
}

export function buildDeepDiveIssuesPrompt(
  note: Note,
  decision: Partial<DeepDiveDecision>,
  customPromptTemplate?: string
): string {
  const tpl = customPromptTemplate || DEFAULT_DEEP_DIVE_PROMPTS.ISSUES;
  return tpl
    .replace("{title}", note.title || "無題")
    .replace("{coreClaim}", decision.coreClaim || note.title || "")
    .replace("{priority}", decision.priority === "high" ? "高" : decision.priority === "medium" ? "中" : "低")
    .replace("{missingInformation}", decision.missingInformation || "詳細データ");
}

export function buildDeepDiveAnalysisPrompt(
  note: Note,
  issue: DeepDiveIssue,
  customPromptTemplate?: string
): string {
  const tpl = customPromptTemplate || DEFAULT_DEEP_DIVE_PROMPTS.ANALYSIS;
  const summary = (note.summary || note.content.slice(0, 500) || "").trim();

  return tpl
    .replace("{title}", note.title || "無題")
    .replace("{summary}", summary)
    .replace("{issueTitle}", issue.title)
    .replace("{importanceReason}", issue.importanceReason)
    .replace("{knownFacts}", issue.knownFacts)
    .replace("{unknownPoints}", issue.unknownPoints)
    .replace("{investigationMethod}", issue.investigationMethod)
    .replace("{sourcesToVerify}", issue.sourcesToVerify);
}

export function buildDeepDiveBatchAnalysisPrompt(
  note: Note,
  issues: DeepDiveIssue[]
): string {
  const summary = (note.summary || note.content.slice(0, 500) || "").trim();
  const issuesText = issues.map((iss, i) => `
【論点 #${i + 1}】
論点名: ${iss.title}
重要性: ${iss.importanceReason}
現時点の既知事項: ${iss.knownFacts}
未解明事項: ${iss.unknownPoints}
調査方針: ${iss.investigationMethod}
確認すべき情報源: ${iss.sourcesToVerify}
`).join("\n---\n");

  return `あなたは技術・事業開発のデューデリジェンス担当者です。
以下の記事および提示された【複数の重要調査論点】について、深い洞察と客観的証拠に基づいた分析を行ってください。

【対象記事】
タイトル: ${note.title || "無題"}
本文要約: ${summary}

【分析対象論点リスト】
${issuesText}

【分析における絶対ルール】
1. 事実（Fact）、推定（Estimate）、仮説（Hypothesis）、未確認事項（Unknown）を明確に区別してください。
2. 科学的根拠・コスト構造・規制・競合の各視点から、実現を妨げるボトルネックを厳しく指摘してください。
3. 新技術の場合、「技術的成立」「商用化（コスト）」「社会普及」を絶対に混同せず切り分けて評価してください。
4. 架空のURLや存在しない資料名を捏造しないでください。確認できないものは「要追加調査資料」として具体的な検索語を提示してください。

【出力形式 (JSON)】
必ず各論点に対応するオブジェクトを含む、以下のJSON配列形式のみを出力してください。
[
  {
    "issueTitle": "（論点リストの論点名）",
    "researchGoal": "この論点で何を明らかにするのかの目標設定",
    "verifiedFacts": "記事や公開情報から確認できた客観的事実",
    "sourceUrlAndEvidence": "根拠となる情報源の名称またはURL（推測のURLは記載しない）",
    "sourcePublishedDate": "情報源の公開時期（不明な場合は推定年代）",
    "estimatesAndHypotheses": "事実から導かれる合理的な推定および作業仮説",
    "unknownsAndGaps": "現時点でも残る不確実性や検証不能な事項",
    "hinderingFactors": "実現や普及を妨げる技術的・経済的・制度的ボトルネック",
    "analysisConclusion": "この論点に対する詳細な分析結果と結論（200〜400字程度）",
    "confidenceScoreAndReason": "結論の確度（高/中/低）とその根拠",
    "futureCheckpoints": "今後半年〜1年で注視すべき具体的な数値指標やマイルストーン"
  }
]`;
}

export function buildDeepDiveReviewPrompt(
  note: Note,
  decision: DeepDiveDecision,
  actualOutcome: string,
  customPromptTemplate?: string
): string {
  const tpl = customPromptTemplate || DEFAULT_DEEP_DIVE_PROMPTS.REVIEW;
  return tpl
    .replace("{title}", note.title || "無題")
    .replace("{originalForecast}", decision.coreClaim + " / " + decision.importanceEval)
    .replace("{forecastAssumptions}", decision.currentFeasibility)
    .replace("{actualOutcome}", actualOutcome);
}

/* ================================================================== */
/* 3. JSONパース＆フォールバックパーサー                                    */
/* ================================================================== */

export function cleanJsonText(raw: string): string {
  let cleaned = String(raw || "").trim();
  // Strip markdown code fences ```json ... ```
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  return cleaned;
}

export function extractJsonFromText(raw: string): any {
  const cleaned = cleanJsonText(raw);
  try {
    return JSON.parse(cleaned);
  } catch (e1) {
    // Try matching the first { ... } or [ ... ]
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch (e2) {}
    }
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]);
      } catch (e3) {}
    }
    throw new Error("JSON形式のデータを抽出できませんでした。AIの応答を確認してください。");
  }
}

/* ================================================================== */
/* 4. ローカルストレージ管理 (即時保存 & オフラインキャッシュ)             */
/* ================================================================== */

const STORAGE_KEYS = {
  DECISIONS: "cn_deep_dive_decisions_v1",
  ANALYSES: "cn_deep_dive_analyses_v1",
  REVIEWS: "cn_deep_dive_reviews_v1",
  PROMPTS: "cn_deep_dive_prompts_v1",
  SS_URL: "cn_deep_dive_spreadsheet_url"
};

export function getStoredDecisions(articleId?: string): DeepDiveDecision[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DECISIONS);
    if (!raw) return [];
    const list: DeepDiveDecision[] = JSON.parse(raw);
    if (articleId) {
      return list.filter(d => d.articleId === articleId);
    }
    return list;
  } catch {
    return [];
  }
}

export function saveStoredDecision(decision: DeepDiveDecision): void {
  try {
    const list = getStoredDecisions();
    const idx = list.findIndex(d => d.analysisId === decision.analysisId);
    if (idx >= 0) {
      list[idx] = decision;
    } else {
      list.unshift(decision);
    }
    localStorage.setItem(STORAGE_KEYS.DECISIONS, JSON.stringify(list));
  } catch (e) {
    console.warn("Failed to save decision to localStorage:", e);
  }
}

export function getStoredAnalyses(analysisId?: string): DeepDiveAnalysisResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ANALYSES);
    if (!raw) return [];
    const list: DeepDiveAnalysisResult[] = JSON.parse(raw);
    if (analysisId) {
      return list.filter(a => a.analysisId === analysisId);
    }
    return list;
  } catch {
    return [];
  }
}

export function saveStoredAnalyses(analyses: DeepDiveAnalysisResult[]): void {
  try {
    const list = getStoredAnalyses();
    analyses.forEach(item => {
      const idx = list.findIndex(a => a.analysisId === item.analysisId && a.issueId === item.issueId);
      if (idx >= 0) {
        list[idx] = item;
      } else {
        list.push(item);
      }
    });
    localStorage.setItem(STORAGE_KEYS.ANALYSES, JSON.stringify(list));
  } catch (e) {
    console.warn("Failed to save analyses to localStorage:", e);
  }
}

export function getStoredReviews(articleId?: string): DeepDiveReview[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.REVIEWS);
    if (!raw) return [];
    const list: DeepDiveReview[] = JSON.parse(raw);
    if (articleId) {
      return list.filter(r => r.articleId === articleId);
    }
    return list;
  } catch {
    return [];
  }
}

export function saveStoredReview(review: DeepDiveReview): void {
  try {
    const list = getStoredReviews();
    const idx = list.findIndex(r => r.reviewId === review.reviewId);
    if (idx >= 0) {
      list[idx] = review;
    } else {
      list.unshift(review);
    }
    localStorage.setItem(STORAGE_KEYS.REVIEWS, JSON.stringify(list));
  } catch (e) {
    console.warn("Failed to save review to localStorage:", e);
  }
}

export function getDeepDiveSpreadsheetUrl(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.SS_URL) || "";
  } catch {
    return "";
  }
}

export function setDeepDiveSpreadsheetUrl(url: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SS_URL, url.trim());
  } catch {}
}

export function getCustomDeepDivePrompts(): typeof DEFAULT_DEEP_DIVE_PROMPTS {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROMPTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      // 自動マイグレーション: 過去の「緩い判定プロンプト」（不確実性を理由に優先度を下げない旨が含まれていた版）が
      // 保存されている場合は、新基準の厳格トリアージプロンプトへ自動更新
      if (parsed.DECISION && (
        parsed.DECISION.includes("不確実性が高いという理由だけで優先度を低くしないでください") ||
        !parsed.DECISION.includes("厳格なトリアージ選別基準")
      )) {
        parsed.DECISION = DEFAULT_DEEP_DIVE_PROMPTS.DECISION;
        localStorage.setItem(STORAGE_KEYS.PROMPTS, JSON.stringify({ ...DEFAULT_DEEP_DIVE_PROMPTS, ...parsed, DECISION: DEFAULT_DEEP_DIVE_PROMPTS.DECISION }));
      }
      return { ...DEFAULT_DEEP_DIVE_PROMPTS, ...parsed };
    }
  } catch {}
  return DEFAULT_DEEP_DIVE_PROMPTS;
}

export function saveCustomDeepDivePrompts(prompts: Partial<typeof DEFAULT_DEEP_DIVE_PROMPTS>): void {
  try {
    const current = getCustomDeepDivePrompts();
    const merged = { ...current, ...prompts };
    localStorage.setItem(STORAGE_KEYS.PROMPTS, JSON.stringify(merged));
  } catch {}
}

/* ================================================================== */
/* 5. Gemini API 呼び出し (3層フォールバックチェーン対応)                  */
/* ================================================================== */

export async function callGeminiForDeepDive(
  prompt: string,
  apiKey: string,
  options: { model?: string; temperature?: number } = {}
): Promise<string> {
  const model = options.model || localStorage.getItem("cn_gemini_model") || "gemini-flash-latest";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // 1st Try: Structured JSON Output
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: options.temperature ?? 0.2
        }
      })
    });

    const data = await res.json().catch(() => null);
    if (res.ok && data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    }
  } catch (err) {
    console.warn("Structured JSON generation failed, trying free-text fallback:", err);
  }

  // 2nd Try: Free-text generation (Crucial for flash-lite models)
  const freeTextRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt + "\n\n※必ずJSON形式のみで出力してください。" }] }],
      generationConfig: {
        temperature: options.temperature ?? 0.3
      }
    })
  });

  const freeTextData = await freeTextRes.json().catch(() => null);
  if (!freeTextRes.ok || freeTextData?.error) {
    throw new Error(freeTextData?.error?.message || `Gemini API Error: HTTP ${freeTextRes.status}`);
  }

  const text = (freeTextData?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || "").join("");
  if (!text) {
    throw new Error("AIからの応答が空でした。");
  }

  return text;
}
