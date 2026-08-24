/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { SYNC_AND_SAVE_GAS_SCRIPT } from "../gasScriptCode";
import { Copy, Check, FileSpreadsheet, ExternalLink, HelpCircle, Activity, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { fetchGasGet, sanitizeGasUrl } from "../utils/gasClient";

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
  const [model, setModel] = useState("gemini-flash-latest");
  const [temp, setTemp] = useState("0.1");
  const [tokens, setTokens] = useState("1024");
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [gasUrl, setGasUrl] = useState("");
  const [gasSheetName, setGasSheetName] = useState("");
  const [optimizeTokens, setOptimizeTokens] = useState(true);
  const [maxCandidates, setMaxCandidates] = useState("20");
  const [maxContentLength, setMaxContentLength] = useState("2500");
  const [isCopiedGas, setIsCopiedGas] = useState(false);
  const [showGasUrlHelp, setShowGasUrlHelp] = useState(false);

  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");

  useEffect(() => {
    if (isOpen) {
      setApiKey(localStorage.getItem("cn_gemini_key") || "");
      setTtsApiKey(localStorage.getItem("cn_gcp_tts_key") || "");
      setTtsSpeed(localStorage.getItem("cn_tts_speed") || "1.2");
      let m = localStorage.getItem("cn_gemini_model") || "gemini-flash-latest"; setModel(m);
      setTemp(localStorage.getItem("cn_gemini_temp") || "0.1");
      setTokens(localStorage.getItem("cn_gemini_tokens") || "1024");
      setOptimizeTokens(localStorage.getItem("cn_optimize_api_tokens") !== "false");
      setMaxCandidates(localStorage.getItem("cn_max_candidates_limit") || "20");
      setMaxContentLength(localStorage.getItem("cn_max_content_length") || "2500");
      
      setFilterStart(localStorage.getItem("cn_filter_start_date") || "");
      setFilterEnd(localStorage.getItem("cn_filter_end_date") || "");
      setGasUrl(localStorage.getItem("cn_gas_api_url") || "");
      setGasSheetName(localStorage.getItem("cn_gas_sheet_name") || "");
      setTestStatus("idle");
      setTestMessage("");
    }
  }, [isOpen]);

  const handleTestConnection = async () => {
    const cleaned = sanitizeGasUrl(gasUrl);
    if (cleaned !== gasUrl) {
      setGasUrl(cleaned);
    }
    if (!cleaned) {
      setTestStatus("error");
      setTestMessage("WebアプリURLが入力されていません。");
      return;
    }

    if (!cleaned.startsWith("https://script.google.com/macros/s/") || !cleaned.endsWith("/exec")) {
      setTestStatus("error");
      setTestMessage("URLの形式が正しくありません。「https://script.google.com/macros/s/.../exec」の形式である必要があります。");
      return;
    }

    setTestStatus("testing");
    setTestMessage("GAS Webアプリに疎通確認中（Pingテスト実行中）...");

    try {
      // Step 1: Base URL Ping Test
      let pingSuccess = false;
      let pingMessage = "";
      try {
        const pingJson = await fetchGasGet(cleaned);
        if (pingJson && (pingJson.status === "ok" || pingJson.message || pingJson.success !== false)) {
          pingSuccess = true;
          pingMessage = pingJson.message || "GAS Web API は正常に応答しています。";
        }
      } catch (pingErr) {}

      // Step 2: Spreadsheet GetNotes
      const params: Record<string, string> = { action: "getNotes" };
      if (gasSheetName.trim()) {
        params.sheetName = gasSheetName.trim();
      }

      const data = await fetchGasGet(cleaned, params);

      if (!data || data.error) {
        if (pingSuccess || data?.status === "ok") {
          const errDetail = data?.error || "スプレッドシートへのアクセスに失敗しました";
          setTestStatus("success");
          setTestMessage(`✅ WebアプリのAPI疎通は成功しました！ （※スプレッドシート側: ${errDetail}。シート名またはスクリプトプロパティの SHEET_ID をご確認ください）`);
          return;
        }

        setTestStatus("error");
        setTestMessage(data?.error || `接続エラーが発生しました`);
        return;
      }

      setTestStatus("success");
      setTestMessage(`✅ 接続成功！GAS Webアプリは正常に応答しています（シート: ${data.sheetName || gasSheetName.trim() || "Notes"}、取得ノート数: ${data.notes?.length ?? 0}件）`);
    } catch (e: any) {
      setTestStatus("error");
      setTestMessage(e.message || "接続に失敗しました");
    }
  };

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
            <option value="gemini-flash-lite-latest">gemini-flash-lite-latest</option>
            <option value="gemini-flash-latest">gemini-flash-latest</option>
            <option value="gemini-pro-latest">gemini-pro-latest</option>
            <option value="gemini-3.5-flash">gemini-3.5-flash</option>
            <option value="gemini-3.1-pro">gemini-3.1-pro</option>
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
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-[var(--subtle)] font-bold block">🔗 Google Apps Script (GAS) 同期WebアプリURL</label>
              <button
                type="button"
                onClick={() => setShowGasUrlHelp(!showGasUrlHelp)}
                className="text-[10px] text-[var(--purple)] font-bold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <HelpCircle className="w-3 h-3" />
                何のリンク？
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(SYNC_AND_SAVE_GAS_SCRIPT);
                setIsCopiedGas(true);
                onSaveToast("最新のGASスクリプトコードをクリップボードにコピーしました！");
                setTimeout(() => setIsCopiedGas(false), 3000);
              }}
              className="flex items-center gap-1.5 px-2 py-1 text-[10px] rounded font-medium bg-[#8b5cf6]/20 text-[#c4b5fd] border border-[#8b5cf6]/40 hover:bg-[#8b5cf6]/30 transition-all cursor-pointer shadow-sm"
              title="スプレッドシートのGASエディタに貼り付ける最新コードをコピーします"
            >
              {isCopiedGas ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              {isCopiedGas ? "GASコードをコピー完了" : "📋 最新GASコードをコピー"}
            </button>
          </div>
          
          {showGasUrlHelp && (
            <div className="mb-3 mt-1 p-3 bg-[var(--purple)]/10 border border-[var(--purple)]/30 rounded-md text-[11px] text-[var(--text)] leading-relaxed">
              <p className="font-bold mb-1 text-[var(--purple)]">📝 💾 同期先・データベース（データを移される・保存される側）</p>
              <p className="mb-2"><strong>新しく作成した空のスプレッドシート</strong>を使うのがおすすめです。（必要な列やシートは自動で作成されます）<br/>
              このアプリで書いたノートが、ここに入力したスプレッドシートに保存されていきます。</p>
              <p className="mb-2">設定手順：<br/>そのスプレッドシートの<strong>「拡張機能」＞「Apps Script」</strong>に右上の最新GASコードを貼り付けてから、<strong>「デプロイ」＞「新しいデプロイ」</strong>（全員にアクセス許可）を実行して発行されるURLをここに入力します。</p>
              <p className="font-mono bg-[var(--bg)] p-1.5 rounded text-[10px] text-[var(--subtle)] break-all mb-2">
                例: https://script.google.com/macros/s/〜ランダムな英数字〜/exec
              </p>
              <p className="text-[10px] text-[var(--muted)]">※ スプレッドシート本体のURL（docs.google.com〜）とは異なります！</p>
            </div>
          )}

          <div className="flex gap-2 mb-2">
            <input
              className="flex-1 font-mono text-xs p-2.5 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all"
              type="text"
              placeholder="https://script.google.com/macros/s/.../exec"
              value={gasUrl}
              onChange={(e) => {
                setGasUrl(e.target.value);
                setTestStatus("idle");
              }}
            />
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testStatus === "testing"}
              className="px-3 py-2 text-xs font-semibold rounded bg-[#8b5cf6]/20 text-[#c4b5fd] border border-[#8b5cf6]/40 hover:bg-[#8b5cf6]/30 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="GAS Webアプリとの接続をテストします"
            >
              {testStatus === "testing" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  確認中...
                </>
              ) : (
                <>
                  <Activity className="w-3.5 h-3.5" />
                  接続テスト
                </>
              )}
            </button>
          </div>

          {testStatus !== "idle" && (
            <div className={`mb-3 p-2.5 rounded text-xs flex items-start gap-2 border leading-relaxed ${
              testStatus === "success" 
                ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                : testStatus === "error"
                ? "bg-red-950/40 border-red-500/40 text-red-300"
                : "bg-blue-950/40 border-blue-500/40 text-blue-300"
            }`}>
              {testStatus === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
              {testStatus === "error" && <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
              {testStatus === "testing" && <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0 mt-0.5" />}
              <div className="flex-1">
                <p className="font-semibold">{testMessage}</p>
                {testStatus === "error" && (
                  <div className="mt-1.5 pt-1.5 border-t border-red-500/20 text-[11px] text-red-200/90 space-y-1">
                    <p className="font-bold">💡 解決チェックリスト:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-[10px]">
                      <li>GASエディタで<strong>「デプロイ」＞「新しいデプロイ」</strong>を実行しましたか？（保存だけでは反映されません）</li>
                      <li>「アクセスできるユーザー」を<strong>『全員 (Anyone)』</strong>に設定しましたか？</li>
                      <li>URLの末尾が <strong>/exec</strong> で終わっていますか？（テスト用の /dev は使えません）</li>
                      <li>GASエディタ右上の「📋 最新GASコードをコピー」の内容を貼り付けましたか？</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-[var(--subtle)] font-bold block mb-1">
                📄 アプリ同期・編集ノート用シート名 (空欄時: "Notes")
              </label>
              <input
                className="w-full text-xs p-2.5 bg-[var(--bg)] border border-[var(--border2)] rounded-md text-[var(--text)] outline-none focus:border-[var(--purple)] transition-all font-mono"
                type="text"
                placeholder="Notes (例: Notes, 調査用メモ, アーカイブ)"
                value={gasSheetName}
                onChange={(e) => setGasSheetName(e.target.value)}
              />
              <p className="text-[9px] text-[var(--muted)] mt-1">
                アプリ内で作成・編集したノート（15列データ）を双方向同期・保存するメインシートです。
              </p>
            </div>

            <div className="p-2.5 bg-[#161b22] border border-[#30363d] rounded-md text-[11px] text-gray-300 flex items-start gap-2">
              <span className="text-purple-400 font-bold shrink-0">💡</span>
              <div className="space-y-0.5">
                <span className="font-semibold text-gray-200">MHT・Raindropの外部収集＆取り込み設定について</span>
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  外部データの収集先シートや、アプリ画面への取り込みフローは、上部ヘッダーの「<strong>📥 取り込み</strong>」ポップアップから順を追って一元設定・実行できます。
                </p>
              </div>
            </div>
          </div>
          <div className="mt-2.5 p-2.5 bg-[#161b22] border border-[#30363d] rounded-md space-y-2">
            <h4 className="text-[10px] text-[var(--purple)] font-bold uppercase tracking-wider flex items-center gap-1">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              シート切り替え & GAS同期のポイント
            </h4>
            <ul className="text-[10px] text-[var(--muted)] list-disc list-inside space-y-1">
              <li><strong className="text-[var(--text)]">別シートのデータを読み込む手順:</strong>
                <ol className="list-decimal list-inside pl-2 pt-0.5 space-y-0.5 text-[#8b949e]">
                  <li>上の「<span className="text-[var(--text)]">同期先シート名</span>」に読み込みたいシートタブ名（例: <span className="text-[#a5d6ff]">シート2</span>）を入力して設定を保存。</li>
                  <li>ヘッダー右側の「<span className="text-[var(--text)]">☁ クラウド同期</span>」を開き、「<span className="text-[var(--text)]">📥 スプレッドシートから強制ダウンロード</span>」を実行します（ローカルデータが指定シートの内容で完全に置き換わります）。</li>
                </ol>
              </li>
              <li><strong className="text-[var(--text)]">GASコードの更新が必要な場合:</strong> 以前のGASスクリプトをお使いの場合は、右上の「<span className="text-[#c4b5fd]">📋 最新GASコードをコピー</span>」ボタンでコードを取得し、GASエディタに貼り付けて『<span className="text-[var(--text)]">新しいデプロイ</span>』を行ってください。</li>
              <li>設定方法: <span className="text-[var(--text)]">新しいデプロイ ＞ 種類: ウェブアプリ ＞ アクセスできるユーザー: <strong>全員</strong> (Anyone)</span> に設定し、発行された最新のURL（末尾が <span className="text-[var(--text)]">/exec</span>）を貼り付けてください。</li>
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
