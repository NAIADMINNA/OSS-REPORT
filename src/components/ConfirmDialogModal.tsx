import React from 'react';
import { AlertTriangle, Trash2, X, RefreshCw } from 'lucide-react';

export interface ConfirmDialogModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  iconType?: 'trash' | 'warning' | 'reset';
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmDialogModal: React.FC<ConfirmDialogModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'ยืนยันการลบข้อมูล',
  cancelText = 'ยกเลิก',
  isDanger = true,
  iconType = 'trash',
  onConfirm,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                isDanger
                  ? 'bg-rose-100 text-rose-700 border border-rose-200'
                  : 'bg-amber-100 text-amber-800 border border-amber-200'
              }`}
            >
              {iconType === 'trash' && <Trash2 className="w-5 h-5" />}
              {iconType === 'warning' && <AlertTriangle className="w-5 h-5" />}
              {iconType === 'reset' && <RefreshCw className="w-5 h-5" />}
            </div>
            <div>
              <h3
                id="confirm-dialog-title"
                className="text-base font-bold text-slate-900 font-['Prompt']"
              >
                {title}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                ระบบจัดการและควบคุมข้อมูล DOE Admin
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 leading-relaxed font-medium">
          {message}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 text-xs font-bold text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer ${
              isDanger
                ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800'
                : 'bg-blue-900 hover:bg-blue-800 active:bg-blue-950'
            }`}
          >
            {iconType === 'trash' && <Trash2 className="w-3.5 h-3.5" />}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
