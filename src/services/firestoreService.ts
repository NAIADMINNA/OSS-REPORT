import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  DOEReport,
  EmploymentOffice,
  QueueMetricCategory,
  ReportCategory,
  ReporterProfile,
  SystemConfig,
  SystemIssueReport,
} from '../types/doe';
import { EMPLOYMENT_OFFICES } from '../data/offices';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_QUEUE_METRICS,
  DEFAULT_REPORTERS,
  DEFAULT_SYSTEM_CONFIG,
} from '../data/initialAdminData';
import { sanitizeReport } from '../utils/doeUtils';
import { deduplicateCenterList } from '../utils/officeUtils';

const REPORTS_COLLECTION = 'reports';
const REPORT_BUNDLES_COLLECTION = 'report_bundles';
const REPORT_SHARD_COUNT = 6;
const OFFICES_COLLECTION = 'offices';
const CATEGORIES_COLLECTION = 'categories';
const QUEUE_METRICS_COLLECTION = 'queue_metrics';
const REPORTERS_COLLECTION = 'reporters';
const CONFIG_COLLECTION = 'system_config';
const CONFIG_DOC_ID = 'main_config';
const DELETED_REPORTS_COLLECTION = 'deleted_reports';
const DELETED_OFFICES_COLLECTION = 'deleted_offices';
const ISSUES_COLLECTION = 'system_issues';

const CURRENT_MIGRATION_VERSION = 8;

let hasLoggedQuotaNotice = false;

export function isQuotaExceededError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || '');
  const code = (error as { code?: string })?.code || '';
  return (
    code === 'resource-exhausted' ||
    msg.includes('Quota limit exceeded') ||
    msg.includes('Quota exceeded')
  );
}

function logStreamStatus(streamName: string, error: unknown, onError?: (err: unknown) => void) {
  if (onError) onError(error);
  if (isQuotaExceededError(error)) {
    if (!hasLoggedQuotaNotice) {
      hasLoggedQuotaNotice = true;
      console.info(
        'ℹ️ Cloud Firestore daily free read quota reached. Operating seamlessly with LocalStorage cache until daily quota reset.'
      );
    }
    return;
  }
  console.warn(`Firestore ${streamName} stream status:`, error);
}

function cleanForFirestore<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, val) => (val === undefined ? null : val)));
}

// ============================================================================
// BUNDLED MASTER CONFIG DOCUMENT (system_config/main_config)
// ============================================================================

interface BundledMasterConfig extends SystemConfig {
  migrationVersion?: number;
  bundledOffices?: EmploymentOffice[];
  bundledDeletedOffices?: EmploymentOffice[];
  bundledCategories?: (ReportCategory & { sortOrder?: number })[];
  bundledQueueMetrics?: (QueueMetricCategory & { sortOrder?: number })[];
  bundledReporters?: (ReporterProfile & { sortOrder?: number })[];
  bundledDeletedReports?: DOEReport[];
  bundledIssues?: SystemIssueReport[];
  updatedAt?: string;
}

const stdOfficeMap = new Map<string, EmploymentOffice>(
  EMPLOYMENT_OFFICES.map((o) => [o.id, o])
);

function isOfficeCustomized(office: EmploymentOffice): boolean {
  const std = stdOfficeMap.get(office.id);
  if (!std) return true;
  if (office.additionalCenters && office.additionalCenters.length > 0) return true;
  return (
    office.name !== std.name ||
    office.centerName !== std.centerName ||
    office.region !== std.region ||
    (office.defaultPhone || '') !== (std.defaultPhone || '') ||
    (office.defaultLine || '') !== (std.defaultLine || '')
  );
}

function mergeTwoOfficeLists(
  listA: EmploymentOffice[],
  listB: EmploymentOffice[]
): EmploymentOffice[] {
  const map = new Map<string, EmploymentOffice>();
  for (const item of [...(listA || []), ...(listB || [])]) {
    if (!item || !item.id || !item.name) continue;
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, {
        ...item,
        additionalCenters: deduplicateCenterList(
          item.additionalCenters || [],
          item.centerName
        ),
      });
    } else {
      const mergedCenter = item.centerName || prev.centerName;
      const mergedAdd = deduplicateCenterList(
        [...(prev.additionalCenters || []), ...(item.additionalCenters || [])],
        mergedCenter
      );
      map.set(item.id, {
        ...prev,
        ...item,
        centerName: mergedCenter,
        additionalCenters: mergedAdd,
      });
    }
  }
  return Array.from(map.values());
}

function parseArrayField<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val as T[];
  if (typeof val === 'string' && val.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed as T[];
    } catch {}
  }
  return [];
}

const STORAGE_KEY_DELETED_ISSUE_IDS = 'doe_deleted_issue_ids_v1';

function loadDeletedIssueIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DELETED_ISSUE_IDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((id) => typeof id === 'string'));
      }
    }
  } catch {}
  return new Set<string>();
}

const deletedIssueIds: Set<string> = loadDeletedIssueIds();

function saveDeletedIssueIds() {
  try {
    localStorage.setItem(
      STORAGE_KEY_DELETED_ISSUE_IDS,
      JSON.stringify(Array.from(deletedIssueIds))
    );
  } catch {}
}

