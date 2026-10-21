import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DOEReport, EmploymentOffice, QueueMetricCategory, ReportCategory } from '../types/doe';
import { EMPLOYMENT_OFFICES } from '../data/offices';
import { DEFAULT_CATEGORIES } from '../data/initialAdminData';
import {
  formatNumber,
  formatThaiDateShort,
  formatThaiDateFull,
  formatThaiDateRange,
  getTodayIsoDate,
} from '../utils/thaiDate';
import { REGION_ORDER, getRegionLabel } from '../utils/officeUtils';
import { calculateReportTotalSections } from '../utils/doeUtils';
import {
  TrendingUp,
  Users,
  CheckCircle2,
  Clock,
  Eye,
  FileSpreadsheet,
  Globe2,
  Building2,
  Search,
  Filter,
  Calendar,
  ArrowRight,
  PlusCircle,
  ShieldCheck,
  CalendarX,
  UserX,
  XCircle,
  Check,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Truck,
  MapPin,
} from 'lucide-react';

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

const MOBILE_UNIT_DEFAULT_LABEL =
  'หน่วยบริการใบอนุญาตทำงานของคนต่างด้าวแบบเคลื่อนที่ (Mobile Unit)';

function isMobileUnitCenter(centerName?: string, region?: string): boolean {
  const c = (centerName || '').toLowerCase();
  return (
    region === 'เฉพาะกิจ' ||
    c.includes('mobile unit') ||
    c.includes('เคลื่อนที่') ||
    c.includes('เฉพาะกิจ')
  );
}

