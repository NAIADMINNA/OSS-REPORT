import { DOEReport } from '../types/doe';

const THAI_DAYS = [
  'วันอาทิตย์',
  'วันจันทร์',
  'วันอังคาร',
  'วันพุธ',
  'วันพฤหัสบดี',
  'วันศุกร์',
  'วันเสาร์',
];

const THAI_MONTHS_FULL = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

const THAI_MONTHS_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

/**
 * Converts a Date or YYYY-MM-DD string to Thai full format:
 * e.g., "วันพุธที่ 7 ตุลาคม 2569"
 */
export function formatThaiDateFull(dateInput: string | Date): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput + 'T00:00:00') : dateInput;
  if (isNaN(date.getTime())) return String(dateInput);

  const dayName = THAI_DAYS[date.getDay()];
  const dayNum = date.getDate();
  const monthName = THAI_MONTHS_FULL[date.getMonth()];
  const thaiYear = date.getFullYear() + 543;

  return `${dayName}ที่ ${dayNum} ${monthName} ${thaiYear}`;
}

/**
 * Formats a date to short Thai string:
 * e.g., "7 ต.ค. 2569"
 */
export function formatThaiDateShort(dateInput: string | Date): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput + 'T00:00:00') : dateInput;
  if (isNaN(date.getTime())) return String(dateInput);

  const dayNum = date.getDate();
  const monthName = THAI_MONTHS_SHORT[date.getMonth()];
  const thaiYear = date.getFullYear() + 543;

  return `${dayNum} ${monthName} ${thaiYear}`;
}

/**
 * Formats a date range into official Thai format:
 * e.g., "วันที่ 1 - 5 ตุลาคม 2569" or "วันที่ 28 ก.ย. - 5 ต.ค. 2569"
 */
export function formatThaiDateRange(startDateInput: string, endDateInput: string): string {
  if (!startDateInput && !endDateInput) return 'ทุกช่วงวัน';
  if (!startDateInput) return `ถึงวันที่ ${formatThaiDateShort(endDateInput)}`;
  if (!endDateInput) return `ตั้งแต่วันที่ ${formatThaiDateShort(startDateInput)}`;
  if (startDateInput === endDateInput) return formatThaiDateFull(startDateInput);

  const d1 = new Date(startDateInput + 'T00:00:00');
  const d2 = new Date(endDateInput + 'T00:00:00');
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
    return `${startDateInput} ถึง ${endDateInput}`;
  }

  const y1 = d1.getFullYear() + 543;
  const y2 = d2.getFullYear() + 543;
  const m1 = d1.getMonth();
  const m2 = d2.getMonth();
  const day1 = d1.getDate();
  const day2 = d2.getDate();

  if (y1 === y2 && m1 === m2) {
    return `วันที่ ${day1} - ${day2} ${THAI_MONTHS_FULL[m1]} ${y1}`;
  } else if (y1 === y2) {
    return `วันที่ ${day1} ${THAI_MONTHS_SHORT[m1]} - ${day2} ${THAI_MONTHS_SHORT[m2]} ${y1}`;
  } else {
    return `วันที่ ${day1} ${THAI_MONTHS_SHORT[m1]} ${y1} - ${day2} ${THAI_MONTHS_SHORT[m2]} ${y2}`;
  }
}

/**
 * Returns today's ISO date string (YYYY-MM-DD)
 */
export function getTodayIsoDate(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Number formatting with commas
 */
export function formatNumber(num: number | undefined | null): string {
  if (num === undefined || num === null || isNaN(num)) return '0';
  return num.toLocaleString('th-TH');
}

/**
 * Generates an official summary text suitable for LINE groups / executive reporting
 */
export function generateLineSummaryText(report: DOEReport): string {
  const totalSections =
    report.section59 +
    report.section62 +
    report.section63_1 +
    report.section63_2 +
    report.section64 +
    report.modifyDetails +
    report.substituteCard;

  const dateLabel = report.reportDateThaiStr || formatThaiDateFull(report.reportDate);
  const isCycle =
    dateLabel.includes('ประจำรอบ') ||
    dateLabel.includes('รอบที่') ||
    dateLabel.includes('รอบสัปดาห์') ||
    dateLabel.includes('รอบประจำ') ||
    dateLabel.includes(' - ') ||
    dateLabel.includes(' – ') ||
    dateLabel.includes('ทุกช่วงวัน') ||
    dateLabel.includes('ถึง');

  const reporterName = isCycle ? 'สำนักบริหารแรงงานต่างด้าว' : (report.reporterName || '-');
  const reporterPosition = isCycle ? 'กรมการจัดหางาน กระทรวงแรงงาน' : (report.reporterPosition || '-');
  const phoneNumber = isCycle ? '02-354-0082' : (report.phoneNumber || '-');

  return `📊 ${report.officeName}
🏢 ${report.centerName}
══════════════════════════
เรียน อธิบดี/ผู้บริหาร

📌 รายงานผลการปฏิบัติงาน ${dateLabel}

🔹 การออกบัตรใบอนุญาตทำงาน (รวม ${formatNumber(totalSections)} คน):
  1. กลุ่มมาตรา 59: ${formatNumber(report.section59)} คน
  2. กลุ่มมาตรา 62: ${formatNumber(report.section62)} คน
  3. กลุ่มมาตรา 63/1: ${formatNumber(report.section63_1)} คน
  4. กลุ่มมาตรา 63/2: ${formatNumber(report.section63_2)} คน
  5. กลุ่มมาตรา 64: ${formatNumber(report.section64)} คน
  6. เปลี่ยนแปลงรายการในใบอนุญาตทำงาน: ${formatNumber(report.modifyDetails)} คน
  7. ใบแทนใบอนุญาตทำงาน: ${formatNumber(report.substituteCard)} คน

🔹 สถานะการให้บริการประจำวัน:
  • คิวนัดหมาย: ${formatNumber(report.queueAppointment)} คิว
  • ออกบัตร: ${formatNumber(report.cardsIssued)} ใบ
  • ยืนยันตัวตน: ${formatNumber(report.identityVerified)} คน
  • ไม่ออกบัตร: ${formatNumber(report.cardsNotIssued)} คน
  • ไม่มาตามนัด: ${formatNumber(report.missedAppointment)} คน
  • ไม่ตรงวันนัด: ${formatNumber(report.wrongAppointmentDate)} คน

══════════════════════════
จึงเรียนมาเพื่อโปรดทราบ
👤 ผู้รายงาน: ${reporterName}
💼 ตำแหน่ง: ${reporterPosition}
📞 โทร: ${phoneNumber}
📱 LINE: ${report.lineId || '-'}`;
}
