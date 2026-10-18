import React, { forwardRef, useMemo } from 'react';
import { DOEReport, QueueMetricCategory, ReportCategory, SystemConfig } from '../types/doe';
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
    const activeCategories = categories ? categories.filter((c) => c.isActive) : null;

    const sections = activeCategories
      ? activeCategories.map((c, idx) => {
          let count = 0;
          if (c.id === 'section59') count = report.section59 || 0;
          else if (c.id === 'section62') count = report.section62 || 0;
          else if (c.id === 'section63_1') count = report.section63_1 || 0;
          else if (c.id === 'section63_2') count = report.section63_2 || 0;
          else if (c.id === 'section64') count = report.section64 || 0;
          else if (c.id === 'mouGroup') count = report.mouGroup || report.customCategoryValues?.['mouGroup'] || 0;
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
            isPrimary: c.id === 'section59' || idx === 0,
          };
        })
      : [
          {
            id: 'sec59',
            code: 'ม.59',
            title: 'กลุ่มมาตรา 59',
            desc: 'คนต่างด้าวทำงานทั่วไป',
            count: report.section59 || 0,
            icon: BookOpen,
            color: 'from-blue-600 to-indigo-600',
            isPrimary: true,
          },
          {
            id: 'sec62',
            code: 'ม.62',
            title: 'กลุ่มมาตรา 62',
            desc: 'ผู้เชี่ยวชาญ / ช่างฝีมือ',
            count: report.section62 || 0,
            icon: FolderMinus,
            color: 'from-indigo-600 to-purple-600',
            isPrimary: false,
          },
          {
            id: 'sec63_1',
            code: 'ม.63/1',
            title: 'กลุ่มมาตรา 63/1',
            desc: 'ชนกลุ่มน้อย / ผู้มีสถานะตามกฎหมาย',
            count: report.section63_1 || 0,
            icon: Wrench,
            color: 'from-cyan-600 to-blue-600',
            isPrimary: false,
          },
          {
            id: 'sec63_2',
            code: 'ม.63/2',
            title: 'กลุ่มมาตรา 63/2',
            desc: 'กลุ่มมติ ครม. / แรงงาน 4 สัญชาติ',
            count: report.section63_2 || 0,
            icon: Users,
            color: 'from-amber-500 to-orange-500',
            isPrimary: false,
          },
          {
            id: 'sec64',
            code: 'ม.64',
            title: 'กลุ่มมาตรา 64',
            desc: 'แรงงานไป-กลับ หรือตามฤดูกาล',
            count: report.section64 || 0,
            icon: ShieldCheck,
            color: 'from-teal-600 to-emerald-600',
            isPrimary: false,
          },
          {
            id: 'secMOU',
            code: 'MOU',
            title: 'กลุ่มนำเข้าตาม MOU',
            desc: 'แรงงานต่างด้าวนำเข้าตามข้อตกลง MOU',
            count: report.mouGroup || report.customCategoryValues?.['mouGroup'] || 0,
            icon: Globe,
            color: 'from-emerald-600 to-teal-600',
            isPrimary: false,
          },
          {
            id: 'secModify',
            code: 'เปลี่ยนแปลง',
            title: 'เปลี่ยนแปลงรายการ',
            desc: 'ย้ายนายจ้าง / แก้ไขข้อมูลใบอนุญาต',
            count: report.modifyDetails || 0,
            icon: Edit3,
            color: 'from-violet-600 to-purple-600',
            isPrimary: false,
          },
          {
            id: 'secSub',
            code: 'ใบแทน',
            title: 'ใบแทนใบอนุญาตทำงาน',
            desc: 'กรณีสูญหาย / บัตรชำรุด / ขอใบแทน',
            count: report.substituteCard || 0,
            icon: CreditCard,
            color: 'from-rose-500 to-pink-600',
            isPrimary: false,
          },
        ];

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

    let cycleBadge = isCycle ? 'ประจำรอบการรายงาน' : 'ข้อมูลรายงานประจำวัน';
    let cleanDateText = rawDateStr;
    let cycleSubText = isCycle ? 'สรุปสถิติผลการดำเนินงานตามรอบ' : 'ศูนย์บริการใบอนุญาตทำงานประจำพื้นที่';

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
      cycleSubText = 'สถิติสะสมตั้งแต่วันแรกถึงปัจจุบัน';
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

    // Dynamic font size calculation for officeName to prevent awkward text wrapping when text is long
    const officeNameFontSize = useMemo(() => {
      const text = report.officeName || '';
      const len = text.trim().length;
      if (len <= 24) return 22;
      if (len <= 28) return 20;
      if (len <= 32) return 18;
      if (len <= 38) return 16;
      if (len <= 44) return 14.5;
      if (len <= 52) return 13.5;
      if (len <= 62) return 12.5;
      return 11.5;
    }, [report.officeName]);

    const officeNameEnFontSize = useMemo(() => {
      const text = report.officeNameEn || '';
      const len = text.trim().length;
      if (len <= 35) return 12;
      if (len <= 45) return 11;
      if (len <= 55) return 10;
      return 9.5;
    }, [report.officeNameEn]);

    // Center name display logic for beautiful multiline rendering when text is long or wraps
    const centerNameDisplay = useMemo(() => {
      const name = report.centerName || '';
      if (!name) {
        return { isMultiline: false, line1: '', line2: '', hasSeparator: false, fontSize: '12px', marginTop: '23px' };
      }

      // Check for Mobile Unit (หน่วยบริการเคลื่อนที่)
      if (
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
          fontSize: line2.length > 35 ? '10px' : '11px',
          marginTop: '4px',
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
          fontSize: line2Text.length > 40 ? '10px' : '11px',
          marginTop: '4px',
        };
      }

      // Check for " จังหวัด" separation if name is long
      if (name.includes(' จังหวัด') && name.length > 32) {
        const [p1, p2] = name.split(' จังหวัด');
        return {
          isMultiline: true,
          line1: p1.trim(),
          line2: `จังหวัด${p2}`.trim(),
          hasSeparator: false,
          fontSize: '11px',
          marginTop: '6px',
        };
      }

      // If text is long enough to wrap (> 34 characters)
      if (name.length > 34) {
        return {
          isMultiline: true,
          line1: name,
          line2: '',
          hasSeparator: false,
          fontSize: name.length > 50 ? '10px' : '11px',
          marginTop: '8px',
        };
      }

      // Single line standard
      return {
        isMultiline: false,
        line1: name,
        line2: '',
        hasSeparator: false,
        fontSize: '12px',
        marginTop: '23px',
      };
    }, [report.centerName]);

    return (
      <div
        ref={ref}
        id="doe-poster-capture"
        style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
        className="w-[780px] min-h-[1100px] p-8 rounded-3xl relative overflow-hidden font-sans select-none flex flex-col justify-between bg-gradient-to-br from-white via-[#f8fafc] to-[#f1f5f9] text-slate-900 border-2 border-slate-200/90 shadow-2xl"
      >
        {/* Subtle Ambient Mesh Glow */}
        <div className="absolute top-0 right-0 w-[420px] h-[420px] bg-sky-200/40 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-10 left-0 w-[400px] h-[400px] bg-teal-200/30 rounded-full blur-3xl pointer-events-none -ml-20" />
        <div className="absolute top-1/2 right-1/4 w-[300px] h-[300px] bg-amber-200/30 rounded-full blur-3xl pointer-events-none" />

        {/* 1. TOP HEADER: Clean Light Style */}
        <div className="relative z-10">
          <div className="flex items-center justify-between pb-5 border-b border-slate-200 mb-5 gap-3">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <div className="shrink-0 p-1 rounded-2xl bg-gradient-to-tr from-amber-400/20 via-sky-400/20 to-transparent border border-slate-200 shadow-xs">
                <DOELogo size={68} customLogoUrl={effectiveLogoUrl} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full bg-blue-900 text-white font-mono shadow-2xs shrink-0">
                    {systemConfig?.departmentNameEn || 'DEPARTMENT OF EMPLOYMENT'}
                  </span>
                  <span className="text-[11px] font-bold tracking-wide text-sky-800 truncate">
                    {systemConfig?.departmentNameTh || 'กรมการจัดหางาน กระทรวงแรงงาน'}
                  </span>
                </div>
                <h1
                  style={{ fontSize: `${officeNameFontSize}px`, lineHeight: 1.25 }}
                  className="font-black tracking-tight mt-1 text-[#1e3a8a] font-['Prompt'] whitespace-nowrap transition-all"
                  title={report.officeName}
                >
                  {report.officeName}
                </h1>
                <p
                  style={{ fontSize: `${officeNameEnFontSize}px` }}
                  className="font-medium tracking-wide text-slate-500 whitespace-nowrap transition-all"
                  title={report.officeNameEn}
                >
                  {report.officeNameEn}
                </p>
              </div>
            </div>

            {/* Date Chip */}
            <div className="text-right">
              <div
                className={`inline-flex items-center gap-3 px-4 py-2.5 rounded-2xl border shadow-xs transition-all ${
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
                      className={`text-[10.5px] font-extrabold tracking-wide px-2.5 py-0.5 rounded-full font-['Prompt'] ${
                        isCycle
                          ? 'bg-blue-900 text-white shadow-2xs'
                          : 'bg-blue-100/70 text-slate-600'
                      }`}
                    >
                      {cycleBadge}
                    </span>
                    {isCycle && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                    )}
                  </div>
                  <span className="text-[14.5px] font-black text-[#0f2856] font-['Prompt'] leading-snug tracking-tight whitespace-nowrap">
                    {cleanDateText}
                  </span>
                </div>
              </div>
              <div className="text-[10px] font-semibold mt-1 text-slate-500 flex items-center justify-end gap-1.5">
                {isCycle ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                    <span>{cycleSubText}</span>
                  </>
                ) : (
                  <span>ศูนย์บริการใบอนุญาตทำงานประจำพื้นที่</span>
                )}
              </div>
            </div>
          </div>

          {/* Banner Title Box */}
          <div className="relative rounded-2xl p-[1px] bg-gradient-to-r from-blue-600 via-indigo-600 to-teal-500 shadow-xs mb-5">
            <div className="rounded-[15px] px-5 py-3 flex items-center justify-between bg-white">
              <div className="min-w-0 pr-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-sky-50 via-indigo-50/70 to-blue-50/80 border border-sky-200/90 text-sky-950 shadow-xs ring-1 ring-sky-100/70 font-['Prompt'] transition-all"
                  >
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-60" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-600" />
                    </span>
                    <span
                      style={{
                        fontSize:
                          (systemConfig?.reportSubtitle?.length || 0) > 45
                            ? '10px'
                            : (systemConfig?.reportSubtitle?.length || 0) > 30
                            ? '10.5px'
                            : '11.5px',
                      }}
                      className="font-extrabold tracking-wide text-[#0f2856] whitespace-nowrap leading-normal"
                    >
                      {systemConfig?.reportSubtitle ||
                        (isCycle
                          ? 'รายงานสรุปผลการดำเนินงานประจำรอบ'
                          : 'EXECUTIVE SUMMARY REPORT • เรียน อธิบดี / ผู้บริหาร')}
                    </span>
                  </span>
                  {isCycle && (
                    <span className="text-[11px] font-black text-blue-900 bg-blue-100/90 px-2.5 py-0.5 rounded-md border border-blue-300 shadow-2xs font-['Prompt'] inline-flex items-center justify-center text-center">
                      {cycleBadge}
                    </span>
                  )}
                </div>
                <h2 className="text-[17.5px] font-black mt-1.5 tracking-tight text-[#0f2856] font-['Prompt'] leading-snug">
                  {systemConfig?.reportTitle ||
                    'รายงานผลการปฏิบัติงานศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว'}
                </h2>
              </div>
              <div className="text-right shrink-0 flex flex-col items-end justify-center max-w-[340px]">
                <span
                  style={{
                    fontSize: centerNameDisplay.fontSize,
                    marginTop: centerNameDisplay.marginTop,
                    lineHeight: centerNameDisplay.isMultiline ? '1.3' : '1.25',
                  }}
                  className={`font-bold pl-[12px] pr-[13px] -ml-[12px] mr-[1px] rounded-lg border bg-gradient-to-b from-blue-50/95 to-blue-100/60 border-blue-200/90 text-blue-900 shadow-2xs max-w-full text-right transition-all ${
                    centerNameDisplay.isMultiline
                      ? 'py-[5px] inline-flex flex-col items-end'
                      : 'py-[6px] inline-block'
                  }`}
                  title={report.centerName}
                >
                  {centerNameDisplay.isMultiline && centerNameDisplay.line2 ? (
                    <>
                      <span className="font-bold tracking-tight text-blue-950 block leading-tight">
                        {centerNameDisplay.line1}
                      </span>
                      <span className="font-bold text-[11px] text-blue-900 mt-1 flex items-center justify-end gap-1 leading-tight bg-blue-100/60 px-1.5 py-0.5 rounded-md border border-blue-200/50">
                        {centerNameDisplay.hasSeparator && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                        )}
                        <span className="truncate max-w-[310px]">{centerNameDisplay.line2}</span>
                      </span>
                    </>
                  ) : (
                    <span>{report.centerName}</span>
                  )}
                </span>
                {isCycle && (
                  <span className="text-[10px] font-semibold text-slate-500 mt-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>สถิติประมวลผลประจำรอบ</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 2. TOP HERO METRICS: Row 1 - คิวนัดหมายทั้งหมด (บรรทัดเดิม) */}
        <div className="relative z-10 mb-3.5">
          <div className="bg-gradient-to-r from-teal-50/80 via-white to-teal-50/40 rounded-2xl p-4 border border-teal-200/90 shadow-sm relative overflow-hidden flex items-center justify-between">
            <div className="absolute right-0 top-0 bottom-0 w-44 bg-gradient-to-l from-teal-100/30 to-transparent pointer-events-none" />
            <div className="flex items-center gap-3.5 relative z-10">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-600 to-teal-700 text-white flex items-center justify-center shrink-0 shadow-sm ring-4 ring-teal-100/70">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-slate-800 tracking-tight">
                    {isCycle ? 'ยอดคิวนัดหมายประจำรอบ' : 'คิวนัดหมายทั้งหมด'}
                  </span>
                  <span
                    style={{ width: '115.979px' }}
                    className="text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-teal-100 text-teal-800 border border-teal-300/80 shadow-2xs font-['Prompt'] inline-flex items-center justify-center text-center"
                  >
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
            <div className="text-right relative z-10">
              <div className="flex items-baseline justify-end gap-1.5">
                <span className="text-3xl font-black font-['Prompt'] text-teal-950 tracking-tight leading-none drop-shadow-2xs">
                  {formatNumber(report.queueAppointment)}
                </span>
                <span className="text-sm font-bold text-teal-700">คิว</span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1">
                {isCycle ? 'สถิติสะสมตามรอบการให้บริการ' : 'เป้าหมายให้บริการ 100%'}
              </div>
            </div>
          </div>
        </div>

        {/* 2. TOP HERO METRICS: Row 2 - 4 Outcome Cards */}
        <div className="grid grid-cols-4 gap-3 relative z-10 mb-5">
          {/* Card 1: ออกบัตรสำเร็จ */}
          <div className="bg-gradient-to-b from-emerald-50/70 via-white to-white rounded-2xl p-3.5 border border-emerald-300 shadow-xs relative overflow-hidden ring-1 ring-emerald-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-950 tracking-tight">
                {issuedMetricInfo.title === 'ออกบัตร' ? 'ออกบัตรสำเร็จ' : issuedMetricInfo.title}
              </span>
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-xs flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black my-1 text-emerald-700 font-['Prompt'] tracking-tight flex items-baseline">
              {formatNumber(effectiveCardsIssued)}
              <span className="text-xs font-semibold ml-1 text-slate-500">{issuedMetricInfo.unit}</span>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200/90 shadow-2xs">
                <TrendingUp className="w-3 h-3 text-emerald-600" />
                <span>สำเร็จ {completionRate}%</span>
              </span>
            </div>
          </div>

          {/* Card 2: ไม่มาตามนัด */}
          <div className="bg-gradient-to-b from-rose-50/70 via-white to-white rounded-2xl p-3.5 border border-rose-300 shadow-xs relative overflow-hidden ring-1 ring-rose-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-950 tracking-tight">
                {missedMetricInfo.title}
              </span>
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-xs flex items-center justify-center">
                <UserX className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black my-1 text-rose-700 font-['Prompt'] tracking-tight flex items-baseline">
              {formatNumber(report.missedAppointment)}
              <span className="text-xs font-semibold ml-1 text-slate-500">{missedMetricInfo.unit}</span>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200/90 shadow-2xs">
                <span>ขาดนัด {missedRate}%</span>
              </span>
            </div>
          </div>

          {/* Card 3: มาไม่ตรงวันนัด */}
          <div className="bg-gradient-to-b from-amber-50/70 via-white to-white rounded-2xl p-3.5 border border-amber-300 shadow-xs relative overflow-hidden ring-1 ring-amber-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-950 tracking-tight">
                {wrongDateMetricInfo.title === 'ไม่ตรงวันนัด' ? 'มาไม่ตรงวันนัด' : wrongDateMetricInfo.title}
              </span>
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-xs flex items-center justify-center">
                <CalendarX className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black my-1 text-amber-700 font-['Prompt'] tracking-tight flex items-baseline">
              {formatNumber(report.wrongAppointmentDate)}
              <span className="text-xs font-semibold ml-1 text-slate-500">{wrongDateMetricInfo.unit}</span>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200/90 shadow-2xs">
                <span>ผิดวันนัด {wrongDayRate}%</span>
              </span>
            </div>
          </div>

          {/* Card 4: บัตรเสีย (หรือชื่อที่ตั้งค่าไว้ใน Admin) */}
          <div className="bg-gradient-to-b from-slate-50/80 via-white to-white rounded-2xl p-3.5 border border-slate-300 shadow-xs relative overflow-hidden ring-1 ring-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 tracking-tight">
                {notIssuedMetricInfo.title}
              </span>
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-600 to-slate-700 text-white shadow-xs flex items-center justify-center">
                <XCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black my-1 text-slate-800 font-['Prompt'] tracking-tight flex items-baseline">
              {formatNumber(report.cardsNotIssued)}
              <span className="text-xs font-semibold ml-1 text-slate-500">{notIssuedMetricInfo.unit}</span>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200/90 shadow-2xs">
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
              height: '477.5px',
              marginLeft: '0px',
              marginTop: '0px',
            }}
            className="col-span-12 bg-white rounded-3xl p-4.5 border border-slate-200/90 shadow-sm flex flex-col justify-between relative overflow-hidden"
          >
            <div>
              {/* Card Header */}
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 mb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-700 via-indigo-600 to-sky-600 text-white flex items-center justify-center shadow-xs">
                    <Layers className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm leading-none text-slate-900 font-['Prompt']">การออกบัตรใบอนุญาตทำงาน</h3>
                    <p className="text-[11px] mt-0.5 text-slate-500">
                      จำแนกตาม {sections.length} กลุ่มเป้าหมายและมาตรา
                    </p>
                  </div>
                </div>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50/80 text-blue-900 border border-blue-200 shadow-2xs font-['Prompt']">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                  <span>รวม {formatNumber(totalIssuedGroups)} คน</span>
                </div>
              </div>

              {/* รายการกลุ่มเป้าหมายทั้งหมด เรียงตามลำดับเดิม โดยเน้นสีพื้นหลังข้อ 1 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sections.map((sec, idx) => {
                  const IconComponent = sec.icon;
                  const pct = totalIssuedGroups > 0 ? Math.round((sec.count / totalIssuedGroups) * 100) : 0;
                  const barWidth = maxSectionCount > 0 ? (sec.count / maxSectionCount) * 100 : 0;
                  const isItem1 = idx === 0;

                  return (
                    <div
                      key={sec.id}
                      className={`p-2.5 rounded-xl transition-all border flex flex-col justify-between shadow-2xs ${
                        isItem1
                          ? 'bg-gradient-to-r from-blue-100/90 via-indigo-50/90 to-sky-100/80 border-blue-400 ring-2 ring-blue-400/40 shadow-xs'
                          : 'bg-slate-50/80 hover:bg-white border-slate-200/90'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-lg text-white flex items-center justify-center shrink-0 shadow-2xs ${
                              isItem1
                                ? 'bg-gradient-to-tr from-blue-700 via-indigo-700 to-sky-600 ring-2 ring-blue-300'
                                : `bg-gradient-to-tr ${sec.color}`
                            }`}
                          >
                            <IconComponent className="w-4 h-4 text-white" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`font-bold block truncate text-[12px] leading-tight ${
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
                              className={`text-[9.5px] block truncate leading-tight ${
                                isItem1 ? 'text-blue-800 font-medium' : 'text-slate-500'
                              }`}
                            >
                              {sec.desc}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 pl-1">
                          <span
                            className={`font-black text-[14px] font-['Prompt'] ${
                              isItem1 ? 'text-blue-950' : 'text-slate-900'
                            }`}
                          >
                            {formatNumber(sec.count)}
                          </span>
                          <span
                            className={`text-[10px] font-medium ${
                              isItem1 ? 'text-blue-800 font-bold' : 'text-slate-500'
                            }`}
                          >
                            คน
                          </span>
                          <span
                            className={`text-[9.5px] font-bold font-mono px-1.5 py-0.5 rounded-md min-w-[32px] text-center shadow-2xs ${
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
                          className={`h-full rounded-full transition-all duration-300 ${
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
            <div className="mt-2.5 p-3 rounded-2xl border bg-gradient-to-r from-blue-50/90 via-slate-50 to-emerald-50/90 border-slate-200/90 shadow-2xs grid grid-cols-2 gap-4 items-center">
              {/* ฝั่งซ้าย: รวมผู้รับบริการที่ออกบัตรทั้งหมด */}
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-700 via-indigo-600 to-sky-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Sparkles className="w-4.5 h-4.5 text-amber-300" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-700 block leading-tight">
                      รวมผู้รับบริการที่ออกบัตรทั้งหมด
                    </span>
                    <span className="text-[9.5px] px-1.5 py-0.2 rounded-md font-bold bg-blue-100 text-blue-800">
                      {sections.length} กลุ่มเป้าหมาย
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="font-black text-xl text-blue-950 font-['Prompt'] leading-tight">
                      {formatNumber(totalIssuedGroups)}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">คน</span>
                    <span className="text-[10px] text-slate-400 ml-1">
                      (ออกใบอนุญาตสำเร็จ)
                    </span>
                  </div>
                </div>
              </div>

              {/* ฝั่งขวา: อัตราความสำเร็จ */}
              <div className="flex items-center justify-between pl-4 border-l border-slate-200/80">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-emerald-900 block leading-tight">
                      อัตราความสำเร็จการให้บริการ
                    </span>
                    <span className="text-[9.5px] px-1.5 py-0.2 rounded-md font-bold bg-emerald-100 text-emerald-800">
                      เป้าหมายคิวนัดหมาย
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="font-black text-xl text-emerald-700 font-['Prompt'] leading-tight">
                      {completionRate}%
                    </span>
                    <span className="text-[10px] text-slate-500">
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
        <div className="relative z-10 pt-4 border-t border-slate-200 flex items-center justify-between text-xs bg-white rounded-2xl px-5 py-3 border border-slate-200 shadow-2xs">
          {/* Officer & Position */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-900 flex items-center justify-center font-bold">
              DOE
            </div>
            <div>
              <div className="font-bold flex items-center gap-1.5 text-slate-900">
                <span>
                  ผู้รายงาน: {isCycle ? 'สำนักบริหารแรงงานต่างด้าว' : (report.reporterName || '-')}
                </span>
                {!isCycle && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300">
                    ตรวจสอบแล้ว
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500">
                ตำแหน่ง: {isCycle ? 'กรมการจัดหางาน กระทรวงแรงงาน' : (report.reporterPosition || '-')}
              </div>
            </div>
          </div>

          {/* Contact Badges */}
          <div className="flex items-center gap-3">
            {(isCycle || report.phoneNumber || report.reporterName === 'สำนักบริหารแรงงานต่างด้าว') && (
              <div className="flex items-center gap-1.5 font-semibold text-rose-800 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200">
                <Phone className="w-3.5 h-3.5 text-rose-700" />
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
