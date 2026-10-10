import React, { forwardRef } from 'react';
import { DOEReport, ReportCategory, SystemConfig } from '../types/doe';
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
} from 'lucide-react';

interface InfographicPosterProps {
  report: DOEReport;
  scale?: number;
  categories?: ReportCategory[];
  systemConfig?: SystemConfig;
  customLogoUrl?: string | null;
}

export const InfographicPoster = forwardRef<HTMLDivElement, InfographicPosterProps>(
  ({ report, scale = 1, categories, systemConfig, customLogoUrl }, ref) => {
    // Determine active sections list
    const activeCategories = categories ? categories.filter((c) => c.isActive) : null;

    const sections = activeCategories
      ? activeCategories.map((c, idx) => {
          let count = 0;
          if (c.id === 'section59') count = report.section59;
          else if (c.id === 'section62') count = report.section62;
          else if (c.id === 'section63_1') count = report.section63_1;
          else if (c.id === 'section63_2') count = report.section63_2;
          else if (c.id === 'section64') count = report.section64;
          else if (c.id === 'modifyDetails') count = report.modifyDetails;
          else if (c.id === 'substituteCard') count = report.substituteCard;
          else count = report.customCategoryValues?.[c.id] || 0;

          let icon = BookOpen;
          if (c.id === 'section62') icon = FolderMinus;
          else if (c.id === 'section63_1') icon = Wrench;
          else if (c.id === 'section63_2') icon = Users;
          else if (c.id === 'section64') icon = ShieldCheck;
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
            isPrimary: c.id === 'section63_2',
          };
        })
      : [
          {
            id: 'sec59',
            code: 'ม.59',
            title: 'กลุ่มมาตรา 59',
            desc: 'คนต่างด้าวทำงานทั่วไป',
            count: report.section59,
            icon: BookOpen,
            color: 'from-blue-600 to-indigo-600',
            isPrimary: false,
          },
          {
            id: 'sec62',
            code: 'ม.62',
            title: 'กลุ่มมาตรา 62',
            desc: 'ผู้เชี่ยวชาญ / ช่างฝีมือ',
            count: report.section62,
            icon: FolderMinus,
            color: 'from-indigo-600 to-purple-600',
            isPrimary: false,
          },
          {
            id: 'sec63_1',
            code: 'ม.63/1',
            title: 'กลุ่มมาตรา 63/1',
            desc: 'ชนกลุ่มน้อย / ผู้มีสถานะตามกฎหมาย',
            count: report.section63_1,
            icon: Wrench,
            color: 'from-cyan-600 to-blue-600',
            isPrimary: false,
          },
          {
            id: 'sec63_2',
            code: 'ม.63/2',
            title: 'กลุ่มมาตรา 63/2',
            desc: 'กลุ่มมติ ครม. / แรงงาน 4 สัญชาติ',
            count: report.section63_2,
            icon: Users,
            color: 'from-amber-500 to-orange-500',
            isPrimary: true,
          },
          {
            id: 'sec64',
            code: 'ม.64',
            title: 'กลุ่มมาตรา 64',
            desc: 'แรงงานไป-กลับ หรือตามฤดูกาล',
            count: report.section64,
            icon: ShieldCheck,
            color: 'from-teal-600 to-emerald-600',
            isPrimary: false,
          },
          {
            id: 'secModify',
            code: 'เปลี่ยนแปลง',
            title: 'เปลี่ยนแปลงรายการ',
            desc: 'ย้ายนายจ้าง / แก้ไขข้อมูลใบอนุญาต',
            count: report.modifyDetails,
            icon: Edit3,
            color: 'from-violet-600 to-purple-600',
            isPrimary: false,
          },
          {
            id: 'secSub',
            code: 'ใบแทน',
            title: 'ใบแทนใบอนุญาตทำงาน',
            desc: 'กรณีสูญหาย / บัตรชำรุด / ขอใบแทน',
            count: report.substituteCard,
            icon: CreditCard,
            color: 'from-rose-500 to-pink-600',
            isPrimary: false,
          },
        ];

    const totalIssuedGroups = sections.reduce((acc, s) => acc + s.count, 0);

    const completionRate =
      report.queueAppointment > 0
        ? Math.min(100, Math.round((report.cardsIssued / report.queueAppointment) * 100))
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
          <div className="flex items-center justify-between pb-5 border-b border-slate-200 mb-5">
            <div className="flex items-center gap-4">
              <div className="shrink-0 p-1 rounded-2xl bg-gradient-to-tr from-amber-400/20 via-sky-400/20 to-transparent border border-slate-200 shadow-xs">
                <DOELogo size={68} customLogoUrl={effectiveLogoUrl} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full bg-blue-900 text-white font-mono shadow-2xs">
                    {systemConfig?.departmentNameEn || 'DEPARTMENT OF EMPLOYMENT'}
                  </span>
                  <span className="text-[11px] font-bold tracking-wide text-sky-800">
                    {systemConfig?.departmentNameTh || 'กรมการจัดหางาน กระทรวงแรงงาน'}
                  </span>
                </div>
                <h1 className="text-[22px] font-black tracking-tight leading-tight mt-1 text-[#1e3a8a] font-['Prompt']">
                  {report.officeName}
                </h1>
                <p className="text-[12px] font-medium tracking-wide text-slate-500">
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
                    style={{ width: '400.667px' }}
                    className="text-[11px] font-extrabold uppercase tracking-wide text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200 inline-flex items-center gap-1.5 shadow-2xs font-['Prompt']"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    <span style={{ width: '329px' }}>
                      {systemConfig?.reportSubtitle ||
                        (isCycle
                          ? 'รายงานสรุปผลการดำเนินงานประจำรอบ'
                          : 'EXECUTIVE SUMMARY REPORT • เรียน อธิบดี / ผู้บริหาร')}
                    </span>
                  </span>
                  {isCycle && (
                    <span
                      style={{ width: '97.4375px' }}
                      className="text-[11px] font-black text-blue-900 bg-blue-100/90 px-2.5 py-0.5 rounded-md border border-blue-300 shadow-2xs font-['Prompt'] inline-flex items-center justify-center text-center"
                    >
                      {cycleBadge}
                    </span>
                  )}
                </div>
                <h2 className="text-[17.5px] font-black mt-1.5 tracking-tight text-[#0f2856] font-['Prompt'] leading-snug">
                  {systemConfig?.reportTitle ||
                    'รายงานผลการปฏิบัติงานศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว'}
                </h2>
              </div>
              <div className="text-right shrink-0 flex flex-col items-end justify-center">
                <span className="text-xs font-bold px-3 py-1 rounded-lg border bg-blue-50 border-blue-200 text-blue-900 shadow-2xs">
                  {report.centerName}
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

        {/* 2. TOP HERO METRICS: Row 2 - 4 Outcome Cards (ออกบัตรสำเร็จ / ไม่มาตามนัด / มาไม่ตรงวันนัด / ไม่ออกบัตร) */}
        <div className="grid grid-cols-4 gap-3 relative z-10 mb-5">
          {/* Card 1: ออกบัตรสำเร็จ */}
          <div className="bg-gradient-to-b from-emerald-50/70 via-white to-white rounded-2xl p-3.5 border border-emerald-300 shadow-xs relative overflow-hidden ring-1 ring-emerald-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-950 tracking-tight">
                ออกบัตรสำเร็จ
              </span>
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-xs flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black my-1 text-emerald-700 font-['Prompt'] tracking-tight flex items-baseline">
              {formatNumber(report.cardsIssued)}
              <span className="text-xs font-semibold ml-1 text-slate-500">ใบ</span>
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
                ไม่มาตามนัด
              </span>
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-xs flex items-center justify-center">
                <UserX className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black my-1 text-rose-700 font-['Prompt'] tracking-tight flex items-baseline">
              {formatNumber(report.missedAppointment)}
              <span className="text-xs font-semibold ml-1 text-slate-500">คน</span>
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
                มาไม่ตรงวันนัด
              </span>
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-xs flex items-center justify-center">
                <CalendarX className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black my-1 text-amber-700 font-['Prompt'] tracking-tight flex items-baseline">
              {formatNumber(report.wrongAppointmentDate)}
              <span className="text-xs font-semibold ml-1 text-slate-500">คน</span>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200/90 shadow-2xs">
                <span>ผิดวันนัด {wrongDayRate}%</span>
              </span>
            </div>
          </div>

          {/* Card 4: ไม่ออกบัตร */}
          <div className="bg-gradient-to-b from-slate-50/80 via-white to-white rounded-2xl p-3.5 border border-slate-300 shadow-xs relative overflow-hidden ring-1 ring-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 tracking-tight">
                ไม่ออกบัตร
              </span>
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-600 to-slate-700 text-white shadow-xs flex items-center justify-center">
                <XCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black my-1 text-slate-800 font-['Prompt'] tracking-tight flex items-baseline">
              {formatNumber(report.cardsNotIssued)}
              <span className="text-xs font-semibold ml-1 text-slate-500">คน</span>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200/90 shadow-2xs">
                <span>ไม่อนุมัติ {notIssuedRate}%</span>
              </span>
            </div>
          </div>
        </div>

        {/* 3. MAIN CONTENT: Target Groups Breakdown Card (Full Width) */}
        <div className="grid grid-cols-12 gap-5 relative z-10 flex-1 mb-5">
          {/* Target Groups Breakdown Card (Full Width 12 columns) */}
          <div
            style={{
              paddingTop: '20px',
              paddingLeft: '17px',
              height: '477.5px',
              marginLeft: '0px',
              marginTop: '0px',
            }}
            className="col-span-12 bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm leading-none text-slate-900">การออกบัตรใบอนุญาตทำงาน</h3>
                    <p className="text-[11px] mt-0.5 text-slate-500">
                      จำแนกตาม {sections.length} กลุ่มเป้าหมายและมาตรา
                    </p>
                  </div>
                </div>
                <div className="text-xs font-bold px-2.5 py-1 rounded-xl bg-blue-50 text-blue-900 border border-blue-200">
                  รวม {formatNumber(totalIssuedGroups)} คน
                </div>
              </div>

              {/* 7 Section Items with Progress Bars in 2 columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {sections.map((sec, idx) => {
                  const IconComponent = sec.icon;
                  const pct = totalIssuedGroups > 0 ? Math.round((sec.count / totalIssuedGroups) * 100) : 0;
                  const barWidth = maxSectionCount > 0 ? (sec.count / maxSectionCount) * 100 : 0;

                  return (
                    <div
                      key={sec.id}
                      className={`p-2.5 rounded-2xl transition-all border ${
                        sec.isPrimary
                          ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-200'
                          : 'bg-slate-50/80 border-slate-200 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-6 h-6 rounded-lg bg-gradient-to-tr ${sec.color} text-white flex items-center justify-center shrink-0 shadow-2xs`}>
                            <IconComponent className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold block truncate text-slate-800">
                              {idx + 1}. {sec.title}
                            </span>
                            <span className="text-[10px] block truncate text-slate-500">
                              {sec.desc}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`font-black text-sm font-['Prompt'] ${sec.isPrimary ? 'text-amber-800' : 'text-slate-900'}`}>
                            {formatNumber(sec.count)}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            คน
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md min-w-[34px] text-center bg-white text-slate-700 border border-slate-200">
                            {pct}%
                          </span>
                        </div>
                      </div>

                      {/* Bar Fill Meter */}
                      <div className="h-1.5 w-full rounded-full overflow-hidden bg-slate-200">
                        <div
                          className={`h-full bg-gradient-to-r ${sec.color} rounded-full transition-all duration-300`}
                          style={{ width: `${Math.max(barWidth, sec.count > 0 ? 3 : 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Combined Summary Bar: รวมผู้รับบริการที่ออกบัตร + อัตราความสำเร็จ */}
            <div className="mt-3.5 p-3.5 rounded-2xl border bg-gradient-to-r from-blue-50/80 via-slate-50 to-emerald-50/80 border-slate-200/90 shadow-2xs grid grid-cols-2 gap-4 items-center">
              {/* ฝั่งซ้าย: รวมผู้รับบริการที่ออกบัตรทั้งหมด */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 shadow-2xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-700 block leading-tight">
                      รวมผู้รับบริการที่ออกบัตรทั้งหมด
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-md font-semibold bg-blue-100/70 text-blue-800">
                      7 กลุ่มเป้าหมาย
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
                    <span className="text-[10px] px-1.5 py-0.2 rounded-md font-semibold bg-emerald-100 text-emerald-800">
                      เป้าหมายคิวนัดหมาย
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="font-black text-xl text-emerald-700 font-['Prompt'] leading-tight">
                      {completionRate}%
                    </span>
                    <span className="text-[10px] text-slate-500">
                      ({formatNumber(report.cardsIssued)} / {formatNumber(report.queueAppointment)} คิว)
                    </span>
                  </div>
                </div>

                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-2xs">
                  <CheckCircle2 className="w-5 h-5" />
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
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300">
                  {isCycle ? 'ประมวลผลส่วนกลาง' : 'ตรวจสอบแล้ว'}
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                ตำแหน่ง: {isCycle ? 'กรมการจัดหางาน กระทรวงแรงงาน' : (report.reporterPosition || '-')}
              </div>
            </div>
          </div>

          {/* Contact Badges */}
          <div className="flex items-center gap-3">
            {(isCycle || report.phoneNumber) && (
              <div className="flex items-center gap-1.5 font-semibold text-rose-800 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200">
                <Phone className="w-3.5 h-3.5 text-rose-700" />
                <span className="text-xs">{isCycle ? '02-354-0082' : report.phoneNumber}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

InfographicPoster.displayName = 'InfographicPoster';
