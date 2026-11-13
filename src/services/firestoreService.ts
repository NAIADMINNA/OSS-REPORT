import {
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
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
  DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL,
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
import {
  deleteReportFromGoogleSheets,
  getStoredGoogleSheetsConfig,
  pullReportsFromGoogleSheets,
  saveStoredGoogleSheetsConfig,
  syncBulkReportsToGoogleSheets,
  syncReportToGoogleSheets,
} from '../utils/googleSheetsSync';

const REPORT_BUNDLES_COLLECTION = 'report_bundles';
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
  const stdAdd = deduplicateCenterList(
    std.additionalCenters || [],
    std.centerName
  );
  const offAdd = deduplicateCenterList(
    office.additionalCenters || [],
    office.centerName
  );
  if (JSON.stringify(offAdd) !== JSON.stringify(stdAdd)) return true;
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

function getIssueLastModifiedMs(issue?: SystemIssueReport | null): number {
  if (!issue) return 0;
  const ts = issue.updatedAt || issue.adminReplyAt || issue.createdAt || '';
  const parsed = ts ? Date.parse(ts) : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function mergeSystemIssuesList(
  cachedList: SystemIssueReport[],
  incomingList: SystemIssueReport[],
  incomingIsAuthoritativeArray: boolean
): SystemIssueReport[] {
  const validIncoming = (incomingList || []).filter(
    (i) => i && i.id && i.title && !deletedIssueIds.has(i.id)
  );
  const validCached = (cachedList || []).filter(
    (i) => i && i.id && i.title && !deletedIssueIds.has(i.id)
  );

  if (!incomingIsAuthoritativeArray && validIncoming.length === 0) {
    return validCached;
  }

  const incomingMap = new Map<string, SystemIssueReport>();
  validIncoming.forEach((item) => {
    incomingMap.set(item.id, item);
  });

  const nowMs = Date.now();
  const mergedMap = new Map<string, SystemIssueReport>(incomingMap);

  for (const cachedItem of validCached) {
    const remoteItem = incomingMap.get(cachedItem.id);
    if (remoteItem) {
      const cachedMs = getIssueLastModifiedMs(cachedItem);
      const remoteMs = getIssueLastModifiedMs(remoteItem);
      const cachedRepliesLen = Array.isArray(cachedItem.replies) ? cachedItem.replies.length : 0;
      const remoteRepliesLen = Array.isArray(remoteItem.replies) ? remoteItem.replies.length : 0;
      if (cachedMs > remoteMs || (cachedMs === remoteMs && cachedRepliesLen > remoteRepliesLen)) {
        mergedMap.set(cachedItem.id, cachedItem);
      }
    } else if (!incomingIsAuthoritativeArray || nowMs - getIssueLastModifiedMs(cachedItem) < 12000) {
      // Keep very recently created/updated local issue that may still be in flight
      mergedMap.set(cachedItem.id, cachedItem);
    }
  }

  return Array.from(mergedMap.values()).sort(
    (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')
  );
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
  const localSheetsCfg = getStoredGoogleSheetsConfig();
  const resolvedWebhookUrl =
    masterDocCache.googleSheetsWebhookUrl !== undefined &&
    masterDocCache.googleSheetsWebhookUrl !== ''
      ? masterDocCache.googleSheetsWebhookUrl
      : localSheetsCfg.webhookUrl;
  const resolvedAutoSync =
    masterDocCache.googleSheetsAutoSync !== undefined
      ? masterDocCache.googleSheetsAutoSync
      : localSheetsCfg.autoSync;

  if (resolvedWebhookUrl) {
    saveStoredGoogleSheetsConfig(resolvedWebhookUrl, resolvedAutoSync);
  }

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
    googleSheetsWebhookUrl: resolvedWebhookUrl,
    googleSheetsAutoSync: resolvedAutoSync,
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

let cachedStaticSeed: {
  activeReports: DOEReport[];
  deletedReports: DOEReport[];
  masterConfig: Partial<BundledMasterConfig> | null;
} | null = null;

async function loadStaticCloudSqlSeedOnce(): Promise<{
  activeReports: DOEReport[];
  deletedReports: DOEReport[];
  masterConfig: Partial<BundledMasterConfig> | null;
}> {
  if (cachedStaticSeed) return cachedStaticSeed;
  try {
    const res = await fetch('./doe_cloudsql_seed.json', {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const raw = await res.json();
      const activeReports: DOEReport[] = [];
      const deletedReports: DOEReport[] = [];
      if (raw?.reports && typeof raw.reports === 'object') {
        for (const [id, entry] of Object.entries(raw.reports)) {
          if (id === 'report-test-123' || !entry || typeof entry !== 'object') continue;
          const typed = entry as { report?: DOEReport; isDeleted?: boolean };
          if (typed.report) {
            if (typed.isDeleted) {
              deletedReports.push(typed.report);
            } else {
              activeReports.push(typed.report);
            }
          }
        }
      }
      cachedStaticSeed = {
        activeReports,
        deletedReports,
        masterConfig:
          raw?.masterConfig && typeof raw.masterConfig === 'object' ? raw.masterConfig : null,
      };
      return cachedStaticSeed;
    }
  } catch {
    // Ignore static seed fetch error
  }
  cachedStaticSeed = { activeReports: [], deletedReports: [], masterConfig: null };
  return cachedStaticSeed;
}

let lastClientSheetsPullMs = 0;
let isClientPullingSheets = false;

async function syncClientFromGoogleSheetsIfDue(sqlDeletedIds: Set<string>): Promise<void> {
  if (isClientPullingSheets) return;
  const now = Date.now();
  if (now - lastClientSheetsPullMs < 20000) return;

  const storedCfg = getStoredGoogleSheetsConfig();
  const webhookUrl = (
    masterDocCache.googleSheetsWebhookUrl ||
    storedCfg.webhookUrl ||
    DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL ||
    ''
  ).trim();
  if (!webhookUrl.startsWith('https://script.google.com/')) return;

  isClientPullingSheets = true;
  lastClientSheetsPullMs = now;
  try {
    const result = await pullReportsFromGoogleSheets(webhookUrl);
    if (result.success && Array.isArray(result.reports)) {
      const sheetsMap = new Map<string, DOEReport>();
      const deltaToSql: DOEReport[] = [];
      let changed = false;

      for (const raw of result.reports) {
        const clean = sanitizeReport(raw);
        if (!clean || !clean.id || sqlDeletedIds.has(clean.id)) continue;
        sheetsMap.set(clean.id, pickNewerReport(sheetsMap.get(clean.id), clean));
        const existing = sqlActiveReportsCache.get(clean.id);
        if (!existing || isReportStrictlyNewer(clean, existing)) {
          sqlActiveReportsCache.set(clean.id, pickNewerReport(existing, clean));
          deltaToSql.push(clean);
          changed = true;
        }
      }

      // Also include any reports from IndexedDB / localStorage that might not be in sqlActiveReportsCache yet
      const localCached = await getLocalCachedReportsForBundleSync();
      for (const localRep of localCached) {
        if (!localRep || !localRep.id || sqlDeletedIds.has(localRep.id)) continue;
        const existing = sqlActiveReportsCache.get(localRep.id);
        if (!existing || isReportStrictlyNewer(localRep, existing)) {
          sqlActiveReportsCache.set(localRep.id, pickNewerReport(existing, localRep));
          deltaToSql.push(localRep);
          changed = true;
        }
      }

      if (changed) {
        broadcastActiveReports(false);
      }

      if (deltaToSql.length > 0) {
        const CHUNK_SIZE = 100;
        for (let i = 0; i < deltaToSql.length; i += CHUNK_SIZE) {
          const chunk = deltaToSql.slice(i, i + CHUNK_SIZE);
          fetch('/api/doe/reports/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reports: chunk, restoreDeleted: false }),
          }).catch(() => {});
        }
      }

      // Two-Way Sync: Push any active reports present on this client (e.g. 1,080 on Deployed Web App)
      // that are missing from Google Sheets (e.g. 1,078 in Sheets) up to Google Sheets automatically
      if (masterDocCache.googleSheetsAutoSync !== false && sheetsMap.size > 0) {
        const missingFromSheets: DOEReport[] = [];
        sqlActiveReportsCache.forEach((clientRep, id) => {
          if (!clientRep || !id || sqlDeletedIds.has(id) || id === 'report-test-123') return;
          const inSheets = sheetsMap.get(id);
          if (!inSheets || isReportStrictlyNewer(clientRep, inSheets)) {
            missingFromSheets.push(clientRep);
          }
        });
        if (missingFromSheets.length > 0) {
          await syncBulkReportsToGoogleSheets(missingFromSheets, webhookUrl).catch(() => {});
        }
      }
    }
  } catch {
    // Non-fatal if offline
  } finally {
    isClientPullingSheets = false;
  }
}

async function fetchAndSyncCloudSqlState(onError?: (err: unknown) => void): Promise<boolean> {
  if (isFetchingSqlState) return true;
  isFetchingSqlState = true;
  try {
    let payload: {
      activeReports?: DOEReport[];
      deletedReports?: DOEReport[];
      masterConfig?: Partial<BundledMasterConfig> | null;
    } | null = null;

    try {
      const res = await fetch('/api/doe/state', {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          payload = await res.json();
        }
      }
    } catch {
      // Fallback to static seed below if /api/doe/state is unavailable
    }

    const staticSeed = await loadStaticCloudSqlSeedOnce();
    const sqlActive: DOEReport[] = [
      ...(staticSeed.activeReports || []),
      ...(Array.isArray(payload?.activeReports) ? payload!.activeReports! : []),
    ];
    const sqlDeleted: DOEReport[] = Array.isArray(payload?.deletedReports)
      ? payload!.deletedReports!
      : staticSeed.deletedReports || [];
    const sqlMaster: Partial<BundledMasterConfig> | null =
      payload?.masterConfig && typeof payload.masterConfig === 'object'
        ? { ...(staticSeed.masterConfig || {}), ...payload.masterConfig }
        : staticSeed.masterConfig;

    const sqlDeletedIds = new Set<string>();
    const cleanDeletedList: DOEReport[] = [];
    for (const raw of sqlDeleted) {
      const clean = sanitizeReport(raw);
      if (clean && clean.id) {
        sqlDeletedIds.add(clean.id);
      }
    }

    const nextActiveMap = new Map<string, DOEReport>();
    // Preserve existing in-memory active reports (e.g., from real-time Firestore shards or recent saves)
    sqlActiveReportsCache.forEach((existing, id) => {
      if (existing && id && !sqlDeletedIds.has(id)) {
        nextActiveMap.set(id, existing);
      }
    });
    for (const raw of sqlActive) {
      const clean = sanitizeReport(raw);
      if (clean && clean.id && !sqlDeletedIds.has(clean.id)) {
        nextActiveMap.set(clean.id, pickNewerReport(nextActiveMap.get(clean.id), clean));
      }
    }
    sqlActiveReportsCache = nextActiveMap;
    hasLoadedAllBundleShards = true;

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
        bundledIssues: mergeSystemIssuesList(
          masterDocCache.bundledIssues || [],
          parsedIssues,
          Array.isArray(sqlMaster.bundledIssues)
        ),
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

    // Ensure local deleted_reports caches never retain IDs that are active in Cloud SQL
    if (nextActiveMap.size > 0) {
      for (const delKey of ['doe_work_permit_deleted_reports_v1', 'doe_ss_deleted_reports_v1']) {
        try {
          const rawDel = localStorage.getItem(delKey);
          if (rawDel) {
            const parsedDel = JSON.parse(rawDel);
            if (Array.isArray(parsedDel)) {
              const filteredDel = parsedDel.filter((r) => r && r.id && !nextActiveMap.has(r.id));
              if (filteredDel.length !== parsedDel.length) {
                localStorage.setItem(delKey, JSON.stringify(filteredDel));
              }
            }
          }
        } catch {}
      }
    }

    if (sqlActive.length > 0 || hasCompletedInitialSqlSync) {
      broadcastActiveReports(false);
    }

    // Automatically pull live reports from Google Sheets (works even on Deployed Web App when Firestore is quota-exceeded)
    syncClientFromGoogleSheetsIfDue(sqlDeletedIds).catch(() => {});

    hasCompletedInitialSqlSync = true;
    migrateLegacyReportsToBundlesOnce(nextActiveMap, (migratedList) => {
      for (const r of migratedList) {
        sqlActiveReportsCache.set(r.id, r);
      }
      broadcastActiveReports(false);
    });
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
    }, 20000);
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
  const sqlPromise = fetch('/api/doe/master-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: cleanForFirestore(masterDocCache) }),
  }).catch((sqlErr) => {
    console.warn('Cloud SQL master-config sync fallback:', sqlErr);
  });

  // 2. Dual-write to Cloud Firestore so Deployed Web App & real-time clients stay in sync
  const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
  const firestorePromise = setDoc(docRef, cleanForFirestore(masterDocCache), {
    merge: true,
  }).catch((error) => {
    if (isQuotaExceededError(error)) {
      logStreamStatus('system_config_write', error);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, `${CONFIG_COLLECTION}/${CONFIG_DOC_ID}`);
  });

  await Promise.all([sqlPromise, firestorePromise]);
}

function ensureMasterSubscription(onError?: (err: unknown) => void) {
  ensureSqlPolling(onError);
  if (masterUnsubscribe) return;

  const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
  masterUnsubscribe = onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const rawData = snapshot.data() as Partial<BundledMasterConfig>;
        const parsedIssues = parseArrayField<SystemIssueReport>(rawData.bundledIssues).filter(
          (i) => i && i.id && !deletedIssueIds.has(i.id)
        );
        const activeIds = getActiveReportIdsInBundles();
        masterDocCache = {
          ...masterDocCache,
          ...rawData,
          bundledOffices: mergeTwoOfficeLists(
            masterDocCache.bundledOffices || [],
            parseArrayField<EmploymentOffice>(rawData.bundledOffices)
          ),
          bundledDeletedOffices: parseArrayField<EmploymentOffice>(
            rawData.bundledDeletedOffices
          ).filter((o) => o && o.id !== 'central_foreign_workers'),
          bundledCategories:
            Array.isArray(rawData.bundledCategories) && rawData.bundledCategories.length > 0
              ? rawData.bundledCategories
              : masterDocCache.bundledCategories,
          bundledQueueMetrics:
            Array.isArray(rawData.bundledQueueMetrics) && rawData.bundledQueueMetrics.length > 0
              ? rawData.bundledQueueMetrics
              : masterDocCache.bundledQueueMetrics,
          bundledReporters:
            Array.isArray(rawData.bundledReporters) && rawData.bundledReporters.length > 0
              ? rawData.bundledReporters
              : masterDocCache.bundledReporters,
          bundledDeletedReports: (
            parseArrayField<DOEReport>(rawData.bundledDeletedReports) || []
          ).filter((r) => r && r.id && !activeIds.has(r.id)),
          bundledIssues: mergeSystemIssuesList(
            masterDocCache.bundledIssues || [],
            parsedIssues,
            Array.isArray(rawData.bundledIssues)
          ),
        };
        hasReceivedFirstMasterSnapshot = true;
        broadcastMasterState(false);
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
  }
  if (
    getActiveMasterListenerCount() === 0 &&
    activeReportsListeners.size === 0 &&
    sqlPollingIntervalId
  ) {
    clearInterval(sqlPollingIntervalId);
    sqlPollingIntervalId = null;
  }
}

// ============================================================================
// 1. REPORTS (CLOUD SQL POSTGRESQL + CLOUD FIRESTORE DUAL-ENGINE SYNC)
// ============================================================================

const liveBundleShardsCache = new Map<string, Record<string, DOEReport>>();
let hasLoadedAllBundleShards = false;
let firestoreReportsUnsubscribe: (() => void) | null = null;

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

  // 1. Primary write to Cloud SQL (PostgreSQL) in chunks of 100
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

  // 2. Dual-write to Cloud Firestore report_bundles shards
  const byShard = new Map<string, Record<string, DOEReport>>();
  for (const r of validReports) {
    const shardId = getBundleIdForReportId(r.id);
    const group = byShard.get(shardId) || {};
    group[r.id] = r;
    byShard.set(shardId, group);
    const cachedShard = liveBundleShardsCache.get(shardId) || {};
    liveBundleShardsCache.set(shardId, { ...cachedShard, [r.id]: r });
  }

  await Promise.all(
    Array.from(byShard.entries()).map(async ([shardId, reportsMap]) => {
      try {
        await setDoc(
          doc(db, REPORT_BUNDLES_COLLECTION, shardId),
          {
            id: shardId,
            reportsMap,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (err) {
        if (!isQuotaExceededError(err)) {
          console.warn('Firestore shard bulk sync warning:', shardId, err);
        }
      }
    })
  );

  // 3. Also sync bulk reports to Google Sheets so Deployed Web App and Dev App always share 100% of rescued/bulk reports
  if (masterDocCache.googleSheetsAutoSync !== false) {
    const storedCfg = getStoredGoogleSheetsConfig();
    const webhookUrl = (
      masterDocCache.googleSheetsWebhookUrl ||
      storedCfg.webhookUrl ||
      DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL ||
      ''
    ).trim();
    if (webhookUrl.startsWith('https://script.google.com/')) {
      syncBulkReportsToGoogleSheets(validReports, webhookUrl).catch(() => {});
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

  // 1.5. Query Google Sheets Backup & Cloud Firestore report_bundles
  const firestoreLegacyCount = 0;
  const sheetsMap = new Map<string, DOEReport>();
  let resolvedSheetsWebhookUrl = '';
  try {
    const storedCfg = getStoredGoogleSheetsConfig();
    resolvedSheetsWebhookUrl = (
      masterDocCache.googleSheetsWebhookUrl ||
      storedCfg.webhookUrl ||
      DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL ||
      ''
    ).trim();
    if (resolvedSheetsWebhookUrl.startsWith('https://script.google.com/')) {
      const sheetsResult = await pullReportsFromGoogleSheets(resolvedSheetsWebhookUrl);
      if (sheetsResult.success && Array.isArray(sheetsResult.reports)) {
        for (const raw of sheetsResult.reports) {
          const clean = sanitizeReport(raw);
          if (clean && clean.id) {
            sheetsMap.set(clean.id, pickNewerReport(sheetsMap.get(clean.id), clean));
            cloudSqlMap.set(clean.id, pickNewerReport(cloudSqlMap.get(clean.id), clean));
            sqlActiveReportsCache.set(clean.id, clean);
          }
        }
      }
    }
  } catch {}

  try {
    const bundleSnap = await getDocs(collection(db, REPORT_BUNDLES_COLLECTION));
    bundleSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data?.reportsMap && typeof data.reportsMap === 'object') {
        Object.values(data.reportsMap).forEach((raw) => {
          const clean = sanitizeReport(raw as DOEReport);
          if (clean && clean.id) {
            cloudSqlMap.set(clean.id, pickNewerReport(cloudSqlMap.get(clean.id), clean));
          }
        });
      }
    });
  } catch (err) {
    if (!isQuotaExceededError(err)) {
      console.warn('Deep scan Firestore report_bundles warning:', err);
    }
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

  // Merge Cloud SQL + Firestore active reports
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

  // Sync any missing or newer reports to Cloud SQL PostgreSQL & Google Sheets
  const missingFromCloudList: DOEReport[] = [];
  const missingFromSheetsList: DOEReport[] = [];
  for (const r of mergedReports) {
    const cloudVer = cloudSqlMap.get(r.id);
    if (!cloudVer || isReportStrictlyNewer(r, cloudVer) || rescuedIds.has(r.id)) {
      missingFromCloudList.push(r);
      rescuedIds.add(r.id);
    }
    if (sheetsMap.size > 0) {
      const sheetVer = sheetsMap.get(r.id);
      if (!sheetVer || isReportStrictlyNewer(r, sheetVer)) {
        missingFromSheetsList.push(r);
      }
    }
  }

  if (missingFromCloudList.length > 0) {
    await saveBulkReportsOnline(missingFromCloudList, includeTrash, includeTrash);
  } else if (includeTrash && (masterDocCache.bundledDeletedReports || []).length > 0) {
    await persistMasterConfigOnline({ bundledDeletedReports: [] }).catch(() => {});
  }

  if (
    missingFromSheetsList.length > 0 &&
    resolvedSheetsWebhookUrl.startsWith('https://script.google.com/') &&
    masterDocCache.googleSheetsAutoSync !== false
  ) {
    await syncBulkReportsToGoogleSheets(missingFromSheetsList, resolvedSheetsWebhookUrl).catch(
      () => {}
    );
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
    legacySingleDocsCount: firestoreLegacyCount,
    deletedTrashReportsCount: includeTrash ? 0 : trashMap.size,
    localBackupReportsCount,
    newlyRescuedCount: rescuedIds.size,
    totalMergedCount: mergedReports.length,
    mergedReports,
    trashReports: includeTrash ? [] : Array.from(trashMap.values()),
    countsByDate,
  };
}

function ensureFirestoreReportsSubscription(onError?: (err: unknown) => void) {
  if (firestoreReportsUnsubscribe) return;

  firestoreReportsUnsubscribe = onSnapshot(
    collection(db, REPORT_BUNDLES_COLLECTION),
    (snapshot) => {
      const deltaToSyncToSql: DOEReport[] = [];

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const shardMap: Record<string, DOEReport> = {};
        if (data?.reportsMap && typeof data.reportsMap === 'object') {
          for (const [id, raw] of Object.entries(data.reportsMap)) {
            if (id === 'report-test-123') continue;
            const clean = sanitizeReport(raw as DOEReport);
            if (clean && clean.id) {
              shardMap[clean.id] = clean;
              const existingInSql = sqlActiveReportsCache.get(clean.id);
              if (!existingInSql || isReportStrictlyNewer(clean, existingInSql)) {
                sqlActiveReportsCache.set(clean.id, clean);
                deltaToSyncToSql.push(clean);
              }
            }
          }
        }
        liveBundleShardsCache.set(docSnap.id, shardMap);
      });

      hasLoadedAllBundleShards = true;
      broadcastActiveReports(snapshot.metadata.fromCache);

      // Automatically sync any reports present in Firestore (e.g. from Deployed Web App) into Cloud SQL
      if (deltaToSyncToSql.length > 0) {
        const SQL_CHUNK_SIZE = 100;
        for (let i = 0; i < deltaToSyncToSql.length; i += SQL_CHUNK_SIZE) {
          const chunk = deltaToSyncToSql.slice(i, i + SQL_CHUNK_SIZE);
          fetch('/api/doe/reports/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reports: chunk, restoreDeleted: false }),
          }).catch(() => {});
        }
      }
    },
    (error) => {
      logStreamStatus('report_bundles', error, onError);
    }
  );
}

