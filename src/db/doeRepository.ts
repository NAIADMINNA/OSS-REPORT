import fs from 'fs';
import path from 'path';
import { eq, sql } from 'drizzle-orm';
import { db } from './index.ts';
import { doeReports, doeMasterState } from './schema.ts';
import type { DOEReport } from '../types/doe.ts';

const MASTER_CONFIG_ID = 'main_config';
const MIRROR_DIR = path.resolve(process.cwd(), '.data');
const MIRROR_FILE = path.join(MIRROR_DIR, 'doe_cloudsql_mirror.json');
const SRC_SEED_FILE = path.resolve(process.cwd(), 'src/data/doe_cloudsql_seed.json');
const PUBLIC_SEED_FILE = path.resolve(process.cwd(), 'public/doe_cloudsql_seed.json');
const DIST_SEED_FILE = path.resolve(process.cwd(), 'dist/doe_cloudsql_seed.json');

interface ServerMirrorState {
  reports: Record<string, { report: DOEReport; isDeleted: boolean; updatedAtMs: number }>;
  masterConfig: Record<string, unknown> | null;
}

let memoryMirror: ServerMirrorState | null = null;

function loadMirror(): ServerMirrorState {
  if (memoryMirror) return memoryMirror;
  const mergedReports: Record<
    string,
    { report: DOEReport; isDeleted: boolean; updatedAtMs: number }
  > = {};
  let mergedMasterConfig: Record<string, unknown> | null = null;

  for (const candidatePath of [SRC_SEED_FILE, PUBLIC_SEED_FILE, DIST_SEED_FILE, MIRROR_FILE]) {
    try {
      if (fs.existsSync(candidatePath)) {
        const raw = fs.readFileSync(candidatePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (parsed.reports && typeof parsed.reports === 'object') {
            for (const [id, entry] of Object.entries(parsed.reports)) {
              const typedEntry = entry as {
                report: DOEReport;
                isDeleted: boolean;
                updatedAtMs: number;
              };
              if (!typedEntry || !typedEntry.report) continue;
              const prev = mergedReports[id];
              if (!prev || (typedEntry.updatedAtMs || 0) >= (prev.updatedAtMs || 0)) {
                mergedReports[id] = typedEntry;
              }
            }
          }
          if (parsed.masterConfig && typeof parsed.masterConfig === 'object') {
            mergedMasterConfig = {
              ...(mergedMasterConfig || {}),
              ...(parsed.masterConfig as Record<string, unknown>),
            };
          }
        }
      }
    } catch {
      // Ignore candidate read error
    }
  }

  memoryMirror = {
    reports: mergedReports,
    masterConfig: mergedMasterConfig,
  };
  return memoryMirror;
}

function saveMirror(state: ServerMirrorState): void {
  memoryMirror = state;
  const serialized = JSON.stringify(state);
  try {
    if (!fs.existsSync(MIRROR_DIR)) {
      fs.mkdirSync(MIRROR_DIR, { recursive: true });
    }
    fs.writeFileSync(MIRROR_FILE, serialized, 'utf-8');
  } catch {
    // Ignore mirror write error
  }
  for (const seedPath of [SRC_SEED_FILE, PUBLIC_SEED_FILE, DIST_SEED_FILE]) {
    try {
      const dir = path.dirname(seedPath);
      if (fs.existsSync(dir)) {
        fs.writeFileSync(seedPath, serialized, 'utf-8');
      }
    } catch {
      // Ignore read-only filesystem in production container
    }
  }
}

function getReportTimestampMs(r?: Partial<DOEReport> | null): number {
  if (!r) return 0;
  const ts = r.updatedAt || r.createdAt || '';
  if (!ts) return 0;
  const parsed = Date.parse(String(ts));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function pickNewerReport(existing: DOEReport | undefined, incoming: DOEReport): DOEReport {
  if (!existing) return incoming;
  const existMs = getReportTimestampMs(existing);
  const incMs = getReportTimestampMs(incoming);
  if (existMs > 0 && incMs > 0 && existMs !== incMs) {
    return incMs >= existMs ? incoming : existing;
  }
  return incoming;
}

function isTransientSqlConnectionError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? `${err.message} ${(err as { cause?: unknown }).cause || ''}`
      : String(err || '');
  return (
    msg.includes('Connection terminated unexpectedly') ||
    msg.includes('ENOENT') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('Client has encountered a connection error') ||
    msg.includes('terminating connection') ||
    msg.includes('timeout')
  );
}

