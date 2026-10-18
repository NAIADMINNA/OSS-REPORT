import React, { useState } from 'react';
import { DOEReport, QueueMetricCategory } from '../types/doe';
import { generateLineSummaryText } from '../utils/thaiDate';
import { X, Copy, Check, MessageCircle, Share2 } from 'lucide-react';

interface ExportLineModalProps {
  report: DOEReport;
  queueMetrics?: QueueMetricCategory[];
  onClose: () => void;
}

export const ExportLineModal: React.FC<ExportLineModalProps> = ({
  report,
  queueMetrics,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const textContent = generateLineSummaryText(report, queueMetrics);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = textContent;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-emerald-600 text-white">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-white" />
            <h3 className="font-bold text-base">
              ข้อความสรุปรายงานสำหรับส่งกลุ่ม LINE ผู้บริหาร
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-3">
          <p className="text-xs text-slate-500">
            ระบบจัดรูปแบบข้อความรายงานผลประจำวันอัตโนมัติ พร้อมส่งเข้ากลุ่มไลน์ผู้บริหารหรือหน่วยงาน
          </p>

          <div className="relative">
            <textarea
              readOnly
              rows={16}
              value={textContent}
              className="w-full text-xs font-mono p-4 bg-slate-50 border border-slate-300 rounded-xl leading-relaxed text-slate-800 select-all focus:outline-hidden"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500">
            {report.officeName} ({report.reportDateThaiStr})
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-xs font-semibold px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer"
            >
              ปิด
            </button>
            <button
              onClick={handleCopy}
              className="text-xs font-bold px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>คัดลอกเรียบร้อยแล้ว!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>คัดลอกข้อความ (Copy)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
