import { DOEReport } from '../types/doe';
import { DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL } from '../data/initialAdminData';
import { sanitizeReport } from './doeUtils';

export const STORAGE_KEY_GSHEETS_URL = 'doe_google_sheets_webhook_url_v1';
export const STORAGE_KEY_GSHEETS_AUTO = 'doe_google_sheets_auto_sync_v1';

export function getStoredGoogleSheetsConfig(): {
  webhookUrl: string;
  autoSync: boolean;
} {
  let webhookUrl = DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL;
  let autoSync = true;
  try {
    const savedUrl = (localStorage.getItem(STORAGE_KEY_GSHEETS_URL) || '').trim();
    if (savedUrl) {
      webhookUrl = savedUrl;
    }
    const rawAuto = localStorage.getItem(STORAGE_KEY_GSHEETS_AUTO);
    if (rawAuto !== null) {
      autoSync = rawAuto !== 'false';
    }
  } catch {}
  return { webhookUrl, autoSync };
}

export function saveStoredGoogleSheetsConfig(webhookUrl: string, autoSync = true) {
  try {
    localStorage.setItem(STORAGE_KEY_GSHEETS_URL, (webhookUrl || '').trim());
    localStorage.setItem(STORAGE_KEY_GSHEETS_AUTO, String(Boolean(autoSync)));
  } catch {}
}

/**
 * โค้ด Google Apps Script สำเร็จรูปสำหรับนำไปวางใน Google Sheets (Extensions -> Apps Script)
 * รองรับทั้งการบันทึกอัตโนมัติรายรายการ (upsert_single), การซิงค์ยกล็อต (upsert_bulk),
 * การลบรายการ (delete_single) และการดึงข้อมูลย้อนกลับเข้าแอป (doGet)
 */
