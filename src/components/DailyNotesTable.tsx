import React, { useState, useId, useMemo } from 'react';
import { DOEReport } from '../types/doe';
import { formatThaiDateShort, formatThaiDateFull } from '../utils/thaiDate';
import { AdminPinModal } from './AdminPinModal';
import {
  FileText,
  Search,
  Calendar,
  Copy,
  Check,
  Download,
  AlertCircle,
  MessageSquare,
  ClipboardList,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
} from 'lucide-react';

interface DailyNotesTableProps {
  reports: DOEReport[];
  isAdmin?: boolean;
  adminPin?: string;
  onAdminAuthenticated?: () => void;
}

interface DailyNoteFolder {
  date: string;
  thaiDateFull: string;
  thaiDateShort: string;
  items: DOEReport[];
  notesCount: number;
}

export const DailyNotesTable: React.FC<DailyNotesTableProps> = ({
  reports,
  isAdmin = false,
  adminPin = '0841543524',
  onAdminAuthenticated,
}) => {
  const searchInputId = useId();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('ทั้งหมด');
  const [selectedDate, setSelectedDate] = useState('ทั้งหมด');
  const [onlyWithNotes, setOnlyWithNotes] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedFolderDate, setCopiedFolderDate] = useState<string | null>(null);

  // Track which daily folders are collapsed (by default, folders are expanded for quick viewing)
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});

  // Admin authentication state
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminActionTitle, setAdminActionTitle] = useState('');
  const [pendingAdminAction, setPendingAdminAction] = useState<(() => void) | null>(null);

  // Available distinct dates from all reports (for the top folder shelf)
  const allFolderStats = useMemo(() => {
    const map = new Map<string, { total: number; withNotes: number }>();
    reports.forEach((r) => {
      const d = r.reportDate || 'ไม่ระบุวันที่';
      const curr = map.get(d) || { total: 0, withNotes: 0 };
      curr.total += 1;
      if (r.notes && r.notes.trim().length > 0) {
        curr.withNotes += 1;
      }
      map.set(d, curr);
    });

    return Array.from(map.entries())
      .sort((a, b) => (b[0] || '').localeCompare(a[0] || ''))
      .map(([date, stat]) => ({
        date,
        thaiDateShort: formatThaiDateShort(date),
        thaiDateFull: formatThaiDateFull(date),
        total: stat.total,
        withNotes: stat.withNotes,
      }));
  }, [reports]);

  const availableDates = useMemo(() => {
    return allFolderStats.map((f) => f.date);
  }, [allFolderStats]);

  // Filtered reports list
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      const q = (searchTerm || '').toLowerCase().trim();
      const matchSearch =
        !q ||
        (r.officeName || '').toLowerCase().includes(q) ||
        (r.centerName || '').toLowerCase().includes(q) ||
        (r.notes || '').toLowerCase().includes(q) ||
        (r.reporterName || '').toLowerCase().includes(q) ||
        (r.region || '').toLowerCase().includes(q);

      const matchRegion =
        selectedRegion === 'ทั้งหมด' || r.region === selectedRegion;

      const matchDate =
        selectedDate === 'ทั้งหมด' || r.reportDate === selectedDate;

      const hasNotes = Boolean(r.notes && r.notes.trim().length > 0);
      const matchNotesFilter = onlyWithNotes ? hasNotes : true;

      return matchSearch && matchRegion && matchDate && matchNotesFilter;
    });
  }, [reports, searchTerm, selectedRegion, selectedDate, onlyWithNotes]);

  // Group filtered reports into Daily Folders (sorted newest date first)
  const dailyFolders = useMemo<DailyNoteFolder[]>(() => {
    const grouped = new Map<string, DOEReport[]>();
    filteredReports.forEach((r) => {
      const dateKey = r.reportDate || 'ไม่ระบุวันที่';
      const list = grouped.get(dateKey) || [];
      list.push(r);
      grouped.set(dateKey, list);
    });

    return Array.from(grouped.entries())
      .sort((a, b) => (b[0] || '').localeCompare(a[0] || ''))
      .map(([date, items]) => {
        // Sort items inside the folder: items with notes first, then by office name
        const sortedItems = [...items].sort((a, b) => {
          const aHas = Boolean(a.notes && a.notes.trim().length > 0);
          const bHas = Boolean(b.notes && b.notes.trim().length > 0);
          if (aHas !== bHas) return aHas ? -1 : 1;
          return (a.officeName || '').localeCompare(b.officeName || '', 'th');
        });
        const notesCount = sortedItems.filter((item) =>
          Boolean(item.notes && item.notes.trim().length > 0)
        ).length;

        return {
          date,
          thaiDateFull: formatThaiDateFull(date),
          thaiDateShort: formatThaiDateShort(date),
          items: sortedItems,
          notesCount,
        };
      });
  }, [filteredReports]);

  // Reports with non-empty notes
  const reportsWithNotesCount = useMemo(() => {
    return reports.filter((r) => Boolean(r.notes && r.notes.trim().length > 0)).length;
  }, [reports]);

  const toggleFolder = (date: string) => {
    setCollapsedDates((prev) => ({
      ...prev,
      [date]: !prev[date],
    }));
  };

  const expandAllFolders = () => {
    setCollapsedDates({});
  };

  const collapseAllFolders = () => {
    const next: Record<string, boolean> = {};
    dailyFolders.forEach((f) => {
      next[f.date] = true;
    });
    setCollapsedDates(next);
  };

  // Export Table to CSV / Excel (supports all filtered or a single folder date)
  const handleExportCSV = (targetList: DOEReport[], fileSuffix?: string) => {
    if (targetList.length === 0) return;

    const headers = [
      'ลำดับ',
      'โฟลเดอร์วันที่รายงาน',
      'ชื่อสำนักงานจัดหางาน',
      'ศูนย์บริการ',
      'ภูมิภาค',
      'ผู้รายงาน',
      'รายละเอียดที่บันทึกเข้ามา (หมายเหตุ)',
    ];

    const rows = targetList.map((r, index) => [
      index + 1,
      r.reportDate || '',
      `"${(r.officeName || '').replace(/"/g, '""')}"`,
      `"${(r.centerName || '').replace(/"/g, '""')}"`,
      `"${r.region || ''}"`,
      `"${(r.reporterName || '').replace(/"/g, '""')}"`,
      `"${(r.notes || '-').replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `โฟลเดอร์หมายเหตุ_${fileSuffix || new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copy notes summary to clipboard (supports all filtered or a single folder)
  const handleCopySummary = async (targetList: DOEReport[], folderDate?: string) => {
    if (targetList.length === 0) return;

    const notesOnly = targetList.filter((r) => Boolean(r.notes && r.notes.trim().length > 0));
    const listToCopy = notesOnly.length > 0 ? notesOnly : targetList;

    const dateTitle = folderDate
      ? formatThaiDateFull(folderDate)
      : selectedDate === 'ทั้งหมด'
      ? `ภาพรวม ${dailyFolders.length} โฟลเดอร์รายวัน`
      : formatThaiDateFull(selectedDate);

    const textLines = [
      `📁 สรุปหมายเหตุและบันทึกเพิ่มเติมประจำวัน (${dateTitle})`,
      `จำนวนรายงานทั้งหมด: ${targetList.length} แห่ง | มีข้อสังเกตเพิ่มเติม: ${notesOnly.length} แห่ง`,
      '═════════════════════════════════════',
      ...listToCopy.map((r, i) => {
        return `${i + 1}. ${r.officeName} [${formatThaiDateShort(r.reportDate)}]\n   ข้อสังเกต: ${r.notes || '- ไม่ได้ระบุหมายเหตุเพิ่มเติม -'}\n   ผู้บันทึก: ${r.reporterName || '-'} (${r.reporterPosition || 'เจ้าหน้าที่'})`;
      }),
      '═════════════════════════════════════',
      'กรมการจัดหางาน กระทรวงแรงงาน',
    ];

    const fullText = textLines.join('\n\n');

    try {
      await navigator.clipboard.writeText(fullText);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = fullText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }

    if (folderDate) {
      setCopiedFolderDate(folderDate);
      setTimeout(() => setCopiedFolderDate(null), 2500);
    } else {
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2500);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* 1. TOP HEADER BANNER */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-700 text-white p-5 rounded-2xl border border-blue-400/30 shadow-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-bold shadow-md shrink-0">
            <ClipboardList className="w-6 h-6 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-sm bg-amber-400 text-slate-950 font-mono tracking-wider">
                DAILY FOLDERS & REMARKS
              </span>
              <span className="text-xs text-sky-100 font-medium">
                จัดเก็บแยกเป็นโฟลเดอร์รายวันอัตโนมัติ
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black tracking-tight text-white mt-0.5 font-['Prompt']">
              หมายเหตุ / บันทึกเพิ่มเติมประจำวัน (ระบบโฟลเดอร์รายวัน)
            </h2>
          </div>
        </div>

        {/* Live Counters */}
        <div className="flex items-center gap-2.5 text-xs flex-wrap">
          <div className="bg-white/15 px-3.5 py-1.5 rounded-xl border border-white/20 flex items-center gap-2">
            <Folder className="w-3.5 h-3.5 text-amber-300" />
            <span className="text-sky-200">โฟลเดอร์รายวัน:</span>
            <b className="text-white text-sm font-['Prompt']">{allFolderStats.length}</b>
            <span className="text-[11px] text-sky-200">วัน</span>
          </div>

          <div className="bg-white/15 px-3.5 py-1.5 rounded-xl border border-white/20 flex items-center gap-2">
            <span className="text-sky-200">รายงานทั้งหมด:</span>
            <b className="text-white text-sm font-['Prompt']">{reports.length}</b>
            <span className="text-[11px] text-sky-200">ฉบับ</span>
          </div>

          <div className="bg-amber-400/25 px-3.5 py-1.5 rounded-xl border border-amber-300/40 flex items-center gap-2 text-white">
            <MessageSquare className="w-3.5 h-3.5 text-amber-300" />
            <span>มีบันทึกหมายเหตุ:</span>
            <b className="text-amber-200 text-sm font-['Prompt']">{reportsWithNotesCount}</b>
            <span className="text-[11px] text-amber-200">แห่ง</span>
          </div>
        </div>
      </div>

      {/* 2. DAILY FOLDERS SHELF (คลังโฟลเดอร์รายวัน) */}
      {allFolderStats.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4.5 h-4.5 text-amber-500" />
              <span className="text-xs sm:text-sm font-extrabold text-slate-900 font-['Prompt']">
                คลังโฟลเดอร์บันทึกประจำวัน ({allFolderStats.length} โฟลเดอร์)
              </span>
              <span className="text-[11px] text-slate-500">
                คลิกเลือกโฟลเดอร์วันที่ต้องการเปิดดู หรือดูรวมทุกโฟลเดอร์ด้านล่าง
              </span>
            </div>

            {selectedDate !== 'ทั้งหมด' && (
              <button
                type="button"
                onClick={() => setSelectedDate('ทั้งหมด')}
                className="text-xs font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-lg border border-blue-200 transition-colors cursor-pointer"
              >
                แสดงครบทุกโฟลเดอร์ ({allFolderStats.length} วัน)
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto pb-1.5">
            {/* All Folders Card */}
            <button
              type="button"
              onClick={() => setSelectedDate('ทั้งหมด')}
              className={`shrink-0 px-3.5 py-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                selectedDate === 'ทั้งหมด'
                  ? 'bg-gradient-to-r from-blue-900 to-indigo-900 text-white border-blue-900 shadow-xs'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  selectedDate === 'ทั้งหมด'
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                <FolderOpen className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-extrabold font-['Prompt'] leading-tight">
                  ทุกโฟลเดอร์รายวัน
                </div>
                <div
                  className={`text-[11px] mt-0.5 ${
                    selectedDate === 'ทั้งหมด' ? 'text-sky-200' : 'text-slate-500'
                  }`}
                >
                  รวม {reports.length} ฉบับ • มีหมายเหตุ {reportsWithNotesCount}
                </div>
              </div>
            </button>

            {/* Individual Daily Folder Cards */}
            {allFolderStats.map((folder) => {
              const isSelected = selectedDate === folder.date;
              return (
                <button
                  key={folder.date}
                  type="button"
                  onClick={() => {
                    setSelectedDate(isSelected ? 'ทั้งหมด' : folder.date);
                    setCollapsedDates((prev) => ({ ...prev, [folder.date]: false }));
                  }}
                  className={`shrink-0 px-3.5 py-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                    isSelected
                      ? 'bg-gradient-to-r from-sky-700 to-blue-800 text-white border-blue-800 shadow-xs ring-2 ring-sky-300/60'
                      : 'bg-amber-50/50 hover:bg-amber-50 text-slate-800 border-amber-200/80'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-amber-100 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {isSelected ? (
                      <FolderOpen className="w-5 h-5" />
                    ) : (
                      <Folder className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-extrabold font-['Prompt'] leading-tight flex items-center gap-1.5">
                      <span>{folder.thaiDateShort}</span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-white text-slate-600 border border-slate-200'
                        }`}
                      >
                        {folder.total} ฉบับ
                      </span>
                    </div>
                    <div
                      className={`text-[11px] mt-0.5 flex items-center gap-1 ${
                        isSelected
                          ? 'text-amber-200'
                          : folder.withNotes > 0
                          ? 'text-amber-800 font-semibold'
                          : 'text-slate-400'
                      }`}
                    >
                      <MessageSquare className="w-3 h-3 shrink-0" />
                      <span>
                        {folder.withNotes > 0
                          ? `มีหมายเหตุ ${folder.withNotes} แห่ง`
                          : 'ไม่มีหมายเหตุเพิ่มเติม'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. FILTER & ACTION BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              id={searchInputId}
              type="text"
              placeholder="ค้นหาข้อความหมายเหตุ, ชื่อสำนักงาน, ผู้รายงาน..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs sm:text-sm pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-medium"
            />
          </div>

          {/* Region filter */}
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            aria-label="เลือกภูมิภาค"
            className="text-xs sm:text-sm px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-semibold text-slate-700 cursor-pointer"
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

          {/* Date Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs sm:text-sm">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="text-slate-500 text-xs font-medium">โฟลเดอร์วันที่:</span>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-hidden cursor-pointer text-xs sm:text-sm"
            >
              <option value="ทั้งหมด">ทุกโฟลเดอร์รายวัน ({availableDates.length} วัน)</option>
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  📁 {formatThaiDateShort(d)} ({d})
                </option>
              ))}
            </select>
          </div>

          {/* Toggle: Only with notes */}
          <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 cursor-pointer select-none transition-colors text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={onlyWithNotes}
              onChange={(e) => setOnlyWithNotes(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
            />
            <span>แสดงเฉพาะที่มีข้อความบันทึก</span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {dailyFolders.length > 1 && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={expandAllFolders}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg hover:bg-white text-slate-700 transition-colors cursor-pointer flex items-center gap-1"
                title="กางออกดูรายละเอียดทุกโฟลเดอร์"
              >
                <ChevronsUpDown className="w-3.5 h-3.5 text-blue-600" />
                <span>กางออกทั้งหมด</span>
              </button>
              <button
                type="button"
                onClick={collapseAllFolders}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg hover:bg-white text-slate-700 transition-colors cursor-pointer"
                title="พับเก็บเหลือเฉพาะหัวโฟลเดอร์รายวัน"
              >
                พับเก็บทั้งหมด
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => handleCopySummary(filteredReports)}
            className="text-xs font-bold px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            title="คัดลอกสรุปข้อสังเกตเพื่อส่งกลุ่ม LINE หรือรายงานผู้บริหาร"
          >
            {copiedSummary ? (
              <>
                <Check className="w-4 h-4 text-slate-950" />
                <span>คัดลอกสรุปแล้ว!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>คัดลอกสรุปข้อสังเกต</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleExportCSV(filteredReports)}
            className="text-xs font-bold px-3.5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            title="ส่งออกตารางเป็นไฟล์ CSV (Excel)"
          >
            <Download className="w-4 h-4" />
            <span>ส่งออก Excel / CSV</span>
          </button>
        </div>
      </div>

      {/* 4. DAILY FOLDERS LIST (แสดงแยกตามโฟลเดอร์รายวัน) */}
      {dailyFolders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs py-16 text-center text-slate-400">
          <div className="flex flex-col items-center justify-center gap-2">
            <AlertCircle className="w-10 h-10 text-slate-300" />
            <p className="font-bold text-slate-700 text-sm">
              ไม่พบโฟลเดอร์บันทึกหมายเหตุตามเงื่อนไขที่เลือก
            </p>
            <p className="text-xs text-slate-400">
              ลองเปลี่ยนคำค้นหา หรือปลดการกรอง "แสดงเฉพาะที่มีข้อความบันทึก"
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {dailyFolders.map((folder) => {
            const isCollapsed = Boolean(collapsedDates[folder.date]);
            const isThisFolderCopied = copiedFolderDate === folder.date;

            return (
              <div
                key={folder.date}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden transition-all"
              >
                {/* Folder Header Bar */}
                <div className="p-4 bg-gradient-to-r from-amber-50/90 via-slate-50 to-sky-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => toggleFolder(folder.date)}
                    className="flex items-center gap-3 text-left cursor-pointer group flex-1 min-w-[240px]"
                  >
                    <div className="w-10 h-10 rounded-xl bg-amber-400/90 group-hover:bg-amber-400 text-slate-950 flex items-center justify-center shadow-2xs shrink-0 transition-colors">
                      {isCollapsed ? (
                        <Folder className="w-5 h-5" />
                      ) : (
                        <FolderOpen className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-blue-900 text-white font-mono">
                          โฟลเดอร์ประจำวัน
                        </span>
                        <h3 className="font-black text-slate-900 text-sm sm:text-base font-['Prompt'] group-hover:text-blue-800 transition-colors">
                          {folder.thaiDateFull}
                        </h3>
                        <span className="text-xs font-mono text-slate-500">
                          ({folder.date})
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5 mt-1 text-xs text-slate-600 flex-wrap">
                        <span className="font-semibold text-blue-800">
                          รายงานในโฟลเดอร์นี้: {folder.items.length} แห่ง
                        </span>
                        <span>•</span>
                        <span
                          className={`font-semibold flex items-center gap-1 ${
                            folder.notesCount > 0 ? 'text-amber-800' : 'text-slate-400'
                          }`}
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
                          <span>มีบันทึกหมายเหตุ {folder.notesCount} แห่ง</span>
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* Per-Folder Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleCopySummary(folder.items, folder.date)}
                      className="text-xs font-bold px-3 py-1.5 rounded-xl bg-white hover:bg-amber-50 text-slate-800 border border-amber-300 shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
                      title={`คัดลอกสรุปหมายเหตุเฉพาะโฟลเดอร์วันที่ ${folder.thaiDateShort}`}
                    >
                      {isThisFolderCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">คัดลอกโฟลเดอร์นี้แล้ว!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-amber-600" />
                          <span>คัดลอกเฉพาะวันนี้</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExportCSV(folder.items, folder.date)}
                      className="text-xs font-bold px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
                      title={`ส่งออกไฟล์ CSV เฉพาะโฟลเดอร์วันที่ ${folder.thaiDateShort}`}
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-600" />
                      <span>CSV วันนี้</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleFolder(folder.date)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
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

                {/* Folder Contents Table */}
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead className="bg-slate-100/80 text-slate-800 font-extrabold border-b border-slate-200 uppercase tracking-wider text-xs font-['Prompt']">
                        <tr>
                          <th className="py-3 px-4 text-center w-16 whitespace-nowrap">
                            ลำดับ
                          </th>
                          <th className="py-3 px-4 w-40 whitespace-nowrap">
                            วันที่
                          </th>
                          <th className="py-3 px-4 w-80 whitespace-nowrap">
                            ชื่อสำนักงานจัดหางาน
                          </th>
                          <th className="py-3 px-4">
                            รายละเอียดที่บันทึกเข้ามาในโฟลเดอร์
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {folder.items.map((report, idx) => {
                          const hasNoteText = Boolean(
                            report.notes && report.notes.trim().length > 0
                          );

                          return (
                            <tr
                              key={report.id}
                              className={`hover:bg-blue-50/40 transition-colors ${
                                hasNoteText ? 'bg-white' : 'bg-slate-50/30'
                              }`}
                            >
                              {/* คอลัมน์ที่ 1: ลำดับในโฟลเดอร์ */}
                              <td className="py-3.5 px-4 text-center font-bold text-slate-600 whitespace-nowrap font-mono text-xs">
                                {idx + 1}
                              </td>

                              {/* คอลัมน์ที่ 2: วันที่ */}
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <div className="font-bold text-slate-900 text-xs sm:text-sm font-['Prompt']">
                                  {formatThaiDateShort(report.reportDate)}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                                  {report.reportDate}
                                </div>
                              </td>

                              {/* คอลัมน์ที่ 3: ชื่อสำนักงานจัดหางาน */}
                              <td className="py-3.5 px-4">
                                <div className="font-bold text-slate-900 text-xs sm:text-sm font-['Prompt']">
                                  {report.officeName}
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
                                    {report.region}
                                  </span>
                                  <span className="text-[11px] text-slate-500 truncate max-w-[240px]">
                                    {report.centerName}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
                                  <span>👤 {report.reporterName || '-'}</span>
                                  {report.reporterPosition && (
                                    <span className="text-slate-400">
                                      ({report.reporterPosition})
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* คอลัมน์ที่ 4: รายละเอียดที่บันทึกเข้ามา */}
                              <td className="py-3.5 px-4">
                                {hasNoteText ? (
                                  <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-slate-800 text-xs sm:text-sm leading-relaxed shadow-2xs font-medium">
                                    <div className="flex items-start gap-2">
                                      <MessageSquare className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                      <div className="space-y-1">
                                        <span className="text-slate-900 font-semibold break-words whitespace-pre-wrap">
                                          {report.notes}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-xs text-slate-400 italic flex items-center gap-1.5 py-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                    <span>- ไม่ได้ระบุหมายเหตุเพิ่มเติม -</span>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Admin Authentication Modal */}
      <AdminPinModal
        isOpen={adminModalOpen}
        adminPin={adminPin}
        actionTitle={adminActionTitle}
        description="การใช้งานเมนูคัดลอกสรุปข้อสังเกต และการส่งออกข้อมูล Excel ต้องใช้สิทธิ์ผู้ดูแลระบบ (Admin)"
        onClose={() => {
          setAdminModalOpen(false);
          setPendingAdminAction(null);
        }}
        onSuccess={() => {
          onAdminAuthenticated?.();
          if (pendingAdminAction) {
            pendingAdminAction();
            setPendingAdminAction(null);
          }
        }}
      />
    </div>
  );
};
