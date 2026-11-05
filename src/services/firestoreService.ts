import { doc, setDoc } from 'firebase/firestore';
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
import {
  loadReportsFromIndexedDB,
  saveReportsToIndexedDB,
} from '../utils/indexedDbStorage';

const REPORT_SHARD_COUNT = 24;
const CONFIG_COLLECTION = 'system_config';
const CONFIG_DOC_ID = 'main_config';

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

// ============================================================================
// CLOUD SQL (POSTGRESQL) PRIMARY SYNC & POLLING ENGINE (/api/doe/*)
// ============================================================================

const activeReportsListeners = new Set<(reports: DOEReport[], isFromCache?: boolean) => void>();
let sqlActiveReportsCache = new Map<string, DOEReport>();
let sqlPollingIntervalId: ReturnType<typeof setInterval> | null = null;
let isFetchingSqlState = false;
let hasCompletedInitialSqlSync = false;
let hasSeededLocalMasterConfigToSql = false;

function getActiveReportIdsInBundles(): Set<string> {
  const activeIds = new Set<string>();
  sqlActiveReportsCache.forEach((_, id) => activeIds.add(id));
  liveBundleShardsCache.forEach((shardMap) => {
    if (shardMap && typeof shardMap === 'object') {
      Object.keys(shardMap).forEach((id) => activeIds.add(id));
    }
  });
  return activeIds;
}

function broadcastActiveReports(isFromCache = false) {
  const mergedMap = new Map<string, DOEReport>();
  liveBundleShardsCache.forEach((shardMap) => {
    if (shardMap && typeof shardMap === 'object') {
      Object.values(shardMap).forEach((r) => {
        if (r && r.id) {
          mergedMap.set(r.id, pickNewerReport(mergedMap.get(r.id), r));
        }
      });
    }
  });
  sqlActiveReportsCache.forEach((r, id) => {
    if (r && id) {
      mergedMap.set(id, pickNewerReport(mergedMap.get(id), r));
    }
  });

  const list = Array.from(mergedMap.values()).sort((a, b) =>
    (b.reportDate || '').localeCompare(a.reportDate || '')
  );

  if (list.length > 0) {
    saveReportsToIndexedDB(list).catch(() => {});
  }

  activeReportsListeners.forEach((cb) => cb(list, isFromCache));
}