export function subscribeReports(
  onData: (reports: DOEReport[], isFromCache?: boolean) => void,
  onError?: (err: unknown) => void
) {
  activeReportsListeners.add(onData);
  ensureSqlPolling(onError);
  ensureFirestoreReportsSubscription(onError);

  if (sqlActiveReportsCache.size > 0 || liveBundleShardsCache.size > 0) {
    broadcastActiveReports(false);
  }

  return () => {
    activeReportsListeners.delete(onData);
    if (activeReportsListeners.size === 0 && firestoreReportsUnsubscribe) {
      firestoreReportsUnsubscribe();
      firestoreReportsUnsubscribe = null;
    }
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

  const shardId = getBundleIdForReportId(sanitized.id);
  const existingShard = liveBundleShardsCache.get(shardId) || {};
  liveBundleShardsCache.set(shardId, {
    ...existingShard,
    [sanitized.id]: cleanReport,
  });

  const existingDel = masterDocCache.bundledDeletedReports || [];
  if (existingDel.some((r) => r.id === sanitized.id)) {
    const nextDel = existingDel.filter((r) => r.id !== sanitized.id);
    persistMasterConfigOnline({ bundledDeletedReports: nextDel }).catch(() => {});
  }

  broadcastActiveReports(false);

  let sqlOk = false;
  let firestoreOk = false;
  let lastError: unknown = null;

  // 1. Primary write to Cloud SQL PostgreSQL (unlimited daily reads/writes)
  const sqlPromise = fetch('/api/doe/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report: cleanReport }),
  })
    .then((res) => {
      if (res.ok) sqlOk = true;
    })
    .catch((err) => {
      lastError = err;
      console.warn('Cloud SQL saveReportOnline warning:', err);
    });

  // 2. Single-shard write to Cloud Firestore report_bundles (with automatic retry on transient network drop)
  const writeShardToFirestore = () =>
    setDoc(
      doc(db, REPORT_BUNDLES_COLLECTION, shardId),
      {
        id: shardId,
        reportsMap: { [sanitized.id]: cleanReport },
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

  const firestoreShardPromise = writeShardToFirestore()
    .then(() => {
      firestoreOk = true;
    })
    .catch(async (err) => {
      if (!isQuotaExceededError(err)) {
        try {
          await new Promise((r) => setTimeout(r, 600));
          await writeShardToFirestore();
          firestoreOk = true;
          return;
        } catch (retryErr) {
          lastError = retryErr;
          console.warn('Firestore saveReportOnline shard warning:', retryErr);
        }
      } else {
        lastError = err;
      }
    });

  // 3. Background sync to Google Sheets (non-blocking)
  if (masterDocCache.googleSheetsAutoSync !== false) {
    syncReportToGoogleSheets(cleanReport, masterDocCache.googleSheetsWebhookUrl).catch(() => {});
  }

  await Promise.all([sqlPromise, firestoreShardPromise]);

  if (!sqlOk && !firestoreOk) {
    throw lastError || new Error('Online report persistence failed');
  }
}

export async function purgeGhostReportOnline(reportId: string): Promise<void> {
  if (!reportId) return;
  sqlActiveReportsCache.delete(reportId);
  const touchedShards: string[] = [];
  liveBundleShardsCache.forEach((shardMap, shardId) => {
    if (shardMap && reportId in shardMap) {
      const next = { ...shardMap };
      delete next[reportId];
      liveBundleShardsCache.set(shardId, next);
      touchedShards.push(shardId);
    }
  });
  const computedShard = getBundleIdForReportId(reportId);
  if (!touchedShards.includes(computedShard)) {
    touchedShards.push(computedShard);
  }
  broadcastActiveReports(false);

  const sqlPromise = fetch('/api/doe/reports/purge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportId }),
  }).catch((err) => {
    console.warn('Could not purge report in Cloud SQL:', reportId, err);
  });

  const firestorePromises = touchedShards.map((shardId) =>
    setDoc(
      doc(db, REPORT_BUNDLES_COLLECTION, shardId),
      {
        id: shardId,
        reportsMap: { [reportId]: deleteField() },
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    ).catch(() => {})
  );

  if (masterDocCache.googleSheetsAutoSync !== false) {
    deleteReportFromGoogleSheets(reportId, masterDocCache.googleSheetsWebhookUrl).catch(() => {});
  }

  await Promise.all([sqlPromise, ...firestorePromises]);
}

export async function deleteReportOnline(report: DOEReport): Promise<void> {
  if (!report || !report.id) return;
  sqlActiveReportsCache.delete(report.id);
  const touchedShards: string[] = [];
  liveBundleShardsCache.forEach((shardMap, shardId) => {
    if (shardMap && report.id in shardMap) {
      const next = { ...shardMap };
      delete next[report.id];
      liveBundleShardsCache.set(shardId, next);
      touchedShards.push(shardId);
    }
  });
  const computedShard = getBundleIdForReportId(report.id);
  if (!touchedShards.includes(computedShard)) {
    touchedShards.push(computedShard);
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

  broadcastActiveReports(false);

  const sqlPromise = fetch('/api/doe/reports/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report: sanitized || report }),
  }).catch((err) => {
    console.warn('Cloud SQL deleteReportOnline warning:', err);
  });

  const firestorePromises = touchedShards.map((shardId) =>
    setDoc(
      doc(db, REPORT_BUNDLES_COLLECTION, shardId),
      {
        id: shardId,
        reportsMap: { [report.id]: deleteField() },
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    ).catch(() => {})
  );

  if (masterDocCache.googleSheetsAutoSync !== false) {
    deleteReportFromGoogleSheets(report.id, masterDocCache.googleSheetsWebhookUrl).catch(() => {});
  }

  await Promise.all([sqlPromise, ...firestorePromises]);
}

export async function restoreReportOnline(report: DOEReport): Promise<void> {
  const sanitized = sanitizeReport(report);
  if (!sanitized) return;
  const cleanReport = cleanForFirestore(sanitized);

  sqlActiveReportsCache.set(sanitized.id, cleanReport);
  const shardId = getBundleIdForReportId(sanitized.id);
  const existingShard = liveBundleShardsCache.get(shardId) || {};
  liveBundleShardsCache.set(shardId, {
    ...existingShard,
    [sanitized.id]: cleanReport,
  });

  const nextDel = (masterDocCache.bundledDeletedReports || []).filter(
    (r) => r.id !== sanitized.id
  );
  await persistMasterConfigOnline({ bundledDeletedReports: nextDel }).catch(() => {});
  broadcastActiveReports(false);

  const sqlPromise = fetch('/api/doe/reports/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report: cleanReport }),
  }).catch((err) => {
    console.warn('Cloud SQL restoreReportOnline warning:', err);
  });

  const firestorePromise = setDoc(
    doc(db, REPORT_BUNDLES_COLLECTION, shardId),
    {
      id: shardId,
      reportsMap: { [sanitized.id]: cleanReport },
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  ).catch(() => {});

  if (masterDocCache.googleSheetsAutoSync !== false) {
    syncReportToGoogleSheets(cleanReport, masterDocCache.googleSheetsWebhookUrl).catch(() => {});
  }

  await Promise.all([sqlPromise, firestorePromise]);
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
    const localSheetsCfg = getStoredGoogleSheetsConfig();
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
      googleSheetsWebhookUrl:
        masterDocCache.googleSheetsWebhookUrl || localSheetsCfg.webhookUrl || '',
      googleSheetsAutoSync:
        masterDocCache.googleSheetsAutoSync !== undefined
          ? masterDocCache.googleSheetsAutoSync
          : localSheetsCfg.autoSync,
    });
  }
  return () => {
    systemConfigListeners.delete(onData);
    cleanupMasterSubscriptionIfIdle();
  };
}

export async function saveSystemConfigOnline(config: SystemConfig): Promise<void> {
  if (config.googleSheetsWebhookUrl !== undefined) {
    saveStoredGoogleSheetsConfig(
      config.googleSheetsWebhookUrl,
      config.googleSheetsAutoSync !== false
    );
  }
  await persistMasterConfigOnline({
    reportTitle: config.reportTitle,
    reportSubtitle: config.reportSubtitle,
    departmentNameTh: config.departmentNameTh,
    departmentNameEn: config.departmentNameEn,
    customLogoUrl: config.customLogoUrl,
    adminPin: config.adminPin,
    googleSheetsWebhookUrl: config.googleSheetsWebhookUrl,
    googleSheetsAutoSync: config.googleSheetsAutoSync,
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

  const stampedIssue: SystemIssueReport = {
    ...issue,
    updatedAt: issue.updatedAt || new Date().toISOString(),
  };
  const cleanIssue = cleanForFirestore(stampedIssue);
  const currentList = (masterDocCache.bundledIssues || []).filter(
    (i) => i && i.id && !deletedIssueIds.has(i.id)
  );
  const existingIdx = currentList.findIndex((i) => i.id === cleanIssue.id);
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
