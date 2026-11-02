import {
  collection,
  doc,
  setDoc,
  deleteDoc,
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

const REPORTS_COLLECTION = 'reports';
const OFFICES_COLLECTION = 'offices';
const CATEGORIES_COLLECTION = 'categories';
const QUEUE_METRICS_COLLECTION = 'queue_metrics';
const REPORTERS_COLLECTION = 'reporters';
const CONFIG_COLLECTION = 'system_config';
const CONFIG_DOC_ID = 'main_config';
const DELETED_REPORTS_COLLECTION = 'deleted_reports';
const DELETED_OFFICES_COLLECTION = 'deleted_offices';
const ISSUES_COLLECTION = 'system_issues';

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
// Consolidates 7 collections (offices, deleted_offices, categories,
// queue_metrics, reporters, deleted_reports, system_issues, system_config)
// into a SINGLE Firestore document listener (1 Read Unit per session!).
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

function loadInitialMasterCacheFromLocalStorage(): BundledMasterConfig {
  let localOffices: EmploymentOffice[] = [];
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

  try {
    const rawOffices = localStorage.getItem('doe_ss_offices_v1');
    if (rawOffices) {
      const parsed = JSON.parse(rawOffices);
      if (Array.isArray(parsed)) {
        localOffices = parsed.filter((o) => o && o.id && isOfficeCustomized(o));
      }
    }
  } catch {}

  try {
    const rawDelOffices = localStorage.getItem('doe_ss_deleted_offices_v1');
    if (rawDelOffices) {
      const parsed = JSON.parse(rawDelOffices);
      if (Array.isArray(parsed)) localDelOffices = parsed;
    }
  } catch {}

  try {
    const rawCats = localStorage.getItem('doe_ss_categories_v1');
    if (rawCats) {
      const parsed = JSON.parse(rawCats);
      if (Array.isArray(parsed) && parsed.length > 0) {
        localCats = parsed.map((c: ReportCategory, idx: number) => ({ ...c, sortOrder: idx }));
      }
    }
  } catch {}

  try {
    const rawQms = localStorage.getItem('doe_ss_queue_metrics_v1');
    if (rawQms) {
      const parsed = JSON.parse(rawQms);
      if (Array.isArray(parsed) && parsed.length > 0) {
        localQms = parsed.map((m: QueueMetricCategory, idx: number) => ({
          ...m,
          sortOrder: idx,
        }));
      }
    }
  } catch {}

  try {
    const rawReps = localStorage.getItem('doe_ss_reporters_v1');
    if (rawReps) {
      const parsed = JSON.parse(rawReps);
      if (Array.isArray(parsed) && parsed.length > 0) {
        localReps = parsed.map((r: ReporterProfile, idx: number) => ({
          ...r,
          sortOrder: idx,
        }));
      }
    }
  } catch {}

  try {
    const rawCfg = localStorage.getItem('doe_ss_config_v1');
    if (rawCfg) {
      const parsed = JSON.parse(rawCfg);
      if (parsed && parsed.reportTitle) {
        localConfig = { ...DEFAULT_SYSTEM_CONFIG, ...parsed };
      }
    }
  } catch {}

  try {
    const rawDelRep = localStorage.getItem('doe_ss_deleted_reports_v1');
    if (rawDelRep) {
      const parsed = JSON.parse(rawDelRep);
      if (Array.isArray(parsed)) localDelReports = parsed;
    }
  } catch {}

  try {
    const rawIssues = localStorage.getItem('doe_assistant_reported_issues_v1');
    if (rawIssues) {
      const parsed = JSON.parse(rawIssues);
      if (Array.isArray(parsed)) localIssues = parsed;
    }
  } catch {}

  return {
    ...localConfig,
    migrationVersion: 2,
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
  // Always broadcast System Config branding
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
      (o) => o && o.id && o.name
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
      (i) => i && i.id && i.title
    );
    issuesList.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    systemIssuesListeners.forEach((cb) => cb(issuesList));
  }
}

async function persistMasterConfigOnline(partialUpdate: Partial<BundledMasterConfig>): Promise<void> {
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
    migrationVersion: 2,
    updatedAt: new Date().toISOString(),
  };

  // Broadcast locally immediately for zero-latency UI
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

