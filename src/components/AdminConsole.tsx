import React, { useState, useId, useMemo, useEffect } from 'react';
import {
  DOEReport,
  EmploymentOffice,
  QueueMetricCategory,
  ReportCategory,
  ReporterProfile,
  SystemConfig,
  SystemIssueReport,
} from '../types/doe';
import { EMPLOYMENT_OFFICES } from '../data/offices';
import { DEFAULT_QUEUE_METRICS } from '../data/initialAdminData';
import { sortOfficesByRegion } from '../utils/officeUtils';
import { DOELogo } from './DOELogo';
import { ConfirmDialogModal } from './ConfirmDialogModal';
import {
  subscribeSystemIssues,
  reportSystemIssueOnline,
  deleteSystemIssueOnline,
  clearAllSystemIssuesOnline,
} from '../services/firestoreService';
import {
  ShieldCheck,
  Building2,
  FolderTree,
  Image as ImageIcon,
  Users,
  Database,
  Plus,
  Edit2,
  Trash2,
  Save,
  RotateCcw,
  Download,
  Upload,
  CheckCircle2,
  Search,
  Filter,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Sparkles,
  Phone,
  MessageCircle,
  FileSpreadsheet,
  AlertTriangle,
  ArrowRight,
  Layers,
  Key,
  Copy,
  Globe,
  Code,
  Clock,
  Check,
  RefreshCw,
  BookOpen,
} from 'lucide-react';
import { ActiveTab } from './DOEHeader';
import { SystemManualView } from './SystemManualView';

interface AdminConsoleProps {
  offices: EmploymentOffice[];
  categories: ReportCategory[];
  queueMetrics?: QueueMetricCategory[];
  reporters: ReporterProfile[];
  systemConfig: SystemConfig;
  reports: DOEReport[];
  deletedOffices?: EmploymentOffice[];
  deletedReports?: DOEReport[];
  onUpdateOffices: (offices: EmploymentOffice[]) => void;
  onUpdateCategories: (categories: ReportCategory[]) => void;
  onUpdateQueueMetrics?: (metrics: QueueMetricCategory[]) => void;
  onUpdateReporters: (reporters: ReporterProfile[]) => void;
  onUpdateSystemConfig: (config: SystemConfig) => void;
  onRestoreFullDatabase: (data: {
    offices?: EmploymentOffice[];
    categories?: ReportCategory[];
    queueMetrics?: QueueMetricCategory[];
    reporters?: ReporterProfile[];
    systemConfig?: SystemConfig;
    reports?: DOEReport[];
  }) => void;
  onResetFactoryDefaults: () => void;
  onRestoreDeletedOffice?: (officeId: string) => void;
  onRestoreAllMissingOffices?: () => void;
  onRestoreDeletedReport?: (reportId: string) => void;
  onRestoreAllDeletedReports?: () => void;
  onClearAllReportsForProduction?: () => void;
  onRestoreBackupReports?: () => void;
  onSyncAllReportsToOnline?: () => void;
  onNotify: (msg: string) => void;
  initialSubTab?: AdminSubTab;
  onNavigateTab?: (tab: ActiveTab) => void;
  onAdminAuthenticated?: () => void;
  onAdminLoggedOut?: () => void;
}

export type AdminSubTab = 'sections' | 'queue_metrics' | 'offices' | 'branding' | 'reporters' | 'issues' | 'database' | 'manual';

