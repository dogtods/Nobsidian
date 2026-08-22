/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { RefreshCw, Download, Upload, AlertTriangle, Cloud, HelpCircle, Sparkles } from "lucide-react";

interface SyncManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMergeSync: () => Promise<void>;
  onForceDownload: () => Promise<void>;
  onForceUpload: () => Promise<void>;
  syncStatus: "synced" | "syncing" | "offline" | "error";
  syncLabel: string;
}

export default function SyncManagerModal({
  isOpen,
  onClose,
  onMergeSync,
  onForceDownload,
  onForceUpload,
  syncStatus,
  syncLabel,
}: SyncManagerModalProps) {
  const [loadingType, setLoadingType] = useState<"merge" | "download" | "upload" | "workspace" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [workspaceSheet, setWorkspaceSheet] = useState(localStorage.getItem("cn_gas_sheet_name") || "Notes");

  if (!isOpen) return null;

  const handleAction = async (type: "merge" | "download" | "upload" | "workspace", action: () => Promise<void>) => {
    setLoadingType(type);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await action();
      onClose();
    } catch (e: any) {
      setErrorMessage(e.message || "同期処理中にエラーが発生しました。");
    } finally {
      setLoadingType(null);
    }
  };

  const isAnyLoading = loadingType !== null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity duration-200"
        onClick={() => !isAnyLoading && onClose()}
      />

      {/* Modal Container */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 w-[540px] max-w-full shadow-2xl relative z-[301] flex flex-col gap-4 text-gray-200 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#30363d] pb-3">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-lg bg-blue-500/10 text-[var(--blue)]">
              <Cloud className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                クラウド同期マネージャー
              </h3>
              <p className="text-[11px] text-[var(--subtle)] mt-0.5">
                Googleスプレッドシート(GAS)との双方向同期やデータバックアップを管理します。
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isAnyLoading}
            className="text-gray-400 hover:text-gray-200 cursor-pointer text-sm p-1 hover:bg-[#30363d] rounded transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Current Info */}
        <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-3 flex items-center justify-between text-xs">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
              現在の同期ステータス
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full inline-block ${
                  syncStatus === "synced"
                    ? "bg-[var(--green)] shadow-[0_0_8px_rgba(63,185,80,0.5)]"
                    : syncStatus === "syncing"
                    ? "bg-[var(--blue)] animate-pulse"
                    : syncStatus === "error"
                    ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                    : "bg-[var(--orange)]"
                }`}
              />
              <span className="font-semibold text-white">{syncLabel}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#21262d] border border-[#30363d] text-[#c4b5fd]">
                対象シート: {localStorage.getItem("cn_gas_sheet_name") || "Notes"}
              </span>
            </div>
          </div>
          <div className="text-right text-[11px] text-gray-500">
            <div>端末間の不整合を解決します。</div>
          </div>
        </div>

        {errorMessage && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-lg flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">同期エラーが発生しました</p>
              <p className="mt-1 text-[var(--subtle)] leading-relaxed">{errorMessage}</p>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="bg-green-500/10 border border-green-500/20 text-green-300 text-xs p-3 rounded-lg flex items-start gap-2">
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-green-400" />
            <div>
              <p className="font-bold">{successMessage}</p>
            </div>
          </div>
        )}

        {/* Actions List */}
        <div className="flex flex-col gap-2.5">
          {/* Action 1: Merge Sync */}
          <button
            type="button"
            disabled={isAnyLoading}
            onClick={() => handleAction("merge", onMergeSync)}
            className="group w-full text-left bg-[#21262d]/50 hover:bg-[#21262d] border border-[#30363d] hover:border-[#58a6ff44] rounded-xl p-3.5 cursor-pointer transition-all flex gap-3"
          >
            <div className="p-2 rounded-lg bg-blue-500/5 group-hover:bg-blue-500/10 text-[var(--blue)] transition-colors self-start mt-0.5">
              <RefreshCw className={`w-4.5 h-4.5 ${loadingType === "merge" ? "animate-spin" : ""}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white group-hover:text-[var(--blue)] transition-colors">
                  ① 自動マージ同期（通常の同期・推奨）
                </span>
                <span className="text-[9px] bg-blue-500/10 text-[var(--blue)] font-bold px-1.5 py-0.5 rounded-full">
                  双方向
                </span>
              </div>
              <p className="text-[11px] text-[var(--subtle)] mt-1 leading-relaxed">
                ローカルとスプレッドシートの両方のすべてのノートを比較し、
                <strong>更新日時が最新のデータ</strong>を優先してマージします。
              </p>
            </div>
          </button>

          {/* Action 2: Force Download */}
          <button
            type="button"
            disabled={isAnyLoading}
            onClick={() => handleAction("download", onForceDownload)}
            className="group w-full text-left bg-[#21262d]/50 hover:bg-[#21262d] border border-[#30363d] hover:border-amber-500/30 rounded-xl p-3.5 cursor-pointer transition-all flex gap-3"
          >
            <div className="p-2 rounded-lg bg-amber-500/5 group-hover:bg-amber-500/10 text-amber-400 transition-colors self-start mt-0.5">
              <Download className={`w-4.5 h-4.5 ${loadingType === "download" ? "animate-pulse" : ""}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors">
                  ② スプレッドシートから強制ダウンロード（ローカルを上書き）
                </span>
                <span className="text-[9px] bg-amber-500/10 text-amber-400 font-bold px-1.5 py-0.5 rounded-full">
                  上書き読込
                </span>
              </div>
              <p className="text-[11px] text-[var(--subtle)] mt-1 leading-relaxed">
                <strong>スプレッドシート側にあるデータ</strong>でアプリ内のノートを上書きします。
              </p>
            </div>
          </button>

          {/* Action 3: Force Upload */}
          <button
            type="button"
            disabled={isAnyLoading}
            onClick={() => handleAction("upload", onForceUpload)}
            className="group w-full text-left bg-[#21262d]/50 hover:bg-[#21262d] border border-[#30363d] hover:border-green-500/30 rounded-xl p-3.5 cursor-pointer transition-all flex gap-3"
          >
            <div className="p-2 rounded-lg bg-green-500/5 group-hover:bg-green-500/10 text-[var(--green)] transition-colors self-start mt-0.5">
              <Upload className={`w-4.5 h-4.5 ${loadingType === "upload" ? "animate-pulse" : ""}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white group-hover:text-[var(--green)] transition-colors">
                  ③ スプレッドシートへ強制アップロード（クラウドを上書き）
                </span>
                <span className="text-[9px] bg-green-500/10 text-[var(--green)] font-bold px-1.5 py-0.5 rounded-full">
                  完全保存
                </span>
              </div>
              <p className="text-[11px] text-[var(--subtle)] mt-1 leading-relaxed">
                <strong>現在この画面にあるノートデータ</strong>をスプレッドシートへ上書き保存します。
              </p>
            </div>
          </button>

          {/* Action 4: Workspace Switch */}
          <div className="group w-full text-left bg-[#21262d]/50 border border-[#30363d] rounded-xl p-3.5 flex flex-col gap-2">
            <div className="flex gap-3">
              <div className="p-2 rounded-lg bg-purple-500/5 text-[var(--purple)] self-start mt-0.5">
                <Cloud className={`w-4.5 h-4.5 ${loadingType === "workspace" ? "animate-pulse" : ""}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    ④ ワークスペースの切り替え（別シート読込）
                  </span>
                  <span className="text-[9px] bg-purple-500/10 text-[var(--purple)] font-bold px-1.5 py-0.5 rounded-full">
                    完全入替
                  </span>
                </div>
                <p className="text-[11px] text-[var(--subtle)] mt-1 leading-relaxed">
                  指定したシートからデータを読み込み、現在のノートを入れ替えます。
                </p>
              </div>
            </div>
            <div className="flex gap-2 items-center pl-[42px]">
              <input
                type="text"
                value={workspaceSheet}
                onChange={(e) => setWorkspaceSheet(e.target.value)}
                placeholder="シート名 (例: ProjectA)"
                className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-xs text-white outline-none focus:border-[var(--purple)] transition-colors"
                disabled={isAnyLoading}
              />
              <button
                type="button"
                disabled={isAnyLoading}
                onClick={() => {
                  if (!workspaceSheet.trim()) {
                    setErrorMessage("シート名を入力してください。");
                    return;
                  }
                  localStorage.setItem("cn_gas_sheet_name", workspaceSheet.trim());
                  handleAction("workspace", onForceDownload);
                }}
                className="bg-[#238636] hover:bg-[#2ea043] text-white font-bold text-[11px] px-4 py-1.5 rounded-md transition-colors disabled:opacity-50 cursor-pointer"
              >
                入れ替える
              </button>
            </div>
          </div>
        </div>

        {/* Warning Footer info */}
        <div className="border-t border-[#30363d] pt-3 flex gap-2 text-[10px] text-gray-500 items-start">
          <HelpCircle className="w-3.5 h-3.5 shrink-0 text-gray-500 mt-0.5" />
          <p className="leading-relaxed">
            【ご注意】「強制ダウンロード/アップロード」を選択した場合、もう一方のデータは復元できません。十分にデータ状態を確認してから実行してください。
          </p>
        </div>
      </div>
    </div>
  );
}
