import { DOEReport, QueueMetricCategory, ReportCategory } from '../types/doe';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL,
  DEFAULT_QUEUE_METRICS,
} from '../data/initialAdminData';
import { deduplicateReportsBySlot, sanitizeReport } from './doeUtils';

export const STORAGE_KEY_GSHEETS_URL = 'doe_google_sheets_webhook_url_v1';
export const STORAGE_KEY_GSHEETS_AUTO = 'doe_google_sheets_auto_sync_v1';

export interface GoogleSheetsSchemaMetadata {
  categories?: Array<{
    id: string;
    title: string;
    subLabel?: string;
    isActive?: boolean;
  }>;
  queueMetrics?: Array<{
    id: string;
    title: string;
    unit?: string;
    isActive?: boolean;
  }>;
}

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

export function buildSheetsSchemaMetadata(
  categories?: ReportCategory[],
  queueMetrics?: QueueMetricCategory[]
): GoogleSheetsSchemaMetadata {
  let resolvedCats = categories;
  let resolvedQms = queueMetrics;

  if (!resolvedCats || resolvedCats.length === 0) {
    try {
      const raw = localStorage.getItem('doe_work_permit_categories_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          resolvedCats = parsed;
        }
      }
    } catch {}
  }

  if (!resolvedQms || resolvedQms.length === 0) {
    try {
      const raw = localStorage.getItem('doe_work_permit_queue_metrics_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          resolvedQms = parsed;
        }
      }
    } catch {}
  }

  const finalCats = resolvedCats && resolvedCats.length > 0 ? resolvedCats : DEFAULT_CATEGORIES;
  const finalQms = resolvedQms && resolvedQms.length > 0 ? resolvedQms : DEFAULT_QUEUE_METRICS;

  return {
    categories: finalCats.map((c) => ({
      id: c.id,
      title: (c.title || '').trim(),
      subLabel: (c.subLabel || '').trim(),
      isActive: c.isActive !== false,
    })),
    queueMetrics: finalQms.map((q) => ({
      id: q.id,
      title: (q.title || '').trim(),
      unit: (q.unit || '').trim(),
      isActive: q.isActive !== false,
    })),
  };
}

/**
 * โค้ด Google Apps Script สำเร็จรูปสำหรับนำไปวางใน Google Sheets (Extensions -> Apps Script)
 * รุ่นผู้บริหาร (Enterprise v2):
 *   1) ป้องกันข้อมูลซ้ำอัตโนมัติ (Deduplicate by วันที่รายงาน + สำนักงาน + ศูนย์บริการ) ไม่สร้างแถวซ้ำแม้คนละ ID หรือส่งจากหลายเครื่อง
 *   2) แตกคอลัมน์เพิ่มอัตโนมัติสำหรับทุก "หัวข้อกลุ่มเป้าหมาย" และ "สถานะคิว" ที่แอดมินสร้างใหม่ + คอลัมน์สรุปอ่านง่าย
 *   3) จัดเรียงแถวอัตโนมัติ: วันที่รายงานล่าสุด (YYYY-MM-DD) อยู่แถวบนสุด (แถวที่ 2) เสมอ
 *   4) แยกแท็บสำรองข้อมูลรายเดือนอัตโนมัติ (เช่น "ประจำเดือน_2569-11") ควบคู่กับชีตรวมหลัก
 */
