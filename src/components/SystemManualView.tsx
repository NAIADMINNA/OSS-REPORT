import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  ShieldCheck,
  LayoutDashboard,
  FileEdit,
  FolderClock,
  FileText,
  Printer,
  Download,
  Search,
  CheckCircle2,
  ArrowRight,
  Building2,
  Truck,
  Layers,
  Users,
  Database,
  Key,
  Sparkles,
  HelpCircle,
  Image as ImageIcon,
  MessageSquare,
  Calendar,
  Filter,
  AlertCircle,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { ActiveTab } from './DOEHeader';
import { AdminSubTab } from './AdminConsole';

interface SystemManualViewProps {
  onNavigateTab: (tab: ActiveTab) => void;
  onNavigateAdminSubTab: (subTab: AdminSubTab) => void;
  isAdmin?: boolean;
  adminPin?: string;
  systemTitle?: string;
  officeCount?: number;
}

type ManualCategory = 'all' | 'user' | 'admin' | 'quota' | 'faq';

interface ManualSectionItem {
  id: string;
  category: 'user' | 'admin' | 'quota' | 'faq';
  stepNumber: string;
  title: string;
  subtitle: string;
  badgeText: string;
  actionLabel?: string;
  onAction?: () => void;
  highlights: string[];
  steps: {
    heading: string;
    detail: string;
    tip?: string;
  }[];
}