async function withSqlRetry<T>(operation: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isTransientSqlConnectionError(err)) {
        await new Promise((r) => setTimeout(r, attempt * 250));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

let isSqlWriteInProgress = false;
const pendingSqlSyncQueue: (() => Promise<void>)[] = [];

function enqueueBackgroundSqlSync(task: () => Promise<void>) {
  pendingSqlSyncQueue.push(task);
  if (isSqlWriteInProgress) return;
  isSqlWriteInProgress = true;
  (async () => {
    while (pendingSqlSyncQueue.length > 0) {
      const nextTask = pendingSqlSyncQueue.shift();
      if (nextTask) {
        try {
          await nextTask();
        } catch {
          // Transient SQL error handled silently; mirror state remains intact
        }
      }
    }
    isSqlWriteInProgress = false;
  })();
}

const DEFAULT_GSHEETS_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbyMiKbkdTrInFBml_jU8z9caIjyQCTNxkYwH7jb1qFiXQLrERWTwS6e9wd_Iz5T8fG_GQ/exec';

let lastGoogleSheetsPullAtMs = 0;
let isPullingFromGoogleSheets = false;

async function syncFromGoogleSheetsIntoSqlIfDue(mirror: ServerMirrorState): Promise<boolean> {
  if (isPullingFromGoogleSheets) return false;
  const now = Date.now();
  if (now - lastGoogleSheetsPullAtMs < 20000) return false;

  const configuredUrl =
    typeof mirror.masterConfig?.googleSheetsWebhookUrl === 'string' &&
    mirror.masterConfig.googleSheetsWebhookUrl.trim().startsWith('https://script.google.com/')
      ? mirror.masterConfig.googleSheetsWebhookUrl.trim()
      : DEFAULT_GSHEETS_WEBHOOK_URL;

  if (!configuredUrl) return false;

  isPullingFromGoogleSheets = true;
  lastGoogleSheetsPullAtMs = now;
  let updatedAny = false;

  try {
    const res = await fetch(configuredUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'follow',
    });
    if (res.ok) {
      const data = (await res.json()) as { reports?: DOEReport[] };
      if (Array.isArray(data?.reports)) {
        const deltaRows: typeof doeReports.$inferInsert[] = [];
        const nowIso = new Date().toISOString();

        for (const raw of data.reports) {
          if (!raw || !raw.id || raw.id === 'report-test-123') continue;
          const existingEntry = mirror.reports[raw.id];
          if (existingEntry && existingEntry.isDeleted) continue;

          const incomingMs = getReportTimestampMs(raw);
          const existingMs = existingEntry ? getReportTimestampMs(existingEntry.report) : 0;

          if (!existingEntry || incomingMs > existingMs) {
            const winner = existingEntry
              ? pickNewerReport(existingEntry.report, raw)
              : raw;
            mirror.reports[winner.id] = {
              report: winner,
              isDeleted: false,
              updatedAtMs: Math.max(incomingMs, existingEntry?.updatedAtMs || 0, now),
            };
            deltaRows.push({
              id: winner.id,
              reportDate: winner.reportDate || '',
              officeId: winner.officeId || '',
              officeName: winner.officeName || '',
              centerName: winner.centerName || '',
              region: winner.region || 'กรุงเทพมหานคร',
              payload: winner,
              isDeleted: false,
              updatedAt: winner.updatedAt || nowIso,
            });
            updatedAny = true;
          }
        }

        if (deltaRows.length > 0) {
          enqueueBackgroundSqlSync(async () => {
            const BATCH_SIZE = 50;
            for (let i = 0; i < deltaRows.length; i += BATCH_SIZE) {
              const chunk = deltaRows.slice(i, i + BATCH_SIZE);
              if (chunk.length === 0) continue;
              await db
                .insert(doeReports)
                .values(chunk)
                .onConflictDoUpdate({
                  target: doeReports.id,
                  set: {
                    reportDate: sql`excluded.report_date`,
                    officeId: sql`excluded.office_id`,
                    officeName: sql`excluded.office_name`,
                    centerName: sql`excluded.center_name`,
                    region: sql`excluded.region`,
                    payload: sql`excluded.payload`,
                    isDeleted: sql`excluded.is_deleted`,
                    updatedAt: sql`excluded.updated_at`,
                  },
                });
            }
          });
        }
      }
    }
  } catch {
    // Non-fatal if offline or Google Apps Script temporarily busy
  } finally {
    isPullingFromGoogleSheets = false;
  }

  return updatedAny;
}