function loadInitialMasterCacheFromLocalStorage(): BundledMasterConfig {
  let localOffices: EmploymentOffice[] = EMPLOYMENT_OFFICES.filter(isOfficeCustomized);
  let localDelOffices: EmploymentOffice[] = [];
  let localCats: (ReportCategory & { sortOrder?: number })[] = DEFAULT_CATEGORIES.map(
    (c, idx) => ({ ...c, sortOrder: idx })
  );
  let localQms: (QueueMetricCategory & { sortOrder?: number })[] = DEFAULT_QUEUE_METRICS.map(
    (m, idx) => ({ ...m, sortOrder: idx })
  );
  let localReps: (ReporterProfile & { sortOrder?: number })[] = DEFAULT_REPORTERS.map(
    (r, idx) => ({ ...r, sortOrder: idx })
  );
  let localConfig: SystemConfig = { ...DEFAULT_SYSTEM_CONFIG };
  let localDelReports: DOEReport[] = [];
  let localIssues: SystemIssueReport[] = [];

  for (const key of ['doe_work_permit_offices_v1', 'doe_ss_offices_v1']) {
    try {
      const rawOffices = localStorage.getItem(key);
      if (rawOffices) {
        const parsed = JSON.parse(rawOffices);
        if (Array.isArray(parsed)) {
          const customLocal = parsed.filter((o) => o && o.id && isOfficeCustomized(o));
          localOffices = mergeTwoOfficeLists(localOffices, customLocal);
        }
      }
    } catch {}
  }

  for (const key of ['doe_work_permit_deleted_offices_v1', 'doe_ss_deleted_offices_v1']) {
    try {
      const rawDelOffices = localStorage.getItem(key);
      if (rawDelOffices) {
        const parsed = JSON.parse(rawDelOffices);
        if (Array.isArray(parsed)) {
          // Rescue any custom office_... center that was mistakenly placed in deleted_offices
          const rescued = parsed.filter((o: EmploymentOffice) => o && o.id && o.id.startsWith('office_'));
          if (rescued.length > 0) {
            localOffices = mergeTwoOfficeLists(localOffices, rescued);
          }
          localDelOffices = parsed.filter(
            (o: EmploymentOffice) =>
              o && o.id && !o.id.startsWith('office_') && o.id !== 'central_foreign_workers'
          );
        }
      }
    } catch {}
  }

  for (const key of ['doe_work_permit_categories_v1', 'doe_ss_categories_v1']) {
    try {
      const rawCats = localStorage.getItem(key);
      if (rawCats) {
        const parsed = JSON.parse(rawCats);
        if (Array.isArray(parsed) && parsed.length > 0) {
          localCats = parsed.map((c: ReportCategory, idx: number) => ({ ...c, sortOrder: idx }));
          break;
        }
      }
    } catch {}
  }

  for (const key of ['doe_work_permit_queue_metrics_v1', 'doe_ss_queue_metrics_v1']) {
    try {
      const rawQms = localStorage.getItem(key);
      if (rawQms) {
        const parsed = JSON.parse(rawQms);
        if (Array.isArray(parsed) && parsed.length > 0) {
          localQms = parsed.map((m: QueueMetricCategory, idx: number) => ({
            ...m,
            sortOrder: idx,
          }));
          break;
        }
      }
    } catch {}
  }

  for (const key of ['doe_work_permit_reporters_v1', 'doe_ss_reporters_v1']) {
    try {
      const rawReps = localStorage.getItem(key);
      if (rawReps) {
        const parsed = JSON.parse(rawReps);
        if (Array.isArray(parsed) && parsed.length > 0) {
          localReps = parsed.map((r: ReporterProfile, idx: number) => ({
            ...r,
            sortOrder: idx,
          }));
          break;
        }
      }
    } catch {}
  }

  for (const key of ['doe_work_permit_config_v1', 'doe_ss_config_v1']) {
    try {
      const rawCfg = localStorage.getItem(key);
      if (rawCfg) {
        const parsed = JSON.parse(rawCfg);
        if (parsed && parsed.reportTitle) {
          localConfig = { ...DEFAULT_SYSTEM_CONFIG, ...parsed };
          break;
        }
      }
    } catch {}
  }

  for (const key of ['doe_work_permit_deleted_reports_v1', 'doe_ss_deleted_reports_v1']) {
    try {
      const rawDelRep = localStorage.getItem(key);
      if (rawDelRep) {
        const parsed = JSON.parse(rawDelRep);
        if (Array.isArray(parsed) && parsed.length > 0) {
          localDelReports = parsed;
          break;
        }
      }
    } catch {}
  }

  try {
    const rawIssues = localStorage.getItem('doe_assistant_reported_issues_v1');
    if (rawIssues) {
      const parsed = JSON.parse(rawIssues);
      if (Array.isArray(parsed)) {
        localIssues = parsed.filter((i) => i && i.id && !deletedIssueIds.has(i.id));
      }
    }
  } catch {}

  return {
    ...localConfig,
    migrationVersion: CURRENT_MIGRATION_VERSION,
    bundledOffices: localOffices,
    bundledDeletedOffices: localDelOffices,
    bundledCategories: localCats,
    bundledQueueMetrics: localQms,
    bundledReporters: localReps,
    bundledDeletedReports: localDelReports,
    bundledIssues: localIssues,
  };
}

let masterDocCache: BundledMasterConfig = loadInitialMasterCacheFromLocalStorage();

// Subscriber sets for multiplexed single-listener updates
const officesListeners = new Set<(data: EmploymentOffice[]) => void>();
const deletedOfficesListeners = new Set<(data: EmploymentOffice[]) => void>();
const categoriesListeners = new Set<(data: ReportCategory[]) => void>();
const queueMetricsListeners = new Set<(data: QueueMetricCategory[]) => void>();
const reportersListeners = new Set<(data: ReporterProfile[]) => void>();
const systemConfigListeners = new Set<(data: SystemConfig) => void>();
const deletedReportsListeners = new Set<(data: DOEReport[]) => void>();
const systemIssuesListeners = new Set<(data: SystemIssueReport[]) => void>();

let masterUnsubscribe: (() => void) | null = null;
let hasReceivedFirstMasterSnapshot = false;
let isMigratingLegacyCollections = false;

function getActiveMasterListenerCount(): number {
  return (
    officesListeners.size +
    deletedOfficesListeners.size +
    categoriesListeners.size +
    queueMetricsListeners.size +
    reportersListeners.size +
    systemConfigListeners.size +
    deletedReportsListeners.size +
    systemIssuesListeners.size
  );
}

