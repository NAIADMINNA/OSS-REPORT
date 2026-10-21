import { DOEReport, QueueMetricCategory, ReportCategory } from '../types/doe';

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
export function generateLineSummaryText(
  report: DOEReport,
  queueMetrics?: QueueMetricCategory[],
  categories?: ReportCategory[]
): string {
  const activeCats =
    categories && categories.length > 0
      ? categories.filter((c) => c.isActive)
      : [
          { id: 'cat_1791818621214', title: 'กลุ่มมาตรา 63/2 (มติ ครม 11 พฤศจิกายน 2568)' },
          { id: 'modifyDetails', title: 'กลุ่มมาตรา 59 / มาตรา 62' },
          { id: 'section59', title: 'กลุ่มมาตรา 59 ( MOU )' },
          { id: 'section62', title: 'มาตรา 63และกลุ่มมาตรา 63/1' },
          { id: 'section63_1', title: 'กลุ่มมาตรา 63/2' },
          { id: 'section63_2', title: 'กลุ่มมาตรา 64' },
          { id: 'section64', title: 'เปลี่ยนแปลงรายการใบอนุญาตทำงาน' },
          { id: 'substituteCard', title: 'ใบแทนใบอนุญาตทำงาน' },
        ];

  const getCategoryValue = (catId: string): number => {
    if (catId === 'section59') return report.section59 || 0;
    if (catId === 'section62') return report.section62 || 0;
    if (catId === 'section63_1') return report.section63_1 || 0;
    if (catId === 'section63_2') return report.section63_2 || 0;
    if (catId === 'section64') return report.section64 || 0;
    if (catId === 'mouGroup') return report.mouGroup || report.customCategoryValues?.['mouGroup'] || 0;
    if (catId === 'modifyDetails') return report.modifyDetails || 0;
    if (catId === 'substituteCard') return report.substituteCard || 0;
    return report.customCategoryValues?.[catId] || 0;
  };

  const totalSections = activeCats.reduce((sum, c) => sum + getCategoryValue(c.id), 0);
  const categoryLines = activeCats
    .map((c, idx) => `  ${idx + 1}. ${c.title}: ${formatNumber(getCategoryValue(c.id))} คน`)
    .join('\n');

  const getMetricLabel = (id: string, defaultTitle: string, defaultUnit: string) => {
    const found = queueMetrics?.find((m) => m.id === id);
    if (!found) return { title: defaultTitle, unit: defaultUnit };
    const title =
      id === 'cardsNotIssued' && found.title === 'ไม่ออกบัตร'
        ? 'บัตรเสีย'
        : found.title || defaultTitle;
    const unit =
      id === 'cardsNotIssued' && found.title === 'ไม่ออกบัตร' && found.unit === 'คน'
        ? 'ใบ'
        : found.unit || defaultUnit;
    return { title, unit };
  };

  const qApp = getMetricLabel('queueAppointment', 'คิวนัดหมาย', 'คิว');
  const qIss = getMetricLabel('cardsIssued', 'ออกบัตร', 'ใบ');
  const qVer = getMetricLabel('identityVerified', 'ยืนยันตัวตน', 'คน');
  const qNot = getMetricLabel('cardsNotIssued', 'บัตรเสีย', 'ใบ');
  const qMiss = getMetricLabel('missedAppointment', 'ไม่มาตามนัด', 'คน');
  const qWrong = getMetricLabel('wrongAppointmentDate', 'ไม่ตรงวันนัด', 'คน');

  const defaultQueueIds = new Set([
    'queueAppointment',
    'cardsIssued',
    'identityVerified',
    'cardsNotIssued',
    'missedAppointment',
    'wrongAppointmentDate',
  ]);
  const customQueueLines = (queueMetrics || [])
    .filter((m) => m.isActive && !defaultQueueIds.has(m.id))
    .map(
      (m) =>
        `  • ${m.title}: ${formatNumber(report.customQueueValues?.[m.id] || 0)} ${m.unit || 'คน'}`
    );

  const dateLabel = report.reportDateThaiStr || formatThaiDateFull(report.reportDate);
  const isCycle =
    report.id?.includes('cycle') ||
    dateLabel.includes('รอบ') ||
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
${categoryLines}

🔹 สถานะการให้บริการประจำวัน:
  • ${qApp.title}: ${formatNumber(report.queueAppointment)} ${qApp.unit}
  • ${qIss.title}: ${formatNumber(report.cardsIssued)} ${qIss.unit}
  • ${qVer.title}: ${formatNumber(report.identityVerified)} ${qVer.unit}
  • ${qNot.title}: ${formatNumber(report.cardsNotIssued)} ${qNot.unit}
  • ${qMiss.title}: ${formatNumber(report.missedAppointment)} ${qMiss.unit}
  • ${qWrong.title}: ${formatNumber(report.wrongAppointmentDate)} ${qWrong.unit}${
    customQueueLines.length > 0 ? '\n' + customQueueLines.join('\n') : ''
  }

══════════════════════════
จึงเรียนมาเพื่อโปรดทราบ
👤 ผู้รายงาน: ${reporterName}
💼 ตำแหน่ง: ${reporterPosition}
📞 โทร: ${phoneNumber}
📱 LINE: ${report.lineId || '-'}`;
}