export const SystemManualView: React.FC<SystemManualViewProps> = ({
  onNavigateTab,
  onNavigateAdminSubTab,
  isAdmin = false,
  adminPin = '0841543524',
  systemTitle = 'ระบบรายงานผลการปฏิบัติงานศูนย์บริการคนต่างด้าว',
  officeCount = 86,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<ManualCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPinValue, setShowPinValue] = useState(false);

  const manualSections: ManualSectionItem[] = useMemo(
    () => [
      {
        id: 'user-dashboard',
        category: 'user',
        stepNumber: '01',
        title: 'การใช้งานแดชบอร์ดสรุปผลภาพรวม (Executive Dashboard)',
        subtitle:
          'ตรวจสอบสถิติการออกบัตรใบอนุญาตทำงานภาพรวมทั้งประเทศ แยกตามภูมิภาค จังหวัด และรูปแบบศูนย์บริการ',
        badgeText: 'สำหรับเจ้าหน้าที่และผู้บริหาร',
        actionLabel: 'เปิดหน้าแดชบอร์ดสรุปผล',
        onAction: () => onNavigateTab('dashboard'),
        highlights: [
          'กรองข้อมูลตามภูมิภาค จังหวัด และเลือกแยกดูเฉพาะ "ศูนย์บริการประจำสำนักงาน" หรือ "หน่วยบริการเคลื่อนที่ (Mobile Unit)"',
          'มุมมอง "ตามวัน" จัดกลุ่มเดือนเดียวกันและปี พ.ศ. เดียวกันเป็นโฟลเดอร์ชื่อเดือน คลิกที่เดือนเพื่อกางดูรายวัน',
          'ส่งออกรายงานสรุปเป็นไฟล์ Excel (.xlsx / .csv) หรือเปิดดูโปสเตอร์อินโฟกราฟิกภาพรวมได้ทันที',
        ],
        steps: [
          {
            heading: '1. การเลือกตัวกรองพื้นที่และรูปแบบศูนย์บริการ',
            detail:
              'ในแถบตัวกรองด้านบน สามารถเลือก "ภูมิภาค" -> "จังหวัด/พื้นที่" -> และช่อง "ศูนย์บริการ / Mobile Unit" เพื่อดูข้อมูลรวมทุกประเภท ดูเฉพาะศูนย์บริการประจำสำนักงาน หรือดูเฉพาะหน่วยบริการเคลื่อนที่ (Mobile Unit) ได้อย่างอิสระ',
            tip: 'เมื่อเลือกเป็นหน่วยบริการเคลื่อนที่ (Mobile Unit) หัวเรื่องบนโปสเตอร์จะเปลี่ยนเป็นชื่อหน่วยบริการเคลื่อนที่โดยอัตโนมัติ',
          },
          {
            heading: '2. การเลือกมุมมองช่วงเวลา (ตามวัน / ช่วงวันที่ / สะสมทั้งหมด)',
            detail:
              'เมื่อเลือกโหมด "ตามวัน" ระบบจะรวมวันที่อยู่ในเดือนและปี พ.ศ. เดียวกันเป็นปุ่มชื่อเดือน (เช่น ตุลาคม 2569) เมื่อคลิกเลือกเดือนจึงจะแสดงรายการวันที่ภายในเดือนนั้น เพื่อให้แถบตัวเลือกดูเป็นระเบียบและค้นหาง่าย',
          },
          {
            heading: '3. การตรวจสอบสถานะสำนักงานที่ส่งรายงานแล้ว / ยังไม่ส่ง',
            detail:
              'ตารางด้านล่างแสดงรายชื่อสำนักงานจัดหางานทั้งประเทศ พร้อมสถานะการส่งรายงานประจำวัน โดยสามารถคลิกปุ่ม "กรอกรายงาน" จากแถวของสำนักงานนั้นเพื่อเปิดฟอร์มรายงานของสำนักงานดังกล่าวได้ทันที',
          },
        ],
      },
      {
        id: 'user-form-quota',
        category: 'quota',
        stepNumber: '02',
        title: 'การกรอกแบบฟอร์มรายงาน และกติกาโควตาการส่งรายงานต่อวัน',
        subtitle:
          'ขั้นตอนการบันทึกข้อมูลประจำวัน และการควบคุมสิทธิ์การส่งรายงาน 1-2 ครั้งตามชื่อศูนย์ที่มี และ/หรือ 1 ครั้งสำหรับ Mobile Unit',
        badgeText: 'กติกาสำคัญประจำวัน',
        actionLabel: 'ไปที่หน้าแบบฟอร์มรายงาน',
        onAction: () => onNavigateTab('form'),
        highlights: [
          'ใน 1 วันที่รายงาน สำนักงานจัดหางานสามารถรายงานได้ 1 หรือ 2 ครั้งตามชื่อศูนย์ประจำสำนักงานที่มีอยู่จริง',
          'สามารถเลือกรายงานเพิ่มเติมได้อีก 1 ครั้ง กรณีออกให้บริการในรูปแบบ "หน่วยบริการเคลื่อนที่ (Mobile Unit)"',
          'มีป้ายสถานะโควตารายวัน (0/1 ครั้ง หรือ ส่งแล้ว 1/1 ครั้ง) แจ้งเตือนชัดเจน พร้อมปุ่มสลับศูนย์ที่ยังว่างอัตโนมัติ',
        ],
        steps: [
          {
            heading: '1. เลือกวันที่รายงาน และสำนักงานจัดหางานผู้รายงาน',
            detail:
              'ระบุวันที่ปฏิบัติงาน และค้นหาหรือเลือกสำนักงานจัดหางานจากรายการ (สามารถกรองตามภูมิภาคหรือพิมพ์ค้นหาชื่อจังหวัด/เขตพื้นที่ได้)',
          },
          {
            heading: '2. เลือกรูปแบบศูนย์บริการภายใต้โควตาประจำวัน',
            detail:
              'ระบบจะแสดงการ์ดศูนย์บริการของสำนักงานนั้นๆ ได้แก่ ศูนย์บริการประจำสำนักงาน (1 แห่ง หรือ 2 แห่งตามที่สำนักงานมี) และการ์ดหน่วยบริการเคลื่อนที่ (Mobile Unit) อีก 1 แห่ง โดยแต่ละแห่งสามารถส่งรายงานได้ 1 ครั้งต่อวัน',
            tip: 'หากศูนย์ใดส่งรายงานของวันนั้นไปแล้ว ระบบจะแสดงสถานะ "ส่งแล้ว (1/1 ครั้ง)" และป้องกันการส่งซ้ำ โดยสามารถคลิก "สลับไปรายงานศูนย์อื่นที่ยังว่าง" หรือคลิก "แก้ไขรายงานนี้" ได้ทันที',
          },
          {
            heading: '3. กรอกข้อมูลการออกบัตรใบอนุญาตทำงาน (จำแนกตาม 8 กลุ่มเป้าหมาย)',
            detail:
              'กรอกจำนวนคนต่างด้าวที่ได้รับอนุญาตทำงานตามลำดับหัวข้อมาตรฐานทั้ง 8 กลุ่ม (ม.59, ม.63/1, ม.62, ม.63/2, ม.64, มติ ครม. ต่ออายุ MOU, แก้ไขรายการ และใบแทน) ระบบจะคำนวณยอดรวมในช่อง "ออกบัตรใบอนุญาตทำงานแล้ว" ให้อัตโนมัติ',
          },
          {
            heading: '4. กรอกสถานะคิวนัดหมาย และข้อมูลผู้รายงาน',
            detail:
              'ระบุจำนวนคิวนัดหมาย (จำเป็นต้องมากกว่า 0), ยืนยันตัวตนแล้ว, ยังไม่ได้ออกบัตร, ไม่มาตามนัด, มาไม่ตรงวันนัด และยอดสะสมตั้งแต่วันเริ่มดำเนินการ จากนั้นตรวจสอบชื่อ-สกุล ตำแหน่ง และเบอร์โทรศัพท์ผู้รายงาน แล้วกดปุ่ม "บันทึกรายงานผลการปฏิบัติงาน"',
          },
        ],
      },
      {
        id: 'user-poster-line',
        category: 'user',
        stepNumber: '03',
        title: 'การสร้างโปสเตอร์อินโฟกราฟิก และการคัดลอกข้อความส่ง LINE',
        subtitle:
          'วิธีดาวน์โหลดภาพโปสเตอร์ความละเอียดสูง และการส่งออกข้อความสรุปรายงานประจำวัน',
        badgeText: 'สำหรับเจ้าหน้าที่ผู้รายงาน',
        actionLabel: 'เปิดหน้าแบบฟอร์มและพรีวิวโปสเตอร์',
        onAction: () => onNavigateTab('form'),
        highlights: [
          'พรีวิวโปสเตอร์อัปเดตสดแบบเรียลไทม์ด้านขวาของหน้าแบบฟอร์ม และเปิดดูขนาดเต็มจอได้ทุกเมื่อ',
          'ดาวน์โหลดเป็นไฟล์รูปภาพ PNG คมชัดสูง พร้อมนำไปใช้รายงานผู้บริหารหรือเผยแพร่ได้ทันที',
          'สร้างข้อความสรุปรายงานจัดรูปแบบสวยงามพร้อมคัดลอกส่งเข้ากลุ่ม LINE ได้ในคลิกเดียว',
        ],
        steps: [
          {
            heading: '1. การดูตัวอย่างและดาวน์โหลดภาพโปสเตอร์ (.PNG)',
            detail:
              'คลิกปุ่ม "ดูโปสเตอร์เต็มจอ / ดาวน์โหลดรูป" จากหน้าแบบฟอร์ม หน้าแดชบอร์ด หรือหน้าประวัติรายงาน จากนั้นกดปุ่ม "ดาวน์โหลดภาพโปสเตอร์ (PNG)" หรือสั่งพิมพ์ออกทางเครื่องพิมพ์ได้ทันที',
          },
          {
            heading: '2. การคัดลอกข้อความสรุปส่ง LINE',
            detail:
              'คลิกปุ่มไอคอน LINE หรือปุ่ม "ส่งออกข้อความ LINE" ระบบจะจัดเตรียมข้อความสรุปผลการปฏิบัติงานพร้อมตัวเลขครบทุกหัวข้อ กดปุ่ม "คัดลอกข้อความ" เพื่อนำไปวางในห้องสนทนา LINE ได้ทันที',
          },
        ],
      },
      {
        id: 'user-history-notes',
        category: 'user',
        stepNumber: '04',
        title: 'การดูประวัติรายงาน และหมายเหตุ/บันทึกเพิ่มเติมประจำวัน (ระบบโฟลเดอร์รายเดือน)',
        subtitle:
          'การจัดระเบียบข้อมูลย้อนหลังแบบโฟลเดอร์รายเดือน การค้นหา และการแก้ไขรายงาน',
        badgeText: 'ระบบจัดเก็บข้อมูลย้อนหลัง',
        actionLabel: 'เปิดหน้าประวัติรายงาน',
        onAction: () => onNavigateTab('history'),
        highlights: [
          'ทั้งหน้า "ประวัติรายงาน" และ "หมายเหตุ / บันทึกเพิ่มเติม" จัดกลุ่มข้อมูลที่มีเดือนและปี พ.ศ. เดียวกันไว้ในโฟลเดอร์ชื่อเดือนเดียวกัน',
          'คลิกที่โฟลเดอร์ชื่อเดือนเพื่อกางดูโฟลเดอร์รายวัน ช่วยให้หน้าจอดูเป็นระเบียบ ไม่รกตาแม้มีข้อมูลสะสมหลายเดือน',
          'สามารถค้นหา ดูโปสเตอร์ แก้ไข หรือคัดลอกรายงานจากหน้าประวัติได้โดยตรง',
        ],
        steps: [
          {
            heading: '1. การเลือกโฟลเดอร์เดือน และเลือกวันที่ต้องการตรวจสอบ',
            detail:
              'เมื่อเข้าสู่หน้า "ประวัติรายงาน" หรือ "หมายเหตุ / บันทึกเพิ่มเติม" ระบบจะแสดงการ์ดโฟลเดอร์รายเดือน (เช่น ตุลาคม 2569) พร้อมสรุปจำนวนวันและจำนวนฉบับภายในเดือนนั้น เมื่อคลิกที่เดือนจึงจะแสดงรายการวันที่ให้เลือกดูรายละเอียด',
          },
          {
            heading: '2. การแก้ไขรายงานที่ส่งไปแล้ว',
            detail:
              'ในหน้าประวัติรายงาน คลิกปุ่ม "แก้ไข" (ไอคอนดินสอ) ท้ายรายการที่ต้องการ ระบบจะดึงข้อมูลรายงานฉบับนั้นกลับเข้าสู่หน้าแบบฟอร์มในโหมด "กำลังแก้ไขรายงาน" เมื่อปรับปรุงตัวเลขและกดบันทึก ข้อมูลจะอัปเดตทับฉบับเดิมทันที',
          },
          {
            heading: '3. การบันทึกหรือดูหมายเหตุประจำวัน',
            detail:
              'ในแท็บ "หมายเหตุ / บันทึกเพิ่มเติม" จะรวบรวมเฉพาะรายงานที่มีการระบุข้อสังเกตหรือหมายเหตุเพิ่มเติมประจำวัน แยกตามโฟลเดอร์เดือนและวัน พร้อมส่งออกเป็นไฟล์ CSV ได้ (การกรอกหรือแก้ไขช่องหมายเหตุใช้สิทธิ์ Admin เพื่อความถูกต้องของข้อมูล)',
          },
        ],
      },
      {
        id: 'admin-auth-inline',
        category: 'admin',
        stepNumber: '05',
        title: 'การยืนยันสิทธิ์ผู้ดูแลระบบ (Admin) และการแก้ไขด่วนในหน้าแบบฟอร์ม',
        subtitle:
          'วิธีปลดล็อกสิทธิ์ Admin ด้วยรหัส PIN และการเพิ่ม/แก้ไขชื่อศูนย์หรือหัวข้อจากหน้าแบบฟอร์มโดยตรง',
        badgeText: 'สำหรับแอดมิน (Admin)',
        actionLabel: 'เปิดหน้าจัดการระบบ (สิทธิ์ Admin)',
        onAction: () => onNavigateTab('admin'),
        highlights: [
          'เข้าถึงการตั้งค่าได้ 2 ช่องทาง: เมนู "สิทธิ์ Admin" ด้านบน หรือปุ่มลัด "(Admin)" ภายในหน้าแบบฟอร์มรายงาน',
          'เมื่อยืนยันรหัส PIN ครั้งเดียว ระบบจะจดจำสถานะ Admin ตลอดการใช้งานในรอบนั้น (แสดงจุดสีเขียวที่ปุ่ม สิทธิ์ Admin)',
          'สามารถเพิ่มศูนย์บริการแห่งที่ 2 หรือแก้ไขชื่อศูนย์บริการประจำสำนักงานได้ทันทีจากหน้าแบบฟอร์ม',
        ],
        steps: [
          {
            heading: '1. การเข้าสู่โหมดผู้ดูแลระบบ (Admin Login)',
            detail:
              'คลิกที่แท็บ "สิทธิ์ Admin" บนแถบเมนูด้านบนขวา หรือคลิกปุ่มที่มีสัญลักษณ์รูปแม่กุญแจ/โล่ Admin ในหน้าแบบฟอร์ม จากนั้นกรอกรหัสผ่านผู้ดูแลระบบ (Admin PIN) เพื่อปลดล็อก',
            tip: 'ผู้ดูแลระบบสามารถเปลี่ยนรหัส PIN ใหม่ได้ตลอดเวลาในเมนู สิทธิ์ Admin -> ตั้งค่าตรา/ชื่อระบบ & รหัสผ่าน',
          },
          {
            heading: '2. การเพิ่มศูนย์บริการใหม่ หรือแก้ไขชื่อศูนย์จากหน้าแบบฟอร์ม',
            detail:
              'ในหน้าแบบฟอร์มรายงาน ส่วนแสดงชื่อศูนย์บริการ มีปุ่ม "+ เพิ่มศูนย์บริการใหม่ (Admin)" และ "แก้ไขชื่อศูนย์นี้ (Admin)" หากเพิ่มศูนย์ใหม่โดยใช้ชื่อสำนักงานจัดหางานเดิมที่มีศูนย์อยู่แล้ว 1 แห่ง ระบบจะผูกเป็น "ศูนย์บริการประจำสำนักงาน (แห่งที่ 2)" ให้โดยอัตโนมัติ ทำให้อนุญาตส่งรายงานได้ 2 ครั้ง/วันตามชื่อศูนย์ที่มี',
          },
          {
            heading: '3. การปลดล็อกช่องหมายเหตุ / บันทึกเพิ่มเติมประจำวัน',
            detail:
              'ในส่วนที่ 4 ของแบบฟอร์มรายงาน คลิกปุ่ม "ปลดล็อกด้วยรหัส Admin เพื่อพิมพ์หมายเหตุ" เมื่อยืนยันสิทธิ์แล้วจะสามารถพิมพ์ข้อสังเกตหรือสรุปสถานการณ์ประจำวันได้ทันที',
          },
        ],
      },
      {
        id: 'admin-console-menus',
        category: 'admin',
        stepNumber: '06',
        title: 'การจัดการข้อมูลหลักในหน้าคอนโซลผู้ดูแลระบบ (Admin Console ทั้ง 7 หมวด)',
        subtitle:
          'คู่มือการแก้ไขหัวข้อ 8 กลุ่มเป้าหมาย สถานะคิว รายชื่อสำนักงาน โลโก้ ทะเบียนผู้รายงาน และฐานข้อมูล',
        badgeText: 'คู่มือการแก้ไขของแอดมิน',
        actionLabel: 'ไปยังหน้าตั้งค่า Admin Console',
        onAction: () => onNavigateTab('admin'),
        highlights: [
          'ปรับแต่งหัวข้อการออกบัตร (8 กลุ่มเป้าหมาย) และหัวข้อสถานะคิวประจำวันได้แบบยืดหยุ่น',
          'บริหารจัดการรายชื่อสำนักงานจัดหางานทั้ง 76 จังหวัด + กทม. 10 พื้นที่ และทะเบียนรายชื่อผู้รายงาน',
          'สำรอง/กู้คืนฐานข้อมูล ซิงก์ข้อมูลขึ้น Cloud Firestore และกู้คืนรายการที่ถูกลบได้ครบวงจร',
        ],
        steps: [
          {
            heading: 'หมวดที่ 1 และ 2: จัดการหัวข้อกลุ่มเป้าหมาย & สถานะคิวประจำวัน',
            detail:
              'สามารถแก้ไขชื่อหัวข้อ คำอธิบายย่อย (เช่น ม.59, ม.63/1) เปิด/ปิดการแสดงผล หรือเพิ่มหัวข้อพิเศษเพิ่มเติมได้ โดยทุกการเปลี่ยนแปลงจะซิงก์ไปยังแบบฟอร์ม ตารางสรุป และโปสเตอร์ทันที',
          },
          {
            heading: 'หมวดที่ 3: จัดการสำนักงานจัดหางานและศูนย์บริการ',
            detail:
              'ค้นหา แก้ไขชื่อสำนักงาน ชื่อศูนย์บริการ ภูมิภาค เบอร์โทรศัพท์ หรือเพิ่มสำนักงานใหม่ รวมถึงมีระบบถังขยะกู้คืนสำนักงานที่ถูกลบ หรือกดกู้คืนรายชื่อสำนักงานมาตรฐานทั้งประเทศได้ในคลิกเดียว',
          },
          {
            heading: 'หมวดที่ 4 และ 5: ตั้งค่าตราประจำกรม/ชื่อระบบ และทะเบียนผู้รายงาน',
            detail:
              'อัปโหลดภาพโลโก้หน่วยงาน แก้ไขชื่อหัวเรื่องรายงาน ตั้งค่าวันที่เริ่มต้นนับยอดสะสม เปลี่ยนรหัส PIN ของ Admin และบันทึกข้อมูลผู้รายงานประจำแต่ละสำนักงานเพื่อเติมชื่อ-ตำแหน่ง-เบอร์โทรอัตโนมัติเวลาเลือกสำนักงาน',
          },
          {
            heading: 'หมวดที่ 6 และ 7: ศูนย์รับแจ้งปัญหา และจัดการฐานข้อมูล Cloud / Backup',
            detail:
              'ตรวจสอบรายการแจ้งข้อขัดข้องจากผู้ใช้งานทั่วประเทศ (เปลี่ยนสถานะเป็นแก้ไขแล้ว/ลบรายการ) และในแท็บฐานข้อมูลสามารถกด "ซิงก์ข้อมูลทั้งหมดขึ้น Cloud", ดาวน์โหลดไฟล์สำรอง (.json), นำเข้าไฟล์สำรอง, หรือกู้คืนรายงานที่ถูกลบจากถังขยะได้',
          },
        ],
      },
    ],
    [onNavigateTab]
  );

  const filteredSections = useMemo(() => {
    return manualSections.filter((sec) => {
      const matchCat =
        selectedCategory === 'all' ||
        sec.category === selectedCategory ||
        (selectedCategory === 'user' && sec.category === 'quota');
      const q = searchQuery.trim().toLowerCase();
      if (!q) return matchCat;
      const inTitle = sec.title.toLowerCase().includes(q);
      const inSub = sec.subtitle.toLowerCase().includes(q);
      const inHighlights = sec.highlights.some((h) => h.toLowerCase().includes(q));
      const inSteps = sec.steps.some(
        (s) =>
          s.heading.toLowerCase().includes(q) ||
          s.detail.toLowerCase().includes(q) ||
          (s.tip && s.tip.toLowerCase().includes(q))
      );
      return matchCat && (inTitle || inSub || inHighlights || inSteps);
    });
  }, [manualSections, selectedCategory, searchQuery]);

  const handleDownloadTextManual = () => {
    const lines: string[] = [
      '=========================================================================',
      `คู่มือการใช้งานระบบและคู่มือผู้ดูแลระบบ (Admin)`,
      `${systemTitle}`,
      'กรมการจัดหางาน กระทรวงแรงงาน (Department of Employment)',
      '=========================================================================',
      '',
    ];

    manualSections.forEach((sec) => {
      lines.push(`[บทที่ ${sec.stepNumber}] ${sec.title}`);
      lines.push(`คำอธิบาย: ${sec.subtitle}`);
      lines.push('สรุปสาระสำคัญ:');
      sec.highlights.forEach((h) => lines.push(`  • ${h}`));
      lines.push('ขั้นตอนการปฏิบัติงาน:');
      sec.steps.forEach((st) => {
        lines.push(`  ${st.heading}`);
        lines.push(`    - ${st.detail}`);
        if (st.tip) {
          lines.push(`    * คำแนะนำ: ${st.tip}`);
        }
      });
      lines.push('-------------------------------------------------------------------------');
      lines.push('');
    });

    const blob = new Blob(['\uFEFF' + lines.join('\n')], {
      type: 'text/plain;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `คู่มือการใช้งานระบบและแอดมิน_DOE_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Top Hero Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2 max-w-3xl">
              <div className="flex items-center gap-2 text-xs text-amber-300 font-semibold">
                <BookOpen className="w-4 h-4" />
                <span>เอกสารคู่มือปฏิบัติงานมาตรฐาน (Standard Operating Manual)</span>
                <span aria-hidden="true">·</span>
                <span>รองรับ {officeCount} สำนักงานจัดหางานทั่วประเทศ</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight font-['Prompt'] text-white">
                คู่มือการเข้าใช้งานระบบ และการจัดการแก้ไขสำหรับผู้ดูแลระบบ (Admin)
              </h2>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                รวบรวมขั้นตอนการใช้งานตั้งแต่การดูแดชบอร์ดภาพรวม การกรอกแบบฟอร์มรายงานตามโควตารายวัน
                (1-2 ครั้งตามชื่อศูนย์ที่มี และ/หรือ 1 ครั้งสำหรับ Mobile Unit) การส่งออกโปสเตอร์และข้อความ LINE
                ไปจนถึงคู่มือการแก้ไขตั้งค่าระบบทั้งหมดสำหรับแอดมิน
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4 text-amber-300" />
                <span>พิมพ์คู่มือ / บันทึกเป็น PDF</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadTextManual}
                className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>ดาวน์โหลดไฟล์คู่มือ (.TXT)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-4 sm:px-6 bg-slate-50/70 border-t border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-1.5 flex-wrap bg-slate-200/70 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-white text-blue-950 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ทั้งหมด (ครบทุกหมวด)
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory('user')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedCategory === 'user'
                  ? 'bg-white text-blue-950 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              คู่มือเจ้าหน้าที่ผู้รายงาน
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory('quota')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedCategory === 'quota'
                  ? 'bg-white text-blue-950 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              กติกาโควตา 1-2 ศูนย์ & Mobile Unit
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory('admin')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedCategory === 'admin'
                  ? 'bg-amber-400 text-slate-950 shadow-2xs'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              คู่มือการแก้ไขของแอดมิน (Admin)
            </button>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาขั้นตอน เช่น โควตา, โปสเตอร์, แก้ไขชื่อศูนย์..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-600 text-slate-800"
            />
          </div>
        </div>
      </div>

      {/* Quick Summary Visual Cards: Daily Quota Rule & Admin Quick Shortcuts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Card: Daily Reporting Quota Rule */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-blue-700">
                สรุปหลักเกณฑ์การส่งรายงานประจำวัน (ต่อ 1 สำนักงานจัดหางาน)
              </div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 mt-0.5 font-['Prompt']">
                1 วันที่รายงาน สามารถเลือกรายงานได้กี่ครั้ง?
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('form')}
              className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer shrink-0 no-print"
            >
              <span>ไปที่แบบฟอร์ม</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
              <div className="flex items-center gap-2 text-slate-900 font-extrabold text-sm">
                <Building2 className="w-4 h-4 text-blue-700 shrink-0" />
                <span>1. ศูนย์บริการประจำสำนักงาน</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                ส่งรายงานได้ <strong>1 ครั้ง หรือ 2 ครั้ง</strong> ตามจำนวนชื่อศูนย์บริการประจำสำนักงานที่มีอยู่จริง
                (ศูนย์ละ 1 ครั้งต่อวัน)
              </p>
              <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/80">
                • สำนักงานที่มี 1 ศูนย์ = รายงานได้ 1 ครั้ง/วัน
                <br />• สำนักงานที่มี 2 ศูนย์ = รายงานได้ 2 ครั้ง/วัน (แยกตามชื่อศูนย์)
              </div>
            </div>

            <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/90 space-y-2">
              <div className="flex items-center gap-2 text-amber-950 font-extrabold text-sm">
                <Truck className="w-4 h-4 text-amber-600 shrink-0" />
                <span>2. หน่วยบริการเคลื่อนที่ (Mobile Unit)</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                สามารถเลือกรายงานเพิ่มเติมได้อีก <strong>1 ครั้งต่อวัน</strong> กรณีออกปฏิบัติงานหน่วยบริการใบอนุญาตทำงานของคนต่างด้าวแบบเคลื่อนที่
              </p>
              <div className="text-[11px] text-amber-900/80 pt-1 border-t border-amber-200/70">
                • เลือกรายงานควบคู่กับศูนย์ประจำสำนักงาน (และ/หรือ) ได้อีก 1 ครั้งในวันเดียวกัน
              </div>
            </div>
          </div>
        </div>

        {/* Right Card: Admin Quick Jump Shortcuts */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>ทางลัดการจัดการและแก้ไขสำหรับแอดมิน (Admin Shortcuts)</span>
              </div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 mt-0.5 font-['Prompt']">
                คลิกเพื่อไปยังหมวดที่ต้องการแก้ไขทันที
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 no-print">
            <button
              type="button"
              onClick={() => onNavigateAdminSubTab('offices')}
              className="p-2.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 text-left transition-all flex items-center justify-between gap-2 cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="w-4 h-4 text-blue-700 shrink-0" />
                <span className="text-xs font-bold text-slate-800 truncate">
                  แก้ไขชื่อศูนย์ / สำนักงาน
                </span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => onNavigateAdminSubTab('sections')}
              className="p-2.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 text-left transition-all flex items-center justify-between gap-2 cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Layers className="w-4 h-4 text-indigo-700 shrink-0" />
                <span className="text-xs font-bold text-slate-800 truncate">
                  แก้ไขหัวข้อ 8 กลุ่มเป้าหมาย
                </span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => onNavigateAdminSubTab('queue_metrics')}
              className="p-2.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 text-left transition-all flex items-center justify-between gap-2 cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Calendar className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="text-xs font-bold text-slate-800 truncate">
                  แก้ไขหัวข้อสถานะคิว/บริการ
                </span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => onNavigateAdminSubTab('branding')}
              className="p-2.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 text-left transition-all flex items-center justify-between gap-2 cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <ImageIcon className="w-4 h-4 text-amber-700 shrink-0" />
                <span className="text-xs font-bold text-slate-800 truncate">
                  เปลี่ยนโลโก้ / ชื่อระบบ / PIN
                </span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => onNavigateAdminSubTab('reporters')}
              className="p-2.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 text-left transition-all flex items-center justify-between gap-2 cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Users className="w-4 h-4 text-sky-700 shrink-0" />
                <span className="text-xs font-bold text-slate-800 truncate">
                  จัดการทะเบียนผู้รายงาน
                </span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => onNavigateAdminSubTab('database')}
              className="p-2.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 text-left transition-all flex items-center justify-between gap-2 cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Database className="w-4 h-4 text-rose-700 shrink-0" />
                <span className="text-xs font-bold text-slate-800 truncate">
                  สำรอง / กู้คืน / ซิงก์ Cloud
                </span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>
          </div>

          <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-2 text-xs text-slate-600">
            <div className="flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-amber-600" />
              <span>สถานะสิทธิ์ปัจจุบัน:</span>
              <strong className={isAdmin ? 'text-emerald-700' : 'text-slate-700'}>
                {isAdmin ? 'เข้าสู่ระบบ Admin แล้ว' : 'โหมดผู้ใช้งานทั่วไป'}
              </strong>
            </div>
            <button
              type="button"
              onClick={() => setShowPinValue((v) => !v)}
              className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer no-print"
            >
              {showPinValue ? `รหัส PIN: ${adminPin}` : 'ดูรหัส PIN เริ่มต้นสำหรับแอดมิน'}
            </button>
          </div>
        </div>
      </div>

      {/* Step-by-Step Detailed Manual Sections */}
      <div className="space-y-5">
        {filteredSections.map((section) => (
          <section
            key={section.id}
            className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden"
          >
            {/* Section Header */}
            <div className="p-5 sm:p-6 border-b border-slate-200/80 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold">
                  <span className="font-mono font-bold text-blue-800">
                    บทที่ {section.stepNumber}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      section.category === 'admin'
                        ? 'text-amber-800 font-bold'
                        : 'text-sky-800 font-bold'
                    }
                  >
                    {section.badgeText}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 font-['Prompt']">
                  {section.title}
                </h3>
                <p className="text-xs text-slate-600">{section.subtitle}</p>
              </div>

              {section.actionLabel && section.onAction && (
                <button
                  type="button"
                  onClick={section.onAction}
                  className="px-4 py-2 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs flex items-center gap-2 self-start sm:self-center shrink-0 transition-colors cursor-pointer no-print"
                >
                  <span>{section.actionLabel}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Section Body */}
            <div className="p-5 sm:p-6 space-y-5">
              {/* Key Highlights */}
              <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200/70 space-y-2">
                <div className="text-xs font-extrabold text-blue-950 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-blue-700 shrink-0" />
                  <span>จุดเด่นและสิ่งที่ควรทราบในขั้นตอนนี้:</span>
                </div>
                <ul className="space-y-1.5 text-xs text-slate-700 pl-6 list-disc">
                  {section.highlights.map((hl, i) => (
                    <li key={i} className="leading-relaxed">
                      {hl}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Detailed Steps Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {section.steps.map((st, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-slate-200/90 bg-white space-y-2 flex flex-col justify-between"
                  >
                    <div className="space-y-1.5">
                      <h4 className="text-xs sm:text-sm font-extrabold text-slate-900">
                        {st.heading}
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {st.detail}
                      </p>
                    </div>
                    {st.tip && (
                      <div className="pt-2 mt-2 border-t border-slate-100 text-[11px] text-amber-900 flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span>
                          <strong>คำแนะนำ:</strong> {st.tip}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};
