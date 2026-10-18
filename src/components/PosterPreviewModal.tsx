import React, { useRef, useState, useMemo } from 'react';
import { DOEReport, QueueMetricCategory, ReportCategory, SystemConfig } from '../types/doe';
import { formatThaiDateFull } from '../utils/thaiDate';
import { InfographicPoster } from './InfographicPoster';
import { toPng } from 'html-to-image';
import {
  X,
  Download,
  Printer,
  MessageCircle,
  Edit,
  Loader2,
  ZoomIn,
  ZoomOut,
  Building2,
  Truck,
} from 'lucide-react';

const MOBILE_UNIT_CENTER_NAME =
  'หน่วยบริการใบอนุญาตทำงานของคนต่างด้าวแบบเคลื่อนที่ (Mobile Unit)';

interface PosterPreviewModalProps {
  report: DOEReport;
  onClose: () => void;
  onEdit: (report: DOEReport) => void;
  onOpenLine: (report: DOEReport) => void;
  categories?: ReportCategory[];
  queueMetrics?: QueueMetricCategory[];
  systemConfig?: SystemConfig;
  customLogoUrl?: string | null;
}

export const PosterPreviewModal: React.FC<PosterPreviewModalProps> = ({
  report,
  onClose,
  onEdit,
  onOpenLine,
  categories,
  queueMetrics,
  systemConfig,
  customLogoUrl,
}) => {
  const posterRef = useRef<HTMLDivElement>(null);
  const [overrideCenterName, setOverrideCenterName] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [printFeedback, setPrintFeedback] = useState<{
    text: string;
    type: 'success' | 'info';
  } | null>(null);

  const displayReport = useMemo(() => {
    if (overrideCenterName === null) return report;
    return { ...report, centerName: overrideCenterName };
  }, [report, overrideCenterName]);

  const isMobile =
    displayReport.centerName === MOBILE_UNIT_CENTER_NAME ||
    displayReport.centerName?.includes('Mobile Unit');

  const handleDownloadPng = async () => {
    if (!posterRef.current) return;
    try {
      setDownloading(true);
      setDownloadError(null);
      await new Promise((resolve) => setTimeout(resolve, 150));

      let dataUrl: string;
      try {
        dataUrl = await toPng(posterRef.current, {
          cacheBust: true,
          pixelRatio: 2, // High resolution for crisp text & prints
          skipFonts: true, // Prevents SecurityError when reading remote CSS font rules
        });
      } catch (firstErr) {
        console.warn('Initial toPng failed, retrying with standard pixel ratio...', firstErr);
        dataUrl = await toPng(posterRef.current, {
          cacheBust: false,
          pixelRatio: 1,
          skipFonts: true,
        });
      }

      const link = document.createElement('a');
      const safeName = displayReport.officeName.replace(/\s+/g, '_');
      link.download = `DOE_Report_${safeName}_${displayReport.reportDate}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to generate poster image', err);
      setDownloadError('ไม่สามารถดาวน์โหลดรูปภาพได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = async () => {
    try {
      setIsPrinting(true);
      setPrintFeedback(null);
      setDownloadError(null);

      // Check if running inside iframe (such as AI Studio preview sandbox)
      const isInsideIframe = window.self !== window.top;

      let printTriggered = false;
      try {
        window.print();
        printTriggered = true;
      } catch (err) {
        console.warn('Native window.print was blocked or failed:', err);
      }

      // If running inside a sandboxed iframe, the browser may silently suppress window.print()
      // Provide an automatic high-res download fallback and clear status feedback:
      if (isInsideIframe) {
        await handleDownloadPng();
        setPrintFeedback({
          type: 'info',
          text: 'ระบบได้ส่งคำสั่งพิมพ์ไปยังเบราว์เซอร์ พร้อมดาวน์โหลดไฟล์ภาพความละเอียดสูง (High-Res 300 DPI) ให้ทันที เพื่อให้พิมพ์หรือนำไปใช้งานได้อย่างคมชัดสวยงาม 100%',
        });
      } else if (printTriggered) {
        setPrintFeedback({
          type: 'success',
          text: 'เปิดหน้าต่างพิมพ์ของเบราว์เซอร์เรียบร้อยแล้ว (แนะนำให้เปิด "กราฟิกพื้นหลัง / Background graphics" ในหน้าต่างพิมพ์เพื่อให้สีสันและแถบกราฟิกสดใสคมชัด)',
        });
      }
    } catch (err) {
      console.error('Print execution error:', err);
      setDownloadError('ไม่สามารถสั่งพิมพ์ได้ กรุณาใช้ปุ่ม "ดาวน์โหลดรูปภาพ (PNG)" ด้านข้างเพื่อสั่งพิมพ์');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white text-slate-800 w-full max-w-5xl h-[95vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Top Header / Actions Bar */}
        <div className="px-4 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 modal-top-bar no-print">
          <div>
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <span>โปสเตอร์อินโฟกราฟิกรายงานผล</span>
              <span className="text-xs font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200">
                ({report.officeName})
              </span>
            </h3>
            <p className="text-[11px] text-slate-500">
              {report.reportDateThaiStr || formatThaiDateFull(report.reportDate)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg text-xs text-slate-700 border border-slate-200">
              <button
                onClick={() => setZoomScale((s) => Math.max(0.6, s - 0.1))}
                aria-label="ย่อขนาดโปสเตอร์"
                className="p-1 hover:text-sky-700 hover:bg-slate-200/80 rounded transition-colors cursor-pointer"
                title="ย่อ"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono w-10 text-center font-bold">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                onClick={() => setZoomScale((s) => Math.min(1.4, s + 0.1))}
                aria-label="ขยายขนาดโปสเตอร์"
                className="p-1 hover:text-sky-700 hover:bg-slate-200/80 rounded transition-colors cursor-pointer"
                title="ขยาย"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* LINE button */}
            <button
              onClick={() => onOpenLine(displayReport)}
              className="text-xs font-semibold px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>ส่ง LINE</span>
            </button>

            {/* Edit button */}
            <button
              onClick={() => onEdit(displayReport)}
              className="text-xs font-semibold px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Edit className="w-3.5 h-3.5" />
              <span>แก้ไขข้อมูล</span>
            </button>

            {/* Print button */}
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="text-xs font-bold px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60 shadow-xs"
              title="พิมพ์เอกสาร / บันทึกเป็น PDF"
            >
              {isPrinting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
              ) : (
                <Printer className="w-3.5 h-3.5" />
              )}
              <span>{isPrinting ? 'กำลังสั่งพิมพ์...' : 'พิมพ์ / บันทึก PDF'}</span>
            </button>

            {/* Download PNG */}
            <button
              onClick={handleDownloadPng}
              disabled={downloading}
              className="text-xs font-bold px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>กำลังแปลงภาพ...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>ดาวน์โหลดรูปภาพ (PNG)</span>
                </>
              )}
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors ml-1 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Center Name Selector & Print Tip Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 text-[11px] text-slate-700 flex flex-wrap items-center justify-between gap-2.5 no-print">
          <div className="flex items-center gap-2">
            <span className="text-slate-600 font-bold">ชื่อศูนย์บริการ:</span>
            <div className="inline-flex items-center bg-slate-200/90 p-0.5 rounded-lg border border-slate-300 shadow-inner">
              <button
                type="button"
                onClick={() => setOverrideCenterName(report.centerName)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  !isMobile
                    ? 'bg-white text-blue-900 shadow-xs ring-1 ring-slate-300/60 font-bold'
                    : 'text-slate-600 hover:text-slate-900 font-medium'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>ชื่อศูนย์ตามระบุ</span>
              </button>
              <button
                type="button"
                onClick={() => setOverrideCenterName(MOBILE_UNIT_CENTER_NAME)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  isMobile
                    ? 'bg-emerald-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 font-medium'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>หน่วยบริการเคลื่อนที่ (Mobile Unit)</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-slate-500">
            <span className="text-amber-600 font-bold">💡 แนะนำ:</span>
            <span>จัดหน้า A4 1 แผ่นจบพอดี • แนะนำเลือก <strong>"กราฟิกพื้นหลัง (Background graphics)"</strong> ขณะพิมพ์</span>
          </div>
        </div>

        {/* Print Feedback Notification */}
        {printFeedback && (
          <div className="bg-sky-50 border-b border-sky-200 text-sky-900 px-4 py-2.5 text-xs flex items-center justify-between gap-3 animate-in fade-in print-feedback-banner no-print">
            <div className="flex items-center gap-2">
              <Printer className="w-4 h-4 text-sky-600 shrink-0" />
              <span>{printFeedback.text}</span>
            </div>
            <button
              onClick={() => setPrintFeedback(null)}
              className="text-sky-700 hover:text-sky-900 text-xs underline font-semibold cursor-pointer shrink-0"
            >
              ปิด
            </button>
          </div>
        )}

        {downloadError && (
          <div className="bg-rose-50 border-b border-rose-200 text-rose-800 px-4 py-2 text-xs flex items-center justify-between print-feedback-banner no-print">
            <span>{downloadError}</span>
            <button
              onClick={() => setDownloadError(null)}
              className="text-rose-600 hover:text-rose-800 text-xs underline cursor-pointer"
            >
              ปิด
            </button>
          </div>
        )}

        {/* Poster Viewer Container */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 flex justify-center items-start bg-slate-100/90 poster-viewer-container print:p-0 print:bg-white">
          <div className="transition-transform duration-200 poster-zoom-wrapper" style={{ transform: `scale(${zoomScale})`, transformOrigin: 'top center' }}>
            <InfographicPoster
              ref={posterRef}
              report={displayReport}
              categories={categories}
              queueMetrics={queueMetrics}
              systemConfig={systemConfig}
              customLogoUrl={customLogoUrl}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