/**
 * Fetch all DOE reports (active and soft-deleted) from Cloud SQL + Google Sheets + local mirror
 */
export async function getAllReportsFromSql(): Promise<{
  activeReports: DOEReport[];
  deletedReports: DOEReport[];
}> {
  const mirror = loadMirror();
  let mirrorUpdated = false;

  try {
    const rows = await withSqlRetry(() => db.select().from(doeReports), 2);
    for (const row of rows) {
      if (!row.id || row.id === 'report-test-123') continue;
      const payload = (
        typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
      ) as DOEReport;
      if (!payload || typeof payload !== 'object') continue;
      const report: DOEReport = {
        ...payload,
        id: payload.id || row.id,
        reportDate: payload.reportDate || row.reportDate,
        officeId: payload.officeId || row.officeId,
        officeName: payload.officeName || row.officeName,
        centerName: payload.centerName || row.centerName || '',
        region: (payload.region || row.region) as DOEReport['region'],
      };
      const rowMs = getReportTimestampMs(report);
      const existingEntry = mirror.reports[report.id];
      if (!existingEntry || rowMs >= existingEntry.updatedAtMs) {
        mirror.reports[report.id] = {
          report: existingEntry ? pickNewerReport(existingEntry.report, report) : report,
          isDeleted: Boolean(row.isDeleted),
          updatedAtMs: Math.max(rowMs, existingEntry?.updatedAtMs || 0),
        };
        mirrorUpdated = true;
      }
    }
  } catch {
    // Serve seamlessly from mirror when Cloud SQL socket is reconnecting
  }

  const sheetsUpdated = await syncFromGoogleSheetsIntoSqlIfDue(mirror);
  if (mirrorUpdated || sheetsUpdated) {
    saveMirror(mirror);
  }

  const activeMap = new Map<string, DOEReport>();
  const deletedMap = new Map<string, DOEReport>();

  for (const [id, entry] of Object.entries(mirror.reports)) {
    if (!entry || !entry.report || id === 'report-test-123') continue;
    if (entry.isDeleted) {
      deletedMap.set(id, entry.report);
    } else {
      activeMap.set(id, entry.report);
    }
  }

  const activeReports = Array.from(activeMap.values()).sort((a, b) =>
    (b.reportDate || '').localeCompare(a.reportDate || '')
  );
  const deletedReports = Array.from(deletedMap.values()).sort((a, b) =>
    (b.reportDate || '').localeCompare(a.reportDate || '')
  );

  return { activeReports, deletedReports };
}

/**
 * Upsert a single DOE report into Cloud SQL (preserving newer timestamp)
 */
export async function upsertReportInSql(
  report: DOEReport,
  isDeleted = false
): Promise<DOEReport> {
  const mirror = loadMirror();
  const existingEntry = mirror.reports[report.id];
  const finalReport = existingEntry
    ? pickNewerReport(existingEntry.report, report)
    : report;
  const nowIso = finalReport.updatedAt || new Date().toISOString();

  mirror.reports[report.id] = {
    report: finalReport,
    isDeleted,
    updatedAtMs: Math.max(getReportTimestampMs(finalReport), Date.now()),
  };
  saveMirror(mirror);

  try {
    await withSqlRetry(
      () =>
        db
          .insert(doeReports)
          .values({
            id: finalReport.id,
            reportDate: finalReport.reportDate || '',
            officeId: finalReport.officeId || '',
            officeName: finalReport.officeName || '',
            centerName: finalReport.centerName || '',
            region: finalReport.region || 'กรุงเทพมหานคร',
            payload: finalReport,
            isDeleted,
            updatedAt: nowIso,
          })
          .onConflictDoUpdate({
            target: doeReports.id,
            set: {
              reportDate: finalReport.reportDate || '',
              officeId: finalReport.officeId || '',
              officeName: finalReport.officeName || '',
              centerName: finalReport.centerName || '',
              region: finalReport.region || 'กรุงเทพมหานคร',
              payload: finalReport,
              isDeleted,
              updatedAt: nowIso,
            },
          }),
      2
    );
  } catch {
    // Queued for background sync if transient socket drop occurred
    enqueueBackgroundSqlSync(async () => {
      await db
        .insert(doeReports)
        .values({
          id: finalReport.id,
          reportDate: finalReport.reportDate || '',
          officeId: finalReport.officeId || '',
          officeName: finalReport.officeName || '',
          centerName: finalReport.centerName || '',
          region: finalReport.region || 'กรุงเทพมหานคร',
          payload: finalReport,
          isDeleted,
          updatedAt: nowIso,
        })
        .onConflictDoUpdate({
          target: doeReports.id,
          set: {
            reportDate: finalReport.reportDate || '',
            officeId: finalReport.officeId || '',
            officeName: finalReport.officeName || '',
            centerName: finalReport.centerName || '',
            region: finalReport.region || 'กรุงเทพมหานคร',
            payload: finalReport,
            isDeleted,
            updatedAt: nowIso,
          },
        });
    });
  }

  return finalReport;
}

