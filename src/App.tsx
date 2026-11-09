/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
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
import { SystemManualView } from './components/SystemManualView';
import { formatThaiDateFull, getTodayIsoDate } from './utils/thaiDate';
import { sanitizeReportList } from './utils/doeUtils';
import { areSameCenterName, deduplicateCenterList } from './utils/officeUtils';
import {
  loadReportsFromIndexedDB,
  saveReportsToIndexedDB,
} from './utils/indexedDbStorage';
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
  saveBulkReportsOnline,
  deleteReportOnline,
  restoreReportOnline,
  subscribeDeletedReports,
  subscribeOffices,
  saveOfficeOnline,
  saveAllOfficesOnline,
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
  deepScanAndRecoverAllReports,
  DeepScanDiagnosticResult,
  pickNewerReport,
  isReportStrictlyNewer,
} from './services/firestoreService';

const STORAGE_KEY_REPORTS = 'doe_work_permit_reports_v1';
const STORAGE_KEY_REPORTS_BACKUP = 'doe_work_permit_reports_backup_v1';
const STORAGE_KEY_UNSYNCED_REPORT_IDS = 'doe_work_permit_unsynced_ids_v1';
const STORAGE_KEY_OFFICES = 'doe_work_permit_offices_v1';
const STORAGE_KEY_CATEGORIES = 'doe_work_permit_categories_v1';
const STORAGE_KEY_QUEUE_METRICS = 'doe_work_permit_queue_metrics_v1';
const STORAGE_KEY_REPORTERS = 'doe_work_permit_reporters_v1';
const STORAGE_KEY_CONFIG = 'doe_work_permit_config_v1';
const STORAGE_KEY_DELETED_OFFICES = 'doe_work_permit_deleted_offices_v1';
const STORAGE_KEY_DELETED_REPORTS = 'doe_work_permit_deleted_reports_v1';

export const MIN_REPORT_ISO_DATE = '2026-10-01';

