import React from "react";
import katex from "katex";

/**
 * Unicode下付き・上付き文字を標準的なテキスト/LaTeX形式に正規化する
 */
export function normalizeChemicalInput(input: string): string {
  if (!input) return "";
  let s = input;

  // Unicode 下付き数字 -> _数字
  const subMap: Record<string, string> = {
    "₀": "_0", "₁": "_1", "₂": "_2", "₃": "_3", "₄": "_4",
    "₅": "_5", "₆": "_6", "₇": "_7", "₈": "_8", "₉": "_9"
  };
  s = s.replace(/[₀-₉]/g, (m) => subMap[m] || m);

  // Unicode 上付き文字 -> ^{...}
  const supMap: Record<string, string> = {
    "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
    "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
    "⁺": "+", "⁻": "-", "⁼": "="
  };
  s = s.replace(/[⁰-⁹⁺⁻⁼]+/g, (match) => {
    const converted = match.split("").map((c) => supMap[c] || c).join("");
    return `^{${converted}}`;
  });

  return s;
}

/**
 * 化学式または化学反応式かどうかを判定する
 */
export function isChemicalExpression(rawExpr: string): boolean {
  const normalized = normalizeChemicalInput(rawExpr.trim());
  const trimmed = normalized;
  
  // 明示的な \ce{...}
  if (/^\\ce\{/.test(trimmed)) {
    return true;
  }

  // \mathrm{...} の中身を取り出す
  let content = trimmed;
  const mathrmMatch = trimmed.match(/^\\mathrm\{([\s\S]+)\}$/);
  if (mathrmMatch) {
    content = mathrmMatch[1];
  }

  // 数学特有の記号・コマンドがある場合は通常数式
  if (
    /\\(int|sum|prod|frac|sqrt|partial|lim|sin|cos|tan|log|ln|infty|forall|exists|times|div)\b/.test(
      content
    ) ||
    content.includes("\\mathbb") ||
    content.includes("\\mathcal") ||
    /[a-z]\s*\(x\)/i.test(content) ||
    /f\s*\(/.test(content) ||
    /d[xyz]\b/.test(content)
  ) {
    return false;
  }

  // 1. 反応矢印を含むか
  const hasArrow =
    /\\(rightarrow|to|longrightarrow|rightleftharpoons|leftrightarrow)\b/.test(content) ||
    /->|-->|<=>|<->|→|⇄|⇌|←/.test(content);

  // 2. 代表的な元素記号の組み合わせ (H, He, Li, Be, B, C, N, O, F, Ne, Na, Mg, Al, Si, P, S, Cl, K, Ca, Fe, Cu, Zn, Br, Ag, I, Ba, Au, Pt, Pb 等)
  const elementPattern =
    /\b(H|He|Li|Be|B|C|N|O|F|Ne|Na|Mg|Al|Si|P|S|Cl|Ar|K|Ca|Sc|Ti|V|Cr|Mn|Fe|Co|Ni|Cu|Zn|Ga|Ge|As|Se|Br|Kr|Rb|Sr|Y|Zr|Nb|Mo|Tc|Ru|Rh|Pd|Ag|Cd|In|Sn|Sb|Te|I|Xe|Cs|Ba|La|Ce|Pr|Nd|Pm|Sm|Eu|Gd|Tb|Dy|Ho|Er|Tm|Yb|Lu|Hf|Ta|W|Re|Os|Ir|Pt|Au|Hg|Tl|Pb|Bi|Po|At|Rn|Fr|Ra|Ac|Th|Pa|U)\b/;

  // 下付き添字や上付きイオン
  const hasSubOrSup = /(_\d|\^[\+\-0-9]|\^\{[\+\-0-9]+\})/.test(content);

  if (hasArrow) {
    return true;
  }

  if (elementPattern.test(content) && (hasSubOrSup || content.includes("+") || content.includes("OH"))) {
    return true;
  }

  // 単独の代表的化学式 (H2O, CO2, NO2, HNO3, NH4+, SO4^2-, CaCO3など)
  if (
    /^[0-9]*(H2O|CO2|SO2|NO2|HNO3|NH4\+?|SO4\^?2?-?|CaCO3|NaCl|HCl|NaOH|CH4|C2H6|C2H4|C2H2|C6H12O6|O2|H2|N2|Cl2|Fe2O3)(\^[\+\-0-9]+)?$/i.test(
      content.replace(/[\s_{}]/g, "")
    )
  ) {
    return true;
  }

  return false;
}

/**
 * 1つの化学種（例: 2H2, NO2, SO4^{2-}, Ca(OH)2, CuSO4·5H2O）をパースして
 * 元素記号・下付き数字・上付き電荷に分解してレンダリングする
 */
export function renderChemicalSpecies(rawSpecies: string, keyPrefix: string = "chem"): React.ReactNode {
  let s = normalizeChemicalInput(rawSpecies.trim());
  if (!s) return null;

  // LaTeX コマンドのクリーンアップ
  s = s.replace(/\\mathrm\{([^}]+)\}/g, "$1");
  s = s.replace(/\\text\{([^}]+)\}/g, "$1");
  s = s.replace(/\\cdot/g, "·");

  // 1. 先頭の化学量論係数（例: 2, 3, 1/2）の抽出
  let coefficient = "";
  const coeffMatch = s.match(/^(\d+(?:\/\d+)?|\d+\.\d+)\s*(?=[A-Za-z\(])/);
  if (coeffMatch) {
    coefficient = coeffMatch[1];
    s = s.slice(coeffMatch[0].length).trim();
  }

  // 2. 状態記号の抽出 (例: (s), (l), (g), (aq))
  let stateNote = "";
  const stateMatch = s.match(/\s*\((s|l|g|aq)\)$/i);
  if (stateMatch) {
    stateNote = stateMatch[0].trim();
    s = s.slice(0, -stateMatch[0].length).trim();
  }

  // 3. 化学式本文のトークン化
  // パターン:
  // - 添字 (LaTeX: _{2} or _2, プレーン: 2)
  // - 電荷 (LaTeX: ^{2-}, プレーン: ^2-, 2+, 2-, +, -)
  // - 元素記号 / 括弧 / ドット
  const tokens: React.ReactNode[] = [];
  let idx = 0;
  let tokenKey = 0;

  while (idx < s.length) {
    // A. 上付き電荷 (LaTeX: ^{...} or ^+ or ^-)
    if (s[idx] === "^") {
      idx++;
      let supContent = "";
      if (s[idx] === "{") {
        idx++;
        const closeIdx = s.indexOf("}", idx);
        if (closeIdx !== -1) {
          supContent = s.slice(idx, closeIdx);
          idx = closeIdx + 1;
        } else {
          supContent = s.slice(idx);
          idx = s.length;
        }
      } else {
        const supMatch = s.slice(idx).match(/^(\d*[\+\-]|[\+\-]\d*)/);
        if (supMatch) {
          supContent = supMatch[0];
          idx += supMatch[0].length;
        } else if (idx < s.length) {
          supContent = s[idx];
          idx++;
        }
      }
      
      // プラス・マイナスのフォーマット調整 (2- -> 2−)
      const formattedSup = supContent.replace(/-/g, "−");
      tokens.push(
        <sup
          key={`${keyPrefix}-sup-${tokenKey++}`}
          className="text-[0.7em] font-bold text-amber-300 dark:text-amber-200 ml-[0.5px] select-text inline-block -translate-y-[0.38em]"
        >
          {formattedSup}
        </sup>
      );
      continue;
    }

    // B. 下付き数字 (LaTeX: _{...} or _2)
    if (s[idx] === "_") {
      idx++;
      let subContent = "";
      if (s[idx] === "{") {
        idx++;
        const closeIdx = s.indexOf("}", idx);
        if (closeIdx !== -1) {
          subContent = s.slice(idx, closeIdx);
          idx = closeIdx + 1;
        } else {
          subContent = s.slice(idx);
          idx = s.length;
        }
      } else {
        const subMatch = s.slice(idx).match(/^\d+/);
        if (subMatch) {
          subContent = subMatch[0];
          idx += subMatch[0].length;
        } else if (idx < s.length) {
          subContent = s[idx];
          idx++;
        }
      }
      tokens.push(
        <sub
          key={`${keyPrefix}-sub-${tokenKey++}`}
          className="text-[0.72em] font-semibold text-blue-300/90 dark:text-blue-200/90 leading-none select-text inline-block translate-y-[0.25em]"
        >
          {subContent}
        </sub>
      );
      continue;
    }

    // C. プレーンテキストでの上付き電荷の検出 (末尾の +, -, 2+, 2-, 3+, 3- など)
    // 元素や閉じ括弧の直後にある場合
    const chargeMatch = s.slice(idx).match(/^(\d*[\+\-]|\+|-)(?=\s|$|\)|\()/);
    if (chargeMatch && idx > 0 && /[A-Za-z\)\]]/.test(s[idx - 1])) {
      const formattedSup = chargeMatch[0].replace(/-/g, "−");
      tokens.push(
        <sup
          key={`${keyPrefix}-sup-${tokenKey++}`}
          className="text-[0.7em] font-bold text-amber-300 dark:text-amber-200 ml-[0.5px] select-text inline-block -translate-y-[0.38em]"
        >
          {formattedSup}
        </sup>
      );
      idx += chargeMatch[0].length;
      continue;
    }

    // D. プレーンテキストでの下付き数字 (例: NO2 の 2, H2O の 2)
    const numMatch = s.slice(idx).match(/^\d+/);
    if (numMatch && idx > 0 && /[A-Za-z\)\]]/.test(s[idx - 1])) {
      tokens.push(
        <sub
          key={`${keyPrefix}-sub-${tokenKey++}`}
          className="text-[0.72em] font-semibold text-blue-300/90 dark:text-blue-200/90 leading-none select-text inline-block translate-y-[0.25em]"
        >
          {numMatch[0]}
        </sub>
      );
      idx += numMatch[0].length;
      continue;
    }

    // E. 水和物ドット (· or .)
    if (s[idx] === "·" || (s[idx] === "." && idx > 0 && idx < s.length - 1)) {
      tokens.push(
        <span key={`${keyPrefix}-dot-${tokenKey++}`} className="mx-1 text-gray-400 font-bold">
          ·
        </span>
      );
      idx++;
      continue;
    }

    // F. 通常の文字 (元素記号、括弧など)
    tokens.push(
      <span key={`${keyPrefix}-char-${tokenKey++}`} className="tracking-[0.02em]">
        {s[idx]}
      </span>
    );
    idx++;
  }

  return (
    <span className="inline-flex items-baseline font-medium select-text">
      {coefficient && (
        <span className="font-bold text-emerald-400 dark:text-emerald-300 mr-0.5 select-text">
          {coefficient}
        </span>
      )}
      <span className="tracking-[0.01em]">{tokens}</span>
      {stateNote && (
        <span className="text-[0.75em] text-gray-400 ml-1 font-normal select-text">
          {stateNote}
        </span>
      )}
    </span>
  );
}