function broadcastMasterState(onlyConfigBranding = false) {
  const sysConfig: SystemConfig = {
    reportTitle: masterDocCache.reportTitle || DEFAULT_SYSTEM_CONFIG.reportTitle,
    reportSubtitle: masterDocCache.reportSubtitle || DEFAULT_SYSTEM_CONFIG.reportSubtitle,
    departmentNameTh:
      masterDocCache.departmentNameTh || DEFAULT_SYSTEM_CONFIG.departmentNameTh,
    departmentNameEn:
      masterDocCache.departmentNameEn || DEFAULT_SYSTEM_CONFIG.departmentNameEn,
    customLogoUrl:
      masterDocCache.customLogoUrl !== undefined
        ? masterDocCache.customLogoUrl
        : DEFAULT_SYSTEM_CONFIG.customLogoUrl,
    adminPin: masterDocCache.adminPin || DEFAULT_SYSTEM_CONFIG.adminPin,
  };
  systemConfigListeners.forEach((cb) => cb(sysConfig));

  if (onlyConfigBranding) return;

  // 1. Offices
  if (Array.isArray(masterDocCache.bundledOffices)) {
    const officesList = [...masterDocCache.bundledOffices].filter(
      (o) => o && o.id && o.name
    );
    officesList.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    officesListeners.forEach((cb) => cb(officesList));
  }

  // 2. Deleted Offices
  if (Array.isArray(masterDocCache.bundledDeletedOffices)) {
    const delOfficesList = [...masterDocCache.bundledDeletedOffices].filter(
      (o) => o && o.id && o.name && !o.id.startsWith('office_')
    );
    delOfficesList.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    deletedOfficesListeners.forEach((cb) => cb(delOfficesList));
  }

  // 3. Categories
  if (Array.isArray(masterDocCache.bundledCategories) && masterDocCache.bundledCategories.length > 0) {
    const catOrderMap = new Map(DEFAULT_CATEGORIES.map((c, idx) => [c.id, idx]));
    const catsList = [...masterDocCache.bundledCategories].filter(
      (c) => c && c.id && c.title
    );
    catsList.sort((a, b) => {
      const orderA =
        typeof a.sortOrder === 'number' ? a.sortOrder : (catOrderMap.get(a.id) ?? 999);
      const orderB =
        typeof b.sortOrder === 'number' ? b.sortOrder : (catOrderMap.get(b.id) ?? 999);
      if (orderA !== orderB) return orderA - orderB;
      return a.id.localeCompare(b.id);
    });
    categoriesListeners.forEach((cb) => cb(catsList));
  }

  // 4. Queue Metrics
  if (Array.isArray(masterDocCache.bundledQueueMetrics) && masterDocCache.bundledQueueMetrics.length > 0) {
    const qmOrderMap = new Map(DEFAULT_QUEUE_METRICS.map((c, idx) => [c.id, idx]));
    const qmList = [...masterDocCache.bundledQueueMetrics].filter(
      (m) => m && m.id && m.title
    );
    qmList.sort((a, b) => {
      const orderA =
        typeof a.sortOrder === 'number' ? a.sortOrder : (qmOrderMap.get(a.id) ?? 999);
      const orderB =
        typeof b.sortOrder === 'number' ? b.sortOrder : (qmOrderMap.get(b.id) ?? 999);
      if (orderA !== orderB) return orderA - orderB;
      return a.id.localeCompare(b.id);
    });
    queueMetricsListeners.forEach((cb) => cb(qmList));
  }

  // 5. Reporters
  if (Array.isArray(masterDocCache.bundledReporters) && masterDocCache.bundledReporters.length > 0) {
    const repList = [...masterDocCache.bundledReporters].filter(
      (r) => r && r.id && r.name
    );
    repList.sort((a, b) => {
      const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : 999;
      const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.id.localeCompare(b.id);
    });
    reportersListeners.forEach((cb) => cb(repList));
  }

  // 7. Deleted Reports
  if (Array.isArray(masterDocCache.bundledDeletedReports)) {
    const delReportsList: DOEReport[] = [];
    masterDocCache.bundledDeletedReports.forEach((raw) => {
      const clean = sanitizeReport(raw);
      if (clean) delReportsList.push(clean);
    });
    deletedReportsListeners.forEach((cb) => cb(delReportsList));
  }

  // 8. System Issues
  if (Array.isArray(masterDocCache.bundledIssues)) {
    const issuesList = [...masterDocCache.bundledIssues].filter(
      (i) => i && i.id && i.title && !deletedIssueIds.has(i.id)
    );
    issuesList.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    systemIssuesListeners.forEach((cb) => cb(issuesList));
  }
}

async function persistMasterConfigOnline(
  partialUpdate: Partial<BundledMasterConfig>,
  _markMigrated = false
): Promise<void> {
  masterDocCache = {
    ...masterDocCache,
    ...partialUpdate,
    reportTitle:
      partialUpdate.reportTitle ||
      masterDocCache.reportTitle ||
      DEFAULT_SYSTEM_CONFIG.reportTitle,
    departmentNameTh:
      partialUpdate.departmentNameTh ||
      masterDocCache.departmentNameTh ||
      DEFAULT_SYSTEM_CONFIG.departmentNameTh,
    adminPin:
      partialUpdate.adminPin ||
      masterDocCache.adminPin ||
      DEFAULT_SYSTEM_CONFIG.adminPin,
    migrationVersion: CURRENT_MIGRATION_VERSION,
    updatedAt: new Date().toISOString(),
  };

  broadcastMasterState(false);

  const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
  try {
    await setDoc(docRef, cleanForFirestore(masterDocCache), { merge: true });
  } catch (error) {
    if (isQuotaExceededError(error)) {
      logStreamStatus('system_config_write', error);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, `${CONFIG_COLLECTION}/${CONFIG_DOC_ID}`);
  }
}

// One-time comprehensive migration from legacy collections (offices, deleted_offices, categories, etc.)
async function migrateLegacyCollectionsOnce(existingConfig: Partial<BundledMasterConfig>) {
  if (isMigratingLegacyCollections) return;
  isMigratingLegacyCollections = true;
  try {
    const [
      officesSnap,
      delOfficesSnap,
      catsSnap,
      qmSnap,
      repsSnap,
      delReportsSnap,
      issuesSnap,
    ] = await Promise.all([
      getDocs(collection(db, OFFICES_COLLECTION)),
      getDocs(collection(db, DELETED_OFFICES_COLLECTION)),
      getDocs(collection(db, CATEGORIES_COLLECTION)),
      getDocs(collection(db, QUEUE_METRICS_COLLECTION)),
      getDocs(collection(db, REPORTERS_COLLECTION)),
      getDocs(collection(db, DELETED_REPORTS_COLLECTION)),
      getDocs(collection(db, ISSUES_COLLECTION)),
    ]);

    const discoveredOffices: EmploymentOffice[] = [];
    officesSnap.forEach((d) => {
      const data = d.data() as EmploymentOffice;
      const docId = data?.id || d.id;
      if (data && docId) {
        const stdBase = stdOfficeMap.get(docId);
        const officeObj: EmploymentOffice = {
          ...(stdBase || {}),
          ...data,
          id: docId,
          name: data.name || stdBase?.name || '',
          centerName: data.centerName || stdBase?.centerName || '',
          region: data.region || stdBase?.region || 'กรุงเทพมหานคร',
        } as EmploymentOffice;
        if (officeObj.name && isOfficeCustomized(officeObj)) {
          discoveredOffices.push(officeObj);
        }
      }
    });

    const delOffices: EmploymentOffice[] = [];
    delOfficesSnap.forEach((d) => {
      const data = d.data() as EmploymentOffice;
      if (data && (data.id || d.id) && data.name) {
        const officeObj = { ...data, id: data.id || d.id };
        // Rescue any custom office_... center that was put in deleted_offices by earlier migration
        if (officeObj.id.startsWith('office_')) {
          discoveredOffices.push(officeObj);
          deleteDoc(d.ref).catch(() => {});
        } else {
          delOffices.push(officeObj);
        }
      }
    });

    const mergedCustomOffices = mergeTwoOfficeLists(
      mergeTwoOfficeLists(masterDocCache.bundledOffices || [], existingConfig.bundledOffices || []),
      discoveredOffices
    );

    const cats: (ReportCategory & { sortOrder?: number })[] = [];
    catsSnap.forEach((d) => {
      const data = d.data() as ReportCategory & { sortOrder?: number };
      if (data && data.id && data.title) cats.push(data);
    });

    const qms: (QueueMetricCategory & { sortOrder?: number })[] = [];
    qmSnap.forEach((d) => {
      const data = d.data() as QueueMetricCategory & { sortOrder?: number };
      if (data && data.id && data.title) qms.push(data);
    });

    const reps: (ReporterProfile & { sortOrder?: number })[] = [];
    repsSnap.forEach((d) => {
      const data = d.data() as ReporterProfile & { sortOrder?: number };
      if (data && data.id && data.name) reps.push(data);
    });

    const delReports: DOEReport[] = [];
    delReportsSnap.forEach((d) => {
      const clean = sanitizeReport({ ...d.data(), id: d.id });
      if (clean) delReports.push(clean);
    });

    const issues: SystemIssueReport[] = [];
    issuesSnap.forEach((d) => {
      const data = d.data() as SystemIssueReport;
      const issueId = data?.id || d.id;
      if (data && issueId && !deletedIssueIds.has(issueId)) {
        issues.push({ ...data, id: issueId });
      }
    });

    const hasExplicitBundledIssues = Array.isArray(existingConfig.bundledIssues);

    await persistMasterConfigOnline(
      {
        ...DEFAULT_SYSTEM_CONFIG,
        ...existingConfig,
        bundledOffices: mergedCustomOffices,
        bundledDeletedOffices: delOffices,
        bundledCategories:
          cats.length > 0
            ? cats
            : existingConfig.bundledCategories ||
              masterDocCache.bundledCategories ||
              DEFAULT_CATEGORIES.map((c, idx) => ({ ...c, sortOrder: idx })),
        bundledQueueMetrics:
          qms.length > 0
            ? qms
            : existingConfig.bundledQueueMetrics ||
              masterDocCache.bundledQueueMetrics ||
              DEFAULT_QUEUE_METRICS.map((m, idx) => ({ ...m, sortOrder: idx })),
        bundledReporters:
          reps.length > 0
            ? reps
            : existingConfig.bundledReporters ||
              masterDocCache.bundledReporters ||
              DEFAULT_REPORTERS.map((r, idx) => ({ ...r, sortOrder: idx })),
        bundledDeletedReports:
          delReports.length > 0
            ? delReports.slice(0, 50)
            : existingConfig.bundledDeletedReports ||
              masterDocCache.bundledDeletedReports ||
              [],
        bundledIssues: hasExplicitBundledIssues
          ? (existingConfig.bundledIssues || []).filter(
              (i) => i && i.id && !deletedIssueIds.has(i.id)
            )
          : issues.length > 0
          ? issues
          : (masterDocCache.bundledIssues || []).filter(
              (i) => i && i.id && !deletedIssueIds.has(i.id)
            ),
      },
      true
    );
  } catch (err) {
    logStreamStatus('legacy_migration', err);
  } finally {
    isMigratingLegacyCollections = false;
  }
}

