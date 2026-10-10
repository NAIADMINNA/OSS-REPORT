import React from 'react';
import { DOELogo } from './DOELogo';
import { LayoutDashboard, FileEdit, FolderClock, ShieldCheck } from 'lucide-react';

export type ActiveTab = 'dashboard' | 'form' | 'history' | 'admin';

interface DOEHeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  reportCount: number;
  onPreviewCurrentPoster?: () => void;
  customLogoUrl?: string | null;
  systemTitle?: string;
}

export const DOEHeader: React.FC<DOEHeaderProps> = ({
  activeTab,
  onTabChange,
  reportCount,
  onPreviewCurrentPoster,
  customLogoUrl,
  systemTitle,
}) => {
  return (
    <header className="bg-gradient-to-r from-[#0A162B] via-[#0F2856] to-[#0D1C38] text-white shadow-md sticky top-0 z-30 border-b border-sky-900/40">
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
                <span className="text-xs font-black tracking-wider uppercase bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 px-2.5 py-0.5 rounded-md shadow-2xs">
                  DOE Report System
                </span>
                <span className="text-sm text-sky-200/90 font-medium hidden sm:inline">
                  กรมการจัดหางาน กระทรวงแรงงาน
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-white leading-tight mt-0.5 font-['Prompt']">
                {systemTitle || 'ระบบรายงานผลการปฏิบัติงานศูนย์บริการคนต่างด้าว'}
              </h1>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1.5 bg-slate-950/50 p-1.5 rounded-2xl border border-white/10 shadow-inner text-sm">
            <button
              onClick={() => onTabChange('dashboard')}
              className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-sky-500 text-white shadow-xs ring-1 ring-sky-300/40 text-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/10 text-sm'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>แดชบอร์ดสรุปผล</span>
            </button>

            <button
              onClick={() => onTabChange('form')}
              className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'form'
                  ? 'bg-sky-500 text-white shadow-xs ring-1 ring-sky-300/40 text-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/10 text-sm'
              }`}
            >
              <FileEdit className="w-4 h-4" />
              <span>แบบฟอร์มรายงาน</span>
            </button>

            <button
              onClick={() => onTabChange('history')}
              className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-sky-500 text-white shadow-xs ring-1 ring-sky-300/40 text-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/10 text-sm'
              }`}
            >
              <FolderClock className="w-4 h-4" />
              <span>ประวัติรายงาน</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-bold ${
                activeTab === 'history' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'
              }`}>
                {reportCount}
              </span>
            </button>

            <button
              onClick={() => onTabChange('admin')}
              className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'admin'
                  ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-xs ring-1 ring-amber-300/50 text-sm'
                  : 'text-amber-300 hover:text-white hover:bg-white/10 text-sm'
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