export const GOOGLE_APPS_SCRIPT_TEMPLATE = `/**
 * ระบบสำรองและซิงค์ข้อมูลอัตโนมัติ (DOE Work Permit Reporting System -> Google Sheets)
 * รุ่นผู้บริหาร (Enterprise):
 *   1) จัดเรียงแถวอัตโนมัติ: วันที่รายงานล่าสุด (YYYY-MM-DD) อยู่แถวบนสุด (แถวที่ 2) เสมอ
 *   2) แยกแท็บสำรองข้อมูลรายเดือนอัตโนมัติ (เช่น "ประจำเดือน_2569-11") ควบคู่กับชีตรวมหลัก เพื่อให้เปิดไฟล์รวดเร็วแม้ข้อมูลเกิน 10,000 แถว
 *
 * วิธีติดตั้ง / อัปเดตโค้ด:
 * 1. เปิดไฟล์ Google Sheets ของคุณ -> เมนู "ส่วนขยาย (Extensions)" -> "Apps Script"
 * 2. ลบโค้ดเดิมออกทั้งหมด แล้ววางโค้ดชุดนี้ลงไป -> กดปุ่มบันทึก (ไอคอนแผ่นดิสก์ หรือ Ctrl+S)
 * 3. กดปุ่ม "ทำให้ใช้งานได้ (Deploy)" -> "จัดการการทำให้ใช้งานได้ (Manage deployments)"
 *    - กดไอคอนรูปดินสอ (แก้ไข/Edit) -> ช่องเวอร์ชัน (Version) เลือก "เวอร์ชันใหม่ (New version)" -> กด Deploy
 *    (หรือหากติดตั้งครั้งแรก ให้เลือก "การทำให้ใช้งานได้รายการใหม่ (New deployment)" -> ประเภท "เว็บแอป (Web app)" -> ผู้มีสิทธิ์เข้าถึง "ทุกคน (Anyone)")
 */

const SHEET_NAME = 'รายงานผลการปฏิบัติงาน_DOE';
const ENABLE_MONTHLY_ARCHIVE_TABS = true; // ตั้งเป็น true เพื่อสร้างและซิงค์แท็บแยกตามเดือน พ.ศ. อัตโนมัติ

const HEADERS = [
  'รหัสรายงาน (ID)',
  'วันที่รายงาน (YYYY-MM-DD)',
  'วันที่รายงาน (ไทย)',
  'ภูมิภาค',
  'รหัสสำนักงาน',
  'สำนักงานจัดหางาน',
  'ศูนย์บริการ',
  'คิวนัดหมาย (คิว)',
  'ออกบัตรรวม (ใบ)',
  'ยืนยันตัวตน (คน)',
  'บัตรเสีย (ใบ)',
  'ไม่มาตามนัด (คน)',
  'ไม่ตรงวันนัด (คน)',
  'ม.63/2 มติ 11 พ.ย.68',
  'ม.59 / ม.62 (BOI)',
  'ม.59 (MOU)',
  'ม.63 และ ม.63/1',
  'ม.63/2 (มติ ครม.)',
  'ม.64 (ไป-กลับ)',
  'เปลี่ยนแปลงรายการ',
  'ใบแทนใบอนุญาตฯ',
  'หมายเหตุ / ปัญหาอุปสรรค',
  'ผู้รายงาน',
  'ตำแหน่ง',
  'เบอร์โทรศัพท์',
  'LINE ID',
  'เวลาแก้ไขล่าสุด (ISO)',
  'JSON_BACKUP (ห้ามลบ-ใช้กู้คืนระบบ)'
];

function getOrCreateNamedSheet(targetName, headerBgColor) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(targetName);
  if (!sheet) {
    sheet = ss.insertSheet(targetName);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setBackground(headerBgColor || '#0f172a');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getOrCreateSheet() {
  return getOrCreateNamedSheet(SHEET_NAME, '#0f172a');
}

function getMonthlyTabNameFromDate(isoDateStr) {
  const clean = String(isoDateStr || '').trim();
  const match = clean.match(/^(\\d{4})-(\\d{2})/);
  if (!match) return null;
  let year = parseInt(match[1], 10);
  const month = match[2];
  const thaiYear = year < 2400 ? year + 543 : year;
  return 'ประจำเดือน_' + thaiYear + '-' + month;
}

function reportToRow(r) {
  const customCat = r.customCategoryValues || {};
  return [
    r.id || '',
    r.reportDate || '',
    r.reportDateThaiStr || '',
    r.region || '',
    r.officeId || '',
    r.officeName || '',
    r.centerName || '',
    Number(r.queueAppointment || 0),
    Number(r.cardsIssued || 0),
    Number(r.identityVerified || 0),
    Number(r.cardsNotIssued || 0),
    Number(r.missedAppointment || 0),
    Number(r.wrongAppointmentDate || 0),
    Number(customCat['cat_1791818621214'] || 0),
    Number(r.modifyDetails || 0),
    Number(r.section59 || 0),
    Number(r.section62 || 0),
    Number(r.section63_1 || 0),
    Number(r.section63_2 || 0),
    Number(r.section64 || 0),
    Number(r.substituteCard || 0),
    r.notes || '',
    r.reporterName || '',
    r.reporterPosition || '',
    r.phoneNumber || '',
    r.lineId || '',
    r.updatedAt || r.createdAt || new Date().toISOString(),
    JSON.stringify(r)
  ];
}

function extractSortDateKey(row) {
  const cellVal = row[1];
  if (cellVal instanceof Date && !isNaN(cellVal.getTime())) {
    const y = cellVal.getFullYear();
    const m = String(cellVal.getMonth() + 1).padStart(2, '0');
    const d = String(cellVal.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  const rawStr = String(cellVal || '').trim();
  if (/^\\d{4}-\\d{2}-\\d{2}/.test(rawStr)) {
    return rawStr.slice(0, 10);
  }
  const rawJson = row[HEADERS.length - 1];
  if (rawJson && String(rawJson).trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(String(rawJson));
      if (parsed && parsed.reportDate) return String(parsed.reportDate).slice(0, 10);
    } catch (e) {}
  }
  return rawStr;
}

function compareRowsNewestFirst(a, b) {
  const dateA = extractSortDateKey(a);
  const dateB = extractSortDateKey(b);
  if (dateA !== dateB) {
    return dateB.localeCompare(dateA); // วันที่รายงานล่าสุดอยู่แถวบนสุดเสมอ (Descending)
  }
  const timeA = String(a[26] || '');
  const timeB = String(b[26] || '');
  if (timeA !== timeB) {
    return timeB.localeCompare(timeA); // หากวันที่รายงานวันเดียวกัน ให้รายการที่ส่ง/แก้ไขล่าสุดอยู่บนสุด
  }
  return String(a[4] || '').localeCompare(String(b[4] || ''));
}

function syncMonthlyArchiveTabs(allSortedMasterRows, touchedMonthTabsMap) {
  if (!ENABLE_MONTHLY_ARCHIVE_TABS) return;
  const tabKeys = Object.keys(touchedMonthTabsMap || {});
  if (tabKeys.length === 0) return;

  const groupedByTab = {};
  for (let i = 0; i < tabKeys.length; i++) {
    groupedByTab[tabKeys[i]] = [];
  }

  for (let i = 0; i < allSortedMasterRows.length; i++) {
    const row = allSortedMasterRows[i];
    const dateKey = extractSortDateKey(row);
    const tabName = getMonthlyTabNameFromDate(dateKey);
    if (tabName && groupedByTab[tabName] !== undefined) {
      groupedByTab[tabName].push(row);
    }
  }

  for (let i = 0; i < tabKeys.length; i++) {
    const tabName = tabKeys[i];
    const monthRows = groupedByTab[tabName] || [];
    const mSheet = getOrCreateNamedSheet(tabName, '#1e3a8a');
    const prevLastRow = mSheet.getLastRow();
    if (monthRows.length > 0) {
      mSheet.getRange(2, 1, monthRows.length, HEADERS.length).setValues(monthRows);
      if (prevLastRow > monthRows.length + 1) {
        mSheet.deleteRows(monthRows.length + 2, prevLastRow - (monthRows.length + 1));
      }
    } else if (prevLastRow > 1) {
      mSheet.deleteRows(2, prevLastRow - 1);
    }
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sheet = getOrCreateSheet();
    const body = JSON.parse(e.postData.contents || '{}');
    const action = body.action || 'upsert_single';

    const lastRow = sheet.getLastRow();
    const existingRows = lastRow > 1
      ? sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues()
      : [];

    const idToIndexMap = {};
    for (let i = 0; i < existingRows.length; i++) {
      const existingId = String(existingRows[i][0] || '').trim();
      if (existingId) {
        idToIndexMap[existingId] = i;
      }
    }

    const touchedMonthTabs = {};

    if (action === 'delete_single' && body.reportId) {
      const targetId = String(body.reportId).trim();
      const targetIndex = idToIndexMap[targetId];
      if (targetIndex !== undefined) {
        const oldDate = extractSortDateKey(existingRows[targetIndex]);
        const oldTab = getMonthlyTabNameFromDate(oldDate);
        if (oldTab) touchedMonthTabs[oldTab] = true;
        sheet.deleteRow(targetIndex + 2);
        existingRows.splice(targetIndex, 1);
        syncMonthlyArchiveTabs(existingRows, touchedMonthTabs);
      }
      return ContentService.createTextOutput(JSON.stringify({ ok: true, deleted: body.reportId }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const incomingList = action === 'upsert_bulk'
      ? (Array.isArray(body.reports) ? body.reports : [])
      : (body.report ? [body.report] : []);

    let insertedCount = 0;
    let updatedCount = 0;

    for (let i = 0; i < incomingList.length; i++) {
      const r = incomingList[i];
      if (!r || !r.id) continue;
      const rowData = reportToRow(r);
      const newTab = getMonthlyTabNameFromDate(r.reportDate);
      if (newTab) touchedMonthTabs[newTab] = true;

      const rid = String(r.id).trim();
      const existingIdx = idToIndexMap[rid];
      if (existingIdx !== undefined) {
        const prevDate = extractSortDateKey(existingRows[existingIdx]);
        const prevTab = getMonthlyTabNameFromDate(prevDate);
        if (prevTab) touchedMonthTabs[prevTab] = true;
        existingRows[existingIdx] = rowData;
        updatedCount++;
      } else {
        idToIndexMap[rid] = existingRows.length;
        existingRows.push(rowData);
        insertedCount++;
      }
    }

    // จัดเรียงแถวทั้งหมดตาม "วันที่รายงาน (YYYY-MM-DD)" จากวันที่ล่าสุดไปเก่าสุด (แถวบนสุดคือวันที่ล่าสุดเสมอ)
    existingRows.sort(compareRowsNewestFirst);
    for (let i = 0; i < existingRows.length; i++) {
      existingRows[i][1] = extractSortDateKey(existingRows[i]);
    }

    if (existingRows.length > 0) {
      sheet.getRange(2, 1, existingRows.length, HEADERS.length).setValues(existingRows);
    }

    // ซิงค์แยกแท็บสำรองข้อมูลรายเดือนอัตโนมัติ (เช่น ประจำเดือน_2569-11)
    syncMonthlyArchiveTabs(existingRows, touchedMonthTabs);

    return ContentService.createTextOutput(
      JSON.stringify({
        ok: true,
        inserted: insertedCount,
        updated: updatedCount,
        sorted: 'reportDate_DESC',
        monthlyArchiveSynced: Object.keys(touchedMonthTabs),
        totalRows: existingRows.length
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  try {
    const sheet = getOrCreateSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return ContentService.createTextOutput(JSON.stringify({ ok: true, reports: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const range = sheet.getRange(2, 1, lastRow - 1, HEADERS.length);
    const data = range.getValues();

    // ตรวจสอบว่าตารางเรียงตามวันที่รายงานล่าสุดอยู่บนสุดหรือยัง หากยังไม่เรียงให้จัดเรียงอัตโนมัติทันที
    let needsSort = false;
    for (let i = 0; i < data.length - 1; i++) {
      if (compareRowsNewestFirst(data[i], data[i + 1]) > 0) {
        needsSort = true;
        break;
      }
    }
    if (needsSort) {
      data.sort(compareRowsNewestFirst);
      for (let i = 0; i < data.length; i++) {
        data[i][1] = extractSortDateKey(data[i]);
      }
      range.setValues(data);
    }

    const reports = [];
    for (let i = 0; i < data.length; i++) {
      const rawJson = data[i][HEADERS.length - 1];
      if (rawJson && String(rawJson).trim().startsWith('{')) {
        try {
          reports.push(JSON.parse(String(rawJson)));
        } catch (e) {}
      }
    }
    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, count: reports.length, sorted: true, reports: reports })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
`;

