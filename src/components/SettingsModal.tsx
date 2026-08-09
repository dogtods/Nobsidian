/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPromptOpen: () => void;
  onSaveToast: (msg: string) => void;
  onFilterChange: (start: string, end: string) => void;
}

export default function SettingsModal({ isOpen, onClose, onPromptOpen, onSaveToast, onFilterChange }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [ttsApiKey, setTtsApiKey] = useState("");
  const [ttsSpeed, setTtsSpeed] = useState("1.2");
  const [model, setModel] = useState("gemini-2.0-flash");
  const [temp, setTemp] = useState("0.1");
  const [tokens, setTokens] = useState("1024");
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [gasUrl, setGasUrl] = useState("");
  const [gasSheetName, setGasSheetName] = useState("");
  const [optimizeTokens, setOptimizeTokens] = useState(true);
  const [maxCandidates, setMaxCandidates] = useState("20");
  const [maxContentLength, setMaxContentLength] = useState("2500");

  useEffect(() => {
    if (isOpen) {
      setApiKey(localStorage.getItem("cn_gemini_key") || "");
      setTtsApiKey(localStorage.getItem("cn_gcp_tts_key") || "");
      setTtsSpeed(localStorage.getItem("cn_tts_speed") || "1.2");
      let m = localStorage.getItem("cn_gemini_model") || "gemini-2.0-flash"; 
      if (m.startsWith("gemini-1.5")) m = "gemini-2.0-flash";
      setModel(m);
      setTemp(localStorage.getItem("cn_gemini_temp") || "0.1");
      setTokens(localStorage.getItem("cn_gemini_tokens") || "1024");
      setOptimizeTokens(localStorage.getItem("cn_optimize_api_tokens") !== "false");
      setMaxCandidates(localStorage.getItem("cn_max_candidates_limit") || "20");
      setMaxContentLength(localStorage.getItem("cn_max_content_length") || "2500");
      
      setFilterStart(localStorage.getItem("cn_filter_start_date") || "");
      setFilterEnd(localStorage.getItem("cn_filter_end_date") || "");
      setGasUrl(localStorage.getItem("cn_gas_api_url") || "https://script.google.com/macros/s/AKfycbwURzm-X3meCgYanIU4C-F5yW1dLC2vV_x09pBn-HuZvriVsCekp7X1_g9CuhZmdyRy/exec");
      setGasSheetName(localStorage.getItem("cn_gas_sheet_name") || "");
    }
  }, [isOpen]);

  const handleSave = () => {
    if (apiKey.trim()) {
      localStorage.setItem("cn_gemini_key", apiKey.trim());
    } else {
      localStorage.removeItem("cn_gemini_key");
    }

    if (ttsApiKey.trim()) {
      localStorage.setItem("cn_gcp_tts_key", ttsApiKey.trim());
    } else {
      localStorage.removeItem("cn_gcp_tts_key");
    }

    localStorage.setItem("cn_tts_speed", ttsSpeed);
    localStorage.setItem("cn_gemini_model", model);
    localStorage.setItem("cn_gemini_temp", temp);
    localStorage.setItem("cn_gemini_tokens", tokens);
    localStorage.setItem("cn_optimize_api_tokens", optimizeTokens ? "true" : "false");
    localStorage.setItem("cn_max_candidates_limit", maxCandidates);
    localStorage.setItem("cn_max_content_length", maxContentLength);

    if (gasUrl.trim()) {
      localStorage.setItem("cn_gas_api_url", gasUrl.trim());
    } else {
      localStorage.removeItem("cn_gas_api_url");
    }

    if (gasSheetName.trim()) {
      localStorage.setItem("cn_gas_sheet_name", gasSheetName.trim());
    } else {
      localStorage.removeItem("cn_gas_sheet_name");
    }

    if (filterStart) {
      localStorage.setItem("cn_filter_start_date", filterStart);
    } else {
      localStorage.removeItem("cn_filter_start_date");
    }

    if (filterEnd) {
      localStorage.setItem("cn_filter_end_date", filterEnd);
    } else {
      localStorage.removeItem("cn_filter_end_date");
    }

    onFilterChange(filterStart, filterEnd);
    onSaveToast("設定を保存しました ✦");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-[#00000080] z-[200] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[var(--surface)] border border-[var(--border2)] rounded-xl p-6 w-[360px] max-w-full shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto gap-4 animate-[fadeIn_0.15s_ease-out]">
        <div>
          <div className="text-base font-bold text-[var(--bright)] flex items-center gap-2">
            <span>✦</span> Gemini AI 設定
          </div>
          <p className="text-xs text-[var(--subtle)] mt-1.5 leading-relaxed">
            APIキーを設定すると、ノートの内容を自動解析してキーワード抽出、要約、関連ノート提案ができます。
          </p>
        </div>

        <div>
          <label className="text-[11px] text-[var(--subtle)] font-bold block mb-1">Gemini API キー (解析用)</label>
          <input
            className="w-full font-mono text-xs p-2.5 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all"
            type="password"
            placeholder="AIzaSy..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>

        <div>
          <label className="text-[11px] text-[var(--subtle)] font-bold block mb-1">Google Cloud API キー (音声TTS用)</label>
          <input
            className="w-full font-mono text-xs p-2.5 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all mb-3"
            type="password"
            placeholder="AIzaSy..."
            value={ttsApiKey}
            onChange={(e) => setTtsApiKey(e.target.value)}
          />
          <label className="text-[11px] text-[var(--subtle)] font-bold flex justify-between mb-1">
            <span>読み上げ速度</span>
            <span className="font-mono text-[var(--purple)]">{ttsSpeed}x</span>
          </label>
          <input
            type="range"
            min="0.8"
            max="2.0"
            step="0.1"
            value={ttsSpeed}
            onChange={(e) => setTtsSpeed(e.target.value)}
            className="w-full accent-[var(--purple)] cursor-pointer"
          />
          <div className="mt-2.5 bg-[rgba(163,113,247,0.04)] border border-[rgba(163,113,247,0.15)] rounded-lg p-2.5 flex flex-col gap-2">
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 accent-[var(--purple)] cursor-pointer"
                checked={optimizeTokens}
                onChange={(e) => setOptimizeTokens(e.target.checked)}
              />
              <div className="flex-1">
                <span className="text-[11px] font-bold text-white flex items-center gap-1">
                  トークン消費削減モード (🚀推奨)
                </span>
                <p className="text-[9px] text-[var(--subtle)] mt-0.5 leading-relaxed">
                  グラフ分析時に、全ノートの本文を丸ごと送信する代わりにタイトル・タグ・キーワードなどの圧縮メタデータのみを送信し、API消費量を最大90%削減します。
                </p>
              </div>
            </label>

            <div className="mt-2 pt-2.5 border-t border-[rgba(163,113,247,0.15)] flex flex-col gap-2.5">
              <div>
                <div className="flex justify-between items-center text-[10px] font-bold text-gray-300">
                  <span>候補ノートの提示数上限 (10〜100)</span>
                  <span className="font-mono text-[var(--purple)] font-bold">{maxCandidates} 件</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  className="w-full cursor-pointer accent-[var(--purple)] mt-1"
                  value={maxCandidates}
                  onChange={(e) => setMaxCandidates(e.target.value)}
                />
                <p className="text-[8px] text-[var(--muted)] leading-tight mt-0.5">
                  値が小さいほどAPI送信トークンを大きく節約できます（通常は20〜30件で十分です）。
                </p>
              </div>

              <div>
                <div className="flex justify-between items-center text-[10px] font-bold text-gray-300">
                  <span>解析本文の最大文字数上限</span>
                  <span className="font-mono text-[var(--purple)] font-bold">{maxContentLength} 文字</span>
                </div>
                <input
                  type="range"
                  min="500"
                  max="10000"
                  step="500"
                  className="w-full cursor-pointer accent-[var(--purple)] mt-1"
                  value={maxContentLength}
                  onChange={(e) => setMaxContentLength(e.target.value)}
                />
                <p className="text-[8px] text-[var(--muted)] leading-tight mt-0.5">
                  長文を自動圧縮・切り詰め、不要なコードブロックや表を除去してトークン量を削減します。
                </p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="text-[11px] text-[var(--subtle)] font-bold block mb-1">モデル選択</label>
          <select
            className="w-full text-xs p-2.5 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
            <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite</option>
            <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
            <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
            <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash Exp</option>
            <option value="gemini-2.0-flash-thinking-exp">Gemini 2.0 Thinking Exp</option>
            <option value="gemini-2.0-pro-exp-02-05">Gemini 2.0 Pro Exp</option>
          </select>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1 text-[11px] text-[var(--subtle)] font-semibold">
            <span>Temperature (0.0〜1.4)</span>
            <span className="font-mono text-[var(--text)]">{temp}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1.4"
            step="0.1"
            className="w-full cursor-pointer accent-[var(--purple)]"
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1 text-[11px] text-[var(--subtle)] font-semibold">
            <span>最大文字数 (Tokens)</span>
            <span className="font-mono text-[var(--text)]">{tokens}</span>
          </div>
          <input
            type="range"
            min="200"
            max="4000"
            step="100"
            className="w-full cursor-pointer accent-[var(--purple)]"
            value={tokens}
            onChange={(e) => setTokens(e.target.value)}
          />
        </div>

        <div className="border-t border-[var(--border)] pt-3.5">
          <label className="text-[11px] text-[var(--subtle)] font-bold block mb-1">🔗 Google Apps Script (GAS) 同期WebアプリURL</label>
          <input
            className="w-full font-mono text-xs p-2.5 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all mb-2"
            type="text"
            placeholder="https://script.google.com/macros/s/.../exec"
            value={gasUrl}
            onChange={(e) => setGasUrl(e.target.value)}
          />
          <label className="text-[11px] text-[var(--subtle)] font-bold block mb-1">📄 同期先シート名 (空の場合はデフォルトを使用)</label>
          <input
            className="w-full text-xs p-2.5 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all"
            type="text"
            placeholder="シート1 (オプション)"
            value={gasSheetName}
            onChange={(e) => setGasSheetName(e.target.value)}
          />
          <p className="text-[9px] text-[var(--muted)] mt-1">
            Googleスプレッドシートへの保存や、未処理ハイライトの同期で使用するGASの「ウェブアプリURL」とシート名を入力します。
          </p>
          <div className="mt-2.5 p-2.5 bg-[#161b22] border border-[#30363d] rounded-md">
            <h4 className="text-[10px] text-[var(--purple)] font-bold mb-1 uppercase tracking-wider">Sync Troubleshooting</h4>
            <ul className="text-[10px] text-[var(--muted)] list-disc list-inside space-y-1">
              <li><span className="text-[var(--text)]">Failed to fetch</span> エラーが出る場合、GASのデプロイ設定を確認してください。</li>
              <li>設定方法: <span className="text-[var(--text)]">新しいデプロイ ＞ 種類: ウェブアプリ ＞ アクセスできるユーザー: <strong>全員</strong> (Anyone)</span> に設定し、発行された最新のURLを貼り付けてください。</li>
              <li>URL末尾が <span className="text-[var(--text)]">/exec</span> で終わっていることを確認してください（/dev は動作しません）。</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[var(--border)] pt-3.5">
          <label className="text-[11px] text-[var(--subtle)] font-bold block mb-2">📅 記事・グラフの日付フィルター範囲</label>
          <div className="flex gap-2.5">
            <div className="flex-1">
              <span className="text-[10px] text-[var(--muted)]">開始日</span>
              <input
                type="date"
                className="w-full text-xs p-2 mt-1 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all"
                value={filterStart}
                onChange={(e) => setFilterStart(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <span className="text-[10px] text-[var(--muted)]">終了日</span>
              <input
                type="date"
                className="w-full text-xs p-2 mt-1 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all"
                value={filterEnd}
                onChange={(e) => setFilterEnd(e.target.value)}
              />
            </div>
          </div>
        </div>

        <a
          href="https://aistudio.google.com/app/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-[var(--blue)] hover:underline self-start"
        >
          → Google AI Studio でAPIキーを取得する (無料)
        </a>

        <div className="flex gap-2 justify-end border-t border-[var(--border2)] pt-4 mt-1">
          <button
            className="text-xs text-[var(--subtle)] border border-[var(--border2)] hover:bg-[var(--border)] p-2 px-4 rounded-md cursor-pointer font-medium transition-colors"
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            className="text-xs text-[var(--blue)] border border-[var(--border2)] hover:bg-[rgba(88,166,255,0.08)] p-2 px-4 rounded-md cursor-pointer font-semibold transition-colors"
            onClick={() => {
              onPromptOpen();
            }}
          >
            📝 プロンプト
          </button>
          <button
            className="text-xs text-[var(--purple)] bg-[#a371f715] border border-[#a371f744] hover:bg-[#a371f725] p-2 px-5 rounded-md cursor-pointer font-bold transition-all"
            onClick={handleSave}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
