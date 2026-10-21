export interface DOEReport {
  id: string;
  reportDate: string; // YYYY-MM-DD
  reportDateThaiStr: string; // e.g. "วันพุธที่ 7 ตุลาคม 2569"
  
  // ผู้รายงานและสำนักงานจัดหางาน
  officeId: string;
  officeName: string; // e.g. "สำนักงานจัดหางานจังหวัดเชียงราย"
  officeNameEn: string; // e.g. "Chiangrai Provincial Employment Office"
  centerName: string; // e.g. "ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว จังหวัดเชียงราย"
  region: string; // ภาคเหนือ, ภาคกลาง, etc.
  reporterName: string; // ชื่อผู้รายงาน
  reporterPosition: string; // ตำแหน่ง
  phoneNumber: string; // เบอร์โทรศัพท์
  lineId: string; // บัญชี LINE
  
  // 1. การออกบัตรใบอนุญาตทำงาน (จำแนกตามกลุ่มเป้าหมาย ปัจจุบันมี 8 กลุ่ม)
  section59: number;       // 1. กลุ่มมาตรา 59 (คน)
  section62: number;       // 2. กลุ่มมาตรา 62 (คน)
  section63_1: number;     // 3. กลุ่มมาตรา 63/1 (คน)
  section63_2: number;     // 4. กลุ่มมาตรา 63/2 (คน)
  section64: number;       // 5. กลุ่มมาตรา 64 (คน)
  mouGroup?: number;       // 6. กลุ่มนำเข้าตาม MOU (คน)
  modifyDetails: number;   // 7. เปลี่ยนแปลงรายการในใบอนุญาตทำงาน (คน)
  substituteCard: number;  // 8. ใบแทนใบอนุญาตทำงาน (คน)

  // 2. สถานะคิวและการให้บริการประจำวัน
  queueAppointment: number;     // คิวนัดหมาย (คิว)
  cardsIssued: number;          // ออกบัตร (ใบ)
  identityVerified: number;     // ยืนยันตัวตน (คน)
  cardsNotIssued: number;       // ไม่ออกบัตร (คน)
  missedAppointment: number;    // ไม่มาตามนัด (คน)
  wrongAppointmentDate: number; // ไม่ตรงวันนัด (คน)

  // 3. ข้อมูลเพิ่มเติม / ยอดสะสมเดิม (ถ้ามี)
  cumulativeCardsIssued?: number;
  cumulativeSinceDate?: string;

  // 4. ค่าสำหรับหัวข้อกลุ่มที่แอดมินกำหนดเองเพิ่มเติม (Dynamic Categories)
  customCategoryValues?: Record<string, number>;

  // 5. ค่าสำหรับหัวข้อสถานะคิวและการให้บริการที่แอดมินกำหนดเองเพิ่มเติม (Dynamic Queue Metrics)
  customQueueValues?: Record<string, number>;

  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QueueMetricCategory {
  id: string; // e.g. 'queueAppointment', 'cardsIssued', 'identityVerified', 'cardsNotIssued', 'missedAppointment', 'wrongAppointmentDate' or 'custom_...'
  title: string; // e.g. 'คิวนัดหมาย', 'ออกบัตร', 'ยืนยันตัวตน'
  unit: string; // e.g. 'คิว', 'ใบ', 'คน'
  subLabel?: string; // e.g. 'จำนวนคิวที่นัดหมายเข้ารับบริการทั้งหมด'
  iconName?: string;
  badgeColor?: string;
  isActive: boolean;
  isDefault?: boolean;
}

export interface EmploymentOffice {
  id: string;
  name: string;
  nameEn: string;
  centerName: string;
  additionalCenters?: string[];
  region: 'กรุงเทพมหานคร' | 'ภาคกลางและตะวันตก' | 'ภาคเหนือ' | 'ภาคตะวันออกเฉียงเหนือ' | 'ภาคตะวันออก' | 'ภาคใต้' | 'เฉพาะกิจ' | 'ส่วนกลาง';
  defaultPhone?: string;
  defaultLine?: string;
}

export interface ReportCategory {
  id: string; // e.g. 'section59' or custom id 'custom_mou'
  code: string; // e.g. 'ม.59', 'ม.62', 'MOU'
  title: string; // e.g. 'กลุ่มมาตรา 59'
  subLabel: string; // e.g. 'คนต่างด้าวทำงานทั่วไป'
  color: string; // Tailwind color or gradient
  iconName?: string;
  isActive: boolean;
  isDefault?: boolean;
}

export interface ReporterProfile {
  id: string;
  name: string;
  position: string;
  phoneNumber: string;
  lineId: string;
  officeId?: string;
}

export interface SystemConfig {
  reportTitle: string; // หัวเรื่องหลักของรายงาน
  reportSubtitle: string; // ข้อความรอง เช่น EXECUTIVE SUMMARY REPORT
  departmentNameTh: string;
  departmentNameEn: string;
  customLogoUrl: string | null; // URL หรือ Base64 รูปภาพโลโก้
  adminPin: string; // รหัสผ่าน Admin
}

export interface SystemIssueReport {
  id: string;
  issueType: 'sync' | 'printer' | 'data' | 'queue' | 'other';
  title: string;
  description: string;
  officeName?: string;
  reporterContact?: string;
  status: 'pending' | 'in_progress' | 'resolved';
  createdAt: string;
  clientInfo?: string;
}
