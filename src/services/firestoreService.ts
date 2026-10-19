import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDoc,
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
import { INITIAL_REPORTS } from '../data/seedData';
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

// 1. REPORTS
export function subscribeReports(
  onData: (reports: DOEReport[]) => void,
  onError?: (err: unknown) => void
) {
  const colRef = collection(db, REPORTS_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
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
      // Sort newest first
      list.sort((a, b) => (b.reportDate || '').localeCompare(a.reportDate || ''));
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      console.warn('Firestore reports stream status:', error);
    }
  );
}

export async function saveReportOnline(report: DOEReport): Promise<void> {
  const sanitized = sanitizeReport(report);
  if (!sanitized) return;
  const docRef = doc(db, REPORTS_COLLECTION, sanitized.id);
  const trashRef = doc(db, DELETED_REPORTS_COLLECTION, sanitized.id);
  const cleanReport = JSON.parse(
    JSON.stringify(sanitized, (_, val) => (val === undefined ? null : val))
  );

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await setDoc(docRef, cleanReport, { merge: true });
      await deleteDoc(trashRef).catch(() => {});
      return;
    } catch (error) {
      lastError = error;
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
    console.warn('Could not purge ghost report:', reportId, err);
  }
}

export async function deleteReportOnline(report: DOEReport): Promise<void> {
  const docRef = doc(db, REPORTS_COLLECTION, report.id);
  const trashRef = doc(db, DELETED_REPORTS_COLLECTION, report.id);
  try {
    // 1. Safely archive to trash collection first so all listeners know this ID is deleted
    const sanitized = sanitizeReport(report);
    if (sanitized) {
      const cleanReport = JSON.parse(
        JSON.stringify(sanitized, (_, val) => (val === undefined ? null : val))
      );
      await setDoc(trashRef, cleanReport).catch((err) =>
        console.warn('Could not archive to trash collection:', err)
      );
    }

    // 2. Delete from active reports immediately so it disappears from UI and Firestore
    await deleteDoc(docRef);

    // 3. Also ensure any document with matching internal id is removed from active reports
    const snap = await getDocs(collection(db, REPORTS_COLLECTION));
    const extraDeletes: Promise<void>[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (d.id === report.id || data?.id === report.id) {
        extraDeletes.push(deleteDoc(d.ref));
      }
    });
    if (extraDeletes.length > 0) {
      await Promise.all(extraDeletes);
    }
  } catch (error) {
    console.error('Delete report online error, attempting fallback deleteDoc:', error);
    try {
      await deleteDoc(docRef);
    } catch (err2) {
      handleFirestoreError(err2, OperationType.DELETE, `${REPORTS_COLLECTION}/${report.id}`);
    }
  }
}

export async function restoreReportOnline(report: DOEReport): Promise<void> {
  const sanitized = sanitizeReport(report);
  if (!sanitized) return;
  const docRef = doc(db, REPORTS_COLLECTION, sanitized.id);
  const trashRef = doc(db, DELETED_REPORTS_COLLECTION, sanitized.id);
  try {
    const cleanReport = JSON.parse(
      JSON.stringify(sanitized, (_, val) => (val === undefined ? null : val))
    );
    await deleteDoc(trashRef).catch(console.warn);
    await setDoc(docRef, cleanReport);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${REPORTS_COLLECTION}/${sanitized.id}`);
  }
}

export function subscribeDeletedReports(
  onData: (reports: DOEReport[]) => void,
  onError?: (err: unknown) => void
) {
  const colRef = collection(db, DELETED_REPORTS_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
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
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      console.warn('Firestore deleted_reports stream status:', error);
    }
  );
}

// 2. OFFICES
export function subscribeOffices(
  onData: (offices: EmploymentOffice[]) => void,
  onError?: (err: unknown) => void
) {
  const colRef = collection(db, OFFICES_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: EmploymentOffice[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as EmploymentOffice);
      });
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      console.warn('Firestore offices stream status:', error);
    }
  );
}

export async function saveOfficeOnline(office: EmploymentOffice): Promise<void> {
  const docRef = doc(db, OFFICES_COLLECTION, office.id);
  try {
    await setDoc(docRef, office, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${OFFICES_COLLECTION}/${office.id}`);
  }
}

