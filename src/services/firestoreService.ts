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
const REPORT_SHARD_COUNT = 24;
const LEGACY_REPORT_SHARD_COUNT = 6;
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

  // 7. Deleted Reports (exclude any report that is currently active in report_bundles)
  if (Array.isArray(masterDocCache.bundledDeletedReports)) {
    const activeBundleIds = getActiveReportIdsInBundles();
    const delReportsList: DOEReport[] = [];
    masterDocCache.bundledDeletedReports.forEach((raw) => {
      const clean = sanitizeReport(raw);
      if (clean && (!hasLoadedAllBundleShards || !activeBundleIds.has(clean.id))) {
        delReportsList.push(clean);
      }
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

    const activeBundleIds = getActiveReportIdsInBundles();
    const delReports: DOEReport[] = [];
    delReportsSnap.forEach((d) => {
      const clean = sanitizeReport({ ...d.data(), id: d.id });
      if (clean && !activeBundleIds.has(clean.id)) {
        delReports.push(clean);
      } else if (clean && activeBundleIds.has(clean.id)) {
        deleteDoc(d.ref).catch(() => {});
      }
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
    const hasExplicitBundledDelReports = Array.isArray(existingConfig.bundledDeletedReports);

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
        bundledDeletedReports: hasExplicitBundledDelReports
          ? (existingConfig.bundledDeletedReports || []).filter(
              (r) => r && r.id && !activeBundleIds.has(r.id)
            )
          : delReports.length > 0
          ? delReports.slice(0, 50)
          : (masterDocCache.bundledDeletedReports || []).filter(
              (r) => r && r.id && !activeBundleIds.has(r.id)
            ),
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
// 1. REPORTS (BUNDLED SHARDS ARCHITECTURE: report_bundles/bundle_shard_0..23)
// ============================================================================

const liveBundleShardsCache = new Map<string, Record<string, DOEReport>>();
let hasLoadedAllBundleShards = false;

function getActiveReportIdsInBundles(): Set<string> {
  const activeIds = new Set<string>();
  liveBundleShardsCache.forEach((shardMap) => {
    if (shardMap && typeof shardMap === 'object') {
      Object.keys(shardMap).forEach((id) => activeIds.add(id));
    }
  });
  return activeIds;
}

export function getBundleIdForReportId(
  reportId: string,
  shardCount = REPORT_SHARD_COUNT
): string {
  let hash = 0;
  const str = String(reportId || '');
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  const shardIndex = hash % shardCount;
  return `bundle_shard_${shardIndex}`;
}

export function getReportTimestampMs(r?: DOEReport | null): number {
  if (!r) return 0;
  const ts = r.updatedAt || r.createdAt || '';
  if (!ts) return 0;
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function isReportStrictlyNewer(candidate: DOEReport, existing?: DOEReport): boolean {
  if (!existing) return true;
  const candMs = getReportTimestampMs(candidate);
  const existMs = getReportTimestampMs(existing);
  if (candMs > 0 && existMs > 0 && candMs !== existMs) {
    return candMs > existMs;
  }
  return false;
}

export function pickNewerReport(
  existing: DOEReport | undefined,
  incoming: DOEReport
): DOEReport {
  if (!existing) return incoming;
  const existMs = getReportTimestampMs(existing);
  const incMs = getReportTimestampMs(incoming);
  if (existMs > 0 && incMs > 0 && existMs !== incMs) {
    return incMs >= existMs ? incoming : existing;
  }
  return incoming;
}

export async function saveBulkReportsOnline(
  reports: DOEReport[],
  skipDeletedFilter = true,
  replaceAll = false
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
    const bundleId = getBundleIdForReportId(sanitized.id, REPORT_SHARD_COUNT);
    let map = shards.get(bundleId);
    if (!map) {
      map = {};
      shards.set(bundleId, map);
    }
    const existingInShard = map[sanitized.id] || liveBundleShardsCache.get(bundleId)?.[sanitized.id];
    const winner = pickNewerReport(existingInShard, sanitized);
    map[sanitized.id] = cleanForFirestore(winner);
  }

  if (shards.size === 0) return;

  if (replaceAll) {
    if (
      Array.isArray(masterDocCache.bundledDeletedReports) &&
      masterDocCache.bundledDeletedReports.length > 0
    ) {
      persistMasterConfigOnline({ bundledDeletedReports: [] }).catch(() => {});
    }
  } else if (
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
  const MAX_REPORTS_PER_MERGE_CHUNK = 35;

  await Promise.all(
    Array.from(shards.entries()).map(async ([bundleId, incomingMap]) => {
      const bundleRef = doc(db, REPORT_BUNDLES_COLLECTION, bundleId);
      const cachedShard = liveBundleShardsCache.get(bundleId) || {};
      const finalMap: Record<string, DOEReport> = { ...cachedShard };
      for (const [repId, repData] of Object.entries(incomingMap)) {
        finalMap[repId] = pickNewerReport(cachedShard[repId], repData);
      }
      liveBundleShardsCache.set(bundleId, finalMap);

      // Write in safe { merge: true } chunks (<= 35 reports per chunk to stay well below Firestore 4,000-field FieldMask limit)
      // This guarantees we NEVER overwrite or wipe reports saved concurrently by other users in the same shard!
      const entries = Object.entries(incomingMap);
      for (let i = 0; i < entries.length; i += MAX_REPORTS_PER_MERGE_CHUNK) {
        const chunkEntries = entries.slice(i, i + MAX_REPORTS_PER_MERGE_CHUNK);
        const chunkMap: Record<string, DOEReport> = {};
        for (const [k, v] of chunkEntries) {
          chunkMap[k] = finalMap[k] || v;
        }

        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await setDoc(
              bundleRef,
              {
                id: bundleId,
                updatedAt: now,
                reportsMap: chunkMap,
              },
              { merge: true }
            );
            break;
          } catch (err) {
            if (isQuotaExceededError(err)) {
              logStreamStatus(`report_bundle_${bundleId}`, err);
              break;
            }
            if (attempt < 3) {
              await new Promise((r) => setTimeout(r, attempt * 400));
            } else {
              console.warn(`Failed to write report bundle ${bundleId}:`, err);
            }
          }
        }
      }
    })
  );
}

let isMigratingReportBundles = false;
let hasMigratedReportBundlesInSession = false;

function getLocalCachedReportsForBundleSync(): DOEReport[] {
  const map = new Map<string, DOEReport>();
  const activeBundleIds = getActiveReportIdsInBundles();
  const delIds = new Set(
    (masterDocCache.bundledDeletedReports || [])
      .map((r) => r?.id)
      .filter((id): id is string => Boolean(id) && !activeBundleIds.has(id))
  );
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
              map.set(clean.id, pickNewerReport(map.get(clean.id), clean));
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
  misplacedByShard: Map<string, string[]>,
  needsShardRebalance: boolean,
  onMigrated?: (mergedList: DOEReport[]) => void
) {
  if (isMigratingReportBundles || hasMigratedReportBundlesInSession) return;
  isMigratingReportBundles = true;

  try {
    const activeBundleIds = new Set(existingBundleMap.keys());
    const delIds = new Set(
      (masterDocCache.bundledDeletedReports || [])
        .map((r) => r?.id)
        .filter((id): id is string => Boolean(id) && !activeBundleIds.has(id))
    );
    const combinedMap = new Map<string, DOEReport>(existingBundleMap);
    const reportsToSyncToBundles = new Map<string, DOEReport>();

    // 0. Ensure any report that was sitting in a legacy 10-shard slot is written to its proper 24-shard slot
    misplacedByShard.forEach((repIds) => {
      for (const repId of repIds) {
        const r = existingBundleMap.get(repId);
        if (r) {
          const targetShardId = getBundleIdForReportId(r.id, REPORT_SHARD_COUNT);
          const alreadyInTargetShard = Boolean(liveBundleShardsCache.get(targetShardId)?.[r.id]);
          if (!alreadyInTargetShard) {
            reportsToSyncToBundles.set(r.id, r);
          }
        }
      }
    });

    // 1. Rescue ALL valid local cached reports missing from Cloud Firestore bundles or strictly newer
    // This guarantees Dev (ais-dev-...) and Deployed Web (ais-pre-...) always have the exact same dataset
    const localReports = getLocalCachedReportsForBundleSync();
    for (const r of localReports) {
      if (delIds.has(r.id)) continue;
      const existing = combinedMap.get(r.id);
      if (!existing || isReportStrictlyNewer(r, existing)) {
        combinedMap.set(r.id, r);
        reportsToSyncToBundles.set(r.id, r);
      }
    }

    // 2. Always check single-doc 'reports' collection once per session so reports saved individually
    // or updated in the evening are never orphaned or overwritten by older bundle shards
    try {
      const legacySnap = await getDocs(collection(db, REPORTS_COLLECTION));
      legacySnap.forEach((docSnap) => {
        const raw = docSnap.data();
        if (docSnap.id === 'report-test-123' || raw?.id === 'report-test-123') {
          return;
        }
        const clean = sanitizeReport({ ...raw, id: raw?.id || docSnap.id });
        if (clean && !delIds.has(clean.id)) {
          const existing = combinedMap.get(clean.id);
          if (!existing || isReportStrictlyNewer(clean, existing)) {
            combinedMap.set(clean.id, clean);
            reportsToSyncToBundles.set(clean.id, clean);
          }
        }
      });
      hasMigratedReportBundlesInSession = true;
    } catch (err) {
      logStreamStatus('legacy_reports_migration', err);
    }

    const newlyDiscoveredOrNewer = Array.from(reportsToSyncToBundles.values());
    if (newlyDiscoveredOrNewer.length > 0) {
      await saveBulkReportsOnline(newlyDiscoveredOrNewer, true, false);
      try {
        localStorage.setItem('doe_ss_bundles_seeded_v1', 'true');
      } catch {}
    } else if (needsShardRebalance && combinedMap.size > 0) {
      await saveBulkReportsOnline(Array.from(combinedMap.values()), true, false);
    }

    // 3. Clean up misplaced keys from old 10-shard layout so shards 0..9 stay small and well under 1MB
    if (misplacedByShard.size > 0) {
      await Promise.all(
        Array.from(misplacedByShard.entries()).map(async ([shardId, keysToRemove]) => {
          const uniqueKeys = Array.from(new Set(keysToRemove));
          const bundleRef = doc(db, REPORT_BUNDLES_COLLECTION, shardId);
          for (let i = 0; i < uniqueKeys.length; i += 40) {
            const slice = uniqueKeys.slice(i, i + 40);
            const delMap: Record<string, unknown> = {};
            for (const k of slice) {
              delMap[k] = deleteField();
            }
            try {
              await setDoc(
                bundleRef,
                {
                  id: shardId,
                  updatedAt: new Date().toISOString(),
                  reportsMap: delMap,
                },
                { merge: true }
              );
            } catch {}
          }
        })
      );
    }

    if (onMigrated && newlyDiscoveredOrNewer.length > 0) {
      const allDiscovered = Array.from(combinedMap.values());
      const mergedList = allDiscovered.sort((a, b) =>
        (b.reportDate || '').localeCompare(a.reportDate || '')
      );
      onMigrated(mergedList);
    }
  } finally {
    isMigratingReportBundles = false;
  }
}

export interface DeepScanDiagnosticResult {
  bundleReportsCount: number;
  legacySingleDocsCount: number;
  deletedTrashReportsCount: number;
  localBackupReportsCount: number;
  newlyRescuedCount: number;
  totalMergedCount: number;
  mergedReports: DOEReport[];
  trashReports: DOEReport[];
  countsByDate: {
    date: string;
    activeCount: number;
    rescuedCount: number;
    trashCount: number;
  }[];
}

/**
 * สแกนตรวจสอบและกู้คืนข้อมูลรายงานเชิงลึกจากทุกแหล่งเก็บข้อมูล (Cloud Firestore report_bundles,
 * คอลเลกชัน reports รายฉบับ, ถังขยะ deleted_reports และ LocalStorage สำรองทั้งหมด)
 */
export async function deepScanAndRecoverAllReports(
  currentReports: DOEReport[],
  includeTrash = false
): Promise<DeepScanDiagnosticResult> {
  const activeMap = new Map<string, DOEReport>();
  const combinedMap = new Map<string, DOEReport>();
  const cloudBundleMap = new Map<string, DOEReport>();
  const rescuedIds = new Set<string>();
  const trashMap = new Map<string, DOEReport>();

  // Seed with current in-memory reports
  for (const r of currentReports) {
    const clean = sanitizeReport(r);
    if (clean) {
      activeMap.set(clean.id, clean);
      combinedMap.set(clean.id, clean);
    }
  }

  // 1. Collect Trash / Deleted Reports from Master Cache, Firestore 'deleted_reports', and LocalStorage
  (masterDocCache.bundledDeletedReports || []).forEach((raw) => {
    const clean = sanitizeReport(raw);
    if (clean) trashMap.set(clean.id, pickNewerReport(trashMap.get(clean.id), clean));
  });

  for (const key of ['doe_work_permit_deleted_reports_v1', 'doe_ss_deleted_reports_v1']) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((item) => {
            const clean = sanitizeReport(item);
            if (clean) trashMap.set(clean.id, pickNewerReport(trashMap.get(clean.id), clean));
          });
        }
      }
    } catch {}
  }

  try {
    const delSnap = await getDocs(collection(db, DELETED_REPORTS_COLLECTION));
    delSnap.forEach((docSnap) => {
      const clean = sanitizeReport({ ...docSnap.data(), id: docSnap.id });
      if (clean) trashMap.set(clean.id, pickNewerReport(trashMap.get(clean.id), clean));
      if (includeTrash) {
        deleteDoc(docSnap.ref).catch(() => {});
      }
    });
  } catch (err) {
    logStreamStatus('deep_scan_deleted_reports', err);
  }

  const delIds = includeTrash ? new Set<string>() : new Set(trashMap.keys());

  // 2. Scan LocalStorage active & backup keys
  let localBackupReportsCount = 0;
  const localMap = new Map<string, DOEReport>();
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
            if (clean && clean.id) {
              localMap.set(clean.id, pickNewerReport(localMap.get(clean.id), clean));
              if (!delIds.has(clean.id)) {
                const existing = combinedMap.get(clean.id);
                if (!existing || isReportStrictlyNewer(clean, existing)) {
                  combinedMap.set(clean.id, clean);
                  const activeVer = activeMap.get(clean.id);
                  if (!activeVer || isReportStrictlyNewer(clean, activeVer)) {
                    rescuedIds.add(clean.id);
                  }
                }
              }
            }
          }
        }
      }
    } catch {}
  }
  localBackupReportsCount = localMap.size;

  // 3. Scan Cloud Firestore 'report_bundles' collection (all shards)
  let bundleReportsCount = 0;
  try {
    const bundleSnap = await getDocs(collection(db, REPORT_BUNDLES_COLLECTION));
    bundleSnap.forEach((docSnap) => {
      const raw = docSnap.data();
      const reportsMap = raw?.reportsMap;
      if (reportsMap && typeof reportsMap === 'object') {
        for (const [repId, repVal] of Object.entries(reportsMap)) {
          if (repId === 'report-test-123' || !repVal || typeof repVal !== 'object') continue;
          const clean = sanitizeReport({
            ...(repVal as Record<string, unknown>),
            id: (repVal as DOEReport).id || repId,
          });
          if (clean) {
            cloudBundleMap.set(clean.id, pickNewerReport(cloudBundleMap.get(clean.id), clean));
            if (!delIds.has(clean.id)) {
              const existing = combinedMap.get(clean.id);
              if (!existing || isReportStrictlyNewer(clean, existing)) {
                combinedMap.set(clean.id, clean);
                const activeVer = activeMap.get(clean.id);
                if (!activeVer || isReportStrictlyNewer(clean, activeVer)) {
                  rescuedIds.add(clean.id);
                }
              }
            }
          }
        }
      }
    });
    bundleReportsCount = cloudBundleMap.size;
  } catch (err) {
    logStreamStatus('deep_scan_report_bundles', err);
  }

  // 4. Scan Cloud Firestore single-document 'reports' collection
  let legacySingleDocsCount = 0;
  try {
    const legacySnap = await getDocs(collection(db, REPORTS_COLLECTION));
    legacySnap.forEach((docSnap) => {
      const raw = docSnap.data();
      if (docSnap.id === 'report-test-123' || raw?.id === 'report-test-123') return;
      const clean = sanitizeReport({ ...raw, id: raw?.id || docSnap.id });
      if (clean) {
        legacySingleDocsCount++;
        if (!delIds.has(clean.id)) {
          const existing = combinedMap.get(clean.id);
          if (!existing || isReportStrictlyNewer(clean, existing)) {
            combinedMap.set(clean.id, clean);
            const activeVer = activeMap.get(clean.id);
            if (!activeVer || isReportStrictlyNewer(clean, activeVer)) {
              rescuedIds.add(clean.id);
            }
          }
        }
      }
    });
  } catch (err) {
    logStreamStatus('deep_scan_legacy_reports', err);
  }

  // 5. If includeTrash is true, also merge trashReports back
  if (includeTrash) {
    trashMap.forEach((r) => {
      const existing = combinedMap.get(r.id);
      if (!existing || isReportStrictlyNewer(r, existing)) {
        combinedMap.set(r.id, r);
        const activeVer = activeMap.get(r.id);
        if (!activeVer || isReportStrictlyNewer(r, activeVer)) {
          rescuedIds.add(r.id);
        }
      }
    });
  }

  const mergedReports = Array.from(combinedMap.values()).sort((a, b) =>
    (b.reportDate || '').localeCompare(a.reportDate || '')
  );

  // Any report in mergedReports that is missing from Cloud Firestore 'report_bundles' or is strictly newer
  // MUST be synced to Cloud Firestore so the Deployed Web App (ais-pre-...) gets 100% of the reports!
  const missingFromCloudList: DOEReport[] = [];
  for (const r of mergedReports) {
    const cloudVer = cloudBundleMap.get(r.id);
    if (!cloudVer || isReportStrictlyNewer(r, cloudVer) || rescuedIds.has(r.id)) {
      missingFromCloudList.push(r);
      rescuedIds.add(r.id);
    }
  }

  if (missingFromCloudList.length > 0) {
    await saveBulkReportsOnline(missingFromCloudList, includeTrash, includeTrash);
  } else if (includeTrash && (masterDocCache.bundledDeletedReports || []).length > 0) {
    await persistMasterConfigOnline({ bundledDeletedReports: [] }).catch(() => {});
  }

  // Build breakdown by date
  const allDates = new Set<string>();
  mergedReports.forEach((r) => {
    if (r.reportDate) allDates.add(r.reportDate);
  });
  trashMap.forEach((r) => {
    if (r.reportDate) allDates.add(r.reportDate);
  });

  const countsByDate = Array.from(allDates)
    .sort((a, b) => b.localeCompare(a))
    .map((date) => {
      const activeForDate = mergedReports.filter((r) => r.reportDate === date);
      const rescuedForDate = activeForDate.filter((r) => rescuedIds.has(r.id));
      const trashForDate = Array.from(trashMap.values()).filter(
        (r) => r.reportDate === date && !combinedMap.has(r.id)
      );
      return {
        date,
        activeCount: activeForDate.length,
        rescuedCount: rescuedForDate.length,
        trashCount: trashForDate.length,
      };
    });

  return {
    bundleReportsCount: Math.max(bundleReportsCount, mergedReports.length),
    legacySingleDocsCount,
    deletedTrashReportsCount: includeTrash ? 0 : trashMap.size,
    localBackupReportsCount,
    newlyRescuedCount: rescuedIds.size,
    totalMergedCount: mergedReports.length,
    mergedReports,
    trashReports: includeTrash ? [] : Array.from(trashMap.values()),
    countsByDate,
  };
}