// One-time migration from legacy separate collections into system_config/main_config
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

    const customOfficesMap = new Map<string, EmploymentOffice>();
    (masterDocCache.bundledOffices || []).forEach((o) => {
      if (o && o.id && isOfficeCustomized(o)) customOfficesMap.set(o.id, o);
    });
    officesSnap.forEach((d) => {
      const data = d.data() as EmploymentOffice;
      if (data && data.id && data.name && isOfficeCustomized(data)) {
        customOfficesMap.set(data.id, data);
      }
    });
    const customOffices = Array.from(customOfficesMap.values());

    const delOffices: EmploymentOffice[] = [];
    delOfficesSnap.forEach((d) => {
      const data = d.data() as EmploymentOffice;
      if (data && data.id && data.name) delOffices.push(data);
    });

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
      if (data && (data.id || d.id)) {
        issues.push({ ...data, id: data.id || d.id });
      }
    });

    await persistMasterConfigOnline({
      ...DEFAULT_SYSTEM_CONFIG,
      ...existingConfig,
      migrationVersion: 2,
      bundledOffices:
        customOffices.length > 0 ? customOffices : masterDocCache.bundledOffices || [],
      bundledDeletedOffices:
        delOffices.length > 0 ? delOffices : masterDocCache.bundledDeletedOffices || [],
      bundledCategories:
        cats.length > 0
          ? cats
          : masterDocCache.bundledCategories ||
            DEFAULT_CATEGORIES.map((c, idx) => ({ ...c, sortOrder: idx })),
      bundledQueueMetrics:
        qms.length > 0
          ? qms
          : masterDocCache.bundledQueueMetrics ||
            DEFAULT_QUEUE_METRICS.map((m, idx) => ({ ...m, sortOrder: idx })),
      bundledReporters:
        reps.length > 0
          ? reps
          : masterDocCache.bundledReporters ||
            DEFAULT_REPORTERS.map((r, idx) => ({ ...r, sortOrder: idx })),
      bundledDeletedReports:
        delReports.length > 0
          ? delReports.slice(0, 50)
          : masterDocCache.bundledDeletedReports || [],
      bundledIssues:
        issues.length > 0 ? issues : masterDocCache.bundledIssues || [],
    });
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
        const data = snapshot.data() as BundledMasterConfig;
        const isBundledV2 = (data.migrationVersion || 0) >= 2;
        if (isBundledV2) {
          masterDocCache = {
            ...masterDocCache,
            ...data,
          };
          broadcastMasterState(false);
        } else {
          // Only update branding until legacy collections migration finishes
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
// 1. REPORTS (Individual Documents for Concurrent Multi-Province Submissions)
// ============================================================================
export function subscribeReports(
  onData: (reports: DOEReport[]) => void,
  onError?: (err: unknown) => void
) {
  const colRef = collection(db, REPORTS_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      // Never overwrite local reports with an empty unpopulated cache snapshot
      if (snapshot.metadata.fromCache && snapshot.empty) {
        return;
      }
      const list: DOEReport[] = [];
      snapshot.forEach((docSnap) => {
        const raw = docSnap.data();
        if (docSnap.id === 'report-test-123' || raw?.id === 'report-test-123') {
          deleteDoc(docSnap.ref).catch(() => {});
          return;
        }
        const clean = sanitizeReport({ ...raw, id: raw?.id || docSnap.id });
        if (clean) {
          list.push(clean);
        }
      });
      list.sort((a, b) => (b.reportDate || '').localeCompare(a.reportDate || ''));
      onData(list);
    },
    (error) => {
      logStreamStatus('reports', error, onError);
    }
  );
}