function ensureMasterSubscription(onError?: (err: unknown) => void) {
  if (masterUnsubscribe) return;
  const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
  masterUnsubscribe = onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.metadata.fromCache && !snapshot.exists()) {
        return;
      }
      hasReceivedFirstMasterSnapshot = true;
      if (snapshot.exists()) {
        const rawData = snapshot.data() as BundledMasterConfig;
        const parsedIssues = Array.isArray(rawData.bundledIssues)
          ? rawData.bundledIssues.filter((i) => i && i.id && !deletedIssueIds.has(i.id))
          : parseArrayField<SystemIssueReport>(rawData.bundledIssues).filter(
              (i) => i && i.id && !deletedIssueIds.has(i.id)
            );
        const data: BundledMasterConfig = {
          ...rawData,
          bundledOffices: parseArrayField<EmploymentOffice>(rawData.bundledOffices),
          bundledDeletedOffices: parseArrayField<EmploymentOffice>(
            rawData.bundledDeletedOffices
          ).filter((o) => o && o.id !== 'central_foreign_workers'),
          bundledIssues: parsedIssues,
        };
        const isMigrated = (data.migrationVersion || 0) >= CURRENT_MIGRATION_VERSION;
        if (isMigrated) {
          masterDocCache = {
            ...masterDocCache,
            ...data,
            bundledOffices: mergeTwoOfficeLists(
              masterDocCache.bundledOffices || [],
              data.bundledOffices || []
            ),
          };
          broadcastMasterState(false);
        } else {
          masterDocCache = {
            ...masterDocCache,
            reportTitle: data.reportTitle || masterDocCache.reportTitle,
            reportSubtitle: data.reportSubtitle || masterDocCache.reportSubtitle,
            departmentNameTh: data.departmentNameTh || masterDocCache.departmentNameTh,
            departmentNameEn: data.departmentNameEn || masterDocCache.departmentNameEn,
            customLogoUrl:
              data.customLogoUrl !== undefined
                ? data.customLogoUrl
                : masterDocCache.customLogoUrl,
            adminPin: data.adminPin || masterDocCache.adminPin,
            bundledIssues: Array.isArray(rawData.bundledIssues)
              ? parsedIssues
              : masterDocCache.bundledIssues,
          };
          broadcastMasterState(true);
          migrateLegacyCollectionsOnce(data);
        }
      } else {
        migrateLegacyCollectionsOnce({});
      }
    },
    (error) => {
      logStreamStatus('system_config', error, onError);
    }
  );
}

function cleanupMasterSubscriptionIfIdle() {
  if (getActiveMasterListenerCount() === 0 && masterUnsubscribe) {
    masterUnsubscribe();
    masterUnsubscribe = null;
    hasReceivedFirstMasterSnapshot = false;
  }
}

// ============================================================================
// 1. REPORTS (BUNDLED SHARDS ARCHITECTURE: report_bundles/bundle_shard_0..5)
// ============================================================================

export function getBundleIdForReportId(reportId: string): string {
  let hash = 0;
  const str = String(reportId || '');
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  const shardIndex = hash % REPORT_SHARD_COUNT;
  return `bundle_shard_${shardIndex}`;
}

export async function saveBulkReportsOnline(
  reports: DOEReport[],
  skipDeletedFilter = true
): Promise<void> {
  if (!Array.isArray(reports) || reports.length === 0) return;

  const delIds = skipDeletedFilter
    ? new Set<string>()
    : new Set((masterDocCache.bundledDeletedReports || []).map((r) => r.id));
  const shards = new Map<string, Record<string, DOEReport>>();
  const restoredIds = new Set<string>();

  for (const raw of reports) {
    const sanitized = sanitizeReport(raw);
    if (!sanitized || !sanitized.id || delIds.has(sanitized.id)) continue;
    restoredIds.add(sanitized.id);
    const bundleId = getBundleIdForReportId(sanitized.id);
    let map = shards.get(bundleId);
    if (!map) {
      map = {};
      shards.set(bundleId, map);
    }
    map[sanitized.id] = cleanForFirestore(sanitized);
  }

  if (shards.size === 0) return;

  if (
    skipDeletedFilter &&
    Array.isArray(masterDocCache.bundledDeletedReports) &&
    masterDocCache.bundledDeletedReports.some((r) => restoredIds.has(r.id))
  ) {
    const nextDel = masterDocCache.bundledDeletedReports.filter(
      (r) => !restoredIds.has(r.id)
    );
    persistMasterConfigOnline({ bundledDeletedReports: nextDel }).catch(() => {});
  }

  const now = new Date().toISOString();
  await Promise.all(
    Array.from(shards.entries()).map(async ([bundleId, reportsMap]) => {
      const bundleRef = doc(db, REPORT_BUNDLES_COLLECTION, bundleId);
      try {
        await setDoc(
          bundleRef,
          {
            id: bundleId,
            updatedAt: now,
            reportsMap,
          },
          { merge: true }
        );
      } catch (err) {
        if (!isQuotaExceededError(err)) {
          console.warn(`Failed to write report bundle ${bundleId}:`, err);
        }
      }
    })
  );
}

