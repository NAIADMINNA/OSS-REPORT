import React from 'react';
import { DOELogo } from './DOELogo';
import { LayoutDashboard, BarChart3, FileEdit, FolderClock, ShieldCheck, FileText } from 'lucide-react';

export type ActiveTab = 'dashboard' | 'insights' | 'form' | 'history' | 'notes' | 'admin' | 'manual';

interface DOEHeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onLogoClick?: () => void;
  reportCount: number;
  notesCount?: number;
  onPreviewCurrentPoster?: () => void;
  customLogoUrl?: string | null;
  systemTitle?: string;
  isOnlineDatabase?: boolean;
  isAdmin?: boolean;
}

export const DOEHeader: React.FC<DOEHeaderProps> = ({
  activeTab,
  onTabChange,
  onLogoClick,
  reportCount,
  notesCount,
  onPreviewCurrentPoster,
  customLogoUrl,
  systemTitle,
  isOnlineDatabase = true,
  isAdmin = false,
}) => {
  const handleBackToDashboard = () => {
    if (onLogoClick) {
      onLogoClick();
    } else {
      onTabChange('dashboard');
    }
  };

  return (
    <header className="bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-700 text-white shadow-md sticky top-0 z-30 border-b border-sky-400/30 no-print">
      <div className="w-full max-w-[1780px] 2xl:max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Emblem */}
          <div className="flex items-center gap-3.5">
            <div
              role="button"
              tabIndex={0}
              className="shrink-0 drop-shadow-md cursor-pointer hover:scale-105 active:scale-95 transition-all rounded-xl ring-2 ring-transparent hover:ring-amber-300/80 focus:outline-none focus:ring-amber-300"
              onClick={handleBackToDashboard}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleBackToDashboard();
                }
              }}
              title="คลิกเพื่อกลับไปหน้าแดชบอร์ดสรุปผล"
            >
              <DOELogo
                size={50}
                customLogoUrl={customLogoUrl}
                onClick={handleBackToDashboard}
                title="คลิกเพื่อกลับไปหน้าแดชบอร์ดสรุปผล"
              />
            </div>
            <div
              onClick={handleBackToDashboard}
              className="cursor-pointer group"
              title="คลิกเพื่อกลับไปหน้าแดชบอร์ดสรุปผล"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-black tracking-wider uppercase bg-amber-400 group-hover:bg-amber-300 text-slate-950 px-2.5 py-0.5 rounded-md shadow-xs transition-colors">
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
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-white group-hover:text-amber-200 leading-tight mt-0.5 font-['Prompt'] transition-colors">
                {systemTitle || 'ระบบรายงานผลการปฏิบัติงานศูนย์บริการคนต่างด้าว'}
              </h1>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav
            aria-label="เมนูหลักของระบบ"
            className="flex flex-wrap items-center gap-1 bg-slate-950/35 backdrop-blur-md p-1.5 rounded-2xl border border-white/20 shadow-inner text-sm"
          >
            <button
              type="button"
              aria-current={activeTab === 'dashboard' ? 'page' : undefined}
              onClick={() => onTabChange('dashboard')}
              className={`group relative px-3.5 py-2 min-h-[40px] rounded-[10px] font-bold transition-all duration-150 flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-300 ${
                activeTab === 'dashboard'
                  ? 'bg-white text-slate-950 shadow-sm after:content-[""] after:absolute after:bottom-1 after:left-3.5 after:right-3.5 after:h-[2.5px] after:rounded-full after:bg-blue-600'
                  : 'text-sky-50/90 hover:text-white hover:bg-white/12'
              }`}
            >
              <LayoutDashboard
                className={`w-4 h-4 shrink-0 transition-colors duration-150 ${
                  activeTab === 'dashboard'
                    ? 'text-blue-700'
                    : 'text-sky-200 group-hover:text-amber-300'
                }`}
              />
              <span>แดชบอร์ดสรุปผล</span>
            </button>

            <button
              type="button"
              aria-current={activeTab === 'insights' ? 'page' : undefined}
              onClick={() => onTabChange('insights')}
              className={`group relative px-3.5 py-2 min-h-[40px] rounded-[10px] font-bold transition-all duration-150 flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-300 ${
                activeTab === 'insights'
                  ? 'bg-white text-slate-950 shadow-sm after:content-[""] after:absolute after:bottom-1 after:left-3.5 after:right-3.5 after:h-[2.5px] after:rounded-full after:bg-emerald-600'
                  : 'text-sky-50/90 hover:text-white hover:bg-white/12'
              }`}
            >
              <BarChart3
                className={`w-4 h-4 shrink-0 transition-colors duration-150 ${
                  activeTab === 'insights'
                    ? 'text-emerald-700'
                    : 'text-emerald-300 group-hover:text-amber-300'
                }`}
              />
              <span>วิเคราะห์ข้อมูล</span>
            </button>

            <span
              aria-hidden="true"
              className="hidden sm:block w-px h-5 bg-white/18 mx-0.5 shrink-0"
            />

            <button
              type="button"
              aria-current={activeTab === 'form' ? 'page' : undefined}
              onClick={() => onTabChange('form')}
              className={`group relative px-3.5 py-2 min-h-[40px] rounded-[10px] font-bold transition-all duration-150 flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-300 ${
                activeTab === 'form'
                  ? 'bg-white text-slate-950 shadow-sm after:content-[""] after:absolute after:bottom-1 after:left-3.5 after:right-3.5 after:h-[2.5px] after:rounded-full after:bg-indigo-600'
                  : 'text-sky-50/90 hover:text-white hover:bg-white/12'
              }`}
            >
              <FileEdit
                className={`w-4 h-4 shrink-0 transition-colors duration-150 ${
                  activeTab === 'form'
                    ? 'text-indigo-700'
                    : 'text-sky-200 group-hover:text-amber-300'
                }`}
              />
              <span>แบบฟอร์มรายงาน</span>
            </button>

            <button
              type="button"
              aria-current={activeTab === 'history' ? 'page' : undefined}
              onClick={() => onTabChange('history')}
              className={`group relative px-3.5 py-2 min-h-[40px] rounded-[10px] font-bold transition-all duration-150 flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-300 ${
                activeTab === 'history'
                  ? 'bg-white text-slate-950 shadow-sm after:content-[""] after:absolute after:bottom-1 after:left-3.5 after:right-3.5 after:h-[2.5px] after:rounded-full after:bg-sky-600'
                  : 'text-sky-50/90 hover:text-white hover:bg-white/12'
              }`}
            >
              <FolderClock
                className={`w-4 h-4 shrink-0 transition-colors duration-150 ${
                  activeTab === 'history'
                    ? 'text-sky-700'
                    : 'text-sky-200 group-hover:text-amber-300'
                }`}
              />
              <span>ประวัติรายงาน</span>
              <span
                className={`pl-2 border-l text-xs font-mono font-extrabold tabular-nums ${
                  activeTab === 'history'
                    ? 'border-slate-300 text-blue-800'
                    : 'border-white/25 text-amber-200'
                }`}
              >
                {reportCount.toLocaleString()}
              </span>
            </button>

            <button
              type="button"
              aria-current={activeTab === 'notes' ? 'page' : undefined}
              onClick={() => onTabChange('notes')}
              className={`group relative px-3.5 py-2 min-h-[40px] rounded-[10px] font-bold transition-all duration-150 flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-300 ${
                activeTab === 'notes'
                  ? 'bg-white text-slate-950 shadow-sm after:content-[""] after:absolute after:bottom-1 after:left-3.5 after:right-3.5 after:h-[2.5px] after:rounded-full after:bg-amber-500'
                  : 'text-sky-50/90 hover:text-white hover:bg-white/12'
              }`}
            >
              <FileText
                className={`w-4 h-4 shrink-0 transition-colors duration-150 ${
                  activeTab === 'notes'
                    ? 'text-amber-700'
                    : 'text-sky-200 group-hover:text-amber-300'
                }`}
              />
              <span>หมายเหตุ / บันทึกเพิ่มเติม</span>
              {notesCount !== undefined && notesCount > 0 && (
                <span
                  className={`pl-2 border-l text-xs font-mono font-extrabold tabular-nums ${
                    activeTab === 'notes'
                      ? 'border-slate-300 text-amber-800'
                      : 'border-white/25 text-amber-300'
                  }`}
                >
                  {notesCount.toLocaleString()}
                </span>
              )}
            </button>

            <span
              aria-hidden="true"
              className="hidden sm:block w-px h-5 bg-white/18 mx-0.5 shrink-0"
            />

            <button
              type="button"
              aria-current={activeTab === 'admin' ? 'page' : undefined}
              onClick={() => onTabChange('admin')}
              className={`group relative px-3.5 py-2 min-h-[40px] rounded-[10px] font-bold transition-all duration-150 flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-300 ${
                activeTab === 'admin'
                  ? 'bg-amber-400 text-slate-950 shadow-sm font-extrabold'
                  : isAdmin
                  ? 'bg-amber-400/20 text-amber-200 hover:bg-amber-400/30 hover:text-white'
                  : 'text-amber-200/95 hover:text-amber-100 hover:bg-amber-400/15'
              }`}
            >
              <ShieldCheck
                className={`w-4 h-4 shrink-0 transition-colors duration-150 ${
                  activeTab === 'admin' ? 'text-slate-950' : 'text-amber-300'
                }`}
              />
              <span>{isAdmin ? 'สิทธิ์ Admin · เปิด' : 'สิทธิ์ Admin'}</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};