export function subscribeReports(
  onData: (reports: DOEReport[], isFromCache?: boolean) => void,
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
      const misplacedByShard = new Map<string, string[]>();
      let maxReportsInSingleShard = 0;

      snapshot.forEach((docSnap) => {
        const raw = docSnap.data();
        const reportsMap = raw?.reportsMap;
        const cleanShardMap: Record<string, DOEReport> = {};
        let shardCount = 0;
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
              const winner = pickNewerReport(bundleMap.get(clean.id), clean);
              bundleMap.set(clean.id, winner);
              const expectedShardId = getBundleIdForReportId(clean.id, REPORT_SHARD_COUNT);
              if (docSnap.id === expectedShardId) {
                cleanShardMap[clean.id] = winner;
                shardCount++;
              } else {
                const list = misplacedByShard.get(docSnap.id) || [];
                list.push(repId);
                if (clean.id !== repId) list.push(clean.id);
                misplacedByShard.set(docSnap.id, list);
              }
            }
          }
        }
        liveBundleShardsCache.set(docSnap.id, cleanShardMap);
        if (shardCount > maxReportsInSingleShard) {
          maxReportsInSingleShard = shardCount;
        }
      });

      if (!snapshot.metadata.fromCache) {
        hasLoadedAllBundleShards = true;
      }

      // If masterDocCache.bundledDeletedReports contains any report IDs that are currently active in bundleMap,
      // clean them out so active reports are never falsely filtered out on Deployed Web or Dev
      if (
        !snapshot.metadata.fromCache &&
        hasReceivedFirstMasterSnapshot &&
        Array.isArray(masterDocCache.bundledDeletedReports) &&
        masterDocCache.bundledDeletedReports.some((r) => r && bundleMap.has(r.id))
      ) {
        const cleanedDel = masterDocCache.bundledDeletedReports.filter(
          (r) => r && !bundleMap.has(r.id)
        );
        persistMasterConfigOnline({ bundledDeletedReports: cleanedDel }).catch(() => {});
      }

      const list = Array.from(bundleMap.values()).sort((a, b) =>
        (b.reportDate || '').localeCompare(a.reportDate || '')
      );
      if (list.length > 0 || !snapshot.empty) {
        onData(list, snapshot.metadata.fromCache);
      }

      // Run one-time check per session against single-doc 'reports' collection & local reports
      // Only trigger after server snapshot arrives so we never migrate against a partial cache
      const needsShardRebalance = maxReportsInSingleShard > 65 || misplacedByShard.size > 0;
      if (!snapshot.metadata.fromCache && (!hasMigratedReportBundlesInSession || needsShardRebalance)) {
        migrateLegacyReportsToBundlesOnce(
          bundleMap,
          misplacedByShard,
          needsShardRebalance,
          (migratedList) => onData(migratedList, false)
        );
      }
    },
    (error) => {
      // Never overwrite cloud shards from local cache on a read error
      logStreamStatus('report_bundles', error, onError);
    }
  );
}

