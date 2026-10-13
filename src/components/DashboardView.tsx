import React, { useState, useMemo } from 'react';
import { DOEReport, EmploymentOffice, ReportCategory } from '../types/doe';
import { EMPLOYMENT_OFFICES } from '../data/offices';
import {
  formatNumber,
  formatThaiDateShort,
  formatThaiDateFull,
  formatThaiDateRange,
  getTodayIsoDate,
} from '../utils/thaiDate';
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
} from 'lucide-react';

interface DashboardViewProps {
  reports: DOEReport[];
  categories?: ReportCategory[];
  currentReport?: DOEReport | null;
  onSelectReport: (report: DOEReport) => void;
  onNewReport: (preselectedOfficeId?: string) => void;
  onOpenLine?: (report: DOEReport) => void;
  onEditReport?: (report: DOEReport) => void;
  onViewPendingInHistory?: () => void;
  offices?: EmploymentOffice[];
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  reports,
  categories,
  currentReport,
  onSelectReport,
  onNewReport,
  onViewPendingInHistory,
  offices,
}) => {
  const todayStr = useMemo(() => getTodayIsoDate(), []);

  // Dynamic active categories from system config / props
  const activeCategories = useMemo(() => {
    if (categories && categories.length > 0) {
      return categories.filter((c) => c.isActive);
    }
    return [
      { id: 'section59', code: 'ม.59', title: 'กลุ่มมาตรา 59', subLabel: 'คนต่างด้าวทั่วไป', color: 'bg-sky-500', isActive: true },
      { id: 'section62', code: 'ม.62', title: 'กลุ่มมาตรา 62', subLabel: 'ผู้เชี่ยวชาญ/ช่างฝีมือ', color: 'bg-blue-600', isActive: true },
      { id: 'section63_1', code: 'ม.63/1', title: 'กลุ่มมาตรา 63/1', subLabel: 'ชนกลุ่มน้อย/มีสถานะ', color: 'bg-indigo-500', isActive: true },
      { id: 'section63_2', code: 'ม.63/2', title: 'กลุ่มมาตรา 63/2', subLabel: 'มติ ครม. 4 สัญชาติ', color: 'bg-blue-800', isActive: true },
      { id: 'section64', code: 'ม.64', title: 'กลุ่มมาตรา 64', subLabel: 'แรงงานไป-กลับ/ฤดูกาล', color: 'bg-teal-500', isActive: true },
      { id: 'modifyDetails', code: 'เปลี่ยนแปลง', title: 'เปลี่ยนแปลงรายการ', subLabel: 'ย้ายนายจ้าง/สถานที่', color: 'bg-violet-600', isActive: true },
      { id: 'substituteCard', code: 'ใบแทน', title: 'ใบแทนใบอนุญาต', subLabel: 'ชำรุด/สูญหาย/ขอแทน', color: 'bg-amber-500', isActive: true },
    ];
  }, [categories]);

  // Available distinct dates from existing reports (always including today)
  const availableDates = useMemo(() => {
    const datesSet = new Set(reports.map((r) => r.reportDate));
    datesSet.add(todayStr);
    return Array.from(datesSet).sort((a, b) => b.localeCompare(a));
  }, [reports, todayStr]);

  // Selected Cycle/Date Filter Key:
  // 'custom' | 'single:YYYY-MM-DD' | 'all'
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

  // Selected Region
  const [selectedRegion, setSelectedRegion] = useState<string>('ทั้งหมด');

  // Search input for office/province in table
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected Province/Report for drill-down to show specific province in cards and sections breakdown
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

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

  // 1. In Dashboard: ONLY show reported reports matching the filter
  const reportedList = useMemo(() => {
    return reports.filter((r) => {
      let matchDate = true;
      if (filterStartDate && filterEndDate) {
        matchDate = r.reportDate >= filterStartDate && r.reportDate <= filterEndDate;
      } else if (filterStartDate) {
        matchDate = r.reportDate >= filterStartDate;
      } else if (filterEndDate) {
        matchDate = r.reportDate <= filterEndDate;
      }
      const matchRegion = selectedRegion === 'ทั้งหมด' || r.region === selectedRegion;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        r.officeName.toLowerCase().includes(q) ||
        r.centerName.toLowerCase().includes(q) ||
        r.reporterName.toLowerCase().includes(q);
      return matchDate && matchRegion && matchSearch;
    });
  }, [reports, filterStartDate, filterEndDate, selectedRegion, searchQuery]);

  // Reports belonging to the selected office
  const selectedOfficeReports = useMemo(() => {
    if (!selectedReportId) return [];
    const baseRep = reports.find((r) => r.id === selectedReportId);
    if (!baseRep) return [];
    const matchingInFilter = reportedList.filter((r) => r.officeId === baseRep.officeId);
    if (matchingInFilter.length > 0) return matchingInFilter;
    // Fallback: If date filter excluded this report, still return baseRep so user can view its stats!
    return [baseRep];
  }, [reports, selectedReportId, reportedList]);

  // Active selected report (if user picked a province from the table or dropdown)
  const activeSelectedReport = useMemo(() => {
    if (!selectedReportId) return null;
    return (
      reportedList.find((r) => r.id === selectedReportId) ||
      reports.find((r) => r.id === selectedReportId) ||
      null
    );
  }, [reportedList, selectedReportId, reports]);

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

    reportedList.forEach((report) => {
      totalQueue += report.queueAppointment || 0;
      totalIssued += report.cardsIssued || 0;
      totalVerified += report.identityVerified || 0;
      totalNotIssued += report.cardsNotIssued || 0;
      totalMissed += report.missedAppointment || 0;
      totalWrongDate += report.wrongAppointmentDate || 0;

      sec59 += report.section59 || 0;
      sec62 += report.section62 || 0;
      sec63_1 += report.section63_1 || 0;
      sec63_2 += report.section63_2 || 0;
      sec64 += report.section64 || 0;
      secModify += report.modifyDetails || 0;
      secSub += report.substituteCard || 0;

      if (report.customCategoryValues) {
        Object.entries(report.customCategoryValues).forEach(([k, v]) => {
          customSums[k] = (customSums[k] || 0) + (Number(v) || 0);
        });
      }
    });

    const totalSections =
      sec59 + sec62 + sec63_1 + sec63_2 + sec64 + secModify + secSub +
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
        secModify,
        secSub,
        customSums,
      },
    };
  }, [reportedList, selectedRegion]);

  // 3. Compute Displayed Statistics (Shows single province if selected, or aggregate otherwise)
  const displayedStats = useMemo(() => {
    if (selectedOfficeReports.length > 0) {
      const rep = selectedOfficeReports[0];
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

      selectedOfficeReports.forEach((r) => {
        totalQueue += r.queueAppointment || 0;
        totalIssued += r.cardsIssued || 0;
        totalVerified += r.identityVerified || 0;
        totalNotIssued += r.cardsNotIssued || 0;
        totalMissed += r.missedAppointment || 0;
        totalWrongDate += r.wrongAppointmentDate || 0;
        sec59 += r.section59 || 0;
        sec62 += r.section62 || 0;
        sec63_1 += r.section63_1 || 0;
        sec63_2 += r.section63_2 || 0;
        sec64 += r.section64 || 0;
        secModify += r.modifyDetails || 0;
        secSub += r.substituteCard || 0;
        if (r.customCategoryValues) {
          Object.entries(r.customCategoryValues).forEach(([k, v]) => {
            customSums[k] = (customSums[k] || 0) + (Number(v) || 0);
          });
        }
      });

      const totalSections =
        sec59 + sec62 + sec63_1 + sec63_2 + sec64 + secModify + secSub +
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
        isDrilldown: true,
        officeId: rep.officeId,
        officeName: rep.officeName,
        centerName: rep.centerName,
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
        secModify,
        secSub,
        customSums,
      };
    }

    return {
      isDrilldown: false,
      officeId: 'overview',
      officeName: selectedRegion === 'ทั้งหมด' ? 'ภาพรวมทั้งประเทศ' : selectedRegion,
      centerName: '',
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
      secModify: nationalStats.secModify,
      secSub: nationalStats.secSub,
      customSums: nationalStats.customSums,
    };
  }, [selectedOfficeReports, nationalStats, selectedRegion, activePeriodLabel]);

  // Helper to build a DOEReport object for the infographic poster reflecting the active period / cycle
  const buildPosterReport = (
    mode: 'overview' | 'office',
    targetOfficeId?: string
  ): DOEReport => {
    const isOverview = mode === 'overview';
    const targetReports = isOverview
      ? reportedList
      : reportedList.filter((r) => r.officeId === targetOfficeId);

    const baseRep =
      targetReports[0] ||
      reports.find((r) => r.officeId === targetOfficeId) ||
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
    let secModify = 0;
    let secSub = 0;

    const posterCustomSums: Record<string, number> = {};

    targetReports.forEach((r) => {
      totalQueue += r.queueAppointment || 0;
      totalIssued += r.cardsIssued || 0;
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
      secModify += r.modifyDetails || 0;
      secSub += r.substituteCard || 0;

      if (r.customCategoryValues) {
        Object.entries(r.customCategoryValues).forEach(([k, v]) => {
          posterCustomSums[k] = (posterCustomSums[k] || 0) + (Number(v) || 0);
        });
      }
    });

    const officeName = isOverview
      ? selectedRegion === 'ทั้งหมด'
        ? 'ศูนย์บริการใบอนุญาตทำงาน (ภาพรวมทั้งประเทศ)'
        : `ศูนย์บริการใบอนุญาตทำงาน (${selectedRegion})`
      : baseRep?.officeName || 'สำนักงานจัดหางาน';

    const officeNameEn = isOverview
      ? selectedRegion === 'ทั้งหมด'
        ? 'Foreign Workers Employment Center (National Overview)'
        : `Foreign Workers Employment Center (${selectedRegion})`
      : baseRep?.officeNameEn || 'Provincial Employment Office';

    const centerName = isOverview
      ? selectedRegion === 'ทั้งหมด'
        ? 'ภาพรวม 76 จังหวัด + กทม. 10 พื้นที่'
        : `รวมสำนักงานจัดหางานในพื้นที่ ${selectedRegion}`
      : baseRep?.centerName || 'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว';

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
      modifyDetails: secModify,
      substituteCard: secSub,
      customCategoryValues: posterCustomSums,
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
      else if (cat.id === 'modifyDetails') count = displayedStats.secModify;
      else if (cat.id === 'substituteCard') count = displayedStats.secSub;
      else count = displayedStats.customSums?.[cat.id] || 0;

      let color = cat.color || 'bg-sky-500';
      if (cat.id === 'section59') color = 'bg-sky-500';
      else if (cat.id === 'section62') color = 'bg-blue-600';
      else if (cat.id === 'section63_1') color = 'bg-indigo-500';
      else if (cat.id === 'section63_2') color = 'bg-blue-800';
      else if (cat.id === 'section64') color = 'bg-teal-500';
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
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-900 text-white flex items-center justify-center shadow-md shrink-0">
              <Globe2 className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider bg-blue-100 text-blue-900 px-2.5 py-0.5 rounded-full">
                  DOE National Overview
                </span>
                <span className="text-sm text-slate-500 hidden sm:inline">
                  ครอบคลุม 76 จังหวัด + กทม. 10 พื้นที่
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight mt-0.5 font-['Prompt']">
                แดชบอร์ดสรุปผลการปฏิบัติงานภาพรวมทั้งประเทศ
              </h2>
            </div>
          </div>

          {/* Date & Region Selectors */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Date / Period Cycle Filter */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm shadow-2xs">
              <CalendarRange className="w-4.5 h-4.5 text-blue-700 shrink-0" />
              <label htmlFor="dashboard-date-filter" className="text-slate-800 font-bold text-sm shrink-0">
                รอบ/ช่วงวันที่:
              </label>
              <select
                id="dashboard-date-filter"
                value={selectedCycleKey}
                onChange={(e) => {
                  setSelectedCycleKey(e.target.value);
                  setSelectedReportId(null);
                }}
                className="bg-transparent font-bold text-slate-900 focus:outline-hidden cursor-pointer text-sm"
              >
                <option value="custom">
                  📅 กำหนดช่วงวันที่เอง (ระบุวันเริ่ม - สิ้นสุด)...
                </option>

                <optgroup label="📆 เลือกดูแบบรายวัน">
                  {availableDates.map((d) => (
                    <option key={`single:${d}`} value={`single:${d}`}>
                      {d === todayStr
                        ? `รายวัน (วันนี้): ${formatThaiDateShort(d)} (${d})`
                        : `รายวัน: ${formatThaiDateShort(d)} (${d})`}
                    </option>
                  ))}
                </optgroup>

                <option value="all">
                  📊 ภาพรวมสะสมทั้งหมด (รายงานทั้งหมด {reports.length} รายการ)
                </option>
              </select>
            </div>

            {/* Region Selector */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm shadow-2xs">
              <Filter className="w-4.5 h-4.5 text-slate-500 shrink-0" />
              <label htmlFor="dashboard-region-filter" className="text-slate-700 font-bold text-sm shrink-0">ภูมิภาค:</label>
              <select
                id="dashboard-region-filter"
                value={selectedRegion}
                onChange={(e) => {
                  setSelectedRegion(e.target.value);
                  setSelectedReportId(null);
                }}
                className="bg-transparent font-bold text-blue-950 focus:outline-hidden cursor-pointer text-sm"
              >
                <option value="ทั้งหมด">ภาพรวมทั้งประเทศ (ทุกภาค)</option>
                <option value="ภาคเหนือ">ภาคเหนือ (17 จังหวัด)</option>
                <option value="กรุงเทพมหานคร">กรุงเทพมหานคร (10 พื้นที่)</option>
                <option value="ภาคกลางและตะวันตก">ภาคกลางและตะวันตก (16 จังหวัด)</option>
                <option value="ภาคตะวันออก">ภาคตะวันออก (8 จังหวัด)</option>
                <option value="ภาคตะวันออกเฉียงเหนือ">ภาคตะวันออกเฉียงเหนือ (20 จังหวัด)</option>
                <option value="ภาคใต้">ภาคใต้ (14 จังหวัด)</option>
                <option value="เฉพาะกิจ">เฉพาะกิจ</option>
              </select>
            </div>

            {/* Province Quick Selector */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm shadow-2xs">
              <Building2 className="w-4.5 h-4.5 text-slate-500 shrink-0" />
              <label htmlFor="dashboard-province-filter" className="text-slate-700 font-bold text-sm shrink-0">เลือกจังหวัด:</label>
              <select
                id="dashboard-province-filter"
                value={selectedReportId || 'all'}
                onChange={(e) => setSelectedReportId(e.target.value === 'all' ? null : e.target.value)}
                className="bg-transparent font-bold text-blue-950 focus:outline-hidden cursor-pointer max-w-[200px] truncate text-sm"
              >
                <option value="all">ดูภาพรวมทั้งหมด ({reportedList.length} แห่ง)</option>
                {reportedList.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.officeName} ({formatThaiDateShort(r.reportDate)})
                  </option>
                ))}
              </select>
            </div>

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
              className="text-sm font-bold px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 text-white rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer hover:shadow-md active:scale-95"
              title="เปิดดูและดาวน์โหลดโปสเตอร์สรุปผลตามรอบที่เลือก"
            >
              <Eye className="w-4.5 h-4.5 text-amber-300" />
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
              onClick={() => onNewReport()}
              className="text-sm font-bold px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
            >
              <PlusCircle className="w-4.5 h-4.5" />
              <span>บันทึกรายงาน</span>
            </button>
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
                กำลังแสดงผลข้อมูลในการ์ดสถิติ และยอดผู้รับบริการ 7 กลุ่มมาตรา ของจังหวัดนี้
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const targetPoster = isCycleMode
                  ? buildPosterReport('office', activeSelectedReport?.officeId)
                  : activeSelectedReport;
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

      {/* 3. HERO METRICS: Row 2 - Four Outcome Cards (ออกบัตรสำเร็จ / ไม่มาตามนัด / มาไม่ตรงวันนัด / ไม่ออกบัตร) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1: ออกบัตรสำเร็จ */}
        <div className="bg-gradient-to-b from-emerald-50/80 via-white to-white rounded-2xl p-4.5 border border-emerald-300 shadow-xs hover:shadow-md transition-all ring-1 ring-emerald-200/80 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-base sm:text-lg font-bold text-emerald-950 tracking-tight font-['Prompt']">
              ออกบัตรสำเร็จ
            </span>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-xs flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl sm:text-4xl font-black my-2.5 text-emerald-700 font-['Prompt'] tracking-tight flex items-baseline">
            {formatNumber(displayedStats.totalIssued)}
            <span className="text-sm sm:text-base font-semibold ml-1.5 text-slate-500">ใบ</span>
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
              ไม่มาตามนัด
            </span>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-xs flex items-center justify-center">
              <UserX className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl sm:text-4xl font-black my-2.5 text-rose-700 font-['Prompt'] tracking-tight flex items-baseline">
            {formatNumber(displayedStats.totalMissed)}
            <span className="text-sm sm:text-base font-semibold ml-1.5 text-slate-500">คน</span>
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
              มาไม่ตรงวันนัด
            </span>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-xs flex items-center justify-center">
              <CalendarX className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl sm:text-4xl font-black my-2.5 text-amber-700 font-['Prompt'] tracking-tight flex items-baseline">
            {formatNumber(displayedStats.totalWrongDate)}
            <span className="text-sm sm:text-base font-semibold ml-1.5 text-slate-500">คน</span>
          </div>
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200/90 shadow-2xs">
              <span>ผิดวันนัด {displayedStats.wrongDayRate}%</span>
            </span>
          </div>
        </div>

        {/* Card 4: ไม่ออกบัตร */}
        <div className="bg-gradient-to-b from-slate-50/80 via-white to-white rounded-2xl p-4.5 border border-slate-300 shadow-xs hover:shadow-md transition-all ring-1 ring-slate-200/80 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-base sm:text-lg font-bold text-slate-900 tracking-tight font-['Prompt']">
              ไม่ออกบัตร
            </span>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-600 to-slate-700 text-white shadow-xs flex items-center justify-center">
              <XCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl sm:text-4xl font-black my-2.5 text-slate-800 font-['Prompt'] tracking-tight flex items-baseline">
            {formatNumber(displayedStats.totalNotIssued)}
            <span className="text-sm sm:text-base font-semibold ml-1.5 text-slate-500">คน</span>
          </div>
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200/90 shadow-2xs">
              <span>ไม่อนุมัติ {displayedStats.notIssuedRate}%</span>
            </span>
          </div>
        </div>
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
                    • ภาพรวมสะสมทั้งประเทศ ({reportedList.length} สำนักงาน)
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