export async function deleteOfficeOnline(office: EmploymentOffice): Promise<void> {
  const docRef = doc(db, OFFICES_COLLECTION, office.id);
  const trashRef = doc(db, DELETED_OFFICES_COLLECTION, office.id);
  try {
    await setDoc(trashRef, office);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${OFFICES_COLLECTION}/${office.id}`);
  }
}

export async function restoreOfficeOnline(office: EmploymentOffice): Promise<void> {
  const docRef = doc(db, OFFICES_COLLECTION, office.id);
  const trashRef = doc(db, DELETED_OFFICES_COLLECTION, office.id);
  try {
    await setDoc(docRef, office);
    await deleteDoc(trashRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${OFFICES_COLLECTION}/${office.id}`);
  }
}

export function subscribeDeletedOffices(
  onData: (offices: EmploymentOffice[]) => void,
  onError?: (err: unknown) => void
) {
  const colRef = collection(db, DELETED_OFFICES_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: EmploymentOffice[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as EmploymentOffice);
      });
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      console.warn('Firestore deleted_offices stream status:', error);
    }
  );
}

// 3. CATEGORIES
export function subscribeCategories(
  onData: (cats: ReportCategory[]) => void,
  onError?: (err: unknown) => void
) {
  const colRef = collection(db, CATEGORIES_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: ReportCategory[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as ReportCategory);
      });
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      console.warn('Firestore categories stream status:', error);
    }
  );
}

export async function saveCategoryOnline(category: ReportCategory): Promise<void> {
  const docRef = doc(db, CATEGORIES_COLLECTION, category.id);
  try {
    await setDoc(docRef, category, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${CATEGORIES_COLLECTION}/${category.id}`);
  }
}

export async function saveAllCategoriesOnline(categories: ReportCategory[]): Promise<void> {
  try {
    const batch = writeBatch(db);
    for (const cat of categories) {
      const docRef = doc(db, CATEGORIES_COLLECTION, cat.id);
      batch.set(docRef, cat, { merge: true });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, CATEGORIES_COLLECTION);
  }
}

// 3.1 QUEUE METRICS (สถานะคิวและการให้บริการประจำวัน)
export function subscribeQueueMetrics(
  onData: (metrics: QueueMetricCategory[]) => void,
  onError?: (err: unknown) => void
) {
  const colRef = collection(db, QUEUE_METRICS_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: QueueMetricCategory[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as QueueMetricCategory);
      });
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      console.warn('Firestore queue_metrics stream status:', error);
    }
  );
}

export async function saveQueueMetricOnline(metric: QueueMetricCategory): Promise<void> {
  const docRef = doc(db, QUEUE_METRICS_COLLECTION, metric.id);
  try {
    await setDoc(docRef, metric, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${QUEUE_METRICS_COLLECTION}/${metric.id}`);
  }
}

export async function saveAllQueueMetricsOnline(metrics: QueueMetricCategory[]): Promise<void> {
  try {
    const batch = writeBatch(db);
    for (const m of metrics) {
      const docRef = doc(db, QUEUE_METRICS_COLLECTION, m.id);
      batch.set(docRef, m, { merge: true });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, QUEUE_METRICS_COLLECTION);
  }
}

export async function deleteQueueMetricOnline(metricId: string): Promise<void> {
  const docRef = doc(db, QUEUE_METRICS_COLLECTION, metricId);
  try {
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${QUEUE_METRICS_COLLECTION}/${metricId}`);
  }
}

// 4. REPORTERS
export function subscribeReporters(
  onData: (reporters: ReporterProfile[]) => void,
  onError?: (err: unknown) => void
) {
  const colRef = collection(db, REPORTERS_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: ReporterProfile[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as ReporterProfile);
      });
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      console.warn('Firestore reporters stream status:', error);
    }
  );
}

export async function saveReporterOnline(reporter: ReporterProfile): Promise<void> {
  const docRef = doc(db, REPORTERS_COLLECTION, reporter.id);
  try {
    await setDoc(docRef, reporter, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${REPORTERS_COLLECTION}/${reporter.id}`);
  }
}

export async function saveAllReportersOnline(reporters: ReporterProfile[]): Promise<void> {
  try {
    const batch = writeBatch(db);
    for (const rep of reporters) {
      const docRef = doc(db, REPORTERS_COLLECTION, rep.id);
      batch.set(docRef, rep, { merge: true });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, REPORTERS_COLLECTION);
  }
}

// 5. SYSTEM CONFIG
export function subscribeSystemConfig(
  onData: (config: SystemConfig) => void,
  onError?: (err: unknown) => void
) {
  const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as SystemConfig;
        onData(data);
      }
    },
    (error) => {
      if (onError) onError(error);
      console.warn('Firestore system_config stream status:', error);
    }
  );
}