/**
 * Bulk upsert DOE reports into Cloud SQL safely in multi-row batches
 */
export async function upsertBulkReportsInSql(
  reports: DOEReport[],
  restoreDeleted = false
): Promise<DOEReport[]> {
  if (!Array.isArray(reports) || reports.length === 0) {
    const { activeReports } = await getAllReportsFromSql();
    return activeReports;
  }

  const mirror = loadMirror();
  const dedupedSyncMap = new Map<string, typeof doeReports.$inferInsert>();
  const nowIso = new Date().toISOString();

  for (const incoming of reports) {
    if (!incoming || !incoming.id || incoming.id === 'report-test-123') continue;
    const existingEntry = mirror.reports[incoming.id];
    if (existingEntry && existingEntry.isDeleted && !restoreDeleted) {
      continue;
    }
    const winner = existingEntry
      ? pickNewerReport(existingEntry.report, incoming)
      : incoming;
    mirror.reports[incoming.id] = {
      report: winner,
      isDeleted: false,
      updatedAtMs: Math.max(getReportTimestampMs(winner), Date.now()),
    };
    dedupedSyncMap.set(winner.id, {
      id: winner.id,
      reportDate: winner.reportDate || '',
      officeId: winner.officeId || '',
      officeName: winner.officeName || '',
      centerName: winner.centerName || '',
      region: winner.region || 'กรุงเทพมหานคร',
      payload: winner,
      isDeleted: false,
      updatedAt: winner.updatedAt || nowIso,
    });
  }

  saveMirror(mirror);

  const toSyncList = Array.from(dedupedSyncMap.values());
  if (toSyncList.length > 0) {
    const runBatchInsert = async () => {
      const BATCH_SIZE = 50;
      for (let i = 0; i < toSyncList.length; i += BATCH_SIZE) {
        const chunk = toSyncList.slice(i, i + BATCH_SIZE);
        if (chunk.length === 0) continue;
        await withSqlRetry(
          () =>
            db
              .insert(doeReports)
              .values(chunk)
              .onConflictDoUpdate({
                target: doeReports.id,
                set: {
                  reportDate: sql`excluded.report_date`,
                  officeId: sql`excluded.office_id`,
                  officeName: sql`excluded.office_name`,
                  centerName: sql`excluded.center_name`,
                  region: sql`excluded.region`,
                  payload: sql`excluded.payload`,
                  isDeleted: sql`excluded.is_deleted`,
                  updatedAt: sql`excluded.updated_at`,
                },
              }),
          2
        );
      }
    };

    try {
      await runBatchInsert();
    } catch {
      enqueueBackgroundSqlSync(runBatchInsert);
    }
  }

  const { activeReports } = await getAllReportsFromSql();
  return activeReports;
}

/**
 * Soft-delete a report (move to trash)
 */
export async function softDeleteReportInSql(report: DOEReport): Promise<void> {
  await upsertReportInSql(report, true);
}

/**
 * Hard-delete / purge a report permanently
 */