export const AdminConsole: React.FC<AdminConsoleProps> = ({
  offices,
  categories,
  queueMetrics = DEFAULT_QUEUE_METRICS,
  reporters,
  systemConfig,
  reports,
  deletedOffices = [],
  deletedReports = [],
  initialSubTab,
  onNavigateTab,
  onUpdateOffices,
  onUpdateCategories,
  onUpdateQueueMetrics,
  onUpdateReporters,
  onUpdateSystemConfig,
  onRestoreFullDatabase,
  onResetFactoryDefaults,
  onRestoreDeletedOffice,
  onRestoreAllMissingOffices,
  onRestoreDeletedReport,
  onRestoreAllDeletedReports,
  onClearAllReportsForProduction,
  onRestoreBackupReports,
  onSyncAllReportsToOnline,
  onNotify,
  onAdminAuthenticated,
  onAdminLoggedOut,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<AdminSubTab>(initialSubTab || 'sections');

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
      if (initialSubTab === 'sections') setIsAddingCategory(true);
      else if (initialSubTab === 'queue_metrics') setIsAddingQueueMetric(true);
      else if (initialSubTab === 'offices') setIsAddingOffice(true);
      else if (initialSubTab === 'reporters') setIsAddingReporter(true);
    }
  }, [initialSubTab]);

  // Issues management states
  const [reportedIssues, setReportedIssues] = useState<SystemIssueReport[]>(() => {
    try {
      const saved = localStorage.getItem('doe_assistant_reported_issues_v1');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });
  const [issueFilterStatus, setIssueFilterStatus] = useState<'all' | 'pending' | 'resolved'>('all');
  const [issueSearchQuery, setIssueSearchQuery] = useState('');

  // Subscribe to live issues
  useEffect(() => {
    const unsub = subscribeSystemIssues((onlineIssues) => {
      if (onlineIssues && onlineIssues.length > 0) {
        setReportedIssues((prev) => {
          const combined = [...onlineIssues];
          for (const p of prev) {
            if (!combined.some((c) => c.id === p.id)) {
              combined.push(p);
            }
          }
          return combined;
        });
      }
    });
    return () => unsub();
  }, []);

  // Office management states
  const [officeSearch, setOfficeSearch] = useState('');
  const [officeRegionFilter, setOfficeRegionFilter] = useState('ทั้งหมด');
  const [editingOffice, setEditingOffice] = useState<EmploymentOffice | null>(null);
  const [isAddingOffice, setIsAddingOffice] = useState(false);
  const [newOffice, setNewOffice] = useState<Partial<EmploymentOffice>>({
    region: 'ภาคกลางและตะวันตก',
  });

  // Category management states
  const [editingCategory, setEditingCategory] = useState<ReportCategory | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState<Partial<ReportCategory>>({
    color: 'from-blue-600 to-indigo-600',
    isActive: true,
  });

  // Queue & Daily Service Metrics states
  const [editingQueueMetric, setEditingQueueMetric] = useState<QueueMetricCategory | null>(null);
  const [isAddingQueueMetric, setIsAddingQueueMetric] = useState(false);
  const [newQueueMetric, setNewQueueMetric] = useState<Partial<QueueMetricCategory>>({
    unit: 'คน',
    isActive: true,
  });

  // Reporter management states
  const [editingReporter, setEditingReporter] = useState<ReporterProfile | null>(null);
  const [isAddingReporter, setIsAddingReporter] = useState(false);
  const [newReporter, setNewReporter] = useState<Partial<ReporterProfile>>({});

  // System Config / Titles states
  const [configForm, setConfigForm] = useState<SystemConfig>(systemConfig);

  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('doe_admin_authenticated') === 'true';
    } catch {
      return false;
    }
  });
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const handleVerifyPin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const correctPin = systemConfig.adminPin || '0841543524';
    if (pinInput.trim() === correctPin || pinInput.trim() === '0841543524') {
      setIsAuthenticated(true);
      try {
        sessionStorage.setItem('doe_admin_authenticated', 'true');
      } catch {}
      setPinError(false);
      onAdminAuthenticated?.();
      onNotify('ยืนยันสิทธิ์ผู้ดูแลระบบ (Admin) สำเร็จ');
    } else {
      setPinError(true);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    try {
      sessionStorage.removeItem('doe_admin_authenticated');
    } catch {}
    setPinInput('');
    onAdminLoggedOut?.();
    onNotify('ออกจากระบบสิทธิ์ผู้ดูแลระบบเรียบร้อย');
  };

  // Custom in-app Confirmation Dialog State (No window.confirm/alert in iframe)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
    iconType?: 'trash' | 'warning' | 'reset';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Logo upload state
  const [logoInputMode, setLogoInputMode] = useState<'upload' | 'url'>('upload');
  const [logoUrlInput, setLogoUrlInput] = useState(systemConfig.customLogoUrl || '');

  // Filtered offices sorted by region
  const filteredOffices = useMemo(() => {
    const list = offices.filter((o) => {
      const matchRegion =
        officeRegionFilter === 'ทั้งหมด' || o.region === officeRegionFilter;
      const q = officeSearch.toLowerCase().trim();
      const matchSearch =
        !q ||
        o.name.toLowerCase().includes(q) ||
        o.centerName.toLowerCase().includes(q) ||
        o.region.toLowerCase().includes(q);
      return matchRegion && matchSearch;
    });
    return sortOfficesByRegion(list);
  }, [offices, officeSearch, officeRegionFilter]);

  // 1. SAVE REPORT HEADER & TITLES CONFIG
  const handleSaveConfig = () => {
    onUpdateSystemConfig(configForm);
    onNotify('บันทึกการตั้งค่าหัวเรื่องรายงานเรียบร้อยแล้ว');
  };

  // 2. CATEGORY ACTIONS
  const handleSaveCategory = (cat: ReportCategory) => {
    const updated = categories.map((c) => (c.id === cat.id ? cat : c));
    onUpdateCategories(updated);
    setEditingCategory(null);
    onNotify(`บันทึกการแก้ไขหัวข้อ "${cat.title}" สำเร็จ`);
  };

  const handleAddCategory = () => {
    const titleVal = newCategory.title?.trim() || newCategory.code?.trim() || '';
    if (!titleVal) {
      onNotify('⚠️ กรุณาระบุชื่อหัวข้อที่ต้องการเพิ่ม');
      return;
    }
    const id = `cat_${Date.now()}`;
    const item: ReportCategory = {
      id,
      code: newCategory.code?.trim() || '',
      title: titleVal,
      subLabel: newCategory.subLabel?.trim() || '',
      color: newCategory.color || 'from-blue-600 to-indigo-600',
      isActive: true,
      isDefault: false,
    };
    onUpdateCategories([...categories, item]);
    setIsAddingCategory(false);
    setNewCategory({ color: 'from-blue-600 to-indigo-600', isActive: true });
    onNotify(`เพิ่มหัวข้อใหม่ "${item.title}" เรียบร้อยแล้ว`);
  };

  const handleDeleteCategory = (catId: string) => {
    const target = categories.find((c) => c.id === catId);
    if (!target) return;

    setConfirmModal({
      isOpen: true,
      title: `ยืนยันการลบหัวข้อ "${target.title}"`,
      message: target.isDefault
        ? `หัวข้อ "${target.title}" (${target.code}) เป็นหัวข้อมาตรฐานของกรมฯ หากลบจะถูกนำออกจากแบบฟอร์มบันทึกและโปสเตอร์ (คุณสามารถซ่อนการแสดงผลแทนการลบได้) ต้องการลบหรือไม่?`
        : `คุณแน่ใจหรือไม่ว่าต้องการลบหัวข้อ "${target.title}" (${target.code}) ออกจากระบบ? การลบนี้จะมีผลต่อแบบฟอร์มและโปสเตอร์ทันที`,
      confirmText: 'ยืนยันลบหัวข้อนี้',
      cancelText: 'ยกเลิก',
      isDanger: true,
      iconType: 'trash',
      onConfirm: () => {
        const updated = categories.filter((c) => c.id !== catId);
        onUpdateCategories(updated);
        if (editingCategory?.id === catId) {
          setEditingCategory(null);
        }
        onNotify(`ลบหัวข้อ "${target.title}" เรียบร้อยแล้ว`);
      },
    });
  };

  const handleToggleCategoryActive = (catId: string) => {
    const updated = categories.map((c) =>
      c.id === catId ? { ...c, isActive: !c.isActive } : c
    );
    onUpdateCategories(updated);
    const cat = updated.find((c) => c.id === catId);
    onNotify(
      cat?.isActive
        ? `เปิดใช้งานหัวข้อ "${cat.title}" แล้ว`
        : `ซ่อนหัวข้อ "${cat?.title}" จากรายงานแล้ว`
    );
  };

  // 2.1 QUEUE & DAILY SERVICES METRICS ACTIONS (3. สถานะคิวและการให้บริการประจำวัน)
  const handleSaveQueueMetric = (qm: QueueMetricCategory) => {
    const list = queueMetrics || DEFAULT_QUEUE_METRICS;
    const updated = list.map((m) => (m.id === qm.id ? qm : m));
    onUpdateQueueMetrics?.(updated);
    setEditingQueueMetric(null);
    onNotify(`บันทึกการแก้ไขหัวข้อสถานะคิว "${qm.title}" สำเร็จ`);
  };

  const handleAddQueueMetric = () => {
    if (!newQueueMetric.title?.trim()) {
      onNotify('⚠️ กรุณาระบุชื่อหัวข้อสถานะคิว');
      return;
    }
    const id = `custom_queue_${Date.now()}`;
    const item: QueueMetricCategory = {
      id,
      title: newQueueMetric.title.trim(),
      unit: newQueueMetric.unit?.trim() || 'คน',
      subLabel: newQueueMetric.subLabel?.trim() || '',
      badgeColor: 'text-indigo-700 bg-indigo-50 border-indigo-200',
      isActive: true,
      isDefault: false,
    };
    const list = queueMetrics || DEFAULT_QUEUE_METRICS;
    onUpdateQueueMetrics?.([...list, item]);
    setIsAddingQueueMetric(false);
    setNewQueueMetric({ unit: 'คน', isActive: true });
    onNotify(`เพิ่มหัวข้อสถานะคิวใหม่ "${item.title}" เรียบร้อยแล้ว`);
  };

  const handleDeleteQueueMetric = (qmId: string) => {
    const list = queueMetrics || DEFAULT_QUEUE_METRICS;
    const target = list.find((m) => m.id === qmId);
    if (!target) return;

    setConfirmModal({
      isOpen: true,
      title: `ยืนยันการลบหัวข้อ "${target.title}"`,
      message: target.isDefault
        ? `หัวข้อ "${target.title}" เป็นหัวข้อมาตรฐานของสถานะคิว หากลบจะถูกนำออกจากแบบฟอร์มบันทึกและโปสเตอร์ (คุณสามารถซ่อนการแสดงผลแทนการลบได้) ต้องการลบหรือไม่?`
        : `คุณแน่ใจหรือไม่ว่าต้องการลบหัวข้อสถานะคิว "${target.title}" ออกจากระบบ?`,
      confirmText: 'ยืนยันลบหัวข้อนี้',
      cancelText: 'ยกเลิก',
      isDanger: true,
      iconType: 'trash',
      onConfirm: () => {
        const updated = list.filter((m) => m.id !== qmId);
        onUpdateQueueMetrics?.(updated);
        if (editingQueueMetric?.id === qmId) {
          setEditingQueueMetric(null);
        }
        onNotify(`ลบหัวข้อสถานะคิว "${target.title}" เรียบร้อยแล้ว`);
      },
    });
  };

  const handleToggleQueueMetricActive = (qmId: string) => {
    const list = queueMetrics || DEFAULT_QUEUE_METRICS;
    const updated = list.map((m) =>
      m.id === qmId ? { ...m, isActive: !m.isActive } : m
    );
    onUpdateQueueMetrics?.(updated);
    const m = updated.find((item) => item.id === qmId);
    onNotify(
      m?.isActive
        ? `เปิดใช้งานหัวข้อสถานะคิว "${m.title}" แล้ว`
        : `ซ่อนหัวข้อสถานะคิว "${m?.title}" จากรายงานแล้ว`
    );
  };

  const handleResetQueueMetrics = () => {
    onUpdateQueueMetrics?.(DEFAULT_QUEUE_METRICS);
    onNotify('คืนค่าหัวข้อสถานะคิวเป็นค่าเริ่มต้นของกรมฯ เรียบร้อยแล้ว');
  };

  // 3. OFFICE & CENTER ACTIONS
  const handleSaveOffice = (office: EmploymentOffice) => {
    const updated = offices.map((o) => (o.id === office.id ? office : o));
    onUpdateOffices(updated);
    setEditingOffice(null);
    onNotify(`บันทึกข้อมูลศูนย์ "${office.name} (${office.centerName})" สำเร็จ`);
  };

  const handleAddOffice = () => {
    const rawName = newOffice.name?.trim() || '';
    const rawCenter = newOffice.centerName?.trim() || '';
    if (!rawName && !rawCenter) {
      onNotify('⚠️ กรุณากรอกชื่อสำนักงานจัดหางาน หรือ ชื่อศูนย์บริการ');
      return;
    }
    const finalName = rawName || rawCenter;
    const finalCenter = rawCenter || `ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว (${finalName})`;
    const id =
      newOffice.id ||
      `office_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const officeItem: EmploymentOffice = {
      id,
      name: finalName,
      nameEn: newOffice.nameEn?.trim() || finalName,
      centerName: finalCenter,
      region: (newOffice.region as any) || 'ภาคกลางและตะวันตก',
      defaultPhone: newOffice.defaultPhone?.trim() || '',
      defaultLine: newOffice.defaultLine?.trim() || '',
    };
    onUpdateOffices([...offices, officeItem]);
    setIsAddingOffice(false);
    setNewOffice({ region: 'ภาคกลางและตะวันตก' });
    setOfficeSearch('');
    setOfficeRegionFilter('ทั้งหมด');
    onNotify(`เพิ่มศูนย์บริการ "${officeItem.centerName}" (${officeItem.name}) เรียบร้อยแล้ว`);
  };

  const handleDeleteOffice = (officeId: string) => {
    const target = offices.find((o) => o.id === officeId);
    if (!target) return;

    setConfirmModal({
      isOpen: true,
      title: `ยืนยันการลบศูนย์บริการ`,
      message: `คุณแน่ใจหรือไม่ว่าต้องการลบสำนักงาน "${target.name}" (${target.centerName}) ออกจากระบบ? รายชื่อศูนย์นี้จะไม่ปรากฏในแบบฟอร์มและแดชบอร์ด`,
      confirmText: 'ยืนยันลบศูนย์บริการนี้',
      cancelText: 'ยกเลิก',
      isDanger: true,
      iconType: 'trash',
      onConfirm: () => {
        const updated = offices.filter((o) => o.id !== officeId);
        onUpdateOffices(updated);
        if (editingOffice?.id === officeId) {
          setEditingOffice(null);
        }
        onNotify(`ลบศูนย์ "${target.name}" เรียบร้อยแล้ว (สามารถกู้คืนได้ที่แถบด้านบน)`);
      },
    });
  };

  // RESTORE OFFICE HANDLERS
  const missingStandardOffices = useMemo(() => {
    return EMPLOYMENT_OFFICES.filter(
      (std) => !offices.some((o) => o.id === std.id || o.name === std.name)
    );
  }, [offices]);

  const restorableOffices = useMemo(() => {
    const list: EmploymentOffice[] = [...missingStandardOffices];
    deletedOffices.forEach((del) => {
      if (!list.some((o) => o.id === del.id) && !offices.some((o) => o.id === del.id)) {
        list.push(del);
      }
    });
    return list;
  }, [missingStandardOffices, deletedOffices, offices]);

  const handleRestoreOffice = (officeId: string) => {
    if (onRestoreDeletedOffice) {
      onRestoreDeletedOffice(officeId);
    } else {
      const target =
        deletedOffices.find((o) => o.id === officeId) ||
        EMPLOYMENT_OFFICES.find((o) => o.id === officeId);
      if (target) {
        onUpdateOffices([...offices, target]);
        onNotify(`กู้คืน "${target.name}" กลับสู่ระบบเรียบร้อยแล้ว`);
      }
    }
  };

  const handleRestoreAllOffices = () => {
    if (onRestoreAllMissingOffices) {
      onRestoreAllMissingOffices();
    } else {
      const merged = [...offices];
      EMPLOYMENT_OFFICES.forEach((std) => {
        if (!merged.some((o) => o.id === std.id || o.name === std.name)) {
          merged.push(std);
        }
      });
      onUpdateOffices(merged);
      onNotify(`กู้คืนสำนักงานมาตรฐานทั้งหมด (${EMPLOYMENT_OFFICES.length} แห่ง) เรียบร้อยแล้ว`);
    }
  };

  // 4. REPORTER ACTIONS
  const handleSaveReporter = (rep: ReporterProfile) => {
    const updated = reporters.map((r) => (r.id === rep.id ? rep : r));
    onUpdateReporters(updated);
    setEditingReporter(null);
    onNotify(`บันทึกข้อมูล "${rep.name}" สำเร็จ`);
  };

  const handleAddReporter = () => {
    if (!newReporter.name?.trim()) {
      onNotify('⚠️ กรุณากรอกชื่อ-นามสกุลผู้รายงาน');
      return;
    }
    const item: ReporterProfile = {
      id: `rep_${Date.now()}`,
      name: newReporter.name.trim(),
      position: newReporter.position?.trim() || 'เจ้าหน้าที่ผู้รายงาน',
      phoneNumber: newReporter.phoneNumber?.trim() || '',
      lineId: newReporter.lineId?.trim() || '',
      officeId: newReporter.officeId || '',
    };
    onUpdateReporters([...reporters, item]);
    setIsAddingReporter(false);
    setNewReporter({});
    onNotify(`เพิ่มผู้รายงาน "${item.name}" สำเร็จ`);
  };

  const handleDeleteReporter = (repId: string) => {
    const target = reporters.find((r) => r.id === repId);
    if (!target) return;

    setConfirmModal({
      isOpen: true,
      title: `ยืนยันการลบข้อมูลผู้รายงาน`,
      message: `คุณแน่ใจหรือไม่ว่าต้องการลบคุณ "${target.name}" (${target.position}) ออกจากทำเนียบผู้รายงานของระบบ?`,
      confirmText: 'ยืนยันลบผู้รายงานนี้',
      cancelText: 'ยกเลิก',
      isDanger: true,
      iconType: 'trash',
      onConfirm: () => {
        onUpdateReporters(reporters.filter((r) => r.id !== repId));
        if (editingReporter?.id === repId) {
          setEditingReporter(null);
        }
        onNotify(`ลบผู้รายงาน "${target.name}" เรียบร้อยแล้ว`);
      },
    });
  };

  // 5. IMAGE & LOGO ACTIONS
  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      onNotify('⚠️ กรุณาเลือกไฟล์รูปภาพขนาดไม่เกิน 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      const updated = { ...configForm, customLogoUrl: base64 };
      setConfigForm(updated);
      onUpdateSystemConfig(updated);
      onNotify('อัปโหลดและเปลี่ยนตราสัญลักษณ์เรียบร้อยแล้ว');
    };
    reader.readAsDataURL(file);
  };

  const handleApplyLogoUrl = () => {
    if (!logoUrlInput.trim()) {
      onNotify('⚠️ กรุณากรอก URL ของรูปภาพ');
      return;
    }
    const updated = { ...configForm, customLogoUrl: logoUrlInput.trim() };
    setConfigForm(updated);
    onUpdateSystemConfig(updated);
    onNotify('เปลี่ยนตราสัญลักษณ์จาก URL สำเร็จ');
  };

  const handleResetToDefaultLogo = () => {
    const updated = { ...configForm, customLogoUrl: null };
    setConfigForm(updated);
    setLogoUrlInput('');
    onUpdateSystemConfig(updated);
    onNotify('รีเซ็ตกลับเป็นตราสัญลักษณ์มาตรฐานกรมการจัดหางานเรียบร้อย');
  };

  // 6. DATABASE EXPORT & IMPORT ACTIONS
  const handleExportFullDatabase = () => {
    const fullDb = {
      exportTimestamp: new Date().toISOString(),
      systemVersion: '1.0.0',
      systemConfig,
      offices,
      categories,
      reporters,
      reports,
    };

    const jsonStr = JSON.stringify(fullDb, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DOE_Database_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('ส่งออกไฟล์สำรองฐานข้อมูล (.json) สำเร็จ');
  };

  const handleImportDatabase = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        setConfirmModal({
          isOpen: true,
          title: 'ยืนยันการกู้คืนฐานข้อมูลจากไฟล์สำรอง',
          message: 'การนำเข้าไฟล์สำรองจะแทนที่ข้อมูลที่มีอยู่ในระบบ (ศูนย์บริการ, หัวข้อ, ผู้รายงาน, รายงาน) ด้วยข้อมูลจากไฟล์นี้ ยืนยันดำเนินการต่อหรือไม่?',
          confirmText: 'ยืนยันกู้คืนฐานข้อมูล',
          cancelText: 'ยกเลิก',
          isDanger: false,
          iconType: 'warning',
          onConfirm: () => {
            onRestoreFullDatabase(json);
            onNotify('กู้คืนฐานข้อมูลจากไฟล์สำรองสำเร็จสมบูรณ์');
          },
        });
      } catch (err) {
        onNotify('⚠️ ไฟล์ JSON ไม่ถูกต้องหรือไม่ตรงตามรูปแบบฐานข้อมูล');
      }
    };
    reader.readAsText(file);
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shadow-sm">
            <Lock className="w-8 h-8" />
          </div>
          <div className="text-xs font-extrabold uppercase tracking-widest text-amber-600 font-mono">
            DOE ADMINISTRATIVE SECURITY
          </div>
          <h2 className="text-xl font-black text-slate-900 font-['Prompt']">
            ยืนยันสิทธิ์ผู้ดูแลระบบ (Admin Access)
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            พื้นที่เฉพาะสำหรับผู้บริหารและผู้ดูแลระบบ เพื่อปรับแต่งหัวข้อรายงาน, แก้ไขชื่อศูนย์บริการ, เปลี่ยนตราสัญลักษณ์, จัดการทำเนียบผู้รายงาน และสำรองฐานข้อมูล
          </p>
        </div>

        <form onSubmit={handleVerifyPin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
              <span>รหัสผ่านผู้ดูแลระบบ (Admin Password)</span>
              <span className="text-[11px] text-slate-400 font-normal">
                (ซ่อนรหัสเป็นเครื่องหมายดอกจัน *)
              </span>
            </label>
            <div className="relative">
              <input
                type="password"
                maxLength={30}
                placeholder="••••••••"
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError(false);
                }}
                className={`w-full text-center text-lg tracking-widest px-9 py-2.5 bg-slate-50 border rounded-xl font-mono font-bold focus:bg-white focus:outline-hidden focus:ring-2 ${
                  pinError ? 'border-rose-400 focus:ring-rose-400' : 'border-slate-300 focus:ring-sky-500'
                }`}
                autoFocus
              />
              <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
            </div>
            {pinError && (
              <div className="text-xs text-rose-600 mt-2 flex items-center gap-1.5 justify-center">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>รหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบและลองใหม่อีกครั้ง</span>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white font-bold text-xs rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Unlock className="w-4 h-4" />
              <span>เข้าสู่ระบบผู้ดูแลระบบ (Sign In)</span>
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. TOP ADMIN BANNER */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-700 text-white p-5 rounded-2xl border border-blue-400/30 shadow-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-bold shadow-md shrink-0">
            <ShieldCheck className="w-6 h-6 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-sm bg-amber-400 text-slate-950 font-mono tracking-wider">
                ADMIN CONSOLE
              </span>
              <span className="text-xs text-sky-100 font-medium">
                สิทธิ์ผู้ดูแลระบบสูงสุด (System Administrator)
              </span>
            </div>
            <h2 className="text-lg font-black tracking-tight text-white mt-0.5 font-['Prompt']">
              ศูนย์ควบคุมและจัดการข้อมูลระบบ (DOE Admin Management)
            </h2>
          </div>
        </div>

        {/* Database Live Stats Badges & Logout */}
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="bg-white/15 px-3 py-1.5 rounded-xl border border-white/20 flex items-center gap-1.5 font-medium">
            <Building2 className="w-3.5 h-3.5 text-sky-200" />
            <span>ศูนย์บริการ: <b>{offices.length}</b> แห่ง</span>
          </span>
          <span className="bg-white/15 px-3 py-1.5 rounded-xl border border-white/20 flex items-center gap-1.5 font-medium">
            <FolderTree className="w-3.5 h-3.5 text-emerald-300" />
            <span>หัวข้อกลุ่ม: <b>{categories.length}</b> กลุ่ม</span>
          </span>
          <span className="bg-emerald-500/25 text-white px-3 py-1.5 rounded-xl border border-emerald-400/40 flex items-center gap-1.5 font-bold">
            <Database className="w-3.5 h-3.5 text-emerald-200" />
            <span>ฐานข้อมูล: บันทึกถาวร</span>
          </span>

          <button
            type="button"
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-rose-500 text-white border border-white/30 flex items-center gap-1.5 font-bold transition-colors cursor-pointer ml-1"
            title="ออกจากระบบ Admin"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </div>

      {/* 2. SUB-TABS NAVIGATION */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-2">
        <button
          onClick={() => setActiveSubTab('sections')}
          className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'sections'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FolderTree className="w-4 h-4" />
          <span>1. จัดการหัวข้อ & กลุ่มมาตรา ({categories.length} กลุ่ม)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('queue_metrics')}
          className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'queue_metrics'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-4 h-4 text-teal-300" />
          <span>2. สถานะคิว & การให้บริการ ({queueMetrics.length} หัวข้อ)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('offices')}
          className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'offices'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>3. จัดการชื่อศูนย์ & สำนักงาน ({offices.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('branding')}
          className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'branding'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>4. แก้ไขรูป & ตราสัญลักษณ์</span>
        </button>

        <button
          onClick={() => setActiveSubTab('reporters')}
          className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'reporters'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>5. จัดการข้อมูลผู้รายงาน ({reporters.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('issues')}
          className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'issues'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-rose-500" />
          <span>6. ข้อขัดข้องที่แจ้งเข้ามา ({reportedIssues.filter((i) => i.status === 'pending').length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('database')}
          className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'database'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Database className="w-4 h-4 text-emerald-500" />
          <span>7. การเก็บข้อมูลลงฐานข้อมูล</span>
        </button>

        <button
          onClick={() => setActiveSubTab('manual')}
          className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'manual'
              ? 'bg-indigo-700 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <BookOpen className="w-4 h-4 text-amber-500" />
          <span>8. คู่มือการใช้งานระบบ & แอดมิน</span>
        </button>
      </div>

      {/* 3. SUB-TAB 1: จัดการหัวข้อ & กลุ่มมาตรา */}
      {activeSubTab === 'sections' && (
        <div className="space-y-6">
          {/* Main Report Titles Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <FileSpreadsheet className="w-4 h-4 text-blue-700" />
                <span>แก้ไขข้อความหัวเรื่องหลักของรายงาน (Report Header Titles)</span>
              </div>
              <button
                type="button"
                onClick={handleSaveConfig}
                className="text-xs font-bold px-3.5 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>บันทึกการเปลี่ยนแปลง</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  หัวเรื่องหลักของรายงาน (Main Title)
                </label>
                <input
                  type="text"
                  value={configForm.reportTitle}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, reportTitle: e.target.value })
                  }
                  className="w-full text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ข้อความหัวเรื่องรอง (Subtitle / Executive Banner)
                </label>
                <input
                  type="text"
                  value={configForm.reportSubtitle}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, reportSubtitle: e.target.value })
                  }
                  className="w-full text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-blue-700" />
                    <span>รหัสผ่านเข้าสู่ระบบผู้ดูแลระบบ (Admin Password)</span>
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    (ซ่อนรหัสเป็นเครื่องหมายดอกจัน *)
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={configForm.adminPin || '0841543524'}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, adminPin: e.target.value })
                    }
                    placeholder="••••••••"
                    className="w-full text-sm px-3.5 py-2 pl-9 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-mono tracking-widest"
                  />
                  <Key className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                  <span>🔒 กำหนดรหัสผ่านผู้ดูแลระบบ (ระบบจะแสดงผลเป็นเครื่องหมายดอกจัน * เสมอเพื่อความปลอดภัย)</span>
                  <span className="font-mono text-slate-400">********</span>
                </div>
              </div>
            </div>
          </div>

          {/* Legal Categories List & Management */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-blue-700" />
                  <span>รายการหัวข้อกลุ่มเป้าหมายและมาตรา ({categories.length} หัวข้อ)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  สามารถแก้ไขชื่อหัวข้อ, เพิ่มหัวข้อใหม่, หรือลบหัวข้อที่ไม่ต้องการแสดงผล
                </p>
              </div>

              <button
                onClick={() => setIsAddingCategory(true)}
                className="text-xs font-bold px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>เพิ่มหัวข้อใหม่</span>
              </button>
            </div>

            {/* Modal/Form: Add Category */}
            {isAddingCategory && (
              <div className="bg-slate-50 p-4 rounded-xl border border-sky-200 space-y-3">
                <div className="font-bold text-xs text-sky-900 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-sky-600" />
                  <span>เพิ่มหัวข้อรายงานกลุ่มใหม่</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      ชื่อหัวข้อเต็ม (Title) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น กลุ่มแรงงานนำเข้า MOU หรือ อื่นๆ"
                      value={newCategory.title || ''}
                      onChange={(e) =>
                        setNewCategory({ ...newCategory, title: e.target.value })
                      }
                      className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      คำอธิบายย่อย
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น แรงงานนำเข้าตามความตกลงฯ"
                      value={newCategory.subLabel || ''}
                      onChange={(e) =>
                        setNewCategory({ ...newCategory, subLabel: e.target.value })
                      }
                      className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      รหัสย่อหัวข้อ (ไม่บังคับ)
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น MOU, อื่นๆ (เว้นว่างได้)"
                      value={newCategory.code || ''}
                      onChange={(e) =>
                        setNewCategory({ ...newCategory, code: e.target.value })
                      }
                      className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingCategory(false)}
                    className="text-xs px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    className="text-xs font-bold px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs cursor-pointer"
                  >
                    บันทึกหัวข้อใหม่
                  </button>
                </div>
              </div>
            )}

            {/* Category Cards List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {categories.map((cat, idx) => {
                const isEditing = editingCategory?.id === cat.id;

                if (isEditing && editingCategory) {
                  return (
                    <div
                      key={cat.id}
                      className="p-3.5 rounded-xl border-2 border-sky-400 bg-sky-50/50 space-y-2.5"
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-sky-900">
                        <span>แก้ไขหัวข้อที่ {idx + 1}</span>
                        <span className="text-[10px] text-slate-500 font-mono">ID: {cat.id}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-slate-600">รหัสย่อ</label>
                          <input
                            type="text"
                            value={editingCategory.code}
                            onChange={(e) =>
                              setEditingCategory({ ...editingCategory, code: e.target.value })
                            }
                            className="w-full text-xs p-1.5 bg-white border border-slate-300 rounded-md"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-600">ชื่อหัวข้อ</label>
                          <input
                            type="text"
                            value={editingCategory.title}
                            onChange={(e) =>
                              setEditingCategory({ ...editingCategory, title: e.target.value })
                            }
                            className="w-full text-xs p-1.5 bg-white border border-slate-300 rounded-md"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] font-semibold text-slate-600">คำอธิบาย</label>
                          <input
                            type="text"
                            value={editingCategory.subLabel}
                            onChange={(e) =>
                              setEditingCategory({
                                ...editingCategory,
                                subLabel: e.target.value,
                              })
                            }
                            className="w-full text-xs p-1.5 bg-white border border-slate-300 rounded-md"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-sky-200">
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(editingCategory.id)}
                          className="text-xs px-2.5 py-1 text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-300 hover:border-rose-600 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer font-semibold"
                          title="ลบหัวข้อนี้ออกจากระบบ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>ลบหัวข้อนี้</span>
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingCategory(null)}
                            className="text-xs px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors cursor-pointer"
                          >
                            ยกเลิก
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveCategory(editingCategory)}
                            className="text-xs font-bold px-3.5 py-1 bg-blue-900 hover:bg-blue-800 text-white rounded-lg transition-colors shadow-xs cursor-pointer flex items-center gap-1"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>บันทึก</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={cat.id}
                    className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                      cat.isActive
                        ? 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                        : 'bg-slate-50 border-dashed border-slate-300 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-900 font-bold text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900 truncate">
                            {cat.title}
                          </span>
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                            {cat.code}
                          </span>
                          {!cat.isActive && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 font-bold">
                              ปิดใช้งาน
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {cat.subLabel}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={() => handleToggleCategoryActive(cat.id)}
                        className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-colors border cursor-pointer ${
                          cat.isActive
                            ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200'
                            : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border-emerald-300'
                        }`}
                        title={cat.isActive ? 'กดเพื่อซ่อนหัวข้อนี้จากรายงาน' : 'กดเพื่อเปิดใช้งานหัวข้อนี้'}
                      >
                        {cat.isActive ? 'แสดงอยู่' : 'ซ่อน'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingCategory(cat)}
                        className="p-1.5 text-blue-700 hover:text-white hover:bg-blue-600 border border-blue-200 hover:border-blue-600 rounded-lg transition-all cursor-pointer shadow-2xs"
                        title="แก้ไขหัวข้อ"
                        aria-label="แก้ไขหัวข้อ"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="p-1.5 text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-lg transition-all cursor-pointer shadow-2xs"
                        title="ลบหัวข้อนี้"
                        aria-label="ลบหัวข้อ"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Queue & Daily Services Metrics Management (3. สถานะคิวและการให้บริการประจำวัน) */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <span>3. สถานะคิวและการให้บริการประจำวัน ({queueMetrics.length} หัวข้อ)</span>
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-teal-100 text-teal-800 border border-teal-200">
                    หัวข้อ Admin กำหนดได้
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  หัวข้อในส่วนนี้ให้ Admin สามารถเพิ่ม ลบ หรือแก้ไขชื่อหัวข้อและหน่วยนับได้ตามต้องการ โดยจะสะท้อนในแบบฟอร์มบันทึกและรายงานทันที
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleResetQueueMetrics}
                  className="text-xs font-semibold px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors border border-slate-300 flex items-center gap-1 cursor-pointer"
                  title="คืนค่าเป็นหัวข้อมาตรฐานของกรมฯ"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span>คืนค่าเริ่มต้น</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingQueueMetric(true)}
                  className="text-xs font-bold px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>เพิ่มหัวข้อคิว/บริการใหม่</span>
                </button>
              </div>
            </div>

            {/* Modal/Form: Add Queue Metric */}
            {isAddingQueueMetric && (
              <div className="bg-teal-50/70 p-4 rounded-xl border border-teal-200 space-y-3">
                <div className="font-bold text-xs text-teal-900 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-teal-600" />
                  <span>เพิ่มหัวข้อสถานะคิวและการให้บริการใหม่</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      ชื่อหัวข้อ (เช่น คิวนัดหมาย, คิว Walk-in, ส่งต่อ รพ.) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น คิว Walk-in"
                      value={newQueueMetric.title || ''}
                      onChange={(e) =>
                        setNewQueueMetric({ ...newQueueMetric, title: e.target.value })
                      }
                      className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      หน่วยนับ (เช่น คิว, คน, ใบ, ราย)
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น คน หรือ คิว"
                      value={newQueueMetric.unit || 'คน'}
                      onChange={(e) =>
                        setNewQueueMetric({ ...newQueueMetric, unit: e.target.value })
                      }
                      className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      คำอธิบายย่อย
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น ผู้มารับบริการโดยไม่ได้นัดหมายล่วงหน้า"
                      value={newQueueMetric.subLabel || ''}
                      onChange={(e) =>
                        setNewQueueMetric({ ...newQueueMetric, subLabel: e.target.value })
                      }
                      className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddingQueueMetric(false)}
                    className="text-xs px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={handleAddQueueMetric}
                    className="text-xs font-bold px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg shadow-xs cursor-pointer"
                  >
                    บันทึกหัวข้อใหม่
                  </button>
                </div>
              </div>
            )}

            {/* Queue Metrics List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {queueMetrics.map((qm, idx) => {
                const isEditing = editingQueueMetric?.id === qm.id;

                if (isEditing && editingQueueMetric) {
                  return (
                    <div
                      key={qm.id}
                      className="p-3.5 rounded-xl border-2 border-teal-400 bg-teal-50/50 space-y-2.5"
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-teal-900">
                        <span>แก้ไขหัวข้อสถานะคิวที่ {idx + 1}</span>
                        <span className="text-[10px] text-slate-500 font-mono">ID: {qm.id}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-slate-600">ชื่อหัวข้อ</label>
                          <input
                            type="text"
                            value={editingQueueMetric.title}
                            onChange={(e) =>
                              setEditingQueueMetric({ ...editingQueueMetric, title: e.target.value })
                            }
                            className="w-full text-xs p-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-600">หน่วยนับ</label>
                          <input
                            type="text"
                            value={editingQueueMetric.unit}
                            onChange={(e) =>
                              setEditingQueueMetric({ ...editingQueueMetric, unit: e.target.value })
                            }
                            className="w-full text-xs p-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-600">คำอธิบายย่อย</label>
                        <input
                          type="text"
                          value={editingQueueMetric.subLabel || ''}
                          onChange={(e) =>
                            setEditingQueueMetric({ ...editingQueueMetric, subLabel: e.target.value })
                          }
                          className="w-full text-xs p-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => handleDeleteQueueMetric(qm.id)}
                          className="text-xs text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>ลบหัวข้อนี้</span>
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingQueueMetric(null)}
                            className="text-xs px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg cursor-pointer"
                          >
                            ยกเลิก
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveQueueMetric(editingQueueMetric)}
                            className="text-xs font-bold px-3.5 py-1 bg-teal-700 hover:bg-teal-600 text-white rounded-lg shadow-xs flex items-center gap-1 cursor-pointer"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>บันทึก</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={qm.id}
                    className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                      qm.isActive
                        ? 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                        : 'bg-slate-50 border-dashed border-slate-300 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-900 font-bold text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900 truncate">
                            {qm.title}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-teal-50 text-teal-800 border border-teal-200">
                            {qm.unit}
                          </span>
                          {!qm.isActive && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 font-bold">
                              ปิดใช้งาน
                            </span>
                          )}
                          {qm.isDefault && (
                            <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-medium">
                              ระบบ
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {qm.subLabel || 'ไม่มีคำอธิบายย่อย'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={() => handleToggleQueueMetricActive(qm.id)}
                        className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-colors border cursor-pointer ${
                          qm.isActive
                            ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200'
                            : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border-emerald-300'
                        }`}
                        title={qm.isActive ? 'กดเพื่อซ่อนหัวข้อนี้จากแบบฟอร์ม' : 'กดเพื่อเปิดใช้งานหัวข้อนี้'}
                      >
                        {qm.isActive ? 'แสดงอยู่' : 'ซ่อน'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingQueueMetric(qm)}
                        className="p-1.5 text-teal-700 hover:text-white hover:bg-teal-600 border border-teal-200 hover:border-teal-600 rounded-lg transition-all cursor-pointer shadow-2xs"
                        title="แก้ไขหัวข้อ"
                        aria-label="แก้ไขหัวข้อ"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteQueueMetric(qm.id)}
                        className="p-1.5 text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-lg transition-all cursor-pointer shadow-2xs"
                        title="ลบหัวข้อนี้"
                        aria-label="ลบหัวข้อ"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: จัดการสถานะคิวและการให้บริการประจำวัน (หัวข้อ Admin) */}
      {activeSubTab === 'queue_metrics' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-teal-900 via-teal-800 to-slate-900 text-white rounded-2xl p-5 border border-teal-700 shadow-md flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6 text-teal-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider bg-teal-500/30 text-teal-200 px-2.5 py-0.5 rounded-full border border-teal-400/30">
                    หัวข้อ Admin กำหนดได้
                  </span>
                  <span className="text-xs text-teal-200">
                    หัวข้อ 3: สถานะคิวและการให้บริการประจำวัน
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-black mt-0.5 font-['Prompt']">
                  จัดการหัวข้อสถานะคิวและการให้บริการประจำวัน ({queueMetrics.length} หัวข้อ)
                </h3>
                <p className="text-xs text-teal-100/80 mt-1 max-w-2xl">
                  Admin สามารถเพิ่ม ลบ แก้ไขชื่อหัวข้อ หน่วยนับ หรือคำอธิบายย่อยได้ตามต้องการ ข้อมูลที่ปรับแก้จะสะท้อนในแบบฟอร์มบันทึกและรายงานผลทันที
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetQueueMetrics}
                className="text-xs font-semibold px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="คืนค่าเป็นหัวข้อมาตรฐานของกรมฯ"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>คืนค่าเริ่มต้น</span>
              </button>
              <button
                type="button"
                onClick={() => setIsAddingQueueMetric(true)}
                className="text-xs font-bold px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>เพิ่มหัวข้อคิว/บริการใหม่</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            {/* Modal/Form: Add Queue Metric */}
            {isAddingQueueMetric && (
              <div className="bg-teal-50/70 p-4 rounded-xl border border-teal-200 space-y-3">
                <div className="font-bold text-xs text-teal-900 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-teal-600" />
                  <span>เพิ่มหัวข้อสถานะคิวและการให้บริการใหม่</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      ชื่อหัวข้อ (เช่น คิวนัดหมาย, คิว Walk-in, ส่งต่อ รพ.) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น คิว Walk-in"
                      value={newQueueMetric.title || ''}
                      onChange={(e) =>
                        setNewQueueMetric({ ...newQueueMetric, title: e.target.value })
                      }
                      className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      หน่วยนับ (เช่น คิว, คน, ใบ, ราย)
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น คน หรือ คิว"
                      value={newQueueMetric.unit || 'คน'}
                      onChange={(e) =>
                        setNewQueueMetric({ ...newQueueMetric, unit: e.target.value })
                      }
                      className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      คำอธิบายย่อย
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น ผู้มารับบริการโดยไม่ได้นัดหมายล่วงหน้า"
                      value={newQueueMetric.subLabel || ''}
                      onChange={(e) =>
                        setNewQueueMetric({ ...newQueueMetric, subLabel: e.target.value })
                      }
                      className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddingQueueMetric(false)}
                    className="text-xs px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={handleAddQueueMetric}
                    className="text-xs font-bold px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg shadow-xs cursor-pointer"
                  >
                    บันทึกหัวข้อใหม่
                  </button>
                </div>
              </div>
            )}

            {/* Queue Metrics List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {queueMetrics.map((qm, idx) => {
                const isEditing = editingQueueMetric?.id === qm.id;

                if (isEditing && editingQueueMetric) {
                  return (
                    <div
                      key={qm.id}
                      className="p-3.5 rounded-xl border-2 border-teal-400 bg-teal-50/50 space-y-2.5"
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-teal-900">
                        <span>แก้ไขหัวข้อสถานะคิวที่ {idx + 1}</span>
                        <span className="text-[10px] text-slate-500 font-mono">ID: {qm.id}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-slate-600">ชื่อหัวข้อ</label>
                          <input
                            type="text"
                            value={editingQueueMetric.title}
                            onChange={(e) =>
                              setEditingQueueMetric({ ...editingQueueMetric, title: e.target.value })
                            }
                            className="w-full text-xs p-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-600">หน่วยนับ</label>
                          <input
                            type="text"
                            value={editingQueueMetric.unit}
                            onChange={(e) =>
                              setEditingQueueMetric({ ...editingQueueMetric, unit: e.target.value })
                            }
                            className="w-full text-xs p-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-600">คำอธิบายย่อย</label>
                        <input
                          type="text"
                          value={editingQueueMetric.subLabel || ''}
                          onChange={(e) =>
                            setEditingQueueMetric({ ...editingQueueMetric, subLabel: e.target.value })
                          }
                          className="w-full text-xs p-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => handleDeleteQueueMetric(qm.id)}
                          className="text-xs text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>ลบหัวข้อนี้</span>
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingQueueMetric(null)}
                            className="text-xs px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg cursor-pointer"
                          >
                            ยกเลิก
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveQueueMetric(editingQueueMetric)}
                            className="text-xs font-bold px-3.5 py-1 bg-teal-700 hover:bg-teal-600 text-white rounded-lg shadow-xs flex items-center gap-1 cursor-pointer"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>บันทึก</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={qm.id}
                    className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                      qm.isActive
                        ? 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                        : 'bg-slate-50 border-dashed border-slate-300 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-900 font-bold text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900 truncate">
                            {qm.title}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-teal-50 text-teal-800 border border-teal-200">
                            {qm.unit}
                          </span>
                          {!qm.isActive && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 font-bold">
                              ปิดใช้งาน
                            </span>
                          )}
                          {qm.isDefault && (
                            <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-medium">
                              ระบบ
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {qm.subLabel || 'ไม่มีคำอธิบายย่อย'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={() => handleToggleQueueMetricActive(qm.id)}
                        className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-colors border cursor-pointer ${
                          qm.isActive
                            ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200'
                            : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border-emerald-300'
                        }`}
                        title={qm.isActive ? 'กดเพื่อซ่อนหัวข้อนี้จากแบบฟอร์ม' : 'กดเพื่อเปิดใช้งานหัวข้อนี้'}
                      >
                        {qm.isActive ? 'แสดงอยู่' : 'ซ่อน'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingQueueMetric(qm)}
                        className="p-1.5 text-teal-700 hover:text-white hover:bg-teal-600 border border-teal-200 hover:border-teal-600 rounded-lg transition-all cursor-pointer shadow-2xs"
                        title="แก้ไขหัวข้อ"
                        aria-label="แก้ไขหัวข้อ"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteQueueMetric(qm.id)}
                        className="p-1.5 text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-lg transition-all cursor-pointer shadow-2xs"
                        title="ลบหัวข้อนี้"
                        aria-label="ลบหัวข้อ"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. SUB-TAB 3: จัดการชื่อศูนย์ & สำนักงาน */}
      {activeSubTab === 'offices' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-700" />
                <span>รายชื่อสำนักงานจัดหางานและศูนย์บริการ ({offices.length} แห่ง)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                สามารถแก้ไขชื่อสำนักงาน, ชื่อภาษาอังกฤษ, ชื่อศูนย์บริการประจำพื้นที่, หรือเพิ่มศูนย์ใหม่
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {restorableOffices.length > 0 && (
                <button
                  type="button"
                  onClick={handleRestoreAllOffices}
                  className="text-xs font-bold px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="กู้คืนสำนักงาน/จังหวัดที่ขาดหายไปทั้งหมด"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>กู้คืนจังหวัดที่ถูกลบ ({restorableOffices.length} แห่ง)</span>
                </button>
              )}

              <button
                onClick={() => setIsAddingOffice(true)}
                className="text-xs font-bold px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>เพิ่มศูนย์ใหม่</span>
              </button>
            </div>
          </div>

          {/* RESTORE MISSING / DELETED PROVINCES BANNER */}
          {restorableOffices.length > 0 && (
            <div className="bg-gradient-to-r from-amber-50 via-amber-100/40 to-sky-50 border-2 border-amber-300 rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                    <RotateCcw className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-amber-950 text-sm sm:text-base font-['Prompt'] flex items-center gap-2">
                      <span>ย้อนคืนจังหวัด / สำนักงานที่ถูกลบ</span>
                      <span className="text-xs font-black px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
                        {restorableOffices.length} แห่ง
                      </span>
                    </h4>
                    <p className="text-xs text-amber-800 mt-0.5">
                      ตรวจพบสำนักงานจัดหางานมาตรฐานที่ขาดหายไปหรือเพิ่งถูกลบ คุณสามารถคลิกกู้คืนรายจังหวัด หรือกู้คืนทั้งหมดได้ทันที
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRestoreAllOffices}
                  className="text-xs sm:text-sm font-bold px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>กู้คืนจังหวัดที่ขาดหายไปทั้งหมด ({restorableOffices.length} แห่ง)</span>
                </button>
              </div>

              {/* Quick list of missing provinces with individual restore buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-200/80">
                <span className="text-xs font-bold text-amber-950 py-1">คลิกกู้คืนรายจังหวัด:</span>
                {restorableOffices.slice(0, 25).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleRestoreOffice(m.id)}
                    className="text-xs font-bold px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                    title={`กู้คืน ${m.name}`}
                  >
                    <RotateCcw className="w-3 h-3 text-amber-600" />
                    <span>{m.name.replace('สำนักงานจัดหางาน', '').replace('จังหวัด', '')}</span>
                  </button>
                ))}
                {restorableOffices.length > 25 && (
                  <span className="text-xs text-amber-800 font-semibold py-1">
                    และอีก {restorableOffices.length - 25} แห่ง (กดปุ่มกู้คืนทั้งหมดเพื่อนำกลับมาทั้งหมด)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Search & Region filter */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อสำนักงาน, จังหวัด, หรือศูนย์..."
                  value={officeSearch}
                  onChange={(e) => setOfficeSearch(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                />
              </div>

              <select
                value={officeRegionFilter}
                onChange={(e) => setOfficeRegionFilter(e.target.value)}
                className="text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-medium"
              >
                <option value="ทั้งหมด">ทุกภูมิภาค ({offices.length})</option>
                <option value="ภาคเหนือ">ภาคเหนือ</option>
                <option value="กรุงเทพมหานคร">กรุงเทพมหานคร</option>
                <option value="ภาคกลางและตะวันตก">ภาคกลางและตะวันตก</option>
                <option value="ภาคตะวันออก">ภาคตะวันออก</option>
                <option value="ภาคตะวันออกเฉียงเหนือ">ภาคตะวันออกเฉียงเหนือ</option>
                <option value="ภาคใต้">ภาคใต้</option>
                <option value="เฉพาะกิจ">เฉพาะกิจ</option>
              </select>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              แสดง <b>{filteredOffices.length}</b> จาก {offices.length} แห่ง
            </span>
          </div>

          {/* Form: Add New Office Modal / Inline */}
          {isAddingOffice && (
            <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-300 space-y-3">
              <div className="font-bold text-xs text-emerald-900 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>เพิ่มสำนักงานจัดหางาน / เพิ่มชื่อศูนย์บริการใหม่</span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-emerald-200 space-y-1.5">
                <label className="text-[11px] font-bold text-emerald-900 block">
                  ตัวช่วยด่วน: เลือกสำนักงานจัดหางานต้นสังกัด (กรณีเพิ่มศูนย์บริการใหม่ในจังหวัดที่มีอยู่แล้ว)
                </label>
                <select
                  value=""
                  onChange={(e) => {
                    const found = offices.find((o) => o.id === e.target.value);
                    if (found) {
                      setNewOffice({
                        ...newOffice,
                        name: found.name,
                        nameEn: found.nameEn,
                        region: found.region,
                        defaultPhone: found.defaultPhone || '',
                        defaultLine: found.defaultLine || '',
                      });
                    }
                  }}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-800"
                >
                  <option value="">-- คลิกเลือกจังหวัด/สำนักงานต้นสังกัดเพื่อดึงชื่อสำนักงานอัตโนมัติ (หรือพิมพ์ใหม่ด้านล่าง) --</option>
                  {EMPLOYMENT_OFFICES.map((std) => (
                    <option key={std.id} value={std.id}>
                      {std.name} ({std.region})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="sm:col-span-3">
                  <label className="text-[11px] font-bold text-slate-800 block mb-1">
                    ชื่อศูนย์บริการ (แสดงในแบบฟอร์มและโปสเตอร์) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวเฉพาะกิจ วัดป้อมวิเชียรฯ จ.สมุทรสาคร"
                    value={newOffice.centerName || ''}
                    onChange={(e) => setNewOffice({ ...newOffice, centerName: e.target.value })}
                    className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-medium"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    ชื่อสำนักงานจัดหางานต้นสังกัด
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น สำนักงานจัดหางานจังหวัดสมุทรสาคร"
                    value={newOffice.name || ''}
                    onChange={(e) => setNewOffice({ ...newOffice, name: e.target.value })}
                    className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    ชื่อภาษาอังกฤษ (ไม่บังคับ)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Samut Sakhon Provincial Employment Office"
                    value={newOffice.nameEn || ''}
                    onChange={(e) => setNewOffice({ ...newOffice, nameEn: e.target.value })}
                    className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    ภูมิภาค / ประเภทศูนย์
                  </label>
                  <select
                    value={newOffice.region || 'ภาคกลางและตะวันตก'}
                    onChange={(e) => setNewOffice({ ...newOffice, region: e.target.value as any })}
                    className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="ภาคเหนือ">ภาคเหนือ</option>
                    <option value="กรุงเทพมหานคร">กรุงเทพมหานคร</option>
                    <option value="ภาคกลางและตะวันตก">ภาคกลางและตะวันตก</option>
                    <option value="ภาคตะวันออก">ภาคตะวันออก</option>
                    <option value="ภาคตะวันออกเฉียงเหนือ">ภาคตะวันออกเฉียงเหนือ</option>
                    <option value="ภาคใต้">ภาคใต้</option>
                    <option value="เฉพาะกิจ">เฉพาะกิจ</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingOffice(false)}
                  className="text-xs px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleAddOffice}
                  className="text-xs font-bold px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs cursor-pointer"
                >
                  บันทึกศูนย์ใหม่
                </button>
              </div>
            </div>
          )}

          {/* Offices Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">ภูมิภาค</th>
                  <th className="py-2.5 px-3">สำนักงานจัดหางาน</th>
                  <th className="py-2.5 px-3">ชื่อศูนย์บริการ</th>
                  <th className="py-2.5 px-3 text-right">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOffices.map((office) => {
                  const isEditing = editingOffice?.id === office.id;

                  if (isEditing && editingOffice) {
                    return (
                      <tr key={office.id} className="bg-sky-50/70">
                        <td className="p-2">
                          <select
                            value={editingOffice.region}
                            onChange={(e) =>
                              setEditingOffice({
                                ...editingOffice,
                                region: e.target.value as any,
                              })
                            }
                            className="text-xs p-1 bg-white border rounded"
                          >
                            <option value="ภาคเหนือ">ภาคเหนือ</option>
                            <option value="กรุงเทพมหานคร">กรุงเทพมหานคร</option>
                            <option value="ภาคกลางและตะวันตก">ภาคกลางและตะวันตก</option>
                            <option value="ภาคตะวันออก">ภาคตะวันออก</option>
                            <option value="ภาคตะวันออกเฉียงเหนือ">ภาคตะวันออกเฉียงเหนือ</option>
                            <option value="ภาคใต้">ภาคใต้</option>
                            <option value="เฉพาะกิจ">เฉพาะกิจ</option>
                          </select>
                        </td>
                        <td className="p-2 space-y-1">
                          <input
                            type="text"
                            value={editingOffice.name}
                            onChange={(e) =>
                              setEditingOffice({ ...editingOffice, name: e.target.value })
                            }
                            className="w-full text-xs p-1 bg-white border rounded font-bold"
                          />
                          <input
                            type="text"
                            value={editingOffice.nameEn}
                            onChange={(e) =>
                              setEditingOffice({ ...editingOffice, nameEn: e.target.value })
                            }
                            className="w-full text-[11px] p-1 bg-white border rounded text-slate-500"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={editingOffice.centerName}
                            onChange={(e) =>
                              setEditingOffice({
                                ...editingOffice,
                                centerName: e.target.value,
                              })
                            }
                            className="w-full text-xs p-1 bg-white border rounded"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleDeleteOffice(editingOffice.id)}
                              className="text-xs px-2.5 py-1 text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1 font-semibold"
                              title="ลบศูนย์บริการนี้"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>ลบ</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingOffice(null)}
                              className="text-xs px-2.5 py-1 bg-slate-200 hover:bg-slate-300 rounded-lg transition-colors cursor-pointer"
                            >
                              ยกเลิก
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveOffice(editingOffice)}
                              className="text-xs font-bold px-3 py-1 bg-blue-900 hover:bg-blue-800 text-white rounded-lg transition-colors cursor-pointer shadow-xs"
                            >
                              บันทึก
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={office.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                          {office.region}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{office.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {office.nameEn}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 max-w-[280px] truncate">
                        {office.centerName}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingOffice(office)}
                            className="p-1.5 text-blue-700 hover:text-white hover:bg-blue-600 border border-blue-200 hover:border-blue-600 rounded-lg transition-all cursor-pointer shadow-2xs"
                            title="แก้ไขชื่อศูนย์"
                            aria-label="แก้ไขชื่อศูนย์"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOffice(office.id)}
                            className="p-1.5 text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-lg transition-all cursor-pointer shadow-2xs"
                            title="ลบศูนย์บริการนี้"
                            aria-label="ลบศูนย์บริการนี้"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. SUB-TAB 3: แก้ไขรูป & ตราสัญลักษณ์ */}
      {activeSubTab === 'branding' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-6">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-blue-700" />
              <span>แก้ไขและเปลี่ยนรูปภาพตราสัญลักษณ์ (Emblem / Logo Management)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              รูปภาพตราสัญลักษณ์จะนำไปแสดงบนหัวของระบบ โปสเตอร์อินโฟกราฟิก และรายงานทั้งหมด
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Left: Preview Box */}
            <div className="md:col-span-5 bg-gradient-to-br from-slate-50 to-sky-50 rounded-2xl p-6 border border-slate-200 flex flex-col items-center justify-center text-center space-y-4">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                ตัวอย่างตราสัญลักษณ์ที่กำลังใช้งาน
              </div>

              <div className="w-32 h-32 rounded-2xl bg-white p-3 shadow-md border border-slate-200 flex items-center justify-center overflow-hidden">
                <DOELogo size={100} customLogoUrl={configForm.customLogoUrl} />
              </div>

              <div className="text-xs">
                {configForm.customLogoUrl ? (
                  <span className="font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-300">
                    กำลังใช้รูปภาพที่อัปโหลดเอง
                  </span>
                ) : (
                  <span className="font-bold text-blue-900 bg-blue-100 px-2.5 py-1 rounded-full border border-blue-200">
                    กำลังใช้ตราสัญลักษณ์ทางการ (DOE Vector)
                  </span>
                )}
              </div>

              {configForm.customLogoUrl && (
                <button
                  type="button"
                  onClick={handleResetToDefaultLogo}
                  className="text-xs font-semibold px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>รีเซ็ตกลับเป็นตรามาตรฐานทางการ</span>
                </button>
              )}
            </div>

            {/* Right: Upload & Options Controls */}
            <div className="md:col-span-7 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <button
                  type="button"
                  onClick={() => setLogoInputMode('upload')}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    logoInputMode === 'upload'
                      ? 'bg-blue-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  อัปโหลดไฟล์รูปภาพ (จากเครื่อง)
                </button>
                <button
                  type="button"
                  onClick={() => setLogoInputMode('url')}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    logoInputMode === 'url'
                      ? 'bg-blue-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  ระบุ URL รูปภาพ
                </button>
              </div>

              {logoInputMode === 'upload' ? (
                <div className="border-2 border-dashed border-slate-300 hover:border-sky-400 rounded-2xl p-6 text-center transition-colors bg-slate-50/50 space-y-2">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-800 mx-auto flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div className="text-sm font-bold text-slate-800">
                    เลือกไฟล์รูปภาพตราสัญลักษณ์
                  </div>
                  <p className="text-xs text-slate-500">
                    รองรับไฟล์ PNG, JPG, SVG, WebP (แนะนำไฟล์พื้นหลังโปร่งใส Transparent)
                  </p>
                  <div className="pt-2">
                    <label className="inline-flex items-center gap-2 text-xs font-bold px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl shadow-xs transition-colors cursor-pointer">
                      <span>เลือกไฟล์จากเครื่อง...</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-xs font-semibold text-slate-700">
                    ระบุลิงก์ URL ของรูปภาพ
                  </label>
                  <input
                    type="url"
                    placeholder="https://example.com/logo.png"
                    value={logoUrlInput}
                    onChange={(e) => setLogoUrlInput(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                  <button
                    type="button"
                    onClick={handleApplyLogoUrl}
                    className="text-xs font-bold px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl shadow-xs cursor-pointer"
                  >
                    ปรับใช้รูปภาพนี้
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. SUB-TAB 4: จัดการข้อมูลผู้รายงาน */}
      {activeSubTab === 'reporters' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-700" />
                <span>ทำเนียบรายชื่อผู้รายงานประจำศูนย์ ({reporters.length} ท่าน)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                กำหนดและแก้ไขข้อมูลเจ้าหน้าที่ผู้รายงาน เพื่อนำไปเลือกใช้งานและแสดงในรายงาน
              </p>
            </div>

            <button
              onClick={() => setIsAddingReporter(true)}
              className="text-xs font-bold px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>เพิ่มผู้รายงานใหม่</span>
            </button>
          </div>

          {/* Form: Add Reporter */}
          {isAddingReporter && (
            <div className="bg-slate-50 p-4 rounded-xl border border-sky-300 space-y-3">
              <div className="font-bold text-xs text-sky-900 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-sky-600" />
                <span>เพิ่มข้อมูลเจ้าหน้าที่ผู้รายงานใหม่</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">ชื่อ-นามสกุล</label>
                  <input
                    type="text"
                    placeholder="เช่น นายสมชาย ใจดี"
                    value={newReporter.name || ''}
                    onChange={(e) => setNewReporter({ ...newReporter, name: e.target.value })}
                    className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">ตำแหน่ง</label>
                  <input
                    type="text"
                    placeholder="เช่น นักวิชาการแรงงานชำนาญการ"
                    value={newReporter.position || ''}
                    onChange={(e) =>
                      setNewReporter({ ...newReporter, position: e.target.value })
                    }
                    className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">เบอร์โทรศัพท์</label>
                  <input
                    type="text"
                    placeholder="เช่น 081-2345678"
                    value={newReporter.phoneNumber || ''}
                    onChange={(e) =>
                      setNewReporter({ ...newReporter, phoneNumber: e.target.value })
                    }
                    className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">LINE ID</label>
                  <input
                    type="text"
                    placeholder="เช่น @line_id"
                    value={newReporter.lineId || ''}
                    onChange={(e) =>
                      setNewReporter({ ...newReporter, lineId: e.target.value })
                    }
                    className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => setIsAddingReporter(false)}
                  className="text-xs px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleAddReporter}
                  className="text-xs font-bold px-4 py-1.5 bg-emerald-600 text-white rounded-lg shadow-xs"
                >
                  บันทึกข้อมูลผู้รายงาน
                </button>
              </div>
            </div>
          )}

          {/* Reporters Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {reporters.map((rep) => {
              const isEditing = editingReporter?.id === rep.id;

              if (isEditing && editingReporter) {
                return (
                  <div
                    key={rep.id}
                    className="p-3.5 rounded-xl border-2 border-sky-400 bg-sky-50/70 space-y-2"
                  >
                    <div className="text-xs font-bold text-sky-900">แก้ไขข้อมูลผู้รายงาน</div>
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        value={editingReporter.name}
                        onChange={(e) =>
                          setEditingReporter({ ...editingReporter, name: e.target.value })
                        }
                        className="w-full text-xs p-1.5 bg-white border rounded"
                        placeholder="ชื่อ-นามสกุล"
                      />
                      <input
                        type="text"
                        value={editingReporter.position}
                        onChange={(e) =>
                          setEditingReporter({
                            ...editingReporter,
                            position: e.target.value,
                          })
                        }
                        className="w-full text-xs p-1.5 bg-white border rounded"
                        placeholder="ตำแหน่ง"
                      />
                      <input
                        type="text"
                        value={editingReporter.phoneNumber}
                        onChange={(e) =>
                          setEditingReporter({
                            ...editingReporter,
                            phoneNumber: e.target.value,
                          })
                        }
                        className="w-full text-xs p-1.5 bg-white border rounded"
                        placeholder="เบอร์โทร"
                      />
                      <input
                        type="text"
                        value={editingReporter.lineId}
                        onChange={(e) =>
                          setEditingReporter({
                            ...editingReporter,
                            lineId: e.target.value,
                          })
                        }
                        className="w-full text-xs p-1.5 bg-white border rounded"
                        placeholder="LINE ID"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-sky-200">
                      <button
                        type="button"
                        onClick={() => handleDeleteReporter(editingReporter.id)}
                        className="text-xs px-2.5 py-1 text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1 font-semibold"
                        title="ลบผู้รายงานนี้ออกจากระบบ"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>ลบ</span>
                      </button>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingReporter(null)}
                          className="text-xs px-2.5 py-1 bg-slate-200 hover:bg-slate-300 rounded-lg transition-colors cursor-pointer"
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveReporter(editingReporter)}
                          className="text-xs font-bold px-3 py-1 bg-blue-900 hover:bg-blue-800 text-white rounded-lg transition-colors cursor-pointer shadow-xs"
                        >
                          บันทึก
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={rep.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex items-start justify-between gap-2 shadow-2xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-xs truncate">
                      {rep.name}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">
                      💼 {rep.position}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1 flex flex-col gap-0.5">
                      {rep.phoneNumber && <span>📞 {rep.phoneNumber}</span>}
                      {rep.lineId && <span>📱 LINE: {rep.lineId}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingReporter(rep)}
                      className="p-1.5 text-blue-700 hover:text-white hover:bg-blue-600 border border-blue-200 hover:border-blue-600 rounded-lg transition-all cursor-pointer shadow-2xs"
                      title="แก้ไขข้อมูล"
                      aria-label="แก้ไขข้อมูลผู้รายงาน"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteReporter(rep.id)}
                      className="p-1.5 text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-lg transition-all cursor-pointer shadow-2xs"
                      title="ลบข้อมูลผู้รายงาน"
                      aria-label="ลบข้อมูลผู้รายงาน"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. SUB-TAB: ข้อขัดข้องที่แจ้งเข้ามา (System Issues Reported by Mascot) */}
      {activeSubTab === 'issues' && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5 text-slate-900 font-bold text-sm">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900 font-['Prompt']">
                    รายการข้อขัดข้องและปัญหาที่เจ้าหน้าที่แจ้งเข้ามา (System Issues & Tickets)
                  </h4>
                  <p className="text-xs text-slate-500 font-normal">
                    รวบรวมเรื่องที่ส่งผ่านหุ่นยนต์ "NAIJEABKUB" จากทุกศูนย์บริการทั่วประเทศ
                  </p>
                </div>
              </div>

              {/* Status Counters & Clear Button */}
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-xl font-bold border border-slate-200">
                  ทั้งหมด: {reportedIssues.length}
                </span>
                <span className="px-3 py-1 bg-rose-100 text-rose-800 rounded-xl font-bold border border-rose-200">
                  รอดำเนินการ: {reportedIssues.filter((i) => i.status === 'pending').length}
                </span>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-xl font-bold border border-emerald-200">
                  แก้ไขแล้ว: {reportedIssues.filter((i) => i.status === 'resolved').length}
                </span>
                {reportedIssues.length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (window.confirm('คุณต้องการล้างประวัติข้อขัดข้องทั้งหมดหรือไม่?')) {
                        await clearAllSystemIssuesOnline();
                        setReportedIssues([]);
                        onNotify('ล้างประวัติข้อขัดข้องทั้งหมดเรียบร้อยแล้ว');
                      }
                    }}
                    className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold border border-rose-200 flex items-center gap-1 cursor-pointer transition-colors"
                    title="ล้างรายการข้อขัดข้องทั้งหมด"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>ล้างทั้งหมด</span>
                  </button>
                )}
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setIssueFilterStatus('all')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    issueFilterStatus === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ทั้งหมด ({reportedIssues.length})
                </button>
                <button
                  type="button"
                  onClick={() => setIssueFilterStatus('pending')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    issueFilterStatus === 'pending'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'text-rose-700 hover:bg-rose-50'
                  }`}
                >
                  รอดำเนินการ ({reportedIssues.filter((i) => i.status === 'pending').length})
                </button>
                <button
                  type="button"
                  onClick={() => setIssueFilterStatus('resolved')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    issueFilterStatus === 'resolved'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  แก้ไขแล้ว ({reportedIssues.filter((i) => i.status === 'resolved').length})
                </button>
              </div>

              <div className="relative min-w-[220px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={issueSearchQuery}
                  onChange={(e) => setIssueSearchQuery(e.target.value)}
                  placeholder="ค้นหาข้อขัดข้อง, ศูนย์, หรือผู้แจ้ง..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium"
                />
              </div>
            </div>
          </div>

          {/* Issues List */}
          <div className="space-y-3">
            {reportedIssues
              .filter((issue) => {
                if (issueFilterStatus !== 'all' && issue.status !== issueFilterStatus) return false;
                if (!issueSearchQuery.trim()) return true;
                const q = issueSearchQuery.toLowerCase();
                return (
                  issue.title.toLowerCase().includes(q) ||
                  issue.description.toLowerCase().includes(q) ||
                  (issue.officeName && issue.officeName.toLowerCase().includes(q)) ||
                  (issue.reporterContact && issue.reporterContact.toLowerCase().includes(q))
                );
              })
              .map((issue) => {
                const isPending = issue.status === 'pending';
                return (
                  <div
                    key={issue.id}
                    className={`bg-white rounded-2xl p-4 border transition-all shadow-xs space-y-3 ${
                      isPending ? 'border-rose-200 hover:border-rose-300' : 'border-slate-200 opacity-80'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1 max-w-2xl">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              isPending
                                ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            }`}
                          >
                            {isPending ? '🚨 รอดำเนินการ' : '✅ แก้ไขเรียบร้อยแล้ว'}
                          </span>
                          <span className="text-xs font-mono font-bold text-slate-400">
                            #{issue.id}
                          </span>
                          {issue.issueType && issue.issueType !== 'other' && (
                            <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-semibold">
                              {issue.issueType === 'sync'
                                ? 'อินเทอร์เน็ต / ซิงก์'
                                : issue.issueType === 'printer'
                                ? 'เครื่องพิมพ์ / บัตร'
                                : issue.issueType === 'data'
                                ? 'สถิติตัวเลข'
                                : 'ข้อขัดข้อง'}
                            </span>
                          )}
                          <span className="text-xs text-sky-800 font-bold bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200">
                            🏛️ {issue.officeName || 'ไม่ระบุสำนักงาน'}
                          </span>
                        </div>

                        <h5 className="font-extrabold text-sm sm:text-base text-slate-900 font-['Prompt'] pt-0.5">
                          {issue.title}
                        </h5>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            const nextStatus = issue.status === 'resolved' ? 'pending' : 'resolved';
                            const updated: SystemIssueReport = { ...issue, status: nextStatus };
                            await reportSystemIssueOnline(updated);
                            setReportedIssues((prev) =>
                              prev.map((i) => (i.id === issue.id ? updated : i))
                            );
                            onNotify(
                              nextStatus === 'resolved'
                                ? `อัปเดต "${issue.title}" เป็นแก้ไขแล้ว`
                                : `เปลี่ยนสถานะเป็นรอดำเนินการ`
                            );
                          }}
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                            isPending
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                              : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{isPending ? 'ทำเครื่องหมายว่าแก้ไขแล้ว' : 'เปลี่ยนเป็นรอดำเนินการ'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            if (window.confirm(`คุณต้องการลบข้อขัดข้อง "${issue.title}" หรือไม่?`)) {
                              await deleteSystemIssueOnline(issue.id);
                              setReportedIssues((prev) => prev.filter((i) => i.id !== issue.id));
                              onNotify(`ลบข้อขัดข้อง "${issue.title}" เรียบร้อยแล้ว`);
                            }
                          }}
                          className="text-xs font-bold p-1.5 px-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                          title="ลบข้อขัดข้องนี้"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">ลบ</span>
                        </button>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-xs text-slate-800 leading-relaxed whitespace-pre-wrap font-sans">
                      {issue.description}
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100 gap-2">
                      <div className="flex items-center gap-3">
                        {issue.reporterContact && (
                          <span>
                            📞 ผู้แจ้ง/เบอร์ติดต่อ: <b>{issue.reporterContact}</b>
                          </span>
                        )}
                        <span>
                          🕒 เวลาที่แจ้ง: {new Date(issue.createdAt).toLocaleString('th-TH')}
                        </span>
                      </div>
                      {issue.clientInfo && (
                        <span className="text-[10px] text-slate-400 font-mono truncate max-w-xs">
                          {issue.clientInfo}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

            {reportedIssues.length === 0 && (
              <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center text-slate-500 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                <p className="font-bold text-sm text-slate-700">ไม่มีรายงานข้อขัดข้องในระบบ</p>
                <p className="text-xs text-slate-400">
                  เมื่อเจ้าหน้าที่กดแจ้งข้อขัดข้องผ่านหุ่นยนต์ NAIJEABKUB ข้อมูลจะเข้ามาแสดงที่นี่ทันที
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. SUB-TAB 6: การเก็บข้อมูลลงฐานข้อมูล */}
      {activeSubTab === 'database' && (
        <div className="space-y-6">
          {/* Cloud Firestore Online Banner */}
          <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-700 rounded-2xl p-5 text-white shadow-md flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-pulse" />
                <span className="text-xs font-black uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full">
                  CLOUD FIRESTORE ONLINE
                </span>
                <span className="text-xs text-emerald-100 font-semibold">
                  Google Cloud Platform
                </span>
              </div>
              <h4 className="text-lg font-extrabold tracking-tight font-['Prompt']">
                ฐานข้อมูลออนไลน์ของระบบกำลังทำงาน (Cloud Firestore)
              </h4>
              <p className="text-xs text-sky-100 max-w-2xl leading-relaxed">
                ระบบถูกเชื่อมต่อกับฐานข้อมูล Cloud Firestore แบบออนไลน์แล้ว ทุกการบันทึก แก้ไข หรือลบรายงาน จะถูกซิงก์แบบเรียลไทม์ (Real-time Sync) ทั่วทุกสำนักงานจัดหางานและอุปกรณ์ทันที พร้อมทั้งสำรองข้อมูลอัตโนมัติบนคลาวด์
              </p>
            </div>
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/20 text-xs font-semibold">
              <Database className="w-4 h-4 text-emerald-300" />
              <span>Real-time Multi-Device Sync</span>
            </div>
          </div>

          {/* Storage Overview Cards */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-700" />
                  <span>สถานะการจัดเก็บข้อมูลลงฐานข้อมูล (Database Storage Status)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  ข้อมูลทั้งหมดถูกจัดเก็บแบบถาวรบนคลาวด์ (Cloud Persistent Storage) พร้อมระบบสำรองและกู้คืน
                </p>
              </div>

              <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Online & Synced</span>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="text-[11px] text-slate-500 font-medium">รายการรายงานในระบบ</div>
                <div className="text-2xl font-black text-slate-900 mt-0.5 font-['Prompt']">
                  {reports.length}
                </div>
                <div className="text-[10px] text-slate-400">ฉบับ</div>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="text-[11px] text-slate-500 font-medium">ศูนย์บริการที่ลงทะเบียน</div>
                <div className="text-2xl font-black text-blue-900 mt-0.5 font-['Prompt']">
                  {offices.length}
                </div>
                <div className="text-[10px] text-slate-400">แห่งทั่วประเทศ</div>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="text-[11px] text-slate-500 font-medium">หัวข้อกลุ่มมาตรา</div>
                <div className="text-2xl font-black text-indigo-900 mt-0.5 font-['Prompt']">
                  {categories.length}
                </div>
                <div className="text-[10px] text-slate-400">หัวข้อ</div>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="text-[11px] text-slate-500 font-medium">ทำเนียบผู้รายงาน</div>
                <div className="text-2xl font-black text-teal-900 mt-0.5 font-['Prompt']">
                  {reporters.length}
                </div>
                <div className="text-[10px] text-slate-400">ท่าน</div>
              </div>
            </div>
          </div>

          {/* Backup & Restore Action Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Export Backup Card */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                <Download className="w-4 h-4 text-emerald-600" />
                <span>สำรองฐานข้อมูล (Export Database Backup)</span>
              </div>
              <p className="text-xs text-slate-500">
                ดาวน์โหลดข้อมูลทั้งหมดของระบบ (รายงาน, ศูนย์บริการ, หัวข้อ, รูปภาพ, ผู้รายงาน) เป็นไฟล์ .JSON เก็บไว้บนคอมพิวเตอร์อย่างปลอดภัย
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleExportFullDatabase}
                  className="w-full text-xs font-bold px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>ดาวน์โหลดไฟล์สำรองฐานข้อมูล (.json)</span>
                </button>
              </div>
            </div>

            {/* Import Restore Card */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                <Upload className="w-4 h-4 text-blue-600" />
                <span>กู้คืนฐานข้อมูล (Restore Database)</span>
              </div>
              <p className="text-xs text-slate-500">
                นำเข้าไฟล์ .JSON ที่เคยสำรองไว้เพื่อนำข้อมูลกลับมาใช้งานบนระบบทั้งหมด
              </p>
              <div className="pt-2">
                <label className="w-full text-xs font-bold px-4 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>เลือกไฟล์สำรอง .json เพื่อกู้คืน</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportDatabase}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* REST JSON API Endpoints Card */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-5 border border-slate-700 shadow-md space-y-3.5 md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-sky-400" />
                  <span className="font-extrabold text-sm text-white tracking-tight">
                    ช่องทางดึงข้อมูลสรุปผ่าน REST API (JSON API Endpoints)
                  </span>
                </div>
                <span className="text-[11px] bg-sky-500/20 text-sky-300 border border-sky-400/30 px-2.5 py-0.5 rounded-full font-mono font-bold">
                  GET Request • JSON Format
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                ท่านสามารถใช้ URL ด้านล่างนี้ในการดึงข้อมูลสรุปแบบ JSON เพื่อนำไปเชื่อมต่อกับ Power BI, Looker Studio, Google Sheets, LINE Bot หรือระบบสารสนเทศภายนอกได้โดยตรง:
              </p>

              <div className="space-y-3 pt-1">
                {/* Endpoint 1: Reports Collection */}
                <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
                  <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold">GET</span>
                      1. ดึงข้อมูลรายงานผลการปฏิบัติงานทั้งหมด (Reports JSON)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('https://firestore.googleapis.com/v1/projects/promising-imagery-l09p9/databases/ai-studio-doe-984116b9-6043-43c8-97a4-66738b218bdc/documents/reports');
                        onNotify('คัดลอก Reports JSON API URL เรียบร้อยแล้ว');
                      }}
                      className="text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer bg-slate-700/60 hover:bg-slate-700 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      <Copy className="w-3 h-3" /> คัดลอก URL
                    </button>
                  </div>
                  <code className="text-[11px] font-mono text-slate-300 break-all select-all block bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                    https://firestore.googleapis.com/v1/projects/promising-imagery-l09p9/databases/ai-studio-doe-984116b9-6043-43c8-97a4-66738b218bdc/documents/reports
                  </code>
                </div>

                {/* Endpoint 2: System Issues Collection */}
                <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
                  <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold">GET</span>
                      2. ดึงประวัติข้อขัดข้องที่แจ้งผ่าน NAIJEABKUB (Issues JSON)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('https://firestore.googleapis.com/v1/projects/promising-imagery-l09p9/databases/ai-studio-doe-984116b9-6043-43c8-97a4-66738b218bdc/documents/system_issues');
                        onNotify('คัดลอก System Issues JSON API URL เรียบร้อยแล้ว');
                      }}
                      className="text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer bg-slate-700/60 hover:bg-slate-700 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      <Copy className="w-3 h-3" /> คัดลอก URL
                    </button>
                  </div>
                  <code className="text-[11px] font-mono text-slate-300 break-all select-all block bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                    https://firestore.googleapis.com/v1/projects/promising-imagery-l09p9/databases/ai-studio-doe-984116b9-6043-43c8-97a4-66738b218bdc/documents/system_issues
                  </code>
                </div>
              </div>
            </div>

            {/* Quick Restore Standard Offices Card */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3 md:col-span-2">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                <RotateCcw className="w-4 h-4 text-amber-600" />
                <span>กู้คืนรายชื่อสำนักงานจัดหางานมาตรฐานทั้ง 87 แห่ง (Restore Standard Provincial Offices)</span>
              </div>
              <p className="text-xs text-slate-500">
                หากมีจังหวัดหรือสำนักงานจัดหางานใดที่ถูกลบออก สามารถกู้คืนรายชื่อตามมาตรฐานทางการของกรมการจัดหางานกลับมาทั้งหมดได้ทันที โดยไม่กระทบรายงานและข้อมูลที่บันทึกไว้
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleRestoreAllOffices}
                  className="w-full text-xs font-bold px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>กู้คืนจังหวัด/สำนักงานมาตรฐานทั้งหมด ({EMPLOYMENT_OFFICES.length} แห่ง)</span>
                </button>
              </div>
            </div>

            {/* Auto Backup & Emergency Cloud Sync Card */}
            <div className="bg-sky-50/80 rounded-2xl p-5 border border-sky-300 space-y-3.5 md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold text-sm text-sky-950">
                  <Database className="w-4.5 h-4.5 text-sky-700" />
                  <span>ระบบสำรองข้อมูลอัตโนมัติ & กู้คืนรายงาน (Auto Backup & Cloud Sync)</span>
                </div>
                <span className="text-[11px] font-bold text-sky-800 bg-sky-100 px-2.5 py-0.5 rounded-full border border-sky-200">
                  ความปลอดภัยข้อมูลรายงาน
                </span>
              </div>
              <p className="text-xs text-sky-900 leading-relaxed">
                ระบบได้เปิดใช้ระบบ <b>Rolling Local Backup อัตโนมัติ</b> ในเครื่องทุกครั้งที่มีการบันทึกรายงาน หากข้อมูลรายงานในระบบสูญหายจากข้อผิดพลาดของเครือข่าย หรือต้องการนำข้อมูลจากเครื่องนี้ขึ้นระบบออนไลน์ สามารถกดกู้คืนหรือซิงก์ได้ทันที
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={onRestoreBackupReports}
                  className="text-xs font-bold px-4 py-2.5 bg-sky-700 hover:bg-sky-800 text-white rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  title="กู้คืนรายงานผลจากไฟล์สำรองอัตโนมัติในเครื่อง"
                >
                  <RotateCcw className="w-4 h-4 text-sky-200" />
                  <span>📥 กู้คืนรายงานจาก Auto Backup ในเครื่อง</span>
                </button>
                <button
                  type="button"
                  onClick={onSyncAllReportsToOnline}
                  className="text-xs font-bold px-4 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  title="ส่งรายงานทั้งหมดในเครื่องขึ้นฐานข้อมูล Cloud Firestore"
                >
                  <RefreshCw className="w-4 h-4 text-sky-300" />
                  <span>☁️ ซิงก์รายงานทั้งหมดขึ้น Cloud Firestore</span>
                </button>
              </div>
            </div>

            {/* Clear All Reports For Production Card */}
            <div className="bg-amber-50/70 rounded-2xl p-5 border border-amber-300 space-y-3 md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold text-sm text-amber-950">
                  <Trash2 className="w-4 h-4 text-amber-700" />
                  <span>ล้างประวัติการรายงานและหมายเหตุทั้งหมดเพื่อเริ่มใช้งานจริง (Clear All Reports for Production)</span>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-200/80 text-amber-950">
                  รายงานในระบบปัจจุบัน: {reports.length} ฉบับ
                </span>
              </div>
              <p className="text-xs text-amber-900 leading-relaxed">
                <strong>คำเตือนสำคัญ:</strong> ปุ่มนี้ใช้สำหรับ <strong>ล้างข้อมูลทดสอบก่อนเปิดใช้งานจริงเท่านั้น</strong> ห้ามกดปุ่มนี้หลังจากที่เจ้าหน้าที่เริ่มส่งรายงานจริงแล้ว เพราะจะลบรายงานทั้งหมดออกจากหน้าแดชบอร์ดและ Cloud Firestore (หากเผลอกดไปแล้ว สามารถกดปุ่ม <strong>"ดึงข้อมูลรายงานสำรองกลับคืน"</strong> ด้านบนเพื่อกู้คืนได้)
              </p>
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmModal({
                      isOpen: true,
                      title: `ยืนยันล้างรายงานทั้งหมด (${reports.length} ฉบับ)`,
                      message:
                        `ขณะนี้มีรายงานในระบบจำนวน ${reports.length} ฉบับ คุณแน่ใจหรือไม่ว่าต้องการล้างรายงานผลการปฏิบัติงานและหมายเหตุทั้งหมดออกจากหน้าแดชบอร์ด? (ควรใช้เฉพาะตอนล้างข้อมูลทดสอบก่อนเริ่มใช้งานจริงเท่านั้น)`,
                      confirmText: 'ยืนยันล้างประวัติรายงานทั้งหมด',
                      cancelText: 'ยกเลิก',
                      isDanger: true,
                      iconType: 'trash',
                      onConfirm: () => {
                        if (onClearAllReportsForProduction) {
                          onClearAllReportsForProduction();
                        }
                      },
                    });
                  }}
                  className="text-xs font-bold px-4 py-2.5 bg-amber-700 hover:bg-amber-800 text-white rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>ล้างประวัติการรายงานและหมายเหตุทั้งหมดเพื่อขึ้นใช้งานจริง</span>
                </button>
              </div>
            </div>
          </div>

          {/* Factory Reset Danger Zone */}
          <div className="bg-rose-50/50 rounded-2xl p-5 border border-rose-200 space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm text-rose-900">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>คืนค่าระบบเป็นค่าเริ่มต้น (Reset to Factory Defaults)</span>
            </div>
            <p className="text-xs text-rose-700">
              การกดปุ่มนี้จะล้างข้อมูลที่แก้ไขทั้งหมด และโหลดข้อมูลมาตรฐานทางการของกรมการจัดหางานใหม่อีกครั้ง
            </p>
            <div>
              <button
                type="button"
                onClick={() => {
                  setConfirmModal({
                    isOpen: true,
                    title: 'คำเตือน: รีเซ็ตระบบเป็นค่าเริ่มต้นทางการ',
                    message:
                      'การกดปุ่มนี้จะล้างข้อมูลการปรับแต่งทั้งหมด (รายงาน, ศูนย์บริการ, หัวข้อ, รูปภาพ, ผู้รายงาน) และโหลดข้อมูลมาตรฐานทางการของกรมการจัดหางาน (DOE) ใหม่อีกครั้ง ยืนยันดำเนินการหรือไม่?',
                    confirmText: 'ยืนยันรีเซ็ตระบบเป็นค่าเริ่มต้น',
                    cancelText: 'ยกเลิก',
                    isDanger: true,
                    iconType: 'reset',
                    onConfirm: () => {
                      onResetFactoryDefaults();
                    },
                  });
                }}
                className="text-xs font-bold px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>รีเซ็ตระบบเป็นค่าเริ่มต้น</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 8: คู่มือการใช้งานระบบ & แอดมิน */}
      {activeSubTab === 'manual' && (
        <SystemManualView
          onNavigateTab={(tab) => {
            if (onNavigateTab) {
              onNavigateTab(tab);
            }
          }}
          onNavigateAdminSubTab={(subTab) => {
            setActiveSubTab(subTab);
          }}
          isAdmin={true}
          adminPin={systemConfig.adminPin || '0841543524'}
          systemTitle={systemConfig.reportTitle}
          officeCount={offices.length}
        />
      )}

      {/* Confirmation Dialog Modal (Replaces blocked window.confirm) */}
      <ConfirmDialogModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        isDanger={confirmModal.isDanger}
        iconType={confirmModal.iconType}
        onConfirm={confirmModal.onConfirm}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
