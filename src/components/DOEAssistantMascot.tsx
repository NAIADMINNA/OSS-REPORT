import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  Send,
  X,
  Minimize2,
  CheckCircle2,
  Clock,
  Building2,
  Phone,
  FileText,
  HelpCircle,
  Trash2,
  ArrowLeftRight,
} from 'lucide-react';
import { EmploymentOffice, SystemIssueReport } from '../types/doe';
import { EMPLOYMENT_OFFICES } from '../data/offices';
import { groupAndSortOfficesByRegion } from '../utils/officeUtils';
import {
  reportSystemIssueOnline,
  subscribeSystemIssues,
  deleteSystemIssueOnline,
  clearAllSystemIssuesOnline,
} from '../services/firestoreService';

interface DOEAssistantMascotProps {
  offices?: EmploymentOffice[];
  currentOfficeName?: string;
  isFirestoreOnline?: boolean;
  onNavigateTab?: (tab: 'dashboard' | 'form' | 'history' | 'notes' | 'admin') => void;
}

const STORAGE_KEY_ISSUES = 'doe_assistant_reported_issues_v1';
const STORAGE_KEY_POSITION = 'doe_assistant_mascot_position_v1';

export const DOEAssistantMascot: React.FC<DOEAssistantMascotProps> = ({
  offices = [],
  currentOfficeName = 'สำนักงานจัดหางาน',
  isFirestoreOnline = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showGreetingBubble, setShowGreetingBubble] = useState(true);

  // Position state: 'left' or 'right'
  const [position, setPosition] = useState<'left' | 'right'>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_POSITION);
      if (saved === 'left' || saved === 'right') return saved;
    } catch {
      // ignore
    }
    return 'left';
  });

  const togglePosition = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPosition((prev) => {
      const next = prev === 'left' ? 'right' : 'left';
      try {
        localStorage.setItem(STORAGE_KEY_POSITION, next);
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Issue Reporting Form State (ตัดประเภทข้อขัดข้องออก ตามความต้องการของผู้ใช้)
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [issueOffice, setIssueOffice] = useState(currentOfficeName);
  const [issueContact, setIssueContact] = useState('');
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);
  const [issueSubmittedSuccess, setIssueSubmittedSuccess] = useState<SystemIssueReport | null>(null);

  // Stored issues
  const [myIssues, setMyIssues] = useState<SystemIssueReport[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ISSUES);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });

  // Office search & region filter
  const [officeSearchTerm, setOfficeSearchTerm] = useState('');
  const [selectedMascotRegion, setSelectedMascotRegion] = useState<string>('ทั้งหมด');

  // Group and sort offices by standard region
  const groupedOffices = useMemo(() => {
    const list = offices && offices.length > 0 ? offices : EMPLOYMENT_OFFICES;
    const filtered = list.filter((o) => {
      const matchRegion =
        selectedMascotRegion === 'ทั้งหมด' || o.region === selectedMascotRegion;
      const q = officeSearchTerm.toLowerCase().trim();
      const matchSearch =
        !q ||
        o.name.toLowerCase().includes(q) ||
        (o.centerName && o.centerName.toLowerCase().includes(q)) ||
        o.region.toLowerCase().includes(q);
      return matchRegion && matchSearch;
    });
    return groupAndSortOfficesByRegion(filtered);
  }, [offices, officeSearchTerm, selectedMascotRegion]);

  // Keep office in sync if currentOfficeName changes
  useEffect(() => {
    if (currentOfficeName) {
      setIssueOffice(currentOfficeName);
    }
  }, [currentOfficeName]);

  // Subscribe to issues from Firestore if online
  useEffect(() => {
    if (isFirestoreOnline) {
      const unsub = subscribeSystemIssues((onlineIssues) => {
        const issues = onlineIssues || [];
        setMyIssues(issues);
        try {
          localStorage.setItem(STORAGE_KEY_ISSUES, JSON.stringify(issues));
        } catch {
          // ignore
        }
      });
      return () => unsub();
    }
  }, [isFirestoreOnline]);

  const handleDeleteSingleIssue = async (issueId: string) => {
    try {
      await deleteSystemIssueOnline(issueId);
      setMyIssues((prev) => {
        const next = prev.filter((i) => i.id !== issueId);
        try {
          localStorage.setItem(STORAGE_KEY_ISSUES, JSON.stringify(next));
        } catch {}
        return next;
      });
    } catch (err) {
      console.warn('Error deleting issue:', err);
    }
  };

  const handleClearAllIssues = async () => {
    try {
      await clearAllSystemIssuesOnline();
      setMyIssues([]);
      try {
        localStorage.removeItem(STORAGE_KEY_ISSUES);
      } catch {}
    } catch (err) {
      console.warn('Error clearing issues:', err);
    }
  };

  // Persist issues locally
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ISSUES, JSON.stringify(myIssues));
    } catch {
      // ignore
    }
  }, [myIssues]);

  // Auto-hide greeting bubble after 12 seconds or keep until clicked
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowGreetingBubble(false);
    }, 12000);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmitIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueTitle.trim() || !issueDescription.trim()) return;

    setIsSubmittingIssue(true);

    const newIssue: SystemIssueReport = {
      id: `issue-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      issueType: 'other',
      title: issueTitle.trim(),
      description: issueDescription.trim(),
      officeName: issueOffice || currentOfficeName,
      reporterContact: issueContact.trim() || 'ไม่ได้ระบุ',
      status: 'pending',
      createdAt: new Date().toISOString(),
      clientInfo: `${navigator.userAgent.slice(0, 50)} | Online: ${navigator.onLine}`,
    };

    // Save to Firestore and local state
    await reportSystemIssueOnline(newIssue);

    setMyIssues((prev) => [newIssue, ...prev]);
    setIsSubmittingIssue(false);
    setIssueSubmittedSuccess(newIssue);

    // Reset form fields
    setIssueTitle('');
    setIssueDescription('');
    setIssueContact('');
  };

  const pendingCount = myIssues.filter((i) => i.status === 'pending').length;

  return (
    <>
      {/* ================= MASCOT FLOATING AVATAR ================= */}
      <div
        className={`fixed bottom-5 z-40 flex flex-col select-none transition-all duration-300 ${
          position === 'left' ? 'left-4 sm:left-5 items-start' : 'right-4 sm:right-5 items-end'
        }`}
      >
        {/* Floating Greeting Bubble (when panel is closed) */}
        {!isOpen && showGreetingBubble && (
          <div className="mb-2.5 max-w-[270px] bg-white text-slate-800 p-3.5 rounded-2xl shadow-2xl border-2 border-amber-300 ring-4 ring-amber-400/25 animate-in fade-in slide-in-from-bottom-2 duration-300 relative">
            <button
              onClick={() => setShowGreetingBubble(false)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-full flex items-center justify-center text-[10px] cursor-pointer shadow-xs border border-amber-300"
              title="ปิดข้อความ"
            >
              <X className="w-3 h-3" />
            </button>
            <div className="flex items-start gap-2.5">
              <span className="text-2xl shrink-0 p-1 bg-amber-100 rounded-xl border border-amber-200">🤖</span>
              <div>
                <p className="text-xs font-black text-amber-950 leading-tight flex items-center gap-1.5 font-['Prompt']">
                  <span>สวัสดีครับ! ผม NAIJEABKUB</span>
                  <span className="text-[9px] bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded-md font-bold">Online</span>
                </p>
                <p className="text-[11px] text-slate-700 leading-snug mt-1 font-medium">
                  หุ่นยนต์รับแจ้งปัญหาและข้อขัดข้องการใช้งานระบบ คลิกแจ้งเรื่องได้ตลอดเวลาครับ!
                </p>
              </div>
            </div>
            {/* Small speech triangle pointer */}
            <div
              className={`absolute -bottom-2 w-3.5 h-3.5 bg-white border-r-2 border-b-2 border-amber-300 rotate-45 ${
                position === 'left' ? 'left-7' : 'right-7'
              }`}
            />
          </div>
        )}

        {/* Mascot Avatar Button - Bright, High-Visibility, Eye-Catching Gold & Amber */}
        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
            setShowGreetingBubble(false);
          }}
          aria-label="เปิดหน้าต่างหุ่นยนต์ NAIJEABKUB แจ้งข้อขัดข้อง"
          className="group relative flex items-center gap-2.5 p-2 pr-4 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 rounded-full shadow-2xl shadow-amber-500/40 hover:shadow-amber-400/60 border-2 border-white ring-4 ring-amber-400/70 transition-all transform hover:-translate-y-1 active:scale-95 cursor-pointer"
        >
          {/* Animated Robot Mascot Avatar Badge */}
          <div className="relative w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-md overflow-hidden border-2 border-amber-400 shrink-0">
            {/* Robot Illustration SVG with bright cyber colors */}
            <svg
              viewBox="0 0 64 64"
              className="w-11 h-11 transition-transform group-hover:scale-110"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Background Aura */}
              <circle cx="32" cy="32" r="30" fill="#FEF3C7" />

              {/* Robot Body & Shoulders */}
              <path
                d="M16 58C16 48 22 46 32 46C42 46 48 48 48 58"
                fill="#2563EB"
              />
              <path
                d="M23 48L32 54L41 48"
                stroke="#F59E0B"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              {/* Chest Core Badge */}
              <circle cx="32" cy="52" r="2.5" fill="#38BDF8" />
              <circle cx="32" cy="52" r="1.2" fill="#FFFFFF" />

              {/* Robot Neck */}
              <rect x="28" y="42" width="8" height="5" rx="1.5" fill="#94A3B8" />

              {/* Robot Ears / Side Sensors */}
              <rect x="12" y="27" width="5" height="10" rx="2" fill="#0284C7" />
              <rect x="47" y="27" width="5" height="10" rx="2" fill="#0284C7" />
              <circle cx="14.5" cy="32" r="1.5" fill="#F59E0B" />
              <circle cx="49.5" cy="32" r="1.5" fill="#F59E0B" />

              {/* Antenna Stick & Glowing Golden Ball */}
              <line x1="32" y1="18" x2="32" y2="10" stroke="#0284C7" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="32" cy="9" r="4" fill="#F59E0B" />
              <circle cx="32" cy="9" r="2" fill="#FEF08A" />
              <path d="M27 5C30 3 34 3 37 5" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />

              {/* Robot Head Helmet */}
              <rect x="16" y="18" width="32" height="25" rx="8" fill="#FFFFFF" stroke="#0284C7" strokeWidth="2" />

              {/* Face Screen Visor */}
              <rect x="19" y="22" width="26" height="17" rx="5" fill="#0F172A" />

              {/* Glowing Robot Eyes (Electric Cyan) */}
              <circle cx="26" cy="29" r="3.2" fill="#38BDF8" />
              <circle cx="38" cy="29" r="3.2" fill="#38BDF8" />
              <circle cx="25" cy="28" r="1.2" fill="#FFFFFF" />
              <circle cx="37" cy="28" r="1.2" fill="#FFFFFF" />

              {/* Robot Cute Smile */}
              <path
                d="M27 34C29 36.5 35 36.5 37 34"
                stroke="#34D399"
                strokeWidth="2"
                strokeLinecap="round"
              />

              {/* Cheeks Glowing Pixels */}
              <circle cx="21.5" cy="32" r="1.2" fill="#F472B6" />
              <circle cx="42.5" cy="32" r="1.2" fill="#F472B6" />
            </svg>

            {/* Online Live Indicator */}
            <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full animate-pulse" />
          </div>

          {/* Label & Indicator - High Contrast on Bright Amber */}
          <div className="text-left pr-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs sm:text-sm font-black tracking-wide text-slate-950 drop-shadow-2xs font-['Prompt']">
                NAIJEABKUB
              </span>
              <span className="text-[10px] bg-slate-900 text-amber-300 font-black px-2 py-0.5 rounded-full shadow-xs">
                แจ้งปัญหา
              </span>
            </div>
            <p className="text-[11px] text-slate-900 font-bold leading-none mt-1 flex items-center gap-1">
              <span>แจ้งข้อขัดข้องระบบ</span>
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
            </p>
          </div>

          {/* Issue badge counter if any pending */}
          {pendingCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-rose-600 text-white text-[11px] font-black flex items-center justify-center shadow-md ring-2 ring-white animate-bounce">
              {pendingCount}
            </span>
          )}
        </button>

        {/* Quick Position Switcher Pill (ย้ายหุ่นยนต์ซ้าย/ขวา) */}
        <button
          type="button"
          onClick={togglePosition}
          title={position === 'left' ? 'ย้ายหุ่นยนต์ไปไว้ฝั่งขวาของหน้าจอ' : 'ย้ายหุ่นยนต์ไปไว้ฝั่งซ้ายของหน้าจอ'}
          className="mt-1 px-2.5 py-0.5 rounded-full bg-slate-900/90 hover:bg-slate-950 text-amber-300 border border-amber-400/60 shadow-md text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-xs hover:scale-105 active:scale-95"
        >
          <ArrowLeftRight className="w-3 h-3 text-amber-300" />
          <span>{position === 'left' ? 'ย้ายไปขวา ➔' : '⬅ ย้ายไปซ้าย'}</span>
        </button>
      </div>

      {/* ================= ISSUE REPORTING WINDOW PANEL ================= */}
      {isOpen && (
        <div
          className={`fixed bottom-20 z-50 w-[94vw] sm:w-[420px] max-w-[450px] h-[580px] max-h-[85vh] bg-white rounded-3xl shadow-2xl border border-slate-200 ring-1 ring-slate-950/10 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 font-sans transition-all ${
            position === 'left' ? 'left-3 sm:left-5' : 'right-3 sm:right-5'
          }`}
        >
          {/* 1. Panel Header - Bright, Friendly Theme */}
          <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 text-slate-950 p-3 px-3.5 sm:p-3.5 sm:px-4 flex items-center justify-between border-b border-amber-300 shrink-0 shadow-md">
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white flex items-center justify-center shadow-md border-2 border-amber-500 shrink-0">
                <span className="text-lg sm:text-xl">🤖</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1 sm:gap-1.5">
                  <h3 className="font-black text-xs sm:text-base text-slate-950 tracking-tight font-['Prompt'] truncate">
                    NAIJEABKUB (แจ้งข้อขัดข้อง)
                  </h3>
                  <span className="text-[9px] sm:text-[10px] bg-slate-950 text-amber-300 font-black px-1.5 sm:px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    Helpdesk
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-800 font-semibold leading-none mt-0.5 truncate">
                  หุ่นยนต์ผู้ช่วยรับแจ้งปัญหาและข้อขัดข้องระบบ
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-1">
              {/* Position Switcher in Header */}
              <button
                type="button"
                onClick={togglePosition}
                className="px-2 py-1.5 rounded-xl bg-slate-900/15 hover:bg-slate-900/25 text-slate-950 flex items-center gap-1 transition-colors cursor-pointer text-[11px] font-bold shadow-2xs"
                title={position === 'left' ? 'ย้ายหน้าต่างไปฝั่งขวา' : 'ย้ายหน้าต่างไปฝั่งซ้าย'}
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-slate-950" />
                <span>{position === 'left' ? 'ย้ายไปขวา' : 'ย้ายไปซ้าย'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-900/10 hover:bg-slate-900/20 text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
                title="ย่อหน้าต่าง"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-900/10 hover:bg-rose-600 hover:text-white text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
                title="ปิดหน้าต่าง"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>


          {/* 2. Main Content: Issue Form & Past Tickets */}
          <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50 overflow-y-auto p-4 space-y-4">
            {/* Success Notification Alert */}
            {issueSubmittedSuccess && (
              <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-3.5 shadow-xs text-xs text-emerald-900 flex items-start justify-between gap-2 animate-in fade-in duration-200">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sm text-emerald-950">
                      ส่งเรื่องแจ้งข้อขัดข้องเรียบร้อย!
                    </p>
                    <p className="text-xs text-emerald-800 mt-0.5">
                      รหัส Ticket: <span className="font-mono font-bold">{issueSubmittedSuccess.id}</span>
                    </p>
                    <p className="text-[11px] text-emerald-700 mt-1">
                      ระบบได้บันทึกข้อมูลและส่งเรื่องให้ทีมผู้ดูแลแล้วครับ
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIssueSubmittedSuccess(null)}
                  className="text-emerald-700 hover:text-emerald-950 text-xs font-bold p-1 cursor-pointer"
                  title="ปิดการแจ้งเตือน"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Issue Submission Form */}
            <form onSubmit={handleSubmitIssue} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3.5">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-slate-900 font-bold text-xs sm:text-sm">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>แบบฟอร์มส่งเรื่องแจ้งข้อขัดข้อง</span>
              </div>

              {/* 1. สำนักงานที่พบปัญหา */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>สำนักงานจัดหางาน / ศูนย์บริการที่พบปัญหา (เรียงตามภูมิภาค)</span>
                  </span>
                  <span className="text-[11px] text-sky-700 font-normal">
                    {groupedOffices.reduce((acc, g) => acc + g.offices.length, 0)} แห่ง
                  </span>
                </label>

                {/* Quick search & Region filter for Mascot */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  <input
                    type="text"
                    value={officeSearchTerm}
                    onChange={(e) => setOfficeSearchTerm(e.target.value)}
                    placeholder="ค้นหาสำนักงานหรือศูนย์..."
                    className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium"
                  />
                  <select
                    value={selectedMascotRegion}
                    onChange={(e) => setSelectedMascotRegion(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium text-slate-700"
                  >
                    <option value="ทั้งหมด">🌐 ทุกภูมิภาค</option>
                    <option value="กรุงเทพมหานคร">🏛️ กรุงเทพมหานคร</option>
                    <option value="ภาคกลางและตะวันตก">🌾 ภาคกลางและตะวันตก</option>
                    <option value="ภาคตะวันออก">🌊 ภาคตะวันออก</option>
                    <option value="ภาคตะวันออกเฉียงเหนือ">☀️ ภาคตะวันออกเฉียงเหนือ</option>
                    <option value="ภาคเหนือ">⛰️ ภาคเหนือ</option>
                    <option value="ภาคใต้">🏝️ ภาคใต้</option>
                    <option value="เฉพาะกิจ">🚚 เฉพาะกิจ</option>
                  </select>
                </div>

                <select
                  value={issueOffice}
                  onChange={(e) => setIssueOffice(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium text-slate-900"
                >
                  <option value={currentOfficeName}>📍 {currentOfficeName} (สำนักงานปัจจุบัน)</option>
                  {groupedOffices.map((group) => (
                    <optgroup key={group.region} label={group.regionLabel}>
                      {group.offices.map((o) => (
                        <option key={o.id} value={o.centerName ? `${o.name} (${o.centerName})` : o.name}>
                          {o.name} {o.centerName ? `• ${o.centerName}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* 2. หัวข้อปัญหา */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span>หัวข้อข้อขัดข้อง <span className="text-rose-500">*</span></span>
                </label>
                <input
                  type="text"
                  required
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  placeholder="เช่น เครื่องพิมพ์บัตรขัดข้อง, ยอดคิวไม่ตรง, เน็ตไม่ซิงก์"
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium"
                />
              </div>

              {/* 3. รายละเอียด */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                  <span>รายละเอียดข้อขัดข้องและอาการที่พบ <span className="text-rose-500">*</span></span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={issueDescription}
                  onChange={(e) => setIssueDescription(e.target.value)}
                  placeholder="ระบุอาการที่พบ เวลาที่เกิด หรือจุดที่ระบบทำงานไม่ถูกต้อง..."
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium leading-relaxed"
                />
              </div>

              {/* 4. ข้อมูลติดต่อกลับ */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>ชื่อหรือเบอร์ติดต่อผู้แจ้ง (สำหรับประสานงาน)</span>
                </label>
                <input
                  type="text"
                  value={issueContact}
                  onChange={(e) => setIssueContact(e.target.value)}
                  placeholder="เช่น คุณสมศักดิ์ 081-xxx-xxxx"
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmittingIssue || !issueTitle.trim() || !issueDescription.trim()}
                className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSubmittingIssue ? 'กำลังส่งข้อมูล...' : 'ส่งเรื่องแจ้งข้อขัดข้องทันที'}</span>
              </button>
            </form>

            {/* 3. รายการประวัติที่เคยแจ้ง */}
            {myIssues.length > 0 && (
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 pb-1.5 border-b border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>ประวัติข้อขัดข้องที่แจ้งไว้ ({myIssues.length} รายการ)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleClearAllIssues}
                      className="text-[11px] text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2 py-0.5 rounded-md font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                      title="ล้างประวัติข้อขัดข้องทั้งหมด"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>ล้างทั้งหมด</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {myIssues.map((iss) => (
                    <div
                      key={iss.id}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1 group relative"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-bold text-slate-900 truncate flex-1">
                          {iss.title}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              iss.status === 'resolved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {iss.status === 'resolved' ? 'แก้ไขแล้ว' : 'รอดำเนินการ'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteSingleIssue(iss.id)}
                            className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                            title="ลบรายการนี้"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-600 line-clamp-2">
                        {iss.description}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                        <span>{iss.officeName || 'ไม่ระบุสำนักงาน'}</span>
                        <span>{new Date(iss.createdAt).toLocaleDateString('th-TH')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
