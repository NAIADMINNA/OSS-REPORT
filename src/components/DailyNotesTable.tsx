import React, { useState, useId, useMemo } from 'react';
import { DOEReport } from '../types/doe';
import { formatThaiDateShort, formatThaiDateFull } from '../utils/thaiDate';
import {
  FileText,
  Search,
  Calendar,
  Building2,
  Copy,
  Check,
  Download,
  Eye,
  Filter,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Sparkles,
  ClipboardList,
} from 'lucide-react';

interface DailyNotesTableProps {
  reports: DOEReport[];
}

export const DailyNotesTable: React.FC<DailyNotesTableProps> = ({
  reports,
}) => {
  const searchInputId = useId();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('ทั้งหมด');
  const [selectedDate, setSelectedDate] = useState('ทั้งหมด');
  const [onlyWithNotes, setOnlyWithNotes] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Available distinct dates from reports
  const availableDates = useMemo(() => {
    const dates = Array.from(new Set(reports.map((r) => r.reportDate))).sort(
      (a, b) => b.localeCompare(a)
    );
    return dates;
  }, [reports]);

  // Filtered reports list
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      // Search matches office name, reporter name, notes, or region
      const q = searchTerm.toLowerCase().trim();
      const matchSearch =
        !q ||
        r.officeName.toLowerCase().includes(q) ||
        r.centerName.toLowerCase().includes(q) ||
        (r.notes || '').toLowerCase().includes(q) ||
        r.reporterName.toLowerCase().includes(q) ||
        r.region.toLowerCase().includes(q);

      // Region match
      const matchRegion =
        selectedRegion === 'ทั้งหมด' || r.region === selectedRegion;

      // Date match
      const matchDate =
        selectedDate === 'ทั้งหมด' || r.reportDate === selectedDate;

      // Only with notes match
      const hasNotes = Boolean(r.notes && r.notes.trim().length > 0);
      const matchNotesFilter = onlyWithNotes ? hasNotes : true;

      return matchSearch && matchRegion && matchDate && matchNotesFilter;
    });
  }, [reports, searchTerm, selectedRegion, selectedDate, onlyWithNotes]);

  // Reports with non-empty notes
  const reportsWithNotesCount = useMemo(() => {
    return reports.filter((r) => Boolean(r.notes && r.notes.trim().length > 0)).length;
  }, [reports]);

  // Export Table to CSV / Excel
  const handleExportCSV = () => {
    if (filteredReports.length === 0) return;

    const headers = [
      'ลำดับ',
      'วันที่รายงาน',
      'ชื่อสำนักงานจัดหางาน',
      'ศูนย์บริการ',
      'ภูมิภาค',
      'ผู้รายงาน',
      'รายละเอียดที่บันทึกเข้ามา (หมายเหตุ)',
    ];

    const rows = filteredReports.map((r, index) => [
      index + 1,
      r.reportDate,
      `"${r.officeName.replace(/"/g, '""')}"`,
      `"${r.centerName.replace(/"/g, '""')}"`,
      `"${r.region}"`,
      `"${r.reporterName.replace(/"/g, '""')}"`,
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
      `รายงานหมายเหตุ_บันทึกเพิ่มเติม_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copy notes summary to clipboard
  const handleCopySummary = async () => {
    if (filteredReports.length === 0) return;

    const notesOnly = filteredReports.filter((r) => Boolean(r.notes && r.notes.trim().length > 0));

    const dateTitle = selectedDate === 'ทั้งหมด' ? 'ภาพรวมทุกวันที่' : formatThaiDateFull(selectedDate);
    const textLines = [
      `📝 สรุปหมายเหตุและบันทึกเพิ่มเติมประจำวัน (${dateTitle})`,
      `จำนวนรายการที่มีข้อสังเกต: ${notesOnly.length} แห่ง`,
      '═════════════════════════════════════',
      ...notesOnly.map((r, i) => {
        return `${i + 1}. ${r.officeName} [${formatThaiDateShort(r.reportDate)}]\n   ข้อสังเกต: ${r.notes}\n   ผู้บันทึก: ${r.reporterName} (${r.reporterPosition || 'เจ้าหน้าที่'})`;
      }),
      '═════════════════════════════════════',
      'กรมการจัดหางาน กระทรวงแรงงาน',
    ];

    const fullText = textLines.join('\n\n');

    try {
      await navigator.clipboard.writeText(fullText);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = fullText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
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
                DAILY REMARKS & NOTES
              </span>
              <span className="text-xs text-sky-100 font-medium">
                ข้อมูลบันทึกจริงจากศูนย์บริการทั่วประเทศ
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black tracking-tight text-white mt-0.5 font-['Prompt']">
              หมายเหตุ / บันทึกเพิ่มเติมประจำวัน
            </h2>
          </div>
        </div>

        {/* Live Counters */}
        <div className="flex items-center gap-2.5 text-xs flex-wrap">
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

      {/* 2. FILTER & ACTION BAR */}
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
            <option value="ภาคเหนือ">ภาคเหนือ</option>
            <option value="กรุงเทพมหานคร">กรุงเทพมหานคร</option>
            <option value="ภาคกลางและตะวันตก">ภาคกลางและตะวันตก</option>
            <option value="ภาคตะวันออก">ภาคตะวันออก</option>
            <option value="ภาคตะวันออกเฉียงเหนือ">ภาคตะวันออกเฉียงเหนือ</option>
            <option value="ภาคใต้">ภาคใต้</option>
            <option value="เฉพาะกิจ">เฉพาะกิจ</option>
          </select>

          {/* Date Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs sm:text-sm">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="text-slate-500 text-xs font-medium">วันที่:</span>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-hidden cursor-pointer text-xs sm:text-sm"
            >
              <option value="ทั้งหมด">ทุกช่วงวัน (ทั้งหมด)</option>
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {formatThaiDateShort(d)} ({d})
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopySummary}
            className="text-xs font-bold px-3.5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
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
            onClick={handleExportCSV}
            className="text-xs font-bold px-3.5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            title="ส่งออกตารางเป็นไฟล์ CSV (Excel)"
          >
            <Download className="w-4 h-4" />
            <span>ส่งออก Excel / CSV</span>
          </button>
        </div>
      </div>

      {/* 3. THE SPECIFIED 4-COLUMN TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/60">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-700" />
            <span className="font-extrabold text-slate-900 text-sm font-['Prompt']">
              ตารางบันทึกหมายเหตุประจำวัน
            </span>
            <span className="text-xs text-slate-500">
              (พบ {filteredReports.length} รายการ)
            </span>
          </div>

          <span className="text-[11px] text-slate-400">
            ดึงข้อมูลจากรายงานการปฏิบัติงานประจำศูนย์บริการ
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-100 text-slate-800 font-extrabold border-b border-slate-200 uppercase tracking-wider text-xs font-['Prompt']">
              <tr>
                <th className="py-3.5 px-4 text-center w-16 whitespace-nowrap">
                  ลำดับ
                </th>
                <th className="py-3.5 px-4 w-40 whitespace-nowrap">
                  วันที่
                </th>
                <th className="py-3.5 px-4 w-80 whitespace-nowrap">
                  ชื่อสำนักงานจัดหางาน
                </th>
                <th className="py-3.5 px-4">
                  รายละเอียดที่บันทึกเข้ามา
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-14 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="w-9 h-9 text-slate-300" />
                      <p className="font-bold text-slate-700 text-sm">
                        ไม่พบข้อมูลหมายเหตุตามเงื่อนไขที่เลือก
                      </p>
                      <p className="text-xs text-slate-400">
                        ลองเปลี่ยนคำค้นหา หรือปลดการกรอง "แสดงเฉพาะที่มีข้อความบันทึก"
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredReports.map((report, idx) => {
                  const hasNoteText = Boolean(report.notes && report.notes.trim().length > 0);

                  return (
                    <tr
                      key={report.id}
                      className={`hover:bg-blue-50/40 transition-colors ${
                        hasNoteText ? 'bg-white' : 'bg-slate-50/30'
                      }`}
                    >
                      {/* คอลัมน์ที่ 1: ลำดับ */}
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
                          <span>👤 {report.reporterName}</span>
                          {report.reporterPosition && (
                            <span className="text-slate-400">({report.reporterPosition})</span>
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
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
