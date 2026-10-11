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
  ReportCategory,
  ReporterProfile,
  SystemConfig,
} from '../types/doe';
import { INITIAL_REPORTS } from '../data/seedData';
import { EMPLOYMENT_OFFICES } from '../data/offices';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_REPORTERS,
  DEFAULT_SYSTEM_CONFIG,
} from '../data/initialAdminData';

const REPORTS_COLLECTION = 'reports';
const OFFICES_COLLECTION = 'offices';
const CATEGORIES_COLLECTION = 'categories';
const REPORTERS_COLLECTION = 'reporters';
const CONFIG_COLLECTION = 'system_config';
const CONFIG_DOC_ID = 'main_config';
const DELETED_REPORTS_COLLECTION = 'deleted_reports';
const DELETED_OFFICES_COLLECTION = 'deleted_offices';

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
        list.push(docSnap.data() as DOEReport);
      });
      // Sort newest first
      list.sort((a, b) => (b.reportDate || '').localeCompare(a.reportDate || ''));
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, REPORTS_COLLECTION);
    }
  );
}

export async function saveReportOnline(report: DOEReport): Promise<void> {
  const docRef = doc(db, REPORTS_COLLECTION, report.id);
  try {
    await setDoc(docRef, report, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${REPORTS_COLLECTION}/${report.id}`);
  }
}

export async function deleteReportOnline(report: DOEReport): Promise<void> {
  const docRef = doc(db, REPORTS_COLLECTION, report.id);
  const trashRef = doc(db, DELETED_REPORTS_COLLECTION, report.id);
  try {
    // Add to trash and delete from active
    await setDoc(trashRef, report);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${REPORTS_COLLECTION}/${report.id}`);
  }
}

export async function restoreReportOnline(report: DOEReport): Promise<void> {
  const docRef = doc(db, REPORTS_COLLECTION, report.id);
  const trashRef = doc(db, DELETED_REPORTS_COLLECTION, report.id);
  try {
    await setDoc(docRef, report);
    await deleteDoc(trashRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${REPORTS_COLLECTION}/${report.id}`);
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
        list.push(docSnap.data() as DOEReport);
      });
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, DELETED_REPORTS_COLLECTION);
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
      handleFirestoreError(error, OperationType.GET, OFFICES_COLLECTION);
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
      handleFirestoreError(error, OperationType.GET, DELETED_OFFICES_COLLECTION);
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
      handleFirestoreError(error, OperationType.GET, CATEGORIES_COLLECTION);
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
      handleFirestoreError(error, OperationType.GET, REPORTERS_COLLECTION);
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
      handleFirestoreError(error, OperationType.GET, `${CONFIG_COLLECTION}/${CONFIG_DOC_ID}`);
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
export async function initializeFirestoreIfEmpty(): Promise<{
  reportsSeeded: boolean;
  officesSeeded: boolean;
}> {
  let reportsSeeded = false;
  let officesSeeded = false;

  try {
    // Check reports collection
    const reportSnap = await getDocs(collection(db, REPORTS_COLLECTION));
    if (reportSnap.empty) {
      // Seed initial reports
      const batch = writeBatch(db);
      for (const report of INITIAL_REPORTS) {
        const docRef = doc(db, REPORTS_COLLECTION, report.id);
        batch.set(docRef, report);
      }
      await batch.commit();
      reportsSeeded = true;
    }

    // Check offices collection
    const officesSnap = await getDocs(collection(db, OFFICES_COLLECTION));
    if (officesSnap.empty) {
      // Seed initial offices in chunks of 450 (Firestore limit is 500)
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

    // Check categories
    const categoriesSnap = await getDocs(collection(db, CATEGORIES_COLLECTION));
    if (categoriesSnap.empty) {
      const batch = writeBatch(db);
      for (const cat of DEFAULT_CATEGORIES) {
        const docRef = doc(db, CATEGORIES_COLLECTION, cat.id);
        batch.set(docRef, cat);
      }
      await batch.commit();
    }

    // Check reporters
    const reportersSnap = await getDocs(collection(db, REPORTERS_COLLECTION));
    if (reportersSnap.empty) {
      const batch = writeBatch(db);
      for (const rep of DEFAULT_REPORTERS) {
        const docRef = doc(db, REPORTERS_COLLECTION, rep.id);
        batch.set(docRef, rep);
      }
      await batch.commit();
    }

    // Check config
    const configDocRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
    const configSnap = await getDocs(collection(db, CONFIG_COLLECTION));
    if (configSnap.empty) {
      await setDoc(configDocRef, DEFAULT_SYSTEM_CONFIG);
    }
  } catch (err) {
    console.warn('Initial online sync warning:', err);
  }

  return { reportsSeeded, officesSeeded };
}
