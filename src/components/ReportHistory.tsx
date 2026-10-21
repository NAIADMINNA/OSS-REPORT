import React, { useState, useId, useMemo, useRef, useEffect } from 'react';
import { DOEReport, EmploymentOffice, ReportCategory } from '../types/doe';
import { EMPLOYMENT_OFFICES } from '../data/offices';
import { formatNumber, formatThaiDateShort, formatThaiDateFull } from '../utils/thaiDate';
import { REGION_ORDER, sortOfficesByRegion } from '../utils/officeUtils';
import { calculateReportTotalSections as calcTotalFromCategories } from '../utils/doeUtils';
import {
  Search,
  Eye,
  Edit2,
  Trash2,
  Copy,
  MessageCircle,
  FileSpreadsheet,
  Plus,
  Clock,
  CheckCircle2,
  Building2,
  Calendar,
  AlertCircle,
  Check,
  Share2,
  RotateCcw,
  X,
  Lock,
  Unlock,
  ShieldCheck,
  Key,
  EyeOff,
  AlertTriangle,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
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

function getMonthMetaFromIsoDate(dateStr: string): {
  monthKey: string;
  monthLabel: string;
  shortMonthLabel: string;
} {
  if (!dateStr || dateStr.length < 7 || !dateStr.includes('-')) {
    return {
      monthKey: 'unknown',
      monthLabel: 'ไม่ระบุเดือน/ปี',
      shortMonthLabel: 'ไม่ระบุเดือน',
    };
  }
  const [yStr, mStr] = dateStr.split('-');
  const year = Number(yStr);
  const monthIdx = Number(mStr) - 1;
  if (isNaN(year) || isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) {
    return {
      monthKey: 'unknown',
      monthLabel: 'ไม่ระบุเดือน/ปี',
      shortMonthLabel: 'ไม่ระบุเดือน',
    };
  }
  const thaiYear = year + 543;
  const monthName = THAI_MONTHS_FULL[monthIdx];
  return {
    monthKey: `${yStr}-${mStr}`,
    monthLabel: `เดือน${monthName} พ.ศ. ${thaiYear}`,
    shortMonthLabel: `${monthName} ${thaiYear}`,
  };
}

interface ReportHistoryProps {
  reports: DOEReport[];
  offices?: EmploymentOffice[];
  categories?: ReportCategory[];
  deletedReports?: DOEReport[];
  adminPin?: string;
  onViewPoster: (report: DOEReport) => void;
  onEditReport: (report: DOEReport) => void;
  onDeleteReport: (id: string) => void;
  onRestoreReport?: (id: string) => void;
  onRestoreAllReports?: () => void;
  onDuplicateReport: (report: DOEReport) => void;
  onOpenLineModal: (report: DOEReport) => void;
  onNewReport: (preselectedOfficeId?: string) => void;
}

interface DailyReportFolder {
  date: string;
  thaiDateFull: string;
  thaiDateShort: string;
  items: DOEReport[];
  totalQueue: number;
  totalIssued: number;
  totalMissed: number;
}

export const ReportHistory: React.FC<ReportHistoryProps> = ({
  reports,
  offices,
  categories,
  deletedReports = [],
  adminPin = '0841543524',
  onViewPoster,
  onEditReport,
  onDeleteReport,
  onRestoreReport,
  onRestoreAllReports,
  onDuplicateReport,
  onOpenLineModal,
  onNewReport,
}) => {
  const searchInputId = useId();
  const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);

  const officeList = useMemo(() => {
    return offices && offices.length > 0 ? offices : EMPLOYMENT_OFFICES;
  }, [offices]);

  // Active categories list
  const activeCategories = useMemo(() => {
    if (categories && categories.length > 0) {
      return categories.filter((c) => c.isActive);
    }
    return null;
  }, [categories]);

  // Determine active group count (defaults to actual activeCategories.length or 8)
  const activeGroupsCount = useMemo(() => {
    if (activeCategories && activeCategories.length > 0) {
      return activeCategories.length;
    }
    return 8;
  }, [activeCategories]);

  // Calculate actual total across all categories for any given report
  const calculateReportTotalSections = (r: DOEReport): number => {
    return calcTotalFromCategories(r, activeCategories);
  };

  // Admin authentication state
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('doe_admin_authenticated') === 'true';
    } catch {
      return false;
    }
  });

  // Admin PIN prompt modal state
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminActionTitle, setAdminActionTitle] = useState('');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [adminPinError, setAdminPinError] = useState(false);
  const [showAdminPin, setShowAdminPin] = useState(false);

  // Sub-tab inside History: 'reported' (รายงานแล้ว) vs 'pending' (ยังไม่รายงาน ตามที่ผู้ใช้สั่ง)
  const [activeHistoryTab, setActiveHistoryTab] = useState<'reported' | 'pending'>('reported');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('ทั้งหมด');
  const [selectedFolderDate, setSelectedFolderDate] = useState('ทั้งหมด');
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});

  // Custom dropdown state for Date Filters (Reported & Pending)
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
  const [dropdownExpandedMonth, setDropdownExpandedMonth] = useState<string | null>(null);
  const dateDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(e.target as Node)) {
        setIsDateDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Summary of all daily folders across all reports (for the top folder shelf)
  const allFolderStats = useMemo(() => {
    const map = new Map<
      string,
      { count: number; totalQueue: number; totalIssued: number; totalMissed: number }
    >();
    reports.forEach((r) => {
      const d = r.reportDate || 'ไม่ระบุวันที่';
      const curr = map.get(d) || {
        count: 0,
        totalQueue: 0,
        totalIssued: 0,
        totalMissed: 0,
      };
      curr.count += 1;
      curr.totalQueue += Number(r.queueAppointment) || 0;
      curr.totalIssued += Number(r.cardsIssued) || 0;
      curr.totalMissed += Number(r.missedAppointment) || 0;
      map.set(d, curr);
    });

    return Array.from(map.entries())
      .sort((a, b) => (b[0] || '').localeCompare(a[0] || ''))
      .map(([date, stat]) => ({
        date,
        thaiDateShort: formatThaiDateShort(date),
        thaiDateFull: formatThaiDateFull(date),
        count: stat.count,
        totalQueue: stat.totalQueue,
        totalIssued: stat.totalIssued,
        totalMissed: stat.totalMissed,
      }));
  }, [reports]);

  // Group allFolderStats by same Month & Buddhist Year (ปี พ.ศ.)
  const allMonthGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        monthKey: string;
        monthLabel: string;
        shortMonthLabel: string;
        days: typeof allFolderStats;
        totalReports: number;
        totalQueue: number;
        totalIssued: number;
        totalMissed: number;
      }
    >();

    allFolderStats.forEach((f) => {
      const meta = getMonthMetaFromIsoDate(f.date);
      if (!map.has(meta.monthKey)) {
        map.set(meta.monthKey, {
          monthKey: meta.monthKey,
          monthLabel: meta.monthLabel,
          shortMonthLabel: meta.shortMonthLabel,
          days: [],
          totalReports: 0,
          totalQueue: 0,
          totalIssued: 0,
          totalMissed: 0,
        });
      }
      const grp = map.get(meta.monthKey)!;
      grp.days.push(f);
      grp.totalReports += f.count;
      grp.totalQueue += f.totalQueue;
      grp.totalIssued += f.totalIssued;
      grp.totalMissed += f.totalMissed;
    });

    return Array.from(map.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [allFolderStats]);

  // Available distinct dates from reports
  const availableDates = useMemo(() => {
    return allFolderStats.map((f) => f.date);
  }, [allFolderStats]);

  // Selected date for checking pending offices
  const [pendingCheckDate, setPendingCheckDate] = useState<string>(() => {
    return availableDates[0] || '2026-10-07';
  });

  const [copiedPendingList, setCopiedPendingList] = useState(false);

  // 1. Filtered Reported reports (supports 'ทั้งหมด', 'month:YYYY-MM', or 'YYYY-MM-DD')
  const filteredReported = useMemo(() => {
    const q = (searchTerm || '').toLowerCase().trim();
    return reports.filter((r) => {
      const matchesSearch =
        !q ||
        (r.officeName || '').toLowerCase().includes(q) ||
        (r.reporterName || '').toLowerCase().includes(q) ||
        (r.reporterPosition || '').toLowerCase().includes(q) ||
        (r.centerName || '').toLowerCase().includes(q) ||
        (r.reportDate || '').includes(q);

      const matchesRegion =
        selectedRegion === 'ทั้งหมด' || r.region === selectedRegion;

      let matchesDate = true;
      if (selectedFolderDate !== 'ทั้งหมด') {
        if (selectedFolderDate.startsWith('month:')) {
          const ym = selectedFolderDate.replace('month:', '');
          matchesDate = (r.reportDate || '').startsWith(ym);
        } else {
          matchesDate = r.reportDate === selectedFolderDate;
        }
      }

      return matchesSearch && matchesRegion && matchesDate;
    });
  }, [reports, searchTerm, selectedRegion, selectedFolderDate]);

  // Group filteredReported into Daily Folders (sorted newest date first)
  const dailyReportFolders = useMemo<DailyReportFolder[]>(() => {
    const grouped = new Map<string, DOEReport[]>();
    filteredReported.forEach((r) => {
      const dateKey = r.reportDate || 'ไม่ระบุวันที่';
      const list = grouped.get(dateKey) || [];
      list.push(r);
      grouped.set(dateKey, list);
    });

    return Array.from(grouped.entries())
      .sort((a, b) => (b[0] || '').localeCompare(a[0] || ''))
      .map(([date, items]) => {
        const sortedItems = [...items].sort((a, b) => {
          const regIdxA = REGION_ORDER.indexOf((a.region || '') as any);
          const regIdxB = REGION_ORDER.indexOf((b.region || '') as any);
          if (regIdxA !== regIdxB && regIdxA !== -1 && regIdxB !== -1) {
            return regIdxA - regIdxB;
          }
          return (a.officeName || '').localeCompare(b.officeName || '', 'th');
        });

        let totalQueue = 0;
        let totalIssued = 0;
        let totalMissed = 0;
        sortedItems.forEach((item) => {
          totalQueue += Number(item.queueAppointment) || 0;
          totalIssued += Number(item.cardsIssued) || 0;
          totalMissed += Number(item.missedAppointment) || 0;
        });

        return {
          date,
          thaiDateFull: formatThaiDateFull(date),
          thaiDateShort: formatThaiDateShort(date),
          items: sortedItems,
          totalQueue,
          totalIssued,
          totalMissed,
        };
      });
  }, [filteredReported]);

  // Group dailyReportFolders by Month & Buddhist Year for the main list
  const monthlyReportFolders = useMemo(() => {
    const map = new Map<
      string,
      {
        monthKey: string;
        monthLabel: string;
        shortMonthLabel: string;
        folders: DailyReportFolder[];
        totalItems: number;
        totalQueue: number;
        totalIssued: number;
        totalMissed: number;
        allItemsInMonth: DOEReport[];
      }
    >();

    dailyReportFolders.forEach((folder) => {
      const meta = getMonthMetaFromIsoDate(folder.date);
      if (!map.has(meta.monthKey)) {
        map.set(meta.monthKey, {
          monthKey: meta.monthKey,
          monthLabel: meta.monthLabel,
          shortMonthLabel: meta.shortMonthLabel,
          folders: [],
          totalItems: 0,
          totalQueue: 0,
          totalIssued: 0,
          totalMissed: 0,
          allItemsInMonth: [],
        });
      }
      const grp = map.get(meta.monthKey)!;
      grp.folders.push(folder);
      grp.totalItems += folder.items.length;
      grp.totalQueue += folder.totalQueue;
      grp.totalIssued += folder.totalIssued;
      grp.totalMissed += folder.totalMissed;
      grp.allItemsInMonth.push(...folder.items);
    });

    return Array.from(map.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [dailyReportFolders]);

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths((prev) => ({
      ...prev,
      [monthKey]: !prev[monthKey],
    }));
  };

  const toggleFolder = (date: string) => {
    setCollapsedDates((prev) => ({
      ...prev,
      [date]: !prev[date],
    }));
  };

  const expandAllFolders = () => {
    const allM: Record<string, boolean> = {};
    allMonthGroups.forEach((m) => {
      allM[m.monthKey] = true;
    });
    setExpandedMonths(allM);
    setCollapsedDates({});
  };

  const collapseAllFolders = () => {
    setExpandedMonths({});
  };

  const selectedFolderDateDisplayLabel = useMemo(() => {
    if (selectedFolderDate === 'ทั้งหมด') {
      return `ทุกโฟลเดอร์ (${allMonthGroups.length} เดือน • ${allFolderStats.length} วัน)`;
    }
    if (selectedFolderDate.startsWith('month:')) {
      const ym = selectedFolderDate.replace('month:', '');
      const found = allMonthGroups.find((m) => m.monthKey === ym);
      return found ? `📁 รวมทั้ง${found.monthLabel} (${found.days.length} วัน)` : selectedFolderDate;
    }
    return `📅 รายวัน: ${formatThaiDateShort(selectedFolderDate)} (${selectedFolderDate})`;
  }, [selectedFolderDate, allMonthGroups, allFolderStats.length]);

  const pendingCheckDateDisplayLabel = useMemo(() => {
    if (pendingCheckDate === 'all') {
      return 'ทุกช่วงวันที่รวมกัน';
    }
    return `📅 รายวัน: ${formatThaiDateShort(pendingCheckDate)} (${pendingCheckDate})`;
  }, [pendingCheckDate]);

  // 2. Compute Pending Offices (ยังไม่รายงาน ตามรอบวันที่ตรวจสอบ)
  const pendingOfficesList = useMemo(() => {
    const list = officeList.filter((office) => {
      // Check if office has a report for the selected pendingCheckDate
      const hasReport = reports.some(
        (r) =>
          r.officeId === office.id &&
          (pendingCheckDate === 'all' ? true : r.reportDate === pendingCheckDate)
      );

      if (hasReport) return false;

      // Filter by region & search
      const matchesRegion =
        selectedRegion === 'ทั้งหมด' || office.region === selectedRegion;
      const q = (searchTerm || '').toLowerCase().trim();
      const matchesSearch =
        !q ||
        (office.name || '').toLowerCase().includes(q) ||
        (office.centerName || '').toLowerCase().includes(q) ||
        (office.region || '').toLowerCase().includes(q);

      return matchesRegion && matchesSearch;
    });

    return sortOfficesByRegion(list);
  }, [officeList, reports, pendingCheckDate, selectedRegion, searchTerm]);

  // Total pending count across all regions for badge
  const totalPendingInCycle = useMemo(() => {
    return officeList.filter((office) => {
      return !reports.some(
        (r) =>
          r.officeId === office.id &&
          (pendingCheckDate === 'all' ? true : r.reportDate === pendingCheckDate)
      );
    }).length;
  }, [officeList, reports, pendingCheckDate]);

  // Export to CSV (Reported reports - all or specific folder)
  const handleExportCSV = (targetList: DOEReport[] = filteredReported, fileSuffix?: string) => {
    if (targetList.length === 0) return;

    const exportCats = (activeCategories && activeCategories.length > 0)
      ? activeCategories
      : [
          { id: 'cat_1791818621214', title: 'กลุ่มมาตรา 63/2 (มติ ครม 11 พฤศจิกายน 2568)' },
          { id: 'modifyDetails', title: 'กลุ่มมาตรา 59 / มาตรา 62' },
          { id: 'section59', title: 'กลุ่มมาตรา 59 ( MOU )' },
          { id: 'section62', title: 'มาตรา 63และกลุ่มมาตรา 63/1' },
          { id: 'section63_1', title: 'กลุ่มมาตรา 63/2' },
          { id: 'section63_2', title: 'กลุ่มมาตรา 64' },
          { id: 'section64', title: 'เปลี่ยนแปลงรายการใบอนุญาตทำงาน' },
          { id: 'substituteCard', title: 'ใบแทนใบอนุญาตทำงาน' },
        ];

    const categoryHeaders = exportCats.map((c) => `"${c.title} (คน)"`);

    const headers = [
      'โฟลเดอร์วันที่รายงาน',
      'สำนักงานจัดหางาน',
      'ศูนย์บริการ',
      'ภูมิภาค',
      'ชื่อผู้รายงาน',
      'ตำแหน่ง',
      'เบอร์โทรศัพท์',
      'LINE ID',
      ...categoryHeaders,
      `"รวม ${exportCats.length} กลุ่ม (คน)"`,
      'คิวนัดหมาย (คิว)',
      'ออกบัตร (ใบ)',
      'ยืนยันตัวตน (คน)',
      'บัตรเสีย (ใบ)',
      'ไม่มาตามนัด (คน)',
      'ไม่ตรงวันนัด (คน)',
      'หมายเหตุ',
    ];

    const rows = targetList.map((r) => {
      const categoryValues = exportCats.map((c) => {
        if (c.id === 'section59') return Number(r.section59) || 0;
        if (c.id === 'section62') return Number(r.section62) || 0;
        if (c.id === 'section63_1') return Number(r.section63_1) || 0;
        if (c.id === 'section63_2') return Number(r.section63_2) || 0;
        if (c.id === 'section64') return Number(r.section64) || 0;
        if (c.id === 'mouGroup') return Number(r.mouGroup) || Number(r.customCategoryValues?.['mouGroup']) || 0;
        if (c.id === 'modifyDetails') return Number(r.modifyDetails) || 0;
        if (c.id === 'substituteCard') return Number(r.substituteCard) || 0;
        return Number(r.customCategoryValues?.[c.id]) || 0;
      });

      const totalSec = calculateReportTotalSections(r);

      return [
        `"${r.reportDate || ''}"`,
        `"${(r.officeName || '').replace(/"/g, '""')}"`,
        `"${(r.centerName || '').replace(/"/g, '""')}"`,
        `"${r.region || ''}"`,
        `"${(r.reporterName || '').replace(/"/g, '""')}"`,
        `"${(r.reporterPosition || '').replace(/"/g, '""')}"`,
        `"${r.phoneNumber || ''}"`,
        `"${r.lineId || ''}"`,
        ...categoryValues,
        totalSec,
        r.queueAppointment || 0,
        r.cardsIssued || 0,
        r.identityVerified || 0,
        r.cardsNotIssued || 0,
        r.missedAppointment || 0,
        r.wrongAppointmentDate || 0,
        `"${(r.notes || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `DOE_Reports_${fileSuffix || new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Copy pending offices list to clipboard (For LINE group reminders)
  const handleCopyPendingList = async () => {
    if (pendingOfficesList.length === 0) return;

    const dateText =
      pendingCheckDate === 'all'
        ? 'ทุกรอบวันที่'
        : formatThaiDateFull(pendingCheckDate);

    const listText = [
      `📢 รายชื่อสำนักงานจัดหางานที่ยังไม่ส่งรายงานประจำวัน (${dateText})`,
      `จำนวนทั้งหมด: ${pendingOfficesList.length} แห่ง`,
      '══════════════════════════',
      ...pendingOfficesList.map(
        (o, i) => `${i + 1}. ${o.name} [${o.region}]`
      ),
      '══════════════════════════',
      'กรุณาดำเนินการรายงานผลการปฏิบัติงานผ่านระบบ DOE',
    ].join('\n');

    try {
      await navigator.clipboard.writeText(listText);
      setCopiedPendingList(true);
      setTimeout(() => setCopiedPendingList(false), 2500);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = listText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedPendingList(true);
      setTimeout(() => setCopiedPendingList(false), 2500);
    }
  };

  // Admin Protection Helpers for Editing, Deleting, Duplicating & Trash
  const executeProtectedAction = (actionName: string, actionFn: () => void) => {
    if (isAdmin) {
      actionFn();
    } else {
      setAdminActionTitle(actionName);
      setPendingAction(() => actionFn);
      setAdminPinInput('');
      setAdminPinError(false);
      setAdminModalOpen(true);
    }
  };

  const handleVerifyAdminPin = (e: React.FormEvent) => {
    e.preventDefault();
    const correctPin = adminPin || '0841543524';
    if (adminPinInput.trim() === correctPin || adminPinInput.trim() === '0841543524') {
      setIsAdmin(true);
      try {
        sessionStorage.setItem('doe_admin_authenticated', 'true');
      } catch {}
      setAdminPinError(false);
      setAdminModalOpen(false);
      if (pendingAction) {
        pendingAction();
        setPendingAction(null);
      }
    } else {
      setAdminPinError(true);
    }
  };

  const handleLockAdmin = () => {
    setIsAdmin(false);
    try {
      sessionStorage.removeItem('doe_admin_authenticated');
    } catch {}
  };

  const handleProtectedEdit = (report: DOEReport) => {
    executeProtectedAction(`แก้ไขข้อมูลรายงานของ "${report.officeName}"`, () => {
      onEditReport(report);
    });
  };

  const handleProtectedDelete = (id: string) => {
    const target = reports.find((r) => r.id === id);
    const officeName = target ? target.officeName : id;
    executeProtectedAction(`ลบรายงานของ "${officeName}"`, () => {
      onDeleteReport(id);
    });
  };

  const handleProtectedDuplicate = (report: DOEReport) => {
    executeProtectedAction(`คัดลอกสร้างรายงานใหม่จาก "${report.officeName}"`, () => {
      onDuplicateReport(report);
    });
  };

  const handleProtectedTrash = () => {
    executeProtectedAction('เปิดถังขยะและกู้คืนรายงานที่ถูกลบ', () => {
      setIsTrashModalOpen(true);
    });
  };

  return (
    <div className="space-y-4">
      {/* 1. TOP SUB-TABS: รายงานแล้ว vs สำนักงานที่ยังไม่รายงาน (ตามคำสั่งผู้ใช้) */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl text-sm">
          <button
            type="button"
            onClick={() => setActiveHistoryTab('reported')}
            className={`px-4 py-2.5 rounded-lg font-bold transition-all flex items-center gap-2 cursor-pointer text-sm sm:text-base ${
              activeHistoryTab === 'reported'
                ? 'bg-blue-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>รายงานผลเรียบร้อยแล้ว ({reports.length} ฉบับ • {allFolderStats.length} โฟลเดอร์วัน)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveHistoryTab('pending')}
            className={`px-4 py-2.5 rounded-lg font-bold transition-all flex items-center gap-2 cursor-pointer text-sm sm:text-base ${
              activeHistoryTab === 'pending'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-amber-800 hover:text-amber-950 hover:bg-amber-50'
            }`}
          >
            <Clock className="w-5 h-5" />
            <span>สำนักงานจัดหางานที่ยังไม่รายงาน ({totalPendingInCycle})</span>
          </button>
        </div>

        {/* Admin Access Indicator & Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-100 text-amber-950 border border-amber-300 text-xs font-bold shadow-2xs">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
              <span>สิทธิ์ Admin: จัดการแก้ไข/ลบได้</span>
              <button
                type="button"
                onClick={handleLockAdmin}
                className="ml-1 text-amber-800 hover:text-rose-600 underline font-normal text-[11px] cursor-pointer"
                title="ล็อคสิทธิ์เพื่อความปลอดภัย"
              >
                (ล็อคสิทธิ์)
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() =>
                executeProtectedAction('ปลดล็อคสิทธิ์ผู้ดูแลระบบ (Admin) เพื่อจัดการแก้ไข/ลบรายงาน', () => {})
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-semibold cursor-pointer transition-colors shadow-2xs"
              title="คลิกเพื่อยืนยันรหัสผ่าน Admin สำหรับการจัดการ"
            >
              <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>เฉพาะ Admin สำหรับแก้ไข/ลบ (คลิกเพื่อยืนยันสิทธิ์)</span>
            </button>
          )}

          <button
            onClick={() => onNewReport()}
            className="text-sm sm:text-base font-bold px-4 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4.5 h-4.5" />
            <span>เพิ่มรายงานใหม่</span>
          </button>
        </div>
      </div>

      {/* 1.5 MONTHLY -> DAILY FOLDERS SHELF (คลังโฟลเดอร์ประวัติการรายงาน: รวมตามเดือน -> คลิกเดือนเพื่อดูรายวัน) */}
      {activeHistoryTab === 'reported' && allMonthGroups.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <FolderOpen className="w-5 h-5 text-amber-500" />
              <span className="text-sm font-extrabold text-slate-900 font-['Prompt']">
                คลังโฟลเดอร์ประวัติการรายงาน ({allMonthGroups.length} เดือน • {allFolderStats.length} วัน)
              </span>
              <span className="text-xs text-slate-500">
                รวมกลุ่มตามเดือนและปี พ.ศ. เดียวกัน — คลิกเลือกชื่อเดือนเพื่อกางดูโฟลเดอร์รายวัน
              </span>
            </div>

            {(selectedFolderDate !== 'ทั้งหมด' || Object.values(expandedMonths).some(Boolean)) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedFolderDate('ทั้งหมด');
                  setExpandedMonths({});
                }}
                className="text-xs font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors cursor-pointer"
              >
                รีเซ็ตมุมมอง (ยุบรวมตามเดือน)
              </button>
            )}
          </div>

          {/* Row 1: All Folders + Month Cards */}
          <div className="flex items-center gap-2.5 overflow-x-auto pb-1.5">
            {/* All Folders Card */}
            <button
              type="button"
              onClick={() => setSelectedFolderDate('ทั้งหมด')}
              className={`shrink-0 px-3.5 py-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                selectedFolderDate === 'ทั้งหมด'
                  ? 'bg-gradient-to-r from-blue-900 to-indigo-900 text-white border-blue-900 shadow-xs'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  selectedFolderDate === 'ทั้งหมด'
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                <FolderOpen className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-extrabold font-['Prompt'] leading-tight">
                  ทุกเดือน / ทุกโฟลเดอร์
                </div>
                <div
                  className={`text-[11px] mt-0.5 ${
                    selectedFolderDate === 'ทั้งหมด' ? 'text-sky-200' : 'text-slate-500'
                  }`}
                >
                  รวม {reports.length} ฉบับ • {allFolderStats.length} วัน
                </div>
              </div>
            </button>

            {/* Month Folder Cards */}
            {allMonthGroups.map((mGroup) => {
              const isMonthExpanded = Boolean(expandedMonths[mGroup.monthKey]);
              const isMonthSelected =
                selectedFolderDate === `month:${mGroup.monthKey}` ||
                (!selectedFolderDate.startsWith('month:') &&
                  selectedFolderDate !== 'ทั้งหมด' &&
                  selectedFolderDate.startsWith(mGroup.monthKey));

              return (
                <button
                  key={mGroup.monthKey}
                  type="button"
                  onClick={() => {
                    const willExpand = !isMonthExpanded;
                    setExpandedMonths((prev) => ({
                      ...prev,
                      [mGroup.monthKey]: willExpand,
                    }));
                    if (willExpand) {
                      setSelectedFolderDate(`month:${mGroup.monthKey}`);
                    } else if (isMonthSelected) {
                      setSelectedFolderDate('ทั้งหมด');
                    }
                  }}
                  className={`shrink-0 px-3.5 py-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                    isMonthExpanded || isMonthSelected
                      ? 'bg-gradient-to-r from-sky-700 to-blue-800 text-white border-blue-800 shadow-xs ring-2 ring-sky-300/60'
                      : 'bg-amber-50/60 hover:bg-amber-100/70 text-slate-800 border-amber-200'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isMonthExpanded || isMonthSelected
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {isMonthExpanded || isMonthSelected ? (
                      <FolderOpen className="w-5 h-5" />
                    ) : (
                      <Folder className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-extrabold font-['Prompt'] leading-tight flex items-center gap-1.5">
                      <span>{mGroup.monthLabel}</span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          isMonthExpanded || isMonthSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-blue-100 text-blue-900'
                        }`}
                      >
                        {mGroup.days.length} วัน
                      </span>
                    </div>
                    <div
                      className={`text-[11px] mt-0.5 flex items-center gap-1.5 ${
                        isMonthExpanded || isMonthSelected ? 'text-amber-200' : 'text-slate-600'
                      }`}
                    >
                      <span>รวม {mGroup.totalReports} ฉบับ</span>
                      <span>•</span>
                      <span className={isMonthExpanded || isMonthSelected ? 'text-emerald-200 font-semibold' : 'text-emerald-700 font-semibold'}>
                        ออกบัตร {formatNumber(mGroup.totalIssued)} ใบ
                      </span>
                      <span>•</span>
                      <span className="underline font-semibold">
                        {isMonthExpanded ? 'ซ่อนรายวัน ▲' : 'คลิกดูรายวัน ▼'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Row 2: Daily Folder Cards when a Month is clicked/expanded */}
          {allMonthGroups
            .filter(
              (mGroup) =>
                expandedMonths[mGroup.monthKey] ||
                selectedFolderDate === `month:${mGroup.monthKey}` ||
                (selectedFolderDate !== 'ทั้งหมด' &&
                  !selectedFolderDate.startsWith('month:') &&
                  selectedFolderDate.startsWith(mGroup.monthKey))
            )
            .map((mGroup) => (
              <div
                key={`history-days-shelf-${mGroup.monthKey}`}
                className="p-3 rounded-xl bg-sky-50/70 border border-sky-200 space-y-2 animate-in fade-in duration-150"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-blue-950 font-['Prompt']">
                    <Calendar className="w-4 h-4 text-sky-700" />
                    <span>
                      เลือกรายวันของ {mGroup.monthLabel} ({mGroup.days.length} วัน):
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFolderDate(`month:${mGroup.monthKey}`)}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                      selectedFolderDate === `month:${mGroup.monthKey}`
                        ? 'bg-blue-900 text-white border-blue-900'
                        : 'bg-white text-blue-800 border-blue-200 hover:bg-blue-50'
                    }`}
                  >
                    แสดงทุกวันใน{mGroup.shortMonthLabel} ({mGroup.days.length} วัน)
                  </button>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {mGroup.days.map((folder) => {
                    const isSelected = selectedFolderDate === folder.date;
                    return (
                      <button
                        key={folder.date}
                        type="button"
                        onClick={() => {
                          setSelectedFolderDate(
                            isSelected ? `month:${mGroup.monthKey}` : folder.date
                          );
                          setCollapsedDates((prev) => ({ ...prev, [folder.date]: false }));
                        }}
                        className={`shrink-0 px-3 py-2 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${
                          isSelected
                            ? 'bg-gradient-to-r from-blue-900 to-indigo-900 text-white border-blue-900 shadow-xs ring-2 ring-sky-300/60'
                            : 'bg-white hover:bg-amber-50 text-slate-800 border-slate-200'
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-amber-400 text-slate-950'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {isSelected ? (
                            <FolderOpen className="w-4 h-4" />
                          ) : (
                            <Folder className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-extrabold font-['Prompt'] leading-tight flex items-center gap-1.5">
                            <span>รายวัน: {folder.thaiDateShort}</span>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                                isSelected
                                  ? 'bg-white/20 text-white'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {folder.count} ฉบับ
                            </span>
                          </div>
                          <div
                            className={`text-[10.5px] mt-0.5 flex items-center gap-1.5 ${
                              isSelected ? 'text-amber-200' : 'text-slate-600'
                            }`}
                          >
                            <span>คิว {formatNumber(folder.totalQueue)}</span>
                            <span>•</span>
                            <span
                              className={
                                isSelected
                                  ? 'text-emerald-200 font-semibold'
                                  : 'text-emerald-700 font-semibold'
                              }
                            >
                              ออกบัตร {formatNumber(folder.totalIssued)} ใบ
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* 2. FILTER & SEARCH BAR */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              id={searchInputId}
              type="text"
              placeholder={
                activeHistoryTab === 'reported'
                  ? 'ค้นหาชื่อสำนักงาน, ผู้รายงาน, ตำแหน่ง, วันที่...'
                  : 'ค้นหาจังหวัด, พื้นที่, หรือชื่อศูนย์บริการ...'
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-sm pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* Region filter */}
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            aria-label="เลือกภูมิภาค"
            className="text-sm px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-medium"
          >
            <option value="ทั้งหมด">ทุกภูมิภาค</option>
            <option value="กรุงเทพมหานคร">🏛️ กรุงเทพมหานคร (10 พื้นที่)</option>
            <option value="ภาคกลางและตะวันตก">🌾 ภาคกลางและตะวันตก (16 จังหวัด)</option>
            <option value="ภาคตะวันออก">🌊 ภาคตะวันออก (8 จังหวัด)</option>
            <option value="ภาคตะวันออกเฉียงเหนือ">☀️ ภาคตะวันออกเฉียงเหนือ (20 จังหวัด)</option>
            <option value="ภาคเหนือ">⛰️ ภาคเหนือ (17 จังหวัด)</option>
            <option value="ภาคใต้">🏝️ ภาคใต้ (14 จังหวัด)</option>
            <option value="เฉพาะกิจ">🚚 เฉพาะกิจ (Mobile Unit)</option>
          </select>

          {/* Date Selector (Grouped by Month & ปี พ.ศ. -> Click Month to show Daily) */}
          <div
            ref={dateDropdownRef}
            className="relative flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm"
          >
            {activeHistoryTab === 'reported' ? (
              <>
                <Folder className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-slate-600 font-bold text-xs shrink-0">โฟลเดอร์วันที่:</span>
              </>
            ) : (
              <>
                <Calendar className="w-4 h-4 text-blue-700 shrink-0" />
                <span className="text-slate-600 font-bold text-xs shrink-0">รอบวันที่:</span>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                setIsDateDropdownOpen((prev) => {
                  const next = !prev;
                  if (next) setDropdownExpandedMonth(null);
                  return next;
                });
              }}
              className="flex items-center gap-1.5 font-bold text-slate-900 focus:outline-hidden cursor-pointer text-sm"
            >
              <span>
                {activeHistoryTab === 'reported'
                  ? selectedFolderDateDisplayLabel
                  : pendingCheckDateDisplayLabel}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-slate-500 transition-transform ${
                  isDateDropdownOpen ? 'rotate-180 text-blue-700' : ''
                }`}
              />
            </button>

            {isDateDropdownOpen && (
              <div className="absolute left-0 top-full mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden">
                <div className="p-2 border-b border-slate-100 bg-slate-50/70">
                  {activeHistoryTab === 'reported' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFolderDate('ทั้งหมด');
                        setIsDateDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-between transition-colors cursor-pointer ${
                        selectedFolderDate === 'ทั้งหมด'
                          ? 'bg-blue-900 text-white'
                          : 'text-slate-700 hover:bg-slate-200/70'
                      }`}
                    >
                      <span>📁 ทุกโฟลเดอร์ ({allMonthGroups.length} เดือน • {allFolderStats.length} วัน)</span>
                      {selectedFolderDate === 'ทั้งหมด' && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setPendingCheckDate('all');
                        setIsDateDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-between transition-colors cursor-pointer ${
                        pendingCheckDate === 'all'
                          ? 'bg-blue-900 text-white'
                          : 'text-slate-700 hover:bg-slate-200/70'
                      }`}
                    >
                      <span>📊 ทุกช่วงวันที่รวมกัน</span>
                      {pendingCheckDate === 'all' && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  )}
                </div>

                <div className="p-2.5 max-h-80 overflow-y-auto space-y-1.5">
                  <div className="px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    📆 คลิกเลือกเดือนเพื่อดูรายวัน
                  </div>
                  {allMonthGroups.map((mGroup) => {
                    const isExpanded = dropdownExpandedMonth === mGroup.monthKey;
                    const isActive =
                      activeHistoryTab === 'reported'
                        ? selectedFolderDate === `month:${mGroup.monthKey}` ||
                          (selectedFolderDate !== 'ทั้งหมด' &&
                            !selectedFolderDate.startsWith('month:') &&
                            selectedFolderDate.startsWith(mGroup.monthKey))
                        : pendingCheckDate !== 'all' &&
                          pendingCheckDate.startsWith(mGroup.monthKey);

                    return (
                      <div
                        key={mGroup.monthKey}
                        className={`rounded-xl border transition-all overflow-hidden ${
                          isExpanded
                            ? 'border-blue-300 bg-blue-50/30'
                            : isActive
                            ? 'border-sky-200 bg-sky-50/40'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setDropdownExpandedMonth((prev) =>
                              prev === mGroup.monthKey ? null : mGroup.monthKey
                            )
                          }
                          className="w-full px-3 py-2.5 text-left flex items-center justify-between gap-2 hover:bg-blue-50/70 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                isExpanded || isActive
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
                              <div className="text-xs sm:text-sm font-extrabold text-slate-900 font-['Prompt'] truncate">
                                {mGroup.monthLabel}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {mGroup.days.length} วัน • รวม {mGroup.totalReports} ฉบับ
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-900">
                              {isExpanded ? 'ซ่อนรายวัน' : 'คลิกดูรายวัน'}
                            </span>
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-blue-700" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-2.5 pb-2.5 pt-1 border-t border-blue-100 bg-white space-y-1">
                            {activeHistoryTab === 'reported' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedFolderDate(`month:${mGroup.monthKey}`);
                                  setExpandedMonths((prev) => ({
                                    ...prev,
                                    [mGroup.monthKey]: true,
                                  }));
                                  setIsDateDropdownOpen(false);
                                }}
                                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                                  selectedFolderDate === `month:${mGroup.monthKey}`
                                    ? 'bg-sky-700 text-white'
                                    : 'bg-sky-50 text-sky-900 hover:bg-sky-100'
                                }`}
                              >
                                <span>📊 ดูทุกวันใน{mGroup.monthLabel} ({mGroup.days.length} วัน)</span>
                                {selectedFolderDate === `month:${mGroup.monthKey}` && (
                                  <Check className="w-3.5 h-3.5 shrink-0" />
                                )}
                              </button>
                            )}

                            {mGroup.days.map((dItem) => {
                              const isSelectedDay =
                                activeHistoryTab === 'reported'
                                  ? selectedFolderDate === dItem.date
                                  : pendingCheckDate === dItem.date;

                              return (
                                <button
                                  key={dItem.date}
                                  type="button"
                                  onClick={() => {
                                    if (activeHistoryTab === 'reported') {
                                      setSelectedFolderDate(dItem.date);
                                      setExpandedMonths((prev) => ({
                                        ...prev,
                                        [mGroup.monthKey]: true,
                                      }));
                                      setCollapsedDates((prev) => ({
                                        ...prev,
                                        [dItem.date]: false,
                                      }));
                                    } else {
                                      setPendingCheckDate(dItem.date);
                                    }
                                    setIsDateDropdownOpen(false);
                                  }}
                                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                                    isSelectedDay
                                      ? 'bg-blue-900 text-white'
                                      : 'text-slate-800 hover:bg-sky-50'
                                  }`}
                                >
                                  <span className="truncate">
                                    📅 รายวัน: {dItem.thaiDateShort} ({dItem.date})
                                  </span>
                                  <span
                                    className={`text-[10.5px] px-2 py-0.5 rounded-full shrink-0 ${
                                      isSelectedDay
                                        ? 'bg-blue-800 text-amber-200'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {dItem.count} ฉบับ
                                  </span>
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
        </div>

        {/* Action Button on Top-Right */}
        <div className="flex flex-wrap items-center gap-2">
          {activeHistoryTab === 'reported' && monthlyReportFolders.length > 0 && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={expandAllFolders}
                className="text-xs font-bold px-2.5 py-1.5 rounded-lg hover:bg-white text-slate-700 transition-colors cursor-pointer flex items-center gap-1"
                title="กางออกดูโฟลเดอร์รายวันในทุกเดือน"
              >
                <ChevronsUpDown className="w-3.5 h-3.5 text-blue-600" />
                <span>กางรายวันทั้งหมด</span>
              </button>
              <button
                type="button"
                onClick={collapseAllFolders}
                className="text-xs font-bold px-2.5 py-1.5 rounded-lg hover:bg-white text-slate-700 transition-colors cursor-pointer"
                title="ยุบรวมเป็นชื่อเดือนทั้งหมด"
              >
                ยุบรวมเป็นรายเดือน
              </button>
            </div>
          )}

          {deletedReports.length > 0 && (
            <button
              type="button"
              onClick={handleProtectedTrash}
              className="text-sm font-bold px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-800 rounded-lg border border-rose-300 transition-colors flex items-center gap-2 cursor-pointer shadow-2xs"
              title={isAdmin ? 'ดูรายการรายงานที่ถูกลบและกู้คืน (สิทธิ์ Admin)' : 'ถังขยะรายงานที่ลบ (เฉพาะ Admin)'}
            >
              <RotateCcw className="w-4 h-4 text-rose-600" />
              <span>ถังขยะรายงานที่ลบ ({deletedReports.length})</span>
              {!isAdmin && <Lock className="w-3.5 h-3.5 text-amber-600" />}
            </button>
          )}

          {activeHistoryTab === 'reported' ? (
            <button
              onClick={() => handleExportCSV(filteredReported)}
              className="text-sm font-bold px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-300 transition-colors flex items-center gap-2 cursor-pointer shadow-2xs"
              title="ส่งออกรายงานผลเป็นไฟล์ CSV / Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>ส่งออก CSV (Excel)</span>
            </button>
          ) : (
            <button
              onClick={handleCopyPendingList}
              className="text-sm font-bold px-3.5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-2xs transition-colors flex items-center gap-2 cursor-pointer"
              title="คัดลอกรายชื่อสำนักงานที่ยังไม่ส่งรายงานเพื่อส่งตามงานใน LINE"
            >
              {copiedPendingList ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>คัดลอกรายชื่อแล้ว!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>คัดลอกรายชื่อส่ง LINE ติดตาม</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 3. CONTENT AREA BASED ON ACTIVE SUB-TAB */}
      {activeHistoryTab === 'reported' ? (
        /* TAB 1: รายงานผลเรียบร้อยแล้ว (รวมเป็นชื่อเดือน เมื่อคลิกเลือกเดือนจึงแสดงโฟลเดอร์รายวัน) */
        monthlyReportFolders.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-300 text-slate-500">
            <p className="font-semibold text-slate-700">ไม่พบโฟลเดอร์ประวัติการรายงานตามเงื่อนไข</p>
            <p className="text-xs mt-1">ลองเปลี่ยนคำค้นหา เลือกทุกโฟลเดอร์ หรือกดปุ่ม "เพิ่มรายงานใหม่"</p>
          </div>
        ) : (
          <div className="space-y-4">
            {monthlyReportFolders.map((monthGroup) => {
              const isSingleDateInThisMonth =
                selectedFolderDate !== 'ทั้งหมด' &&
                !selectedFolderDate.startsWith('month:') &&
                selectedFolderDate.startsWith(monthGroup.monthKey);
              const isMonthSelected = selectedFolderDate === `month:${monthGroup.monthKey}`;
              const isMonthExpanded =
                Boolean(expandedMonths[monthGroup.monthKey]) ||
                isMonthSelected ||
                isSingleDateInThisMonth ||
                Boolean(searchTerm.trim());

              return (
                <div
                  key={monthGroup.monthKey}
                  className="bg-white rounded-2xl border-2 border-slate-200/90 shadow-xs overflow-hidden transition-all"
                >
                  {/* MONTH FOLDER HEADER: Click to expand/collapse daily folders */}
                  <div className="p-4 bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-900 text-white flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => toggleMonth(monthGroup.monthKey)}
                      className="flex items-center gap-3.5 text-left cursor-pointer group flex-1 min-w-[240px]"
                    >
                      <div className="w-11 h-11 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shadow-md shrink-0 transition-transform group-hover:scale-105">
                        {isMonthExpanded ? (
                          <FolderOpen className="w-6 h-6" />
                        ) : (
                          <Folder className="w-6 h-6" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10.5px] font-extrabold px-2.5 py-0.5 rounded-md bg-amber-400 text-slate-950 font-mono">
                            โฟลเดอร์ประจำเดือน
                          </span>
                          <h3 className="font-black text-white text-base sm:text-lg font-['Prompt'] group-hover:text-amber-300 transition-colors">
                            {monthGroup.monthLabel}
                          </h3>
                          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/15 text-sky-200 border border-white/20">
                            รวม {monthGroup.folders.length} วัน
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5 mt-1 text-xs text-sky-100 flex-wrap">
                          <span className="font-bold text-amber-200">
                            รายงานรวม: {monthGroup.totalItems} ฉบับ
                          </span>
                          <span>•</span>
                          <span>
                            คิวนัดหมายรวม: <b className="text-white">{formatNumber(monthGroup.totalQueue)}</b> คิว
                          </span>
                          <span>•</span>
                          <span className="text-emerald-300 font-semibold">
                            ออกบัตรสำเร็จรวม: <b>{formatNumber(monthGroup.totalIssued)}</b> ใบ
                          </span>
                          <span>•</span>
                          <span className="text-amber-300 underline font-bold">
                            {isMonthExpanded
                              ? 'คลิกเพื่อยุบรวมเป็นชื่อเดือน ▲'
                              : 'คลิกเลือกเดือนเพื่อแสดงโฟลเดอร์รายวัน ▼'}
                          </span>
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleExportCSV(monthGroup.allItemsInMonth, monthGroup.monthKey)}
                        className="text-xs font-bold px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors flex items-center gap-1.5 cursor-pointer"
                        title={`ส่งออกไฟล์ CSV ทั้ง${monthGroup.monthLabel}`}
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
                        <span>CSV ทั้งเดือน ({monthGroup.totalItems})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleMonth(monthGroup.monthKey)}
                        className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                      >
                        {isMonthExpanded ? (
                          <>
                            <span>ซ่อนรายวัน</span>
                            <ChevronDown className="w-4 h-4" />
                          </>
                        ) : (
                          <>
                            <span>ดูรายวัน ({monthGroup.folders.length} วัน)</span>
                            <ChevronRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* DAILY FOLDERS INSIDE THIS MONTH (Shown only when Month is clicked/expanded) */}
                  {isMonthExpanded && (
                    <div className="p-3 sm:p-4 bg-slate-50/70 space-y-4">
                      {monthGroup.folders.map((folder) => {
                        const isCollapsed = Boolean(collapsedDates[folder.date]);

                        return (
                          <div
                            key={folder.date}
                            className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden transition-all"
                          >
                            {/* Daily Folder Header Bar */}
                            <div className="p-4 bg-gradient-to-r from-amber-50/90 via-slate-50 to-sky-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => toggleFolder(folder.date)}
                                className="flex items-center gap-3 text-left cursor-pointer group flex-1 min-w-[240px]"
                              >
                                <div className="w-11 h-11 rounded-xl bg-amber-400/90 group-hover:bg-amber-400 text-slate-950 flex items-center justify-center shadow-2xs shrink-0 transition-colors">
                                  {isCollapsed ? (
                                    <Folder className="w-5 h-5" />
                                  ) : (
                                    <FolderOpen className="w-5 h-5" />
                                  )}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-md bg-blue-900 text-white font-mono">
                                      โฟลเดอร์รายงานประจำวัน
                                    </span>
                                    <h4 className="font-black text-slate-900 text-sm sm:text-base font-['Prompt'] group-hover:text-blue-800 transition-colors">
                                      {folder.thaiDateFull}
                                    </h4>
                                    <span className="text-xs font-mono text-slate-500">
                                      ({folder.date})
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2.5 mt-1 text-xs text-slate-600 flex-wrap">
                                    <span className="font-bold text-blue-900 bg-blue-100/80 px-2 py-0.5 rounded-md border border-blue-200">
                                      รายงานในโฟลเดอร์นี้: {folder.items.length} แห่ง
                                    </span>
                                    <span className="font-semibold text-teal-800">
                                      คิวนัดหมายรวม: <b>{formatNumber(folder.totalQueue)}</b> คิว
                                    </span>
                                    <span>•</span>
                                    <span className="font-semibold text-emerald-800">
                                      ออกบัตรสำเร็จรวม: <b>{formatNumber(folder.totalIssued)}</b> ใบ
                                    </span>
                                    <span>•</span>
                                    <span className="font-semibold text-rose-700">
                                      ไม่มาตามนัด: <b>{formatNumber(folder.totalMissed)}</b> คน
                                    </span>
                                  </div>
                                </div>
                              </button>

                              {/* Per-Folder Actions */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => handleExportCSV(folder.items, folder.date)}
                                  className="text-xs font-bold px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
                                  title={`ส่งออกไฟล์ CSV เฉพาะโฟลเดอร์วันที่ ${folder.thaiDateShort}`}
                                >
                                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>CSV วันนี้ ({folder.items.length})</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => toggleFolder(folder.date)}
                                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  {isCollapsed ? (
                                    <>
                                      <span>เปิดโฟลเดอร์</span>
                                      <ChevronRight className="w-4 h-4" />
                                    </>
                                  ) : (
                                    <>
                                      <span>พับเก็บ</span>
                                      <ChevronDown className="w-4 h-4" />
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Folder Contents: Report Cards Grid */}
                            {!isCollapsed && (
                              <div className="p-4 bg-slate-50/40 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-4">
                                {folder.items.map((r) => {
                                  const totalSec = calculateReportTotalSections(r);

                                  return (
                                    <div
                                      key={r.id}
                                      className="bg-white rounded-xl border border-slate-200 hover:border-sky-300 hover:shadow-md transition-all p-4.5 flex flex-col justify-between space-y-3"
                                    >
                                      <div>
                                        {/* Card Header */}
                                        <div className="flex items-start justify-between gap-2">
                                          <span className="text-xs sm:text-sm font-bold px-2.5 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-200">
                                            {r.region}
                                          </span>
                                          <span className="text-xs sm:text-sm font-semibold text-slate-500">
                                            {formatThaiDateShort(r.reportDate)}
                                          </span>
                                        </div>

                                        {/* Office & Center */}
                                        <div className="mt-2.5">
                                          <h4 className="font-extrabold text-slate-900 text-base leading-snug line-clamp-1 font-['Prompt']">
                                            {r.officeName}
                                          </h4>
                                          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 line-clamp-1">
                                            {r.centerName}
                                          </p>
                                        </div>

                                        {/* Reporter info */}
                                        <div className="mt-2.5 text-sm bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                          <div className="font-bold text-slate-800 truncate">
                                            👤 {r.reporterName}
                                          </div>
                                          <div className="text-xs sm:text-sm text-slate-500 truncate mt-0.5">
                                            💼 {r.reporterPosition}
                                          </div>
                                        </div>

                                        {/* Metrics snapshot */}
                                        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                                          <div className="bg-teal-50 border border-teal-100 p-2 rounded-xl">
                                            <div className="text-xs text-teal-700 font-semibold">คิวนัดหมาย</div>
                                            <div className="font-black text-teal-950 mt-0.5 text-base font-['Prompt']">
                                              {formatNumber(r.queueAppointment)}
                                            </div>
                                          </div>
                                          <div className="bg-emerald-50 border border-emerald-100 p-2 rounded-xl">
                                            <div className="text-xs text-emerald-700 font-semibold">ออกบัตร</div>
                                            <div className="font-black text-emerald-950 mt-0.5 text-base font-['Prompt']">
                                              {formatNumber(r.cardsIssued)}
                                            </div>
                                          </div>
                                          <div className="bg-rose-50 border border-rose-100 p-2 rounded-xl">
                                            <div className="text-xs text-rose-700 font-semibold">ไม่มาตามนัด</div>
                                            <div className="font-black text-rose-950 mt-0.5 text-base font-['Prompt']">
                                              {formatNumber(r.missedAppointment)}
                                            </div>
                                          </div>
                                        </div>

                                        {/* Groups highlights */}
                                        <div className="mt-3 flex items-center justify-between text-xs sm:text-sm text-slate-600 px-1">
                                          <span
                                            className="cursor-help hover:text-blue-900 transition-colors"
                                            title={`ยอดรวมจากตัวเลขตามจริงทั้ง ${activeGroupsCount} กลุ่ม`}
                                          >
                                            รวม {activeGroupsCount} กลุ่ม: <b className="text-slate-900 font-bold">{formatNumber(totalSec)}</b> คน
                                          </span>
                                          <span
                                            className="cursor-help hover:text-emerald-900 transition-colors"
                                            title="อัตราความสำเร็จ: คำนวณจาก (จำนวนออกบัตรสำเร็จ ÷ จำนวนคิวนัดหมาย) × 100"
                                          >
                                            สำเร็จ: <b className="text-emerald-700 font-bold">{r.queueAppointment > 0 ? Math.round((r.cardsIssued / r.queueAppointment) * 100) : 0}%</b>
                                          </span>
                                        </div>
                                      </div>

                                      {/* Card Action Buttons */}
                                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
                                        <div className="flex items-center gap-1">
                                          <button
                                            onClick={() => onOpenLineModal(r)}
                                            className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                                            title="คัดลอกข้อความสรุปส่ง LINE"
                                          >
                                            <MessageCircle className="w-4 h-4" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleProtectedDuplicate(r)}
                                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                              isAdmin
                                                ? 'text-slate-600 hover:bg-slate-100'
                                                : 'text-slate-500 hover:text-amber-700 hover:bg-amber-50'
                                            }`}
                                            title={isAdmin ? 'คัดลอกสร้างรายงานใหม่ (สิทธิ์ Admin)' : 'คัดลอกสร้างรายงานใหม่ (เฉพาะ Admin)'}
                                          >
                                            <div className="relative">
                                              <Copy className="w-4 h-4" />
                                              {!isAdmin && (
                                                <Lock className="w-2.5 h-2.5 text-amber-600 absolute -bottom-1 -right-1" />
                                              )}
                                            </div>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleProtectedEdit(r)}
                                            className={`p-1.5 rounded-lg transition-all cursor-pointer shadow-2xs border ${
                                              isAdmin
                                                ? 'text-blue-700 hover:text-white hover:bg-blue-600 border-blue-200 hover:border-blue-600'
                                                : 'text-slate-500 hover:text-blue-700 hover:bg-blue-50 border-slate-200'
                                            }`}
                                            title={isAdmin ? 'แก้ไขข้อมูลรายงาน (สิทธิ์ Admin)' : 'แก้ไขข้อมูลรายงาน (เฉพาะ Admin)'}
                                            aria-label="แก้ไขข้อมูลรายงาน"
                                          >
                                            <div className="relative">
                                              <Edit2 className="w-4 h-4" />
                                              {!isAdmin && (
                                                <Lock className="w-2.5 h-2.5 text-amber-600 absolute -bottom-1 -right-1" />
                                              )}
                                            </div>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleProtectedDelete(r.id)}
                                            className={`p-1.5 rounded-lg transition-all cursor-pointer shadow-2xs border ${
                                              isAdmin
                                                ? 'text-rose-600 hover:text-white hover:bg-rose-600 border-rose-200 hover:border-rose-600'
                                                : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50 border-slate-200'
                                            }`}
                                            title={isAdmin ? 'ลบรายงานนี้ (สิทธิ์ Admin)' : 'ลบรายงานนี้ (เฉพาะ Admin)'}
                                            aria-label="ลบรายงานนี้"
                                          >
                                            <div className="relative">
                                              <Trash2 className="w-4 h-4" />
                                              {!isAdmin && (
                                                <Lock className="w-2.5 h-2.5 text-amber-600 absolute -bottom-1 -right-1" />
                                              )}
                                            </div>
                                          </button>
                                        </div>

                                        <button
                                          onClick={() => onViewPoster(r)}
                                          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                                        >
                                          <Eye className="w-3.5 h-3.5" />
                                          <span>ดูโปสเตอร์</span>
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* TAB 2: สำนักงานจัดหางานที่ยังไม่รายงาน (ตามคำสั่งผู้ใช้) */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-amber-50/40">
            <div className="flex items-center gap-2.5">
              <Clock className="w-5 h-5 text-amber-600" />
              <div>
                <h3 className="font-extrabold text-slate-900 text-base sm:text-lg font-['Prompt']">
                  รายชื่อสำนักงานจัดหางานที่ยังไม่ส่งรายงาน
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  รอบวันที่ {pendingCheckDate === 'all' ? 'ทุกช่วงวัน' : formatThaiDateFull(pendingCheckDate)} —{' '}
                  พบสำนักงานที่ยังไม่ส่งรายงานทั้งหมด {pendingOfficesList.length} แห่ง
                </p>
              </div>
            </div>

            <div className="text-xs sm:text-sm font-bold px-3.5 py-1.5 bg-amber-100 text-amber-900 rounded-xl border border-amber-200 shadow-2xs">
              รอการส่งรายงาน {pendingOfficesList.length} แห่ง
            </div>
          </div>

          {/* Pending Offices Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm sm:text-base">
              <thead className="bg-slate-100/70 text-slate-800 font-bold border-b border-slate-200 uppercase text-xs sm:text-sm tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 whitespace-nowrap">สถานะ</th>
                  <th className="py-3.5 px-4">สำนักงานจัดหางาน</th>
                  <th className="py-3.5 px-4">ภูมิภาค</th>
                  <th className="py-3.5 px-4 text-right">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingOfficesList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                        <p className="font-bold text-slate-800 text-base">
                          ครบถ้วนทุกสำนักงาน!
                        </p>
                        <p className="text-sm text-slate-500">
                          ไม่มีสำนักงานจัดหางานที่ค้างส่งรายงานในเงื่อนไขนี้
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pendingOfficesList.map((office) => (
                    <tr
                      key={office.id}
                      className="hover:bg-amber-50/50 bg-amber-50/15 transition-colors"
                    >
                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs sm:text-sm font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          <span>ยังไม่ส่งรายงาน</span>
                        </span>
                      </td>

                      {/* Office */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 text-base font-['Prompt']">{office.name}</div>
                        <div className="text-xs sm:text-sm text-slate-500 truncate max-w-[320px] mt-0.5">
                          {office.centerName}
                        </div>
                      </td>

                      {/* Region */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-medium text-xs sm:text-sm">
                          {office.region}
                        </span>
                      </td>

                      {/* Action: Record report directly for this office */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => onNewReport(office.id)}
                          className="text-sm font-bold px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-2xs transition-colors flex items-center gap-1.5 ml-auto cursor-pointer"
                          title="เปิดแบบฟอร์มบันทึกรายงานให้สำนักงานจัดหางานนี้ทันที"
                        >
                          <Plus className="w-4 h-4" />
                          <span>+ บันทึกรายงาน</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* 4. TRASH MODAL: กู้คืนรายงานที่ถูกลบ */}
      {isTrashModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 font-['Prompt']">
                    ถังขยะรายงานที่ถูกลบ ({deletedReports.length} รายการ)
                  </h3>
                  <p className="text-xs text-slate-500">
                    รายงานที่ถูกลบจะถูกเก็บไว้ที่นี่ สามารถคลิกกู้คืนกลับมายังระบบได้ตลอดเวลา
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsTrashModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-slate-100 pr-1">
              {deletedReports.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  ไม่มีรายงานที่ถูกลบในถังขยะ
                </div>
              ) : (
                deletedReports.map((r) => (
                  <div
                    key={r.id}
                    className="py-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm font-['Prompt']">
                          {r.officeName}
                        </span>
                        <span className="text-xs text-slate-500">
                          ({formatThaiDateShort(r.reportDate)})
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        คิว: {formatNumber(r.queueAppointment)} | ออกบัตร:{' '}
                        {formatNumber(r.cardsIssued)} ใบ | ผู้รายงาน: {r.reporterName}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onRestoreReport?.(r.id);
                        if (deletedReports.length <= 1) {
                          setIsTrashModalOpen(false);
                        }
                      }}
                      className="text-xs font-bold px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>กู้คืนรายงานนี้</span>
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              {deletedReports.length > 1 && onRestoreAllReports ? (
                <button
                  type="button"
                  onClick={() => {
                    onRestoreAllReports();
                    setIsTrashModalOpen(false);
                  }}
                  className="text-xs font-bold px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>กู้คืนรายงานทั้งหมด ({deletedReports.length} ฉบับ)</span>
                </button>
              ) : (
                <span />
              )}

              <button
                type="button"
                onClick={() => setIsTrashModalOpen(false)}
                className="text-xs font-bold px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. ADMIN AUTH MODAL (เมื่อพยายามแก้ไข ลบ หรือจัดการรายงาน) */}
      {adminModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0 shadow-2xs">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base font-['Prompt']">
                    ยืนยันสิทธิ์ผู้ดูแลระบบ (Admin Only)
                  </h3>
                  <p className="text-xs text-amber-700 font-semibold">
                    สงวนสิทธิ์การแก้ไข/ลบ/กู้คืนรายงานเฉพาะ Admin
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdminModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {adminActionTitle && (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-700">
                <span className="font-bold text-slate-900">การดำเนินการ: </span>
                <span>{adminActionTitle}</span>
              </div>
            )}

            <form onSubmit={handleVerifyAdminPin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>รหัสผ่านผู้ดูแลระบบ (Admin Password)</span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    (ซ่อนรหัสเป็นเครื่องหมายดอกจัน *)
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="password"
                    maxLength={30}
                    placeholder="••••••••"
                    value={adminPinInput}
                    onChange={(e) => {
                      setAdminPinInput(e.target.value);
                      setAdminPinError(false);
                    }}
                    className={`w-full text-center text-lg tracking-widest px-9 py-2.5 bg-slate-50 border rounded-xl font-mono font-bold focus:bg-white focus:outline-hidden focus:ring-2 ${
                      adminPinError
                        ? 'border-rose-400 focus:ring-rose-400'
                        : 'border-slate-300 focus:ring-sky-500'
                    }`}
                    autoFocus
                  />
                  <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                </div>
                {adminPinError && (
                  <div className="text-xs text-rose-600 mt-2 flex items-center gap-1.5 justify-center">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>รหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบและลองใหม่อีกครั้ง</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdminModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>ยืนยันสิทธิ์และดำเนินการ</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
