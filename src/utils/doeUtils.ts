import { DOEReport, ReportCategory } from '../types/doe';
import { EMPLOYMENT_OFFICES } from '../data/offices';

/**
 * ทำความสะอาดข้อมูลรายงาน (Sanitize & Normalize) เพื่อป้องกันปัญหาฟิลด์เป็น undefined/null
 * และกรองข้อมูลทดสอบที่อาจค้างอยู่ในระบบออกโดยอัตโนมัติ
 */
export function sanitizeReport(raw: unknown): DOEReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const id = typeof r.id === 'string' ? r.id.trim() : '';
  const officeId = typeof r.officeId === 'string' ? r.officeId.trim() : '';

  // Filter out internal connectivity test document or empty records
  if (!id || !officeId || id === 'report-test-123') {
    return null;
  }

  const matchedOffice = EMPLOYMENT_OFFICES.find((o) => o.id === officeId);

  const officeName =
    typeof r.officeName === 'string' && r.officeName.trim()
      ? r.officeName
      : matchedOffice?.name || officeId;

  const centerName =
    typeof r.centerName === 'string' && r.centerName.trim()
      ? r.centerName
      : matchedOffice?.centerName || '';

  const region =
    typeof r.region === 'string' && r.region.trim()
      ? (r.region as DOEReport['region'])
      : matchedOffice?.region || 'กรุงเทพมหานคร';

  const reportDate =
    typeof r.reportDate === 'string' && r.reportDate.trim()
      ? r.reportDate
      : new Date().toISOString().slice(0, 10);

  return {
    id,
    officeId,
    officeName,
    centerName,
    region,
    reportDate,
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
  categories?: ReportCategory[]
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