interface DashboardViewProps {
  reports: DOEReport[];
  categories?: ReportCategory[];
  queueMetrics?: QueueMetricCategory[];
  currentReport?: DOEReport | null;
  onSelectReport: (report: DOEReport) => void;
  onNewReport: (preselectedOfficeId?: string) => void;
  onOpenLine?: (report: DOEReport) => void;
  onEditReport?: (report: DOEReport) => void;
  onViewPendingInHistory?: () => void;
  offices?: EmploymentOffice[];
  resetSignal?: number;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  reports,
  categories,
  queueMetrics,
  currentReport,
  onSelectReport,
  onNewReport,
  onViewPendingInHistory,
  offices,
  resetSignal,
}) => {
  const todayStr = useMemo(() => getTodayIsoDate(), []);

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

  // Dynamic active categories from system config / props
  const activeCategories = useMemo(() => {
    if (categories && categories.length > 0) {
      return categories.filter((c) => c.isActive);
    }
    return DEFAULT_CATEGORIES;
  }, [categories]);

  // Available distinct dates from existing reports (always including today)
  const availableDates = useMemo(() => {
    const datesSet = new Set(reports.map((r) => r.reportDate));
    datesSet.add(todayStr);
    return Array.from(datesSet).sort((a, b) => b.localeCompare(a));
  }, [reports, todayStr]);

  // Group availableDates by same Month and same Buddhist Era Year (ปี พ.ศ.)
  const availableMonthGroups = useMemo(() => {
    const groupsMap = new Map<
      string,
      {
        monthKey: string;
        monthName: string;
        thaiYear: number;
        monthLabel: string;
        dates: { date: string; reportCount: number }[];
        totalReportsInMonth: number;
      }
    >();

    availableDates.forEach((d) => {
      if (!d || d.length < 7) return;
      const [yStr, mStr] = d.split('-');
      const year = Number(yStr);
      const monthIdx = Number(mStr) - 1;
      if (isNaN(year) || isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) return;

      const monthKey = `${yStr}-${mStr}`;
      const thaiYear = year + 543;
      const monthName = THAI_MONTHS_FULL[monthIdx];
      const monthLabel = `เดือน${monthName} พ.ศ. ${thaiYear}`;
      const countForDate = reports.filter((r) => r.reportDate === d).length;

      if (!groupsMap.has(monthKey)) {
        const countInMonth = reports.filter((r) => (r.reportDate || '').startsWith(monthKey)).length;
        groupsMap.set(monthKey, {
          monthKey,
          monthName,
          thaiYear,
          monthLabel,
          dates: [],
          totalReportsInMonth: countInMonth,
        });
      }
      groupsMap.get(monthKey)!.dates.push({ date: d, reportCount: countForDate });
    });

    return Array.from(groupsMap.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [availableDates, reports]);

  // Selected Cycle/Date Filter Key:
  // 'custom' | 'single:YYYY-MM-DD' | 'month:YYYY-MM' | 'all'
  // Default to today: 'single:' + todayStr
  const [selectedCycleKey, setSelectedCycleKey] = useState<string>(
    () => `single:${getTodayIsoDate()}`
  );
  const [customStartDate, setCustomStartDate] = useState<string>(
    () => getTodayIsoDate()
  );
  const [customEndDate, setCustomEndDate] = useState<string>(
    () => getTodayIsoDate()
  );

  // State for custom Month -> Daily dropdown
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState<boolean>(false);
  const [expandedMonthKey, setExpandedMonthKey] = useState<string | null>(null);
  const dateDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dateDropdownRef.current &&
        !dateDropdownRef.current.contains(event.target as Node)
      ) {
        setIsDateDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Selected Region
  const [selectedRegion, setSelectedRegion] = useState<string>('ทั้งหมด');

  // Selected Center / Mobile Unit filter:
  // 'all' | 'type:standard' | 'type:mobile' | 'center:<centerName>'
  const [selectedCenterFilter, setSelectedCenterFilter] = useState<string>('all');

  // Search input for office/province in table
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected Province/Report for drill-down to show specific province in cards and sections breakdown
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Reset drill-down and filters when user clicks the logo to return to the summary dashboard
  useEffect(() => {
    if (resetSignal) {
      setSelectedReportId(null);
      setSelectedRegion('ทั้งหมด');
      setSelectedCenterFilter('all');
      setSearchQuery('');
    }
  }, [resetSignal]);

  // Automatically clear selectedReportId if the report was deleted by Admin
  useEffect(() => {
    if (selectedReportId && !reports.some((r) => r.id === selectedReportId)) {
      setSelectedReportId(null);
    }
  }, [reports, selectedReportId]);

  // Automatically reset single-date filter to today if all reports for another selected date were deleted
  useEffect(() => {
    if (selectedCycleKey.startsWith('single:')) {
      const targetDate = selectedCycleKey.replace('single:', '');
      if (targetDate !== todayStr && !availableDates.includes(targetDate)) {
        setSelectedCycleKey(`single:${todayStr}`);
      }
    }
  }, [availableDates, selectedCycleKey, todayStr]);

  // Display text for the current selectedCycleKey in the Date selector button
  const selectedDateDisplayLabel = useMemo(() => {
    if (selectedCycleKey === 'all') {
      return `📊 ภาพรวมสะสมทั้งหมด (${reports.length} รายการ)`;
    }
    if (selectedCycleKey === 'custom') {
      return '📅 กำหนดช่วงวันที่เอง...';
    }
    if (selectedCycleKey.startsWith('month:')) {
      const ym = selectedCycleKey.replace('month:', '');
      const foundMonth = availableMonthGroups.find((g) => g.monthKey === ym);
      if (foundMonth) {
        return `🗓️ รวมทั้ง${foundMonth.monthLabel} (${foundMonth.dates.length} วัน)`;
      }
    }
    if (selectedCycleKey.startsWith('single:')) {
      const d = selectedCycleKey.replace('single:', '');
      return d === todayStr
        ? `รายวัน (วันนี้): ${formatThaiDateShort(d)} (${d})`
        : `รายวัน: ${formatThaiDateShort(d)} (${d})`;
    }
    return formatThaiDateShort(selectedCycleKey);
  }, [selectedCycleKey, reports.length, availableMonthGroups, todayStr]);

  // Computed Date Range / Period Bounds
  const { filterStartDate, filterEndDate, isCycleMode, activePeriodLabel } = useMemo(() => {
    if (selectedCycleKey === 'all') {
      return {
        filterStartDate: null,
        filterEndDate: null,
        isCycleMode: true,
        activePeriodLabel: 'ภาพรวมสะสมทั้งหมด (ทุกช่วงวัน)',
      };
    }
    if (selectedCycleKey.startsWith('month:')) {
      const ym = selectedCycleKey.replace('month:', '');
      const [yStr, mStr] = ym.split('-');
      const y = Number(yStr);
      const m = Number(mStr);
      const lastDay = new Date(y, m, 0).getDate();
      const start = `${ym}-01`;
      const end = `${ym}-${String(lastDay).padStart(2, '0')}`;
      const monthName = THAI_MONTHS_FULL[m - 1] || '';
      const thaiYear = y + 543;
      return {
        filterStartDate: start,
        filterEndDate: end,
        isCycleMode: true,
        activePeriodLabel: `ประจำเดือน${monthName} พ.ศ. ${thaiYear}`,
      };
    }
    if (selectedCycleKey.startsWith('cycle:')) {
      const parts = selectedCycleKey.split(':');
      const start = parts[1];
      const end = parts[2];
      return {
        filterStartDate: start,
        filterEndDate: end,
        isCycleMode: true,
        activePeriodLabel: `ช่วงวันที่: ${formatThaiDateRange(start, end).replace(' - ', ' – ')}`,
      };
    }
    if (selectedCycleKey === 'custom') {
      return {
        filterStartDate: customStartDate || null,
        filterEndDate: customEndDate || null,
        isCycleMode: true,
        activePeriodLabel: `ช่วงวันที่: ${formatThaiDateRange(customStartDate, customEndDate).replace(' - ', ' – ')}`,
      };
    }
    if (selectedCycleKey.startsWith('single:')) {
      const d = selectedCycleKey.replace('single:', '');
      return {
        filterStartDate: d,
        filterEndDate: d,
        isCycleMode: false,
        activePeriodLabel: `ประจำรอบวันที่ ${formatThaiDateFull(d)}`,
      };
    }
    return {
      filterStartDate: selectedCycleKey,
      filterEndDate: selectedCycleKey,
      isCycleMode: false,
      activePeriodLabel: `ประจำรอบวันที่ ${formatThaiDateFull(selectedCycleKey)}`,
    };
  }, [selectedCycleKey, customStartDate, customEndDate]);

  // Base reports matching Date, Region, and Search (before Center/Mobile Unit filter)
  const baseDateRegionReports = useMemo(() => {
    return reports.filter((r) => {
      const rDate = r.reportDate || '';
      let matchDate = true;
      if (filterStartDate && filterEndDate) {
        matchDate = rDate >= filterStartDate && rDate <= filterEndDate;
      } else if (filterStartDate) {
        matchDate = rDate >= filterStartDate;
      } else if (filterEndDate) {
        matchDate = rDate <= filterEndDate;
      }
      const matchRegion = selectedRegion === 'ทั้งหมด' || r.region === selectedRegion;
      const q = (searchQuery || '').toLowerCase().trim();
      const matchSearch =
        !q ||
        (r.officeName || '').toLowerCase().includes(q) ||
        (r.centerName || '').toLowerCase().includes(q) ||
        (r.reporterName || '').toLowerCase().includes(q);
      return matchDate && matchRegion && matchSearch;
    });
  }, [reports, filterStartDate, filterEndDate, selectedRegion, searchQuery]);

  // Helper to check if a report matches selectedCenterFilter
  const matchesCenterFilter = (r: DOEReport, filterVal: string): boolean => {
    if (!filterVal || filterVal === 'all') return true;
    const isMob = isMobileUnitCenter(r.centerName, r.region);
    if (filterVal === 'type:mobile') return isMob;
    if (filterVal === 'type:standard') return !isMob;
    if (filterVal.startsWith('center:')) {
      const targetCenter = filterVal.replace('center:', '');
      return (r.centerName || '').trim() === targetCenter.trim();
    }
    return true;
  };

  // 1. In Dashboard: ONLY show reported reports matching all active filters (including Center / Mobile Unit)
  const reportedList = useMemo(() => {
    return baseDateRegionReports.filter((r) => matchesCenterFilter(r, selectedCenterFilter));
  }, [baseDateRegionReports, selectedCenterFilter]);

  // Group and sort reported list by region for the Province selector (deduplicated per officeId)
  const groupedReportedList = useMemo(() => {
    const groups: Record<string, DOEReport[]> = {};
    const seenOffices = new Set<string>();
    for (const r of baseDateRegionReports) {
      const officeKey = r.officeId || r.id;
      if (seenOffices.has(officeKey)) continue;
      seenOffices.add(officeKey);
      const reg = r.region || 'อื่นๆ';
      if (!groups[reg]) groups[reg] = [];
      groups[reg].push(r);
    }
    for (const reg in groups) {
      groups[reg].sort((a, b) => (a.officeName || '').localeCompare(b.officeName || '', 'th'));
    }
    return REGION_ORDER
      .filter((reg) => groups[reg] && groups[reg].length > 0)
      .map((reg) => ({
        region: reg,
        regionLabel: getRegionLabel(reg),
        reports: groups[reg],
      }));
  }, [baseDateRegionReports]);

  // Active selected report (if user picked a province from the table or dropdown)
  const activeSelectedReport = useMemo(() => {
    if (!selectedReportId) return null;
    return (
      reportedList.find((r) => r.id === selectedReportId) ||
      baseDateRegionReports.find((r) => r.id === selectedReportId) ||
      reports.find((r) => r.id === selectedReportId) ||
      null
    );
  }, [reportedList, baseDateRegionReports, selectedReportId, reports]);

  // Available Centers / Mobile Unit options for the current selection (Province or Region/Overview)
  const centerFilterOptions = useMemo(() => {
    const scopedReports = activeSelectedReport
      ? baseDateRegionReports.filter((r) => r.officeId === activeSelectedReport.officeId)
      : baseDateRegionReports;

    let standardCount = 0;
    let mobileCount = 0;
    const centerMap = new Map<string, { name: string; count: number; isMobile: boolean }>();

    // If a specific province is selected, pre-populate its standard center & Mobile Unit so user always sees both choices
    if (activeSelectedReport) {
      const officeConfig = (offices && offices.length > 0 ? offices : EMPLOYMENT_OFFICES).find(
        (o) => o.id === activeSelectedReport.officeId
      );
      const stdCenterName =
        officeConfig?.centerName ||
        (!isMobileUnitCenter(activeSelectedReport.centerName, activeSelectedReport.region)
          ? activeSelectedReport.centerName
          : '');
      if (stdCenterName) {
        centerMap.set(stdCenterName, {
          name: stdCenterName,
          count: 0,
          isMobile: false,
        });
      }
      centerMap.set(MOBILE_UNIT_DEFAULT_LABEL, {
        name: MOBILE_UNIT_DEFAULT_LABEL,
        count: 0,
        isMobile: true,
      });
    }

    scopedReports.forEach((r) => {
      const isMob = isMobileUnitCenter(r.centerName, r.region);
      if (isMob) mobileCount += 1;
      else standardCount += 1;

      const cName = (r.centerName || '').trim();
      if (cName) {
        const existing = centerMap.get(cName);
        if (existing) {
          existing.count += 1;
        } else {
          centerMap.set(cName, {
            name: cName,
            count: 1,
            isMobile: isMob,
          });
        }
      }
    });

    const distinctCenters = Array.from(centerMap.values()).sort((a, b) => {
      if (a.isMobile !== b.isMobile) return a.isMobile ? 1 : -1;
      return a.name.localeCompare(b.name, 'th');
    });

    return {
      totalCount: scopedReports.length,
      standardCount,
      mobileCount,
      distinctCenters,
    };
  }, [activeSelectedReport, baseDateRegionReports, offices]);

  // Reports belonging to the selected office (filtered by selectedCenterFilter)
  const selectedOfficeReports = useMemo(() => {
    if (!selectedReportId || !activeSelectedReport) return [];
    const matchingInFilter = reportedList.filter(
      (r) => r.officeId === activeSelectedReport.officeId
    );
    if (matchingInFilter.length > 0) return matchingInFilter;
    // If the user selected a center type that has 0 reports for this province in the active period, return empty stats for that province+center
    if (selectedCenterFilter !== 'all') {
      return [];
    }
    return [activeSelectedReport];
  }, [selectedReportId, activeSelectedReport, reportedList, selectedCenterFilter]);

  // 2. Regional / National Metrics Summary
  const {
    totalOfficesInRegion,
    reportedOfficesCount,
    pendingOfficesCount,
    reportingComplianceRate,
    nationalStats,
  } = useMemo(() => {
    const officeList = (offices && offices.length > 0 ? offices : EMPLOYMENT_OFFICES).filter(
      (o) => o.region !== 'ส่วนกลาง' && o.id !== 'doe-hq'
    );
    const officesInRegion = officeList.filter(
      (o) => selectedRegion === 'ทั้งหมด' || o.region === selectedRegion
    );

    // Unique office IDs that reported in the active filter
    const uniqueReportedOfficeIds = new Set(reportedList.map((r) => r.officeId));
    const reportedCount = uniqueReportedOfficeIds.size;
    const pendingCount = Math.max(0, officesInRegion.length - reportedCount);
    const complianceRate =
      officesInRegion.length > 0
        ? Math.round((reportedCount / officesInRegion.length) * 100)
        : 0;

    let totalQueue = 0;
    let totalIssued = 0;
    let totalVerified = 0;
    let totalNotIssued = 0;
    let totalMissed = 0;
    let totalWrongDate = 0;

    let sec59 = 0;
    let sec62 = 0;
    let sec63_1 = 0;
    let sec63_2 = 0;
    let sec64 = 0;
    let secModify = 0;
    let secSub = 0;
    const customSums: Record<string, number> = {};
    const customQueueSums: Record<string, number> = {};

    let secMOU = 0;
    reportedList.forEach((report) => {
      totalQueue += report.queueAppointment || 0;
      const groupSum = calculateReportTotalSections(report, categories);
      totalIssued += Math.max(report.cardsIssued || 0, groupSum);
      totalVerified += report.identityVerified || 0;
      totalNotIssued += report.cardsNotIssued || 0;
      totalMissed += report.missedAppointment || 0;
      totalWrongDate += report.wrongAppointmentDate || 0;

      sec59 += report.section59 || 0;
      sec62 += report.section62 || 0;
      sec63_1 += report.section63_1 || 0;
      sec63_2 += report.section63_2 || 0;
      sec64 += report.section64 || 0;
      secMOU += report.mouGroup || report.customCategoryValues?.['mouGroup'] || 0;
      secModify += report.modifyDetails || 0;
      secSub += report.substituteCard || 0;

      if (report.customCategoryValues) {
        Object.entries(report.customCategoryValues).forEach(([k, v]) => {
          if (k !== 'mouGroup') {
            customSums[k] = (customSums[k] || 0) + (Number(v) || 0);
          }
        });
      }
      if (report.customQueueValues) {
        Object.entries(report.customQueueValues).forEach(([k, v]) => {
          customQueueSums[k] = (customQueueSums[k] || 0) + (Number(v) || 0);
        });
      }
    });

    const totalSections =
      sec59 + sec62 + sec63_1 + sec63_2 + sec64 + secMOU + secModify + secSub +
      Object.values(customSums).reduce((a, b) => a + b, 0);
    const successRate =
      totalQueue > 0 ? ((totalIssued / totalQueue) * 100).toFixed(1) : '0';
    const missedRate =
      totalQueue > 0 ? ((totalMissed / totalQueue) * 100).toFixed(1) : '0';
    const wrongDayRate =
      totalQueue > 0 ? ((totalWrongDate / totalQueue) * 100).toFixed(1) : '0';
    const notIssuedRate =
      totalQueue > 0 ? ((totalNotIssued / totalQueue) * 100).toFixed(1) : '0';

    return {
      totalOfficesInRegion: officesInRegion.length,
      reportedOfficesCount: reportedCount,
      pendingOfficesCount: pendingCount,
      reportingComplianceRate: complianceRate,
      nationalStats: {
        totalQueue,
        totalIssued,
        totalVerified,
        totalNotIssued,
        totalMissed,
        totalWrongDate,
        totalSections,
        successRate,
        missedRate,
        wrongDayRate,
        notIssuedRate,
        sec59,
        sec62,
        sec63_1,
        sec63_2,
        sec64,
        secMOU,
        secModify,
        secSub,
        customSums,
        customQueueSums,
      },
    };
  }, [reportedList, selectedRegion, offices, categories]);

  // 3. Compute Displayed Statistics (Shows single province if selected, or aggregate otherwise)
  const displayedStats = useMemo(() => {
    if (selectedReportId && activeSelectedReport) {
      const rep = selectedOfficeReports[0] || activeSelectedReport;
      let totalQueue = 0;
      let totalIssued = 0;
      let totalVerified = 0;
      let totalNotIssued = 0;
      let totalMissed = 0;
      let totalWrongDate = 0;
      let sec59 = 0;
      let sec62 = 0;
      let sec63_1 = 0;
      let sec63_2 = 0;
      let sec64 = 0;
      let secModify = 0;
      let secSub = 0;
      const customSums: Record<string, number> = {};
      const customQueueSums: Record<string, number> = {};

      let secMOU = 0;
      selectedOfficeReports.forEach((r) => {
        totalQueue += r.queueAppointment || 0;
        const groupSum = calculateReportTotalSections(r, categories);
        totalIssued += Math.max(r.cardsIssued || 0, groupSum);
        totalVerified += r.identityVerified || 0;
        totalNotIssued += r.cardsNotIssued || 0;
        totalMissed += r.missedAppointment || 0;
        totalWrongDate += r.wrongAppointmentDate || 0;
        sec59 += r.section59 || 0;
        sec62 += r.section62 || 0;
        sec63_1 += r.section63_1 || 0;
        sec63_2 += r.section63_2 || 0;
        sec64 += r.section64 || 0;
        secMOU += r.mouGroup || r.customCategoryValues?.['mouGroup'] || 0;
        secModify += r.modifyDetails || 0;
        secSub += r.substituteCard || 0;
        if (r.customCategoryValues) {
          Object.entries(r.customCategoryValues).forEach(([k, v]) => {
            if (k !== 'mouGroup') {
              customSums[k] = (customSums[k] || 0) + (Number(v) || 0);
            }
          });
        }
        if (r.customQueueValues) {
          Object.entries(r.customQueueValues).forEach(([k, v]) => {
            customQueueSums[k] = (customQueueSums[k] || 0) + (Number(v) || 0);
          });
        }
      });

      const totalSections =
        sec59 + sec62 + sec63_1 + sec63_2 + sec64 + secMOU + secModify + secSub +
        Object.values(customSums).reduce((a, b) => a + b, 0);

      const successRate =
        totalQueue > 0 ? ((totalIssued / totalQueue) * 100).toFixed(1) : '0';
      const missedRate =
        totalQueue > 0 ? ((totalMissed / totalQueue) * 100).toFixed(1) : '0';
      const wrongDayRate =
        totalQueue > 0 ? ((totalWrongDate / totalQueue) * 100).toFixed(1) : '0';
      const notIssuedRate =
        totalQueue > 0 ? ((totalNotIssued / totalQueue) * 100).toFixed(1) : '0';

      let resolvedCenterName = rep.centerName;
      if (selectedCenterFilter === 'type:mobile') {
        resolvedCenterName = MOBILE_UNIT_DEFAULT_LABEL;
      } else if (selectedCenterFilter.startsWith('center:')) {
        resolvedCenterName = selectedCenterFilter.replace('center:', '');
      }

      return {
        isDrilldown: true,
        officeId: activeSelectedReport.officeId,
        officeName: activeSelectedReport.officeName,
        centerName: resolvedCenterName,
        reportDate: activePeriodLabel,
        totalQueue,
        totalIssued,
        totalVerified,
        totalNotIssued,
        totalMissed,
        totalWrongDate,
        totalSections,
        successRate,
        missedRate,
        wrongDayRate,
        notIssuedRate,
        sec59,
        sec62,
        sec63_1,
        sec63_2,
        sec64,
        secMOU,
        secModify,
        secSub,
        customSums,
        customQueueSums,
      };
    }

    const baseOverviewTitle =
      selectedRegion === 'ทั้งหมด'
        ? 'ภาพรวมทั้งประเทศ'
        : selectedRegion === 'เฉพาะกิจ'
        ? 'รวมศูนย์เฉพาะกิจ'
        : selectedRegion;

    const centerSuffix =
      selectedCenterFilter === 'type:mobile'
        ? ' (เฉพาะหน่วยบริการเคลื่อนที่ Mobile Unit)'
        : selectedCenterFilter === 'type:standard'
        ? ' (เฉพาะศูนย์บริการประจำสำนักงาน)'
        : selectedCenterFilter.startsWith('center:')
        ? ` (${selectedCenterFilter.replace('center:', '')})`
        : '';

    return {
      isDrilldown: false,
      officeId: 'overview',
      officeName: `${baseOverviewTitle}${centerSuffix}`,
      centerName:
        selectedCenterFilter === 'type:mobile'
          ? MOBILE_UNIT_DEFAULT_LABEL
          : selectedCenterFilter.startsWith('center:')
          ? selectedCenterFilter.replace('center:', '')
          : selectedRegion === 'เฉพาะกิจ'
          ? 'รวมศูนย์เฉพาะกิจ'
          : '',
      reportDate: activePeriodLabel,
      totalQueue: nationalStats.totalQueue,
      totalIssued: nationalStats.totalIssued,
      totalVerified: nationalStats.totalVerified,
      totalNotIssued: nationalStats.totalNotIssued,
      totalMissed: nationalStats.totalMissed,
      totalWrongDate: nationalStats.totalWrongDate,
      totalSections: nationalStats.totalSections,
      successRate: nationalStats.successRate,
      missedRate: nationalStats.missedRate,
      wrongDayRate: nationalStats.wrongDayRate,
      notIssuedRate: nationalStats.notIssuedRate,
      sec59: nationalStats.sec59,
      sec62: nationalStats.sec62,
      sec63_1: nationalStats.sec63_1,
      sec63_2: nationalStats.sec63_2,
      sec64: nationalStats.sec64,
      secMOU: nationalStats.secMOU,
      secModify: nationalStats.secModify,
      secSub: nationalStats.secSub,
      customSums: nationalStats.customSums,
      customQueueSums: nationalStats.customQueueSums,
    };
  }, [
    selectedReportId,
    activeSelectedReport,
    selectedOfficeReports,
    nationalStats,
    selectedRegion,
    selectedCenterFilter,
    activePeriodLabel,
    categories,
  ]);

  // Helper to build a DOEReport object for the infographic poster reflecting the active period / cycle
  const buildPosterReport = (
    mode: 'overview' | 'office',
    targetOfficeId?: string
  ): DOEReport => {
    const isMobileFilter =
      selectedCenterFilter === 'type:mobile' ||
      selectedRegion === 'เฉพาะกิจ' ||
      (selectedCenterFilter.startsWith('center:') &&
        isMobileUnitCenter(selectedCenterFilter.replace('center:', '')));

    const explicitCenterName = selectedCenterFilter.startsWith('center:')
      ? selectedCenterFilter.replace('center:', '')
      : null;

    // If a specific standard center name is chosen in Overview mode, check if it belongs to a specific office
    const matchedOfficeByCenter =
      explicitCenterName && !isMobileFilter
        ? (offices && offices.length > 0 ? offices : EMPLOYMENT_OFFICES).find(
            (o) => (o.centerName || '').trim() === explicitCenterName.trim()
          )
        : undefined;

    const effectiveTargetOfficeId =
      mode === 'office'
        ? targetOfficeId
        : matchedOfficeByCenter
        ? matchedOfficeByCenter.id
        : undefined;

    const isOverview = mode === 'overview' && !effectiveTargetOfficeId;
    const targetReports = isOverview
      ? reportedList
      : reportedList.filter((r) => r.officeId === effectiveTargetOfficeId);

    const targetOfficeObj =
      offices?.find((o) => o.id === effectiveTargetOfficeId) ||
      EMPLOYMENT_OFFICES.find((o) => o.id === effectiveTargetOfficeId);

    const baseRep =
      targetReports[0] ||
      reports.find((r) => r.officeId === effectiveTargetOfficeId) ||
      (targetOfficeObj
        ? ({
            officeId: targetOfficeObj.id,
            officeName: targetOfficeObj.name,
            officeNameEn: targetOfficeObj.nameEn,
            centerName: targetOfficeObj.centerName,
            region: targetOfficeObj.region,
          } as DOEReport)
        : null) ||
      reports[0];

    let totalQueue = 0;
    let totalIssued = 0;
    let totalVerified = 0;
    let totalNotIssued = 0;
    let totalMissed = 0;
    let totalWrongDate = 0;
    let cumulativeCards = 0;

    let sec59 = 0;
    let sec62 = 0;
    let sec63_1 = 0;
    let sec63_2 = 0;
    let sec64 = 0;
    let secMOU = 0;
    let secModify = 0;
    let secSub = 0;

    const posterCustomSums: Record<string, number> = {};
    const posterCustomQueueSums: Record<string, number> = {};

    targetReports.forEach((r) => {
      totalQueue += r.queueAppointment || 0;
      const grpSum = calculateReportTotalSections(r, categories);
      totalIssued += Math.max(r.cardsIssued || 0, grpSum);
      totalVerified += r.identityVerified || 0;
      totalNotIssued += r.cardsNotIssued || 0;
      totalMissed += r.missedAppointment || 0;
      totalWrongDate += r.wrongAppointmentDate || 0;
      cumulativeCards = Math.max(cumulativeCards, r.cumulativeCardsIssued || 0);

      sec59 += r.section59 || 0;
      sec62 += r.section62 || 0;
      sec63_1 += r.section63_1 || 0;
      sec63_2 += r.section63_2 || 0;
      sec64 += r.section64 || 0;
      secMOU += r.mouGroup || r.customCategoryValues?.['mouGroup'] || 0;
      secModify += r.modifyDetails || 0;
      secSub += r.substituteCard || 0;

      if (r.customCategoryValues) {
        Object.entries(r.customCategoryValues).forEach(([k, v]) => {
          if (k !== 'mouGroup') {
            posterCustomSums[k] = (posterCustomSums[k] || 0) + (Number(v) || 0);
          }
        });
      }
      if (r.customQueueValues) {
        Object.entries(r.customQueueValues).forEach(([k, v]) => {
          posterCustomQueueSums[k] = (posterCustomQueueSums[k] || 0) + (Number(v) || 0);
        });
      }
    });

    const officeName = isOverview
      ? isMobileFilter
        ? selectedRegion === 'ทั้งหมด' || selectedRegion === 'เฉพาะกิจ'
          ? 'หน่วยบริการใบอนุญาตทำงานของคนต่างด้าวแบบเคลื่อนที่ (Mobile Unit)'
          : `หน่วยบริการเคลื่อนที่ (Mobile Unit) (${selectedRegion})`
        : explicitCenterName
        ? explicitCenterName
        : selectedRegion === 'ทั้งหมด'
        ? 'ศูนย์บริการใบอนุญาตทำงาน (ภาพรวมทั้งประเทศ)'
        : `ศูนย์บริการใบอนุญาตทำงาน (${selectedRegion})`
      : targetOfficeObj?.name || baseRep?.officeName || 'สำนักงานจัดหางาน';

    const officeNameEn = isOverview
      ? isMobileFilter
        ? selectedRegion === 'ทั้งหมด' || selectedRegion === 'เฉพาะกิจ'
          ? 'Foreign Workers Employment Mobile Unit (National Overview)'
          : `Foreign Workers Employment Mobile Unit (${selectedRegion})`
        : selectedRegion === 'ทั้งหมด'
        ? 'Foreign Workers Employment Center (National Overview)'
        : selectedRegion === 'เฉพาะกิจ'
        ? 'Foreign Workers Employment Center (Special Task Force)'
        : `Foreign Workers Employment Center (${selectedRegion})`
      : targetOfficeObj?.nameEn || baseRep?.officeNameEn || 'Provincial Employment Office';

    const centerName = isOverview
      ? isMobileFilter
        ? explicitCenterName || MOBILE_UNIT_DEFAULT_LABEL
        : explicitCenterName
        ? explicitCenterName
        : selectedCenterFilter === 'type:standard'
        ? selectedRegion === 'ทั้งหมด'
          ? 'ศูนย์บริการประจำสำนักงาน (76 จังหวัด + กทม. 10 พื้นที่)'
          : `ศูนย์บริการประจำสำนักงานในพื้นที่ ${selectedRegion}`
        : selectedRegion === 'ทั้งหมด'
        ? 'ภาพรวม 76 จังหวัด + กทม. 10 พื้นที่'
        : selectedRegion === 'เฉพาะกิจ'
        ? MOBILE_UNIT_DEFAULT_LABEL
        : `รวมสำนักงานจัดหางานในพื้นที่ ${selectedRegion}`
      : isMobileFilter
      ? explicitCenterName || MOBILE_UNIT_DEFAULT_LABEL
      : explicitCenterName
      ? explicitCenterName
      : selectedCenterFilter === 'type:standard'
      ? targetOfficeObj?.centerName || baseRep?.centerName || 'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว'
      : baseRep?.centerName || targetOfficeObj?.centerName || 'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว';

    return {
      id: `poster-cycle-${Date.now()}`,
      reportDate: baseRep?.reportDate || todayStr,
      reportDateThaiStr: activePeriodLabel,
      officeId: isOverview ? 'overview' : baseRep?.officeId || 'chiangrai',
      officeName,
      officeNameEn,
      centerName,
      region: isOverview ? selectedRegion : baseRep?.region || 'ภาคเหนือ',
      reporterName: isCycleMode || selectedCycleKey.startsWith('cycle:') || isOverview
        ? 'สำนักบริหารแรงงานต่างด้าว'
        : baseRep?.reporterName || 'สำนักบริหารแรงงานต่างด้าว',
      reporterPosition: isCycleMode || selectedCycleKey.startsWith('cycle:') || isOverview
        ? 'กรมการจัดหางาน กระทรวงแรงงาน'
        : baseRep?.reporterPosition || 'นักวิชาการแรงงาน',
      phoneNumber: isCycleMode || selectedCycleKey.startsWith('cycle:') || isOverview
        ? '02-354-0082'
        : baseRep?.phoneNumber || '02-354-0082',
      lineId: baseRep?.lineId || '@doe_news',
      section59: sec59,
      section62: sec62,
      section63_1: sec63_1,
      section63_2: sec63_2,
      section64: sec64,
      mouGroup: secMOU,
      modifyDetails: secModify,
      substituteCard: secSub,
      customCategoryValues: posterCustomSums,
      customQueueValues: posterCustomQueueSums,
      queueAppointment: totalQueue,
      cardsIssued: totalIssued,
      identityVerified: totalVerified,
      cardsNotIssued: totalNotIssued,
      missedAppointment: totalMissed,
      wrongAppointmentDate: totalWrongDate,
      cumulativeCardsIssued: cumulativeCards || totalIssued,
      cumulativeSinceDate: '13 ตุลาคม 2568',
      notes: `สรุปผลการปฏิบัติงาน ${activePeriodLabel}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  // Dynamic Section breakdown array based on activeCategories & displayedStats
  const sectionBreakdown = useMemo(() => {
    return activeCategories.map((cat, i) => {
      let count = 0;
      if (cat.id === 'section59') count = displayedStats.sec59;
      else if (cat.id === 'section62') count = displayedStats.sec62;
      else if (cat.id === 'section63_1') count = displayedStats.sec63_1;
      else if (cat.id === 'section63_2') count = displayedStats.sec63_2;
      else if (cat.id === 'section64') count = displayedStats.sec64;
      else if (cat.id === 'mouGroup') count = displayedStats.secMOU;
      else if (cat.id === 'modifyDetails') count = displayedStats.secModify;
      else if (cat.id === 'substituteCard') count = displayedStats.secSub;
      else count = displayedStats.customSums?.[cat.id] || 0;

      let color = cat.color || 'bg-sky-500';
      if (cat.id === 'section59') color = 'bg-sky-500';
      else if (cat.id === 'section62') color = 'bg-blue-600';
      else if (cat.id === 'section63_1') color = 'bg-indigo-500';
      else if (cat.id === 'section63_2') color = 'bg-blue-800';
      else if (cat.id === 'section64') color = 'bg-teal-500';
      else if (cat.id === 'mouGroup') color = 'bg-emerald-600';
      else if (cat.id === 'modifyDetails') color = 'bg-violet-600';
      else if (cat.id === 'substituteCard') color = 'bg-amber-500';

      return {
        id: cat.id,
        label: `${i + 1}. ${cat.title}`,
        sub: cat.subLabel || cat.code,
        count,
        color,
      };
    });
  }, [activeCategories, displayedStats]);

  const maxSec = Math.max(...sectionBreakdown.map((s) => s.count), 1);
  const topSec = useMemo(() => {
    return [...sectionBreakdown].sort((a, b) => b.count - a.count)[0];
  }, [sectionBreakdown]);

  return (
    <div className="space-y-6">
      {/* 1. TOP NATIONAL DASHBOARD CONTROL BAR */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0f2856] via-blue-900 to-sky-800 text-white flex items-center justify-center shadow-md ring-4 ring-blue-50 shrink-0">
                <Globe2 className="w-6 h-6 text-amber-300" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider bg-gradient-to-r from-blue-900 to-indigo-900 text-amber-300 px-3 py-0.5 rounded-full shadow-2xs">
                    DOE National Overview
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-slate-500 hidden sm:inline">
                    • ครอบคลุม 76 จังหวัด + กทม. 10 พื้นที่
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight mt-1 font-['Prompt'] tracking-tight">
                  แดชบอร์ดสรุปผลการปฏิบัติงานภาพรวมทั้งประเทศ
                </h2>
              </div>
            </div>
          </div>

          {/* Date, Region, Province & Center/Mobile Unit Selectors + Primary Actions */}
          <div className="w-full bg-gradient-to-r from-slate-50/95 via-sky-50/40 to-slate-50/95 p-3 sm:p-3.5 rounded-2xl border border-slate-200/90 shadow-inner flex flex-wrap items-stretch gap-2.5">
            {/* 1. Date / Period Cycle Filter (Grouped by Month & Buddhist Year -> Click Month to show Daily) */}
            <div
              ref={dateDropdownRef}
              className="relative flex items-center gap-2.5 bg-white hover:border-blue-300 border border-slate-200/90 rounded-xl px-3 py-2 text-sm shadow-2xs transition-all min-w-[230px] flex-1 sm:flex-initial"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center shrink-0">
                <CalendarRange className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-400 leading-none mb-1">
                  รอบ / ช่วงวันที่รายงาน
                </span>
                <button
                  type="button"
                  id="dashboard-date-filter"
                  onClick={() => {
                    setIsDateDropdownOpen((prev) => {
                      const nextOpen = !prev;
                      if (nextOpen) {
                        setExpandedMonthKey(null);
                      }
                      return nextOpen;
                    });
                  }}
                  className="w-full flex items-center justify-between gap-2 bg-transparent font-extrabold text-slate-900 focus:outline-hidden cursor-pointer text-xs sm:text-sm text-left leading-tight"
                >
                  <span className="truncate">{selectedDateDisplayLabel}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                      isDateDropdownOpen ? 'rotate-180 text-blue-700' : ''
                    }`}
                  />
                </button>
              </div>

              {isDateDropdownOpen && (
                <div className="absolute left-0 top-full mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden">
                  {/* Top Options: Custom Range & All Cumulative */}
                  <div className="p-2 border-b border-slate-100 bg-slate-50/70 space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCycleKey('custom');
                        setSelectedReportId(null);
                        setIsDateDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-between transition-colors cursor-pointer ${
                        selectedCycleKey === 'custom'
                          ? 'bg-blue-900 text-white'
                          : 'text-slate-700 hover:bg-slate-200/70'
                      }`}
                    >
                      <span>📅 กำหนดช่วงวันที่เอง (ระบุวันเริ่ม - สิ้นสุด)...</span>
                      {selectedCycleKey === 'custom' && <Check className="w-4 h-4 shrink-0" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCycleKey('all');
                        setSelectedReportId(null);
                        setIsDateDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-between transition-colors cursor-pointer ${
                        selectedCycleKey === 'all'
                          ? 'bg-blue-900 text-white'
                          : 'text-slate-700 hover:bg-slate-200/70'
                      }`}
                    >
                      <span>📊 ภาพรวมสะสมทั้งหมด ({reports.length} รายการ)</span>
                      {selectedCycleKey === 'all' && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  </div>

                  {/* Grouped by Month & Buddhist Era Year (ปี พ.ศ.) */}
                  <div className="p-2.5 max-h-80 overflow-y-auto space-y-1.5">
                    <div className="px-2 py-1 flex items-center justify-between">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                        📆 เลือกดูแบบรายวัน (คลิกเลือกเดือนเพื่อดูรายวัน)
                      </span>
                    </div>

                    {availableMonthGroups.map((group) => {
                      const isExpanded = expandedMonthKey === group.monthKey;
                      const isActiveMonth =
                        selectedCycleKey === `month:${group.monthKey}` ||
                        (selectedCycleKey.startsWith('single:') &&
                          selectedCycleKey.replace('single:', '').startsWith(group.monthKey));

                      return (
                        <div
                          key={group.monthKey}
                          className={`rounded-xl border transition-all overflow-hidden ${
                            isExpanded
                              ? 'border-blue-300 bg-blue-50/30 shadow-2xs'
                              : isActiveMonth
                              ? 'border-sky-200 bg-sky-50/50'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          {/* Month Header Button: Click to expand/collapse daily options */}
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedMonthKey((prev) =>
                                prev === group.monthKey ? null : group.monthKey
                              )
                            }
                            className="w-full px-3 py-2.5 text-left flex items-center justify-between gap-2 hover:bg-blue-50/70 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                  isExpanded || isActiveMonth
                                    ? 'bg-blue-900 text-amber-300'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {isExpanded ? (
                                  <FolderOpen className="w-4 h-4" />
                                ) : (
                                  <Folder className="w-4 h-4" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-extrabold text-slate-900 font-['Prompt'] truncate">
                                  {group.monthLabel}
                                </div>
                                <div className="text-[11px] text-slate-500 font-medium">
                                  มีข้อมูล {group.dates.length} วัน • รวม {group.totalReportsInMonth} รายงาน
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-900">
                                {isExpanded ? 'ซ่อนรายวัน' : 'คลิกดูรายวัน'}
                              </span>
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-blue-700" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                          </button>

                          {/* Expanded Daily List inside the selected Month */}
                          {isExpanded && (
                            <div className="px-2.5 pb-2.5 pt-1 border-t border-blue-100 bg-white space-y-1">
                              {group.dates.map(({ date: d, reportCount }) => {
                                const isSelectedDay = selectedCycleKey === `single:${d}`;
                                const isToday = d === todayStr;
                                return (
                                  <button
                                    key={`single:${d}`}
                                    type="button"
                                    onClick={() => {
                                      setSelectedCycleKey(`single:${d}`);
                                      setSelectedReportId(null);
                                      setIsDateDropdownOpen(false);
                                    }}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                                      isSelectedDay
                                        ? 'bg-blue-900 text-white shadow-2xs'
                                        : 'text-slate-800 hover:bg-sky-50'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <Calendar
                                        className={`w-3.5 h-3.5 shrink-0 ${
                                          isSelectedDay ? 'text-amber-300' : 'text-sky-600'
                                        }`}
                                      />
                                      <span className="truncate">
                                        {isToday
                                          ? `รายวัน (วันนี้): ${formatThaiDateShort(d)} (${d})`
                                          : `รายวัน: ${formatThaiDateShort(d)} (${d})`}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span
                                        className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                                          isSelectedDay
                                            ? 'bg-blue-800 text-amber-200'
                                            : 'bg-slate-100 text-slate-600'
                                        }`}
                                      >
                                        {reportCount} แห่ง
                                      </span>
                                      {isSelectedDay && <Check className="w-3.5 h-3.5 text-amber-300" />}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Region Selector */}
            <div className="flex items-center gap-2.5 bg-white hover:border-indigo-300 border border-slate-200/90 rounded-xl px-3 py-2 text-sm shadow-2xs transition-all min-w-[195px] flex-1 sm:flex-initial">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center shrink-0">
                <Filter className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="dashboard-region-filter"
                  className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-400 leading-none mb-1"
                >
                  ภูมิภาค
                </label>
                <select
                  id="dashboard-region-filter"
                  value={selectedRegion}
                  onChange={(e) => {
                    setSelectedRegion(e.target.value);
                    setSelectedReportId(null);
                  }}
                  className="w-full bg-transparent font-extrabold text-blue-950 focus:outline-hidden cursor-pointer text-xs sm:text-sm leading-tight truncate"
                >
                  <option value="ทั้งหมด">ภาพรวมทั้งประเทศ (ทุกภาค)</option>
                  <option value="กรุงเทพมหานคร">กรุงเทพมหานคร (10 พื้นที่)</option>
                  <option value="ภาคกลางและตะวันตก">ภาคกลางและตะวันตก (16 จังหวัด)</option>
                  <option value="ภาคตะวันออก">ภาคตะวันออก (8 จังหวัด)</option>
                  <option value="ภาคตะวันออกเฉียงเหนือ">ภาคตะวันออกเฉียงเหนือ (20 จังหวัด)</option>
                  <option value="ภาคเหนือ">ภาคเหนือ (17 จังหวัด)</option>
                  <option value="ภาคใต้">ภาคใต้ (14 จังหวัด)</option>
                  <option value="เฉพาะกิจ">เฉพาะกิจ (Mobile Unit)</option>
                </select>
              </div>
            </div>

            {/* 3. Province Quick Selector (Grouped by Region) */}
            <div
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm shadow-2xs border transition-all min-w-[205px] flex-1 sm:flex-initial ${
                activeSelectedReport
                  ? 'bg-sky-50/90 border-sky-300 ring-2 ring-sky-200/50'
                  : 'bg-white hover:border-sky-300 border-slate-200/90'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                  activeSelectedReport
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-sky-50 text-sky-700 border-sky-100'
                }`}
              >
                <Building2 className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="dashboard-province-filter"
                  className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-400 leading-none mb-1"
                >
                  เลือกพื้นที่ / จังหวัด
                </label>
                <select
                  id="dashboard-province-filter"
                  value={
                    activeSelectedReport
                      ? groupedReportedList
                          .flatMap((g) => g.reports)
                          .find((r) => r.officeId === activeSelectedReport.officeId)?.id ||
                        selectedReportId ||
                        'all'
                      : 'all'
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedReportId(val === 'all' ? null : val);
                    setSelectedCenterFilter('all');
                  }}
                  className="w-full bg-transparent font-extrabold text-blue-950 focus:outline-hidden cursor-pointer max-w-[200px] truncate text-xs sm:text-sm leading-tight"
                >
                  <option value="all">
                    ดูภาพรวมทั้งหมด ({groupedReportedList.reduce((acc, g) => acc + g.reports.length, 0)} จังหวัด)
                  </option>
                  {groupedReportedList.map((group) => (
                    <optgroup key={group.region} label={group.regionLabel}>
                      {group.reports.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.officeName}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>

            {/* 4. Center / Mobile Unit Selector (ต่อจากการเลือกจังหวัด) */}
            <div
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm shadow-2xs border transition-all min-w-[225px] flex-1 sm:flex-initial ${
                selectedCenterFilter === 'type:mobile' ||
                (selectedCenterFilter.startsWith('center:') &&
                  isMobileUnitCenter(selectedCenterFilter.replace('center:', '')))
                  ? 'bg-gradient-to-r from-amber-50 via-orange-50/60 to-amber-50 border-amber-300 ring-2 ring-amber-200/60'
                  : selectedCenterFilter !== 'all'
                  ? 'bg-sky-50/90 border-sky-300 ring-2 ring-sky-200/50'
                  : 'bg-white hover:border-teal-300 border-slate-200/90'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                  selectedCenterFilter === 'type:mobile' ||
                  (selectedCenterFilter.startsWith('center:') &&
                    isMobileUnitCenter(selectedCenterFilter.replace('center:', '')))
                    ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                    : selectedCenterFilter !== 'all'
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-teal-50 text-teal-700 border-teal-100'
                }`}
              >
                {selectedCenterFilter === 'type:mobile' ||
                (selectedCenterFilter.startsWith('center:') &&
                  isMobileUnitCenter(selectedCenterFilter.replace('center:', ''))) ? (
                  <Truck className="w-4 h-4" />
                ) : (
                  <MapPin className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="dashboard-center-filter"
                  className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-400 leading-none mb-1"
                >
                  เลือกศูนย์ / Mobile Unit
                </label>
                <select
                  id="dashboard-center-filter"
                  value={selectedCenterFilter}
                  onChange={(e) => setSelectedCenterFilter(e.target.value)}
                  className="w-full bg-transparent font-extrabold text-blue-950 focus:outline-hidden cursor-pointer max-w-[230px] truncate text-xs sm:text-sm leading-tight"
                >
                  <option value="all">
                    {activeSelectedReport
                      ? `รวมทุกศูนย์ของจังหวัดนี้ (${centerFilterOptions.totalCount} รายการ)`
                      : `ทุกศูนย์บริการ + Mobile Unit (${centerFilterOptions.totalCount} รายการ)`}
                  </option>

                  <optgroup label="จำแนกตามรูปแบบบริการ (ศูนย์ประจำ vs Mobile Unit)">
                    <option value="type:standard">
                      🏢 ศูนย์บริการประจำสำนักงาน ({centerFilterOptions.standardCount} รายการ)
                    </option>
                    <option value="type:mobile">
                      🚚 หน่วยบริการเคลื่อนที่ (Mobile Unit) ({centerFilterOptions.mobileCount} รายการ)
                    </option>
                  </optgroup>

                  {centerFilterOptions.distinctCenters.length > 0 && (
                    <optgroup
                      label={
                        activeSelectedReport
                          ? `รายชื่อศูนย์ของ ${activeSelectedReport.officeName}`
                          : 'เลือกชื่อศูนย์บริการ / จุดบริการเฉพาะ'
                      }
                    >
                      {centerFilterOptions.distinctCenters.map((c) => (
                        <option key={c.name} value={`center:${c.name}`}>
                          {c.isMobile ? '🚚' : '🏢'} {c.name} ({c.count} รายการ)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>

            {/* 5. Action Buttons Group */}
            <div className="flex items-center gap-2 ml-auto flex-wrap sm:flex-nowrap">
              {/* View Infographic Poster for the active cycle / view */}
              <button
                type="button"
                onClick={() => {
                  const reportForPoster = buildPosterReport(
                    displayedStats.isDrilldown && activeSelectedReport ? 'office' : 'overview',
                    activeSelectedReport?.officeId
                  );
                  onSelectReport(reportForPoster);
                }}
                className="h-full min-h-[46px] text-xs sm:text-sm font-bold px-4 py-2.5 bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-700 hover:from-sky-500 hover:to-indigo-600 text-white rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer hover:shadow-md active:scale-95 shrink-0"
                title="เปิดดูและดาวน์โหลดโปสเตอร์สรุปผลตามรอบที่เลือก"
              >
                <Eye className="w-4 h-4 text-amber-300 shrink-0" />
                <span>
                  {selectedCycleKey === 'all'
                    ? 'ดูโปสเตอร์ภาพรวมสะสม'
                    : selectedCycleKey === 'custom'
                    ? 'ดูโปสเตอร์ตามช่วงวันที่'
                    : selectedCycleKey.startsWith('single:')
                    ? 'ดูโปสเตอร์ประจำวัน'
                    : 'ดูโปสเตอร์สรุปผล'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNewReport()}
                className="h-full min-h-[46px] text-xs sm:text-sm font-bold px-4 py-2.5 bg-[#0f2856] hover:bg-blue-900 text-white rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer hover:shadow-md active:scale-95 shrink-0"
              >
                <PlusCircle className="w-4 h-4 text-emerald-300 shrink-0" />
                <span>บันทึกรายงาน</span>
              </button>
            </div>
          </div>
        </div>

        {/* Custom Date Range Picker when "custom" is selected */}
        {selectedCycleKey === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 bg-blue-50/80 border border-blue-200 rounded-xl p-3 text-sm">
            <span className="font-bold text-blue-950 flex items-center gap-1.5 shrink-0">
              <Calendar className="w-4.5 h-4.5 text-blue-700" />
              <span>ระบุช่วงวันที่ต้องการดู:</span>
            </span>
            <div className="flex items-center gap-2">
              <label htmlFor="custom-start-date" className="text-xs text-slate-600 font-semibold shrink-0">
                ตั้งแต่วันที่:
              </label>
              <input
                id="custom-start-date"
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800 focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="custom-end-date" className="text-xs text-slate-600 font-semibold shrink-0">
                ถึงวันที่:
              </label>
              <input
                id="custom-end-date"
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800 focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>
        )}

        {/* 2. REAL-TIME REPORTING COMPLIANCE BAR & LINK TO PENDING */}
        <div className="bg-gradient-to-r from-slate-50 via-sky-50 to-indigo-50 border border-sky-100 rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
            <div>
              <span className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-sky-600" />
                <span>
                  สถานะการส่งรายงานประจำศูนย์ (
                  {selectedRegion === 'ทั้งหมด' ? 'ภาพรวมทั้งประเทศ' : selectedRegion}
                  ):
                </span>
              </span>
              <div className="flex flex-wrap items-center gap-2 mt-1 sm:mt-0 sm:inline-flex sm:ml-2">
                <span className="text-sm sm:text-base font-bold text-blue-950">
                  {activePeriodLabel}
                </span>
                {isCycleMode && (
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 border border-blue-200">
                    โหมดรอบช่วงวันที่
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm sm:text-base">
              <span className="flex items-center gap-1.5 font-bold text-emerald-800 bg-emerald-50 px-3.5 py-1.5 rounded-xl border border-emerald-200">
                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600" />
                <span>รายงานแล้ว: {reportedList.length} รายการ</span>
              </span>

              {onViewPendingInHistory ? (
                <button
                  type="button"
                  onClick={onViewPendingInHistory}
                  className="flex items-center gap-1.5 font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 px-3.5 py-1.5 rounded-xl border border-amber-300 transition-colors cursor-pointer group"
                  title="ดูรายชื่อสำนักงานที่ยังไม่ส่งรายงานในแท็บประวัติรายงาน"
                >
                  <Clock className="w-4.5 h-4.5 text-amber-600" />
                  <span>ยังไม่รายงาน: {pendingOfficesCount} แห่ง</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform text-amber-700" />
                </button>
              ) : (
                <span className="flex items-center gap-1.5 font-bold text-amber-800 bg-amber-50 px-3.5 py-1.5 rounded-xl border border-amber-200">
                  <Clock className="w-4.5 h-4.5 text-amber-600" />
                  <span>ยังไม่รายงาน: {pendingOfficesCount} แห่ง</span>
                </span>
              )}

              <span className="font-black text-blue-950 bg-blue-100 px-3.5 py-1.5 rounded-xl">
                รายงานแล้ว {reportingComplianceRate}%
              </span>
            </div>
          </div>

          {/* Progress Meter */}
          <div className="w-full bg-amber-100/80 h-3.5 rounded-full overflow-hidden flex shadow-inner">
            <div
              className="bg-emerald-500 h-full transition-all duration-500 rounded-l-full relative"
              style={{ width: `${reportingComplianceRate}%` }}
              title={`รายงานแล้ว ${reportedOfficesCount} แห่ง`}
            />
          </div>
          <div className="flex items-center justify-between text-xs sm:text-sm text-slate-600 font-medium mt-2 px-0.5">
            <span>
              สำนักงานทั้งหมดในพื้นที่: <b className="text-slate-800 font-bold">{totalOfficesInRegion} แห่ง</b>
            </span>
            <span>
              อัตราการส่งรายงาน: <b className="text-slate-800 font-bold">{reportingComplianceRate}%</b>
            </span>
          </div>
        </div>
      </div>

      {/* 2.1 ACTIVE PROVINCE DRILL-DOWN BANNER */}
      {displayedStats.isDrilldown && activeSelectedReport && (
        <div className="bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 border-2 border-sky-300 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase px-2.5 py-0.5 rounded-full bg-sky-600 text-white shadow-2xs">
                  สถิติเฉพาะจังหวัด
                </span>
                <span className="text-lg font-black text-blue-950 font-['Prompt']">
                  {displayedStats.officeName}
                </span>
                <span className="text-sm text-slate-600 font-medium hidden sm:inline">
                  • {displayedStats.reportDate.startsWith('ประจำรอบ') || displayedStats.reportDate.startsWith('รอบ') ? displayedStats.reportDate : `รอบวันที่ ${formatThaiDateFull(displayedStats.reportDate)}`}
                </span>
              </div>
              <div className="text-xs sm:text-sm text-slate-600 mt-0.5">
                กำลังแสดงผลข้อมูลในการ์ดสถิติ และยอดผู้รับบริการ {activeCategories.length} กลุ่มมาตรา ของจังหวัดนี้
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const targetPoster =
                  isCycleMode || selectedCenterFilter !== 'all' || selectedOfficeReports.length > 1
                    ? buildPosterReport('office', activeSelectedReport?.officeId)
                    : {
                        ...activeSelectedReport,
                        centerName: displayedStats.centerName || activeSelectedReport.centerName,
                      };
                if (targetPoster) onSelectReport(targetPoster);
              }}
              className="text-sm font-bold px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              <span>ดูโปสเตอร์ของจังหวัดนี้</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedReportId(null)}
              className="text-sm font-bold px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl transition-colors cursor-pointer"
            >
              ✕ คืนค่าดูภาพรวมทั้งหมด
            </button>
          </div>
        </div>
      )}

      {/* 3. HERO METRICS: Row 1 - Two Volume & Verification Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: คิวนัดหมายทั้งหมด */}
        <div className="bg-gradient-to-r from-teal-50/90 via-white to-teal-50/30 rounded-2xl p-5 border border-teal-200/90 shadow-xs relative overflow-hidden flex items-center justify-between hover:shadow-md transition-shadow">
          <div className="absolute right-0 top-0 bottom-0 w-36 bg-gradient-to-l from-teal-100/20 to-transparent pointer-events-none" />
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-13 h-13 rounded-xl bg-gradient-to-br from-teal-600 to-teal-700 text-white flex items-center justify-center shrink-0 shadow-xs ring-4 ring-teal-100/70">
              <Calendar className="w-6.5 h-6.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold text-slate-900 tracking-tight font-['Prompt']">
                  {displayedStats.isDrilldown ? 'คิวนัดหมาย (จังหวัดนี้)' : 'คิวนัดหมายทั้งหมด'}
                </span>
                <span className="text-xs sm:text-sm px-3 py-0.5 rounded-full font-bold bg-teal-100 text-teal-800 border border-teal-200 shadow-2xs">
                  เป้าหมายบริการ
                </span>
              </div>
              <div className="text-sm sm:text-base text-slate-600 mt-0.5 font-medium">
                {displayedStats.isDrilldown
                  ? `เป้าหมายคิวให้บริการของ ${displayedStats.officeName}`
                  : `จากสำนักงานที่รายงานทั้งหมด ${reportedList.length} แห่ง`}
              </div>
            </div>
          </div>
          <div className="text-right relative z-10">
            <div className="flex items-baseline justify-end gap-1.5">
              <span className="text-3xl sm:text-4xl font-black font-['Prompt'] text-teal-950 tracking-tight leading-none drop-shadow-2xs">
                {formatNumber(displayedStats.totalQueue)}
              </span>
              <span className="text-base sm:text-lg font-bold text-teal-700">คิว</span>
            </div>
            <div className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
              เป้าหมายให้บริการ 100%
            </div>
          </div>
        </div>

        {/* Card 2: ยืนยันตัวตนสำเร็จ */}
        <div className="bg-gradient-to-r from-sky-50/90 via-white to-blue-50/30 rounded-2xl p-5 border border-sky-200/90 shadow-xs relative overflow-hidden flex items-center justify-between hover:shadow-md transition-shadow">
          <div className="absolute right-0 top-0 bottom-0 w-36 bg-gradient-to-l from-sky-100/20 to-transparent pointer-events-none" />
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-13 h-13 rounded-xl bg-gradient-to-br from-sky-600 to-blue-700 text-white flex items-center justify-center shrink-0 shadow-xs ring-4 ring-sky-100/70">
              <ShieldCheck className="w-6.5 h-6.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold text-slate-900 tracking-tight font-['Prompt']">
                  ยืนยันตัวตนสำเร็จ
                </span>
                <span className="text-xs sm:text-sm px-3 py-0.5 rounded-full font-bold bg-sky-100 text-sky-800 border border-sky-200 shadow-2xs">
                  ตรวจอัตลักษณ์
                </span>
              </div>
              <div className="text-sm sm:text-base text-slate-600 mt-0.5 font-medium">
                ผ่านการสแกนใบหน้าและตรวจสอบตัวตนตามมาตรฐาน
              </div>
            </div>
          </div>
          <div className="text-right relative z-10">
            <div className="flex items-baseline justify-end gap-1.5">
              <span className="text-3xl sm:text-4xl font-black font-['Prompt'] text-blue-950 tracking-tight leading-none drop-shadow-2xs">
                {formatNumber(displayedStats.totalVerified)}
              </span>
              <span className="text-base sm:text-lg font-bold text-sky-700">คน</span>
            </div>
            <div className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
              ยืนยันตัวตนแล้ว
            </div>
          </div>
        </div>
      </div>

      {/* 3. HERO METRICS: Row 2 - Four Outcome Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1: ออกบัตรสำเร็จ */}
        <div className="bg-gradient-to-b from-emerald-50/80 via-white to-white rounded-2xl p-4.5 border border-emerald-300 shadow-xs hover:shadow-md transition-all ring-1 ring-emerald-200/80 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-base sm:text-lg font-bold text-emerald-950 tracking-tight font-['Prompt']">
              {issuedMetricInfo.title === 'ออกบัตร' ? 'ออกบัตรสำเร็จ' : issuedMetricInfo.title}
            </span>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-xs flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl sm:text-4xl font-black my-2.5 text-emerald-700 font-['Prompt'] tracking-tight flex items-baseline">
            {formatNumber(displayedStats.totalIssued)}
            <span className="text-sm sm:text-base font-semibold ml-1.5 text-slate-500">{issuedMetricInfo.unit}</span>
          </div>
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200/90 shadow-2xs">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span>สำเร็จ {displayedStats.successRate}%</span>
            </span>
          </div>
        </div>

        {/* Card 2: ไม่มาตามนัด */}
        <div className="bg-gradient-to-b from-rose-50/80 via-white to-white rounded-2xl p-4.5 border border-rose-300 shadow-xs hover:shadow-md transition-all ring-1 ring-rose-200/80 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-base sm:text-lg font-bold text-rose-950 tracking-tight font-['Prompt']">
              {missedMetricInfo.title}
            </span>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-xs flex items-center justify-center">
              <UserX className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl sm:text-4xl font-black my-2.5 text-rose-700 font-['Prompt'] tracking-tight flex items-baseline">
            {formatNumber(displayedStats.totalMissed)}
            <span className="text-sm sm:text-base font-semibold ml-1.5 text-slate-500">{missedMetricInfo.unit}</span>
          </div>
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold px-3 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-200/90 shadow-2xs">
              <span>ขาดนัด {displayedStats.missedRate}%</span>
            </span>
          </div>
        </div>

        {/* Card 3: มาไม่ตรงวันนัด */}
        <div className="bg-gradient-to-b from-amber-50/80 via-white to-white rounded-2xl p-4.5 border border-amber-300 shadow-xs hover:shadow-md transition-all ring-1 ring-amber-200/80 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-base sm:text-lg font-bold text-amber-950 tracking-tight font-['Prompt']">
              {wrongDateMetricInfo.title === 'ไม่ตรงวันนัด' ? 'มาไม่ตรงวันนัด' : wrongDateMetricInfo.title}
            </span>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-xs flex items-center justify-center">
              <CalendarX className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl sm:text-4xl font-black my-2.5 text-amber-700 font-['Prompt'] tracking-tight flex items-baseline">
            {formatNumber(displayedStats.totalWrongDate)}
            <span className="text-sm sm:text-base font-semibold ml-1.5 text-slate-500">{wrongDateMetricInfo.unit}</span>
          </div>
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200/90 shadow-2xs">
              <span>ผิดวันนัด {displayedStats.wrongDayRate}%</span>
            </span>
          </div>
        </div>

        {/* Card 4: บัตรเสีย (หรือชื่อที่ตั้งค่าไว้ใน Admin) */}
        <div className="bg-gradient-to-b from-slate-50/80 via-white to-white rounded-2xl p-4.5 border border-slate-300 shadow-xs hover:shadow-md transition-all ring-1 ring-slate-200/80 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-base sm:text-lg font-bold text-slate-900 tracking-tight font-['Prompt']">
              {notIssuedMetricInfo.title}
            </span>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-600 to-slate-700 text-white shadow-xs flex items-center justify-center">
              <XCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl sm:text-4xl font-black my-2.5 text-slate-800 font-['Prompt'] tracking-tight flex items-baseline">
            {formatNumber(displayedStats.totalNotIssued)}
            <span className="text-sm sm:text-base font-semibold ml-1.5 text-slate-500">{notIssuedMetricInfo.unit}</span>
          </div>
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200/90 shadow-2xs">
              <span>{notIssuedMetricInfo.title} {displayedStats.notIssuedRate}%</span>
            </span>
          </div>
        </div>

        {/* Custom Queue Metric Cards added by Admin */}
        {(queueMetrics || [])
          .filter(
            (m) =>
              m.isActive &&
              ![
                'queueAppointment',
                'cardsIssued',
                'identityVerified',
                'cardsNotIssued',
                'missedAppointment',
                'wrongAppointmentDate',
              ].includes(m.id)
          )
          .map((cm) => {
            const val = displayedStats.customQueueSums?.[cm.id] || 0;
            return (
              <div
                key={cm.id}
                className="bg-gradient-to-b from-indigo-50/75 via-white to-white rounded-2xl p-4.5 border border-indigo-200 shadow-xs hover:shadow-md transition-all ring-1 ring-indigo-100/80 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-base sm:text-lg font-bold text-indigo-950 tracking-tight font-['Prompt']">
                    {cm.title}
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-xs flex items-center justify-center">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl sm:text-4xl font-black my-2.5 text-indigo-900 font-['Prompt'] tracking-tight flex items-baseline">
                  {formatNumber(val)}
                  <span className="text-sm sm:text-base font-semibold ml-1.5 text-indigo-700">
                    {cm.unit || 'คน'}
                  </span>
                </div>
                <div>
                  <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200/90 shadow-2xs">
                    <span>{cm.subLabel || 'ข้อมูลบริการเพิ่มเติม'}</span>
                  </span>
                </div>
              </div>
            );
          })}
      </div>

      {/* 4. SECTIONS DISTRIBUTION BREAKDOWN (จำแนกตามกลุ่มมาตรา) */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 border border-blue-100 shadow-2xs">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-extrabold text-slate-900 text-lg sm:text-xl font-['Prompt']">
                  ยอดผู้รับบริการจำแนก {activeCategories.length} กลุ่มมาตรา
                </h3>
                <span className={`text-sm font-bold px-3 py-0.5 rounded-full border ${
                  displayedStats.isDrilldown
                    ? 'text-emerald-900 bg-emerald-100 border-emerald-300'
                    : 'text-blue-800 bg-blue-50 border-blue-200'
                }`}>
                  {displayedStats.officeName}
                </span>
                {displayedStats.isDrilldown && (
                  <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>เฉพาะจังหวัด</span>
                  </span>
                )}
              </div>
              <p className="text-sm sm:text-base text-slate-600 mt-0.5">
                รวมผู้รับบริการที่ออกบัตรสำเร็จทั้งหมด <span className="font-extrabold text-slate-900">{formatNumber(displayedStats.totalSections)}</span> คน
                {displayedStats.isDrilldown ? (
                  <span className="text-emerald-700 font-bold ml-1.5">
                    • ข้อมูลเฉพาะ {displayedStats.officeName}
                  </span>
                ) : (
                  <span className="text-slate-500 font-normal ml-1.5">
                    •{' '}
                    {selectedRegion === 'ทั้งหมด'
                      ? `ภาพรวมสะสมทั้งประเทศ (${reportedList.length} สำนักงาน)`
                      : selectedRegion === 'เฉพาะกิจ'
                      ? `รวมศูนย์เฉพาะกิจ (${reportedList.length} แห่ง)`
                      : `รวมสำนักงานจัดหางานในพื้นที่ ${selectedRegion} (${reportedList.length} แห่ง)`}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* View Mode Toggle: ภาพรวมทั้งประเทศ */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedReportId(null)}
              className={`text-xs sm:text-sm font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                !selectedReportId
                  ? 'bg-blue-900 text-white border-blue-900 shadow-2xs'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
              }`}
              title="ดูผลรวมสะสมของทุกสำนักงานทั่วประเทศ"
            >
              🌐 ภาพรวมทั้งประเทศ
            </button>

            <div className="text-xs sm:text-sm font-bold px-3 py-1.5 bg-gradient-to-r from-amber-50 to-orange-50 text-amber-900 rounded-xl border border-amber-200/80 shadow-2xs flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>สูงสุด: {topSec?.label || 'ม.63/2'} ({formatNumber(topSec?.count || 0)} คน)</span>
            </div>
          </div>
        </div>

        {displayedStats.isDrilldown && (
          <div className="bg-emerald-50/90 border border-emerald-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm text-emerald-950">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                กำลังแสดงยอดจำแนกกลุ่มของ <b>{displayedStats.officeName}</b>{' '}
                <span className="font-semibold text-emerald-700">
                  (ตรงกับข้อมูลที่บันทึก/แก้ไขในหน้ารายงานทุกประการ)
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedReportId(null)}
              className="text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 px-3 py-1 rounded-lg border border-slate-300 cursor-pointer shadow-2xs"
            >
              ✕ คืนค่าดูภาพรวมสะสมทั้งประเทศ
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 pt-1">
          {sectionBreakdown.map((sec, i) => {
            const pct =
              displayedStats.totalSections > 0
                ? ((sec.count / displayedStats.totalSections) * 100).toFixed(1)
                : '0';
            const barW = maxSec > 0 ? (sec.count / maxSec) * 100 : 0;

            return (
              <div key={i} className="space-y-1.5 p-2 rounded-xl hover:bg-slate-50/80 transition-colors">
                <div className="flex items-center justify-between text-sm sm:text-base">
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 text-xs sm:text-sm font-bold flex items-center justify-center shrink-0 border border-slate-200">
                      {i + 1}
                    </span>
                    <span className="font-bold text-slate-900 text-sm sm:text-base tracking-tight">{sec.label}</span>
                    <span className="text-xs sm:text-sm text-slate-500 font-medium truncate">({sec.sub})</span>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="font-bold text-slate-900 text-sm sm:text-base font-['Prompt']">{formatNumber(sec.count)} <span className="text-xs sm:text-sm font-normal text-slate-500">คน</span></span>
                    <span className="text-xs sm:text-sm text-slate-700 font-mono w-14 text-right font-bold">{pct}%</span>
                  </div>
                </div>
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                  <div
                    className={`h-full ${sec.color} rounded-full transition-all duration-500`}
                    style={{ width: `${Math.max(barW, sec.count > 0 ? 2 : 0)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. TABLE: เฉพาะสำนักงานจัดหางานที่รายงานเรียบร้อยแล้ว (ตามที่ผู้ใช้กำหนด) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Table Header with Search and Notice */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-slate-50/70 via-white to-sky-50/30">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <FileSpreadsheet className="w-4.5 h-4.5" />
              </div>
              <h3 className="font-bold text-slate-900 text-base sm:text-lg font-['Prompt']">
                ตารางสรุปผลการปฏิบัติงานสำนักงานจัดหางาน (รายงานเรียบร้อยแล้ว)
              </h3>
              <span className="text-xs sm:text-sm font-bold text-emerald-800 bg-emerald-100 px-3 py-0.5 rounded-full border border-emerald-200 shadow-2xs">
                {reportedList.length} แห่ง
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              คลิกที่แถวหรือชื่อจังหวัดเพื่อนำสถิติมาแสดงบนการ์ดและยอดผู้รับบริการด้านบน
              {pendingOfficesCount > 0 && (
                <span>
                  {' '}
                  (ยังไม่รายงาน {pendingOfficesCount} แห่ง{' '}
                  {onViewPendingInHistory ? (
                    <button
                      type="button"
                      onClick={onViewPendingInHistory}
                      className="text-amber-800 font-bold hover:underline cursor-pointer inline-flex items-center gap-0.5"
                    >
                      ดูในแท็บประวัติรายงาน →
                    </button>
                  ) : null}
                  )
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedReportId && (
              <button
                type="button"
                onClick={() => setSelectedReportId(null)}
                className="text-xs sm:text-sm font-bold px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl transition-colors cursor-pointer shadow-2xs"
              >
                ✕ คืนค่าดูภาพรวมทั้งหมด
              </button>
            )}
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="ค้นหาจังหวัด / สำนักงาน..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-sm pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-sky-500 focus:border-sky-500 w-[200px] sm:w-[260px] transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table: Shows ONLY Reported Offices */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-base">
            <thead className="bg-slate-50/80 text-slate-800 font-bold border-b border-slate-200 uppercase text-sm sm:text-base tracking-wider">
              <tr>
                <th className="py-4 px-4 whitespace-nowrap">วันที่รายงาน</th>
                <th className="py-4 px-4">สำนักงานจัดหางาน (คลิกเลือกดูข้อมูล)</th>
                <th className="py-4 px-4 text-center">คิวนัดหมาย</th>
                <th className="py-4 px-4 text-center">ออกบัตร (ใบ)</th>
                <th className="py-4 px-4 text-center">ไม่มาตามนัด</th>
                <th className="py-4 px-4 text-right">โปสเตอร์</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reportedList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 text-base">
                    <p className="font-medium">ไม่พบสำนักงานจัดหางานที่ส่งรายงานตามเงื่อนไขที่เลือก</p>
                    {pendingOfficesCount > 0 && onViewPendingInHistory && (
                      <button
                        type="button"
                        onClick={onViewPendingInHistory}
                        className="mt-2 text-base text-sky-700 font-semibold hover:underline cursor-pointer"
                      >
                        ดูสำนักงานที่ยังไม่ส่งรายงาน ({pendingOfficesCount} แห่ง) ในแท็บประวัติรายงาน →
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                reportedList.map((report) => {
                  const isSelected = selectedReportId === report.id;
                  return (
                    <tr
                      key={report.id}
                      onClick={() => setSelectedReportId(isSelected ? null : report.id)}
                      className={`cursor-pointer transition-all group ${
                        isSelected
                          ? 'bg-sky-50/90 border-l-4 border-l-sky-600 shadow-2xs'
                          : 'hover:bg-sky-50/40 bg-white border-l-4 border-l-transparent'
                      }`}
                    >
                      {/* 1. วันที่รายงาน */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span className="font-bold text-slate-800 bg-slate-100 px-3 py-1.5 rounded-lg text-sm sm:text-base border border-slate-200/80 inline-block font-mono">
                          {formatThaiDateShort(report.reportDate)}
                        </span>
                      </td>

                      {/* 2. สำนักงานจัดหางาน */}
                      <td className="py-4 px-4">
                        <div className="font-bold flex items-center gap-2">
                          <span
                            className={
                              isSelected
                                ? "text-sky-950 font-black text-base sm:text-lg font-['Prompt'] underline decoration-sky-500 underline-offset-2"
                                : "text-slate-900 group-hover:text-sky-700 text-base sm:text-lg font-['Prompt']"
                            }
                          >
                            {report.officeName}
                          </span>
                          {isSelected ? (
                            <span className="text-xs sm:text-sm font-bold px-2.5 py-0.5 rounded-full bg-sky-600 text-white shadow-2xs flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" />
                              <span>แสดงข้อมูลอยู่</span>
                            </span>
                          ) : (
                            <span className="text-xs sm:text-sm text-slate-400 group-hover:text-sky-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                              (คลิกเพื่อดูสถิติ)
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-600 flex items-center gap-2 mt-0.5">
                          <span className="px-2.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm">
                            {report.region}
                          </span>
                          <span className="truncate max-w-[360px]">{report.centerName}</span>
                        </div>
                      </td>

                      {/* 3. คิวนัดหมาย */}
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        <span className="font-black text-teal-900 font-['Prompt'] text-lg sm:text-xl">
                          {formatNumber(report.queueAppointment)}
                        </span>
                        <span className="text-sm font-semibold text-teal-700 ml-1">คิว</span>
                      </td>

                      {/* 4. ออกบัตร (ใบ) */}
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        <span className="inline-block px-3 py-1 rounded-lg font-black font-['Prompt'] text-lg sm:text-xl bg-emerald-50 text-emerald-800 border border-emerald-200/90 shadow-2xs">
                          {formatNumber(report.cardsIssued)} <span className="text-sm font-normal">ใบ</span>
                        </span>
                      </td>

                      {/* 5. ไม่มาตามนัด */}
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        <span className="font-black text-rose-700 font-['Prompt'] text-lg sm:text-xl">
                          {formatNumber(report.missedAppointment)}
                        </span>
                        <span className="text-sm font-semibold text-rose-600 ml-1">คน</span>
                      </td>

                      {/* 6. ดำเนินการ (ดูโปสเตอร์) */}
                      <td
                        className="py-4 px-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => {
                              const targetPoster = isCycleMode
                                ? buildPosterReport('office', report.officeId)
                                : selectedCenterFilter === 'type:mobile' || selectedRegion === 'เฉพาะกิจ'
                                ? { ...report, centerName: MOBILE_UNIT_DEFAULT_LABEL }
                                : selectedCenterFilter.startsWith('center:')
                                ? { ...report, centerName: selectedCenterFilter.replace('center:', '') }
                                : report;
                              onSelectReport(targetPoster);
                            }}
                            className="text-sm sm:text-base font-bold px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 text-white rounded-xl shadow-2xs transition-all flex items-center gap-2 cursor-pointer hover:shadow-xs active:scale-95"
                            title="ดูโปสเตอร์อินโฟกราฟิกตามรอบที่เลือก"
                          >
                            <Eye className="w-4.5 h-4.5" />
                            <span>ดูโปสเตอร์</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