export const GOOGLE_APPS_SCRIPT_TEMPLATE = `/**
 * ระบบสำรองและซิงค์ข้อมูลอัตโนมัติ (DOE Work Permit Reporting System -> Google Sheets)
 * รุ่นผู้บริหาร (Enterprise v2.2):
 *   1) ป้องกันและรวมแถวซ้ำอัตโนมัติ: ยึดหลัก 1 แถวต่อ (วันที่รายงาน + สำนักงาน + ศูนย์บริการ) เก็บฉบับที่แก้ไขล่าสุดเสมอ
 *   2) รองรับคอลัมน์ "ม.63/2 มติ 14 ก.ค. 69" โดยตรง พร้อมแตกคอลัมน์หัวข้อใหม่ในอนาคตแบบย่อชื่ออ่านง่าย + คอลัมน์สรุปหัวข้อเพิ่มเติม
 *   3) จัดเรียงแถวอัตโนมัติบนชีตจริง: เรียงคอลัมน์ B (วันที่รายงานล่าสุดอยู่บนสุด) + เวลาที่มีการรายงานล่าสุดอยู่ด้านบนเสมอ ทั้งชีตรวมและแท็บรายเดือน
 *   4) แยกแท็บสำรองข้อมูลรายเดือนอัตโนมัติ (เช่น "ประจำเดือน_2569-11") ควบคู่กับชีตรวมหลัก
 *   5) ซิงก์การตั้งค่าแอดมินแบบ 2 ทางผ่านแท็บ "ตั้งค่าระบบ_DOE" (หัวข้อกลุ่มเป้าหมายและมาตรา / สถานะคิว / ศูนย์บริการ / ไฮไลต์ / ข้อความหุ่นยนต์)
 *      ทำให้ตัวพัฒนาและเว็บที่ Deploy ซิงก์หัวข้อตรงกันตลอดเวลา แม้โควตาเขียนรายวันของ Firestore จะเต็ม
 *
 * วิธีติดตั้ง / อัปเดตโค้ด:
 * 1. เปิดไฟล์ Google Sheets ของคุณ -> เมนู "ส่วนขยาย (Extensions)" -> "Apps Script"
 * 2. ลบโค้ดเดิมออกทั้งหมด แล้ววางโค้ดชุดนี้ลงไป -> กดปุ่มบันทึก (Ctrl+S)
 * 3. กดปุ่ม "ทำให้ใช้งานได้ (Deploy)" -> "จัดการการทำให้ใช้งานได้ (Manage deployments)"
 *    - กดไอคอนรูปดินสอ (แก้ไข/Edit) -> ช่องเวอร์ชัน (Version) เลือก "เวอร์ชันใหม่ (New version)" -> กด Deploy
 *    (หรือหากติดตั้งครั้งแรก ให้เลือก "การทำให้ใช้งานได้รายการใหม่ (New deployment)" -> ประเภท "เว็บแอป (Web app)" -> ผู้มีสิทธิ์เข้าถึง "ทุกคน (Anyone)")
 */

const SHEET_NAME = 'รายงานผลการปฏิบัติงาน_DOE';
const MASTER_CONFIG_SHEET_NAME = 'ตั้งค่าระบบ_DOE';
const ENABLE_MONTHLY_ARCHIVE_TABS = true; // สร้างและซิงค์แท็บแยกตามเดือน พ.ศ. อัตโนมัติ

const BASE_HEADERS = [
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
  'ม.63/2 มติ 14 ก.ค. 69',
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
  'เวลาแก้ไขล่าสุด (ISO)'
];

const EXTRA_SUMMARY_HEADER = 'หัวข้อ/สถานะเพิ่มเติม (สรุป)';
const JSON_BACKUP_HEADER = 'JSON_BACKUP (ห้ามลบ-ใช้กู้คืนระบบ)';

const BUILTIN_CATEGORY_IDS = {
  cat_1791818621214: true,
  cat_1795524799070: true,
  modifyDetails: true,
  section59: true,
  section62: true,
  section63_1: true,
  section63_2: true,
  section64: true,
  substituteCard: true
};

const BUILTIN_QUEUE_IDS = {
  queueAppointment: true,
  cardsIssued: true,
  identityVerified: true,
  cardsNotIssued: true,
  missedAppointment: true,
  wrongAppointmentDate: true
};

function getOrCreateNamedSheet(targetName, headerBgColor, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(targetName);
  if (!sheet) {
    sheet = ss.insertSheet(targetName);
  }
  const activeHeaders = headers && headers.length > 0 ? headers : BASE_HEADERS.concat([EXTRA_SUMMARY_HEADER, JSON_BACKUP_HEADER]);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, activeHeaders.length).setValues([activeHeaders]);
    const headerRange = sheet.getRange(1, 1, 1, activeHeaders.length);
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

function findJsonBackupColIndex(headerRow) {
  for (let i = headerRow.length - 1; i >= 0; i--) {
    const h = String(headerRow[i] || '').trim();
    if (h.indexOf('JSON_BACKUP') !== -1) {
      return i;
    }
  }
  return headerRow.length - 1;
}

function normalizeDateIso(val) {
  if (val instanceof Date && !isNaN(val.getTime())) {
    const tz = Session.getScriptTimeZone() || 'Asia/Bangkok';
    const formatted = Utilities.formatDate(val, tz, 'yyyy-MM-dd');
    const parts = formatted.split('-');
    let y = parseInt(parts[0], 10);
    if (y >= 2400) y -= 543;
    return y + '-' + parts[1] + '-' + parts[2];
  }
  const raw = String(val || '').trim();
  const ymd = raw.match(/^(\\d{4})[-/](\\d{1,2})[-/](\\d{1,2})/);
  if (ymd) {
    let y = parseInt(ymd[1], 10);
    if (y >= 2400) y -= 543;
    return y + '-' + ymd[2].padStart(2, '0') + '-' + ymd[3].padStart(2, '0');
  }
  const dmy = raw.match(/^(\\d{1,2})[-/](\\d{1,2})[-/](\\d{4})/);
  if (dmy) {
    let y = parseInt(dmy[3], 10);
    if (y >= 2400) y -= 543;
    return y + '-' + dmy[2].padStart(2, '0') + '-' + dmy[1].padStart(2, '0');
  }
  return raw.slice(0, 10);
}

function getMonthlyTabNameFromDate(isoDateStr) {
  const clean = normalizeDateIso(isoDateStr);
  const match = clean.match(/^(\\d{4})-(\\d{2})/);
  if (!match) return null;
  let year = parseInt(match[1], 10);
  const month = match[2];
  const thaiYear = year < 2400 ? year + 543 : year;
  return 'ประจำเดือน_' + thaiYear + '-' + month;
}

function getCanonicalCenterKey(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  if (raw.indexOf('วัดป้อมวิเชียร') !== -1 || raw.indexOf('ป้อมวิเชียร') !== -1) {
    return 'special_center_wat_pom_wichian';
  }
  return raw
    .toLowerCase()
    .replace(/ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว\\s*\\(\\s*เฉพาะกิจ\\s*\\)/g, 'ศูนย์เฉพาะกิจ')
    .replace(/ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวเฉพาะกิจ/g, 'ศูนย์เฉพาะกิจ')
    .replace(/ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว/g, 'ศูนย์บริการ')
    .replace(/จังหวัด/g, '')
    .replace(/จ\\./g, '')
    .replace(/[\\s\\-_().,'"“”‘’ฯ]/g, '');
}

function getReportSlotKey(r) {
  const dateKey = normalizeDateIso(r.reportDate);
  const officeKey = String(r.officeId || r.officeName || '').trim().toLowerCase();
  const rawCenter = String(r.centerName || '').trim();
  const lowerCenter = rawCenter.toLowerCase();
  const isMobile = lowerCenter.indexOf('mobile unit') !== -1 || lowerCenter.indexOf('เคลื่อนที่') !== -1;
  const centerKey = isMobile ? '__mobile_unit__' : getCanonicalCenterKey(rawCenter || r.officeName || '');
  if (!dateKey || !officeKey) {
    return '__id__:' + String(r.id || '');
  }
  return dateKey + '|' + officeKey + '|' + centerKey;
}

function getReportTimestampMs(r) {
  const ts = String(r.updatedAt || r.createdAt || '').trim();
  if (!ts) return 0;
  const ms = Date.parse(ts);
  return isNaN(ms) ? 0 : ms;
}

function getReportRichness(r) {
  let score = 0;
  if (Number(r.queueAppointment || 0) > 0) score += 2;
  if (Number(r.cardsIssued || 0) > 0) score += 2;
  if (Number(r.identityVerified || 0) > 0) score += 1;
  if (String(r.notes || '').trim()) score += 1;
  if (String(r.reporterName || '').trim()) score += 1;
  const cc = r.customCategoryValues || {};
  for (const k in cc) {
    if (Number(cc[k] || 0) > 0) score += 1;
  }
  const cq = r.customQueueValues || {};
  for (const k in cq) {
    if (Number(cq[k] || 0) > 0) score += 1;
  }
  return score;
}

function pickWinningReport(existingRep, candidateRep) {
  if (!existingRep) return candidateRep;
  if (!candidateRep) return existingRep;
  const existingMs = getReportTimestampMs(existingRep);
  const candidateMs = getReportTimestampMs(candidateRep);
  if (candidateMs > existingMs) return candidateRep;
  if (existingMs > candidateMs) return existingRep;
  return getReportRichness(candidateRep) >= getReportRichness(existingRep) ? candidateRep : existingRep;
}

function rowToFallbackReport(row, jsonColIdx, existingHeaders) {
  const rawJson = jsonColIdx >= 0 ? row[jsonColIdx] : '';
  if (rawJson && String(rawJson).trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(String(rawJson));
      if (parsed && parsed.id) {
        parsed.reportDate = normalizeDateIso(parsed.reportDate || row[1]);
        return parsed;
      }
    } catch (e) {}
  }
  const id = String(row[0] || '').trim();
  if (!id) return null;
  const hasNewCol14 = Array.isArray(existingHeaders) &&
    String(existingHeaders[14] || '').indexOf('14 ก.ค.') !== -1;
  const off = hasNewCol14 ? 1 : 0;
  const customCategoryValues = { cat_1791818621214: Number(row[13] || 0) };
  if (hasNewCol14) {
    customCategoryValues.cat_1795524799070 = Number(row[14] || 0);
  }
  return {
    id: id,
    reportDate: normalizeDateIso(row[1]),
    reportDateThaiStr: String(row[2] || ''),
    region: String(row[3] || ''),
    officeId: String(row[4] || ''),
    officeName: String(row[5] || ''),
    centerName: String(row[6] || ''),
    queueAppointment: Number(row[7] || 0),
    cardsIssued: Number(row[8] || 0),
    identityVerified: Number(row[9] || 0),
    cardsNotIssued: Number(row[10] || 0),
    missedAppointment: Number(row[11] || 0),
    wrongAppointmentDate: Number(row[12] || 0),
    customCategoryValues: customCategoryValues,
    modifyDetails: Number(row[14 + off] || 0),
    section59: Number(row[15 + off] || 0),
    section62: Number(row[16 + off] || 0),
    section63_1: Number(row[17 + off] || 0),
    section63_2: Number(row[18 + off] || 0),
    section64: Number(row[19 + off] || 0),
    substituteCard: Number(row[20 + off] || 0),
    notes: String(row[21 + off] || ''),
    reporterName: String(row[22 + off] || ''),
    reporterPosition: String(row[23 + off] || ''),
    phoneNumber: String(row[24 + off] || ''),
    lineId: String(row[25 + off] || ''),
    updatedAt: String(row[26 + off] || '')
  };
}

function shortenThaiHeaderLabel(title, subLabel) {
  const t = String(title || '').trim()
    .replace(/^กลุ่มมาตรา\\s*/g, 'ม.')
    .replace(/^มาตรา\\s*/g, 'ม.')
    .replace(/\\s+/g, ' ');
  const s = String(subLabel || '').trim()
    .replace(/มติ\\s*ครม\\.?\\s*/g, 'มติ ')
    .replace(/มกราคม/g, 'ม.ค.')
    .replace(/กุมภาพันธ์/g, 'ก.พ.')
    .replace(/มีนาคม/g, 'มี.ค.')
    .replace(/เมษายน/g, 'เม.ย.')
    .replace(/พฤษภาคม/g, 'พ.ค.')
    .replace(/มิถุนายน/g, 'มิ.ย.')
    .replace(/กรกฎาคม|กรกฏาคม/g, 'ก.ค.')
    .replace(/สิงหาคม/g, 'ส.ค.')
    .replace(/กันยายน/g, 'ก.ย.')
    .replace(/ตุลาคม/g, 'ต.ค.')
    .replace(/พฤศจิกายน/g, 'พ.ย.')
    .replace(/ธันวาคม/g, 'ธ.ค.')
    .replace(/\\b25(\\d{2})\\b/g, '$1')
    .replace(/\\s+/g, ' ')
    .trim();
  if (s && s.length <= 36 && t.indexOf(s) === -1) {
    return (t + ' ' + s).trim();
  }
  return t;
}

/**
 * สร้างรายการคอลัมน์ไดนามิกสำหรับหัวข้อกลุ่มเป้าหมายและสถานะคิวที่แอดมินเพิ่มใหม่ในอนาคต
 * โดยย่อชื่อหัวข้อ + คำอธิบายย่อยให้อ่านง่ายแบบผู้บริหาร (เช่น "ม.63/2 มติ 14 ก.ค. 69")
 */
function buildDynamicColumns(existingHeaders, incomingSchema, allReports) {
  const colOrder = [];
  const colMap = {};

  function registerCol(kind, id, title, unit) {
    if (!id) return;
    if (kind === 'cat' && BUILTIN_CATEGORY_IDS[id]) return;
    if (kind === 'qm' && BUILTIN_QUEUE_IDS[id]) return;
    const key = kind + ':' + id;
    if (!colMap[key]) {
      colMap[key] = { kind: kind, id: id, title: title || id, unit: unit || '' };
      colOrder.push(key);
    } else {
      if (title && title !== id) colMap[key].title = title;
      if (unit) colMap[key].unit = unit;
    }
  }

  // 1) คงลำดับคอลัมน์ไดนามิกเดิมที่มีอยู่บนหัวตารางชีตแล้ว (ยกเว้นหัวข้อที่ย้ายเข้า BASE_HEADERS แล้ว)
  for (let i = 0; i < (existingHeaders || []).length; i++) {
    const h = String(existingHeaders[i] || '').trim();
    const catMatch = h.match(/\\[cat:([^\\]]+)\\]/);
    if (catMatch) {
      const cleanTitle = h.replace(/^หัวข้อเพิ่ม:\\s*/, '').replace(/\\s*\\[cat:[^\\]]+\\]\\s*$/, '').trim();
      registerCol('cat', catMatch[1], cleanTitle, '');
      continue;
    }
    const qmMatch = h.match(/\\[qm:([^\\]]+)\\]/);
    if (qmMatch) {
      const withoutTag = h.replace(/^สถานะเพิ่ม:\\s*/, '').replace(/\\s*\\[qm:[^\\]]+\\]\\s*$/, '').trim();
      const unitMatch = withoutTag.match(/^(.*)\\(([^)]+)\\)$/);
      registerCol('qm', qmMatch[1], unitMatch ? unitMatch[1].trim() : withoutTag, unitMatch ? unitMatch[2].trim() : '');
    }
  }

  // 2) เพิ่มหรืออัปเดตชื่อคอลัมน์จาก schema ล่าสุดที่แอปส่งมา (ใช้ชื่อย่อรวม subLabel ให้อ่านง่าย)
  if (incomingSchema && Array.isArray(incomingSchema.categories)) {
    for (let i = 0; i < incomingSchema.categories.length; i++) {
      const c = incomingSchema.categories[i];
      if (!c || !c.id || BUILTIN_CATEGORY_IDS[c.id]) continue;
      const smartLabel = shortenThaiHeaderLabel(c.title || c.id, c.subLabel || '');
      registerCol('cat', String(c.id), smartLabel || String(c.title || c.id).trim(), '');
    }
  }
  if (incomingSchema && Array.isArray(incomingSchema.queueMetrics)) {
    for (let i = 0; i < incomingSchema.queueMetrics.length; i++) {
      const q = incomingSchema.queueMetrics[i];
      if (!q || !q.id || BUILTIN_QUEUE_IDS[q.id]) continue;
      registerCol('qm', String(q.id), String(q.title || q.id).trim(), String(q.unit || '').trim());
    }
  }

  // 3) ตรวจหาคีย์เพิ่มเติมที่อาจอยู่ในข้อมูลรายงานแต่ละฉบับ (เผื่อรายงานเก่าที่มีข้อมูลอยู่แล้ว)
  for (let i = 0; i < allReports.length; i++) {
    const r = allReports[i];
    if (!r) continue;
    const cc = r.customCategoryValues || {};
    for (const catId in cc) {
      if (!BUILTIN_CATEGORY_IDS[catId] && Number(cc[catId] || 0) !== 0) {
        registerCol('cat', catId, catId, '');
      }
    }
    const cq = r.customQueueValues || {};
    for (const qmId in cq) {
      if (!BUILTIN_QUEUE_IDS[qmId] && Number(cq[qmId] || 0) !== 0) {
        registerCol('qm', qmId, qmId, '');
      }
    }
  }

  const dynamicCols = [];
  for (let i = 0; i < colOrder.length; i++) {
    const item = colMap[colOrder[i]];
    const headerLabel = item.kind === 'cat'
      ? item.title + ' [cat:' + item.id + ']'
      : item.title + (item.unit ? ' (' + item.unit + ')' : '') + ' [qm:' + item.id + ']';
    dynamicCols.push({
      kind: item.kind,
      id: item.id,
      title: item.title,
      unit: item.unit,
      header: headerLabel
    });
  }
  return dynamicCols;
}

function buildFullHeaders(dynamicCols) {
  const headers = BASE_HEADERS.slice();
  headers.push(EXTRA_SUMMARY_HEADER);
  for (let i = 0; i < dynamicCols.length; i++) {
    headers.push(dynamicCols[i].header);
  }
  headers.push(JSON_BACKUP_HEADER);
  return headers;
}

function reportToRow(r, dynamicCols) {
  const customCat = r.customCategoryValues || {};
  const customQueue = r.customQueueValues || {};
  const summaryParts = [];
  const dynamicValues = [];

  for (let i = 0; i < dynamicCols.length; i++) {
    const col = dynamicCols[i];
    const val = col.kind === 'cat'
      ? Number(customCat[col.id] || 0)
      : Number(customQueue[col.id] || 0);
    dynamicValues.push(val);
    if (val > 0) {
      summaryParts.push(col.title + ': ' + val + (col.unit ? ' ' + col.unit : ''));
    }
  }

  const row = [
    r.id || '',
    normalizeDateIso(r.reportDate),
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
    Number(customCat['cat_1795524799070'] || 0),
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
    summaryParts.join(' | ')
  ];

  for (let i = 0; i < dynamicValues.length; i++) {
    row.push(dynamicValues[i]);
  }
  row.push(JSON.stringify(r));
  return row;
}

function compareReportsNewestFirst(a, b) {
  const dateA = normalizeDateIso(a.reportDate);
  const dateB = normalizeDateIso(b.reportDate);
  if (dateA !== dateB) {
    return dateB.localeCompare(dateA); // คอลัมน์ B: วันที่รายงานล่าสุดอยู่ด้านบนสุดเสมอ
  }
  const msA = getReportTimestampMs(a);
  const msB = getReportTimestampMs(b);
  if (msA !== msB) {
    return msB - msA; // ภายในวันเดียวกัน: เวลาที่มีการรายงาน/แก้ไขล่าสุดอยู่ด้านบนสุดเสมอ
  }
  return String(a.officeId || '').localeCompare(String(b.officeId || ''));
}

function writeTableToSheet(sheet, headers, rows, headerBgColor, sortReportRows) {
  const numCols = headers.length;
  const prevLastRow = sheet.getLastRow();
  const prevLastCol = sheet.getLastColumn();

  // อัปเดตแถวหัวตารางให้ครบทุกคอลัมน์
  const headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange.setValues([headers]);
  headerRange.setBackground(headerBgColor || '#0f172a');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  sheet.setFrozenRows(1);

  if (rows.length > 0) {
    const dataRange = sheet.getRange(2, 1, rows.length, numCols);
    if (sortReportRows) {
      // บังคับคอลัมน์ B (วันที่รายงาน YYYY-MM-DD) และคอลัมน์เวลาแก้ไขล่าสุด เป็นข้อความมาตรฐานเพื่อให้เรียงลำดับแม่นยำ 100%
      sheet.getRange(2, 2, rows.length, 1).setNumberFormat('@');
      const updatedColIdx = headers.indexOf('เวลาแก้ไขล่าสุด (ISO)');
      if (updatedColIdx >= 0) {
        sheet.getRange(2, updatedColIdx + 1, rows.length, 1).setNumberFormat('@');
      }
    }
    dataRange.setValues(rows);
    if (sortReportRows && rows.length > 1) {
      const updatedColIdx = headers.indexOf('เวลาแก้ไขล่าสุด (ISO)');
      const sortSpecs = [{ column: 2, ascending: false }];
      if (updatedColIdx >= 0) {
        sortSpecs.push({ column: updatedColIdx + 1, ascending: false });
      }
      try {
        dataRange.sort(sortSpecs);
      } catch (e) {}
    }
  }

  // ลบแถวส่วนเกินด้านล่าง (เช่น กรณีรวมแถวซ้ำแล้วจำนวนแถวลดลง)
  if (prevLastRow > rows.length + 1) {
    sheet.deleteRows(rows.length + 2, prevLastRow - (rows.length + 1));
  }

  // ล้างคอลัมน์ส่วนเกินด้านขวาหากมี
  if (prevLastCol > numCols) {
    sheet.getRange(1, numCols + 1, Math.max(1, rows.length + 1), prevLastCol - numCols).clearContent();
  }
}

function syncMonthlyArchiveTabs(sortedReports, dynamicCols, fullHeaders, touchedMonthTabsMap) {
  if (!ENABLE_MONTHLY_ARCHIVE_TABS) return;
  const tabKeys = Object.keys(touchedMonthTabsMap || {});
  if (tabKeys.length === 0) return;

  const groupedByTab = {};
  for (let i = 0; i < tabKeys.length; i++) {
    groupedByTab[tabKeys[i]] = [];
  }

  for (let i = 0; i < sortedReports.length; i++) {
    const r = sortedReports[i];
    const tabName = getMonthlyTabNameFromDate(r.reportDate);
    if (tabName && groupedByTab[tabName] !== undefined) {
      groupedByTab[tabName].push(reportToRow(r, dynamicCols));
    }
  }

  for (let i = 0; i < tabKeys.length; i++) {
    const tabName = tabKeys[i];
    const monthRows = groupedByTab[tabName] || [];
    const mSheet = getOrCreateNamedSheet(tabName, '#1e3a8a', fullHeaders);
    writeTableToSheet(mSheet, fullHeaders, monthRows, '#1e3a8a', true);
  }
}

function parseIsoMs_(val) {
  if (!val) return 0;
  const ms = Date.parse(String(val));
  return isNaN(ms) ? 0 : ms;
}

function readMasterConfigFromSheet_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(MASTER_CONFIG_SHEET_NAME);
    if (!sheet || sheet.getLastRow() <= 1) return null;
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    const chunks = [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][1] !== '' && rows[i][1] !== null && rows[i][1] !== undefined) {
        chunks.push(String(rows[i][1]));
      }
    }
    if (chunks.length === 0) return null;
    const parsed = JSON.parse(chunks.join(''));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    return null;
  }
}

function mergeMasterConfigOnSheet_(base, incoming) {
  if (!base || typeof base !== 'object') return incoming || {};
  if (!incoming || typeof incoming !== 'object') return base;

  const baseUpdatedMs = parseIsoMs_(base.updatedAt);
  const incUpdatedMs = parseIsoMs_(incoming.updatedAt);
  const baseCfgMs = parseIsoMs_(base.configUpdatedAt) || baseUpdatedMs;
  const incCfgMs = parseIsoMs_(incoming.configUpdatedAt) || incUpdatedMs;

  const merged = incCfgMs >= baseCfgMs
    ? Object.assign({}, base, incoming)
    : Object.assign({}, incoming, base);

  function pickSection(arrKey, tsKey) {
    const baseArr = Array.isArray(base[arrKey]) ? base[arrKey] : [];
    const incArr = Array.isArray(incoming[arrKey]) ? incoming[arrKey] : [];
    const baseDedMs = parseIsoMs_(base[tsKey]);
    const incDedMs = parseIsoMs_(incoming[tsKey]);
    const baseMs = baseDedMs || baseUpdatedMs;
    const incMs = incDedMs || incUpdatedMs;

    if (incArr.length === 0 && baseArr.length > 0) {
      merged[arrKey] = baseArr;
      if (base[tsKey]) merged[tsKey] = base[tsKey];
      return;
    }
    if (baseArr.length === 0 && incArr.length > 0) {
      merged[arrKey] = incArr;
      if (incoming[tsKey]) merged[tsKey] = incoming[tsKey];
      return;
    }
    if (baseDedMs > 0 && incDedMs === 0) {
      merged[arrKey] = baseArr;
      if (base[tsKey]) merged[tsKey] = base[tsKey];
      return;
    }
    if (incDedMs > 0 && baseDedMs === 0) {
      merged[arrKey] = incArr;
      merged[tsKey] = incoming[tsKey];
      return;
    }
    if (baseMs > incMs) {
      merged[arrKey] = baseArr;
      if (base[tsKey]) merged[tsKey] = base[tsKey];
    } else if (incArr.length > 0) {
      merged[arrKey] = incArr;
      if (incoming[tsKey]) merged[tsKey] = incoming[tsKey];
    }
  }

  pickSection('bundledCategories', 'categoriesUpdatedAt');
  pickSection('bundledQueueMetrics', 'queueMetricsUpdatedAt');
  pickSection('bundledReporters', 'reportersUpdatedAt');
  pickSection('bundledOffices', 'officesUpdatedAt');

  // ปกป้องหัวข้อและสถานะที่แอดมินสร้างเองไม่ให้หายจากการซิงก์ข้อมูลเก่า
  function preserveCustom(arrKey, delKey, prefix) {
    const delMap = {};
    const baseDel = Array.isArray(base[delKey]) ? base[delKey] : [];
    const incDel = Array.isArray(incoming[delKey]) ? incoming[delKey] : [];
    for (let i = 0; i < baseDel.length; i++) delMap[String(baseDel[i])] = true;
    for (let i = 0; i < incDel.length; i++) delMap[String(incDel[i])] = true;

    const primary = Array.isArray(merged[arrKey]) ? merged[arrKey].slice() : [];
    const primaryIds = {};
    for (let i = 0; i < primary.length; i++) {
      if (primary[i] && primary[i].id) primaryIds[String(primary[i].id)] = true;
    }

    const candidates = (Array.isArray(base[arrKey]) ? base[arrKey] : []).concat(
      Array.isArray(incoming[arrKey]) ? incoming[arrKey] : []
    );
    for (let i = 0; i < candidates.length; i++) {
      const item = candidates[i];
      const id = item && item.id ? String(item.id) : '';
      if (id && item.title && !primaryIds[id] && !delMap[id] && (item.isDefault === false || id.indexOf(prefix) === 0)) {
        const copy = Object.assign({}, item, { sortOrder: primary.length });
        primary.push(copy);
        primaryIds[id] = true;
      }
    }
    merged[arrKey] = primary;
    const finalDel = [];
    for (const k in delMap) {
      if (!primaryIds[k]) finalDel.push(k);
    }
    merged[delKey] = finalDel;
  }

  preserveCustom('bundledCategories', 'deletedCategoryIds', 'cat_');
  preserveCustom('bundledQueueMetrics', 'deletedQueueMetricIds', 'custom_queue_');

  // รวมข้อความแจ้งปัญหาและตอบกลับหุ่นยนต์ (NAIJEABKUB)
  const issueMap = {};
  const allIssues = (Array.isArray(base.bundledIssues) ? base.bundledIssues : []).concat(
    Array.isArray(incoming.bundledIssues) ? incoming.bundledIssues : []
  );
  for (let i = 0; i < allIssues.length; i++) {
    const iss = allIssues[i];
    if (!iss || !iss.id) continue;
    const prev = issueMap[iss.id];
    if (!prev) {
      issueMap[iss.id] = iss;
    } else {
      const prevMs = parseIsoMs_(prev.updatedAt || prev.adminReplyAt || prev.createdAt);
      const currMs = parseIsoMs_(iss.updatedAt || iss.adminReplyAt || iss.createdAt);
      if (currMs >= prevMs) issueMap[iss.id] = iss;
    }
  }
  merged.bundledIssues = Object.keys(issueMap).map(function (k) { return issueMap[k]; });
  merged.updatedAt = new Date(Math.max(baseUpdatedMs, incUpdatedMs, Date.now())).toISOString();
  return merged;
}

function writeMasterConfigToSheet_(configObj) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(MASTER_CONFIG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MASTER_CONFIG_SHEET_NAME);
  }
  const headers = [
    'ลำดับชิ้นส่วน',
    'ข้อมูลการตั้งค่าระบบ (JSON - ห้ามแก้ไข)',
    'เวลาอัปเดตล่าสุด (ISO)',
    'จำนวนหัวข้อกลุ่มเป้าหมาย',
    'จำนวนสถานะคิว',
    'จำนวนศูนย์บริการ'
  ];
  const compact = Object.assign({}, configObj);
  delete compact.bundledDeletedReports;
  const serialized = JSON.stringify(compact);
  const CHUNK_LEN = 40000;
  const rows = [];
  const catCount = Array.isArray(compact.bundledCategories) ? compact.bundledCategories.length : 0;
  const qmCount = Array.isArray(compact.bundledQueueMetrics) ? compact.bundledQueueMetrics.length : 0;
  const offCount = Array.isArray(compact.bundledOffices) ? compact.bundledOffices.length : 0;
  const updatedIso = compact.updatedAt || new Date().toISOString();

  for (let i = 0; i < serialized.length; i += CHUNK_LEN) {
    const idx = Math.floor(i / CHUNK_LEN) + 1;
    rows.push([
      idx,
      serialized.slice(i, i + CHUNK_LEN),
      idx === 1 ? updatedIso : '',
      idx === 1 ? catCount : '',
      idx === 1 ? qmCount : '',
      idx === 1 ? offCount : ''
    ]);
  }
  if (rows.length === 0) {
    rows.push([1, '{}', updatedIso, 0, 0, 0]);
  }
  writeTableToSheet(sheet, headers, rows, '#065f46');
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const action = body.action || 'upsert_single';
    const incomingSchema = body.schema || null;

    // 1) ซิงก์การตั้งค่าระบบแอดมิน (หัวข้อกลุ่มเป้าหมาย / สถานะคิว / ศูนย์บริการ / ไฮไลต์ / หุ่นยนต์) แบบรวดเร็ว
    if (body.masterConfig && typeof body.masterConfig === 'object') {
      const existingMaster = readMasterConfigFromSheet_();
      const mergedMaster = mergeMasterConfigOnSheet_(existingMaster, body.masterConfig);
      writeMasterConfigToSheet_(mergedMaster);
      if (action === 'sync_master_config') {
        return ContentService.createTextOutput(
          JSON.stringify({
            ok: true,
            action: 'sync_master_config',
            categoriesCount: Array.isArray(mergedMaster.bundledCategories) ? mergedMaster.bundledCategories.length : 0,
            queueMetricsCount: Array.isArray(mergedMaster.bundledQueueMetrics) ? mergedMaster.bundledQueueMetrics.length : 0,
            officesCount: Array.isArray(mergedMaster.bundledOffices) ? mergedMaster.bundledOffices.length : 0,
            updatedAt: mergedMaster.updatedAt
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }
    }

    const sheet = getOrCreateSheet();

    const lastRow = sheet.getLastRow();
    const lastCol = Math.max(sheet.getLastColumn(), 1);
    const existingHeaders = lastRow >= 1
      ? sheet.getRange(1, 1, 1, lastCol).getValues()[0]
      : [];
    const jsonColIdx = findJsonBackupColIndex(existingHeaders);

    const existingRawRows = lastRow > 1
      ? sheet.getRange(2, 1, lastRow - 1, lastCol).getValues()
      : [];

    // แปลงแถวเดิมทั้งหมดเป็นอ็อบเจกต์รายงาน พร้อมรวมรายการซ้ำ (ทั้งซ้ำตาม ID และซ้ำตาม วัน+สำนักงาน+ศูนย์บริการ)
    const slotMap = {};
    let duplicatesMerged = 0;
    const touchedMonthTabs = {};

    for (let i = 0; i < existingRawRows.length; i++) {
      const rep = rowToFallbackReport(existingRawRows[i], jsonColIdx, existingHeaders);
      if (!rep || !rep.id || rep.id === 'report-test-123') continue;
      const slotKey = getReportSlotKey(rep);
      if (slotMap[slotKey]) {
        slotMap[slotKey] = pickWinningReport(slotMap[slotKey], rep);
        duplicatesMerged++;
        const dupTab = getMonthlyTabNameFromDate(rep.reportDate);
        if (dupTab) touchedMonthTabs[dupTab] = true;
      } else {
        slotMap[slotKey] = rep;
      }
    }

    if (action === 'delete_single' && body.reportId) {
      const targetId = String(body.reportId).trim();
      let deletedAny = false;
      for (const sKey in slotMap) {
        if (String(slotMap[sKey].id || '').trim() === targetId) {
          const oldTab = getMonthlyTabNameFromDate(slotMap[sKey].reportDate);
          if (oldTab) touchedMonthTabs[oldTab] = true;
          delete slotMap[sKey];
          deletedAny = true;
        }
      }
      const remainingReports = Object.keys(slotMap).map(function (k) { return slotMap[k]; });
      remainingReports.sort(compareReportsNewestFirst);
      const dynamicColsDel = buildDynamicColumns(existingHeaders, incomingSchema, remainingReports);
      const fullHeadersDel = buildFullHeaders(dynamicColsDel);
      const rowsDel = remainingReports.map(function (r) { return reportToRow(r, dynamicColsDel); });
      writeTableToSheet(sheet, fullHeadersDel, rowsDel, '#0f172a', true);
      syncMonthlyArchiveTabs(remainingReports, dynamicColsDel, fullHeadersDel, touchedMonthTabs);
      return ContentService.createTextOutput(
        JSON.stringify({ ok: true, deleted: targetId, deletedAny: deletedAny, duplicatesMerged: duplicatesMerged, totalRows: remainingReports.length })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    const incomingList = action === 'upsert_bulk'
      ? (Array.isArray(body.reports) ? body.reports : [])
      : (action === 'sync_schema' || action === 'deduplicate_all')
      ? []
      : (body.report ? [body.report] : []);

    let insertedCount = 0;
    let updatedCount = 0;

    for (let i = 0; i < incomingList.length; i++) {
      const r = incomingList[i];
      if (!r || !r.id || r.id === 'report-test-123') continue;
      r.reportDate = normalizeDateIso(r.reportDate);

      const newSlotKey = getReportSlotKey(r);
      const newTab = getMonthlyTabNameFromDate(r.reportDate);
      if (newTab) touchedMonthTabs[newTab] = true;

      // หากมีรายงานเดิมที่ ID ตรงกันแต่อยู่คนละช่อง (เช่น แอดมินแก้เปลี่ยนวันที่/เปลี่ยนศูนย์) ให้ลบช่องเดิมออกก่อน
      const rid = String(r.id).trim();
      for (const existingKey in slotMap) {
        if (existingKey !== newSlotKey && String(slotMap[existingKey].id || '').trim() === rid) {
          const prevTab = getMonthlyTabNameFromDate(slotMap[existingKey].reportDate);
          if (prevTab) touchedMonthTabs[prevTab] = true;
          delete slotMap[existingKey];
        }
      }

      if (slotMap[newSlotKey]) {
        const prevTab = getMonthlyTabNameFromDate(slotMap[newSlotKey].reportDate);
        if (prevTab) touchedMonthTabs[prevTab] = true;
        // หากเป็น upsert_single ให้ยึดฉบับที่ส่งมาล่าสุดหรือฉบับที่ใหม่กว่าเสมอ
        slotMap[newSlotKey] = action === 'upsert_single'
          ? r
          : pickWinningReport(slotMap[newSlotKey], r);
        updatedCount++;
      } else {
        slotMap[newSlotKey] = r;
        insertedCount++;
      }
    }

    const allReports = Object.keys(slotMap).map(function (k) { return slotMap[k]; });
    allReports.sort(compareReportsNewestFirst);

    const dynamicCols = buildDynamicColumns(existingHeaders, incomingSchema, allReports);
    const fullHeaders = buildFullHeaders(dynamicCols);

    // หากมีการเพิ่มคอลัมน์ใหม่หรือสั่งล้างข้อมูลซ้ำ ให้ซิงค์หัวตารางไปยังแท็บรายเดือนทั้งหมดที่มีข้อมูลด้วย
    const headerChanged = fullHeaders.length !== existingHeaders.length ||
      fullHeaders.some(function (h, idx) { return String(existingHeaders[idx] || '') !== h; });

    if (headerChanged || action === 'sync_schema' || action === 'deduplicate_all' || body.deduplicate) {
      for (let i = 0; i < allReports.length; i++) {
        const t = getMonthlyTabNameFromDate(allReports[i].reportDate);
        if (t) touchedMonthTabs[t] = true;
      }
    }

    const allRows = allReports.map(function (r) { return reportToRow(r, dynamicCols); });
    writeTableToSheet(sheet, fullHeaders, allRows, '#0f172a', true);
    syncMonthlyArchiveTabs(allReports, dynamicCols, fullHeaders, touchedMonthTabs);

    return ContentService.createTextOutput(
      JSON.stringify({
        ok: true,
        inserted: insertedCount,
        updated: updatedCount,
        duplicatesMerged: duplicatesMerged,
        dynamicColumnCount: dynamicCols.length,
        totalColumns: fullHeaders.length,
        sorted: 'reportDate_DESC_updatedAt_DESC',
        monthlyArchiveSynced: Object.keys(touchedMonthTabs),
        totalRows: allReports.length
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

function sortAllReportSheetsNow() {
  const sheet = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  if (lastRow <= 1) return;
  const existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const jsonColIdx = findJsonBackupColIndex(existingHeaders);
  const rawRows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const slotMap = {};
  const touchedTabs = {};
  for (let i = 0; i < rawRows.length; i++) {
    const rep = rowToFallbackReport(rawRows[i], jsonColIdx, existingHeaders);
    if (!rep || !rep.id || rep.id === 'report-test-123') continue;
    const slotKey = getReportSlotKey(rep);
    slotMap[slotKey] = pickWinningReport(slotMap[slotKey], rep);
    const t = getMonthlyTabNameFromDate(rep.reportDate);
    if (t) touchedTabs[t] = true;
  }
  const allReports = Object.keys(slotMap).map(function (k) { return slotMap[k]; });
  allReports.sort(compareReportsNewestFirst);
  const dynamicCols = buildDynamicColumns(existingHeaders, null, allReports);
  const fullHeaders = buildFullHeaders(dynamicCols);
  const allRows = allReports.map(function (r) { return reportToRow(r, dynamicCols); });
  writeTableToSheet(sheet, fullHeaders, allRows, '#0f172a', true);
  syncMonthlyArchiveTabs(allReports, dynamicCols, fullHeaders, touchedTabs);
}

function doGet() {
  try {
    const masterConfig = readMasterConfigFromSheet_();
    const sheet = getOrCreateSheet();
    const lastRow = sheet.getLastRow();
    const lastCol = Math.max(sheet.getLastColumn(), 1);
    if (lastRow <= 1) {
      return ContentService.createTextOutput(
        JSON.stringify({ ok: true, count: 0, reports: [], masterConfig: masterConfig })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const jsonColIdx = findJsonBackupColIndex(headerRow);
    const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    const slotMap = {};
    for (let i = 0; i < data.length; i++) {
      const rep = rowToFallbackReport(data[i], jsonColIdx, headerRow);
      if (!rep || !rep.id || rep.id === 'report-test-123') continue;
      const slotKey = getReportSlotKey(rep);
      slotMap[slotKey] = pickWinningReport(slotMap[slotKey], rep);
    }

    const reports = Object.keys(slotMap).map(function (k) { return slotMap[k]; });
    reports.sort(compareReportsNewestFirst);

    return ContentService.createTextOutput(
      JSON.stringify({
        ok: true,
        count: reports.length,
        sorted: true,
        deduplicated: true,
        reports: reports,
        masterConfig: masterConfig
      })
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
  explicitWebhookUrl?: string,
  schema?: GoogleSheetsSchemaMetadata
): Promise<boolean> {
  const cfg = getStoredGoogleSheetsConfig();
  const url = (explicitWebhookUrl || cfg.webhookUrl || '').trim();
  if (!url || (!explicitWebhookUrl && !cfg.autoSync)) return false;

  const payload = {
    action: 'upsert_single',
    report,
    schema: schema || buildSheetsSchemaMetadata(),
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

export async function syncMasterConfigToGoogleSheets(
  masterConfig: Record<string, unknown>,
  explicitWebhookUrl?: string
): Promise<boolean> {
  const cfg = getStoredGoogleSheetsConfig();
  const url = (explicitWebhookUrl || cfg.webhookUrl || '').trim();
  if (!url || !url.startsWith('https://script.google.com/')) return false;
  if (!explicitWebhookUrl && !cfg.autoSync) return false;

  // Omit bundledDeletedReports to keep the master config payload lean and fast
  const compactConfig: Record<string, unknown> = { ...masterConfig };
  delete compactConfig.bundledDeletedReports;

  const payload = {
    action: 'sync_master_config',
    masterConfig: compactConfig,
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

export async function syncSchemaToGoogleSheets(
  explicitWebhookUrl?: string,
  schema?: GoogleSheetsSchemaMetadata
): Promise<boolean> {
  const cfg = getStoredGoogleSheetsConfig();
  const url = (explicitWebhookUrl || cfg.webhookUrl || '').trim();
  if (!url || !url.startsWith('https://script.google.com/')) return false;
  if (!explicitWebhookUrl && !cfg.autoSync) return false;

  const payload = {
    action: 'sync_schema',
    deduplicate: true,
    schema: schema || buildSheetsSchemaMetadata(),
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
    schema: buildSheetsSchemaMetadata(),
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
  onProgress?: (syncedCount: number, totalCount: number) => void,
  schema?: GoogleSheetsSchemaMetadata
): Promise<{
  success: boolean;
  syncedCount: number;
  duplicatesMerged?: number;
  message?: string;
}> {
  const cleanUrl = (webhookUrl || '').trim();
  if (!cleanUrl || !cleanUrl.startsWith('https://script.google.com/')) {
    return {
      success: false,
      syncedCount: 0,
      message: 'กรุณาระบุ Google Apps Script Web App URL ที่ถูกต้อง (ขึ้นต้นด้วย https://script.google.com/...)',
    };
  }

  // คัดกรองรายการซ้ำในวันเดียวกัน + สำนักงานเดียวกัน + ศูนย์บริการเดียวกันก่อนส่งทุกครั้ง
  const { deduped, removedDuplicates } = deduplicateReportsBySlot(reports);

  const sorted = [...deduped].sort((a, b) => {
    const dateCmp = (b.reportDate || '').localeCompare(a.reportDate || '');
    if (dateCmp !== 0) return dateCmp;
    const timeA = a.updatedAt || a.createdAt || '';
    const timeB = b.updatedAt || b.createdAt || '';
    if (timeA !== timeB) return timeB.localeCompare(timeA);
    return (a.officeId || '').localeCompare(b.officeId || '');
  });

  const total = sorted.length;
  const resolvedSchema = schema || buildSheetsSchemaMetadata();

  if (total === 0) {
    return { success: true, syncedCount: 0, message: 'ไม่มีข้อมูลรายงานให้ซิงค์' };
  }

  const BATCH_SIZE = 120;
  let synced = 0;
  let remoteMerged = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = sorted.slice(i, i + BATCH_SIZE);
    const isLastBatch = i + BATCH_SIZE >= total;
    const payload = {
      action: 'upsert_bulk',
      reports: chunk,
      schema: resolvedSchema,
      deduplicate: isLastBatch,
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
        try {
          const json = await res.json();
          if (typeof json?.duplicatesMerged === 'number') {
            remoteMerged += json.duplicatesMerged;
          }
        } catch {}
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

  const totalMerged = Math.max(removedDuplicates.length, remoteMerged);
  return {
    success: true,
    syncedCount: synced,
    duplicatesMerged: totalMerged,
    message:
      totalMerged > 0
        ? `ซิงค์ข้อมูลรายงาน ${synced.toLocaleString()} รายการ ลง Google Sheets สำเร็จ (รวมและคัดกรองรายการซ้ำออก ${totalMerged.toLocaleString()} แถว พร้อมอัปเดตคอลัมน์หัวข้อเพิ่มเติมแล้ว)`
        : `ซิงค์ข้อมูลรายงานทั้งหมด ${synced.toLocaleString()} รายการ ลง Google Sheets พร้อมอัปเดตคอลัมน์หัวข้อเพิ่มเติมเรียบร้อยแล้ว`,
  };
}

export async function pullReportsFromGoogleSheets(
  webhookUrl: string
): Promise<{
  success: boolean;
  reports: DOEReport[];
  masterConfig?: Record<string, unknown> | null;
  message?: string;
}> {
  const cleanUrl = (webhookUrl || '').trim();
  if (!cleanUrl || !cleanUrl.startsWith('https://script.google.com/')) {
    return {
      success: false,
      reports: [],
      masterConfig: null,
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
        const { deduped } = deduplicateReportsBySlot(valid);
        const masterConfig =
          data?.masterConfig && typeof data.masterConfig === 'object'
            ? (data.masterConfig as Record<string, unknown>)
            : null;
        return {
          success: true,
          reports: deduped,
          masterConfig,
          message: `ดึงข้อมูลจาก Google Sheets สำเร็จ จำนวน ${deduped.length.toLocaleString()} รายการ`,
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
        const { deduped } = deduplicateReportsBySlot(valid);
        const masterConfig =
          data?.masterConfig && typeof data.masterConfig === 'object'
            ? (data.masterConfig as Record<string, unknown>)
            : null;
        return {
          success: true,
          reports: deduped,
          masterConfig,
          message: `ดึงข้อมูลจาก Google Sheets สำเร็จ จำนวน ${deduped.length.toLocaleString()} รายการ`,
        };
      }
    }
  } catch (err) {
    return {
      success: false,
      reports: [],
      masterConfig: null,
      message: `ไม่สามารถดึงข้อมูลจาก Google Sheets ได้: ${String(err)}`,
    };
  }

  return {
    success: false,
    reports: [],
    masterConfig: null,
    message: 'ไม่พบข้อมูลตอบกลับจาก Google Sheets กรุณาตรวจสอบสิทธิ์ Web App (ตั้งเป็น Anyone)',
  };
}
