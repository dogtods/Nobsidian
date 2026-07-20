/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "primary" | "danger" | "success";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "実行する",
  cancelText = "キャンセル",
  variant = "primary",
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  
  if (!isOpen) return null;

  const getButtonClass = () => {
    switch (variant) {
      case "danger":
        return "bg-red-500 hover:bg-red-600 border border-red-500 text-white cursor-pointer transition-all shadow-md active:scale-95";
      case "success":
        return "bg-emerald-500 hover:bg-emerald-600 border border-emerald-500 text-white cursor-pointer transition-all shadow-md active:scale-95";
      default:
        return "bg-purple-500 hover:bg-purple-600 border border-purple-500 text-white cursor-pointer transition-all shadow-md active:scale-95";
    }
  };

  const getHeaderIcon = () => {
    switch (variant) {
      case "danger":
        return "⚠️";
      case "success":
        return "✅";
      default:
        return "✦";
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity duration-200"
        onClick={onCancel}
      />

      {/* Modal Container */}
      <div className="bg-[var(--surface)] border border-[var(--border2)] rounded-xl p-6 w-[360px] max-w-full shadow-2xl relative z-[301] flex flex-col gap-4 transform transition-all duration-300 scale-100 opacity-100">
        <div>
          <div className="text-base font-bold text-[var(--bright)] flex items-center gap-2">
            <span className="text-lg">{getHeaderIcon()}</span> {title}
          </div>
          <p className="text-xs text-[var(--subtle)] mt-3 leading-relaxed whitespace-pre-wrap">
            {message}
          </p>
        </div>

        <div className="flex gap-2 justify-end border-t border-[var(--border2)] pt-4 mt-2">
          <button
            type="button"
            className="text-xs text-[var(--subtle)] border border-[var(--border2)] hover:bg-[var(--border)] p-2 px-4 rounded-md cursor-pointer font-medium transition-colors"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`text-xs p-2 px-5 rounded-md font-bold ${getButtonClass()}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
