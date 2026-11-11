import React, { useMemo, useRef, useState } from 'react';
import { DOEReport, EmploymentOffice, ReportCategory } from '../types/doe';
import { EMPLOYMENT_OFFICES } from '../data/offices';
import { DEFAULT_CATEGORIES } from '../data/initialAdminData';
import { calculateReportTotalSections } from '../utils/doeUtils';
import {
  formatNumber,
  formatThaiDateFull,
  formatThaiDateRange,
  formatThaiDateShort,
} from '../utils/thaiDate';
import {
  downloadExecutiveExcelReport,
  downloadExecutivePdfReport,
} from '../utils/executiveExport';
import {
  BarChart3,
  Download,
  Printer,
  Award,
  AlertTriangle,
  CalendarRange,
  Filter,
  Eye,
  TrendingUp,
  TrendingDown,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

interface ExecutiveInsightsViewProps {
  reports: DOEReport[];
  offices?: EmploymentOffice[];
  categories?: ReportCategory[];
  onSelectReportPoster?: (report: DOEReport) => void;
}

type TrendRangeOption = 7 | 14 | 30 | 90;
type WatchTab = 'top_volume' | 'high_missed' | 'card_defect';

const THAI_MONTHS_FULL = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

function isMobileOnly(centerName?: string): boolean {
  const c = (centerName || '').toLowerCase();
  return c.includes('mobile unit') || c.includes('เคลื่อนที่');
}

function isSpecialCenter(centerName?: string, region?: string): boolean {
  const raw = (centerName || '').trim();
  if (isMobileOnly(raw)) return false;
  return (
    region === 'เฉพาะกิจ' ||
    raw.includes('เฉพาะกิจ') ||
    raw.includes('วัดป้อมวิเชียร') ||
    raw.includes('ราชพฤกษ์')
  );
}

interface PrioritizedIssueItem {
  key: string;
  report: DOEReport;
  officeName: string;
  centerName: string;
  latestDate: string;
  repeatDays: number;
  categoryCode: 'integrity' | 'system' | 'eligibility' | 'disaster' | 'queue';
  categoryLabel: string;
  cleanedNote: string;
  priorityScore: number;
}

const INTEGRITY_KEYWORDS = [
  'ติดสินบน',
  'เรียกรับเงิน',
  'ลัดคิว',
  'นายหน้า',
  'แอบอ้าง',
  'ทุจริต',
  'ปลอม',
  'สวมสิทธิ์',
  'ก่อกวน',
  'ทะเลาะวิวาท',
];

const SYSTEM_KEYWORDS = [
  'ระบบล่ม',
  'ระบบค้าง',
  'ค้างหน้า',
  'เด้งออก',
  'preview ไม่ขึ้น',
  'คอมพิวเตอร์ดับ',
  'ไฟตก',
  'ไฟดับ',
  'เครื่องสำรองไฟ',
  'เครื่องผลิตบัตร',
  'เครื่องพิมพ์',
  'ปริ้นเตอร์',
  'ริบบอน',
  'สแกนนิ้ว',
  'สแกนใบหน้า',
  'สแกนตู้คิว',
  'ยิงใบนัดหมายไม่ได้',
  'ไม่อ่านข้อมูล',
  'helpdesk',
  'ticket',
  're-print',
  'reprint',
  'บัตรเสีย',
  'บัตรติด',
  'อินเทอร์เน็ต',
  'เครือข่าย',
  'สัญญาณ',
  'ชำรุด',
  'ขัดข้อง',
  'ระบบแจ้งว่า',
];

const ELIGIBILITY_KEYWORDS = [
  'ไม่สามารถออกบัตรได้',
  'ไม่สามารถถ่ายบัตรได้',
  'ไม่อนุญาตให้ออกบัตร',
  'ไม่อนุญาตให้ตรวจอัตลักษณ์',
  'ซ้ำซ้อน',
  'มิใช่ภาพถ่ายของตนเอง',
  'รูปภาพผิด',
  'ไม่ตรงกับแรงงาน',
  'ไม่ตรงกับผู้ใช้บริการ',
  'ไม่พบรูป',
  'ไม่ปรากฎรูป',
  'คลาดเคลื่อน',
  'ต่ำกว่า 18',
  'ไม่ถึง 18',
  'อายุ 15',
  'อายุ 16',
  'อายุ 17',
  'ไม่ตรงกับ บต',
  'ไม่ตรงกัน',
  'ยกเลิกคิว',
];

const DISASTER_KEYWORDS = [
  'น้ำท่วม',
  'อุทกภัย',
  'ภัยพิบัติ',
  'ศูนย์ปิด',
  'ปิดให้บริการ',
  'ไม่ตรงกับแผนกำหนดการ',
];

const QUEUE_ISSUE_KEYWORDS = [
  'ไม่ตรงวัน',
  'ไม่ตรงตามที่นัด',
  'ไม่ตรงศูนย์',
  'นอกพื้นที่',
  'วีซ่าใกล้',
  'ไม่ได้ออกบัตร',
  'ปัญหา',
  'อุปสรรค',
  'ข้อติดขัด',
  'ติดขัด',
  'ยังไม่ได้กดคิว',
  'ไม่สามารถให้ข้อมูล',
];

function evaluateReportIssue(report: DOEReport): Omit<PrioritizedIssueItem, 'key' | 'repeatDays'> | null {
  const rawNote = (report.notes || '').trim();
  if (!rawNote) return null;
  if (/^[-–—.\s]*$/.test(rawNote)) return null;
  if (/^(ไม่มี|ปกติ|เรียบร้อย|ไม่มีปัญหา|ไม่มีข้อขัดข้อง|ไม่มีข้อติดขัด)[\s.]*$/i.test(rawNote)) {
    return null;
  }

  const lines = rawNote
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const meaningfulLines = lines.filter((line) => {
    const stripped = line.replace(/^[0-9]+[.)\s-]*/, '').trim();
    const isPureRoutine =
      /^(การให้บริการ|การปฏิบัติงาน|การปฎิบัติงาน|การบริการ|เริ่มปฏิบัติงาน).*?(เป็นไปด้วยความ(สงบ)?เรียบร้อย|เรียบร้อยดี)(\s*(ดี|ปกติ|ไม่มีข้อติดขัด|ไม่ติดขัด|ไม่มีติดขัด|ไม่มีข้อขัดข้อง|ไม่มีปัญหา))?[.\s]*$/i.test(
        stripped
      ) ||
      /^(เป็นไปด้วยความ(สงบ)?เรียบร้อย|การให้บริการเรียบร้อยดี|ปกติ|ไม่มีข้อติดขัด|ไม่ติดขัด|ไม่มีข้อขัดข้อง)[.\s]*$/i.test(
        stripped
      );
    return !isPureRoutine;
  });

  if (meaningfulLines.length === 0) return null;

  const cleanedNote = meaningfulLines.join('\n');
  // Strip negated routine phrases before matching general words like "ติดขัด" / "ขัดข้อง" / "ปัญหา"
  const sanitizedForMatch = cleanedNote
    .toLowerCase()
    .replace(/ไม่มีข้อติดขัด|ไม่ติดขัด|ไม่มีติดขัด|ไม่มีข้อขัดข้อง|ไม่มีปัญหา|ไม่มีอุปสรรค/g, ' ');

  const hitIntegrity = INTEGRITY_KEYWORDS.filter((k) => sanitizedForMatch.includes(k));
  const hitSystem = SYSTEM_KEYWORDS.filter((k) => sanitizedForMatch.includes(k));
  const hitEligibility = ELIGIBILITY_KEYWORDS.filter((k) => sanitizedForMatch.includes(k));
  const hitDisaster = DISASTER_KEYWORDS.filter((k) => sanitizedForMatch.includes(k));
  const hitQueue = QUEUE_ISSUE_KEYWORDS.filter((k) => sanitizedForMatch.includes(k));

  const matchedGroupCount = [
    hitIntegrity.length > 0,
    hitSystem.length > 0,
    hitEligibility.length > 0,
    hitDisaster.length > 0,
    hitQueue.length > 0,
  ].filter(Boolean).length;

  if (matchedGroupCount === 0) return null;

  let categoryCode: PrioritizedIssueItem['categoryCode'] = 'queue';
  let categoryLabel = 'ข้อติดขัดการนัดหมาย / หน้างาน';
  let baseScore = 22;

  if (hitIntegrity.length > 0) {
    categoryCode = 'integrity';
    categoryLabel = 'ความโปร่งใส / ความเรียบร้อยในศูนย์';
    baseScore = 68;
  } else if (hitSystem.length > 0) {
    categoryCode = 'system';
    categoryLabel = 'ปัญหาระบบ / อุปกรณ์ผลิตบัตร / ไฟฟ้า';
    baseScore = 56 + Math.min(12, (hitSystem.length - 1) * 4);
  } else if (hitEligibility.length > 0) {
    categoryCode = 'eligibility';
    categoryLabel = 'ข้อมูลคำขอ / เอกสาร / คุณสมบัติไม่ถูกต้อง';
    baseScore = 44 + Math.min(10, (hitEligibility.length - 1) * 3);
  } else if (hitDisaster.length > 0) {
    categoryCode = 'disaster';
    categoryLabel = 'ผลกระทบภัยพิบัติ / การเปิด-ปิดจุดบริการ';
    baseScore = 36;
  }

  // Count affected people/cards only on non-recap lines
  let affectedCasesInText = 0;
  meaningfulLines.forEach((line) => {
    if (line.includes('คิวจองทั้งหมด') || line.includes('รวมทั้งหมด')) return;
    const matches = line.matchAll(/(\d+)\s*(คน|ราย|ใบ|คิว|หมายเลข)/g);
    for (const m of matches) {
      const n = Number(m[1]);
      if (n > 0 && n < 2000) affectedCasesInText += n;
    }
  });

  const multiCategoryBonus = matchedGroupCount > 1 ? (matchedGroupCount - 1) * 8 : 0;
  const affectedBonus = Math.min(24, Math.round(affectedCasesInText * 0.8));
  const defectBonus = Math.min(18, (Number(report.cardsNotIssued) || 0) * 3);
  const wrongDateBonus = Math.min(10, Math.round((Number(report.wrongAppointmentDate) || 0) * 0.25));

  return {
    report,
    officeName: report.officeName,
    centerName: report.centerName,
    latestDate: report.reportDate || '',
    categoryCode,
    categoryLabel,
    cleanedNote,
    priorityScore: baseScore + multiCategoryBonus + affectedBonus + defectBonus + wrongDateBonus,
  };
}