export async function hardDeleteReportInSql(reportId: string): Promise<void> {
  const mirror = loadMirror();
  delete mirror.reports[reportId];
  saveMirror(mirror);

  try {
    await withSqlRetry(() => db.delete(doeReports).where(eq(doeReports.id, reportId)), 2);
  } catch {
    enqueueBackgroundSqlSync(async () => {
      await db.delete(doeReports).where(eq(doeReports.id, reportId));
    });
  }
}

/**
 * Clear all active reports (move them to trash)
 */
export async function clearAllActiveReportsInSql(): Promise<void> {
  const mirror = loadMirror();
  for (const key of Object.keys(mirror.reports)) {
    if (mirror.reports[key]) {
      mirror.reports[key].isDeleted = true;
      mirror.reports[key].updatedAtMs = Date.now();
    }
  }
  saveMirror(mirror);

  const nowIso = new Date().toISOString();
  try {
    await withSqlRetry(
      () =>
        db
          .update(doeReports)
          .set({ isDeleted: true, updatedAt: nowIso })
          .where(eq(doeReports.isDeleted, false)),
      2
    );
  } catch {
    enqueueBackgroundSqlSync(async () => {
      await db
        .update(doeReports)
        .set({ isDeleted: true, updatedAt: nowIso })
        .where(eq(doeReports.isDeleted, false));
    });
  }
}

/**
 * Restore all soft-deleted reports back to active
 */
export async function restoreAllTrashReportsInSql(): Promise<DOEReport[]> {
  const mirror = loadMirror();
  for (const key of Object.keys(mirror.reports)) {
    if (mirror.reports[key]) {
      mirror.reports[key].isDeleted = false;
      mirror.reports[key].updatedAtMs = Date.now();
    }
  }
  saveMirror(mirror);

  const nowIso = new Date().toISOString();
  try {
    await withSqlRetry(
      () =>
        db
          .update(doeReports)
          .set({ isDeleted: false, updatedAt: nowIso })
          .where(eq(doeReports.isDeleted, true)),
      2
    );
  } catch {
    enqueueBackgroundSqlSync(async () => {
      await db
        .update(doeReports)
        .set({ isDeleted: false, updatedAt: nowIso })
        .where(eq(doeReports.isDeleted, true));
    });
  }

  const { activeReports } = await getAllReportsFromSql();
  return activeReports;
}

/**
 * Get the master state (system config, offices, categories, queue metrics, reporters, issues)
 */
export async function getMasterStateFromSql(): Promise<Record<string, unknown> | null> {
  const mirror = loadMirror();
  try {
    const rows = await withSqlRetry(
      () => db.select().from(doeMasterState).where(eq(doeMasterState.id, MASTER_CONFIG_ID)),
      2
    );
    if (rows.length > 0 && rows[0].payload) {
      const payload =
        typeof rows[0].payload === 'string'
          ? JSON.parse(rows[0].payload)
          : rows[0].payload;
      if (payload && typeof payload === 'object') {
        mirror.masterConfig = {
          ...(mirror.masterConfig || {}),
          ...(payload as Record<string, unknown>),
        };
        saveMirror(mirror);
      }
    }
  } catch {
    // Fallback to mirror state if socket is mid-reconnect
  }
  return mirror.masterConfig;
}

/**
 * Upsert/merge the master state in Cloud SQL
 */
export async function upsertMasterStateInSql(
  partialPayload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const mirror = loadMirror();
  const nowIso = new Date().toISOString();
  const merged: Record<string, unknown> = {
    ...(mirror.masterConfig || {}),
    ...partialPayload,
    updatedAt: nowIso,
  };
  mirror.masterConfig = merged;
  saveMirror(mirror);

  try {
    await withSqlRetry(
      () =>
        db
          .insert(doeMasterState)
          .values({
            id: MASTER_CONFIG_ID,
            payload: merged,
            updatedAt: nowIso,
          })
          .onConflictDoUpdate({
            target: doeMasterState.id,
            set: {
              payload: merged,
              updatedAt: nowIso,
            },
          }),
      2
    );
  } catch {
    enqueueBackgroundSqlSync(async () => {
      await db
        .insert(doeMasterState)
        .values({
          id: MASTER_CONFIG_ID,
          payload: merged,
          updatedAt: nowIso,
        })
        .onConflictDoUpdate({
          target: doeMasterState.id,
          set: {
            payload: merged,
            updatedAt: nowIso,
          },
        });
    });
  }

  return merged;
}
