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

/**
 * สร้างคีย์มาตรฐานสำหรับเปรียบเทียบชื่อศูนย์บริการ เพื่อป้องกันชื่อศูนย์เดียวกันที่สะกดต่างกันเล็กน้อยแสดงซ้ำ 2 รายการ
 * เช่น ศูนย์เฉพาะกิจวัดป้อมวิเชียรโชติการาม / วัดป้อมวิเชียรฯ จ.สมุทรสาคร
 */
export function getCanonicalCenterKey(name?: string): string {
  const raw = (name || '').trim();
  if (!raw) return '';

  // กรณีศูนย์เฉพาะกิจวัดป้อมวิเชียรโชติการาม (ไม่ว่าจะสะกดแบบย่อหรือแบบเต็ม ให้ถือเป็นศูนย์เดียวกันเสมอ)
  if (raw.includes('วัดป้อมวิเชียร') || raw.includes('ป้อมวิเชียร')) {
    return 'special_center_wat_pom_wichian';
  }

  return raw
    .toLowerCase()
    .replace(/ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว\s*\(\s*เฉพาะกิจ\s*\)/g, 'ศูนย์เฉพาะกิจ')
    .replace(/ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวเฉพาะกิจ/g, 'ศูนย์เฉพาะกิจ')
    .replace(/ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว/g, 'ศูนย์บริการ')
    .replace(/จังหวัด/g, '')
    .replace(/จ\./g, '')
    .replace(/[\s\-_().,'"“”‘’ฯ]/g, '');
}

/**
 * ตรวจสอบว่าชื่อศูนย์ 2 ชื่อคือศูนย์บริการแห่งเดียวกันหรือไม่
 */
export function areSameCenterName(a?: string, b?: string): boolean {
  const keyA = getCanonicalCenterKey(a);
  const keyB = getCanonicalCenterKey(b);
  if (!keyA || !keyB) return false;
  return keyA === keyB;
}

/**
 * รวมและคัดกรองรายชื่อศูนย์บริการเพิ่มเติมไม่ให้มีรายการซ้ำซ้อนกันเองหรือซ้ำกับศูนย์หลัก
 */
export function deduplicateCenterList(
  centers: (string | undefined | null)[],
  primaryCenter?: string
): string[] {
  const result: string[] = [];
  for (const item of centers || []) {
    const trimmed = (item || '').trim();
    if (!trimmed) continue;
    if (primaryCenter && areSameCenterName(trimmed, primaryCenter)) {
      continue;
    }
    const existingIdx = result.findIndex((existing) => areSameCenterName(existing, trimmed));
    if (existingIdx === -1) {
      result.push(trimmed);
    } else {
      // หากรอบหลังเป็นชื่อที่สมบูรณ์กว่า (ไม่มี ฯ หรือยาวกว่า/ชัดเจนกว่า) ให้ใช้ชื่อที่สมบูรณ์กว่า
      const existing = result[existingIdx];
      if (
        (existing.includes('ฯ') && !trimmed.includes('ฯ')) ||
        (trimmed.length > existing.length && !trimmed.includes('ฯ'))
      ) {
        result[existingIdx] = trimmed;
      }
    }
  }
  return result;
}