async function fetchAndSyncCloudSqlState(onError?: (err: unknown) => void): Promise<boolean> {
  if (isFetchingSqlState) return true;
  isFetchingSqlState = true;
  try {
    const res = await fetch('/api/doe/state', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Cloud SQL API returned status ${res.status}`);
    }
    const payload = await res.json();
    const sqlActive: DOEReport[] = Array.isArray(payload?.activeReports)
      ? payload.activeReports
      : [];
    const sqlDeleted: DOEReport[] = Array.isArray(payload?.deletedReports)
      ? payload.deletedReports
      : [];
    const sqlMaster: Partial<BundledMasterConfig> | null =
      payload?.masterConfig && typeof payload.masterConfig === 'object'
        ? payload.masterConfig
        : null;

    const nextActiveMap = new Map<string, DOEReport>();
    for (const raw of sqlActive) {
      const clean = sanitizeReport(raw);
      if (clean && clean.id) {
        nextActiveMap.set(clean.id, pickNewerReport(nextActiveMap.get(clean.id), clean));
      }
    }
    sqlActiveReportsCache = nextActiveMap;
    hasLoadedAllBundleShards = true;

    const cleanDeletedList: DOEReport[] = [];
    for (const raw of sqlDeleted) {
      const clean = sanitizeReport(raw);
      if (clean && clean.id && !nextActiveMap.has(clean.id)) {
        cleanDeletedList.push(clean);
      }
    }

    if (sqlMaster) {
      const parsedIssues = parseArrayField<SystemIssueReport>(sqlMaster.bundledIssues).filter(
        (i) => i && i.id && !deletedIssueIds.has(i.id)
      );
      masterDocCache = {
        ...masterDocCache,
        ...sqlMaster,
        bundledOffices: mergeTwoOfficeLists(
          masterDocCache.bundledOffices || [],
          parseArrayField<EmploymentOffice>(sqlMaster.bundledOffices)
        ),
        bundledDeletedOffices: parseArrayField<EmploymentOffice>(
          sqlMaster.bundledDeletedOffices
        ).filter((o) => o && o.id !== 'central_foreign_workers'),
        bundledCategories:
          Array.isArray(sqlMaster.bundledCategories) && sqlMaster.bundledCategories.length > 0
            ? sqlMaster.bundledCategories
            : masterDocCache.bundledCategories,
        bundledQueueMetrics:
          Array.isArray(sqlMaster.bundledQueueMetrics) && sqlMaster.bundledQueueMetrics.length > 0
            ? sqlMaster.bundledQueueMetrics
            : masterDocCache.bundledQueueMetrics,
        bundledReporters:
          Array.isArray(sqlMaster.bundledReporters) && sqlMaster.bundledReporters.length > 0
            ? sqlMaster.bundledReporters
            : masterDocCache.bundledReporters,
        bundledDeletedReports:
          cleanDeletedList.length > 0
            ? cleanDeletedList
            : (parseArrayField<DOEReport>(sqlMaster.bundledDeletedReports) || []).filter(
                (r) => r && r.id && !nextActiveMap.has(r.id)
              ),
        bundledIssues:
          parsedIssues.length > 0 ? parsedIssues : masterDocCache.bundledIssues || [],
      };
    } else {
      masterDocCache = {
        ...masterDocCache,
        bundledDeletedReports:
          cleanDeletedList.length > 0
            ? cleanDeletedList
            : (masterDocCache.bundledDeletedReports || []).filter(
                (r) => r && r.id && !nextActiveMap.has(r.id)
              ),
      };
      if (!hasSeededLocalMasterConfigToSql) {
        hasSeededLocalMasterConfigToSql = true;
        fetch('/api/doe/master-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: cleanForFirestore(masterDocCache) }),
        }).catch(() => {});
      }
    }

    hasReceivedFirstMasterSnapshot = true;
    broadcastMasterState(false);

    if (sqlActive.length > 0 || hasCompletedInitialSqlSync) {
      broadcastActiveReports(false);
    }

    if (!hasCompletedInitialSqlSync) {
      hasCompletedInitialSqlSync = true;
      migrateLegacyReportsToBundlesOnce(nextActiveMap, (migratedList) => {
        for (const r of migratedList) {
          sqlActiveReportsCache.set(r.id, r);
        }
        broadcastActiveReports(false);
      });
    }
    return true;
  } catch (err) {
    if (onError) onError(err);
    return false;
  } finally {
    isFetchingSqlState = false;
  }
}

function ensureSqlPolling(onError?: (err: unknown) => void) {
  fetchAndSyncCloudSqlState(onError);
  if (!sqlPollingIntervalId) {
    sqlPollingIntervalId = setInterval(() => {
      if (getActiveMasterListenerCount() > 0 || activeReportsListeners.size > 0) {
        fetchAndSyncCloudSqlState();
      }
    }, 8000);
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

  // 1. Primary write to Cloud SQL (PostgreSQL)
  try {
    const res = await fetch('/api/doe/master-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: cleanForFirestore(masterDocCache) }),
    });
    if (res.ok) {
      return;
    }
  } catch (sqlErr) {
    console.warn('Cloud SQL master-config sync fallback:', sqlErr);
  }

  // 2. Secondary fallback to Firestore
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

function ensureMasterSubscription(onError?: (err: unknown) => void) {
  ensureSqlPolling(onError);
  if (masterUnsubscribe) return;
  masterUnsubscribe = () => {};
}

function cleanupMasterSubscriptionIfIdle() {
  if (
    getActiveMasterListenerCount() === 0 &&
    activeReportsListeners.size === 0 &&
    sqlPollingIntervalId
  ) {
    clearInterval(sqlPollingIntervalId);
    sqlPollingIntervalId = null;
    masterUnsubscribe = null;
  }
}

// ============================================================================
// 1. REPORTS (CLOUD SQL POSTGRESQL PRIMARY + SHARD CACHE)
// ============================================================================

const liveBundleShardsCache = new Map<string, Record<string, DOEReport>>();
let hasLoadedAllBundleShards = false;

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
  const validReports: DOEReport[] = [];
  const restoredIds = new Set<string>();

  for (const raw of reports) {
    const sanitized = sanitizeReport(raw);
    if (!sanitized || !sanitized.id || delIds.has(sanitized.id)) continue;
    restoredIds.add(sanitized.id);
    const existing = sqlActiveReportsCache.get(sanitized.id);
    const winner = pickNewerReport(existing, sanitized);
    const cleanWinner = cleanForFirestore(winner);
    sqlActiveReportsCache.set(sanitized.id, cleanWinner);
    validReports.push(cleanWinner);
  }

  if (validReports.length === 0) return;

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

  broadcastActiveReports(false);

  // Primary write to Cloud SQL (PostgreSQL) in chunks of 100
  const SQL_CHUNK_SIZE = 100;
  for (let i = 0; i < validReports.length; i += SQL_CHUNK_SIZE) {
    const chunk = validReports.slice(i, i + SQL_CHUNK_SIZE);
    try {
      await fetch('/api/doe/reports/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reports: chunk,
          restoreDeleted: skipDeletedFilter || replaceAll,
        }),
      });
    } catch (err) {
      console.warn('Cloud SQL bulk reports save warning:', err);
    }
  }
}

let isMigratingReportBundles = false;
let hasMigratedReportBundlesInSession = false;

async function getLocalCachedReportsForBundleSync(): Promise<DOEReport[]> {
  const map = new Map<string, DOEReport>();
  const activeBundleIds = getActiveReportIdsInBundles();
  const delIds = new Set(
    (masterDocCache.bundledDeletedReports || [])
      .map((r) => r?.id)
      .filter((id): id is string => Boolean(id) && !activeBundleIds.has(id))
  );

  try {
    const idbReports = await loadReportsFromIndexedDB();
    for (const item of idbReports) {
      const clean = sanitizeReport(item);
      if (clean && clean.id && !delIds.has(clean.id)) {
        map.set(clean.id, pickNewerReport(map.get(clean.id), clean));
      }
    }
  } catch {}

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
  onMigrated?: (mergedList: DOEReport[]) => void
) {
  if (isMigratingReportBundles || hasMigratedReportBundlesInSession) return;
  isMigratingReportBundles = true;
  hasMigratedReportBundlesInSession = true;

  try {
    const activeBundleIds = new Set(existingBundleMap.keys());
    const delIds = new Set(
      (masterDocCache.bundledDeletedReports || [])
        .map((r) => r?.id)
        .filter((id): id is string => Boolean(id) && !activeBundleIds.has(id))
    );
    const combinedMap = new Map<string, DOEReport>(existingBundleMap);
    const reportsToSyncToSql = new Map<string, DOEReport>();

    // Rescue valid local cached reports (IndexedDB + localStorage) missing from Cloud SQL or strictly newer
    const localReports = await getLocalCachedReportsForBundleSync();
    for (const r of localReports) {
      if (delIds.has(r.id)) continue;
      const existing = combinedMap.get(r.id);
      if (!existing || isReportStrictlyNewer(r, existing)) {
        combinedMap.set(r.id, r);
        reportsToSyncToSql.set(r.id, r);
      }
    }

    const newlyDiscoveredOrNewer = Array.from(reportsToSyncToSql.values());
    if (newlyDiscoveredOrNewer.length > 0) {
      await saveBulkReportsOnline(newlyDiscoveredOrNewer, true, false);
      try {
        localStorage.setItem('doe_ss_bundles_seeded_v1', 'true');
      } catch {}
    }

    const allDiscovered = Array.from(combinedMap.values());
    const mergedList = allDiscovered.sort((a, b) =>
      (b.reportDate || '').localeCompare(a.reportDate || '')
    );
    if (mergedList.length > 0) {
      saveReportsToIndexedDB(mergedList).catch(() => {});
    }

    if (onMigrated && newlyDiscoveredOrNewer.length > 0) {
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
 * สแกนตรวจสอบและกู้คืนข้อมูลรายงานเชิงลึกจากทุกแหล่งเก็บข้อมูล (Cloud SQL PostgreSQL,
 * IndexedDB, LocalStorage สำรองทั้งหมด และ Cloud Firestore สำรอง)
 */
export async function deepScanAndRecoverAllReports(
  currentReports: DOEReport[],
  includeTrash = false
): Promise<DeepScanDiagnosticResult> {
  const activeMap = new Map<string, DOEReport>();
  const combinedMap = new Map<string, DOEReport>();
  const cloudSqlMap = new Map<string, DOEReport>();
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

  // 1. Query Cloud SQL PostgreSQL (/api/doe/state)
  try {
    if (includeTrash) {
      await fetch('/api/doe/reports/restore-all-trash', { method: 'POST' }).catch(() => {});
    }
    const res = await fetch('/api/doe/state');
    if (res.ok) {
      const payload = await res.json();
      const sqlActive: DOEReport[] = Array.isArray(payload?.activeReports)
        ? payload.activeReports
        : [];
      const sqlDeleted: DOEReport[] = Array.isArray(payload?.deletedReports)
        ? payload.deletedReports
        : [];
      for (const raw of sqlActive) {
        const clean = sanitizeReport(raw);
        if (clean) {
          cloudSqlMap.set(clean.id, pickNewerReport(cloudSqlMap.get(clean.id), clean));
          sqlActiveReportsCache.set(clean.id, clean);
        }
      }
      for (const raw of sqlDeleted) {
        const clean = sanitizeReport(raw);
        if (clean) {
          trashMap.set(clean.id, pickNewerReport(trashMap.get(clean.id), clean));
        }
      }
    }
  } catch (err) {
    console.warn('Deep scan Cloud SQL check warning:', err);
  }

  // 2. Collect Trash / Deleted Reports from Master Cache & LocalStorage
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

  const delIds = includeTrash ? new Set<string>() : new Set(trashMap.keys());

  // Merge Cloud SQL active reports
  cloudSqlMap.forEach((clean) => {
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
  });

  // 3. Scan IndexedDB and LocalStorage active & backup keys
  let localBackupReportsCount = 0;
  const localMap = new Map<string, DOEReport>();
  try {
    const idbReports = await loadReportsFromIndexedDB();
    for (const item of idbReports) {
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
  } catch {}

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

  // 4. If includeTrash is true, also merge trashReports back
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

  if (mergedReports.length > 0) {
    saveReportsToIndexedDB(mergedReports).catch(() => {});
  }

  // Sync any missing or newer reports to Cloud SQL PostgreSQL
  const missingFromCloudList: DOEReport[] = [];
  for (const r of mergedReports) {
    const cloudVer = cloudSqlMap.get(r.id);
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
    bundleReportsCount: Math.max(cloudSqlMap.size, mergedReports.length),
    legacySingleDocsCount: 0,
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
  activeReportsListeners.add(onData);
  ensureSqlPolling(onError);

  if (sqlActiveReportsCache.size > 0) {
    const list = Array.from(sqlActiveReportsCache.values()).sort((a, b) =>
      (b.reportDate || '').localeCompare(a.reportDate || '')
    );
    onData(list, false);
  }

  return () => {
    activeReportsListeners.delete(onData);
    cleanupMasterSubscriptionIfIdle();
  };
}

export async function saveReportOnline(report: DOEReport): Promise<void> {
  const sanitized = sanitizeReport(report);
  if (!sanitized) return;
  const cleanReport = cleanForFirestore(sanitized);

  sqlActiveReportsCache.set(
    sanitized.id,
    pickNewerReport(sqlActiveReportsCache.get(sanitized.id), cleanReport)
  );

  const existingDel = masterDocCache.bundledDeletedReports || [];
  if (existingDel.some((r) => r.id === sanitized.id)) {
    const nextDel = existingDel.filter((r) => r.id !== sanitized.id);
    persistMasterConfigOnline({ bundledDeletedReports: nextDel }).catch(() => {});
  }

  broadcastActiveReports(false);

  // Primary write to Cloud SQL PostgreSQL
  try {
    const res = await fetch('/api/doe/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report: cleanReport }),
    });
    if (!res.ok) {
      throw new Error(`Cloud SQL report save returned ${res.status}`);
    }
  } catch (err) {
    console.warn('Cloud SQL saveReportOnline warning:', err);
  }
}

export async function purgeGhostReportOnline(reportId: string): Promise<void> {
  if (!reportId) return;
  sqlActiveReportsCache.delete(reportId);
  liveBundleShardsCache.forEach((shardMap, shardId) => {
    if (shardMap && reportId in shardMap) {
      const next = { ...shardMap };
      delete next[reportId];
      liveBundleShardsCache.set(shardId, next);
    }
  });
  broadcastActiveReports(false);

  try {
    await fetch('/api/doe/reports/purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId }),
    });
  } catch (err) {
    console.warn('Could not purge report in Cloud SQL:', reportId, err);
  }
}

export async function deleteReportOnline(report: DOEReport): Promise<void> {
  if (!report || !report.id) return;
  sqlActiveReportsCache.delete(report.id);
  liveBundleShardsCache.forEach((shardMap, shardId) => {
    if (shardMap && report.id in shardMap) {
      const next = { ...shardMap };
      delete next[report.id];
      liveBundleShardsCache.set(shardId, next);
    }
  });

  const sanitized = sanitizeReport(report);
  if (sanitized) {
    const prevDel = (masterDocCache.bundledDeletedReports || []).filter(
      (r) => r.id !== sanitized.id
    );
    await persistMasterConfigOnline({
      bundledDeletedReports: [sanitized, ...prevDel].slice(0, 50),
    }).catch(() => {});
  }

  broadcastActiveReports(false);

  try {
    await fetch('/api/doe/reports/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report: sanitized || report }),
    });
  } catch (err) {
    console.warn('Cloud SQL deleteReportOnline warning:', err);
  }
}

export async function restoreReportOnline(report: DOEReport): Promise<void> {
  const sanitized = sanitizeReport(report);
  if (!sanitized) return;
  const cleanReport = cleanForFirestore(sanitized);

  sqlActiveReportsCache.set(sanitized.id, cleanReport);
  const nextDel = (masterDocCache.bundledDeletedReports || []).filter(
    (r) => r.id !== sanitized.id
  );
  await persistMasterConfigOnline({ bundledDeletedReports: nextDel }).catch(() => {});
  broadcastActiveReports(false);

  try {
    await fetch('/api/doe/reports/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report: cleanReport }),
    });
  } catch (err) {
    console.warn('Cloud SQL restoreReportOnline warning:', err);
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
    const archived = Array.from(sqlActiveReportsCache.values());
    sqlActiveReportsCache.clear();
    liveBundleShardsCache.clear();
    broadcastActiveReports(false);

    await fetch('/api/doe/reports/clear-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (archived.length > 0) {
      const prevDel = masterDocCache.bundledDeletedReports || [];
      const mergedMap = new Map<string, DOEReport>();
      [...archived, ...prevDel].forEach((r) => mergedMap.set(r.id, r));
      await persistMasterConfigOnline({
        bundledDeletedReports: Array.from(mergedMap.values()).slice(0, 50),
      });
    }
  } catch (err) {
    console.warn('Error clearing reports online:', err);
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