let isMigratingReportBundles = false;
let hasMigratedReportBundlesInSession = false;

function getLocalCachedReportsForBundleSync(): DOEReport[] {
  const map = new Map<string, DOEReport>();
  const delIds = new Set((masterDocCache.bundledDeletedReports || []).map((r) => r.id));
  for (const key of [
    'doe_work_permit_reports_backup_v1',
    'doe_work_permit_reports_v1',
    'doe_ss_reports_backup_v1',
    'doe_ss_reports_v1',
  ]) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const clean = sanitizeReport(item);
            if (clean && clean.id && !delIds.has(clean.id)) {
              map.set(clean.id, clean);
            }
          }
        }
      }
    } catch {}
  }
  return Array.from(map.values());
}

async function migrateLegacyReportsToBundlesOnce(
  existingBundleMap: Map<string, DOEReport>,
  onMigrated?: (mergedList: DOEReport[]) => void
) {
  if (isMigratingReportBundles || hasMigratedReportBundlesInSession) return;
  isMigratingReportBundles = true;

  try {
    const delIds = new Set((masterDocCache.bundledDeletedReports || []).map((r) => r.id));
    const combinedMap = new Map<string, DOEReport>(existingBundleMap);
    const missingToWrite: DOEReport[] = [];

    // 1. Check local cached reports first (0 Firestore reads)
    const localReports = getLocalCachedReportsForBundleSync();
    for (const r of localReports) {
      if (!delIds.has(r.id) && !combinedMap.has(r.id)) {
        combinedMap.set(r.id, r);
        missingToWrite.push(r);
      }
    }

    // 2. Also read legacy 'reports' collection if bundle has fewer than expected reports
    if (existingBundleMap.size < 800) {
      try {
        const legacySnap = await getDocs(collection(db, REPORTS_COLLECTION));
        legacySnap.forEach((docSnap) => {
          const raw = docSnap.data();
          if (docSnap.id === 'report-test-123' || raw?.id === 'report-test-123') {
            return;
          }
          const clean = sanitizeReport({ ...raw, id: raw?.id || docSnap.id });
          if (clean && !delIds.has(clean.id) && !existingBundleMap.has(clean.id)) {
            if (!combinedMap.has(clean.id)) {
              missingToWrite.push(clean);
            }
            combinedMap.set(clean.id, clean);
          }
        });
        hasMigratedReportBundlesInSession = true;
      } catch (err) {
        logStreamStatus('legacy_reports_migration', err);
      }
    } else {
      hasMigratedReportBundlesInSession = true;
    }

    if (missingToWrite.length > 0) {
      await saveBulkReportsOnline(missingToWrite, false);
      try {
        localStorage.setItem('doe_ss_bundles_seeded_v1', 'true');
      } catch {}
    }

    if (onMigrated && combinedMap.size > existingBundleMap.size) {
      const mergedList = Array.from(combinedMap.values()).sort((a, b) =>
        (b.reportDate || '').localeCompare(a.reportDate || '')
      );
      onMigrated(mergedList);
    }
  } finally {
    isMigratingReportBundles = false;
  }
}

export function subscribeReports(
  onData: (reports: DOEReport[]) => void,
  onError?: (err: unknown) => void
) {
  const colRef = collection(db, REPORT_BUNDLES_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      if (snapshot.metadata.fromCache && snapshot.empty) {
        return;
      }
      const bundleMap = new Map<string, DOEReport>();
      snapshot.forEach((docSnap) => {
        const raw = docSnap.data();
        const reportsMap = raw?.reportsMap;
        if (reportsMap && typeof reportsMap === 'object') {
          for (const [repId, repVal] of Object.entries(reportsMap)) {
            if (repId === 'report-test-123' || !repVal || typeof repVal !== 'object') {
              continue;
            }
            const clean = sanitizeReport({
              ...(repVal as Record<string, unknown>),
              id: (repVal as DOEReport).id || repId,
            });
            if (clean) {
              bundleMap.set(clean.id, clean);
            }
          }
        }
      });

      const list = Array.from(bundleMap.values()).sort((a, b) =>
        (b.reportDate || '').localeCompare(a.reportDate || '')
      );
      if (list.length > 0 || !snapshot.empty) {
        onData(list);
      }

      // If report_bundles is empty or incomplete, automatically migrate from local cache + legacy 'reports' collection
      if (bundleMap.size < 800 && !hasMigratedReportBundlesInSession) {
        migrateLegacyReportsToBundlesOnce(bundleMap, onData);
      }
    },
    (error) => {
      // Even if read quota is temporarily exceeded, seed report_bundles from local cache if not yet seeded (uses write quota only)
      try {
        if (localStorage.getItem('doe_ss_bundles_seeded_v1') !== 'true') {
          const localReports = getLocalCachedReportsForBundleSync();
          if (localReports.length > 0) {
            saveBulkReportsOnline(localReports)
              .then(() => {
                localStorage.setItem('doe_ss_bundles_seeded_v1', 'true');
              })
              .catch(() => {});
          }
        }
      } catch {}
      logStreamStatus('report_bundles', error, onError);
    }
  );
}

export async function saveReportOnline(report: DOEReport): Promise<void> {
  const sanitized = sanitizeReport(report);
  if (!sanitized) return;
  const bundleId = getBundleIdForReportId(sanitized.id);
  const bundleRef = doc(db, REPORT_BUNDLES_COLLECTION, bundleId);
  const legacyDocRef = doc(db, REPORTS_COLLECTION, sanitized.id);
  const cleanReport = cleanForFirestore(sanitized);

  const existingDel = masterDocCache.bundledDeletedReports || [];
  if (existingDel.some((r) => r.id === sanitized.id)) {
    const nextDel = existingDel.filter((r) => r.id !== sanitized.id);
    persistMasterConfigOnline({ bundledDeletedReports: nextDel }).catch(() => {});
  }

  // Keep legacy single-doc collection synced in background
  setDoc(legacyDocRef, cleanReport, { merge: true }).catch(() => {});

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await setDoc(
        bundleRef,
        {
          id: bundleId,
          updatedAt: new Date().toISOString(),
          reportsMap: {
            [sanitized.id]: cleanReport,
          },
        },
        { merge: true }
      );
      return;
    } catch (error) {
      lastError = error;
      if (isQuotaExceededError(error)) {
        logStreamStatus('save_report_bundle', error);
        return;
      }
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 600));
      }
    }
  }
  handleFirestoreError(lastError, OperationType.WRITE, `${REPORT_BUNDLES_COLLECTION}/${bundleId}`);
}