export async function saveReportOnline(report: DOEReport): Promise<void> {
  const sanitized = sanitizeReport(report);
  if (!sanitized) return;
  const bundleId = getBundleIdForReportId(sanitized.id, REPORT_SHARD_COUNT);
  const bundleRef = doc(db, REPORT_BUNDLES_COLLECTION, bundleId);
  const legacyDocRef = doc(db, REPORTS_COLLECTION, sanitized.id);
  const cleanReport = cleanForFirestore(sanitized);

  const existingShard = liveBundleShardsCache.get(bundleId) || {};
  const nextShard = {
    ...existingShard,
    [sanitized.id]: pickNewerReport(existingShard[sanitized.id], cleanReport),
  };
  liveBundleShardsCache.set(bundleId, nextShard);

  const existingDel = masterDocCache.bundledDeletedReports || [];
  if (existingDel.some((r) => r.id === sanitized.id)) {
    const nextDel = existingDel.filter((r) => r.id !== sanitized.id);
    persistMasterConfigOnline({ bundledDeletedReports: nextDel }).catch(() => {});
  }

  let lastError: unknown = null;
  let savedToLegacyDoc = false;
  let savedToBundle = false;

  // 1. Write to single-doc collection 'reports/{reportId}' for guaranteed per-report durability
  try {
    await setDoc(legacyDocRef, cleanReport, { merge: true });
    savedToLegacyDoc = true;
  } catch (err) {
    lastError = err;
  }

  // 2. Always write to 'report_bundles/{bundleId}' with { merge: true } on just this report key
  // so saving 1 report NEVER overwrites or deletes sibling reports in the same shard!
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
      savedToBundle = true;
      break;
    } catch (error) {
      lastError = error;
      if (isQuotaExceededError(error)) {
        logStreamStatus('save_report_bundle', error);
        break;
      }
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 600));
      }
    }
  }

  if (!savedToBundle && !savedToLegacyDoc) {
    handleFirestoreError(lastError, OperationType.WRITE, `${REPORT_BUNDLES_COLLECTION}/${bundleId}`);
  }
}

