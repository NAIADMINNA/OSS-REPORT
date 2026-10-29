import React, { forwardRef, useMemo } from 'react';
import { DOEReport, QueueMetricCategory, ReportCategory, SystemConfig } from '../types/doe';
import { DEFAULT_CATEGORIES } from '../data/initialAdminData';
import { DOELogo } from './DOELogo';
import { formatNumber, formatThaiDateFull } from '../utils/thaiDate';
import {
  BookOpen,
  FolderMinus,
  Wrench,
  Users,
  ShieldCheck,
  Edit3,
  CreditCard,
  Calendar,
  CalendarRange,
  CheckCircle2,
  Phone,
  TrendingUp,
  Layers,
  UserCheck,
  Sparkles,
  CalendarX,
  XCircle,
  UserX,
  Globe,
  Star,
} from 'lucide-react';

interface InfographicPosterProps {
  report: DOEReport;
  scale?: number;
  categories?: ReportCategory[];
  queueMetrics?: QueueMetricCategory[];
  systemConfig?: SystemConfig;
  customLogoUrl?: string | null;
}

export const InfographicPoster = forwardRef<HTMLDivElement, InfographicPosterProps>(
  ({ report, scale = 1, categories, queueMetrics, systemConfig, customLogoUrl }, ref) => {
    // Helper to look up configured queue metric titles & units
    const getQueueMetric = (id: string, defaultTitle: string, defaultUnit: string) => {
      const found = queueMetrics?.find((m) => m.id === id);
      if (!found) return { title: defaultTitle, unit: defaultUnit };
      const title =
        id === 'cardsNotIssued' && found.title === 'ไม่ออกบัตร'
          ? 'บัตรเสีย'
          : found.title || defaultTitle;
      const unit =
        id === 'cardsNotIssued' && found.title === 'ไม่ออกบัตร' && found.unit === 'คน'
          ? 'ใบ'
          : found.unit || defaultUnit;
      return { title, unit };
    };

    const issuedMetricInfo = getQueueMetric('cardsIssued', 'ออกบัตรสำเร็จ', 'ใบ');
    const missedMetricInfo = getQueueMetric('missedAppointment', 'ไม่มาตามนัด', 'คน');
    const wrongDateMetricInfo = getQueueMetric('wrongAppointmentDate', 'มาไม่ตรงวันนัด', 'คน');
    const notIssuedMetricInfo = getQueueMetric('cardsNotIssued', 'บัตรเสีย', 'ใบ');

    // Determine active sections list
    const activeCategories =
      categories && categories.length > 0
        ? categories.filter((c) => c.isActive)
        : DEFAULT_CATEGORIES;

    const sections = activeCategories.map((c, idx) => {
      let count = 0;
      if (c.id === 'section59') count = report.section59 || 0;
      else if (c.id === 'section62') count = report.section62 || 0;
      else if (c.id === 'section63_1') count = report.section63_1 || 0;
      else if (c.id === 'section63_2') count = report.section63_2 || 0;
      else if (c.id === 'section64') count = report.section64 || 0;
      else if (c.id === 'mouGroup')
        count = report.mouGroup || report.customCategoryValues?.['mouGroup'] || 0;
      else if (c.id === 'modifyDetails') count = report.modifyDetails || 0;
      else if (c.id === 'substituteCard') count = report.substituteCard || 0;
      else count = report.customCategoryValues?.[c.id] || 0;

      let icon = BookOpen;
      if (c.id === 'section62') icon = FolderMinus;
      else if (c.id === 'section63_1') icon = Wrench;
      else if (c.id === 'section63_2') icon = Users;
      else if (c.id === 'section64') icon = ShieldCheck;
      else if (c.id === 'mouGroup') icon = Globe;
      else if (c.id === 'modifyDetails') icon = Edit3;
      else if (c.id === 'substituteCard') icon = CreditCard;

      return {
        id: c.id,
        code: c.code || `ม.${idx + 1}`,
        title: c.title,
        desc: c.subLabel,
        count,
        icon,
        color: c.color || 'from-blue-600 to-indigo-600',
        isPrimary: idx === 0,
      };
    });

    const totalIssuedGroups = sections.reduce((acc, s) => acc + s.count, 0);
    const effectiveCardsIssued = Math.max(report.cardsIssued || 0, totalIssuedGroups);

    const completionRate =
      report.queueAppointment > 0
        ? Math.min(100, Math.round((effectiveCardsIssued / report.queueAppointment) * 100))
        : 0;

    const missedRate =
      report.queueAppointment > 0
        ? Math.round((report.missedAppointment / report.queueAppointment) * 100)
        : 0;

    const wrongDayRate =
      report.queueAppointment > 0
        ? Math.round((report.wrongAppointmentDate / report.queueAppointment) * 100)
        : 0;

    const notIssuedRate =
      report.queueAppointment > 0
        ? Math.round((report.cardsNotIssued / report.queueAppointment) * 100)
        : 0;

    const maxSectionCount = Math.max(...sections.map((s) => s.count), 1);

    const effectiveLogoUrl = customLogoUrl ?? systemConfig?.customLogoUrl;

    const rawDateStr = report.reportDateThaiStr || formatThaiDateFull(report.reportDate);
    const isCycle =
      report.id?.includes('cycle') ||
      report.id?.includes('overview') ||
      report.officeId === 'overview' ||
      report.officeName?.includes('ภาพรวม') ||
      rawDateStr.includes('สะสม') ||
      rawDateStr.includes('ภาพรวม') ||
      rawDateStr.includes('รอบ') ||
      rawDateStr.includes('ประจำรอบ') ||
      rawDateStr.includes('รอบที่') ||
      rawDateStr.includes('รอบสัปดาห์') ||
      rawDateStr.includes('รอบประจำ') ||
      rawDateStr.includes(' - ') ||
      rawDateStr.includes(' – ') ||
      rawDateStr.includes('ทุกช่วงวัน') ||
      rawDateStr.includes('ถึง');

    const isMobileUnitPoster =
      (report.centerName || '').includes('Mobile Unit') ||
      ((report.centerName || '').includes('หน่วยบริการ') &&
        (report.centerName || '').includes('เคลื่อนที่')) ||
      (report.officeName || '').includes('Mobile Unit');

    let cycleBadge = isCycle ? 'ประจำรอบการรายงาน' : 'ข้อมูลรายงานประจำวัน';
    let cleanDateText = rawDateStr;
    let cycleSubText = isCycle
      ? isMobileUnitPoster
        ? 'สรุปสถิติหน่วยบริการเคลื่อนที่ (Mobile Unit)'
        : 'สรุปสถิติผลการดำเนินงานตามรอบ'
      : isMobileUnitPoster
      ? 'หน่วยบริการเคลื่อนที่ (Mobile Unit)'
      : 'ศูนย์บริการใบอนุญาตทำงานประจำพื้นที่';

    if (rawDateStr.includes('รอบที่ 1')) {
      cycleBadge = 'ประจำรอบที่ 1';
      cleanDateText = rawDateStr.replace(/^.*?รอบที่ 1:?\s*/, '').trim();
    } else if (rawDateStr.includes('รอบที่ 2')) {
      cycleBadge = 'ประจำรอบที่ 2';
      cleanDateText = rawDateStr.replace(/^.*?รอบที่ 2:?\s*/, '').trim();
    } else if (rawDateStr.includes('รอบสัปดาห์') || rawDateStr.includes('รอบประจำสัปดาห์')) {
      cycleBadge = 'สรุปผลประจำรอบสัปดาห์';
      cleanDateText = rawDateStr.replace(/^.*?รอบ(ประจำ)?สัปดาห์:?\s*/, '').trim();
    } else if (
      rawDateStr.includes('รอบประจำเดือน') ||
      rawDateStr.includes('ทั้งเดือน') ||
      rawDateStr.includes('1 - 31 ตุลาคม') ||
      rawDateStr.includes('1 – 31 ตุลาคม')
    ) {
      cycleBadge = 'สรุปผลประจำรอบเดือน';
      cleanDateText = rawDateStr.replace(/^.*?รอบประจำเดือน:?\s*/, '').trim();
    } else if (rawDateStr.includes('ทุกช่วงวัน')) {
      cycleBadge = 'ภาพรวมข้อมูลสะสม';
      cleanDateText = 'ทุกช่วงวันของการเปิดบริการ';
      cycleSubText = isMobileUnitPoster
        ? 'สถิติสะสมหน่วยบริการเคลื่อนที่ (Mobile Unit)'
        : 'สถิติสะสมตั้งแต่วันแรกถึงปัจจุบัน';
    } else if (rawDateStr.startsWith('ประจำรอบ: วันที่ ')) {
      cycleBadge = 'ประจำรอบการรายงาน';
      cleanDateText = rawDateStr.replace('ประจำรอบ: วันที่ ', 'วันที่ ').trim();
    } else if (rawDateStr.startsWith('ประจำรอบวันที่ ')) {
      cycleBadge = 'ประจำรอบการรายงาน';
      cleanDateText = rawDateStr.replace('ประจำรอบวันที่ ', 'วันที่ ').trim();
    } else if (rawDateStr.startsWith('ช่วงวันที่: ')) {
      cycleBadge = 'ประจำช่วงวันที่รายงาน';
      cleanDateText = rawDateStr.replace('ช่วงวันที่: ', '').trim();
    } else if (rawDateStr.startsWith('ประจำรอบ: ')) {
      cycleBadge = 'ประจำรอบการรายงาน';
      cleanDateText = rawDateStr.replace('ประจำรอบ: ', '').trim();
    } else if (rawDateStr.startsWith('ประจำรอบ')) {
      cycleBadge = 'ประจำรอบการรายงาน';
      cleanDateText = rawDateStr.replace('ประจำรอบ', '').trim();
    }

    // Ensure clean date text uses en-dash for beautiful typography
    cleanDateText = cleanDateText.replace(/\s*-\s*/g, ' – ');
    if (
      cleanDateText &&
      !cleanDateText.startsWith('วันที่ ') &&
      !cleanDateText.startsWith('ทุกช่วงวัน') &&
      cleanDateText.includes(' – ')
    ) {
      cleanDateText = `วันที่ ${cleanDateText}`;
    }

    // Dynamic font size calculation for officeName to fit cleanly alongside the Date Chip without overflowing
    const officeNameFontSize = useMemo(() => {
      const text = report.officeName || '';
      const len = text.trim().length;
      if (len <= 18) return 19.5;
      if (len <= 24) return 18;
      if (len <= 30) return 16;
      if (len <= 36) return 14.5;
      if (len <= 42) return 13.5;
      if (len <= 50) return 12.5;
      if (len <= 60) return 11.5;
      return 11;
    }, [report.officeName]);

    const officeNameEnFontSize = useMemo(() => {
      const text = report.officeNameEn || '';
      const len = text.trim().length;
      if (len <= 30) return 11.5;
      if (len <= 40) return 10.5;
      if (len <= 50) return 9.5;
      return 9;
    }, [report.officeNameEn]);

    const baseReportTitleText =
      systemConfig?.reportTitle ||
      'รายงานผลการปฏิบัติงานศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว';

    const reportTitleText =
      isMobileUnitPoster &&
      baseReportTitleText === 'รายงานผลการปฏิบัติงานศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว'
        ? 'รายงานผลการปฏิบัติงานหน่วยบริการใบอนุญาตทำงานของคนต่างด้าวแบบเคลื่อนที่'
        : baseReportTitleText;

    const reportTitleFontSize = useMemo(() => {
      const len = reportTitleText.trim().length;
      if (len <= 42) return 16.5;
      if (len <= 58) return 15;
      if (len <= 70) return 13.5;
      return 12.5;
    }, [reportTitleText]);

    // Center name display logic for clean multiline rendering without negative margins or vertical offsets
    const centerNameDisplay = useMemo(() => {
      const name = report.centerName || '';
      if (!name && !isMobileUnitPoster) {
        return { isMultiline: false, line1: '', line2: '', hasSeparator: false, fontSize: '11.5px' };
      }

      // Check for Mobile Unit (หน่วยบริการเคลื่อนที่)
      if (
        isMobileUnitPoster ||
        name.includes('Mobile Unit') ||
        (name.includes('หน่วยบริการ') && name.includes('เคลื่อนที่'))
      ) {
        let line1 = 'หน่วยบริการใบอนุญาตทำงานของคนต่างด้าวแบบเคลื่อนที่';
        let line2 = '(Mobile Unit)';
        if (name.includes('(Mobile Unit)')) {
          const parts = name.split('(Mobile Unit)');
          line1 = parts[0].trim() || 'หน่วยบริการใบอนุญาตทำงานของคนต่างด้าวแบบเคลื่อนที่';
          const suffix = parts.slice(1).join('(Mobile Unit)').trim();
          line2 = suffix ? `(Mobile Unit) ${suffix}` : '(Mobile Unit)';
        } else if (name.includes(' - ')) {
          const [p1, ...rest] = name.split(' - ');
          line1 = p1.trim();
          line2 = rest.join(' - ').trim();
        }
        return {
          isMultiline: true,
          line1,
          line2,
          hasSeparator: true,
          fontSize: line2.length > 35 ? '10px' : '10.5px',
        };
      }

      // Check for separator " - " (e.g. Bangkok centers and branches)
      if (name.includes(' - ')) {
        const [p1, ...rest] = name.split(' - ');
        const line2Text = rest.join(' - ').trim();
        return {
          isMultiline: true,
          line1: p1.trim(),
          line2: line2Text,
          hasSeparator: true,
          fontSize: line2Text.length > 38 ? '10px' : '10.5px',
        };
      }

      // Check for " จังหวัด" separation if name is long
      if (name.includes(' จังหวัด') && name.length > 28) {
        const [p1, p2] = name.split(' จังหวัด');
        return {
          isMultiline: true,
          line1: p1.trim(),
          line2: `จังหวัด${p2}`.trim(),
          hasSeparator: false,
          fontSize: '11px',
        };
      }

      // If text is long enough to wrap (> 30 characters)
      if (name.length > 30) {
        return {
          isMultiline: true,
          line1: name,
          line2: '',
          hasSeparator: false,
          fontSize: name.length > 48 ? '10px' : '11px',
        };
      }

      // Single line standard
      return {
        isMultiline: false,
        line1: name,
        line2: '',
        hasSeparator: false,
        fontSize: '11.5px',
      };
    }, [report.centerName]);

    return (
      <div
        ref={ref}
        id="doe-poster-capture"
        style={{
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top center',
          letterSpacing: '0px',
        }}
        className="w-[780px] min-w-[780px] max-w-[780px] min-h-[1100px] shrink-0 p-8 rounded-3xl relative overflow-hidden font-sans select-none flex flex-col justify-between bg-gradient-to-br from-white via-[#f8fafc] to-[#f1f5f9] text-slate-900 border-2 border-slate-200/90 shadow-2xl"
      >
        {/* Subtle Ambient Mesh Glow */}
        <div className="absolute top-0 right-0 w-[420px] h-[420px] bg-sky-200/40 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-10 left-0 w-[400px] h-[400px] bg-teal-200/30 rounded-full blur-3xl pointer-events-none -ml-20" />
        <div className="absolute top-1/2 right-1/4 w-[300px] h-[300px] bg-amber-200/30 rounded-full blur-3xl pointer-events-none" />

        {/* 1. TOP HEADER: Clean Light Style */}
        <div className="relative z-10">
          <div className="flex items-center justify-between pb-5 border-b border-slate-200 mb-5 gap-3">
            <div className="flex items-center gap-3.5 min-w-0 flex-1 overflow-hidden pr-2">
              <div className="shrink-0 p-1 rounded-2xl bg-gradient-to-tr from-amber-400/20 via-sky-400/20 to-transparent border border-slate-200 shadow-xs">
                <DOELogo size={68} customLogoUrl={effectiveLogoUrl} />
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-900 text-white font-mono shadow-2xs shrink-0">
                    {systemConfig?.departmentNameEn || 'DEPARTMENT OF EMPLOYMENT'}
                  </span>
                  <span className="text-[11px] font-bold tracking-normal text-sky-800 truncate">
                    {systemConfig?.departmentNameTh || 'กรมการจัดหางาน กระทรวงแรงงาน'}
                  </span>
                </div>
                <h1
                  style={{ fontSize: `${officeNameFontSize}px`, lineHeight: 1.3 }}
                  className="font-black tracking-normal mt-1 text-[#1e3a8a] font-['Prompt'] break-words"
                  title={report.officeName || 'สำนักงานจัดหางาน'}
                >
                  {report.officeName || 'กรุณาเลือกสำนักงานจัดหางาน'}
                </h1>
                <p
                  style={{ fontSize: `${officeNameEnFontSize}px`, lineHeight: 1.3 }}
                  className="font-medium tracking-normal text-slate-500 truncate mt-0.5"
                  title={report.officeNameEn}
                >
                  {report.officeNameEn || 'Provincial / Area Employment Office'}
                </p>
              </div>
            </div>

            {/* Date Chip */}
            <div className="text-right shrink-0">
              <div
                className={`inline-flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border shadow-xs ${
                  isCycle
                    ? 'border-sky-300/90 bg-gradient-to-r from-sky-50 via-white to-blue-50/80 ring-1 ring-sky-200/50 shadow-sky-100/60'
                    : 'border-blue-200 bg-blue-50/80'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                    isCycle
                      ? 'bg-gradient-to-br from-[#0f2856] to-sky-800 text-amber-300 ring-2 ring-sky-200/60'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {isCycle ? (
                    <CalendarRange className="w-5 h-5" />
                  ) : (
                    <Calendar className="w-4.5 h-4.5" />
                  )}
                </div>

                <div className="flex flex-col text-right">
                  <div className="flex items-center justify-end gap-1.5 mb-0.5">
                    <span
                      className={`text-[10.5px] font-extrabold tracking-normal px-2.5 py-0.5 rounded-full font-['Prompt'] whitespace-nowrap ${
                        isCycle
                          ? 'bg-blue-900 text-white shadow-2xs'
                          : 'bg-blue-100/70 text-slate-600'
                      }`}
                    >
                      {cycleBadge}
                    </span>
                    {isCycle && (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                    )}
                  </div>
                  <span className="text-[14px] font-black text-[#0f2856] font-['Prompt'] leading-snug tracking-normal whitespace-nowrap">
                    {cleanDateText}
                  </span>
                </div>
              </div>
              <div className="text-[10px] font-semibold mt-1 text-slate-500 flex items-center justify-end gap-1.5">
                {isCycle ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                    <span>{cycleSubText}</span>
                  </>
                ) : (
                  <span>{cycleSubText}</span>
                )}
              </div>
            </div>
          </div>

          {/* Banner Title Box */}
          <div className="relative rounded-2xl p-[1px] bg-gradient-to-r from-blue-600 via-indigo-600 to-teal-500 shadow-xs mb-5">
            <div className="rounded-[15px] px-5 py-3 flex items-center justify-between gap-3 bg-white">
              <div className="min-w-0 flex-1 pr-2 overflow-hidden">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-sky-50 via-indigo-50/70 to-blue-50/80 border border-sky-200/90 text-sky-950 shadow-xs ring-1 ring-sky-100/70 font-['Prompt']">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-600" />
                    </span>
                    <span
                      style={{
                        fontSize:
                          (systemConfig?.reportSubtitle?.length || 0) > 45
                            ? '9.5px'
                            : (systemConfig?.reportSubtitle?.length || 0) > 30
                            ? '10px'
                            : '10.5px',
                      }}
                      className="font-extrabold tracking-normal text-[#0f2856] leading-normal"
                    >
                      {systemConfig?.reportSubtitle ||
                        (isCycle
                          ? 'รายงานสรุปผลการดำเนินงานประจำรอบ'
                          : 'EXECUTIVE SUMMARY REPORT • เรียน อธิบดี / ผู้บริหาร')}
                    </span>
                  </span>
                  {isCycle && (
                    <span className="text-[10.5px] font-black text-blue-900 bg-blue-100/90 px-2.5 py-0.5 rounded-md border border-blue-300 shadow-2xs font-['Prompt'] inline-flex items-center justify-center text-center whitespace-nowrap shrink-0">
                      {cycleBadge}
                    </span>
                  )}
                </div>
                <h2
                  style={{ fontSize: `${reportTitleFontSize}px`, lineHeight: 1.35 }}
                  className="font-black mt-1.5 tracking-normal text-[#0f2856] font-['Prompt'] break-words"
                >
                  {reportTitleText}
                </h2>
              </div>

              <div className="text-right shrink-0 flex flex-col items-end justify-center max-w-[265px]">
                <span
                  style={{
                    fontSize: centerNameDisplay.fontSize,
                    lineHeight: '1.35',
                  }}
                  className={`font-bold px-3 py-1.5 rounded-lg border bg-gradient-to-b from-blue-50/95 to-blue-100/60 border-blue-200/90 text-blue-900 shadow-2xs max-w-full text-right ${
                    centerNameDisplay.isMultiline
                      ? 'inline-flex flex-col items-end'
                      : 'inline-block'
                  }`}
                  title={report.centerName}
                >
                  {centerNameDisplay.isMultiline && centerNameDisplay.line2 ? (
                    <>
                      <span className="font-bold tracking-normal text-blue-950 block leading-snug break-words">
                        {centerNameDisplay.line1}
                      </span>
                      <span className="font-bold text-[10.5px] text-blue-900 mt-1 flex items-center justify-end gap-1 leading-snug bg-blue-100/60 px-1.5 py-0.5 rounded-md border border-blue-200/50 max-w-full">
                        {centerNameDisplay.hasSeparator && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                        )}
                        <span className="truncate max-w-[235px]">{centerNameDisplay.line2}</span>
                      </span>
                    </>
                  ) : (
                    <span className="break-words leading-snug block">{report.centerName}</span>
                  )}
                </span>
                {isCycle && (
                  <span className="text-[10px] font-semibold text-slate-500 mt-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span>สถิติประมวลผลประจำรอบ</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 2. TOP HERO METRICS: Row 1 - คิวนัดหมายทั้งหมด */}
        <div className="relative z-10 mb-3.5">
          <div className="bg-gradient-to-r from-teal-50/80 via-white to-teal-50/40 rounded-2xl p-4 border border-teal-200/90 shadow-sm relative overflow-hidden flex items-center justify-between gap-3">
            <div className="absolute right-0 top-0 bottom-0 w-44 bg-gradient-to-l from-teal-100/30 to-transparent pointer-events-none" />
            <div className="flex items-center gap-3.5 relative z-10 min-w-0 flex-1">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-600 to-teal-700 text-white flex items-center justify-center shrink-0 shadow-sm ring-4 ring-teal-100/70">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-bold text-slate-800 tracking-normal">
                    {isCycle ? 'ยอดคิวนัดหมายประจำรอบ' : 'คิวนัดหมายทั้งหมด'}
                  </span>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-teal-100 text-teal-800 border border-teal-300/80 shadow-2xs font-['Prompt'] inline-flex items-center justify-center text-center whitespace-nowrap shrink-0">
                    {isCycle ? 'ยอดรวมประจำรอบ' : 'เป้าหมายประจำวัน'}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5 font-medium">
                  {isCycle
                    ? 'จำนวนผู้ลงทะเบียนนัดหมายรับบริการในระบบทั้งหมดตามรอบการรายงาน'
                    : 'จำนวนผู้ลงทะเบียนนัดหมายรับบริการในระบบทั้งหมดประจำวัน'}
                </div>
              </div>
            </div>
            <div className="text-right relative z-10 shrink-0">
              <div className="flex items-baseline justify-end gap-1.5">
                <span className="text-3xl font-black font-['Prompt'] text-teal-950 tracking-normal leading-none drop-shadow-2xs">
                  {formatNumber(report.queueAppointment)}
                </span>
                <span className="text-sm font-bold text-teal-700">คิว</span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1 whitespace-nowrap">
                {isCycle ? 'สถิติสะสมตามรอบการให้บริการ' : 'เป้าหมายให้บริการ 100%'}
              </div>
            </div>
          </div>
        </div>

        {/* 2. TOP HERO METRICS: Row 2 - 4 Outcome Cards */}
        <div className="grid grid-cols-4 gap-3 relative z-10 mb-5">
          {/* Card 1: ออกบัตรสำเร็จ */}
          <div className="bg-gradient-to-b from-emerald-50/70 via-white to-white rounded-2xl p-3.5 border border-emerald-300 shadow-xs relative overflow-hidden ring-1 ring-emerald-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-bold text-emerald-950 tracking-normal truncate">
                {issuedMetricInfo.title === 'ออกบัตร' ? 'ออกบัตรสำเร็จ' : issuedMetricInfo.title}
              </span>
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-xs flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black my-1 text-emerald-700 font-['Prompt'] tracking-normal flex items-baseline">
              <span>{formatNumber(effectiveCardsIssued)}</span>
              <span className="text-xs font-semibold ml-1 text-slate-500 shrink-0">{issuedMetricInfo.unit}</span>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200/90 shadow-2xs whitespace-nowrap">
                <TrendingUp className="w-3 h-3 text-emerald-600 shrink-0" />
                <span>สำเร็จ {completionRate}%</span>
              </span>
            </div>
          </div>

          {/* Card 2: ไม่มาตามนัด */}
          <div className="bg-gradient-to-b from-rose-50/70 via-white to-white rounded-2xl p-3.5 border border-rose-300 shadow-xs relative overflow-hidden ring-1 ring-rose-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-bold text-rose-950 tracking-normal truncate">
                {missedMetricInfo.title}
              </span>
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-xs flex items-center justify-center shrink-0">
                <UserX className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black my-1 text-rose-700 font-['Prompt'] tracking-normal flex items-baseline">
              <span>{formatNumber(report.missedAppointment)}</span>
              <span className="text-xs font-semibold ml-1 text-slate-500 shrink-0">{missedMetricInfo.unit}</span>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200/90 shadow-2xs whitespace-nowrap">
                <span>ขาดนัด {missedRate}%</span>
              </span>
            </div>
          </div>

          {/* Card 3: มาไม่ตรงวันนัด */}
          <div className="bg-gradient-to-b from-amber-50/70 via-white to-white rounded-2xl p-3.5 border border-amber-300 shadow-xs relative overflow-hidden ring-1 ring-amber-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-bold text-amber-950 tracking-normal truncate">
                {wrongDateMetricInfo.title === 'ไม่ตรงวันนัด' ? 'มาไม่ตรงวันนัด' : wrongDateMetricInfo.title}
              </span>
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-xs flex items-center justify-center shrink-0">
                <CalendarX className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black my-1 text-amber-700 font-['Prompt'] tracking-normal flex items-baseline">
              <span>{formatNumber(report.wrongAppointmentDate)}</span>
              <span className="text-xs font-semibold ml-1 text-slate-500 shrink-0">{wrongDateMetricInfo.unit}</span>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200/90 shadow-2xs whitespace-nowrap">
                <span>ผิดวันนัด {wrongDayRate}%</span>
              </span>
            </div>
          </div>

          {/* Card 4: บัตรเสีย (หรือชื่อที่ตั้งค่าไว้ใน Admin) */}
          <div className="bg-gradient-to-b from-slate-50/80 via-white to-white rounded-2xl p-3.5 border border-slate-300 shadow-xs relative overflow-hidden ring-1 ring-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-bold text-slate-900 tracking-normal truncate">
                {notIssuedMetricInfo.title}
              </span>
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-600 to-slate-700 text-white shadow-xs flex items-center justify-center shrink-0">
                <XCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black my-1 text-slate-800 font-['Prompt'] tracking-normal flex items-baseline">
              <span>{formatNumber(report.cardsNotIssued)}</span>
              <span className="text-xs font-semibold ml-1 text-slate-500 shrink-0">{notIssuedMetricInfo.unit}</span>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200/90 shadow-2xs whitespace-nowrap">
                <span>{notIssuedMetricInfo.title} {notIssuedRate}%</span>
              </span>
            </div>
          </div>
        </div>

        {/* 3. MAIN CONTENT: Target Groups Breakdown Card (Full Width) */}
        <div className="grid grid-cols-12 gap-5 relative z-10 flex-1 mb-5">
          {/* Target Groups Breakdown Card (Full Width 12 columns) */}
          <div
            style={{
              paddingTop: '16px',
              paddingLeft: '18px',
              paddingRight: '18px',
              paddingBottom: '16px',
            }}
            className="col-span-12 bg-white rounded-3xl border border-slate-200/90 shadow-sm flex flex-col justify-between gap-3 min-h-[465px] relative overflow-hidden"
          >
            <div>
              {/* Card Header */}
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 mb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-700 via-indigo-600 to-sky-600 text-white flex items-center justify-center shadow-xs shrink-0">
                    <Layers className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm leading-snug text-slate-900 font-['Prompt']">การออกบัตรใบอนุญาตทำงาน</h3>
                    <p className="text-[11px] mt-0.5 text-slate-500">
                      จำแนกตาม {sections.length} กลุ่มเป้าหมายและมาตรา
                    </p>
                  </div>
                </div>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50/80 text-blue-900 border border-blue-200 shadow-2xs font-['Prompt'] whitespace-nowrap shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                  <span>รวม {formatNumber(totalIssuedGroups)} คน</span>
                </div>
              </div>

              {/* รายการกลุ่มเป้าหมายทั้งหมด (ใช้ grid-cols-2 คงที่เสมอเพื่อไม่ให้ยุบเป็น 1 คอลัมน์แล้วซ้อนกันบนมือถือหรือตอนพิมพ์) */}
              <div className="grid grid-cols-2 gap-2">
                {sections.map((sec, idx) => {
                  const IconComponent = sec.icon;
                  const pct = totalIssuedGroups > 0 ? Math.round((sec.count / totalIssuedGroups) * 100) : 0;
                  const barWidth = maxSectionCount > 0 ? (sec.count / maxSectionCount) * 100 : 0;
                  const isItem1 = idx === 0;

                  return (
                    <div
                      key={sec.id}
                      className={`p-2.5 rounded-xl border flex flex-col justify-between shadow-2xs ${
                        isItem1
                          ? 'bg-gradient-to-r from-blue-100/90 via-indigo-50/90 to-sky-100/80 border-blue-400 ring-2 ring-blue-400/40 shadow-xs'
                          : 'bg-slate-50/80 border-slate-200/90'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1.5 gap-1">
                        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden pr-1">
                          <div
                            className={`w-7 h-7 rounded-lg text-white flex items-center justify-center shrink-0 shadow-2xs ${
                              isItem1
                                ? 'bg-gradient-to-tr from-blue-700 via-indigo-700 to-sky-600 ring-2 ring-blue-300'
                                : `bg-gradient-to-tr ${sec.color}`
                            }`}
                          >
                            <IconComponent className="w-4 h-4 text-white" />
                          </div>
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`font-bold block truncate text-[12px] leading-snug ${
                                  isItem1 ? 'text-blue-950 font-black' : 'text-slate-800'
                                }`}
                              >
                                {idx + 1}. {sec.title}
                              </span>
                              {isItem1 && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-gradient-to-r from-rose-600 via-orange-500 to-amber-500 text-white font-['Prompt'] shrink-0 shadow-2xs tracking-wider">
                                  <Star className="w-2.5 h-2.5 fill-amber-200 text-amber-100" />
                                  <span>HOT</span>
                                </span>
                              )}
                            </div>
                            <span
                              className={`text-[9.5px] block truncate leading-snug ${
                                isItem1 ? 'text-blue-800 font-medium' : 'text-slate-500'
                              }`}
                            >
                              {sec.desc}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 pl-1">
                          <span
                            className={`font-black text-[14px] font-['Prompt'] whitespace-nowrap ${
                              isItem1 ? 'text-blue-950' : 'text-slate-900'
                            }`}
                          >
                            {formatNumber(sec.count)}
                          </span>
                          <span
                            className={`text-[10px] font-medium shrink-0 ${
                              isItem1 ? 'text-blue-800 font-bold' : 'text-slate-500'
                            }`}
                          >
                            คน
                          </span>
                          <span
                            className={`text-[9.5px] font-bold font-mono px-1.5 py-0.5 rounded-md min-w-[32px] text-center shadow-2xs shrink-0 ${
                              isItem1
                                ? 'bg-blue-600 text-white border border-blue-700'
                                : 'bg-white text-slate-700 border border-slate-200'
                            }`}
                          >
                            {pct}%
                          </span>
                        </div>
                      </div>

                      {/* Bar Fill Meter */}
                      <div
                        className={`h-1.5 w-full rounded-full overflow-hidden ${
                          isItem1 ? 'bg-blue-200/90' : 'bg-slate-200/90'
                        }`}
                      >
                        <div
                          className={`h-full rounded-full ${
                            isItem1
                              ? 'bg-gradient-to-r from-blue-700 via-indigo-600 to-sky-500'
                              : `bg-gradient-to-r ${sec.color}`
                          }`}
                          style={{ width: `${Math.max(barWidth, sec.count > 0 ? 3 : 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Combined Summary Bar: รวมผู้รับบริการที่ออกบัตร + อัตราความสำเร็จ */}
            <div className="p-3 rounded-2xl border bg-gradient-to-r from-blue-50/90 via-slate-50 to-emerald-50/90 border-slate-200/90 shadow-2xs grid grid-cols-2 gap-4 items-center">
              {/* ฝั่งซ้าย: รวมผู้รับบริการที่ออกบัตรทั้งหมด */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-700 via-indigo-600 to-sky-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Sparkles className="w-4.5 h-4.5 text-amber-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold text-slate-700 leading-snug">
                      รวมผู้รับบริการที่ออกบัตรทั้งหมด
                    </span>
                    <span className="text-[9.5px] px-1.5 py-0.5 rounded-md font-bold bg-blue-100 text-blue-800 whitespace-nowrap shrink-0">
                      {sections.length} กลุ่มเป้าหมาย
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-0.5 flex-wrap">
                    <span className="font-black text-xl text-blue-950 font-['Prompt'] leading-tight">
                      {formatNumber(totalIssuedGroups)}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">คน</span>
                    <span className="text-[10px] text-slate-400">
                      (ออกใบอนุญาตสำเร็จ)
                    </span>
                  </div>
                </div>
              </div>

              {/* ฝั่งขวา: อัตราความสำเร็จ */}
              <div className="flex items-center justify-between pl-4 border-l border-slate-200/80 gap-2 min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold text-emerald-900 leading-snug">
                      อัตราความสำเร็จการให้บริการ
                    </span>
                    <span className="text-[9.5px] px-1.5 py-0.5 rounded-md font-bold bg-emerald-100 text-emerald-800 whitespace-nowrap shrink-0">
                      เป้าหมายคิวนัดหมาย
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-0.5 flex-wrap">
                    <span className="font-black text-xl text-emerald-700 font-['Prompt'] leading-tight">
                      {completionRate}%
                    </span>
                    <span className="text-[10px] text-slate-500 whitespace-nowrap">
                      ({formatNumber(effectiveCardsIssued)} / {formatNumber(report.queueAppointment)} คิว)
                    </span>
                  </div>
                </div>

                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-2xs">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. EXECUTIVE FOOTER & CONTACTS */}
        <div className="relative z-10 pt-4 border-t border-slate-200 flex items-center justify-between gap-3 text-xs bg-white rounded-2xl px-5 py-3 border border-slate-200 shadow-2xs">
          {/* Officer & Position */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-900 flex items-center justify-center font-bold shrink-0">
              DOE
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold flex items-center gap-1.5 text-slate-900 flex-wrap">
                <span className="truncate">
                  ผู้รายงาน: {isCycle ? 'สำนักบริหารแรงงานต่างด้าว' : (report.reporterName || '-')}
                </span>
                {!isCycle && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap shrink-0">
                    ตรวจสอบแล้ว
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                ตำแหน่ง: {isCycle ? 'กรมการจัดหางาน กระทรวงแรงงาน' : (report.reporterPosition || '-')}
              </div>
            </div>
          </div>

          {/* Contact Badges */}
          <div className="flex items-center gap-3 shrink-0">
            {(isCycle || report.phoneNumber || report.reporterName === 'สำนักบริหารแรงงานต่างด้าว') && (
              <div className="flex items-center gap-1.5 font-semibold text-rose-800 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200 whitespace-nowrap">
                <Phone className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                <span className="text-xs">
                  {isCycle || report.reporterName === 'สำนักบริหารแรงงานต่างด้าว'
                    ? '02-354-0082'
                    : report.phoneNumber}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

InfographicPoster.displayName = 'InfographicPoster';
