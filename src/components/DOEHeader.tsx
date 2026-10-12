import React from 'react';
import { DOELogo } from './DOELogo';
import { LayoutDashboard, FileEdit, FolderClock, ShieldCheck, FileText } from 'lucide-react';

export type ActiveTab = 'dashboard' | 'form' | 'history' | 'notes' | 'admin';

interface DOEHeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  reportCount: number;
  notesCount?: number;
  onPreviewCurrentPoster?: () => void;
  customLogoUrl?: string | null;
  systemTitle?: string;
  isOnlineDatabase?: boolean;
}

export const DOEHeader: React.FC<DOEHeaderProps> = ({
  activeTab,
  onTabChange,
  reportCount,
  notesCount,
  onPreviewCurrentPoster,
  customLogoUrl,
  systemTitle,
  isOnlineDatabase = true,
}) => {
  return (
    <header className="bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-700 text-white shadow-md sticky top-0 z-30 border-b border-sky-400/30">
      <div className="w-full max-w-[1780px] 2xl:max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Emblem */}
          <div className="flex items-center gap-3.5">
            <div
              className="shrink-0 drop-shadow-md cursor-pointer hover:scale-105 transition-transform"
              onClick={() => onTabChange('dashboard')}
              title="ไปยังแดชบอร์ดหลัก"
            >
              <DOELogo size={50} customLogoUrl={customLogoUrl} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black tracking-wider uppercase bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-md shadow-xs">
                  DOE Report System
                </span>
                <span className="text-sm text-sky-100 font-medium hidden sm:inline">
                  กรมการจัดหางาน กระทรวงแรงงาน
                </span>
                {isOnlineDatabase && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 backdrop-blur-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    ฐานข้อมูลออนไลน์ (Cloud Firestore)
                  </span>
                )}
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-white leading-tight mt-0.5 font-['Prompt']">
                {systemTitle || 'ระบบรายงานผลการปฏิบัติงานศูนย์บริการคนต่างด้าว'}
              </h1>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1.5 bg-white/15 backdrop-blur-md p-1.5 rounded-2xl border border-white/25 shadow-xs text-sm">
            <button
              onClick={() => onTabChange('dashboard')}
              className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-white text-blue-900 shadow-sm ring-1 ring-white/80 text-sm'
                  : 'text-white/90 hover:text-white hover:bg-white/15 text-sm'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>แดชบอร์ดสรุปผล</span>
            </button>

            <button
              onClick={() => onTabChange('form')}
              className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'form'
                  ? 'bg-white text-blue-900 shadow-sm ring-1 ring-white/80 text-sm'
                  : 'text-white/90 hover:text-white hover:bg-white/15 text-sm'
              }`}
            >
              <FileEdit className="w-4 h-4" />
              <span>แบบฟอร์มรายงาน</span>
            </button>

            <button
              onClick={() => onTabChange('history')}
              className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-white text-blue-900 shadow-sm ring-1 ring-white/80 text-sm'
                  : 'text-white/90 hover:text-white hover:bg-white/15 text-sm'
              }`}
            >
              <FolderClock className="w-4 h-4" />
              <span>ประวัติรายงาน</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-bold ${
                activeTab === 'history' ? 'bg-blue-100 text-blue-900' : 'bg-white/20 text-white'
              }`}>
                {reportCount}
              </span>
            </button>

            <button
              onClick={() => onTabChange('notes')}
              className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'notes'
                  ? 'bg-white text-blue-900 shadow-sm ring-1 ring-white/80 text-sm'
                  : 'text-white/90 hover:text-white hover:bg-white/15 text-sm'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>หมายเหตุ / บันทึกเพิ่มเติม</span>
              {notesCount !== undefined && notesCount > 0 && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-mono font-bold ${
                    activeTab === 'notes'
                      ? 'bg-blue-100 text-blue-900'
                      : 'bg-amber-400 text-slate-950 shadow-2xs'
                  }`}
                >
                  {notesCount}
                </span>
              )}
            </button>

            <button
              onClick={() => onTabChange('admin')}
              className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'admin'
                  ? 'bg-amber-400 text-slate-950 shadow-sm ring-1 ring-amber-300 font-extrabold text-sm'
                  : 'text-amber-200 hover:text-white hover:bg-white/15 text-sm font-semibold'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>สิทธิ์ Admin</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};