export async function syncReportToGoogleSheets(
  report: DOEReport,
  explicitWebhookUrl?: string
): Promise<boolean> {
  const cfg = getStoredGoogleSheetsConfig();
  const url = (explicitWebhookUrl || cfg.webhookUrl || '').trim();
  if (!url || (!explicitWebhookUrl && !cfg.autoSync)) return false;

  const payload = {
    action: 'upsert_single',
    report,
  };

  try {
    const proxyRes = await fetch('/api/doe/sheets-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl: url, payload }),
    });
    if (proxyRes.ok) return true;
  } catch {}

  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteReportFromGoogleSheets(
  reportId: string,
  explicitWebhookUrl?: string
): Promise<boolean> {
  const cfg = getStoredGoogleSheetsConfig();
  const url = (explicitWebhookUrl || cfg.webhookUrl || '').trim();
  if (!url || !reportId || (!explicitWebhookUrl && !cfg.autoSync)) return false;

  const payload = {
    action: 'delete_single',
    reportId,
  };

  try {
    const proxyRes = await fetch('/api/doe/sheets-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl: url, payload }),
    });
    if (proxyRes.ok) return true;
  } catch {}

  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    return true;
  } catch {
    return false;
  }
}

export async function syncBulkReportsToGoogleSheets(
  reports: DOEReport[],
  webhookUrl: string,
  onProgress?: (syncedCount: number, totalCount: number) => void
): Promise<{ success: boolean; syncedCount: number; message?: string }> {
  const cleanUrl = (webhookUrl || '').trim();
  if (!cleanUrl || !cleanUrl.startsWith('https://script.google.com/')) {
    return {
      success: false,
      syncedCount: 0,
      message: 'กรุณาระบุ Google Apps Script Web App URL ที่ถูกต้อง (ขึ้นต้นด้วย https://script.google.com/...)',
    };
  }

  const sorted = [...reports].sort((a, b) => {
    const dateCmp = (b.reportDate || '').localeCompare(a.reportDate || '');
    if (dateCmp !== 0) return dateCmp;
    const timeA = a.updatedAt || a.createdAt || '';
    const timeB = b.updatedAt || b.createdAt || '';
    if (timeA !== timeB) return timeB.localeCompare(timeA);
    return (a.officeId || '').localeCompare(b.officeId || '');
  });
  const total = sorted.length;
  if (total === 0) {
    return { success: true, syncedCount: 0, message: 'ไม่มีข้อมูลรายงานให้ซิงค์' };
  }

  const BATCH_SIZE = 120;
  let synced = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = sorted.slice(i, i + BATCH_SIZE);
    const payload = {
      action: 'upsert_bulk',
      reports: chunk,
    };

    let chunkOk = false;
    try {
      const res = await fetch('/api/doe/sheets-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: cleanUrl, payload }),
      });
      if (res.ok) {
        chunkOk = true;
      }
    } catch {}

    if (!chunkOk) {
      try {
        await fetch(cleanUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
        });
        chunkOk = true;
      } catch (err) {
        return {
          success: false,
          syncedCount: synced,
          message: `เกิดข้อผิดพลาดขณะส่งข้อมูลชุดที่ ${Math.floor(i / BATCH_SIZE) + 1}: ${String(err)}`,
        };
      }
    }

    synced += chunk.length;
    if (onProgress) onProgress(synced, total);
  }

  return {
    success: true,
    syncedCount: synced,
    message: `ซิงค์ข้อมูลรายงานทั้งหมด ${synced.toLocaleString()} รายการ ลง Google Sheets สำเร็จเรียบร้อยแล้ว`,
  };
}