export const createEmptyReportTemplate = (targetOffice?: EmploymentOffice): DOEReport => {
  const rawToday = getTodayIsoDate();
  const today = rawToday < MIN_REPORT_ISO_DATE ? MIN_REPORT_ISO_DATE : rawToday;
  return {
    id: `report-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    reportDate: today,
    reportDateThaiStr: formatThaiDateFull(today),
    officeId: targetOffice?.id || '',
    officeName: targetOffice?.name || '',
    officeNameEn: targetOffice?.nameEn || '',
    centerName: targetOffice?.centerName || '',
    region: (targetOffice?.region || '') as EmploymentOffice['region'],
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

  // Track explicitly deleted report IDs and in-flight local saves so deleted reports are never resurrected
  const deletedReportIdsRef = useRef<Set<string>>(
    (() => {
      try {
        const savedDel = localStorage.getItem(STORAGE_KEY_DELETED_REPORTS);
        if (savedDel) {
          const parsedDel = sanitizeReportList(JSON.parse(savedDel));
          return new Set(parsedDel.map((r) => r.id));
        }
      } catch {}
      return new Set<string>();
    })()
  );
  const pendingSaveReportIdsRef = useRef<Set<string>>(
    (() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_UNSYNCED_REPORT_IDS);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return new Set(parsed.filter((id) => typeof id === 'string'));
          }
        }
      } catch {}
      return new Set<string>();
    })()
  );
  const persistUnsyncedIds = () => {
    try {
      localStorage.setItem(
        STORAGE_KEY_UNSYNCED_REPORT_IDS,
        JSON.stringify(Array.from(pendingSaveReportIdsRef.current))
      );
    } catch {}
  };
  const hasLoadedDeletedReportsRef = useRef<boolean>(false);
  const hasReceivedOnlineReportsRef = useRef<boolean>(false);
  const latestOnlineReportIdsRef = useRef<Set<string>>(new Set());
  const uploadedLocalReportIdsRef = useRef<Set<string>>(new Set());

  // 1. Reports Database (merges active storage + rolling backup by newest timestamp, excluding explicitly deleted IDs)
  const [reports, setReports] = useState<DOEReport[]>(() => {
    try {
      const delIds = deletedReportIdsRef.current;
      const map = new Map<string, DOEReport>();

      const backupRaw = localStorage.getItem(STORAGE_KEY_REPORTS_BACKUP);
      if (backupRaw) {
        const parsedBackup = sanitizeReportList(JSON.parse(backupRaw)).filter(
          (r) => !delIds.has(r.id)
        );
        parsedBackup.forEach((r) => map.set(r.id, pickNewerReport(map.get(r.id), r)));
      }

      const savedRaw = localStorage.getItem(STORAGE_KEY_REPORTS);
      if (savedRaw) {
        const parsedSaved = sanitizeReportList(JSON.parse(savedRaw)).filter(
          (r) => !delIds.has(r.id)
        );
        parsedSaved.forEach((r) => map.set(r.id, pickNewerReport(map.get(r.id), r)));
      }

      const combined = Array.from(map.values()).sort((a, b) =>
        (b.reportDate || '').localeCompare(a.reportDate || '')
      );
      return combined;
    } catch (e) {
      console.error('Failed to load reports from storage', e);
    }
    return [];
  });

  // Helper to ensure center names (เช่น "ศูนย์เฉพาะกิจ...") are always stored in centerName/additionalCenters,
  // never as the EmploymentOffice name (สำนักงานจัดหางาน)
  const normalizeOfficesAndCenters = (
    inputList: EmploymentOffice[],
    deletedIds: Set<string>
  ): {
    merged: EmploymentOffice[];
    bogusDocsToDelete: EmploymentOffice[];
    updatedStdToSave: EmploymentOffice[];
  } => {
    const cleanInput = (inputList || [])
      .filter((o) => o && o.id && o.name && (!deletedIds.has(o.id) || o.id.startsWith('office_')))
      .map((o) =>
        (o.region as string) === 'ส่วนกลาง'
          ? { ...o, region: 'เฉพาะกิจ' as const }
          : o
      );

    const inputMap = new Map<string, EmploymentOffice>();
    cleanInput.forEach((o) => inputMap.set(o.id, o));

    const result: EmploymentOffice[] = [];
    const seenIds = new Set<string>();
    const bogusDocsToDelete: EmploymentOffice[] = [];
    const updatedStdIds = new Set<string>();

    const isCenterLikeName = (str?: string) => {
      const s = (str || '').trim();
      return (
        s.startsWith('ศูนย์') ||
        s.startsWith('หน่วยบริการ') ||
        s.includes('ศูนย์เฉพาะกิจ') ||
        s.includes('Mobile Unit')
      );
    };

    // 1. All standard 87 offices
    for (const std of EMPLOYMENT_OFFICES) {
      if (deletedIds.has(std.id)) continue;
      const match = inputMap.get(std.id);
      if (match) {
        const mergedAdd = deduplicateCenterList([
          ...(std.additionalCenters || []),
          ...(match.additionalCenters || []),
        ]);
        // Protect std.name if someone accidentally put a center name into match.name
        const safeName = isCenterLikeName(match.name) ? std.name : match.name || std.name;
        if (
          isCenterLikeName(match.name) &&
          !areSameCenterName(match.name, std.centerName) &&
          !mergedAdd.some((c) => areSameCenterName(c, match.name))
        ) {
          mergedAdd.push(match.name.trim());
          updatedStdIds.add(std.id);
        }

        // If match.centerName was overwritten with a "เฉพาะกิจ" center while std.centerName is a regular center,
        // preserve both so the regular center isn't lost and the special center is also shown
        let primaryCenter = (match.centerName || std.centerName).trim();
        if (
          primaryCenter !== std.centerName.trim() &&
          primaryCenter.includes('เฉพาะกิจ') &&
          !std.centerName.includes('เฉพาะกิจ')
        ) {
          if (!mergedAdd.some((c) => areSameCenterName(c, primaryCenter))) {
            mergedAdd.push(primaryCenter);
          }
          primaryCenter = std.centerName.trim();
          updatedStdIds.add(std.id);
        }

        const dedupedAdd = deduplicateCenterList(mergedAdd, primaryCenter);
        if (
          dedupedAdd.length !== (match.additionalCenters || []).length ||
          dedupedAdd.some((c, i) => c !== (match.additionalCenters || [])[i])
        ) {
          updatedStdIds.add(std.id);
        }

        result.push({
          ...std,
          ...match,
          name: safeName,
          centerName: primaryCenter,
          additionalCenters: dedupedAdd,
        });
      } else {
        result.push({ ...std, additionalCenters: [...(std.additionalCenters || [])] });
      }
      seenIds.add(std.id);
    }

    // Helper to find provincial office for a center name (including Wat Pom Wichian -> Samut Sakhon)
    const findProvincialOfficeForCenter = (centerText: string, officeText = '') => {
      if (centerText.includes('วัดป้อมวิเชียร') || centerText.includes('ป้อมวิเชียร')) {
        return result.find((o) => o.id === 'samutsakhon');
      }
      return result.find((o) => {
        if (o.id === 'central_foreign_workers') return false;
        const shortProv = o.name
          .replace('สำนักงานจัดหางานจังหวัด', '')
          .replace('สำนักงานจัดหางาน', '')
          .trim();
        return (
          shortProv.length >= 2 &&
          (centerText.includes(shortProv) || officeText.includes(shortProv))
        );
      });
    };

    // 2. Any custom entry that was added by Admin: attach its centerName to the appropriate EmploymentOffice
    for (const custom of cleanInput) {
      if (seenIds.has(custom.id)) continue;
      if (deletedIds.has(custom.id) && !custom.id.startsWith('office_')) continue;

      const cName = (custom.centerName || custom.name || '').trim();
      const rawOfficeName = (custom.name || '').trim();

      // Find matching parent EmploymentOffice
      let parentOffice =
        findProvincialOfficeForCenter(cName, rawOfficeName) ||
        result.find((o) => o.name === rawOfficeName) ||
        result.find((o) => o.id === 'central_foreign_workers') ||
        result[0];

      if (parentOffice && cName) {
        const nextAdd = deduplicateCenterList(
          [
            ...(parentOffice.additionalCenters || []),
            cName,
            ...(custom.additionalCenters || []),
          ],
          parentOffice.centerName
        );
        if (
          nextAdd.length !== (parentOffice.additionalCenters || []).length ||
          nextAdd.some((c, i) => c !== (parentOffice.additionalCenters || [])[i])
        ) {
          parentOffice.additionalCenters = nextAdd;
          updatedStdIds.add(parentOffice.id);
        }
        bogusDocsToDelete.push(custom);
      }
      seenIds.add(custom.id);
    }

    // 3. Cross-office deduplication: if a center in central_foreign_workers belongs to a province
    // (like วัดป้อมวิเชียร -> สมุทรสาคร) or already exists in a provincial office, unify into 1 entry
    const centralOffice = result.find((o) => o.id === 'central_foreign_workers');
    if (centralOffice && centralOffice.additionalCenters && centralOffice.additionalCenters.length > 0) {
      const remainingCentralCenters: string[] = [];
      for (const cName of centralOffice.additionalCenters) {
        const matchedProvOffice =
          findProvincialOfficeForCenter(cName) ||
          result.find(
            (o) =>
              o.id !== 'central_foreign_workers' &&
              (areSameCenterName(o.centerName, cName) ||
                (o.additionalCenters || []).some((ac) => areSameCenterName(ac, cName)))
          );
        if (matchedProvOffice) {
          const mergedProvAdd = deduplicateCenterList(
            [...(matchedProvOffice.additionalCenters || []), cName],
            matchedProvOffice.centerName
          );
          if (
            mergedProvAdd.length !== (matchedProvOffice.additionalCenters || []).length ||
            mergedProvAdd.some((c, i) => c !== (matchedProvOffice.additionalCenters || [])[i])
          ) {
            matchedProvOffice.additionalCenters = mergedProvAdd;
            updatedStdIds.add(matchedProvOffice.id);
          }
          updatedStdIds.add(centralOffice.id);
        } else {
          remainingCentralCenters.push(cName);
        }
      }
      const dedupedCentral = deduplicateCenterList(
        remainingCentralCenters,
        centralOffice.centerName
      );
      if (dedupedCentral.length !== centralOffice.additionalCenters.length) {
        centralOffice.additionalCenters = dedupedCentral;
        updatedStdIds.add(centralOffice.id);
      }
    }

    const updatedStdToSave = result.filter((o) => updatedStdIds.has(o.id));
    return { merged: result, bogusDocsToDelete, updatedStdToSave };
  };

  // 2. Offices Database
  const [offices, setOffices] = useState<EmploymentOffice[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_OFFICES);
      const savedDeletedRaw = localStorage.getItem(STORAGE_KEY_DELETED_OFFICES);
      const parsedDeleted: EmploymentOffice[] = savedDeletedRaw
        ? JSON.parse(savedDeletedRaw) || []
        : [];
      const deletedIdSet = new Set<string>(
        parsedDeleted.filter((d) => d && d.id && !d.id.startsWith('office_')).map((d) => d.id)
      );
      const rescuedCustom = parsedDeleted.filter((d) => d && d.id && d.id.startsWith('office_'));
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return normalizeOfficesAndCenters([...parsed, ...rescuedCustom], deletedIdSet).merged;
        }
      } else if (rescuedCustom.length > 0) {
        return normalizeOfficesAndCenters([...EMPLOYMENT_OFFICES, ...rescuedCustom], deletedIdSet).merged;
      }
    } catch (e) {
      console.error('Failed to load offices from storage', e);
    }
    return EMPLOYMENT_OFFICES;
  });

  const normalizeCategoriesList = (list: ReportCategory[]): ReportCategory[] => {
    const orderMap = new Map(DEFAULT_CATEGORIES.map((c, idx) => [c.id, idx]));
    // If both section59 and cat_1791818621214 exist and section59 is placed before cat_1791818621214,
    // restore the official 1–8 order
    const idxCat1 = list.findIndex((c) => c.id === 'cat_1791818621214');
    const idxSec59 = list.findIndex((c) => c.id === 'section59');
    if (idxCat1 > 0 && idxSec59 >= 0 && idxSec59 < idxCat1) {
      return [...list].sort((a, b) => {
        const oa = orderMap.get(a.id) ?? 999;
        const ob = orderMap.get(b.id) ?? 999;
        if (oa !== ob) return oa - ob;
        return a.id.localeCompare(b.id);
      });
    }
    return list;
  };

  // 3. Categories / Sections Database (กลุ่มมาตรา)
  const [categories, setCategories] = useState<ReportCategory[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CATEGORIES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return normalizeCategoriesList(parsed);
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
    createEmptyReportTemplate()
  );
  const [livePreviewReport, setLivePreviewReport] = useState<DOEReport>(() =>
    createEmptyReportTemplate()
  );

  // Modals
  const [isPosterModalOpen, setIsPosterModalOpen] = useState(false);
  const [isLineModalOpen, setIsLineModalOpen] = useState(false);
  const [modalTargetReport, setModalTargetReport] = useState<DOEReport>(() =>
    reports[0] || createEmptyReportTemplate()
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

  const deletedOfficeIdsRef = useRef<Set<string>>(
    new Set(deletedOffices.map((o) => o.id))
  );

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
        // 0. Hydrate from Unlimited Browser IndexedDB immediately so even if localStorage or Firestore quota is full, 100% of reports appear
        loadReportsFromIndexedDB()
          .then((idbReports) => {
            if (idbReports && idbReports.length > 0) {
              setReports((prev) => {
                const delIds = hasLoadedDeletedReportsRef.current
                  ? deletedReportIdsRef.current
                  : new Set<string>();
                const map = new Map<string, DOEReport>();
                prev.forEach((r) => {
                  if (r && r.id && !delIds.has(r.id)) {
                    map.set(r.id, pickNewerReport(map.get(r.id), r));
                  }
                });
                idbReports.forEach((r) => {
                  if (r && r.id && !delIds.has(r.id)) {
                    map.set(r.id, pickNewerReport(map.get(r.id), r));
                  }
                });
                return Array.from(map.values()).sort((a, b) =>
                  (b.reportDate || '').localeCompare(a.reportDate || '')
                );
              });
            }
          })
          .catch(() => {});

        // 1. Subscribe to deleted reports (trash) first so deletedReportIdsRef stays authoritative
        const unsubDelReports = subscribeDeletedReports((onlineDel) => {
          if (!Array.isArray(onlineDel)) return;
          const cleanDel = sanitizeReportList(onlineDel);
          const delIdSet = new Set(cleanDel.map((r) => r.id));
          deletedReportIdsRef.current = delIdSet;
          hasLoadedDeletedReportsRef.current = true;
          setDeletedReports(cleanDel);
          if (delIdSet.size === 0) {
            try {
              localStorage.setItem(STORAGE_KEY_DELETED_REPORTS, '[]');
            } catch {}
          }

          setReports((prev) => {
            const filtered = delIdSet.size > 0 ? prev.filter((r) => !delIdSet.has(r.id)) : prev;
            // If online reports already arrived, push any local reports missing from Firestore
            if (hasReceivedOnlineReportsRef.current) {
              const onlineIds = latestOnlineReportIdsRef.current;
              const toUpload = filtered.filter(
                (r) =>
                  !onlineIds.has(r.id) &&
                  !delIdSet.has(r.id) &&
                  !uploadedLocalReportIdsRef.current.has(r.id)
              );
              if (toUpload.length > 0) {
                toUpload.forEach((r) => {
                  uploadedLocalReportIdsRef.current.add(r.id);
                });
                saveBulkReportsOnline(toUpload, true, false)
                  .then(() => {
                    toUpload.forEach((r) => pendingSaveReportIdsRef.current.delete(r.id));
                    persistUnsyncedIds();
                  })
                  .catch(console.warn);
              }
            }
            return filtered.length === prev.length ? prev : filtered;
          });

          if (delIdSet.size > 0) {
            try {
              const backupRaw = localStorage.getItem(STORAGE_KEY_REPORTS_BACKUP);
              if (backupRaw) {
                const parsedBackup = sanitizeReportList(JSON.parse(backupRaw));
                const cleanedBackup = parsedBackup.filter((r) => !delIdSet.has(r.id));
                localStorage.setItem(STORAGE_KEY_REPORTS_BACKUP, JSON.stringify(cleanedBackup));
              }
            } catch {}
          }
        });
        unsubs.push(unsubDelReports);

        // 1.5 Automatically run silent multi-source deep scan on startup (Cloud SQL + Google Sheets + Firestore + IndexedDB)
        // so all reports appear automatically without the user ever needing to click the manual Scan button
        deepScanAndRecoverAllReports([], false)
          .then((autoScan) => {
            if (autoScan && autoScan.mergedReports && autoScan.mergedReports.length > 0) {
              setReports((prev) => {
                const delIds = hasLoadedDeletedReportsRef.current
                  ? deletedReportIdsRef.current
                  : new Set<string>();
                const mergedMap = new Map<string, DOEReport>();
                prev.forEach((r) => {
                  if (r && r.id && !delIds.has(r.id)) {
                    mergedMap.set(r.id, pickNewerReport(mergedMap.get(r.id), r));
                  }
                });
                autoScan.mergedReports.forEach((r) => {
                  if (r && r.id && !delIds.has(r.id)) {
                    mergedMap.set(r.id, pickNewerReport(mergedMap.get(r.id), r));
                  }
                });
                return Array.from(mergedMap.values()).sort((a, b) =>
                  (b.reportDate || '').localeCompare(a.reportDate || '')
                );
              });
            }
          })
          .catch(() => {});

        // 2. Subscribe to online reports immediately (Realtime push via onSnapshot)
        const unsubReports = subscribeReports((onlineReports, isFromCache) => {
          if (!Array.isArray(onlineReports)) return;
          setIsFirestoreOnline(true);
          const rawOnline = sanitizeReportList(onlineReports);
          const delIds = hasLoadedDeletedReportsRef.current
            ? deletedReportIdsRef.current
            : new Set<string>();

          const cleanOnline = rawOnline.filter((r) => !delIds.has(r.id));

          const onlineMap = new Map<string, DOEReport>();
          cleanOnline.forEach((r) => onlineMap.set(r.id, pickNewerReport(onlineMap.get(r.id), r)));
          const onlineIds = new Set(onlineMap.keys());
          if (!isFromCache) {
            latestOnlineReportIdsRef.current = onlineIds;
            hasReceivedOnlineReportsRef.current = true;
          }

          setReports((prevLocal) => {
            const cleanPrev = sanitizeReportList(prevLocal).filter((r) => !delIds.has(r.id));
            const localMap = new Map<string, DOEReport>();
            cleanPrev.forEach((r) => localMap.set(r.id, pickNewerReport(localMap.get(r.id), r)));

            if (!isFromCache) {
              // Clear pending flag for any report that has now arrived on the server with an equal-or-newer timestamp
              let unsyncedChanged = false;
              cleanOnline.forEach((r) => {
                const localVer = localMap.get(r.id);
                if (!localVer || !isReportStrictlyNewer(localVer, r)) {
                  if (pendingSaveReportIdsRef.current.delete(r.id)) {
                    unsyncedChanged = true;
                  }
                }
              });
              if (unsyncedChanged) {
                persistUnsyncedIds();
              }

              // Upload ANY non-deleted local report that is missing from Cloud Firestore (!onlineVer)
              // OR has a strictly newer timestamp than the online copy so Dev and Deployed Web always match 100%
              const pendingUnsynced = cleanPrev.filter((r) => {
                if (delIds.has(r.id) || uploadedLocalReportIdsRef.current.has(r.id)) return false;
                const onlineVer = onlineMap.get(r.id);
                if (!onlineVer) {
                  return true;
                }
                if (isReportStrictlyNewer(r, onlineVer)) {
                  return true;
                }
                return false;
              });

              if (pendingUnsynced.length > 0) {
                pendingUnsynced.forEach((r) => {
                  uploadedLocalReportIdsRef.current.add(r.id);
                });
                saveBulkReportsOnline(pendingUnsynced, true, false)
                  .then(() => {
                    pendingUnsynced.forEach((r) => pendingSaveReportIdsRef.current.delete(r.id));
                    persistUnsyncedIds();
                  })
                  .catch(console.warn);
              }
            }

            // Merge online reports with non-deleted local reports by newest timestamp so newer evening edits always win
            const mergedMap = new Map<string, DOEReport>();
            cleanPrev.forEach((r) => {
              if (!delIds.has(r.id)) {
                mergedMap.set(r.id, pickNewerReport(mergedMap.get(r.id), r));
              }
            });
            cleanOnline.forEach((r) => {
              if (!delIds.has(r.id)) {
                mergedMap.set(r.id, pickNewerReport(mergedMap.get(r.id), r));
              }
            });

            const merged = Array.from(mergedMap.values()).sort((a, b) =>
              (b.reportDate || '').localeCompare(a.reportDate || '')
            );
            return merged;
          });
        });
        unsubs.push(unsubReports);

        // 3. Subscribe to deleted offices (trash) first so deletedOfficeIdsRef is up to date
        const unsubDelOffices = subscribeDeletedOffices((onlineDelOffices) => {
          if (Array.isArray(onlineDelOffices)) {
            const actualDel = onlineDelOffices.filter(
              (o) => o && o.id && !o.id.startsWith('office_')
            );
            const rescuedCustom = onlineDelOffices.filter(
              (o) => o && o.id && o.id.startsWith('office_')
            );
            const delSet = new Set(actualDel.map((o) => o.id));
            deletedOfficeIdsRef.current = delSet;
            setDeletedOffices(actualDel);
            setOffices((prev) => {
              const filtered = delSet.size > 0 ? prev.filter((o) => !delSet.has(o.id)) : prev;
              if (rescuedCustom.length > 0) {
                return normalizeOfficesAndCenters([...filtered, ...rescuedCustom], delSet).merged;
              }
              return filtered;
            });
          }
        });
        unsubs.push(unsubDelOffices);

        // 3.1 Subscribe to online offices (real-time merge of base offices + local & online admin edits)
        const unsubOffices = subscribeOffices((onlineOffices) => {
          if (Array.isArray(onlineOffices)) {
            let combinedInput = onlineOffices;
            try {
              const savedLocalRaw = localStorage.getItem(STORAGE_KEY_OFFICES);
              const savedDelRaw = localStorage.getItem(STORAGE_KEY_DELETED_OFFICES);
              const rescuedLocal = savedDelRaw
                ? (JSON.parse(savedDelRaw) || []).filter(
                    (d: EmploymentOffice) => d && d.id && d.id.startsWith('office_')
                  )
                : [];
              if (savedLocalRaw) {
                const parsedLocal = JSON.parse(savedLocalRaw);
                if (Array.isArray(parsedLocal)) {
                  const byId = new Map<string, EmploymentOffice>();
                  parsedLocal.forEach((o: EmploymentOffice) => {
                    if (o && o.id) byId.set(o.id, o);
                  });
                  onlineOffices.forEach((o: EmploymentOffice) => {
                    if (o && o.id) {
                      const prev = byId.get(o.id);
                      const mergedCenter = o.centerName || prev?.centerName || '';
                      const mergedAdd = deduplicateCenterList(
                        [
                          ...(prev?.additionalCenters || []),
                          ...(o.additionalCenters || []),
                        ],
                        mergedCenter
                      );
                      byId.set(o.id, { ...prev, ...o, centerName: mergedCenter, additionalCenters: mergedAdd });
                    }
                  });
                  rescuedLocal.forEach((o: EmploymentOffice) => {
                    if (o && o.id && !byId.has(o.id)) byId.set(o.id, o);
                  });
                  combinedInput = Array.from(byId.values());
                }
              } else if (rescuedLocal.length > 0) {
                combinedInput = [...onlineOffices, ...rescuedLocal];
              }
            } catch {}

            const { merged, updatedStdToSave } =
              normalizeOfficesAndCenters(combinedInput, deletedOfficeIdsRef.current);
            setOffices(merged);

            // Check if any customized office or additionalCenters in merged is not yet saved in onlineOffices
            const onlineMap = new Map(onlineOffices.map((o) => [o.id, o]));
            const stdMap = new Map(EMPLOYMENT_OFFICES.map((o) => [o.id, o]));
            const hasUnsyncedCustomOffices =
              updatedStdToSave.length > 0 ||
              merged.some((m) => {
                const std = stdMap.get(m.id);
                const stdAdd = deduplicateCenterList(
                  std?.additionalCenters || [],
                  std?.centerName
                );
                const mAdd = deduplicateCenterList(
                  m.additionalCenters || [],
                  m.centerName
                );
                const isCustom =
                  !std ||
                  m.name !== std.name ||
                  m.centerName !== std.centerName ||
                  JSON.stringify(mAdd) !== JSON.stringify(stdAdd);
                if (!isCustom) return false;
                const onl = onlineMap.get(m.id);
                if (!onl) return true;
                const onlAdd = deduplicateCenterList(
                  onl.additionalCenters || [],
                  onl.centerName
                );
                return (
                  onl.name !== m.name ||
                  onl.centerName !== m.centerName ||
                  JSON.stringify(onlAdd) !== JSON.stringify(mAdd)
                );
              });

            if (hasUnsyncedCustomOffices) {
              saveAllOfficesOnline(merged).catch(console.warn);
            }

            // Also keep currentReport & livePreviewReport synced if the active office's name/center was updated
            setCurrentReport((prev) => {
              const matched = merged.find((o) => o.id === prev.officeId);
              if (!matched) return prev;
              const isMob =
                prev.centerName?.includes('Mobile Unit') ||
                prev.centerName?.includes('เคลื่อนที่');
              const validCenters = [
                matched.centerName,
                ...(matched.additionalCenters || []),
              ].filter(Boolean);
              const nextCenter = isMob
                ? prev.centerName
                : validCenters.includes(prev.centerName)
                ? prev.centerName
                : matched.centerName;
              if (
                prev.officeName === matched.name &&
                prev.region === matched.region &&
                prev.centerName === nextCenter
              ) {
                return prev;
              }
              return {
                ...prev,
                officeName: matched.name,
                officeNameEn: matched.nameEn || matched.name,
                region: matched.region,
                centerName: nextCenter,
              };
            });

            setLivePreviewReport((prev) => {
              const matched = merged.find((o) => o.id === prev.officeId);
              if (!matched) return prev;
              const isMob =
                prev.centerName?.includes('Mobile Unit') ||
                prev.centerName?.includes('เคลื่อนที่');
              const validCenters = [
                matched.centerName,
                ...(matched.additionalCenters || []),
              ].filter(Boolean);
              const nextCenter = isMob
                ? prev.centerName
                : validCenters.includes(prev.centerName)
                ? prev.centerName
                : matched.centerName;
              if (
                prev.officeName === matched.name &&
                prev.region === matched.region &&
                prev.centerName === nextCenter
              ) {
                return prev;
              }
              return {
                ...prev,
                officeName: matched.name,
                officeNameEn: matched.nameEn || matched.name,
                region: matched.region,
                centerName: nextCenter,
              };
            });
          }
        });
        unsubs.push(unsubOffices);

        // 4. Subscribe to categories
        const unsubCats = subscribeCategories((onlineCats) => {
          if (onlineCats && onlineCats.length > 0) {
            setCategories(normalizeCategoriesList(onlineCats));
          }
        });
        unsubs.push(unsubCats);

        // 4.1 Subscribe to queue metrics
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

        // 5. Subscribe to reporters
        const unsubReps = subscribeReporters((onlineReps) => {
          if (onlineReps && onlineReps.length > 0) {
            setReporters(onlineReps);
          }
        });
        unsubs.push(unsubReps);

        // 6. Subscribe to system config
        const unsubConfig = subscribeSystemConfig((onlineConfig) => {
          if (onlineConfig && onlineConfig.reportTitle) {
            setSystemConfig(onlineConfig);
          }
        });
        unsubs.push(unsubConfig);

        // Run connection verification & initial seed check in parallel without blocking UI stream
        const [isConnected] = await Promise.all([
          testConnection(),
          initializeFirestoreIfEmpty(),
        ]);
        if (isConnected) {
          setIsFirestoreOnline(true);
        }
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

  const safeSetLocalStorage = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      try {
        // Free up duplicate backup keys if browser 5MB localStorage quota is full
        localStorage.removeItem('doe_ss_reports_backup_v1');
        localStorage.removeItem('doe_ss_reports_v1');
        if (key !== STORAGE_KEY_REPORTS_BACKUP) {
          localStorage.removeItem(STORAGE_KEY_REPORTS_BACKUP);
        }
        localStorage.setItem(key, value);
      } catch (retryErr) {
        console.warn(`Skipped localStorage caching for ${key} (quota exceeded):`, retryErr);
      }
    }
  };

  // Persist Databases to IndexedDB (unlimited capacity) and localStorage (respecting 5MB UTF-16 quota)
  useEffect(() => {
    try {
      const delIds = deletedReportIdsRef.current;
      const activeClean = reports.filter((r) => !delIds.has(r.id));
      if (activeClean.length > 0) {
        saveReportsToIndexedDB(activeClean).catch(() => {});
      }

      const serializedActive = JSON.stringify(activeClean);
      // Free up secondary backup key first if payload exceeds 600k chars (~1.2MB UTF-16) so primary localStorage never hits 5MB quota
      if (serializedActive.length >= 600_000) {
        localStorage.removeItem(STORAGE_KEY_REPORTS_BACKUP);
      }
      safeSetLocalStorage(STORAGE_KEY_REPORTS, serializedActive);

      if (serializedActive.length < 600_000) {
        const existingBackupRaw = localStorage.getItem(STORAGE_KEY_REPORTS_BACKUP);
        let backupList: DOEReport[] = [];
        if (existingBackupRaw) {
          const parsed = JSON.parse(existingBackupRaw);
          if (Array.isArray(parsed)) backupList = parsed;
        }
        const map = new Map<string, DOEReport>();
        backupList.forEach((r) => {
          if (r && r.id && !delIds.has(r.id)) {
            map.set(r.id, r);
          }
        });
        activeClean.forEach((r) => {
          if (r && r.id && !delIds.has(r.id)) {
            map.set(r.id, r);
          }
        });
        const mergedBackup = Array.from(map.values()).sort((a, b) =>
          (b.reportDate || '').localeCompare(a.reportDate || '')
        );
        safeSetLocalStorage(STORAGE_KEY_REPORTS_BACKUP, JSON.stringify(mergedBackup));
      }
    } catch (e) {
      console.error('Failed to persist reports', e);
    }
  }, [reports]);

  // Ensure any non-Mobile-Unit centerName used in existing reports is also included in its parent office's centers
  useEffect(() => {
    if (!reports || reports.length === 0) return;
    setOffices((prevOffices) => {
      let changed = false;
      const nextOffices = prevOffices.map((o) => ({
        ...o,
        additionalCenters: [...(o.additionalCenters || [])],
      }));

      for (const r of reports) {
        const cName = (r.centerName || '').trim();
        if (
          !cName ||
          cName.includes('Mobile Unit') ||
          cName.includes('หน่วยบริการเคลื่อนที่')
        ) {
          continue;
        }
        const target =
          (cName.includes('วัดป้อมวิเชียร') || cName.includes('ป้อมวิเชียร')
            ? nextOffices.find((o) => o.id === 'samutsakhon')
            : undefined) ||
          nextOffices.find((o) => o.id === r.officeId) ||
          nextOffices.find((o) => o.name === r.officeName);
        if (target) {
          const allKnown = [target.centerName, ...(target.additionalCenters || [])].map((c) =>
            (c || '').trim()
          );
          if (!allKnown.some((existing) => areSameCenterName(existing, cName))) {
            target.additionalCenters = deduplicateCenterList(
              [...(target.additionalCenters || []), cName],
              target.centerName
            );
            changed = true;
          }
        }
      }
      if (changed) {
        saveAllOfficesOnline(nextOffices).catch(console.warn);
      }
      return changed ? nextOffices : prevOffices;
    });
  }, [reports]);

  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEY_OFFICES, JSON.stringify(offices));
  }, [offices]);

  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEY_DELETED_OFFICES, JSON.stringify(deletedOffices));
  }, [deletedOffices]);

  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEY_DELETED_REPORTS, JSON.stringify(deletedReports));
  }, [deletedReports]);

  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEY_CATEGORIES, JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEY_REPORTERS, JSON.stringify(reporters));
  }, [reporters]);

  useEffect(() => {
    safeSetLocalStorage(STORAGE_KEY_CONFIG, JSON.stringify(systemConfig));
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
      removed.forEach((r) => deletedOfficeIdsRef.current.add(r.id));
      setDeletedOffices((prev) => [...removed, ...prev.filter((d) => !removed.some((r) => r.id === d.id))]);
      removed.forEach((o) => deleteOfficeOnline(o).catch(console.warn));
    }

    // Only write newly added or modified offices to Firestore
    const addedOffices = updatedOffices.filter((u) => !offices.some((o) => o.id === u.id));
    const changedOrAdded = updatedOffices.filter((u) => {
      const prev = offices.find((o) => o.id === u.id);
      return !prev || JSON.stringify(prev) !== JSON.stringify(u);
    });
    changedOrAdded.forEach((o) => {
      deletedOfficeIdsRef.current.delete(o.id);
      saveOfficeOnline(o).catch(console.warn);
    });
    setOffices(updatedOffices);

    // Sync currentReport & livePreviewReport if a new office was added or current office was edited
    if (addedOffices.length === 1 && !isEditingExistingReport) {
      const newOff = addedOffices[0];
      setCurrentReport((prev) => ({
        ...prev,
        officeId: newOff.id,
        officeName: newOff.name,
        officeNameEn: newOff.nameEn || newOff.name,
        centerName: newOff.centerName,
        region: newOff.region,
      }));
      setLivePreviewReport((prev) => ({
        ...prev,
        officeId: newOff.id,
        officeName: newOff.name,
        officeNameEn: newOff.nameEn || newOff.name,
        centerName: newOff.centerName,
        region: newOff.region,
      }));
    } else {
      const matchedCurrent = updatedOffices.find((u) => u.id === currentReport.officeId);
      if (matchedCurrent) {
        setCurrentReport((prev) => ({
          ...prev,
          officeName: matchedCurrent.name,
          officeNameEn: matchedCurrent.nameEn || matchedCurrent.name,
          centerName: matchedCurrent.centerName,
          region: matchedCurrent.region,
        }));
        setLivePreviewReport((prev) => ({
          ...prev,
          officeName: matchedCurrent.name,
          officeNameEn: matchedCurrent.nameEn || matchedCurrent.name,
          centerName: matchedCurrent.centerName,
          region: matchedCurrent.region,
        }));
      }
    }
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
    deletedReportIdsRef.current.delete(target.id);
    pendingSaveReportIdsRef.current.add(target.id);
    setReports((prev) => [target, ...prev.filter((r) => r.id !== target.id)]);
    setDeletedReports((prev) => prev.filter((r) => r.id !== target.id));
    restoreReportOnline(target)
      .then(() => {
        pendingSaveReportIdsRef.current.delete(target.id);
      })
      .catch(console.warn);
    showToast(`กู้คืนรายงานของ "${target.officeName}" สำเร็จ!`);
  };

  const handleRestoreAllDeletedReports = () => {
    if (deletedReports.length === 0) return;
    const count = deletedReports.length;
    deletedReports.forEach((r) => {
      deletedReportIdsRef.current.delete(r.id);
      pendingSaveReportIdsRef.current.add(r.id);
      restoreReportOnline(r)
        .then(() => {
          pendingSaveReportIdsRef.current.delete(r.id);
        })
        .catch(console.warn);
    });
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
    safeSetLocalStorage(STORAGE_KEY_QUEUE_METRICS, JSON.stringify(updatedMetrics));
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
    queueMetrics?: QueueMetricCategory[];
    reporters?: ReporterProfile[];
    systemConfig?: SystemConfig;
    reports?: DOEReport[];
  }) => {
    let restoredOffices: EmploymentOffice[] | null = null;
    let restoredCats: ReportCategory[] | null = null;
    let restoredQm: QueueMetricCategory[] | null = null;
    let restoredReporters: ReporterProfile[] | null = null;
    let restoredConfig: SystemConfig | null = null;
    let restoredReports: DOEReport[] | null = null;

    if (data.offices && Array.isArray(data.offices)) {
      deletedOfficeIdsRef.current.clear();
      setDeletedOffices([]);
      safeSetLocalStorage(STORAGE_KEY_DELETED_OFFICES, '[]');
      const { merged } = normalizeOfficesAndCenters(
        data.offices,
        deletedOfficeIdsRef.current
      );
      restoredOffices = merged;
      setOffices(merged);
      safeSetLocalStorage(STORAGE_KEY_OFFICES, JSON.stringify(merged));
    }
    if (data.categories && Array.isArray(data.categories)) {
      const normalizedCats = normalizeCategoriesList(data.categories);
      restoredCats = normalizedCats;
      setCategories(normalizedCats);
      safeSetLocalStorage(STORAGE_KEY_CATEGORIES, JSON.stringify(normalizedCats));
    }
    if (data.queueMetrics && Array.isArray(data.queueMetrics)) {
      const normalizedQm = normalizeQueueMetricsList(data.queueMetrics);
      restoredQm = normalizedQm;
      setQueueMetrics(normalizedQm);
      safeSetLocalStorage(STORAGE_KEY_QUEUE_METRICS, JSON.stringify(normalizedQm));
    }
    if (data.reporters && Array.isArray(data.reporters)) {
      restoredReporters = data.reporters;
      setReporters(data.reporters);
      safeSetLocalStorage(STORAGE_KEY_REPORTERS, JSON.stringify(data.reporters));
    }
    if (data.systemConfig) {
      restoredConfig = data.systemConfig;
      setSystemConfig(data.systemConfig);
      safeSetLocalStorage(STORAGE_KEY_CONFIG, JSON.stringify(data.systemConfig));
    }
    if (data.reports && Array.isArray(data.reports)) {
      // Smart Merge: preserve existing reports (such as newer reports on Nov 2-3) while merging all valid reports from the backup JSON by newest timestamp
      const byId = new Map<string, DOEReport>();
      for (const existingItem of reports) {
        const cleanExisting = sanitizeReportList([existingItem])[0];
        if (cleanExisting && !deletedReportIdsRef.current.has(cleanExisting.id)) {
          byId.set(cleanExisting.id, cleanExisting);
        }
      }
      for (const rawItem of data.reports) {
        const clean = sanitizeReportList([rawItem])[0];
        if (clean) {
          byId.set(clean.id, pickNewerReport(byId.get(clean.id), clean));
        }
      }
      const normalizedReports = Array.from(byId.values()).sort((a, b) =>
        (b.reportDate || '').localeCompare(a.reportDate || '')
      );

      // Clear all deleted report tracking so no restored report is filtered out or purged
      deletedReportIdsRef.current.clear();
      setDeletedReports([]);
      safeSetLocalStorage(STORAGE_KEY_DELETED_REPORTS, '[]');

      normalizedReports.forEach((r) => {
        pendingSaveReportIdsRef.current.add(r.id);
        uploadedLocalReportIdsRef.current.add(r.id);
      });
      persistUnsyncedIds();
      restoredReports = normalizedReports;
      setReports(normalizedReports);
      const serialized = JSON.stringify(normalizedReports);
      safeSetLocalStorage(STORAGE_KEY_REPORTS, serialized);
      if (normalizedReports.length > 0) {
        setCurrentReport(normalizedReports[0]);
        setLivePreviewReport(normalizedReports[0]);
      }
    }

    // Sync to Cloud Firestore asynchronously in balanced 24 shards so UI never blocks
    setIsSyncing(true);
    setTimeout(async () => {
      try {
        if (restoredOffices) {
          await saveAllOfficesOnline(restoredOffices).catch(console.warn);
        }
        if (restoredCats) {
          await saveAllCategoriesOnline(restoredCats).catch(console.warn);
        }
        if (restoredQm) {
          await saveAllQueueMetricsOnline(restoredQm).catch(console.warn);
        }
        if (restoredReporters) {
          await saveAllReportersOnline(restoredReporters).catch(console.warn);
        }
        if (restoredConfig) {
          await saveSystemConfigOnline(restoredConfig).catch(console.warn);
        }
        if (restoredReports && restoredReports.length > 0) {
          const toSync = restoredReports;
          await saveBulkReportsOnline(toSync, true, false);
          toSync.forEach((r) => pendingSaveReportIdsRef.current.delete(r.id));
          persistUnsyncedIds();
          showToast(
            `ซิงก์ฐานข้อมูลขึ้น Cloud Firestore สำเร็จครบถ้วน (${toSync.length.toLocaleString()} รายงาน)`
          );
        }
      } catch (err) {
        console.warn('Error syncing restored database to Firestore:', err);
      } finally {
        setIsSyncing(false);
      }
    }, 50);
  };

  const handleResetFactoryDefaults = () => {
    localStorage.removeItem(STORAGE_KEY_REPORTS);
    localStorage.removeItem(STORAGE_KEY_REPORTS_BACKUP);
    localStorage.removeItem(STORAGE_KEY_OFFICES);
    localStorage.removeItem(STORAGE_KEY_CATEGORIES);
    localStorage.removeItem(STORAGE_KEY_REPORTERS);
    localStorage.removeItem(STORAGE_KEY_CONFIG);

    pendingSaveReportIdsRef.current.clear();
    setReports([]);
    setOffices(EMPLOYMENT_OFFICES);
    setCategories(DEFAULT_CATEGORIES);
    setReporters(DEFAULT_REPORTERS);
    setSystemConfig(DEFAULT_SYSTEM_CONFIG);

    saveAllCategoriesOnline(DEFAULT_CATEGORIES).catch(console.warn);
    saveAllReportersOnline(DEFAULT_REPORTERS).catch(console.warn);
    saveSystemConfigOnline(DEFAULT_SYSTEM_CONFIG).catch(console.warn);

    const emptyReport = createEmptyReportTemplate();
    setCurrentReport(emptyReport);
    setLivePreviewReport(emptyReport);
    showToast('รีเซ็ตระบบและฐานข้อมูลเป็นค่าเริ่มต้นทางการของ DOE เรียบร้อย');
  };

  // ล้างประวัติการรายงานและหมายเหตุทั้งหมดเพื่อนำระบบขึ้นใช้งานจริง (Production Clear All)
  const handleClearAllReportsForProduction = async () => {
    try {
      const previousReports = [...reports];
      if (previousReports.length > 0) {
        previousReports.forEach((r) => {
          if (r && r.id) {
            deletedReportIdsRef.current.add(r.id);
            pendingSaveReportIdsRef.current.delete(r.id);
          }
        });
        setDeletedReports((prev) => {
          const map = new Map<string, DOEReport>();
          prev.forEach((r) => map.set(r.id, r));
          previousReports.forEach((r) => map.set(r.id, r));
          return Array.from(map.values());
        });
      }

      setReports([]);
      safeSetLocalStorage(STORAGE_KEY_REPORTS, '[]');
      safeSetLocalStorage(STORAGE_KEY_REPORTS_BACKUP, '[]');
      await clearAllReportsOnline();

      const emptyReport = createEmptyReportTemplate();
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

  // สแกนเชิงลึกและกู้คืนรายงานจากทุกแหล่ง (Cloud Firestore report_bundles, คอลเลกชัน reports รายฉบับ, ถังขยะ deleted_reports และ LocalStorage สำรอง)
  const handleDeepScanReports = async (
    includeTrash = true
  ): Promise<DeepScanDiagnosticResult> => {
    setIsSyncing(true);
    try {
      const scanResult = await deepScanAndRecoverAllReports(reports, includeTrash);
      if (scanResult.mergedReports.length > 0) {
        if (includeTrash) {
          deletedReportIdsRef.current.clear();
          setDeletedReports([]);
          safeSetLocalStorage(STORAGE_KEY_DELETED_REPORTS, '[]');
        }
        setReports(scanResult.mergedReports);
        safeSetLocalStorage(
          STORAGE_KEY_REPORTS,
          JSON.stringify(scanResult.mergedReports)
        );
      }
      if (scanResult.newlyRescuedCount > 0) {
        showToast(
          `กู้คืนรายงานที่ตกหล่นสำเร็จเพิ่มอีก ${scanResult.newlyRescuedCount.toLocaleString()} ฉบับ (รวมทั้งหมด ${scanResult.totalMergedCount.toLocaleString()} ฉบับ)`
        );
      } else {
        showToast(
          `สแกนตรวจสอบทุกแหล่งข้อมูลครบถ้วนแล้ว (พบรายงานรวม ${scanResult.totalMergedCount.toLocaleString()} ฉบับ)`
        );
      }
      return scanResult;
    } finally {
      setIsSyncing(false);
    }
  };

  // กู้คืนรายงานจาก Rolling Local Backup, ถังขยะ และคอลเลกชันสำรองบน Cloud Firestore
  const handleRestoreBackupReports = () => {
    handleDeepScanReports(true).catch((e) => {
      console.error('Failed to restore backup reports:', e);
      showToast('เกิดข้อผิดพลาดในการกู้คืนรายงานสำรอง');
    });
  };

  // ซิงก์รายงานทั้งหมดในเครื่องขึ้น Cloud Firestore
  const handleSyncAllReportsToOnline = () => {
    if (reports.length === 0) {
      showToast('ไม่มีรายการรายงานในเครื่องที่จะซิงก์ขึ้น Cloud Firestore');
      return;
    }
    setIsSyncing(true);
    saveBulkReportsOnline(reports, true, true)
      .then(() => {
        showToast(
          `ซิงก์รายงานทั้งหมด (${reports.length.toLocaleString()} ฉบับ) แบบ 24 Shards ขึ้นฐานข้อมูลออนไลน์เรียบร้อยแล้ว`
        );
      })
      .catch(console.warn)
      .finally(() => setIsSyncing(false));
  };

  // Save or update report
  const handleSaveReport = async (savedReport: DOEReport) => {
    let finalReport = { ...savedReport };
    const existingByIdIndex = reports.findIndex((r) => r.id === finalReport.id);

    const isMobileCenterStr = (c?: string) => {
      const lower = (c || '').toLowerCase();
      return lower.includes('mobile unit') || lower.includes('เคลื่อนที่');
    };

    // If not in edit mode and the user switched to a different office, date, or center/Mobile Unit after a previous save,
    // generate a fresh ID so it never overwrites the previous center's report
    if (
      !isEditingExistingReport &&
      existingByIdIndex >= 0 &&
      (reports[existingByIdIndex].officeId !== finalReport.officeId ||
        reports[existingByIdIndex].reportDate !== finalReport.reportDate ||
        (reports[existingByIdIndex].centerName || '').trim() !==
          (finalReport.centerName || '').trim())
    ) {
      finalReport = {
        ...finalReport,
        id: `report-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    // Ensure no duplicate report for the same office + date + center slot (1 per standard center name, 1 per Mobile Unit)
    const duplicateSameSlot = reports.find((r) => {
      if (r.id === finalReport.id) return false;
      const sameDate = r.reportDate === finalReport.reportDate;
      const sameOffice =
        r.officeId === finalReport.officeId ||
        (r.officeName || '').trim() === (finalReport.officeName || '').trim();
      if (!sameDate || !sameOffice) return false;
      const rIsMob = isMobileCenterStr(r.centerName);
      const finalIsMob = isMobileCenterStr(finalReport.centerName);
      if (rIsMob && finalIsMob) return true;
      if (!rIsMob && !finalIsMob) {
        return (r.centerName || '').trim() === (finalReport.centerName || '').trim();
      }
      return false;
    });

    if (duplicateSameSlot && !isEditingExistingReport) {
      finalReport = {
        ...finalReport,
        id: duplicateSameSlot.id,
        createdAt: duplicateSameSlot.createdAt || finalReport.createdAt,
        updatedAt: new Date().toISOString(),
      };
    }

    deletedReportIdsRef.current.delete(finalReport.id);
    pendingSaveReportIdsRef.current.add(finalReport.id);
    uploadedLocalReportIdsRef.current.delete(finalReport.id);
    persistUnsyncedIds();

    const targetIndex = reports.findIndex((r) => r.id === finalReport.id);
    let updatedList: DOEReport[];

    if (targetIndex >= 0) {
      updatedList = [...reports];
      updatedList[targetIndex] = finalReport;
    } else {
      updatedList = [finalReport, ...reports];
    }

    // 1. Immediately persist to IndexedDB & localStorage using quota-safe helper before async network call
    try {
      const delIds = deletedReportIdsRef.current;
      saveReportsToIndexedDB(updatedList).catch(() => {});
      const serializedUpdated = JSON.stringify(updatedList);
      if (serializedUpdated.length >= 600_000) {
        localStorage.removeItem(STORAGE_KEY_REPORTS_BACKUP);
      }
      safeSetLocalStorage(STORAGE_KEY_REPORTS, serializedUpdated);
      if (serializedUpdated.length < 600_000) {
        const existingBackupRaw = localStorage.getItem(STORAGE_KEY_REPORTS_BACKUP);
        const existingBackup: DOEReport[] = existingBackupRaw ? JSON.parse(existingBackupRaw) : [];
        const backupMap = new Map<string, DOEReport>();
        existingBackup.forEach((r) => {
          if (r && r.id && !delIds.has(r.id)) backupMap.set(r.id, pickNewerReport(backupMap.get(r.id), r));
        });
        updatedList.forEach((r) => {
          if (r && r.id && !delIds.has(r.id)) backupMap.set(r.id, pickNewerReport(backupMap.get(r.id), r));
        });
        safeSetLocalStorage(
          STORAGE_KEY_REPORTS_BACKUP,
          JSON.stringify(Array.from(backupMap.values()))
        );
      }
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
      pendingSaveReportIdsRef.current.delete(finalReport.id);
      persistUnsyncedIds();
      setIsFirestoreOnline(true);
      showToast(
        targetIndex >= 0
          ? `บันทึกการแก้ไขรายงาน "${finalReport.officeName}" ลงฐานข้อมูล Cloud Firestore สำเร็จ!`
          : `บันทึกรายงานใหม่ของ "${finalReport.officeName}" ลงฐานข้อมูล Cloud Firestore สำเร็จ!`
      );
    } catch (err) {
      console.error('Failed to save report online to Firestore:', err);
      showToast(
        `บันทึกรายงาน "${finalReport.officeName}" ลงเครื่องสำรองแล้ว (ระบบจะซิงก์ขึ้นฐานข้อมูลออนไลน์ให้อัตโนมัติทันทีที่เชื่อมต่อได้)`,
        '🔄 ลองซิงก์ใหม่',
        () => {
          saveReportOnline(finalReport)
            .then(() => {
              pendingSaveReportIdsRef.current.delete(finalReport.id);
              persistUnsyncedIds();
            })
            .catch(console.warn);
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

    // Mark as deleted immediately so no listener or backup can re-add it
    deletedReportIdsRef.current.add(target.id);
    pendingSaveReportIdsRef.current.delete(target.id);
    persistUnsyncedIds();

    const remaining = reports.filter((r) => r.id !== target.id);
    setReports(remaining);
    setDeletedReports((prev) => [target, ...prev.filter((r) => r.id !== target.id)]);

    // Immediately purge from IndexedDB and localStorage keys so page reloads or backups never resurrect it
    try {
      saveReportsToIndexedDB(remaining).catch(() => {});
      safeSetLocalStorage(STORAGE_KEY_REPORTS, JSON.stringify(remaining));
      const backupRaw = localStorage.getItem(STORAGE_KEY_REPORTS_BACKUP);
      if (backupRaw) {
        const parsedBackup = sanitizeReportList(JSON.parse(backupRaw));
        const cleanedBackup = parsedBackup.filter(
          (r) => r.id !== target.id && !deletedReportIdsRef.current.has(r.id)
        );
        safeSetLocalStorage(STORAGE_KEY_REPORTS_BACKUP, JSON.stringify(cleanedBackup));
      }
    } catch (e) {
      console.warn('Could not clean backup on delete:', e);
    }

    // Delete from online Firestore (moves to deleted_reports collection)
    deleteReportOnline(target).catch(console.warn);

    showToast(
      `ลบรายงานของ "${target.officeName}" ออกจากระบบและหน้าแดชบอร์ดเรียบร้อยแล้ว`,
      '↩️ กู้คืน (Undo)',
      () => handleRestoreDeletedReport(target.id)
    );
    if (modalTargetReport.id === target.id) {
      setIsPosterModalOpen(false);
      setIsLineModalOpen(false);
    }
    if (currentReport.id === target.id || livePreviewReport.id === target.id) {
      const blankReport = createEmptyReportTemplate();
      setCurrentReport(blankReport);
      setLivePreviewReport(blankReport);
      setIsEditingExistingReport(false);
    }
    setReportToDelete(null);
  };

  // Duplicate report
  const handleDuplicateReport = (report: DOEReport) => {
    const rawToday = getTodayIsoDate();
    const todayIso = rawToday < MIN_REPORT_ISO_DATE ? MIN_REPORT_ISO_DATE : rawToday;
    const cloned: DOEReport = {
      ...report,
      id: `report-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      reportDate: todayIso,
      reportDateThaiStr: formatThaiDateFull(todayIso),
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
    const targetOffice = preselectedOfficeId
      ? offices.find((o) => o.id === preselectedOfficeId)
      : undefined;

    const newReportTemplate = createEmptyReportTemplate(targetOffice);
    setCurrentReport(newReportTemplate);
    setLivePreviewReport(newReportTemplate);
    setActiveTab('form');
  };

  // Handle clearing current report form
  const handleClearCurrentReport = () => {
    setIsEditingExistingReport(false);
    const blank = createEmptyReportTemplate();
    setCurrentReport(blank);
    setLivePreviewReport(blank);
    showToast('ล้างข้อมูลในแบบฟอร์มเรียบร้อยแล้ว');
  };

  const [dashboardResetSignal, setDashboardResetSignal] = useState(0);

  // Switch tabs safely, ensuring form opens as a clean blank template if not editing
  const handleTabChange = (tab: ActiveTab) => {
    if (tab === 'form' && activeTab !== 'form') {
      if (!isEditingExistingReport) {
        const blank = createEmptyReportTemplate();
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
        <div className="fixed bottom-6 right-6 z-50 bg-white text-slate-800 px-4 py-3 rounded-xl shadow-xl border border-slate-200 ring-1 ring-slate-950/5 flex items-center gap-3 text-xs font-semibold animate-in slide-in-from-bottom duration-200 no-print">
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
                  reports={reports}
                  isEditingExistingReport={isEditingExistingReport}
                  onEditExistingReport={handleEditReport}
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
                  onUpdateOffices={handleUpdateOffices}
                  onUpdateCategories={handleUpdateCategories}
                  onUpdateQueueMetrics={handleUpdateQueueMetrics}
                  onNotify={showToast}
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
                    <div className="origin-top shrink-0" style={{ transform: 'scale(0.63)' }}>
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
            offices={offices}
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
            onNavigateTab={handleTabChange}
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
            onDeepScanReports={handleDeepScanReports}
            onNotify={showToast}
            onAdminAuthenticated={handleAdminAuthenticated}
            onAdminLoggedOut={() => setIsAdmin(false)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto bg-white/80 backdrop-blur-xs border-t border-slate-200/80 py-4 px-6 text-xs text-slate-500 shadow-2xs no-print">
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