export async function purgeGhostReportOnline(reportId: string): Promise<void> {
  if (!reportId) return;
  const bundleId = getBundleIdForReportId(reportId);
  const bundleRef = doc(db, REPORT_BUNDLES_COLLECTION, bundleId);
  deleteDoc(doc(db, REPORTS_COLLECTION, reportId)).catch(() => {});
  try {
    await setDoc(
      bundleRef,
      {
        id: bundleId,
        updatedAt: new Date().toISOString(),
        reportsMap: {
          [reportId]: deleteField(),
        },
      },
      { merge: true }
    );
  } catch (err) {
    if (!isQuotaExceededError(err)) {
      console.warn('Could not purge ghost report:', reportId, err);
    }
  }
}

export async function deleteReportOnline(report: DOEReport): Promise<void> {
  const bundleId = getBundleIdForReportId(report.id);
  const bundleRef = doc(db, REPORT_BUNDLES_COLLECTION, bundleId);
  const legacyDocRef = doc(db, REPORTS_COLLECTION, report.id);
  try {
    const sanitized = sanitizeReport(report);
    if (sanitized) {
      const prevDel = (masterDocCache.bundledDeletedReports || []).filter(
        (r) => r.id !== sanitized.id
      );
      await persistMasterConfigOnline({
        bundledDeletedReports: [sanitized, ...prevDel].slice(0, 50),
      }).catch(() => {});
    }
    deleteDoc(legacyDocRef).catch(() => {});
    await setDoc(
      bundleRef,
      {
        id: bundleId,
        updatedAt: new Date().toISOString(),
        reportsMap: {
          [report.id]: deleteField(),
        },
      },
      { merge: true }
    );
  } catch (error) {
    if (isQuotaExceededError(error)) {
      logStreamStatus('delete_report', error);
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, `${REPORT_BUNDLES_COLLECTION}/${bundleId}`);
  }
}

export async function restoreReportOnline(report: DOEReport): Promise<void> {
  const sanitized = sanitizeReport(report);
  if (!sanitized) return;
  const bundleId = getBundleIdForReportId(sanitized.id);
  const bundleRef = doc(db, REPORT_BUNDLES_COLLECTION, bundleId);
  const legacyDocRef = doc(db, REPORTS_COLLECTION, sanitized.id);
  try {
    const cleanReport = cleanForFirestore(sanitized);
    const nextDel = (masterDocCache.bundledDeletedReports || []).filter(
      (r) => r.id !== sanitized.id
    );
    await persistMasterConfigOnline({ bundledDeletedReports: nextDel }).catch(() => {});
    setDoc(legacyDocRef, cleanReport, { merge: true }).catch(() => {});
    await setDoc(
      bundleRef,
      {
        id: bundleId,
        updatedAt: new Date().toISOString(),
        reportsMap: {
          [sanitized.id]: cleanReport,
        },
      },
      { merge: true }
    );
  } catch (error) {
    if (isQuotaExceededError(error)) {
      logStreamStatus('restore_report', error);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, `${REPORT_BUNDLES_COLLECTION}/${bundleId}`);
  }
}

export function subscribeDeletedReports(
  onData: (reports: DOEReport[]) => void,
  onError?: (err: unknown) => void
) {
  deletedReportsListeners.add(onData);
  ensureMasterSubscription(onError);
  if (hasReceivedFirstMasterSnapshot && Array.isArray(masterDocCache.bundledDeletedReports)) {
    const list: DOEReport[] = [];
    masterDocCache.bundledDeletedReports.forEach((raw) => {
      const clean = sanitizeReport(raw);
      if (clean) list.push(clean);
    });
    onData(list);
  }
  return () => {
    deletedReportsListeners.delete(onData);
    cleanupMasterSubscriptionIfIdle();
  };
}

// ============================================================================
// 2. OFFICES
// ============================================================================
export function subscribeOffices(
  onData: (offices: EmploymentOffice[]) => void,
  onError?: (err: unknown) => void
) {
  officesListeners.add(onData);
  ensureMasterSubscription(onError);
  if (hasReceivedFirstMasterSnapshot && Array.isArray(masterDocCache.bundledOffices)) {
    const list = [...masterDocCache.bundledOffices].filter((o) => o && o.id && o.name);
    list.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    onData(list);
  }
  return () => {
    officesListeners.delete(onData);
    cleanupMasterSubscriptionIfIdle();
  };
}

export async function saveOfficeOnline(office: EmploymentOffice): Promise<void> {
  const prevOffices = (masterDocCache.bundledOffices || []).filter(
    (o) => o.id !== office.id
  );
  const nextOffices = isOfficeCustomized(office)
    ? [...prevOffices, cleanForFirestore(office)]
    : prevOffices;
  const nextDelOffices = (masterDocCache.bundledDeletedOffices || []).filter(
    (o) => o.id !== office.id
  );
  // Also update in offices collection if it exists there so legacy & bundled stay consistent
  setDoc(doc(db, OFFICES_COLLECTION, office.id), cleanForFirestore(office), { merge: true }).catch(
    () => {}
  );
  await persistMasterConfigOnline({
    bundledOffices: nextOffices,
    bundledDeletedOffices: nextDelOffices,
  });
}

export async function saveAllOfficesOnline(offices: EmploymentOffice[]): Promise<void> {
  const customized = (offices || [])
    .filter((o) => o && o.id && o.name && isOfficeCustomized(o))
    .map((o) => cleanForFirestore(o));
  const mergedBundled = mergeTwoOfficeLists(masterDocCache.bundledOffices || [], customized);
  await persistMasterConfigOnline({
    bundledOffices: mergedBundled,
  });
}

export async function deleteOfficeOnline(office: EmploymentOffice): Promise<void> {
  const nextOffices = (masterDocCache.bundledOffices || []).filter(
    (o) => o.id !== office.id
  );
  const prevDel = (masterDocCache.bundledDeletedOffices || []).filter(
    (o) => o.id !== office.id
  );
  const isBogusCenterDoc = office.id.startsWith('office_');
  const nextDel = isBogusCenterDoc ? prevDel : [cleanForFirestore(office), ...prevDel];
  deleteDoc(doc(db, OFFICES_COLLECTION, office.id)).catch(() => {});
  await persistMasterConfigOnline({
    bundledOffices: nextOffices,
    bundledDeletedOffices: nextDel,
  });
}

export async function restoreOfficeOnline(office: EmploymentOffice): Promise<void> {
  const prevOffices = (masterDocCache.bundledOffices || []).filter(
    (o) => o.id !== office.id
  );
  const nextOffices = isOfficeCustomized(office)
    ? [...prevOffices, cleanForFirestore(office)]
    : prevOffices;
  const nextDel = (masterDocCache.bundledDeletedOffices || []).filter(
    (o) => o.id !== office.id
  );
  await persistMasterConfigOnline({
    bundledOffices: nextOffices,
    bundledDeletedOffices: nextDel,
  });
}

