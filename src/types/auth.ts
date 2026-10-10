export type UserRole = 'executive' | 'provincial_officer';

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  position: string;
  role: UserRole; // 'executive' = ผู้บริหาร/ส่วนกลาง (ดูข้อมูลทั้งหมด), 'provincial_officer' = เจ้าหน้าที่จัดหางานจังหวัด (เฉพาะแบบฟอร์ม)
  officeId?: string; // สำนักงานจัดหางานที่สังกัด (สำหรับเจ้าหน้าที่จังหวัด)
  officeName?: string;
  region?: string;
  phoneNumber?: string;
  lineId?: string;
}
