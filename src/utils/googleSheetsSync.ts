import { DOEReport } from '../types/doe';
import { sanitizeReport } from './doeUtils';

export const STORAGE_KEY_GSHEETS_URL = 'doe_google_sheets_webhook_url_v1';
export const STORAGE_KEY_GSHEETS_AUTO = 'doe_google_sheets_auto_sync_v1';

export function getStoredGoogleSheetsConfig(): {
  webhookUrl: string;
  autoSync: boolean;
} {
  let webhookUrl = '';
  let autoSync = true;
  try {
    webhookUrl = (localStorage.getItem(STORAGE_KEY_GSHEETS_URL) || '').trim();
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
 * วิธีติดตั้ง:
 * 1. เปิดไฟล์ Google Sheets ของคุณ -> เมนู "ส่วนขยาย (Extensions)" -> "Apps Script"
 * 2. ลบโค้ดเดิมออกทั้งหมด แล้ววางโค้ดชุดนี้ลงไป -> กดปุ่มบันทึก (ไอคอนแผ่นดิสก์)
 * 3. กดปุ่ม "ทำให้ใช้งานได้ (Deploy)" -> "การทำให้ใช้งานได้รายการใหม่ (New deployment)"
 * 4. เลือกประเภทเป็น "เว็บแอป (Web app)"
 *    - ดำเนินการในฐานะ (Execute as): "ฉัน (Me)"
 *    - ผู้ที่มีสิทธิ์เข้าถึง (Who has access): "ทุกคน (Anyone)"
 * 5. กด Deploy แล้วคัดลอก Web App URL (https://script.google.com/macros/s/.../exec) มาวางในหน้าตั้งค่าระบบ
 */

const SHEET_NAME = 'รายงานผลการปฏิบัติงาน_DOE';

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

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setBackground('#0f172a');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
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

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sheet = getOrCreateSheet();
    const body = JSON.parse(e.postData.contents || '{}');
    const action = body.action || 'upsert_single';
    const incomingList = action === 'upsert_bulk'
      ? (Array.isArray(body.reports) ? body.reports : [])
      : (body.report ? [body.report] : []);

    const lastRow = sheet.getLastRow();
    const idToRowMap = {};
    if (lastRow > 1) {
      const idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < idValues.length; i++) {
        const existingId = String(idValues[i][0] || '').trim();
        if (existingId) {
          idToRowMap[existingId] = i + 2;
        }
      }
    }

    if (action === 'delete_single' && body.reportId) {
      const targetRow = idToRowMap[String(body.reportId).trim()];
      if (targetRow) {
        sheet.deleteRow(targetRow);
      }
      return ContentService.createTextOutput(JSON.stringify({ ok: true, deleted: body.reportId }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const newRows = [];
    let updatedCount = 0;

    for (let i = 0; i < incomingList.length; i++) {
      const r = incomingList[i];
      if (!r || !r.id) continue;
      const rowData = reportToRow(r);
      const existingRowIndex = idToRowMap[String(r.id).trim()];
      if (existingRowIndex) {
        sheet.getRange(existingRowIndex, 1, 1, rowData.length).setValues([rowData]);
        updatedCount++;
      } else {
        newRows.push(rowData);
        idToRowMap[String(r.id).trim()] = -1;
      }
    }

    if (newRows.length > 0) {
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, newRows.length, HEADERS.length).setValues(newRows);
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        ok: true,
        inserted: newRows.length,
        updated: updatedCount,
        totalRows: Math.max(0, sheet.getLastRow() - 1)
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
    const data = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
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
      JSON.stringify({ ok: true, count: reports.length, reports: reports })
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

  const sorted = [...reports].sort((a, b) =>
    (b.reportDate || '').localeCompare(a.reportDate || '')
  );
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
      { method: 'GET', headers: { Accept: 'application/json' } }
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
    const directRes = await fetch(cleanUrl, { method: 'GET' });
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