export function subscribeDeletedOffices(
  onData: (offices: EmploymentOffice[]) => void,
  onError?: (err: unknown) => void
) {
  deletedOfficesListeners.add(onData);
  ensureMasterSubscription(onError);
  if (hasReceivedFirstMasterSnapshot && Array.isArray(masterDocCache.bundledDeletedOffices)) {
    const list = [...masterDocCache.bundledDeletedOffices].filter(
      (o) => o && o.id && o.name && !o.id.startsWith('office_')
    );
    list.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    onData(list);
  }
  return () => {
    deletedOfficesListeners.delete(onData);
    cleanupMasterSubscriptionIfIdle();
  };
}

// ============================================================================
// 3. CATEGORIES
// ============================================================================
export function subscribeCategories(
  onData: (cats: ReportCategory[]) => void,
  onError?: (err: unknown) => void
) {
  categoriesListeners.add(onData);
  ensureMasterSubscription(onError);
  if (hasReceivedFirstMasterSnapshot && Array.isArray(masterDocCache.bundledCategories)) {
    const orderMap = new Map(DEFAULT_CATEGORIES.map((c, idx) => [c.id, idx]));
    const list = [...masterDocCache.bundledCategories].filter((c) => c && c.id && c.title);
    list.sort((a, b) => {
      const orderA =
        typeof a.sortOrder === 'number' ? a.sortOrder : (orderMap.get(a.id) ?? 999);
      const orderB =
        typeof b.sortOrder === 'number' ? b.sortOrder : (orderMap.get(b.id) ?? 999);
      if (orderA !== orderB) return orderA - orderB;
      return a.id.localeCompare(b.id);
    });
    onData(list);
  }
  return () => {
    categoriesListeners.delete(onData);
    cleanupMasterSubscriptionIfIdle();
  };
}

export async function saveCategoryOnline(category: ReportCategory): Promise<void> {
  const existing = masterDocCache.bundledCategories || DEFAULT_CATEGORIES;
  const idx = existing.findIndex((c) => c.id === category.id);
  const next =
    idx >= 0
      ? existing.map((c, i) => (i === idx ? { ...category, sortOrder: i } : c))
      : [...existing, { ...category, sortOrder: existing.length }];
  await persistMasterConfigOnline({ bundledCategories: next });
}

export async function saveAllCategoriesOnline(categories: ReportCategory[]): Promise<void> {
  const next = categories.map((cat, idx) => ({ ...cat, sortOrder: idx }));
  await persistMasterConfigOnline({ bundledCategories: next });
}

// ============================================================================
// 3.1 QUEUE METRICS
// ============================================================================
export function subscribeQueueMetrics(
  onData: (metrics: QueueMetricCategory[]) => void,
  onError?: (err: unknown) => void
) {
  queueMetricsListeners.add(onData);
  ensureMasterSubscription(onError);
  if (hasReceivedFirstMasterSnapshot && Array.isArray(masterDocCache.bundledQueueMetrics)) {
    const orderMap = new Map(DEFAULT_QUEUE_METRICS.map((c, idx) => [c.id, idx]));
    const list = [...masterDocCache.bundledQueueMetrics].filter(
      (m) => m && m.id && m.title
    );
    list.sort((a, b) => {
      const orderA =
        typeof a.sortOrder === 'number' ? a.sortOrder : (orderMap.get(a.id) ?? 999);
      const orderB =
        typeof b.sortOrder === 'number' ? b.sortOrder : (orderMap.get(b.id) ?? 999);
      if (orderA !== orderB) return orderA - orderB;
      return a.id.localeCompare(b.id);
    });
    onData(list);
  }
  return () => {
    queueMetricsListeners.delete(onData);
    cleanupMasterSubscriptionIfIdle();
  };
}

export async function saveQueueMetricOnline(metric: QueueMetricCategory): Promise<void> {
  const existing = masterDocCache.bundledQueueMetrics || DEFAULT_QUEUE_METRICS;
  const idx = existing.findIndex((m) => m.id === metric.id);
  const next =
    idx >= 0
      ? existing.map((m, i) => (i === idx ? { ...metric, sortOrder: i } : m))
      : [...existing, { ...metric, sortOrder: existing.length }];
  await persistMasterConfigOnline({ bundledQueueMetrics: next });
}

export async function saveAllQueueMetricsOnline(metrics: QueueMetricCategory[]): Promise<void> {
  const next = metrics.map((m, idx) => ({ ...m, sortOrder: idx }));
  await persistMasterConfigOnline({ bundledQueueMetrics: next });
}

export async function deleteQueueMetricOnline(metricId: string): Promise<void> {
  const existing = masterDocCache.bundledQueueMetrics || DEFAULT_QUEUE_METRICS;
  const next = existing
    .filter((m) => m.id !== metricId)
    .map((m, idx) => ({ ...m, sortOrder: idx }));
  await persistMasterConfigOnline({ bundledQueueMetrics: next });
}

// ============================================================================
// 4. REPORTERS
// ============================================================================
export function subscribeReporters(
  onData: (reporters: ReporterProfile[]) => void,
  onError?: (err: unknown) => void
) {
  reportersListeners.add(onData);
  ensureMasterSubscription(onError);
  if (hasReceivedFirstMasterSnapshot && Array.isArray(masterDocCache.bundledReporters)) {
    const list = [...masterDocCache.bundledReporters].filter((r) => r && r.id && r.name);
    list.sort((a, b) => {
      const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : 999;
      const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.id.localeCompare(b.id);
    });
    onData(list);
  }
  return () => {
    reportersListeners.delete(onData);
    cleanupMasterSubscriptionIfIdle();
  };
}

export async function saveReporterOnline(reporter: ReporterProfile): Promise<void> {
  const existing = masterDocCache.bundledReporters || DEFAULT_REPORTERS;
  const idx = existing.findIndex((r) => r.id === reporter.id);
  const next =
    idx >= 0
      ? existing.map((r, i) => (i === idx ? { ...reporter, sortOrder: i } : r))
      : [...existing, { ...reporter, sortOrder: existing.length }];
  await persistMasterConfigOnline({ bundledReporters: next });
}

export async function saveAllReportersOnline(reporters: ReporterProfile[]): Promise<void> {
  const next = reporters.map((rep, idx) => ({ ...rep, sortOrder: idx }));
  await persistMasterConfigOnline({ bundledReporters: next });
}

