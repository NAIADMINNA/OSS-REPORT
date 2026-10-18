import React, { useState, useId, useMemo } from 'react';
import { DOEReport, ReportCategory } from '../types/doe';
import { EMPLOYMENT_OFFICES } from '../data/offices';
import { formatNumber, formatThaiDateShort, formatThaiDateFull } from '../utils/thaiDate';
import { REGION_ORDER, sortOfficesByRegion } from '../utils/officeUtils';
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
} from 'lucide-react';

interface ReportHistoryProps {
  reports: DOEReport[];
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

export const ReportHistory: React.FC<ReportHistoryProps> = ({
  reports,
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
    if (activeCategories && activeCategories.length > 0) {
      return activeCategories.reduce((sum, cat) => {
        let val = 0;
        if (cat.id === 'section59') val = Number(r.section59) || 0;
        else if (cat.id === 'section62') val = Number(r.section62) || 0;
        else if (cat.id === 'section63_1') val = Number(r.section63_1) || 0;
        else if (cat.id === 'section63_2') val = Number(r.section63_2) || 0;
        else if (cat.id === 'section64') val = Number(r.section64) || 0;
        else if (cat.id === 'modifyDetails') val = Number(r.modifyDetails) || 0;
        else if (cat.id === 'substituteCard') val = Number(r.substituteCard) || 0;
        else {
          val = Number(r.customCategoryValues?.[cat.id]) || 0;
        }
        return sum + val;
      }, 0);
    }

    // Comprehensive fallback: sum all known standard properties + all customCategoryValues
    const customSum = Object.values(r.customCategoryValues || {}).reduce(
      (sum, val) => sum + (Number(val) || 0),
      0
    );
    return (
      (Number(r.section59) || 0) +
      (Number(r.section62) || 0) +
      (Number(r.section63_1) || 0) +
      (Number(r.section63_2) || 0) +
      (Number(r.section64) || 0) +
      (Number(r.modifyDetails) || 0) +
      (Number(r.substituteCard) || 0) +
      customSum
    );
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

  // Available distinct dates from reports
  const availableDates = useMemo(() => {
    const dates = Array.from(new Set(reports.map((r) => r.reportDate))).sort(
      (a, b) => b.localeCompare(a)
    );
    return dates;
  }, [reports]);

  // Selected date for checking pending offices
  const [pendingCheckDate, setPendingCheckDate] = useState<string>(() => {
    return availableDates[0] || '2026-10-07';
  });

  const [copiedPendingList, setCopiedPendingList] = useState(false);

  // 1. Filtered Reported reports
  const filteredReported = useMemo(() => {
    return reports.filter((r) => {
      const matchesSearch =
        r.officeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.reporterName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.reporterPosition.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.centerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.reportDate.includes(searchTerm);

      const matchesRegion =
        selectedRegion === 'ทั้งหมด' || r.region === selectedRegion;

      return matchesSearch && matchesRegion;
    });
  }, [reports, searchTerm, selectedRegion]);

  // 2. Compute Pending Offices (ยังไม่รายงาน ตามรอบวันที่ตรวจสอบ)
  const pendingOfficesList = useMemo(() => {
    const list = EMPLOYMENT_OFFICES.filter((office) => {
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
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        office.name.toLowerCase().includes(q) ||
        office.centerName.toLowerCase().includes(q) ||
        office.region.toLowerCase().includes(q);

      return matchesRegion && matchesSearch;
    });

    return sortOfficesByRegion(list);
  }, [reports, pendingCheckDate, selectedRegion, searchTerm]);

  // Total pending count across all regions for badge
  const totalPendingInCycle = useMemo(() => {
    return EMPLOYMENT_OFFICES.filter((office) => {
      return !reports.some(
        (r) =>
          r.officeId === office.id &&
          (pendingCheckDate === 'all' ? true : r.reportDate === pendingCheckDate)
      );
    }).length;
  }, [reports, pendingCheckDate]);

  // Export to CSV (Reported reports)
  const handleExportCSV = () => {
    if (reports.length === 0) return;

    const exportCats = (activeCategories && activeCategories.length > 0)
      ? activeCategories
      : [
          { id: 'section59', title: 'กลุ่มมาตรา 59' },
          { id: 'section62', title: 'กลุ่มมาตรา 62' },
          { id: 'section63_1', title: 'กลุ่มมาตรา 63/1' },
          { id: 'section63_2', title: 'กลุ่มมาตรา 63/2' },
          { id: 'section64', title: 'กลุ่มมาตรา 64' },
          { id: 'modifyDetails', title: 'เปลี่ยนแปลงรายการในใบอนุญาตทำงาน' },
          { id: 'substituteCard', title: 'ใบแทนใบอนุญาตทำงาน' },
        ];

    const categoryHeaders = exportCats.map((c) => `"${c.title} (คน)"`);

    const headers = [
      'วันที่รายงาน',
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
      'ไม่ออกบัตร (คน)',
      'ไม่มาตามนัด (คน)',
      'ไม่ตรงวันนัด (คน)',
      'หมายเหตุ',
    ];

    const rows = reports.map((r) => {
      const categoryValues = exportCats.map((c) => {
        if (c.id === 'section59') return Number(r.section59) || 0;
        if (c.id === 'section62') return Number(r.section62) || 0;
        if (c.id === 'section63_1') return Number(r.section63_1) || 0;
        if (c.id === 'section63_2') return Number(r.section63_2) || 0;
        if (c.id === 'section64') return Number(r.section64) || 0;
        if (c.id === 'modifyDetails') return Number(r.modifyDetails) || 0;
        if (c.id === 'substituteCard') return Number(r.substituteCard) || 0;
        return Number(r.customCategoryValues?.[c.id]) || 0;
      });

      const totalSec = calculateReportTotalSections(r);

      return [
        `"${r.reportDate}"`,
        `"${r.officeName.replace(/"/g, '""')}"`,
        `"${r.centerName.replace(/"/g, '""')}"`,
        `"${r.region}"`,
        `"${r.reporterName.replace(/"/g, '""')}"`,
        `"${r.reporterPosition.replace(/"/g, '""')}"`,
        `"${r.phoneNumber || ''}"`,
        `"${r.lineId || ''}"`,
        ...categoryValues,
        totalSec,
        r.queueAppointment,
        r.cardsIssued,
        r.identityVerified,
        r.cardsNotIssued,
        r.missedAppointment,
        r.wrongAppointmentDate,
        `"${(r.notes || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `DOE_Reports_${new Date().toISOString().slice(0, 10)}.csv`;
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
            <span>รายงานผลเรียบร้อยแล้ว ({reports.length})</span>
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

          {/* Date Selector for Pending tab */}
          {activeHistoryTab === 'pending' && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span className="text-slate-600 font-semibold text-xs">รอบวันที่:</span>
              <select
                value={pendingCheckDate}
                onChange={(e) => setPendingCheckDate(e.target.value)}
                className="bg-transparent font-bold text-slate-800 focus:outline-hidden cursor-pointer text-sm"
              >
                <option value="all">ทุกช่วงวันที่รวมกัน</option>
                {availableDates.map((d) => (
                  <option key={d} value={d}>
                    {formatThaiDateShort(d)} ({d})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Action Button on Top-Right */}
        <div className="flex flex-wrap items-center gap-2">
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
              onClick={handleExportCSV}
              className="text-sm font-bold px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-300 transition-colors flex items-center gap-2 cursor-pointer shadow-2xs"
              title="ส่งออกรายงานผลทั้งหมดเป็นไฟล์ CSV / Excel"
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
        /* TAB 1: รายงานผลเรียบร้อยแล้ว */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-4">
          {filteredReported.length === 0 ? (
            <div className="col-span-full bg-white p-12 text-center rounded-xl border border-dashed border-slate-300 text-slate-500">
              <p className="font-semibold text-slate-700">ไม่พบประวัติรายงานตามเงื่อนไข</p>
              <p className="text-xs mt-1">ลองเปลี่ยนคำค้นหา หรือกดปุ่ม "เพิ่มรายงานใหม่"</p>
            </div>
          ) : (
            filteredReported.map((r) => {
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
                        title={`ยอดรวมผู้รับบริการทั้ง ${activeGroupsCount} กลุ่มมาตรา ของรายงานฉบับนี้`}
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
            })
          )}
        </div>
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