export async function saveReportOnline(report: DOEReport): Promise<void> {
  const sanitized = sanitizeReport(report);
  if (!sanitized) return;
  const docRef = doc(db, REPORTS_COLLECTION, sanitized.id);
  const cleanReport = cleanForFirestore(sanitized);

  const existingDel = masterDocCache.bundledDeletedReports || [];
  if (existingDel.some((r) => r.id === sanitized.id)) {
    const nextDel = existingDel.filter((r) => r.id !== sanitized.id);
    persistMasterConfigOnline({ bundledDeletedReports: nextDel }).catch(() => {});
  }

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await setDoc(docRef, cleanReport, { merge: true });
      return;
    } catch (error) {
      lastError = error;
      if (isQuotaExceededError(error)) {
        logStreamStatus('save_report', error);
        return;
      }
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 600));
      }
    }
  }
  handleFirestoreError(lastError, OperationType.WRITE, `${REPORTS_COLLECTION}/${sanitized.id}`);
}

export async function purgeGhostReportOnline(reportId: string): Promise<void> {
  if (!reportId) return;
  try {
    await deleteDoc(doc(db, REPORTS_COLLECTION, reportId));
  } catch (err) {
    if (!isQuotaExceededError(err)) {
      console.warn('Could not purge ghost report:', reportId, err);
    }
  }
}

export async function deleteReportOnline(report: DOEReport): Promise<void> {
  const docRef = doc(db, REPORTS_COLLECTION, report.id);
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
    await deleteDoc(docRef);
  } catch (error) {
    if (isQuotaExceededError(error)) {
      logStreamStatus('delete_report', error);
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, `${REPORTS_COLLECTION}/${report.id}`);
  }
}

export async function restoreReportOnline(report: DOEReport): Promise<void> {
  const sanitized = sanitizeReport(report);
  if (!sanitized) return;
  const docRef = doc(db, REPORTS_COLLECTION, sanitized.id);
  try {
    const cleanReport = cleanForFirestore(sanitized);
    const nextDel = (masterDocCache.bundledDeletedReports || []).filter(
      (r) => r.id !== sanitized.id
    );
    await persistMasterConfigOnline({ bundledDeletedReports: nextDel }).catch(() => {});
    await setDoc(docRef, cleanReport);
  } catch (error) {
    if (isQuotaExceededError(error)) {
      logStreamStatus('restore_report', error);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, `${REPORTS_COLLECTION}/${sanitized.id}`);
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
// 2. OFFICES (Multiplexed via Bundled Master Config)
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
      (o) => o && o.id && o.name
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
// 3. CATEGORIES (Multiplexed via Bundled Master Config)
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
// 3.1 QUEUE METRICS (Multiplexed via Bundled Master Config)
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
// 4. REPORTERS (Multiplexed via Bundled Master Config)
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
// 5. SYSTEM CONFIG (Multiplexed via Bundled Master Config)
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
    const reportSnap = await getDocs(collection(db, REPORTS_COLLECTION));
    const archived: DOEReport[] = [];
    const batch = writeBatch(db);
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
// 7. SYSTEM ISSUES & TROUBLE REPORTS (Multiplexed via Bundled Master Config)
// ============================================================================
export async function reportSystemIssueOnline(issue: SystemIssueReport): Promise<void> {
  const prev = (masterDocCache.bundledIssues || []).filter((i) => i.id !== issue.id);
  const next = [cleanForFirestore(issue), ...prev];
  await persistMasterConfigOnline({ bundledIssues: next });
}

export async function deleteSystemIssueOnline(issueId: string): Promise<void> {
  const next = (masterDocCache.bundledIssues || []).filter((i) => i.id !== issueId);
  await persistMasterConfigOnline({ bundledIssues: next });
}

export async function clearAllSystemIssuesOnline(): Promise<void> {
  await persistMasterConfigOnline({ bundledIssues: [] });
}

export function subscribeSystemIssues(
  onData: (issues: SystemIssueReport[]) => void,
  onError?: (err: unknown) => void
) {
  systemIssuesListeners.add(onData);
  ensureMasterSubscription(onError);
  if (hasReceivedFirstMasterSnapshot && Array.isArray(masterDocCache.bundledIssues)) {
    const list = [...masterDocCache.bundledIssues].filter((i) => i && i.id && i.title);
    list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    onData(list);
  }
  return () => {
    systemIssuesListeners.delete(onData);
    cleanupMasterSubscriptionIfIdle();
  };
}