// ============================================================================
// 5. SYSTEM CONFIG
// ============================================================================
export function subscribeSystemConfig(
  onData: (config: SystemConfig) => void,
  onError?: (err: unknown) => void
) {
  systemConfigListeners.add(onData);
  ensureMasterSubscription(onError);
  if (hasReceivedFirstMasterSnapshot) {
    onData({
      reportTitle: masterDocCache.reportTitle || DEFAULT_SYSTEM_CONFIG.reportTitle,
      reportSubtitle:
        masterDocCache.reportSubtitle || DEFAULT_SYSTEM_CONFIG.reportSubtitle,
      departmentNameTh:
        masterDocCache.departmentNameTh || DEFAULT_SYSTEM_CONFIG.departmentNameTh,
      departmentNameEn:
        masterDocCache.departmentNameEn || DEFAULT_SYSTEM_CONFIG.departmentNameEn,
      customLogoUrl:
        masterDocCache.customLogoUrl !== undefined
          ? masterDocCache.customLogoUrl
          : DEFAULT_SYSTEM_CONFIG.customLogoUrl,
      adminPin: masterDocCache.adminPin || DEFAULT_SYSTEM_CONFIG.adminPin,
    });
  }
  return () => {
    systemConfigListeners.delete(onData);
    cleanupMasterSubscriptionIfIdle();
  };
}

export async function saveSystemConfigOnline(config: SystemConfig): Promise<void> {
  await persistMasterConfigOnline({
    reportTitle: config.reportTitle,
    reportSubtitle: config.reportSubtitle,
    departmentNameTh: config.departmentNameTh,
    departmentNameEn: config.departmentNameEn,
    customLogoUrl: config.customLogoUrl,
    adminPin: config.adminPin,
  });
}

// ============================================================================
// 6. INITIAL SYNC / CLEAR REPORTS
// ============================================================================
export async function clearAllReportsOnline(): Promise<void> {
  try {
    const [bundleSnap, reportSnap] = await Promise.all([
      getDocs(collection(db, REPORT_BUNDLES_COLLECTION)),
      getDocs(collection(db, REPORTS_COLLECTION)),
    ]);
    const archived: DOEReport[] = [];
    const batch = writeBatch(db);
    bundleSnap.docs.forEach((docSnap) => {
      const raw = docSnap.data();
      if (raw?.reportsMap && typeof raw.reportsMap === 'object') {
        for (const [repId, repVal] of Object.entries(raw.reportsMap)) {
          if (repVal && typeof repVal === 'object') {
            const clean = sanitizeReport({
              ...(repVal as Record<string, unknown>),
              id: (repVal as DOEReport).id || repId,
            });
            if (clean) archived.push(clean);
          }
        }
      }
      batch.delete(docSnap.ref);
    });
    reportSnap.docs.forEach((docSnap) => {
      const clean = sanitizeReport({ ...docSnap.data(), id: docSnap.id });
      if (clean) archived.push(clean);
      batch.delete(docSnap.ref);
    });
    await batch.commit();

    if (archived.length > 0) {
      const prevDel = masterDocCache.bundledDeletedReports || [];
      const mergedMap = new Map<string, DOEReport>();
      [...archived, ...prevDel].forEach((r) => mergedMap.set(r.id, r));
      await persistMasterConfigOnline({
        bundledDeletedReports: Array.from(mergedMap.values()).slice(0, 50),
      });
    }
  } catch (err) {
    console.warn('Error clearing reports online for production:', err);
  }
}

export async function initializeFirestoreIfEmpty(): Promise<{
  reportsSeeded: boolean;
  officesSeeded: boolean;
}> {
  return { reportsSeeded: false, officesSeeded: false };
}

// ============================================================================
// 7. SYSTEM ISSUES & TROUBLE REPORTS
// ============================================================================
export async function reportSystemIssueOnline(issue: SystemIssueReport): Promise<void> {
  if (!issue || !issue.id) return;
  deletedIssueIds.delete(issue.id);
  saveDeletedIssueIds();

  const cleanIssue = cleanForFirestore(issue);
  const currentList = (masterDocCache.bundledIssues || []).filter(
    (i) => i && i.id && !deletedIssueIds.has(i.id)
  );
  const existingIdx = currentList.findIndex((i) => i.id === issue.id);
  let next: SystemIssueReport[];
  if (existingIdx >= 0) {
    next = [...currentList];
    next[existingIdx] = cleanIssue;
  } else {
    next = [cleanIssue, ...currentList];
  }

  try {
    localStorage.setItem('doe_assistant_reported_issues_v1', JSON.stringify(next));
  } catch {}

  // Keep legacy collection synced in background
  setDoc(doc(db, ISSUES_COLLECTION, issue.id), cleanIssue, { merge: true }).catch(() => {});

  await persistMasterConfigOnline({ bundledIssues: next }, true);
}

export async function deleteSystemIssueOnline(issueId: string): Promise<void> {
  if (!issueId) return;
  deletedIssueIds.add(issueId);
  saveDeletedIssueIds();

  const next = (masterDocCache.bundledIssues || []).filter(
    (i) => i && i.id !== issueId && !deletedIssueIds.has(i.id)
  );
  masterDocCache.bundledIssues = next;
  try {
    localStorage.setItem('doe_assistant_reported_issues_v1', JSON.stringify(next));
  } catch {}
  broadcastMasterState(false);

  // Also remove from legacy collection so it never resurrects
  deleteDoc(doc(db, ISSUES_COLLECTION, issueId)).catch(() => {});

  await persistMasterConfigOnline({ bundledIssues: next }, true);
}

export async function clearAllSystemIssuesOnline(): Promise<void> {
  (masterDocCache.bundledIssues || []).forEach((i) => {
    if (i && i.id) deletedIssueIds.add(i.id);
  });
  try {
    const saved = localStorage.getItem('doe_assistant_reported_issues_v1');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        parsed.forEach((i: SystemIssueReport) => {
          if (i && i.id) deletedIssueIds.add(i.id);
        });
      }
    }
    localStorage.setItem('doe_assistant_reported_issues_v1', '[]');
  } catch {}
  saveDeletedIssueIds();

  masterDocCache.bundledIssues = [];
  broadcastMasterState(false);

  // Also purge any documents in the legacy 'system_issues' collection
  getDocs(collection(db, ISSUES_COLLECTION))
    .then((snap) => {
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.docs.forEach((d) => {
          deletedIssueIds.add(d.id);
          batch.delete(d.ref);
        });
        saveDeletedIssueIds();
        return batch.commit();
      }
    })
    .catch(() => {});

  await persistMasterConfigOnline({ bundledIssues: [] }, true);
}

export function subscribeSystemIssues(
  onData: (issues: SystemIssueReport[]) => void,
  onError?: (err: unknown) => void
) {
  systemIssuesListeners.add(onData);
  ensureMasterSubscription(onError);
  if (hasReceivedFirstMasterSnapshot && Array.isArray(masterDocCache.bundledIssues)) {
    const list = [...masterDocCache.bundledIssues].filter(
      (i) => i && i.id && i.title && !deletedIssueIds.has(i.id)
    );
    list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    onData(list);
  }
  return () => {
    systemIssuesListeners.delete(onData);
    cleanupMasterSubscriptionIfIdle();
  };
}
