import { DOEReport, ReportCategory } from '../types/doe';
import { EMPLOYMENT_OFFICES } from '../data/offices';
import { formatThaiDateFull } from './thaiDate';

/**
 * ทำความสะอาดข้อมูลรายงาน (Sanitize & Normalize) เพื่อป้องกันปัญหาฟิลด์เป็น undefined/null
 * และกรองข้อมูลทดสอบที่อาจค้างอยู่ในระบบออกโดยอัตโนมัติ
 */
export function sanitizeReport(raw: unknown): DOEReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const rawId = r.id != null ? String(r.id).trim() : '';
  const officeId = typeof r.officeId === 'string' ? r.officeId.trim() : '';
  const rawOfficeName = typeof r.officeName === 'string' ? r.officeName.trim() : '';
  const rawCenterName = typeof r.centerName === 'string' ? r.centerName.trim() : '';

  // Filter out internal connectivity test document or completely empty records
  if (rawId === 'report-test-123' || (!officeId && !rawOfficeName && !rawCenterName)) {
    return null;
  }

  let matchedOffice = officeId ? EMPLOYMENT_OFFICES.find((o) => o.id === officeId) : undefined;
  if (!matchedOffice) {
    if (
      rawCenterName.includes('วัดป้อมวิเชียร') ||
      rawCenterName.includes('ป้อมวิเชียร') ||
      rawOfficeName.includes('วัดป้อมวิเชียร') ||
      rawOfficeName.includes('ป้อมวิเชียร')
    ) {
      matchedOffice = EMPLOYMENT_OFFICES.find((o) => o.id === 'samutsakhon');
    } else {
      matchedOffice =
        EMPLOYMENT_OFFICES.find((o) => o.name === rawOfficeName) ||
        EMPLOYMENT_OFFICES.find((o) => {
          if (o.id === 'central_foreign_workers') return false;
          const shortProv = o.name
            .replace('สำนักงานจัดหางานจังหวัด', '')
            .replace('สำนักงานจัดหางาน', '')
            .trim();
          return (
            shortProv.length >= 2 &&
            (rawCenterName.includes(shortProv) || rawOfficeName.includes(shortProv))
          );
        });
    }
  }

  const normalizedOfficeId = matchedOffice
    ? matchedOffice.id
    : officeId || 'central_foreign_workers';

  const rawDateStr =
    typeof r.reportDate === 'string' && r.reportDate.trim()
      ? r.reportDate.trim()
      : new Date().toISOString().slice(0, 10);

  let reportDate = rawDateStr;
  // Normalize YYYY-MM-DD or YYYY/MM/DD (including Buddhist Era years >= 2400)
  const ymdMatch = rawDateStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    let year = parseInt(ymdMatch[1], 10);
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    if (year >= 2400) year -= 543;
    reportDate = `${year}-${month}-${day}`;
  } else {
    // Normalize DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = rawDateStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      let year = parseInt(dmyMatch[3], 10);
      if (year >= 2400) year -= 543;
      reportDate = `${year}-${month}-${day}`;
    }
  }

  const reportDateForId = reportDate;

  const id =
    rawId ||
    `report-${normalizedOfficeId}-${reportDateForId}-${(rawCenterName || rawOfficeName || 'std').slice(0, 20)}`;

  const officeName = matchedOffice
    ? matchedOffice.name
    : rawOfficeName || officeId;

  const officeNameEn =
    matchedOffice?.nameEn ||
    (typeof r.officeNameEn === 'string' && r.officeNameEn.trim()
      ? r.officeNameEn
      : officeName);

  const centerName =
    rawCenterName ||
    (rawOfficeName.startsWith('ศูนย์') ? rawOfficeName : '') ||
    matchedOffice?.centerName ||
    '';

  const region =
    typeof r.region === 'string' && r.region.trim() && (r.region as string) !== 'ส่วนกลาง'
      ? (r.region as DOEReport['region'])
      : matchedOffice?.region || 'กรุงเทพมหานคร';

  const reportDateThaiStr =
    typeof r.reportDateThaiStr === 'string' && r.reportDateThaiStr.trim()
      ? r.reportDateThaiStr
      : formatThaiDateFull(reportDate);

  return {
    id,
    officeId: normalizedOfficeId,
    officeName,
    officeNameEn,
    centerName,
    region,
    reportDate,
    reportDateThaiStr,
    reporterName: typeof r.reporterName === 'string' ? r.reporterName : '',
    reporterPosition: typeof r.reporterPosition === 'string' ? r.reporterPosition : '',
    phoneNumber: typeof r.phoneNumber === 'string' ? r.phoneNumber : '',
    lineId: typeof r.lineId === 'string' ? r.lineId : '',
    section59: Number(r.section59) || 0,
    section62: Number(r.section62) || 0,
    section63_1: Number(r.section63_1) || 0,
    section63_2: Number(r.section63_2) || 0,
    section64: Number(r.section64) || 0,
    mouGroup: Number(r.mouGroup) || 0,
    modifyDetails: Number(r.modifyDetails) || 0,
    substituteCard: Number(r.substituteCard) || 0,
    customCategoryValues:
      r.customCategoryValues && typeof r.customCategoryValues === 'object'
        ? (r.customCategoryValues as Record<string, number>)
        : {},
    queueAppointment: Number(r.queueAppointment) || 0,
    cardsIssued: Number(r.cardsIssued) || 0,
    identityVerified: Number(r.identityVerified) || 0,
    cardsNotIssued: Number(r.cardsNotIssued) || 0,
    missedAppointment: Number(r.missedAppointment) || 0,
    wrongAppointmentDate: Number(r.wrongAppointmentDate) || 0,
    customQueueValues:
      r.customQueueValues && typeof r.customQueueValues === 'object'
        ? (r.customQueueValues as Record<string, number>)
        : r.customQueueMetricValues && typeof r.customQueueMetricValues === 'object'
        ? (r.customQueueMetricValues as Record<string, number>)
        : {},
    cumulativeCardsIssued: Number(r.cumulativeCardsIssued) || 0,
    cumulativeSinceDate:
      typeof r.cumulativeSinceDate === 'string' ? r.cumulativeSinceDate : '13 ตุลาคม 2568',
    notes: typeof r.notes === 'string' ? r.notes : '',
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : new Date().toISOString(),
  };
}