interface ChemicalFormulaProps {
  expression: string;
  description?: string;
  className?: string;
}

/**
 * 美しく読みやすい化学式・化学反応式コンポーネント
 */
export const ChemicalFormula: React.FC<ChemicalFormulaProps> = ({
  expression,
  description,
  className = "",
}) => {
  // \ce{...} や \mathrm{...} の外側を取り除く
  let cleanExpr = normalizeChemicalInput(expression.trim());
  if (cleanExpr.startsWith("$") && cleanExpr.endsWith("$")) {
    cleanExpr = cleanExpr.slice(1, -1).trim();
  }
  const ceMatch = cleanExpr.match(/^\\ce\{([\s\S]+)\}$/);
  if (ceMatch) {
    cleanExpr = ceMatch[1].trim();
  }
  const mathrmMatch = cleanExpr.match(/^\\mathrm\{([\s\S]+)\}$/);
  if (mathrmMatch) {
    cleanExpr = mathrmMatch[1].trim();
  }
  cleanExpr = normalizeChemicalInput(cleanExpr);

  // 矢印記号の正規化
  // \rightleftharpoons, <=>, <->, ⇄, ⇌ => equilibrium
  // \rightarrow, \to, \longrightarrow, ->, -->, → => forward
  // \leftarrow, <-, <--, ← => backward
  let arrowType: "forward" | "equilibrium" | "backward" | null = null;
  let arrowRegex: RegExp | null = null;

  if (/(\\rightleftharpoons|<=>|<->|⇄|⇌)/.test(cleanExpr)) {
    arrowType = "equilibrium";
    arrowRegex = /\\rightleftharpoons|<=>|<->|⇄|⇌/;
  } else if (/(\\rightarrow|\\to|\\longrightarrow|->|-->|→)/.test(cleanExpr)) {
    arrowType = "forward";
    arrowRegex = /\\rightarrow|\\to|\\longrightarrow|->|-->|→/;
  } else if (/(\\leftarrow|<-|<--|←)/.test(cleanExpr)) {
    arrowType = "backward";
    arrowRegex = /\\leftarrow|<-|<--|←/;
  }

  // 反応式の場合（左右の分割）
  let leftSide = cleanExpr;
  let rightSide = "";

  if (arrowType && arrowRegex) {
    const parts = cleanExpr.split(arrowRegex);
    leftSide = parts[0]?.trim() || "";
    rightSide = parts.slice(1).join(" ")?.trim() || "";
  }

  // 各辺の項（+ で接続された化学種）をパースする
  const parseSide = (sideStr: string, prefix: string) => {
    // 括弧内の + を避けるための配慮（通常化学式ではほとんど外側の +）
    const terms = sideStr.split(/\s*\+\s*/).filter(Boolean);
    return terms.map((term, tIdx) => (
      <React.Fragment key={`${prefix}-term-${tIdx}`}>
        {tIdx > 0 && (
          <span className="mx-1.5 text-gray-400 font-normal select-none">
            +
          </span>
        )}
        {renderChemicalSpecies(term, `${prefix}-${tIdx}`)}
      </React.Fragment>
    ));
  };

  // 矢印のレンダリング
  const renderArrow = () => {
    if (arrowType === "equilibrium") {
      return (
        <span
          className="mx-2.5 text-cyan-400 dark:text-cyan-300 font-bold text-base leading-none select-none inline-flex items-center"
          title="可逆反応 / 平衡"
        >
          ⇄
        </span>
      );
    }
    if (arrowType === "backward") {
      return (
        <span
          className="mx-2.5 text-emerald-400 dark:text-emerald-300 font-bold text-base leading-none select-none inline-flex items-center"
          title="逆反応"
        >
          ←
        </span>
      );
    }
    return (
      <span
        className="mx-2.5 text-emerald-400 dark:text-emerald-300 font-bold text-base leading-none select-none inline-flex items-center"
        title="反応"
      >
        →
      </span>
    );
  };

  const isReaction = Boolean(arrowType);

  const containerClasses = isReaction
    ? `inline-flex items-center flex-wrap align-middle gap-1.5 my-1 px-3 py-1 rounded-lg border border-emerald-500/25 bg-emerald-950/25 text-[#f0f6fc] text-sm leading-relaxed shadow-xs select-text transition-colors hover:bg-emerald-950/35 hover:border-emerald-500/35 font-sans ${className}`
    : `inline-flex items-baseline align-baseline gap-0.5 px-1.5 py-0.5 rounded-md border border-emerald-500/20 bg-emerald-950/20 text-[#f0f6fc] text-sm font-sans mx-0.5 select-text hover:bg-emerald-950/30 ${className}`;

  return (
    <span className={containerClasses}>
      {/* 化学式・反応式の本体 */}
      <span className="inline-flex items-baseline flex-wrap font-sans font-medium tracking-wide">
        {parseSide(leftSide, "left")}
        {arrowType && renderArrow()}
        {arrowType && rightSide && parseSide(rightSide, "right")}
      </span>

      {/* 「（硝酸）」などの説明・名称 */}
      {description && (
        <span
          className="ml-2 inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium tracking-normal bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 select-text align-middle"
          title="名称・補足"
        >
          {description.replace(/^[（\(]|[）\)]$/g, "")}
        </span>
      )}
    </span>
  );
};

interface LatexMathViewerProps {
  math: string;
  isBlock?: boolean;
}

/**
 * 通常のLaTeX数式ビューア（KaTeXを使用）
 */
export const LatexMathViewer: React.FC<LatexMathViewerProps> = ({ math, isBlock = false }) => {
  let cleanMath = math.trim();
  if (cleanMath.startsWith("$$") && cleanMath.endsWith("$$")) {
    cleanMath = cleanMath.slice(2, -2).trim();
  } else if (cleanMath.startsWith("$") && cleanMath.endsWith("$")) {
    cleanMath = cleanMath.slice(1, -1).trim();
  }

  try {
    const html = katex.renderToString(cleanMath, {
      displayMode: isBlock,
      throwOnError: false,
    });

    if (isBlock) {
      return (
        <div
          className="my-3 py-2 px-3 overflow-x-auto text-center rounded-lg bg-[var(--surface)]/70 border border-[var(--border)]"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }

    return (
      <span
        className="inline-block px-1 rounded bg-[var(--surface)]/60 text-inherit align-middle"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    // フォールバック: 生のLaTeXを表示
    return <code className="text-xs bg-red-900/30 text-red-300 px-1 py-0.5 rounded">{cleanMath}</code>;
  }
};