export async function purgeGhostReportOnline(reportId: string): Promise<void> {
  if (!reportId) return;
  const bundleIds = new Set([
    getBundleIdForReportId(reportId, REPORT_SHARD_COUNT),
    getBundleIdForReportId(reportId, LEGACY_REPORT_SHARD_COUNT),
  ]);
  deleteDoc(doc(db, REPORTS_COLLECTION, reportId)).catch(() => {});
  for (const bundleId of bundleIds) {
    const cached = liveBundleShardsCache.get(bundleId);
    if (cached && reportId in cached) {
      const next = { ...cached };
      delete next[reportId];
      liveBundleShardsCache.set(bundleId, next);
    }
    const bundleRef = doc(db, REPORT_BUNDLES_COLLECTION, bundleId);
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
}

export async function deleteReportOnline(report: DOEReport): Promise<void> {
  const bundleIds = new Set([
    getBundleIdForReportId(report.id, REPORT_SHARD_COUNT),
    getBundleIdForReportId(report.id, LEGACY_REPORT_SHARD_COUNT),
  ]);
  const primaryBundleId = getBundleIdForReportId(report.id, REPORT_SHARD_COUNT);
  const legacyDocRef = doc(db, REPORTS_COLLECTION, report.id);
  try {
    // 1. Remove from in-memory shard cache first so broadcastMasterState knows this report is deleted
    for (const bundleId of bundleIds) {
      const cached = liveBundleShardsCache.get(bundleId);
      if (cached && report.id in cached) {
        const next = { ...cached };
        delete next[report.id];
        liveBundleShardsCache.set(bundleId, next);
      }
    }

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
    for (const bundleId of bundleIds) {
      const bundleRef = doc(db, REPORT_BUNDLES_COLLECTION, bundleId);
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
    }
  } catch (error) {
    if (isQuotaExceededError(error)) {
      logStreamStatus('delete_report', error);
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, `${REPORT_BUNDLES_COLLECTION}/${primaryBundleId}`);
  }
}

export async function restoreReportOnline(report: DOEReport): Promise<void> {
  const sanitized = sanitizeReport(report);
  if (!sanitized) return;
  const bundleId = getBundleIdForReportId(sanitized.id, REPORT_SHARD_COUNT);
  const bundleRef = doc(db, REPORT_BUNDLES_COLLECTION, bundleId);
  const legacyDocRef = doc(db, REPORTS_COLLECTION, sanitized.id);
  try {
    const cleanReport = cleanForFirestore(sanitized);
    const existingShard = liveBundleShardsCache.get(bundleId) || {};
    const nextShard = { ...existingShard, [sanitized.id]: cleanReport };
    liveBundleShardsCache.set(bundleId, nextShard);

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
    const activeBundleIds = getActiveReportIdsInBundles();
    const list: DOEReport[] = [];
    masterDocCache.bundledDeletedReports.forEach((raw) => {
      const clean = sanitizeReport(raw);
      if (clean && (!hasLoadedAllBundleShards || !activeBundleIds.has(clean.id))) {
        list.push(clean);
      }
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