export function sanitizeReportList(list: unknown): DOEReport[] {
  if (!Array.isArray(list)) return [];
  const result: DOEReport[] = [];
  for (const item of list) {
    const clean = sanitizeReport(item);
    if (clean) {
      result.push(clean);
    }
  }
  return result;
}

/**
 * คำนวณยอดรวมการออกบัตรใบอนุญาตทำงานจากตัวเลขตามจริงของทุกกลุ่มมาตรา (ปัจจุบันมี 8 กลุ่มมาตรฐาน + กลุ่มที่กำหนดเพิ่ม)
 */
export function calculateReportTotalSections(
  report: Partial<DOEReport>,
  categories?: ReportCategory[] | null
): number {
  if (categories && categories.length > 0) {
    return categories
      .filter((c) => c.isActive)
      .reduce((sum, cat) => {
        let val = 0;
        if (cat.id === 'section59') val = Number(report.section59) || 0;
        else if (cat.id === 'section62') val = Number(report.section62) || 0;
        else if (cat.id === 'section63_1') val = Number(report.section63_1) || 0;
        else if (cat.id === 'section63_2') val = Number(report.section63_2) || 0;
        else if (cat.id === 'section64') val = Number(report.section64) || 0;
        else if (cat.id === 'mouGroup') {
          val =
            Number(report.mouGroup) ||
            Number(report.customCategoryValues?.['mouGroup']) ||
            0;
        } else if (cat.id === 'modifyDetails') val = Number(report.modifyDetails) || 0;
        else if (cat.id === 'substituteCard') val = Number(report.substituteCard) || 0;
        else {
          val = Number(report.customCategoryValues?.[cat.id]) || 0;
        }
        return sum + val;
      }, 0);
  }

  // Fallback: รวม 8 กลุ่มมาตรฐานและ customCategoryValues ทั้งหมด
  const customSum = Object.values(report.customCategoryValues || {}).reduce(
    (sum, val) => sum + (Number(val) || 0),
    0
  );

  return (
    (Number(report.section59) || 0) +
    (Number(report.section62) || 0) +
    (Number(report.section63_1) || 0) +
    (Number(report.section63_2) || 0) +
    (Number(report.section64) || 0) +
    (Number(report.mouGroup) || Number(report.customCategoryValues?.['mouGroup']) || 0) +
    (Number(report.modifyDetails) || 0) +
    (Number(report.substituteCard) || 0) +
    customSum
  );
}