export const ExecutiveInsightsView: React.FC<ExecutiveInsightsViewProps> = ({
  reports,
  offices,
  categories,
  onSelectReportPoster,
}) => {
  const activeCategories = useMemo(() => {
    if (categories && categories.length > 0) {
      return categories.filter((c) => c.isActive);
    }
    return DEFAULT_CATEGORIES;
  }, [categories]);

  const officeList = useMemo(() => {
    return (offices && offices.length > 0 ? offices : EMPLOYMENT_OFFICES).filter(
      (o) => o.region !== 'ส่วนกลาง' && o.id !== 'doe-hq'
    );
  }, [offices]);

  // Distinct dates sorted newest first
  const distinctDatesDesc = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((r) => {
      if (r.reportDate) set.add(r.reportDate);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [reports]);

  const latestDate = distinctDatesDesc[0] || new Date().toISOString().slice(0, 10);

  // Distinct months (YYYY-MM) sorted newest first
  const distinctMonthsDesc = useMemo(() => {
    const set = new Set<string>();
    distinctDatesDesc.forEach((d) => {
      if (d.length >= 7) set.add(d.slice(0, 7));
    });
    return Array.from(set)
      .sort((a, b) => b.localeCompare(a))
      .map((ym) => {
        const [yStr, mStr] = ym.split('-');
        const y = Number(yStr);
        const m = Number(mStr);
        const thaiYear = y < 2400 ? y + 543 : y;
        return {
          ym,
          label: `เดือน${THAI_MONTHS_FULL[m - 1] || mStr} พ.ศ. ${thaiYear}`,
        };
      });
  }, [distinctDatesDesc]);

  // Period state: 'all' | 'latest' | 'month:YYYY-MM' | 'single:YYYY-MM-DD' | 'custom'
  const [periodMode, setPeriodMode] = useState<string>('all');
  const [customStart, setCustomStart] = useState<string>(
    distinctDatesDesc[Math.min(6, Math.max(0, distinctDatesDesc.length - 1))] || latestDate
  );
  const [customEnd, setCustomEnd] = useState<string>(latestDate);
  const [scopeFilter, setScopeFilter] = useState<string>('ทั้งหมด');
  const [trendDays, setTrendDays] = useState<TrendRangeOption>(14);
  const [watchTab, setWatchTab] = useState<WatchTab>('top_volume');
  const [hoveredTrendDate, setHoveredTrendDate] = useState<string | null>(null);
  const insightsContainerRef = useRef<HTMLDivElement>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfStatusMsg, setPdfStatusMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const { startDate, endDate, activePeriodLabel } = useMemo(() => {
    if (periodMode === 'all') {
      return {
        startDate: null as string | null,
        endDate: null as string | null,
        activePeriodLabel: 'ภาพรวมสะสมทั้งหมด (ทุกช่วงวัน)',
      };
    }
    if (periodMode === 'latest') {
      return {
        startDate: latestDate,
        endDate: latestDate,
        activePeriodLabel: `ประจำวันที่ ${formatThaiDateFull(latestDate)}`,
      };
    }
    if (periodMode.startsWith('month:')) {
      const ym = periodMode.replace('month:', '');
      const [yStr, mStr] = ym.split('-');
      const y = Number(yStr);
      const m = Number(mStr);
      const lastDay = new Date(y, m, 0).getDate();
      const found = distinctMonthsDesc.find((item) => item.ym === ym);
      return {
        startDate: `${ym}-01`,
        endDate: `${ym}-${String(lastDay).padStart(2, '0')}`,
        activePeriodLabel: found ? `ประจำ${found.label}` : `ประจำเดือน ${ym}`,
      };
    }
    if (periodMode.startsWith('single:')) {
      const d = periodMode.replace('single:', '');
      return {
        startDate: d,
        endDate: d,
        activePeriodLabel: `ประจำวันที่ ${formatThaiDateFull(d)}`,
      };
    }
    if (periodMode === 'custom') {
      return {
        startDate: customStart || null,
        endDate: customEnd || null,
        activePeriodLabel: `ช่วงวันที่ ${formatThaiDateRange(customStart, customEnd)}`,
      };
    }
    return {
      startDate: null,
      endDate: null,
      activePeriodLabel: 'ภาพรวมสะสมทั้งหมด',
    };
  }, [periodMode, latestDate, distinctMonthsDesc, customStart, customEnd]);

  const matchesScope = (r: DOEReport, scope: string): boolean => {
    if (scope === 'ทั้งหมด') return true;
    const spec = isSpecialCenter(r.centerName, r.region);
    const mob = isMobileOnly(r.centerName);
    if (scope === 'เฉพาะกิจ') return spec;
    if (scope === 'mobile_unit') return mob;
    if (scope === 'standard_only') return !spec && !mob;
    return r.region === scope && !spec;
  };

  const scopeLabel = useMemo(() => {
    if (scopeFilter === 'ทั้งหมด') return 'ภาพรวมทั้งประเทศ (ทุกภาคและศูนย์เฉพาะกิจ)';
    if (scopeFilter === 'เฉพาะกิจ') return 'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวเฉพาะกิจ';
    if (scopeFilter === 'mobile_unit') return 'หน่วยบริการเคลื่อนที่ (Mobile Unit)';
    if (scopeFilter === 'standard_only') return 'เฉพาะศูนย์บริการประจำสำนักงาน';
    return `พื้นที่ ${scopeFilter}`;
  }, [scopeFilter]);

  // All-date reports matching scope (for Trend Chart)
  const scopeFilteredAllDates = useMemo(() => {
    return reports.filter((r) => matchesScope(r, scopeFilter));
  }, [reports, scopeFilter]);

  // Period + Scope filtered reports
  const filteredReports = useMemo(() => {
    return scopeFilteredAllDates.filter((r) => {
      const d = r.reportDate || '';
      if (startDate && endDate) return d >= startDate && d <= endDate;
      if (startDate) return d >= startDate;
      if (endDate) return d <= endDate;
      return true;
    });
  }, [scopeFilteredAllDates, startDate, endDate]);

  // Period filtered across ALL regions (for the Regional Comparison Matrix so executives always see all regions side-by-side)
  const periodAllRegionsReports = useMemo(() => {
    return reports.filter((r) => {
      const d = r.reportDate || '';
      if (startDate && endDate) return d >= startDate && d <= endDate;
      if (startDate) return d >= startDate;
      if (endDate) return d <= endDate;
      return true;
    });
  }, [reports, startDate, endDate]);

  // 1. Top-level KPI Summary + Day-over-Day comparison when viewing single day
  const kpiSummary = useMemo(() => {
    let queue = 0;
    let issued = 0;
    let verified = 0;
    let missed = 0;
    let wrongDate = 0;
    let notIssued = 0;
    const centerKeys = new Set<string>();

    filteredReports.forEach((r) => {
      const grpSum = calculateReportTotalSections(r, activeCategories);
      queue += Number(r.queueAppointment) || 0;
      issued += Math.max(Number(r.cardsIssued) || 0, grpSum);
      verified += Number(r.identityVerified) || 0;
      missed += Number(r.missedAppointment) || 0;
      wrongDate += Number(r.wrongAppointmentDate) || 0;
      notIssued += Number(r.cardsNotIssued) || 0;
      centerKeys.add(`${r.officeId}:${r.centerName || ''}`);
    });

    const successPct = queue > 0 ? ((issued / queue) * 100).toFixed(1) : '0.0';
    const missedPct = queue > 0 ? ((missed / queue) * 100).toFixed(1) : '0.0';
    const avgIssuedPerCenter =
      centerKeys.size > 0 ? Math.round(issued / centerKeys.size) : 0;

    // Day-over-day comparison if single day selected
    let prevDayIssuedDelta: number | null = null;
    let prevDayLabel = '';
    if (startDate && endDate && startDate === endDate) {
      const idx = distinctDatesDesc.indexOf(startDate);
      if (idx !== -1 && idx + 1 < distinctDatesDesc.length) {
        const prevDate = distinctDatesDesc[idx + 1];
        prevDayLabel = formatThaiDateShort(prevDate);
        let prevIssued = 0;
        scopeFilteredAllDates.forEach((r) => {
          if (r.reportDate === prevDate) {
            const grpSum = calculateReportTotalSections(r, activeCategories);
            prevIssued += Math.max(Number(r.cardsIssued) || 0, grpSum);
          }
        });
        prevDayIssuedDelta = issued - prevIssued;
      }
    }

    return {
      reportCount: filteredReports.length,
      distinctCenterCount: centerKeys.size,
      queue,
      issued,
      verified,
      missed,
      wrongDate,
      notIssued,
      successPct,
      missedPct,
      avgIssuedPerCenter,
      prevDayIssuedDelta,
      prevDayLabel,
    };
  }, [
    filteredReports,
    activeCategories,
    startDate,
    endDate,
    distinctDatesDesc,
    scopeFilteredAllDates,
  ]);

  // 2. Daily Trend Points
  const trendSeries = useMemo(() => {
    const map = new Map<
      string,
      { count: number; queue: number; issued: number; missed: number; notIssued: number }
    >();
    scopeFilteredAllDates.forEach((r) => {
      const d = r.reportDate || '';
      if (!d) return;
      const cur = map.get(d) || { count: 0, queue: 0, issued: 0, missed: 0, notIssued: 0 };
      const grpSum = calculateReportTotalSections(r, activeCategories);
      cur.count += 1;
      cur.queue += Number(r.queueAppointment) || 0;
      cur.issued += Math.max(Number(r.cardsIssued) || 0, grpSum);
      cur.missed += Number(r.missedAppointment) || 0;
      cur.notIssued += Number(r.cardsNotIssued) || 0;
      map.set(d, cur);
    });

    const sliceDesc = Array.from(map.keys())
      .sort((a, b) => b.localeCompare(a))
      .slice(0, trendDays);

    return sliceDesc.reverse().map((date) => {
      const v = map.get(date)!;
      return {
        date,
        shortThai: formatThaiDateShort(date),
        reportCount: v.count,
        queue: v.queue,
        issued: v.issued,
        missed: v.missed,
        notIssued: v.notIssued,
        successPct: v.queue > 0 ? ((v.issued / v.queue) * 100).toFixed(1) : '0.0',
      };
    });
  }, [scopeFilteredAllDates, activeCategories, trendDays]);

  const trendStats = useMemo(() => {
    let maxVal = 1;
    let sumIssued = 0;
    trendSeries.forEach((p) => {
      maxVal = Math.max(maxVal, p.queue, p.issued, p.missed);
      sumIssued += p.issued;
    });
    const avgDailyIssued =
      trendSeries.length > 0 ? Math.round(sumIssued / trendSeries.length) : 0;
    return { maxVal, avgDailyIssued };
  }, [trendSeries]);

  const activeTrendPoint = useMemo(() => {
    if (trendSeries.length === 0) return null;
    if (hoveredTrendDate) {
      const f = trendSeries.find((p) => p.date === hoveredTrendDate);
      if (f) return f;
    }
    if (startDate && startDate === endDate) {
      const f = trendSeries.find((p) => p.date === startDate);
      if (f) return f;
    }
    return trendSeries[trendSeries.length - 1];
  }, [trendSeries, hoveredTrendDate, startDate, endDate]);

  // 3. Regional Comparison Matrix (6 Regions + BKK + Special Centers)
  const regionalMatrix = useMemo(() => {
    const regions = [
      'กรุงเทพมหานคร',
      'ภาคกลางและตะวันตก',
      'ภาคตะวันออก',
      'ภาคตะวันออกเฉียงเหนือ',
      'ภาคเหนือ',
      'ภาคใต้',
      'เฉพาะกิจ',
    ];

    const expectedByRegion: Record<string, number> = {};
    regions.forEach((reg) => {
      if (reg === 'เฉพาะกิจ') {
        expectedByRegion[reg] = officeList.filter(
          (o) =>
            (o.centerName || '').includes('เฉพาะกิจ') ||
            (o.additionalCenters || []).some((c) => c.includes('เฉพาะกิจ'))
        ).length;
      } else {
        expectedByRegion[reg] = officeList.filter((o) => o.region === reg).length;
      }
    });

    const rows = regions.map((reg) => {
      const matching = periodAllRegionsReports.filter((r) => {
        const spec = isSpecialCenter(r.centerName, r.region);
        if (reg === 'เฉพาะกิจ') return spec;
        return r.region === reg && !spec;
      });

      const distinctOffices = new Set(matching.map((r) => r.officeId));
      let queue = 0;
      let issued = 0;
      let missed = 0;
      let wrongDate = 0;
      let notIssued = 0;

      matching.forEach((r) => {
        const grpSum = calculateReportTotalSections(r, activeCategories);
        queue += Number(r.queueAppointment) || 0;
        issued += Math.max(Number(r.cardsIssued) || 0, grpSum);
        missed += Number(r.missedAppointment) || 0;
        wrongDate += Number(r.wrongAppointmentDate) || 0;
        notIssued += Number(r.cardsNotIssued) || 0;
      });

      return {
        region: reg,
        displayLabel:
          reg === 'เฉพาะกิจ' ? 'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวเฉพาะกิจ' : reg,
        expectedCount: expectedByRegion[reg] || 0,
        reportedOffices: distinctOffices.size,
        reportCount: matching.length,
        queue,
        issued,
        missed,
        wrongDate,
        notIssued,
        successPct: queue > 0 ? Number(((issued / queue) * 100).toFixed(1)) : 0,
        missedPct: queue > 0 ? Number(((missed / queue) * 100).toFixed(1)) : 0,
      };
    });

    const totalNationalIssued = rows.reduce((acc, r) => acc + r.issued, 0);
    const totalNationalQueue = rows.reduce((acc, r) => acc + r.queue, 0);
    const totalNationalMissed = rows.reduce((acc, r) => acc + r.missed, 0);
    const totalNationalWrong = rows.reduce((acc, r) => acc + r.wrongDate, 0);
    const totalNationalDefect = rows.reduce((acc, r) => acc + r.notIssued, 0);
    const totalNationalReports = rows.reduce((acc, r) => acc + r.reportCount, 0);
    const totalReportedOffices = rows.reduce((acc, r) => acc + r.reportedOffices, 0);

    return {
      rows,
      totals: {
        reportedOffices: totalReportedOffices,
        reportCount: totalNationalReports,
        queue: totalNationalQueue,
        issued: totalNationalIssued,
        missed: totalNationalMissed,
        wrongDate: totalNationalWrong,
        notIssued: totalNationalDefect,
        successPct:
          totalNationalQueue > 0
            ? Number(((totalNationalIssued / totalNationalQueue) * 100).toFixed(1))
            : 0,
        missedPct:
          totalNationalQueue > 0
            ? Number(((totalNationalMissed / totalNationalQueue) * 100).toFixed(1))
            : 0,
      },
    };
  }, [periodAllRegionsReports, officeList, activeCategories]);

  // 4. Center Rankings & Operational Watchlists (Top 10)
  const centerRankings = useMemo(() => {
    interface AggCenter {
      key: string;
      sampleReport: DOEReport;
      officeName: string;
      centerName: string;
      region: string;
      daysCount: number;
      queue: number;
      issued: number;
      missed: number;
      wrongDate: number;
      notIssued: number;
      successPct: number;
      missedPct: number;
      latestNote: string;
      latestNoteDate: string;
    }

    const map = new Map<string, AggCenter>();
    filteredReports.forEach((r) => {
      const spec = isSpecialCenter(r.centerName, r.region);
      const key = `${spec ? 'spec' : 'std'}:${r.officeId}:${r.centerName || ''}`;
      const grpSum = calculateReportTotalSections(r, activeCategories);
      const q = Number(r.queueAppointment) || 0;
      const iss = Math.max(Number(r.cardsIssued) || 0, grpSum);
      const mis = Number(r.missedAppointment) || 0;
      const wrg = Number(r.wrongAppointmentDate) || 0;
      const def = Number(r.cardsNotIssued) || 0;
      const cleanNote = (r.notes || '').trim();

      const existing = map.get(key);
      if (existing) {
        existing.daysCount += 1;
        existing.queue += q;
        existing.issued += iss;
        existing.missed += mis;
        existing.wrongDate += wrg;
        existing.notIssued += def;
        if ((r.reportDate || '') >= (existing.sampleReport.reportDate || '')) {
          existing.sampleReport = r;
        }
        if (cleanNote && (r.reportDate || '') >= existing.latestNoteDate) {
          existing.latestNote = cleanNote;
          existing.latestNoteDate = r.reportDate || '';
        }
      } else {
        map.set(key, {
          key,
          sampleReport: r,
          officeName: r.officeName,
          centerName: r.centerName,
          region: spec ? 'เฉพาะกิจ' : r.region,
          daysCount: 1,
          queue: q,
          issued: iss,
          missed: mis,
          wrongDate: wrg,
          notIssued: def,
          successPct: 0,
          missedPct: 0,
          latestNote: cleanNote,
          latestNoteDate: cleanNote ? r.reportDate || '' : '',
        });
      }
    });

    const list = Array.from(map.values());
    list.forEach((item) => {
      item.successPct = item.queue > 0 ? Number(((item.issued / item.queue) * 100).toFixed(1)) : 0;
      item.missedPct = item.queue > 0 ? Number(((item.missed / item.queue) * 100).toFixed(1)) : 0;
    });

    const topVolume = [...list]
      .filter((x) => x.issued > 0)
      .sort((a, b) => b.issued - a.issued || b.queue - a.queue)
      .slice(0, 10);

    const highMissed = [...list]
      .filter((x) => x.missed > 0)
      .sort((a, b) => b.missed - a.missed || b.missedPct - a.missedPct)
      .slice(0, 10);

    const cardDefect = [...list]
      .filter((x) => x.notIssued > 0 || x.wrongDate > 0)
      .sort((a, b) => b.notIssued - a.notIssued || b.wrongDate - a.wrongDate)
      .slice(0, 10);

    let totalNotesCount = 0;
    let totalRawIssueReports = 0;
    const groupedIssues = new Map<string, PrioritizedIssueItem>();

    filteredReports.forEach((r) => {
      if (r.notes && r.notes.trim().length > 0) {
        totalNotesCount += 1;
      }
      const evaluated = evaluateReportIssue(r);
      if (!evaluated) return;
      totalRawIssueReports += 1;

      const groupKey = `${r.officeId}:${r.centerName || ''}:${evaluated.categoryCode}`;
      const existingIssue = groupedIssues.get(groupKey);
      if (!existingIssue) {
        groupedIssues.set(groupKey, {
          ...evaluated,
          key: groupKey,
          repeatDays: 1,
        });
      } else {
        existingIssue.repeatDays += 1;
        const nextBestNote =
          evaluated.priorityScore > existingIssue.priorityScore
            ? evaluated.cleanedNote
            : existingIssue.cleanedNote;
        const nextReport =
          evaluated.priorityScore >= existingIssue.priorityScore ||
          evaluated.latestDate > existingIssue.latestDate
            ? r
            : existingIssue.report;
        existingIssue.priorityScore = Math.max(
          existingIssue.priorityScore,
          evaluated.priorityScore
        );
        existingIssue.cleanedNote = nextBestNote;
        existingIssue.report = nextReport;
        if (evaluated.latestDate > existingIssue.latestDate) {
          existingIssue.latestDate = evaluated.latestDate;
        }
      }
    });

    const allGroupedIssues = Array.from(groupedIssues.values()).map((item) => ({
      ...item,
      priorityScore: item.priorityScore + Math.min(12, (item.repeatDays - 1) * 2),
    }));

    allGroupedIssues.sort(
      (a, b) => b.priorityScore - a.priorityScore || b.latestDate.localeCompare(a.latestDate)
    );

    // Prefer distinct offices first so top 10 covers broad visibility, then fill remaining up to 10 if scope is narrow
    const top10Issues: PrioritizedIssueItem[] = [];
    const usedOffices = new Set<string>();
    const deferredSameOffice: PrioritizedIssueItem[] = [];

    for (const issue of allGroupedIssues) {
      const offKey = `${issue.report.officeId}:${issue.centerName || ''}`;
      if (!usedOffices.has(offKey)) {
        usedOffices.add(offKey);
        top10Issues.push(issue);
        if (top10Issues.length >= 10) break;
      } else {
        deferredSameOffice.push(issue);
      }
    }

    if (top10Issues.length < 10 && deferredSameOffice.length > 0) {
      for (const extra of deferredSameOffice) {
        top10Issues.push(extra);
        if (top10Issues.length >= 10) break;
      }
      top10Issues.sort(
        (a, b) => b.priorityScore - a.priorityScore || b.latestDate.localeCompare(a.latestDate)
      );
    }

    return {
      topVolume,
      highMissed,
      cardDefect,
      prioritizedIssues: top10Issues,
      totalNotesCount,
      totalRawIssueReports,
    };
  }, [filteredReports, activeCategories]);

  const activeRankingRows =
    watchTab === 'top_volume'
      ? centerRankings.topVolume
      : watchTab === 'high_missed'
      ? centerRankings.highMissed
      : centerRankings.cardDefect;

  const handleExportExcel = () => {
    downloadExecutiveExcelReport({
      reports: filteredReports,
      allDateFilteredReports: scopeFilteredAllDates,
      periodLabel: activePeriodLabel,
      scopeLabel,
      categories: activeCategories,
    });
  };

  const handleExportPdf = async () => {
    if (!insightsContainerRef.current || isExportingPdf) return;
    try {
      setIsExportingPdf(true);
      setPdfStatusMsg(null);
      await downloadExecutivePdfReport(insightsContainerRef.current);
      setPdfStatusMsg({
        type: 'success',
        text: 'ดาวน์โหลดไฟล์วิเคราะห์ข้อมูลและรายงานสรุป (.pdf ขนาด A4) เรียบร้อยแล้ว สามารถเปิดไฟล์เพื่อสั่งพิมพ์หรือแนบเสนอที่ประชุมได้ทันที',
      });
    } catch (err) {
      console.error('Failed to generate Executive PDF:', err);
      setPdfStatusMsg({
        type: 'error',
        text: 'ไม่สามารถสร้างไฟล์ PDF ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง',
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div ref={insightsContainerRef} className="space-y-6">
      {/* 1. HEADER & EXECUTIVE FILTER / EXPORT BAR */}
      <section
        data-pdf-block="true"
        className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 font-['Prompt'] tracking-tight">
              วิเคราะห์ข้อมูลและรายงานสรุป
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-slate-500 mt-1">
              <span>{activePeriodLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{scopeLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                ประมวลผลจาก {formatNumber(filteredReports.length)} รายงาน ({formatNumber(kpiSummary.distinctCenterCount)} ศูนย์บริการ)
              </span>
            </div>
          </div>

          {/* 1-Click Executive Export Actions */}
          <div className="flex flex-wrap items-center gap-2.5 no-print">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={filteredReports.length === 0}
              className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs sm:text-sm font-bold transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
              title="ดาวน์โหลดไฟล์ Excel สรุปผล 3 แท็บ (สรุปรายภาค, รายละเอียดรายศูนย์, แนวโน้มรายวัน)"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>ส่งออก Excel (.xls)</span>
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={filteredReports.length === 0 || isExportingPdf}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs sm:text-sm font-bold transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
              title="บันทึกหน้าวิเคราะห์ข้อมูลเป็นไฟล์ PDF ขนาด A4 ความละเอียดสูง"
            >
              {isExportingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                  <span>กำลังบันทึกหน้าวิเคราะห์ข้อมูล...</span>
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4 shrink-0" />
                  <span>บันทึกหน้าวิเคราะห์ข้อมูล</span>
                </>
              )}
            </button>
          </div>
        </div>

        {pdfStatusMsg && (
          <div
            className={`no-print flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl text-xs sm:text-sm border ${
              pdfStatusMsg.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{pdfStatusMsg.text}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {typeof window !== 'undefined' && window.self === window.top && (
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="text-xs font-bold underline cursor-pointer"
                >
                  สั่งพิมพ์ออกเครื่องพิมพ์โดยตรง
                </button>
              )}
              <button
                type="button"
                onClick={() => setPdfStatusMsg(null)}
                className="text-xs font-bold underline cursor-pointer"
              >
                ปิด
              </button>
            </div>
          </div>
        )}

        {/* Filter Bar (No Print) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-4 border-t border-slate-100 no-print">
          {/* Period Selector */}
          <div className="md:col-span-5 flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2">
            <CalendarRange className="w-4 h-4 text-blue-700 shrink-0" />
            <div className="min-w-0 flex-1">
              <label
                htmlFor="exec-period-select"
                className="block text-[11px] font-semibold text-slate-500 leading-none mb-1"
              >
                ช่วงเวลาที่วิเคราะห์
              </label>
              <select
                id="exec-period-select"
                value={periodMode}
                onChange={(e) => setPeriodMode(e.target.value)}
                className="w-full bg-transparent text-xs sm:text-sm font-bold text-slate-900 focus:outline-hidden cursor-pointer truncate"
              >
                <option value="all">ภาพรวมสะสมทั้งหมด ({reports.length.toLocaleString()} รายการ)</option>
                <option value="latest">
                  วันล่าสุดที่มีรายงาน ({formatThaiDateShort(latestDate)})
                </option>
                <option value="custom">กำหนดช่วงวันที่เอง (วันเริ่ม – วันสิ้นสุด)...</option>
                {distinctMonthsDesc.length > 0 && (
                  <optgroup label="เลือกดูสรุปรายเดือน (พ.ศ.)">
                    {distinctMonthsDesc.map((m) => (
                      <option key={m.ym} value={`month:${m.ym}`}>
                        รวมทั้ง{m.label}
                      </option>
                    ))}
                  </optgroup>
                )}
                {distinctDatesDesc.length > 0 && (
                  <optgroup label="เลือกดูรายวัน (30 วันล่าสุด)">
                    {distinctDatesDesc.slice(0, 30).map((d) => (
                      <option key={d} value={`single:${d}`}>
                        รายวัน: {formatThaiDateShort(d)} ({d})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          {/* Scope / Region / Center Type Selector */}
          <div className="md:col-span-5 flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2">
            <Filter className="w-4 h-4 text-indigo-700 shrink-0" />
            <div className="min-w-0 flex-1">
              <label
                htmlFor="exec-scope-select"
                className="block text-[11px] font-semibold text-slate-500 leading-none mb-1"
              >
                ขอบเขตภูมิภาค / ประเภทศูนย์บริการ
              </label>
              <select
                id="exec-scope-select"
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.target.value)}
                className="w-full bg-transparent text-xs sm:text-sm font-bold text-slate-900 focus:outline-hidden cursor-pointer truncate"
              >
                <option value="ทั้งหมด">ภาพรวมทั้งประเทศ (ทุกภาค + ศูนย์เฉพาะกิจ)</option>
                <optgroup label="แยกตามรูปแบบศูนย์บริการ">
                  <option value="standard_only">เฉพาะศูนย์บริการประจำสำนักงาน</option>
                  <option value="เฉพาะกิจ">ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวเฉพาะกิจ</option>
                  <option value="mobile_unit">หน่วยบริการเคลื่อนที่ (Mobile Unit)</option>
                </optgroup>
                <optgroup label="แยกตามภูมิภาค">
                  <option value="กรุงเทพมหานคร">กรุงเทพมหานคร (10 พื้นที่)</option>
                  <option value="ภาคกลางและตะวันตก">ภาคกลางและตะวันตก</option>
                  <option value="ภาคตะวันออก">ภาคตะวันออก</option>
                  <option value="ภาคตะวันออกเฉียงเหนือ">ภาคตะวันออกเฉียงเหนือ</option>
                  <option value="ภาคเหนือ">ภาคเหนือ</option>
                  <option value="ภาคใต้">ภาคใต้</option>
                </optgroup>
              </select>
            </div>
          </div>

          {/* Quick Reset */}
          <div className="md:col-span-2 flex items-center">
            <button
              type="button"
              onClick={() => {
                setPeriodMode('all');
                setScopeFilter('ทั้งหมด');
              }}
              className="w-full h-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap"
            >
              รีเซ็ตตัวกรอง
            </button>
          </div>
        </div>

        {/* Custom Date Inputs if periodMode === 'custom' */}
        {periodMode === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-2 text-xs sm:text-sm no-print">
            <span className="font-bold text-slate-700">ตั้งแต่วันที่:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-mono tabular-nums text-slate-900"
            />
            <span className="font-bold text-slate-700">ถึงวันที่:</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-mono tabular-nums text-slate-900"
            />
          </div>
        )}
      </section>

      {/* 2. EXECUTIVE 4-COLUMN KPI SUMMARY STRIP */}
      <section
        data-pdf-block="true"
        data-pdf-kpi-grid="true"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between">
          <div className="text-sm font-bold text-slate-600">ออกบัตรใบอนุญาตทำงานสำเร็จ</div>
          <div className="text-3xl font-black text-emerald-700 font-['Prompt'] tabular-nums my-2">
            {formatNumber(kpiSummary.issued)}{' '}
            <span className="text-sm font-semibold text-slate-500">ใบ</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 tabular-nums">
            <span>สำเร็จ {kpiSummary.successPct}% ของคิวนัด</span>
            {kpiSummary.prevDayIssuedDelta !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span
                  className={`inline-flex items-center gap-0.5 font-bold ${
                    kpiSummary.prevDayIssuedDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {kpiSummary.prevDayIssuedDelta >= 0 ? (
                    <TrendingUp className="w-3.5 h-3.5" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5" />
                  )}
                  {kpiSummary.prevDayIssuedDelta >= 0 ? '+' : ''}
                  {formatNumber(kpiSummary.prevDayIssuedDelta)} เทียบ {kpiSummary.prevDayLabel}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between">
          <div className="text-sm font-bold text-slate-600">คิวนัดหมายเข้ารับบริการรวม</div>
          <div className="text-3xl font-black text-slate-900 font-['Prompt'] tabular-nums my-2">
            {formatNumber(kpiSummary.queue)}{' '}
            <span className="text-sm font-semibold text-slate-500">คิว</span>
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            เฉลี่ยออกบัตร {formatNumber(kpiSummary.avgIssuedPerCenter)} ใบ / ศูนย์บริการ
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between">
          <div className="text-sm font-bold text-slate-600">ผู้ไม่มาตามนัด (No-Show)</div>
          <div className="text-3xl font-black text-rose-700 font-['Prompt'] tabular-nums my-2">
            {formatNumber(kpiSummary.missed)}{' '}
            <span className="text-sm font-semibold text-slate-500">คน</span>
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            คิดเป็นอัตราขาดนัด {kpiSummary.missedPct}% ของคิวนัดหมาย
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between">
          <div className="text-sm font-bold text-slate-600">เฝ้าระวังบัตรเสีย · มาผิดวันนัด</div>
          <div className="text-3xl font-black text-amber-700 font-['Prompt'] tabular-nums my-2">
            {formatNumber(kpiSummary.notIssued)}{' '}
            <span className="text-sm font-semibold text-slate-500">ใบเสีย</span>
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            ผู้รับบริการมาไม่ตรงวันนัด {formatNumber(kpiSummary.wrongDate)} คน
          </div>
        </div>
      </section>

      {/* 3. INTERACTIVE DAILY / WEEKLY TREND CHART */}
      <section
        data-pdf-block="true"
        className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 text-blue-800 shrink-0" />
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 font-['Prompt']">
                1. กราฟแนวโน้มผลการปฏิบัติงานรายวัน (คิวนัดหมาย · ออกบัตรสำเร็จ · ไม่มาตามนัด)
              </h3>
              <p className="text-xs text-slate-500 tabular-nums">
                ค่าเฉลี่ยออกบัตรสำเร็จ {formatNumber(trendStats.avgDailyIssued)} ใบ/วัน (จาก {trendSeries.length} วันทำการล่าสุดที่มีรายงาน)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg no-print">
            {([
              { val: 7, label: '7 วันล่าสุด' },
              { val: 14, label: '14 วันล่าสุด' },
              { val: 30, label: '30 วันล่าสุด' },
              { val: 90, label: 'ทั้งหมด' },
            ] as { val: TrendRangeOption; label: string }[]).map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setTrendDays(opt.val)}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  trendDays === opt.val
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Selected / Hovered Day Readout */}
        {activeTrendPoint && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs sm:text-sm tabular-nums">
            <div className="font-bold text-slate-900">
              วันที่ {activeTrendPoint.shortThai}{' '}
              <span className="font-normal text-slate-500">
                (ส่งรายงาน {activeTrendPoint.reportCount} แห่ง)
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span>
                คิวนัดหมาย <strong className="text-slate-900">{formatNumber(activeTrendPoint.queue)}</strong>
              </span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="text-emerald-800">
                ออกบัตรสำเร็จ <strong>{formatNumber(activeTrendPoint.issued)}</strong> ({activeTrendPoint.successPct}%)
              </span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="text-rose-700">
                ไม่มาตามนัด <strong>{formatNumber(activeTrendPoint.missed)}</strong>
              </span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="text-slate-600">
                บัตรเสีย <strong>{formatNumber(activeTrendPoint.notIssued)}</strong>
              </span>
            </div>
          </div>
        )}

        {trendSeries.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            ไม่พบข้อมูลสำหรับสร้างกราฟแนวโน้มในขอบเขตที่เลือก
          </div>
        ) : (
          <div>
            <div className="h-60 flex items-end gap-1.5 sm:gap-2.5 border-b border-slate-200 pb-2 px-1 overflow-x-auto">
              {trendSeries.map((pt) => {
                const qH = Math.max(4, Math.round((pt.queue / trendStats.maxVal) * 100));
                const iH = Math.max(4, Math.round((pt.issued / trendStats.maxVal) * 100));
                const mH = pt.missed > 0 ? Math.max(3, Math.round((pt.missed / trendStats.maxVal) * 100)) : 0;
                const isSelected = periodMode === `single:${pt.date}`;

                return (
                  <button
                    key={pt.date}
                    type="button"
                    onMouseEnter={() => setHoveredTrendDate(pt.date)}
                    onMouseLeave={() => setHoveredTrendDate(null)}
                    onFocus={() => setHoveredTrendDate(pt.date)}
                    onClick={() =>
                      setPeriodMode((prev) => (prev === `single:${pt.date}` ? 'all' : `single:${pt.date}`))
                    }
                    className={`group flex-1 min-w-[38px] h-full flex flex-col justify-end items-center rounded-lg px-1 pt-3 transition-colors cursor-pointer focus:outline-hidden ${
                      isSelected ? 'bg-sky-50' : 'hover:bg-slate-50'
                    }`}
                    title={`${pt.shortThai}: คิวนัดหมาย ${formatNumber(pt.queue)} | ออกบัตร ${formatNumber(pt.issued)} | ไม่มาตามนัด ${formatNumber(pt.missed)} (คลิกเพื่อกรองเฉพาะวันนี้)`}
                  >
                    <div className="w-full h-44 flex items-end justify-center gap-[3px]">
                      <div
                        className="w-2.5 sm:w-3 bg-slate-300 group-hover:bg-slate-400 rounded-t-xs transition-opacity"
                        style={{ height: `${qH}%` }}
                      />
                      <div
                        className="w-2.5 sm:w-3 bg-emerald-600 group-hover:bg-emerald-500 rounded-t-xs transition-opacity"
                        style={{ height: `${iH}%` }}
                      />
                      {mH > 0 && (
                        <div
                          className="w-2 sm:w-2.5 bg-rose-500 group-hover:bg-rose-400 rounded-t-xs transition-opacity"
                          style={{ height: `${mH}%` }}
                        />
                      )}
                    </div>
                    <span
                      className={`mt-2 text-[11px] font-mono tabular-nums whitespace-nowrap ${
                        isSelected
                          ? 'font-extrabold text-blue-900 underline underline-offset-2'
                          : 'text-slate-600 group-hover:text-slate-900'
                      }`}
                    >
                      {pt.date.slice(8, 10)}/{pt.date.slice(5, 7)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-xs text-slate-500">
              <div className="flex flex-wrap items-center gap-5">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-slate-300 inline-block" />
                  <span>คิวนัดหมาย (คิว)</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-emerald-600 inline-block" />
                  <span>ออกบัตรสำเร็จ (ใบ)</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-rose-500 inline-block" />
                  <span>ไม่มาตามนัด (คน)</span>
                </span>
              </div>
              <span className="no-print">คลิกที่แท่งวันใดก็ได้เพื่อดูข้อมูลเจาะลึกเฉพาะวันนั้น (คลิกซ้ำเพื่อดูภาพรวมสะสม)</span>
            </div>
          </div>
        )}
      </section>

      {/* 4. REGIONAL COMPARISON MATRIX (ตารางสรุปเปรียบเทียบรายภูมิภาคและศูนย์เฉพาะกิจ) */}
      <section
        data-pdf-block="true"
        className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
      >
        <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-emerald-700 shrink-0" />
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 font-['Prompt']">
                2. ตารางเปรียบเทียบผลการปฏิบัติงานแยกรายภูมิภาคและศูนย์เฉพาะกิจ
              </h3>
              <p className="text-xs text-slate-500">
                สรุปยอดเปรียบเทียบครบทุกภูมิภาคประจำช่วงเวลา ({activePeriodLabel}) · คลิกที่ชื่อภาคเพื่อกรองดูเฉพาะภาคนั้น
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-xs sm:text-sm">
              <tr>
                <th className="py-3.5 px-4">ภูมิภาค / ประเภทศูนย์</th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap">จำนวนรายงาน</th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap">คิวนัดหมาย</th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap">ออกบัตรสำเร็จ</th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap">อัตราสำเร็จ</th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap">ไม่มาตามนัด</th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap">มาผิดวันนัด</th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap">บัตรเสีย</th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap">สัดส่วนทั้งประเทศ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {regionalMatrix.rows.map((row) => {
                const isSelectedScope = scopeFilter === row.region;
                const nationalShare =
                  regionalMatrix.totals.issued > 0
                    ? ((row.issued / regionalMatrix.totals.issued) * 100).toFixed(1)
                    : '0.0';
                return (
                  <tr
                    key={row.region}
                    onClick={() =>
                      setScopeFilter((prev) => (prev === row.region ? 'ทั้งหมด' : row.region))
                    }
                    className={`cursor-pointer transition-colors ${
                      isSelectedScope ? 'bg-sky-50/90 font-semibold' : 'hover:bg-slate-50'
                    }`}
                    title="คลิกเพื่อกรองเฉพาะภูมิภาคนี้"
                  >
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {row.displayLabel}
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        ({row.reportedOffices}/{row.expectedCount} แห่ง)
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {formatNumber(row.reportCount)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-900">
                      {formatNumber(row.queue)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                      {formatNumber(row.issued)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {row.successPct.toFixed(1)}%
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-rose-700">
                      {formatNumber(row.missed)}{' '}
                      <span className="text-xs text-slate-400">({row.missedPct.toFixed(1)}%)</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-amber-800">
                      {formatNumber(row.wrongDate)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {formatNumber(row.notIssued)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-blue-900">
                      {nationalShare}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-100/90 border-t-2 border-slate-300 font-extrabold text-slate-900 tabular-nums">
              <tr>
                <td className="py-3.5 px-4">รวมทั้งสิ้นทั่วประเทศ</td>
                <td className="py-3.5 px-4 text-right font-mono">
                  {formatNumber(regionalMatrix.totals.reportCount)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono">
                  {formatNumber(regionalMatrix.totals.queue)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-emerald-800">
                  {formatNumber(regionalMatrix.totals.issued)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono">
                  {regionalMatrix.totals.successPct.toFixed(1)}%
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-rose-800">
                  {formatNumber(regionalMatrix.totals.missed)} ({regionalMatrix.totals.missedPct.toFixed(1)}%)
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-amber-900">
                  {formatNumber(regionalMatrix.totals.wrongDate)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono">
                  {formatNumber(regionalMatrix.totals.notIssued)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-blue-950">100.0%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* 5. TOP 10 RANKINGS & OPERATIONAL WATCHLIST */}
      <section
        data-pdf-block="true"
        className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
      >
        <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {watchTab === 'top_volume' ? (
              <Award className="w-5 h-5 text-emerald-700 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            )}
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 font-['Prompt']">
                3. ตารางจัดอันดับและดัชนีเฝ้าระวังรายศูนย์บริการ (Top 10)
              </h3>
              <p className="text-xs text-slate-500">
                สนับสนุนการวางแผนจัดสรรเครื่องพิมพ์บัตร ริบบอนสำรอง และอัตรากำลังเจ้าหน้าที่เสริมของส่วนกลาง
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg no-print">
            <button
              type="button"
              onClick={() => setWatchTab('top_volume')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                watchTab === 'top_volume'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ออกบัตรสูงสุด 10 อันดับ
            </button>
            <button
              type="button"
              onClick={() => setWatchTab('high_missed')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                watchTab === 'high_missed'
                  ? 'bg-white text-rose-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ไม่มาตามนัดสูงสุด ({centerRankings.highMissed.length})
            </button>
            <button
              type="button"
              onClick={() => setWatchTab('card_defect')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                watchTab === 'card_defect'
                  ? 'bg-white text-amber-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              เฝ้าระวังบัตรเสีย / ผิดนัด ({centerRankings.cardDefect.length})
            </button>
          </div>
        </div>

        {activeRankingRows.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            ไม่พบรายการในหมวดหมู่นี้สำหรับช่วงเวลาที่เลือก
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="py-3 px-4 w-14">อันดับ</th>
                  <th className="py-3 px-4">สำนักงานจัดหางาน / ศูนย์บริการ</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">คิวนัดหมาย</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">ออกบัตรสำเร็จ</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">ไม่มาตามนัด</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">บัตรเสีย · ผิดวัน</th>
                  {onSelectReportPoster && (
                    <th className="py-3 px-4 text-right whitespace-nowrap no-print">โปสเตอร์</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {activeRankingRows.map((row, idx) => (
                  <tr key={row.key} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-500">{idx + 1}</td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{row.officeName}</div>
                      <div className="text-xs text-slate-500">
                        {row.centerName || row.region}
                        {row.daysCount > 1 ? ` · สะสม ${row.daysCount} วัน` : ''}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {formatNumber(row.queue)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                      {formatNumber(row.issued)}{' '}
                      <span className="text-[11px] font-normal text-slate-400">
                        ({row.successPct.toFixed(1)}%)
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-rose-700">
                      {formatNumber(row.missed)}{' '}
                      <span className="text-[11px] font-normal text-slate-400">
                        ({row.missedPct.toFixed(1)}%)
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-amber-800">
                      {formatNumber(row.notIssued)} · {formatNumber(row.wrongDate)}
                    </td>
                    {onSelectReportPoster && (
                      <td className="py-3 px-4 text-right whitespace-nowrap no-print">
                        <button
                          type="button"
                          onClick={() => onSelectReportPoster(row.sampleReport)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>ดูโปสเตอร์</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 6. PRIORITIZED GENUINE OPERATIONAL ISSUES (MAX 10, SORTED HIGH TO LOW PRIORITY) */}
      <section
        data-pdf-block="true"
        className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
      >
        <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 font-['Prompt']">
                4. หมายเหตุเฉพาะกรณีพบปัญหาและอุปสรรคสำคัญจากหน้างาน (สูงสุดไม่เกิน 10 ข้อ)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                คัดกรองเฉพาะรายงานที่ระบุปัญหาหรือข้อติดขัดจริง (ตัดข้อความปกติ/เรียบร้อยออกอัตโนมัติ) และจัดลำดับความสำคัญจากผลกระทบมากไปน้อย · พบรายงานปัญหาจริง{' '}
                {formatNumber(centerRankings.totalRawIssueReports)} รายการ จากหมายเหตุทั้งหมด{' '}
                {formatNumber(centerRankings.totalNotesCount)} รายการ
              </p>
            </div>
          </div>
        </div>

        {centerRankings.prioritizedIssues.length === 0 ? (
          <div className="py-10 px-6 text-center text-xs sm:text-sm text-slate-500">
            ไม่พบหมายเหตุที่ระบุปัญหาหรืออุปสรรคหน้างานในช่วงเวลาและขอบเขตที่เลือก (รายงานที่ส่งเข้ามาเป็นไปด้วยความเรียบร้อย)
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {centerRankings.prioritizedIssues.map((issue, idx) => {
              const catTone =
                issue.categoryCode === 'integrity' || issue.categoryCode === 'system'
                  ? 'text-rose-700'
                  : issue.categoryCode === 'eligibility'
                  ? 'text-amber-800'
                  : 'text-blue-800';

              return (
                <div
                  key={issue.key}
                  className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-start justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-mono text-xs font-extrabold text-slate-700 shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm">
                        <span className="font-extrabold text-slate-900">{issue.officeName}</span>
                        <span className="text-slate-300" aria-hidden="true">
                          ·
                        </span>
                        <span className={`text-xs font-bold ${catTone}`}>{issue.categoryLabel}</span>
                        <span className="text-slate-300" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-xs text-slate-500 font-mono tabular-nums">
                          วันที่ {formatThaiDateShort(issue.latestDate)}
                          {issue.repeatDays > 1 ? ` (พบปัญหาต่อเนื่อง ${issue.repeatDays} วัน)` : ''}
                        </span>
                      </div>
                      {issue.centerName && (
                        <div className="text-xs text-slate-500">{issue.centerName}</div>
                      )}
                      <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line pt-0.5">
                        {issue.cleanedNote}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
