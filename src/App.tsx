/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  DOEReport,
  EmploymentOffice,
  ReportCategory,
  ReporterProfile,
  SystemConfig,
} from './types/doe';
import { INITIAL_REPORTS } from './data/seedData';
import { EMPLOYMENT_OFFICES } from './data/offices';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_REPORTERS,
  DEFAULT_SYSTEM_CONFIG,
} from './data/initialAdminData';
import { DOEHeader, ActiveTab } from './components/DOEHeader';
import { ReportForm } from './components/ReportForm';
import { DashboardView } from './components/DashboardView';
import { ReportHistory } from './components/ReportHistory';
import { InfographicPoster } from './components/InfographicPoster';
import { PosterPreviewModal } from './components/PosterPreviewModal';
import { ExportLineModal } from './components/ExportLineModal';
import { AdminConsole } from './components/AdminConsole';
import { ConfirmDialogModal } from './components/ConfirmDialogModal';
import { formatThaiDateFull, getTodayIsoDate } from './utils/thaiDate';
import {
  Eye,
  CheckCircle,
  Maximize2,
  FileText,
  Truck,
} from 'lucide-react';

const STORAGE_KEY_REPORTS = 'doe_work_permit_reports_v1';
const STORAGE_KEY_OFFICES = 'doe_work_permit_offices_v1';
const STORAGE_KEY_CATEGORIES = 'doe_work_permit_categories_v1';
const STORAGE_KEY_REPORTERS = 'doe_work_permit_reporters_v1';
const STORAGE_KEY_CONFIG = 'doe_work_permit_config_v1';
const STORAGE_KEY_DELETED_OFFICES = 'doe_work_permit_deleted_offices_v1';
const STORAGE_KEY_DELETED_REPORTS = 'doe_work_permit_deleted_reports_v1';

