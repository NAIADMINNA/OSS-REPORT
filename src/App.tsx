/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  DOEReport,
  EmploymentOffice,
  QueueMetricCategory,
  ReportCategory,
  ReporterProfile,
  SystemConfig,
} from './types/doe';
import { INITIAL_REPORTS } from './data/seedData';
import { EMPLOYMENT_OFFICES } from './data/offices';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_QUEUE_METRICS,
  DEFAULT_REPORTERS,
  DEFAULT_SYSTEM_CONFIG,
} from './data/initialAdminData';
import { DOEHeader, ActiveTab } from './components/DOEHeader';
import { ReportForm } from './components/ReportForm';
import { DashboardView } from './components/DashboardView';
import { ReportHistory } from './components/ReportHistory';
import { DailyNotesTable } from './components/DailyNotesTable';
import { InfographicPoster } from './components/InfographicPoster';
import { PosterPreviewModal } from './components/PosterPreviewModal';
import { ExportLineModal } from './components/ExportLineModal';
import { AdminConsole, AdminSubTab } from './components/AdminConsole';
import { ConfirmDialogModal } from './components/ConfirmDialogModal';
import { DOEAssistantMascot } from './components/DOEAssistantMascot';
import { formatThaiDateFull, getTodayIsoDate } from './utils/thaiDate';
import { sanitizeReportList } from './utils/doeUtils';
import {
  Eye,
  CheckCircle,
  Maximize2,
  FileText,
  Truck,
  Cloud,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { testConnection } from './firebase';
import {
  subscribeReports,
  saveReportOnline,
  deleteReportOnline,
  restoreReportOnline,
  subscribeDeletedReports,
  subscribeOffices,
  saveOfficeOnline,
  deleteOfficeOnline,
  restoreOfficeOnline,
  subscribeDeletedOffices,
  subscribeCategories,
  saveAllCategoriesOnline,
  subscribeQueueMetrics,
  saveAllQueueMetricsOnline,
  subscribeReporters,
  saveAllReportersOnline,
  subscribeSystemConfig,
  saveSystemConfigOnline,
  initializeFirestoreIfEmpty,
  clearAllReportsOnline,
} from './services/firestoreService';

const STORAGE_KEY_REPORTS = 'doe_work_permit_reports_v1';
const STORAGE_KEY_REPORTS_BACKUP = 'doe_work_permit_reports_backup_v1';
const STORAGE_KEY_OFFICES = 'doe_work_permit_offices_v1';
const STORAGE_KEY_CATEGORIES = 'doe_work_permit_categories_v1';
const STORAGE_KEY_QUEUE_METRICS = 'doe_work_permit_queue_metrics_v1';
const STORAGE_KEY_REPORTERS = 'doe_work_permit_reporters_v1';
const STORAGE_KEY_CONFIG = 'doe_work_permit_config_v1';
const STORAGE_KEY_DELETED_OFFICES = 'doe_work_permit_deleted_offices_v1';
const STORAGE_KEY_DELETED_REPORTS = 'doe_work_permit_deleted_reports_v1';

export const createEmptyReportTemplate = (targetOffice?: EmploymentOffice): DOEReport => {
  const office = targetOffice || EMPLOYMENT_OFFICES[0];
  const today = getTodayIsoDate();
  return {
    id: `report-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    reportDate: today,
    reportDateThaiStr: formatThaiDateFull(today),
    officeId: office.id,
    officeName: office.name,
    officeNameEn: office.nameEn,
    centerName: office.centerName,
    region: office.region,
    reporterName: '',
    reporterPosition: '',
    phoneNumber: '',
    lineId: '',
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
    customCategoryValues: {},
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

export default function App() {
  const [isFirestoreOnline, setIsFirestoreOnline] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // 1. Reports Database (with automatic fallback to rolling backup if primary key was cleared)
  const [reports, setReports] = useState<DOEReport[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_REPORTS);
      if (saved) {
        const parsed = sanitizeReportList(JSON.parse(saved));
        if (parsed.length > 0) {
          return parsed;
        }
      }
      const backup = localStorage.getItem(STORAGE_KEY_REPORTS_BACKUP);
      if (backup) {
        const parsedBackup = sanitizeReportList(JSON.parse(backup));
        if (parsedBackup.length > 0) {
          return parsedBackup;
        }
      }
    } catch (e) {
      console.error('Failed to load reports from storage', e);
    }
    return [];
  });

  // 2. Offices Database
  const [offices, setOffices] = useState<EmploymentOffice[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_OFFICES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
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

  // 3. Categories / Sections Database (กลุ่มมาตรา)
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

  const normalizeQueueMetricsList = (list: QueueMetricCategory[]): QueueMetricCategory[] => {
    return list.map((m) => {
      if (m.id === 'cardsNotIssued' && m.title === 'ไม่ออกบัตร') {
        return {
          ...m,
          title: 'บัตรเสีย',
          unit: m.unit === 'คน' ? 'ใบ' : m.unit || 'ใบ',
          subLabel:
            m.subLabel === 'ไม่อนุมัติ / คุณสมบัติหรือเอกสารไม่ครบถ้วน'
              ? 'บัตรชำรุด / พิมพ์เสียระหว่างการออกบัตร'
              : m.subLabel,
        };
      }
      return m;
    });
  };

  // 3.1 Queue Metrics Database (สถานะคิวและการให้บริการประจำวัน)
  const [queueMetrics, setQueueMetrics] = useState<QueueMetricCategory[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_QUEUE_METRICS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return normalizeQueueMetricsList(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load queue metrics from storage', e);
    }
    return DEFAULT_QUEUE_METRICS;
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
          if (!config.adminPin || config.adminPin === '1234' || config.adminPin === 'admin') {
            config.adminPin = '0841543524';
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
  const [adminInitialSubTab, setAdminInitialSubTab] = useState<AdminSubTab | undefined>(undefined);
  const [isEditingExistingReport, setIsEditingExistingReport] = useState<boolean>(false);

  // Admin authentication state across tabs
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('doe_admin_authenticated') === 'true';
    } catch {
      return false;
    }
  });

  const handleAdminAuthenticated = () => {
    setIsAdmin(true);
    try {
      sessionStorage.setItem('doe_admin_authenticated', 'true');
    } catch {}
  };

  const [currentReport, setCurrentReport] = useState<DOEReport>(() =>
    createEmptyReportTemplate(EMPLOYMENT_OFFICES[0])
  );
  const [livePreviewReport, setLivePreviewReport] = useState<DOEReport>(() =>
    createEmptyReportTemplate(EMPLOYMENT_OFFICES[0])
  );

  // Modals
  const [isPosterModalOpen, setIsPosterModalOpen] = useState(false);
  const [isLineModalOpen, setIsLineModalOpen] = useState(false);
  const [modalTargetReport, setModalTargetReport] = useState<DOEReport>(() =>
    reports[0] || createEmptyReportTemplate(EMPLOYMENT_OFFICES[0])
  );
  const [reportToDelete, setReportToDelete] = useState<DOEReport | null>(null);

  // Toast notification state
  const [toastState, setToastState] = useState<{
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);

  // Deleted items memory & storage
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
        const parsed = sanitizeReportList(JSON.parse(saved));
        return parsed;
      }
    } catch (e) {
      console.error('Failed to load deleted reports from storage', e);
    }
    return [];
  });

  // Online Firestore Setup and Realtime Sync Subscriptions
  useEffect(() => {
    let unsubs: (() => void)[] = [];

    async function initOnlineDB() {
      setIsSyncing(true);
      try {
        const isConnected = await testConnection();
        setIsFirestoreOnline(isConnected);

        // Ensure online Firestore has initial data if newly provisioned
        await initializeFirestoreIfEmpty();

        // 1. Subscribe to online reports (Realtime push via onSnapshot)
        // Safeguard: Never allow an empty online array to wipe out existing local reports!
        const unsubReports = subscribeReports((onlineReports) => {
          if (!Array.isArray(onlineReports)) return;
          const cleanOnline = sanitizeReportList(onlineReports);
          setReports((prevLocal) => {
            const cleanPrev = sanitizeReportList(prevLocal);
            if (cleanOnline.length === 0) {
              // If Firestore is empty, preserve local reports and push them online
              if (cleanPrev.length > 0) {
                cleanPrev.forEach((r) => saveReportOnline(r).catch(console.warn));
                return cleanPrev;
              }
              return cleanPrev;
            }
            // Merge online reports with any local reports not yet on server
            const onlineIds = new Set(cleanOnline.map((r) => r.id));
            const unsyncedLocal = cleanPrev.filter((r) => !onlineIds.has(r.id));
            if (unsyncedLocal.length > 0) {
              unsyncedLocal.forEach((r) => saveReportOnline(r).catch(console.warn));
            }
            const merged = [...cleanOnline, ...unsyncedLocal];
            merged.sort((a, b) => (b.reportDate || '').localeCompare(a.reportDate || ''));
            return merged;
          });
        });
        unsubs.push(unsubReports);

        // 2. Subscribe to online offices
        const unsubOffices = subscribeOffices((onlineOffices) => {
          if (onlineOffices && onlineOffices.length > 0) {
            setOffices(onlineOffices);
          }
        });
        unsubs.push(unsubOffices);

        // 3. Subscribe to categories
        const unsubCats = subscribeCategories((onlineCats) => {
          if (onlineCats && onlineCats.length > 0) {
            setCategories(onlineCats);
          }
        });
        unsubs.push(unsubCats);

        // 3.1 Subscribe to queue metrics
        const unsubQueueMetrics = subscribeQueueMetrics((onlineMetrics) => {
          if (onlineMetrics && onlineMetrics.length > 0) {
            const normalized = normalizeQueueMetricsList(onlineMetrics);
            setQueueMetrics(normalized);
            if (onlineMetrics.some((m) => m.id === 'cardsNotIssued' && m.title === 'ไม่ออกบัตร')) {
              saveAllQueueMetricsOnline(normalized).catch(console.warn);
            }
          }
        });
        unsubs.push(unsubQueueMetrics);

        // 4. Subscribe to reporters
        const unsubReps = subscribeReporters((onlineReps) => {
          if (onlineReps && onlineReps.length > 0) {
            setReporters(onlineReps);
          }
        });
        unsubs.push(unsubReps);

        // 5. Subscribe to system config
        const unsubConfig = subscribeSystemConfig((onlineConfig) => {
          if (onlineConfig && onlineConfig.reportTitle) {
            setSystemConfig(onlineConfig);
          }
        });
        unsubs.push(unsubConfig);

        // 6. Subscribe to deleted reports (trash)
        const unsubDelReports = subscribeDeletedReports((onlineDel) => {
          if (onlineDel && onlineDel.length > 0) {
            setDeletedReports(onlineDel);
          }
        });
        unsubs.push(unsubDelReports);

        // 7. Subscribe to deleted offices (trash)
        const unsubDelOffices = subscribeDeletedOffices((onlineDelOffices) => {
          if (onlineDelOffices && onlineDelOffices.length > 0) {
            setDeletedOffices(onlineDelOffices);
          }
        });
        unsubs.push(unsubDelOffices);
      } catch (err) {
        console.warn('Firestore initialization or connection status:', err);
      } finally {
        setIsSyncing(false);
      }
    }

    initOnlineDB();

    return () => {
      unsubs.forEach((u) => u());
    };
  }, []);

  // Persist Databases to localStorage (with Rolling Non-Destructive Backup for Reports)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(reports));
      if (reports.length > 0) {
        const existingBackupRaw = localStorage.getItem(STORAGE_KEY_REPORTS_BACKUP);
        let backupList: DOEReport[] = [];
        if (existingBackupRaw) {
          const parsed = JSON.parse(existingBackupRaw);
          if (Array.isArray(parsed)) backupList = parsed;
        }
        const map = new Map<string, DOEReport>();
        backupList.forEach((r) => map.set(r.id, r));
        reports.forEach((r) => map.set(r.id, r));
        const mergedBackup = Array.from(map.values()).sort((a, b) =>
          (b.reportDate || '').localeCompare(a.reportDate || '')
        );
        localStorage.setItem(STORAGE_KEY_REPORTS_BACKUP, JSON.stringify(mergedBackup));
      }
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
      removed.forEach((o) => deleteOfficeOnline(o).catch(console.warn));
    }
    updatedOffices.forEach((o) => saveOfficeOnline(o).catch(console.warn));
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
    restoreOfficeOnline(target).catch(console.warn);
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
    missing.forEach((o) => saveOfficeOnline(o).catch(console.warn));
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
    restoreReportOnline(target).catch(console.warn);
    showToast(`กู้คืนรายงานของ "${target.officeName}" สำเร็จ!`);
  };

  const handleRestoreAllDeletedReports = () => {
    if (deletedReports.length === 0) return;
    const count = deletedReports.length;
    deletedReports.forEach((r) => restoreReportOnline(r).catch(console.warn));
    setReports((prev) => [...deletedReports, ...prev]);
    setDeletedReports([]);
    showToast(`กู้คืนรายงานทั้งหมด (${count} ฉบับ) เรียบร้อยแล้ว`);
  };

  const handleUpdateCategories = (updatedCategories: ReportCategory[]) => {
    setCategories(updatedCategories);
    saveAllCategoriesOnline(updatedCategories).catch(console.warn);
  };

  const handleUpdateQueueMetrics = (updatedMetrics: QueueMetricCategory[]) => {
    setQueueMetrics(updatedMetrics);
    try {
      localStorage.setItem(STORAGE_KEY_QUEUE_METRICS, JSON.stringify(updatedMetrics));
    } catch {}
    saveAllQueueMetricsOnline(updatedMetrics).catch(console.warn);
  };

  const handleUpdateReporters = (updatedReporters: ReporterProfile[]) => {
    setReporters(updatedReporters);
    saveAllReportersOnline(updatedReporters).catch(console.warn);
  };

  const handleUpdateSystemConfig = (updatedConfig: SystemConfig) => {
    setSystemConfig(updatedConfig);
    saveSystemConfigOnline(updatedConfig).catch(console.warn);
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
      data.offices.forEach((o) => saveOfficeOnline(o).catch(console.warn));
    }
    if (data.categories && Array.isArray(data.categories)) {
      setCategories(data.categories);
      localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(data.categories));
      saveAllCategoriesOnline(data.categories).catch(console.warn);
    }
    if (data.reporters && Array.isArray(data.reporters)) {
      setReporters(data.reporters);
      localStorage.setItem(STORAGE_KEY_REPORTERS, JSON.stringify(data.reporters));
      saveAllReportersOnline(data.reporters).catch(console.warn);
    }
    if (data.systemConfig) {
      setSystemConfig(data.systemConfig);
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(data.systemConfig));
      saveSystemConfigOnline(data.systemConfig).catch(console.warn);
    }
    if (data.reports && Array.isArray(data.reports)) {
      setReports(data.reports);
      localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(data.reports));
      data.reports.forEach((r) => saveReportOnline(r).catch(console.warn));
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

    setReports([]);
    setOffices(EMPLOYMENT_OFFICES);
    setCategories(DEFAULT_CATEGORIES);
    setReporters(DEFAULT_REPORTERS);
    setSystemConfig(DEFAULT_SYSTEM_CONFIG);

    saveAllCategoriesOnline(DEFAULT_CATEGORIES).catch(console.warn);
    saveAllReportersOnline(DEFAULT_REPORTERS).catch(console.warn);
    saveSystemConfigOnline(DEFAULT_SYSTEM_CONFIG).catch(console.warn);

    const emptyReport = createEmptyReportTemplate(EMPLOYMENT_OFFICES[0]);
    setCurrentReport(emptyReport);
    setLivePreviewReport(emptyReport);
    showToast('รีเซ็ตระบบและฐานข้อมูลเป็นค่าเริ่มต้นทางการของ DOE เรียบร้อย');
  };

  // ล้างประวัติการรายงานและหมายเหตุทั้งหมดเพื่อนำระบบขึ้นใช้งานจริง (Production Clear All)
  const handleClearAllReportsForProduction = async () => {
    try {
      const previousReports = [...reports];
      if (previousReports.length > 0) {
        // เก็บสำรองไว้ใน Backup และถังขยะเผื่อกรณีผู้ดูแลระบบกดผิดพลาด
        try {
          const existingBackupRaw = localStorage.getItem(STORAGE_KEY_REPORTS_BACKUP);
          const existingBackup: DOEReport[] = existingBackupRaw ? JSON.parse(existingBackupRaw) : [];
          const backupMap = new Map<string, DOEReport>();
          existingBackup.forEach((r) => {
            if (r && r.id) backupMap.set(r.id, r);
          });
          previousReports.forEach((r) => {
            if (r && r.id) backupMap.set(r.id, r);
          });
          localStorage.setItem(
            STORAGE_KEY_REPORTS_BACKUP,
            JSON.stringify(Array.from(backupMap.values()))
          );
        } catch (e) {
          console.warn('Could not save backup before clear:', e);
        }
        setDeletedReports((prev) => {
          const map = new Map<string, DOEReport>();
          prev.forEach((r) => map.set(r.id, r));
          previousReports.forEach((r) => map.set(r.id, r));
          return Array.from(map.values());
        });
      }

      setReports([]);
      localStorage.removeItem(STORAGE_KEY_REPORTS);
      await clearAllReportsOnline();

      const emptyReport = createEmptyReportTemplate(EMPLOYMENT_OFFICES[0]);
      setCurrentReport(emptyReport);
      setLivePreviewReport(emptyReport);

      showToast(
        'ล้างประวัติการรายงานทั้งหมดเรียบร้อยแล้ว (สำรองข้อมูลไว้ในระบบกู้คืนเผื่อกดผิด)',
        previousReports.length > 0 ? '↩️ กู้คืนกลับทันที (Undo)' : undefined,
        previousReports.length > 0 ? () => handleRestoreBackupReports() : undefined
      );
    } catch (err) {
      console.error('Failed to clear reports for production:', err);
    }
  };

  // กู้คืนรายงานจาก Rolling Local Backup หรือถังขยะ
  const handleRestoreBackupReports = () => {
    try {
      const backupRaw = localStorage.getItem(STORAGE_KEY_REPORTS_BACKUP);
      const deletedRaw = localStorage.getItem(STORAGE_KEY_DELETED_REPORTS);
      let recovered: DOEReport[] = [];

      if (backupRaw) {
        const parsed = JSON.parse(backupRaw);
        if (Array.isArray(parsed)) recovered = [...recovered, ...parsed];
      }
      if (deletedRaw) {
        const parsedDel = JSON.parse(deletedRaw);
        if (Array.isArray(parsedDel)) recovered = [...recovered, ...parsedDel];
      }
      if (deletedReports.length > 0) {
        recovered = [...recovered, ...deletedReports];
      }

      const map = new Map<string, DOEReport>();
      reports.forEach((r) => map.set(r.id, r));
      recovered.forEach((r) => map.set(r.id, r));
      const finalRecovered = Array.from(map.values()).sort((a, b) =>
        (b.reportDate || '').localeCompare(a.reportDate || '')
      );

      if (finalRecovered.length === 0) {
        showToast('ไม่พบข้อมูลรายงานสำรองในเบราว์เซอร์เครื่องนี้ (หากบันทึกจากเครื่องอื่น กรุณากดซิงก์จากเครื่องที่บันทึก)');
        return;
      }

      setReports(finalRecovered);
      finalRecovered.forEach((r) => saveReportOnline(r).catch(console.warn));
      showToast(`กู้คืนและซิงก์รายงานสำเร็จทั้งหมด ${finalRecovered.length} ฉบับ!`);
    } catch (e) {
      console.error('Failed to restore backup reports:', e);
      showToast('เกิดข้อผิดพลาดในการกู้คืนรายงานสำรอง');
    }
  };

  // ซิงก์รายงานทั้งหมดในเครื่องขึ้น Cloud Firestore
  const handleSyncAllReportsToOnline = () => {
    if (reports.length === 0) {
      showToast('ไม่มีรายการรายงานในเครื่องที่จะซิงก์ขึ้น Cloud Firestore');
      return;
    }
    reports.forEach((r) => saveReportOnline(r).catch(console.warn));
    showToast(`ซิงก์รายงานทั้งหมด (${reports.length} ฉบับ) ขึ้นฐานข้อมูลออนไลน์เรียบร้อยแล้ว`);
  };

  // Save or update report
  const handleSaveReport = async (savedReport: DOEReport) => {
    let finalReport = { ...savedReport };
    const existingByIdIndex = reports.findIndex((r) => r.id === finalReport.id);

    // If not in edit mode and the user switched to a different office or date after a previous save,
    // generate a fresh ID so it never overwrites the previous office's report
    if (
      !isEditingExistingReport &&
      existingByIdIndex >= 0 &&
      (reports[existingByIdIndex].officeId !== finalReport.officeId ||
        reports[existingByIdIndex].reportDate !== finalReport.reportDate)
    ) {
      finalReport = {
        ...finalReport,
        id: `report-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    const targetIndex = reports.findIndex((r) => r.id === finalReport.id);
    let updatedList: DOEReport[];

    if (targetIndex >= 0) {
      updatedList = [...reports];
      updatedList[targetIndex] = finalReport;
    } else {
      updatedList = [finalReport, ...reports];
    }

    // 1. Immediately persist to localStorage & rolling backup before async network call
    try {
      localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(updatedList));
      const existingBackupRaw = localStorage.getItem(STORAGE_KEY_REPORTS_BACKUP);
      const existingBackup: DOEReport[] = existingBackupRaw ? JSON.parse(existingBackupRaw) : [];
      const backupMap = new Map<string, DOEReport>();
      existingBackup.forEach((r) => {
        if (r && r.id) backupMap.set(r.id, r);
      });
      updatedList.forEach((r) => {
        if (r && r.id) backupMap.set(r.id, r);
      });
      localStorage.setItem(
        STORAGE_KEY_REPORTS_BACKUP,
        JSON.stringify(Array.from(backupMap.values()))
      );
    } catch (e) {
      console.warn('Immediate localStorage save warning:', e);
    }

    setReports(updatedList);
    setCurrentReport(finalReport);
    setLivePreviewReport(finalReport);
    setModalTargetReport(finalReport);
    setIsEditingExistingReport(false);

    // Open preview poster modal to verify
    setIsPosterModalOpen(true);

    // 2. Save directly to Cloud Firestore online database and verify completion
    try {
      await saveReportOnline(finalReport);
      setIsFirestoreOnline(true);
      showToast(
        targetIndex >= 0
          ? `บันทึกการแก้ไขรายงาน "${finalReport.officeName}" ลงฐานข้อมูล Cloud Firestore สำเร็จ!`
          : `บันทึกรายงานใหม่ของ "${finalReport.officeName}" ลงฐานข้อมูล Cloud Firestore สำเร็จ!`
      );
    } catch (err) {
      console.error('Failed to save report online to Firestore:', err);
      showToast(
        `บันทึกรายงาน "${finalReport.officeName}" ลงเครื่องสำรองแล้ว (กำลังรอเชื่อมต่อฐานข้อมูลออนไลน์)`,
        '🔄 ลองซิงก์ใหม่',
        () => {
          saveReportOnline(finalReport).catch(console.warn);
        }
      );
    }
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

    // Delete from online Firestore (moves to deleted_reports collection)
    deleteReportOnline(target).catch(console.warn);

    showToast(
      `ลบรายงานของ "${target.officeName}" เรียบร้อยแล้ว`,
      '↩️ กู้คืน (Undo)',
      () => handleRestoreDeletedReport(target.id)
    );
    if (currentReport.id === target.id) {
      const nextReport =
        remaining.length > 0
          ? remaining[0]
          : createEmptyReportTemplate(offices[0]);
      setCurrentReport(nextReport);
      setLivePreviewReport(nextReport);
    }
    setReportToDelete(null);
  };

  // Duplicate report
  const handleDuplicateReport = (report: DOEReport) => {
    const cloned: DOEReport = {
      ...report,
      id: `report-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      reportDate: new Date().toISOString().slice(0, 10),
      reportDateThaiStr: formatThaiDateFull(new Date()),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setIsEditingExistingReport(true);
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
    setIsEditingExistingReport(true);
    setCurrentReport(report);
    setLivePreviewReport(report);
    setActiveTab('form');
    setIsPosterModalOpen(false);
  };

  // New report (supports preselectedOfficeId from dashboard table!)
  const handleNewReport = (preselectedOfficeId?: string) => {
    setIsEditingExistingReport(false);
    const targetOffice =
      offices.find(
        (o) => o.id === (preselectedOfficeId || currentReport.officeId)
      ) || offices[0];

    const newReportTemplate = createEmptyReportTemplate(targetOffice);
    setCurrentReport(newReportTemplate);
    setLivePreviewReport(newReportTemplate);
    setActiveTab('form');
  };

  // Handle clearing current report form
  const handleClearCurrentReport = () => {
    setIsEditingExistingReport(false);
    const targetOffice =
      offices.find((o) => o.id === currentReport.officeId) || offices[0];
    const blank = createEmptyReportTemplate(targetOffice);
    setCurrentReport(blank);
    setLivePreviewReport(blank);
    showToast('ล้างข้อมูลในแบบฟอร์มเรียบร้อยแล้ว');
  };

  const [dashboardResetSignal, setDashboardResetSignal] = useState(0);

  // Switch tabs safely, ensuring form opens as a clean blank template if not editing
  const handleTabChange = (tab: ActiveTab) => {
    if (tab === 'form' && activeTab !== 'form') {
      if (!isEditingExistingReport) {
        const blank = createEmptyReportTemplate(
          offices.find((o) => o.id === currentReport.officeId) || offices[0]
        );
        setCurrentReport(blank);
        setLivePreviewReport(blank);
      }
    }
    setActiveTab(tab);
  };

  // Click logo to return immediately to the main summary dashboard
  const handleLogoBackToDashboard = () => {
    setIsPosterModalOpen(false);
    setIsLineModalOpen(false);
    setDashboardResetSignal((prev) => prev + 1);
    setActiveTab('dashboard');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 flex flex-col font-sans text-slate-800">
      {/* Top System Header */}
      <DOEHeader
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onLogoClick={handleLogoBackToDashboard}
        reportCount={reports.length}
        notesCount={reports.filter((r) => Boolean(r.notes && r.notes.trim().length > 0)).length}
        onPreviewCurrentPoster={() => handleOpenPosterModal(livePreviewReport)}
        customLogoUrl={systemConfig.customLogoUrl}
        systemTitle={systemConfig.reportTitle}
        isOnlineDatabase={isFirestoreOnline}
        isAdmin={isAdmin}
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
            categories={categories}
            queueMetrics={queueMetrics}
            currentReport={currentReport}
            onSelectReport={handleOpenPosterModal}
            onNewReport={handleNewReport}
            onOpenLine={handleOpenLineModal}
            onEditReport={handleEditReport}
            onViewPendingInHistory={() => setActiveTab('history')}
            offices={offices}
            resetSignal={dashboardResetSignal}
          />
        )}

        {/* TAB 2: REPORT FORM WITH LIVE POSTER PREVIEW */}
        {activeTab === 'form' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-700" />
                    <span>บันทึกผลการปฏิบัติงานศูนย์บริการคนต่างด้าว</span>
                  </h2>
                  {isEditingExistingReport ? (
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-300 flex items-center gap-1">
                      <span>กำลังแก้ไขรายงาน:</span>
                      <span className="underline">{currentReport.officeName}</span>
                    </span>
                  ) : (
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                      แบบฟอร์มเริ่มต้น (ค่าว่าง)
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  กรอกข้อมูลประจำวัน รายงานจะแสดงผลเปรียบเทียบในโปสเตอร์ทันทีแบบเรียลไทม์
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleNewReport()}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer hover:border-slate-400 active:scale-98"
                  title="เริ่มฟอร์มใหม่และเคลียร์ค่าเป็นค่าว่างทั้งหมด"
                >
                  <Plus className="w-3.5 h-3.5 text-blue-600" />
                  <span>เริ่มฟอร์มใหม่ (ล้างค่าว่าง)</span>
                </button>
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
                  onClearForm={handleClearCurrentReport}
                  offices={offices}
                  categories={categories}
                  queueMetrics={queueMetrics}
                  reporters={reporters}
                  isAdmin={isAdmin}
                  adminPin={systemConfig.adminPin || '0841543524'}
                  onAdminAuthenticated={handleAdminAuthenticated}
                  onNavigateAdmin={(subTab) => {
                    if (subTab) setAdminInitialSubTab(subTab as AdminSubTab);
                    setActiveTab('admin');
                  }}
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
                        queueMetrics={queueMetrics}
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
            categories={categories}
            deletedReports={deletedReports}
            adminPin={systemConfig.adminPin || '0841543524'}
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

        {/* TAB 4: DAILY OPERATIONAL NOTES & REMARKS (หมายเหตุ / บันทึกเพิ่มเติมประจำวัน) */}
        {activeTab === 'notes' && (
          <DailyNotesTable
            reports={reports}
            isAdmin={isAdmin}
            adminPin={systemConfig.adminPin || '0841543524'}
            onAdminAuthenticated={handleAdminAuthenticated}
          />
        )}

        {/* TAB 5: ADMIN CONSOLE (สิทธิ์ ADMIN) */}
        {activeTab === 'admin' && (
          <AdminConsole
            offices={offices}
            categories={categories}
            queueMetrics={queueMetrics}
            reporters={reporters}
            systemConfig={systemConfig}
            reports={reports}
            deletedOffices={deletedOffices}
            deletedReports={deletedReports}
            initialSubTab={adminInitialSubTab}
            onUpdateOffices={handleUpdateOffices}
            onUpdateCategories={handleUpdateCategories}
            onUpdateQueueMetrics={handleUpdateQueueMetrics}
            onUpdateReporters={handleUpdateReporters}
            onUpdateSystemConfig={handleUpdateSystemConfig}
            onRestoreFullDatabase={handleRestoreFullDatabase}
            onResetFactoryDefaults={handleResetFactoryDefaults}
            onRestoreDeletedOffice={handleRestoreDeletedOffice}
            onRestoreAllMissingOffices={handleRestoreAllMissingOffices}
            onRestoreDeletedReport={handleRestoreDeletedReport}
            onRestoreAllDeletedReports={handleRestoreAllDeletedReports}
            onClearAllReportsForProduction={handleClearAllReportsForProduction}
            onRestoreBackupReports={handleRestoreBackupReports}
            onSyncAllReportsToOnline={handleSyncAllReportsToOnline}
            onNotify={showToast}
            onAdminAuthenticated={handleAdminAuthenticated}
            onAdminLoggedOut={() => setIsAdmin(false)}
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
          queueMetrics={queueMetrics}
          systemConfig={systemConfig}
          customLogoUrl={systemConfig.customLogoUrl}
        />
      )}

      {/* LINE Summary Text Export Modal */}
      {isLineModalOpen && (
        <ExportLineModal
          report={modalTargetReport}
          queueMetrics={queueMetrics}
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

      {/* Floating DOE Assistant Mascot at Bottom-Left (ตัวละครซ้ายมือจอด้านล่าง คอยตอบคำถามและแจ้งข้อขัดข้องต่างๆ) */}
      <DOEAssistantMascot
        offices={offices}
        currentOfficeName={currentReport.officeName}
        isFirestoreOnline={isFirestoreOnline}
        onNavigateTab={(tab) => setActiveTab(tab)}
      />
    </div>
  );
}