export async function pullReportsFromGoogleSheets(
  webhookUrl: string
): Promise<{ success: boolean; reports: DOEReport[]; message?: string }> {
  const cleanUrl = (webhookUrl || '').trim();
  if (!cleanUrl || !cleanUrl.startsWith('https://script.google.com/')) {
    return {
      success: false,
      reports: [],
      message: 'กรุณาระบุ Google Apps Script Web App URL ที่ถูกต้อง',
    };
  }

  try {
    const res = await fetch(
      `/api/doe/sheets-proxy?webhookUrl=${encodeURIComponent(cleanUrl)}`,
      { method: 'GET', cache: 'no-store', headers: { Accept: 'application/json' } }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.reports)) {
        const valid: DOEReport[] = [];
        for (const raw of data.reports) {
          const clean = sanitizeReport(raw);
          if (clean && clean.id) valid.push(clean);
        }
        return {
          success: true,
          reports: valid,
          message: `ดึงข้อมูลจาก Google Sheets สำเร็จ จำนวน ${valid.length.toLocaleString()} รายการ`,
        };
      }
    }
  } catch {}

  try {
    const directRes = await fetch(cleanUrl, { method: 'GET', cache: 'no-store', redirect: 'follow' });
    if (directRes.ok) {
      const data = await directRes.json();
      if (Array.isArray(data?.reports)) {
        const valid: DOEReport[] = [];
        for (const raw of data.reports) {
          const clean = sanitizeReport(raw);
          if (clean && clean.id) valid.push(clean);
        }
        return {
          success: true,
          reports: valid,
          message: `ดึงข้อมูลจาก Google Sheets สำเร็จ จำนวน ${valid.length.toLocaleString()} รายการ`,
        };
      }
    }
  } catch (err) {
    return {
      success: false,
      reports: [],
      message: `ไม่สามารถดึงข้อมูลจาก Google Sheets ได้: ${String(err)}`,
    };
  }

  return {
    success: false,
    reports: [],
    message: 'ไม่พบข้อมูลตอบกลับจาก Google Sheets กรุณาตรวจสอบสิทธิ์ Web App (ตั้งเป็น Anyone)',
  };
}