export default function App() {
  // 1. Reports Database
  const [reports, setReports] = useState<DOEReport[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_REPORTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const today = getTodayIsoDate();
          const hasToday = parsed.some((r: DOEReport) => r.reportDate === today);
          if (!hasToday) {
            const todaySeed = INITIAL_REPORTS.filter((r) => r.reportDate === today);
            return [...todaySeed, ...parsed];
          }
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load reports from storage', e);
    }
    return INITIAL_REPORTS;
  });

  // 2. Offices Database
  const [offices, setOffices] = useState<EmploymentOffice[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_OFFICES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge with latest EMPLOYMENT_OFFICES defaults to update centerNames and include new centers, preserving custom offices
          const updated = [...parsed].map((o: EmploymentOffice) =>
            o.region === 'ส่วนกลาง' ? { ...o, region: 'เฉพาะกิจ' as const } : o
          );
          for (const defaultOffice of EMPLOYMENT_OFFICES) {
            const idx = updated.findIndex((o: EmploymentOffice) => o.id === defaultOffice.id);
            if (idx >= 0) {
              updated[idx] = { ...updated[idx], ...defaultOffice };
            } else {
              updated.push(defaultOffice);
            }
          }
          return updated;
        }
      }
    } catch (e) {
      console.error('Failed to load offices from storage', e);
    }
    return EMPLOYMENT_OFFICES;
  });

  // 3. Categories / Sections Database
  const [categories, setCategories] = useState<ReportCategory[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CATEGORIES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load categories from storage', e);
    }
    return DEFAULT_CATEGORIES;
  });

  // 4. Reporters Database
  const [reporters, setReporters] = useState<ReporterProfile[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_REPORTERS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load reporters from storage', e);
    }
    return DEFAULT_REPORTERS;
  });

  // 5. System Config & Branding Database
  const [systemConfig, setSystemConfig] = useState<SystemConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          const config = { ...DEFAULT_SYSTEM_CONFIG, ...parsed };
          if (!config.adminPin || config.adminPin === '1234') {
            config.adminPin = 'admin';
          }
          return config;
        }
      }
    } catch (e) {
      console.error('Failed to load system config from storage', e);
    }
    return DEFAULT_SYSTEM_CONFIG;
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [currentReport, setCurrentReport] = useState<DOEReport>(
    reports[0] || INITIAL_REPORTS[0]
  );
  const [livePreviewReport, setLivePreviewReport] = useState<DOEReport>(
    reports[0] || INITIAL_REPORTS[0]
  );

  // Modals
  const [isPosterModalOpen, setIsPosterModalOpen] = useState(false);
  const [isLineModalOpen, setIsLineModalOpen] = useState(false);
  const [modalTargetReport, setModalTargetReport] = useState<DOEReport>(
    reports[0] || INITIAL_REPORTS[0]
  );
  const [reportToDelete, setReportToDelete] = useState<DOEReport | null>(null);

  // Toast notification state
  const [toastState, setToastState] = useState<{
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);

  // Deleted items memory & storage (ถังขยะสำหรับกู้คืนข้อมูลที่ถูกลบ)
  const [deletedOffices, setDeletedOffices] = useState<EmploymentOffice[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DELETED_OFFICES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to load deleted offices from storage', e);
    }
    return [];
  });

  const [deletedReports, setDeletedReports] = useState<DOEReport[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DELETED_REPORTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to load deleted reports from storage', e);
    }
    return [];
  });

  // Persist Databases to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(reports));
    } catch (e) {
      console.error('Failed to persist reports', e);
    }
  }, [reports]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_OFFICES, JSON.stringify(offices));
    } catch (e) {
      console.error('Failed to persist offices', e);
    }
  }, [offices]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_DELETED_OFFICES, JSON.stringify(deletedOffices));
    } catch (e) {
      console.error('Failed to persist deleted offices', e);
    }
  }, [deletedOffices]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_DELETED_REPORTS, JSON.stringify(deletedReports));
    } catch (e) {
      console.error('Failed to persist deleted reports', e);
    }
  }, [deletedReports]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(categories));
    } catch (e) {
      console.error('Failed to persist categories', e);
    }
  }, [categories]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_REPORTERS, JSON.stringify(reporters));
    } catch (e) {
      console.error('Failed to persist reporters', e);
    }
  }, [reporters]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(systemConfig));
    } catch (e) {
      console.error('Failed to persist system config', e);
    }
  }, [systemConfig]);

  const showToast = (message: string, actionLabel?: string, onAction?: () => void) => {
    setToastState({ message, actionLabel, onAction });
    setTimeout(() => {
      setToastState((curr) => (curr?.message === message ? null : curr));
    }, actionLabel ? 6000 : 3500);
  };

  // Database Management Handlers
  const handleUpdateOffices = (updatedOffices: EmploymentOffice[]) => {
    // Detect newly removed offices and add to deletedOffices
    const removed = offices.filter((o) => !updatedOffices.some((u) => u.id === o.id));
    if (removed.length > 0) {
      setDeletedOffices((prev) => [...removed, ...prev.filter((d) => !removed.some((r) => r.id === d.id))]);
    }
    setOffices(updatedOffices);
  };

  // RESTORE OFFICE HANDLERS
  const handleRestoreDeletedOffice = (officeId: string) => {
    const target =
      deletedOffices.find((o) => o.id === officeId) ||
      EMPLOYMENT_OFFICES.find((o) => o.id === officeId);

    if (!target) return;

    if (!offices.some((o) => o.id === target.id)) {
      setOffices((prev) => [...prev, target]);
    }
    setDeletedOffices((prev) => prev.filter((o) => o.id !== target.id));
    showToast(`กู้คืน "${target.name}" กลับสู่ระบบเรียบร้อยแล้ว`);
  };

  const handleRestoreAllMissingOffices = () => {
    const missing = EMPLOYMENT_OFFICES.filter(
      (std) => !offices.some((o) => o.id === std.id || o.name === std.name)
    );
    if (missing.length === 0) {
      showToast('สำนักงานจัดหางานและศูนย์บริการครบถ้วนทั้ง 87 แห่งแล้ว');
      return;
    }
    setOffices((prev) => [...prev, ...missing]);
    setDeletedOffices((prev) =>
      prev.filter((d) => !missing.some((m) => m.id === d.id))
    );
    showToast(
      `กู้คืนจังหวัด/สำนักงานที่ขาดหายไปทั้งหมด (${missing.length} แห่ง) เรียบร้อยแล้ว`
    );
  };

  // RESTORE REPORT HANDLERS
  const handleRestoreDeletedReport = (reportId: string) => {
    const target = deletedReports.find((r) => r.id === reportId);
    if (!target) return;
    setReports((prev) => [target, ...prev.filter((r) => r.id !== target.id)]);
    setDeletedReports((prev) => prev.filter((r) => r.id !== target.id));
    showToast(`กู้คืนรายงานของ "${target.officeName}" สำเร็จ!`);
  };

  const handleRestoreAllDeletedReports = () => {
    if (deletedReports.length === 0) return;
    const count = deletedReports.length;
    setReports((prev) => [...deletedReports, ...prev]);
    setDeletedReports([]);
    showToast(`กู้คืนรายงานทั้งหมด (${count} ฉบับ) เรียบร้อยแล้ว`);
  };

  const handleUpdateCategories = (updatedCategories: ReportCategory[]) => {
    setCategories(updatedCategories);
  };

  const handleUpdateReporters = (updatedReporters: ReporterProfile[]) => {
    setReporters(updatedReporters);
  };

  const handleUpdateSystemConfig = (updatedConfig: SystemConfig) => {
    setSystemConfig(updatedConfig);
  };

  const handleRestoreFullDatabase = (data: {
    offices?: EmploymentOffice[];
    categories?: ReportCategory[];
    reporters?: ReporterProfile[];
    systemConfig?: SystemConfig;
    reports?: DOEReport[];
  }) => {
    if (data.offices && Array.isArray(data.offices)) {
      setOffices(data.offices);
      localStorage.setItem(STORAGE_KEY_OFFICES, JSON.stringify(data.offices));
    }
    if (data.categories && Array.isArray(data.categories)) {
      setCategories(data.categories);
      localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(data.categories));
    }
    if (data.reporters && Array.isArray(data.reporters)) {
      setReporters(data.reporters);
      localStorage.setItem(STORAGE_KEY_REPORTERS, JSON.stringify(data.reporters));
    }
    if (data.systemConfig) {
      setSystemConfig(data.systemConfig);
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(data.systemConfig));
    }
    if (data.reports && Array.isArray(data.reports)) {
      setReports(data.reports);
      localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(data.reports));
      if (data.reports.length > 0) {
        setCurrentReport(data.reports[0]);
        setLivePreviewReport(data.reports[0]);
      }
    }
  };

  const handleResetFactoryDefaults = () => {
    localStorage.removeItem(STORAGE_KEY_REPORTS);
    localStorage.removeItem(STORAGE_KEY_OFFICES);
    localStorage.removeItem(STORAGE_KEY_CATEGORIES);
    localStorage.removeItem(STORAGE_KEY_REPORTERS);
    localStorage.removeItem(STORAGE_KEY_CONFIG);

    setReports(INITIAL_REPORTS);
    setOffices(EMPLOYMENT_OFFICES);
    setCategories(DEFAULT_CATEGORIES);
    setReporters(DEFAULT_REPORTERS);
    setSystemConfig(DEFAULT_SYSTEM_CONFIG);

    setCurrentReport(INITIAL_REPORTS[0]);
    setLivePreviewReport(INITIAL_REPORTS[0]);
    showToast('รีเซ็ตระบบและฐานข้อมูลเป็นค่าเริ่มต้นทางการของ DOE เรียบร้อย');
  };

  // Save or update report
  const handleSaveReport = (savedReport: DOEReport) => {
    const existingIndex = reports.findIndex((r) => r.id === savedReport.id);
    let updatedList: DOEReport[];

    if (existingIndex >= 0) {
      updatedList = [...reports];
      updatedList[existingIndex] = savedReport;
      showToast(`บันทึกการแก้ไขรายงาน "${savedReport.officeName}" สำเร็จ!`);
    } else {
      updatedList = [savedReport, ...reports];
      showToast(`บันทึกรายงานใหม่ของ "${savedReport.officeName}" สำเร็จ!`);
    }

    setReports(updatedList);
    setCurrentReport(savedReport);
    setLivePreviewReport(savedReport);
    setModalTargetReport(savedReport);
    // Open preview poster modal to verify
    setIsPosterModalOpen(true);
  };

  // Delete report
  const handleDeleteReport = (id: string) => {
    const target = reports.find((r) => r.id === id);
    if (!target) return;
    setReportToDelete(target);
  };

  const handleConfirmDeleteReport = () => {
    if (!reportToDelete) return;
    const target = reportToDelete;
    const remaining = reports.filter((r) => r.id !== target.id);
    setReports(remaining);
    setDeletedReports((prev) => [target, ...prev.filter((r) => r.id !== target.id)]);
    showToast(
      `ลบรายงานของ "${target.officeName}" เรียบร้อยแล้ว`,
      '↩️ กู้คืน (Undo)',
      () => handleRestoreDeletedReport(target.id)
    );
    if (currentReport.id === target.id && remaining.length > 0) {
      setCurrentReport(remaining[0]);
      setLivePreviewReport(remaining[0]);
    }
    setReportToDelete(null);
  };

  // Duplicate report
  const handleDuplicateReport = (report: DOEReport) => {
    const cloned: DOEReport = {
      ...report,
      id: `report-${Date.now()}`,
      reportDate: new Date().toISOString().slice(0, 10),
      reportDateThaiStr: formatThaiDateFull(new Date()),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setCurrentReport(cloned);
    setLivePreviewReport(cloned);
    setActiveTab('form');
    showToast('คัดลอกรายงานเรียบร้อย สามารถแก้ไขและบันทึกได้ทันที');
  };

  // Select report for poster
  const handleOpenPosterModal = (report: DOEReport) => {
    setModalTargetReport(report);
    setIsPosterModalOpen(true);
  };

  // Select report for LINE
  const handleOpenLineModal = (report: DOEReport) => {
    setModalTargetReport(report);
    setIsLineModalOpen(true);
  };

  // Edit report
  const handleEditReport = (report: DOEReport) => {
    setCurrentReport(report);
    setLivePreviewReport(report);
    setActiveTab('form');
    setIsPosterModalOpen(false);
  };

  // New report (supports preselectedOfficeId from dashboard table!)
  const handleNewReport = (preselectedOfficeId?: string) => {
    const targetOffice =
      offices.find(
        (o) => o.id === (preselectedOfficeId || currentReport.officeId)
      ) || offices[0];

    const newReportTemplate: DOEReport = {
      id: `report-${Date.now()}`,
      reportDate: new Date().toISOString().slice(0, 10),
      reportDateThaiStr: formatThaiDateFull(new Date()),
      officeId: targetOffice.id,
      officeName: targetOffice.name,
      officeNameEn: targetOffice.nameEn,
      centerName: targetOffice.centerName,
      region: targetOffice.region,
      reporterName: '',
      reporterPosition: '',
      phoneNumber: targetOffice.defaultPhone || '',
      lineId: targetOffice.defaultLine || '',
      section59: 0,
      section62: 0,
      section63_1: 0,
      section63_2: 0,
      section64: 0,
      modifyDetails: 0,
      substituteCard: 0,
      queueAppointment: 0,
      cardsIssued: 0,
      identityVerified: 0,
      cardsNotIssued: 0,
      missedAppointment: 0,
      wrongAppointmentDate: 0,
      cumulativeCardsIssued: 0,
      cumulativeSinceDate: '13 ตุลาคม 2568',
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setCurrentReport(newReportTemplate);
    setLivePreviewReport(newReportTemplate);
    setActiveTab('form');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 flex flex-col font-sans text-slate-800">
      {/* Top System Header */}
      <DOEHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        reportCount={reports.length}
        onPreviewCurrentPoster={() => handleOpenPosterModal(livePreviewReport)}
        customLogoUrl={systemConfig.customLogoUrl}
        systemTitle={systemConfig.reportTitle}
      />

      {/* Toast Alert with Action / Undo Support */}
      {toastState && (
        <div className="fixed bottom-6 right-6 z-50 bg-white text-slate-800 px-4 py-3 rounded-xl shadow-xl border border-slate-200 ring-1 ring-slate-950/5 flex items-center gap-3 text-xs font-semibold animate-in slide-in-from-bottom duration-200">
          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{toastState.message}</span>
          {toastState.actionLabel && toastState.onAction && (
            <button
              type="button"
              onClick={() => {
                toastState.onAction?.();
                setToastState(null);
              }}
              className="ml-2 px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-lg transition-colors cursor-pointer text-xs shadow-xs"
            >
              {toastState.actionLabel}
            </button>
          )}
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 w-full max-w-[1780px] 2xl:max-w-[1920px] mx-auto p-4 sm:p-6 lg:p-8 xl:px-10">
        {/* TAB 1: EXECUTIVE DASHBOARD (NATIONAL & REGIONAL OVERVIEW) */}
        {activeTab === 'dashboard' && (
          <DashboardView
            reports={reports}
            onSelectReport={handleOpenPosterModal}
            onNewReport={handleNewReport}
            onOpenLine={handleOpenLineModal}
            onEditReport={handleEditReport}
            onViewPendingInHistory={() => setActiveTab('history')}
            offices={offices}
          />
        )}

        {/* TAB 2: REPORT FORM WITH LIVE POSTER PREVIEW */}
        {activeTab === 'form' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-700" />
                  <span>บันทึกผลการปฏิบัติงานศูนย์บริการคนต่างด้าว</span>
                </h2>
                <p className="text-xs text-slate-500">
                  กรอกข้อมูลประจำวัน รายงานจะแสดงผลเปรียบเทียบในโปสเตอร์ทันทีแบบเรียลไทม์
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenPosterModal(livePreviewReport)}
                  className="text-xs font-bold px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>ดูโปสเตอร์เต็มจอ / ดาวน์โหลดรูป</span>
                </button>
              </div>
            </div>

            {/* Split Grid: Form (Col 7) and Live Poster Preview (Col 5) */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              {/* Form Input Area */}
              <div className="xl:col-span-7">
                <ReportForm
                  key={currentReport.id}
                  initialReport={currentReport}
                  onSave={handleSaveReport}
                  onPreviewLive={setLivePreviewReport}
                  offices={offices}
                  categories={categories}
                  reporters={reporters}
                />
              </div>

              {/* Live Scaled Preview of the Infographic Poster (Clean Light) */}
              <div className="xl:col-span-5 hidden xl:block sticky top-20">
                <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between px-2 pt-1">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 flex-wrap">
                      <Eye className="w-3.5 h-3.5 text-sky-600" />
                      <span>ตัวอย่างโปสเตอร์ Clean Light (อัปเดตสด)</span>
                      {livePreviewReport.centerName?.includes('Mobile Unit') && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-semibold border border-emerald-200 flex items-center gap-1">
                          <Truck className="w-2.5 h-2.5" /> Mobile Unit
                        </span>
                      )}
                    </span>

                    <button
                      onClick={() => handleOpenPosterModal(livePreviewReport)}
                      className="text-[11px] font-semibold text-sky-600 hover:text-sky-800 cursor-pointer flex items-center gap-1"
                    >
                      <span>ขยาย</span>
                      <Maximize2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Scaled Poster Container */}
                  <div className="overflow-hidden rounded-xl border border-slate-200 flex justify-center bg-slate-100/70 p-2 h-[870px]">
                    <div className="origin-top" style={{ transform: 'scale(0.63)' }}>
                      <InfographicPoster
                        report={livePreviewReport}
                        categories={categories}
                        systemConfig={systemConfig}
                        customLogoUrl={systemConfig.customLogoUrl}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: REPORT HISTORY */}
        {activeTab === 'history' && (
          <ReportHistory
            reports={reports}
            deletedReports={deletedReports}
            onViewPoster={handleOpenPosterModal}
            onEditReport={handleEditReport}
            onDeleteReport={handleDeleteReport}
            onRestoreReport={handleRestoreDeletedReport}
            onRestoreAllReports={handleRestoreAllDeletedReports}
            onDuplicateReport={handleDuplicateReport}
            onOpenLineModal={handleOpenLineModal}
            onNewReport={handleNewReport}
          />
        )}

        {/* TAB 4: ADMIN CONSOLE (สิทธิ์ ADMIN) */}
        {activeTab === 'admin' && (
          <AdminConsole
            offices={offices}
            categories={categories}
            reporters={reporters}
            systemConfig={systemConfig}
            reports={reports}
            deletedOffices={deletedOffices}
            deletedReports={deletedReports}
            onUpdateOffices={handleUpdateOffices}
            onUpdateCategories={handleUpdateCategories}
            onUpdateReporters={handleUpdateReporters}
            onUpdateSystemConfig={handleUpdateSystemConfig}
            onRestoreFullDatabase={handleRestoreFullDatabase}
            onResetFactoryDefaults={handleResetFactoryDefaults}
            onRestoreDeletedOffice={handleRestoreDeletedOffice}
            onRestoreAllMissingOffices={handleRestoreAllMissingOffices}
            onRestoreDeletedReport={handleRestoreDeletedReport}
            onRestoreAllDeletedReports={handleRestoreAllDeletedReports}
            onNotify={showToast}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto bg-white/80 backdrop-blur-xs border-t border-slate-200/80 py-4 px-6 text-xs text-slate-500 shadow-2xs">
        <div className="w-full max-w-[1780px] 2xl:max-w-[1920px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-slate-700">
              {systemConfig.departmentNameTh || 'กรมการจัดหางาน กระทรวงแรงงาน'} (Department of Employment)
            </span>
            <span className="text-slate-300 hidden sm:inline">•</span>
            <span className="text-slate-500 hidden sm:inline">{systemConfig.reportTitle}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span>ฐานข้อมูลสำนักงานจัดหางาน {offices.length} แห่งทั่วประเทศ</span>
            <span>•</span>
            <span className="font-medium text-slate-600">ศูนย์บริการ OSS แรงงาน 4 สัญชาติ</span>
          </div>
        </div>
      </footer>

      {/* Poster Preview Modal */}
      {isPosterModalOpen && (
        <PosterPreviewModal
          report={modalTargetReport}
          onClose={() => setIsPosterModalOpen(false)}
          onEdit={handleEditReport}
          onOpenLine={handleOpenLineModal}
          categories={categories}
          systemConfig={systemConfig}
          customLogoUrl={systemConfig.customLogoUrl}
        />
      )}

      {/* LINE Summary Text Export Modal */}
      {isLineModalOpen && (
        <ExportLineModal
          report={modalTargetReport}
          onClose={() => setIsLineModalOpen(false)}
        />
      )}

      {/* Delete Report Confirmation Dialog Modal */}
      <ConfirmDialogModal
        isOpen={!!reportToDelete}
        title="ยืนยันการลบรายงานผลการปฏิบัติงาน"
        message={`คุณแน่ใจหรือไม่ว่าต้องการลบรายงานของ "${reportToDelete?.officeName}" (${reportToDelete?.reportDate})? ข้อมูลรายงานนี้จะถูกนำออกจากประวัติและแดชบอร์ดอย่างถาวร`}
        confirmText="ยืนยันลบรายงานนี้"
        cancelText="ยกเลิก"
        isDanger={true}
        iconType="trash"
        onConfirm={handleConfirmDeleteReport}
        onClose={() => setReportToDelete(null)}
      />
    </div>
  );
}
