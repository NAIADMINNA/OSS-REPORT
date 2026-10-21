import { EmploymentOffice } from '../types/doe';

export const REGION_ORDER = [
  'กรุงเทพมหานคร',
  'ภาคกลางและตะวันตก',
  'ภาคตะวันออก',
  'ภาคตะวันออกเฉียงเหนือ',
  'ภาคเหนือ',
  'ภาคใต้',
  'เฉพาะกิจ',
  'ส่วนกลาง',
] as const;

export function getRegionLabel(region: string): string {
  switch (region) {
    case 'กรุงเทพมหานคร':
      return '🏛️ กรุงเทพมหานคร (10 พื้นที่)';
    case 'ภาคกลางและตะวันตก':
      return '🌾 ภาคกลางและตะวันตก';
    case 'ภาคตะวันออก':
      return '🌊 ภาคตะวันออก';
    case 'ภาคตะวันออกเฉียงเหนือ':
      return '☀️ ภาคตะวันออกเฉียงเหนือ';
    case 'ภาคเหนือ':
      return '⛰️ ภาคเหนือ';
    case 'ภาคใต้':
      return '🏝️ ภาคใต้';
    case 'เฉพาะกิจ':
    case 'ส่วนกลาง':
      return '🚚 หน่วยบริการเคลื่อนที่ / เฉพาะกิจ';
    default:
      return region;
  }
}

export interface RegionOfficeGroup {
  region: string;
  regionLabel: string;
  offices: EmploymentOffice[];
}

/**
 * จัดกลุ่มและเรียงลำดับรายชื่อสำนักงานจัดหางานตามภูมิภาคมาตรฐาน และเรียงชื่อตามภาษาไทย
 */
export function groupAndSortOfficesByRegion(offices: EmploymentOffice[]): RegionOfficeGroup[] {
  const grouped: Record<string, EmploymentOffice[]> = {};

  for (const office of offices) {
    const reg = office.region || 'อื่นๆ';
    if (!grouped[reg]) {
      grouped[reg] = [];
    }
    grouped[reg].push(office);
  }

  // Sort offices within each region alphabetically (Thai locale with numeric ordering)
  for (const reg in grouped) {
    grouped[reg].sort((a, b) => {
      const nameCmp = (a.name || '').localeCompare(b.name || '', 'th', { numeric: true });
      if (nameCmp !== 0) return nameCmp;
      return (a.centerName || '').localeCompare(b.centerName || '', 'th', { numeric: true });
    });
  }

  const result: RegionOfficeGroup[] = [];

  for (const reg of REGION_ORDER) {
    if (grouped[reg] && grouped[reg].length > 0) {
      result.push({
        region: reg,
        regionLabel: getRegionLabel(reg),
        offices: grouped[reg],
      });
      delete grouped[reg];
    }
  }

  // Any remaining regions
  for (const reg in grouped) {
    if (grouped[reg] && grouped[reg].length > 0) {
      result.push({
        region: reg,
        regionLabel: getRegionLabel(reg),
        offices: grouped[reg],
      });
    }
  }

  return result;
}

/**
 * เรียงลำดับรายชื่อสำนักงานทั้งหมดตามลำดับภูมิภาค
 */
export function sortOfficesByRegion(offices: EmploymentOffice[]): EmploymentOffice[] {
  const groups = groupAndSortOfficesByRegion(offices);
  return groups.flatMap((g) => g.offices);
}