export async function saveSystemConfigOnline(config: SystemConfig): Promise<void> {
  const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
  try {
    await setDoc(docRef, config, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${CONFIG_COLLECTION}/${CONFIG_DOC_ID}`);
  }
}

// 6. INITIAL SYNC / SEED
export async function clearAllReportsOnline(): Promise<void> {
  try {
    // Archive active reports to deleted_reports before removing from active reports collection
    const reportSnap = await getDocs(collection(db, REPORTS_COLLECTION));
    for (const docSnap of reportSnap.docs) {
      const data = docSnap.data();
      const trashRef = doc(db, DELETED_REPORTS_COLLECTION, docSnap.id);
      await setDoc(trashRef, data, { merge: true }).catch((e) =>
        console.warn('Could not archive doc before clear:', docSnap.id, e)
      );
      await deleteDoc(docSnap.ref).catch((e) =>
        console.warn('Could not delete doc:', docSnap.id, e)
      );
    }
  } catch (err) {
    console.warn('Error clearing reports online for production:', err);
  }
}

export async function initializeFirestoreIfEmpty(): Promise<{
  reportsSeeded: boolean;
  officesSeeded: boolean;
}> {
  const reportsSeeded = false;
  let officesSeeded = false;

  try {
    // Fast-path check: if system_config/main_config already exists, skip full collection scans
    // so concurrent users don't trigger 5 collection reads on every page load
    const configDocRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
    const configDocSnap = await getDoc(configDocRef);
    if (configDocSnap.exists()) {
      return { reportsSeeded: false, officesSeeded: false };
    }

    // Parallel check when initializing for the very first time
    const [officesSnap, categoriesSnap, queueMetricsSnap, reportersSnap] = await Promise.all([
      getDocs(collection(db, OFFICES_COLLECTION)),
      getDocs(collection(db, CATEGORIES_COLLECTION)),
      getDocs(collection(db, QUEUE_METRICS_COLLECTION)),
      getDocs(collection(db, REPORTERS_COLLECTION)),
    ]);

    if (officesSnap.empty) {
      const chunkSize = 200;
      for (let i = 0; i < EMPLOYMENT_OFFICES.length; i += chunkSize) {
        const chunk = EMPLOYMENT_OFFICES.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const office of chunk) {
          const docRef = doc(db, OFFICES_COLLECTION, office.id);
          batch.set(docRef, office);
        }
        await batch.commit();
      }
      officesSeeded = true;
    }

    if (categoriesSnap.empty) {
      const batch = writeBatch(db);
      for (const cat of DEFAULT_CATEGORIES) {
        const docRef = doc(db, CATEGORIES_COLLECTION, cat.id);
        batch.set(docRef, cat);
      }
      await batch.commit();
    }

    if (queueMetricsSnap.empty) {
      const batch = writeBatch(db);
      for (const qm of DEFAULT_QUEUE_METRICS) {
        const docRef = doc(db, QUEUE_METRICS_COLLECTION, qm.id);
        batch.set(docRef, qm);
      }
      await batch.commit();
    }

    if (reportersSnap.empty) {
      const batch = writeBatch(db);
      for (const rep of DEFAULT_REPORTERS) {
        const docRef = doc(db, REPORTERS_COLLECTION, rep.id);
        batch.set(docRef, rep);
      }
      await batch.commit();
    }

    await setDoc(configDocRef, DEFAULT_SYSTEM_CONFIG, { merge: true });
  } catch (err) {
    console.warn('Initial online sync warning:', err);
  }

  return { reportsSeeded, officesSeeded };
}

// 7. SYSTEM ISSUES & TROUBLE REPORTS
export async function reportSystemIssueOnline(issue: SystemIssueReport): Promise<void> {
  const docRef = doc(db, ISSUES_COLLECTION, issue.id);
  try {
    await setDoc(docRef, issue);
  } catch (error) {
    console.warn('Could not save issue online, saved locally:', error);
  }
}

export async function deleteSystemIssueOnline(issueId: string): Promise<void> {
  const docRef = doc(db, ISSUES_COLLECTION, issueId);
  try {
    await deleteDoc(docRef);
  } catch (error) {
    console.warn('Could not delete issue online:', error);
  }
}

export async function clearAllSystemIssuesOnline(): Promise<void> {
  try {
    const snap = await getDocs(collection(db, ISSUES_COLLECTION));
    const batch = writeBatch(db);
    snap.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  } catch (error) {
    console.warn('Could not clear all issues online:', error);
  }
}

export function subscribeSystemIssues(
  onData: (issues: SystemIssueReport[]) => void,
  onError?: (err: unknown) => void
) {
  const colRef = collection(db, ISSUES_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: SystemIssueReport[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as SystemIssueReport);
      });
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      console.warn('Issues subscription status:', error);
    }
  );
}
