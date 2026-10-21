import React, { useState, useEffect, useId, useMemo, useRef } from 'react';
import {
  DOEReport,
  EmploymentOffice,
  QueueMetricCategory,
  ReportCategory,
  ReporterProfile,
} from '../types/doe';
import { EMPLOYMENT_OFFICES } from '../data/offices';
import { DEFAULT_QUEUE_METRICS } from '../data/initialAdminData';
import { formatThaiDateFull, formatNumber, getTodayIsoDate } from '../utils/thaiDate';
import { groupAndSortOfficesByRegion } from '../utils/officeUtils';
import { AdminPinModal } from './AdminPinModal';
import {
  Save,
  User,
  Briefcase,
  Building2,
  Calendar,
  Phone,
  FileText,
  AlertCircle,
  CheckCircle2,
  Plus,
  Minus,
  Truck,
  RotateCcw,
  Lock,
  ShieldCheck,
  Search,
  X,
  MapPin,
  Check,
  Settings,
  Star,
} from 'lucide-react';
import { calculateReportTotalSections } from '../utils/doeUtils';

export const MOBILE_UNIT_CENTER_NAME =
  'หน่วยบริการใบอนุญาตทำงานของคนต่างด้าวแบบเคลื่อนที่ (Mobile Unit)';

interface ReportFormProps {
  initialReport?: DOEReport | null;
  onSave: (report: DOEReport) => void;
  onPreviewLive: (report: DOEReport) => void;
  onClearForm?: () => void;
  offices?: EmploymentOffice[];
  categories?: ReportCategory[];
  queueMetrics?: QueueMetricCategory[];
  reporters?: ReporterProfile[];
  isAdmin?: boolean;
  adminPin?: string;
  onAdminAuthenticated?: () => void;
  onNavigateAdmin?: (subTab?: string) => void;
  onUpdateOffices?: (offices: EmploymentOffice[]) => void;
  onUpdateCategories?: (categories: ReportCategory[]) => void;
  onUpdateQueueMetrics?: (metrics: QueueMetricCategory[]) => void;
  onNotify?: (msg: string) => void;
}

export const ReportForm: React.FC<ReportFormProps> = ({
  initialReport,
  onSave,
  onPreviewLive,
  onClearForm,
  offices,
  categories,
  queueMetrics,
  reporters,
  isAdmin = false,
  adminPin = '0841543524',
  onAdminAuthenticated,
  onNavigateAdmin,
  onUpdateOffices,
  onUpdateCategories,
  onUpdateQueueMetrics,
  onNotify,
}) => {
  const searchInputId = useId();
  const [officeSearch, setOfficeSearch] = useState('');
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>(
    initialReport?.officeId || EMPLOYMENT_OFFICES[0]?.id || 'bkk_1'
  );

  // Inline Admin Quick-Add / Edit Panels
  const [showAdminCenterPanel, setShowAdminCenterPanel] = useState(false);
  const [adminCenterMode, setAdminCenterMode] = useState<'add' | 'edit'>('add');
  const [newCenterNameInput, setNewCenterNameInput] = useState('');
  const [newCenterOfficeNameInput, setNewCenterOfficeNameInput] = useState('');
  const [newCenterRegionInput, setNewCenterRegionInput] = useState('');
  const [editCenterNameInput, setEditCenterNameInput] = useState('');

  const [showAdminCategoryPanel, setShowAdminCategoryPanel] = useState(false);
  const [newCatTitleInput, setNewCatTitleInput] = useState('');
  const [newCatSubLabelInput, setNewCatSubLabelInput] = useState('');
  const [newCatCodeInput, setNewCatCodeInput] = useState('');

  const [showAdminQueuePanel, setShowAdminQueuePanel] = useState(false);
  const [newQueueTitleInput, setNewQueueTitleInput] = useState('');
  const [newQueueUnitInput, setNewQueueUnitInput] = useState('คน');
  const [newQueueSubLabelInput, setNewQueueSubLabelInput] = useState('');

  // Admin Verification Modal for protected fields (Center Name & Notes)
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminActionTitle, setAdminActionTitle] = useState('');
  const [pendingAdminAction, setPendingAdminAction] = useState<(() => void) | null>(null);

  const requireAdmin = (actionTitle: string, actionFn: () => void) => {
    if (isAdmin) {
      actionFn();
    } else {
      setAdminActionTitle(actionTitle);
      setPendingAdminAction(() => actionFn);
      setAdminModalOpen(true);
    }
  };

  const officeList = useMemo(() => {
    return offices && offices.length > 0 ? offices : EMPLOYMENT_OFFICES;
  }, [offices]);

  const activeCategories = useMemo(() => {
    if (categories && categories.length > 0) {
      return categories.filter((c) => c.isActive);
    }
    return [
      { id: 'section59', code: 'ม.59', title: 'กลุ่มมาตรา 59', subLabel: 'คนต่างด้าวทำงานทั่วไปตามมาตรา 59', isActive: true },
      { id: 'section62', code: 'ม.62', title: 'กลุ่มมาตรา 62', subLabel: 'ผู้มีความรู้ความเชี่ยวชาญ/ช่างฝีมือ', isActive: true },
      { id: 'section63_1', code: 'ม.63/1', title: 'กลุ่มมาตรา 63/1', subLabel: 'ชนกลุ่มน้อย / ผู้มีสถานะตามกฎหมาย', isActive: true },
      { id: 'section63_2', code: 'ม.63/2', title: 'กลุ่มมาตรา 63/2', subLabel: 'กลุ่มมติ ครม. / แรงงาน 4 สัญชาติ', isActive: true },
      { id: 'section64', code: 'ม.64', title: 'กลุ่มมาตรา 64', subLabel: 'แรงงานนำเข้าแบบไป-กลับ หรือตามฤดูกาล', isActive: true },
      { id: 'mouGroup', code: 'MOU', title: 'กลุ่มนำเข้าตาม MOU', subLabel: 'แรงงานต่างด้าวนำเข้าตามข้อตกลง MOU', isActive: true },
      { id: 'modifyDetails', code: 'เปลี่ยนแปลง', title: 'เปลี่ยนแปลงรายการในใบอนุญาตทำงาน', subLabel: 'ย้ายนายจ้าง / เปลี่ยนแปลงสถานที่ทำงาน', isActive: true },
      { id: 'substituteCard', code: 'ใบแทน', title: 'ใบแทนใบอนุญาตทำงาน', subLabel: 'กรณีบัตรชำรุด สูญหาย หรือขอใบแทน', isActive: true },
    ];
  }, [categories]);

  const activeQueueMetrics = useMemo(() => {
    if (queueMetrics && queueMetrics.length > 0) {
      return queueMetrics.filter((m) => m.isActive);
    }
    return DEFAULT_QUEUE_METRICS;
  }, [queueMetrics]);

  const todayIso = getTodayIsoDate();
  const initialDefaultOffice = EMPLOYMENT_OFFICES[0];

  const initialCalculatedTotal = useMemo(() => {
    return calculateReportTotalSections(initialReport || {}, activeCategories);
  }, [initialReport, activeCategories]);

  const [formData, setFormData] = useState<Omit<DOEReport, 'id' | 'createdAt' | 'updatedAt'>>({
    reportDate: initialReport?.reportDate || todayIso,
    reportDateThaiStr: initialReport?.reportDateThaiStr || formatThaiDateFull(todayIso),
    officeId: initialReport?.officeId || initialDefaultOffice.id,
    officeName: initialReport?.officeName || initialDefaultOffice.name,
    officeNameEn: initialReport?.officeNameEn || initialDefaultOffice.nameEn,
    centerName:
      initialReport?.centerName ||
      initialDefaultOffice.centerName,
    region: initialReport?.region || initialDefaultOffice.region,
    reporterName: initialReport?.reporterName || '',
    reporterPosition: initialReport?.reporterPosition || '',
    phoneNumber: initialReport?.phoneNumber || '',
    lineId: initialReport?.lineId || '',
    section59: initialReport?.section59 ?? 0,
    section62: initialReport?.section62 ?? 0,
    section63_1: initialReport?.section63_1 ?? 0,
    section63_2: initialReport?.section63_2 ?? 0,
    section64: initialReport?.section64 ?? 0,
    mouGroup: initialReport?.mouGroup ?? 0,
    modifyDetails: initialReport?.modifyDetails ?? 0,
    substituteCard: initialReport?.substituteCard ?? 0,
    queueAppointment: initialReport?.queueAppointment ?? 0,
    cardsIssued: Math.max(initialReport?.cardsIssued ?? 0, initialCalculatedTotal),
    identityVerified: initialReport?.identityVerified ?? 0,
    cardsNotIssued: initialReport?.cardsNotIssued ?? 0,
    missedAppointment: initialReport?.missedAppointment ?? 0,
    wrongAppointmentDate: initialReport?.wrongAppointmentDate ?? 0,
    cumulativeCardsIssued: initialReport?.cumulativeCardsIssued ?? 0,
    cumulativeSinceDate: initialReport?.cumulativeSinceDate || '13 ตุลาคม 2568',
    customCategoryValues: initialReport?.customCategoryValues || {},
    customQueueValues: initialReport?.customQueueValues || {},
    notes: initialReport?.notes || '',
  });

  const lastReportIdRef = useRef<string | undefined>(initialReport?.id);

  useEffect(() => {
    if (initialReport && initialReport.id !== lastReportIdRef.current) {
      lastReportIdRef.current = initialReport.id;
      setSelectedOfficeId(initialReport.officeId || initialDefaultOffice.id);
      const computedTotal = calculateReportTotalSections(initialReport, activeCategories);
      setFormData({
        reportDate: initialReport.reportDate || todayIso,
        reportDateThaiStr:
          initialReport.reportDateThaiStr ||
          formatThaiDateFull(initialReport.reportDate || todayIso),
        officeId: initialReport.officeId || initialDefaultOffice.id,
        officeName: initialReport.officeName || initialDefaultOffice.name,
        officeNameEn:
          initialReport.officeNameEn || initialDefaultOffice.nameEn,
        centerName:
          initialReport.centerName ||
          initialDefaultOffice.centerName,
        region: initialReport.region || initialDefaultOffice.region,
        reporterName: initialReport.reporterName || '',
        reporterPosition: initialReport.reporterPosition || '',
        phoneNumber: initialReport.phoneNumber || '',
        lineId: initialReport.lineId || '',
        section59: initialReport.section59 ?? 0,
        section62: initialReport.section62 ?? 0,
        section63_1: initialReport.section63_1 ?? 0,
        section63_2: initialReport.section63_2 ?? 0,
        section64: initialReport.section64 ?? 0,
        mouGroup: initialReport.mouGroup ?? 0,
        modifyDetails: initialReport.modifyDetails ?? 0,
        substituteCard: initialReport.substituteCard ?? 0,
        queueAppointment: initialReport.queueAppointment ?? 0,
        cardsIssued: Math.max(initialReport.cardsIssued ?? 0, computedTotal),
        identityVerified: initialReport.identityVerified ?? 0,
        cardsNotIssued: initialReport.cardsNotIssued ?? 0,
        missedAppointment: initialReport.missedAppointment ?? 0,
        wrongAppointmentDate: initialReport.wrongAppointmentDate ?? 0,
        cumulativeCardsIssued: initialReport.cumulativeCardsIssued ?? 0,
        cumulativeSinceDate: initialReport.cumulativeSinceDate || '13 ตุลาคม 2568',
        customCategoryValues: initialReport.customCategoryValues || {},
        customQueueValues: initialReport.customQueueValues || {},
        notes: initialReport.notes || '',
      });
    }
  }, [initialReport?.id, todayIso, initialDefaultOffice, activeCategories]);

  // Current selected office object and its default standard center name
  const currentSelectedOffice = useMemo(() => {
    return officeList.find((o) => o.id === selectedOfficeId) || officeList[0];
  }, [officeList, selectedOfficeId]);

  const standardOfficeCenterName = useMemo(() => {
    return currentSelectedOffice?.centerName || 'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว';
  }, [currentSelectedOffice]);

  // Determine if active center is Mobile Unit or Office Standard
  const isMobileCenter = useMemo(() => {
    return (
      formData.centerName === MOBILE_UNIT_CENTER_NAME ||
      Boolean(formData.centerName?.includes('Mobile Unit')) ||
      Boolean(formData.centerName?.includes('หน่วยบริการใบอนุญาตทำงานของคนต่างด้าวแบบเคลื่อนที่'))
    );
  }, [formData.centerName]);

  // Keep formData's officeName & standard centerName synced if Admin updates the selected office
  useEffect(() => {
    if (!currentSelectedOffice) return;
    if (formData.officeId !== currentSelectedOffice.id) return;
    const expectedCenter = isMobileCenter
      ? formData.centerName
      : currentSelectedOffice.centerName || formData.centerName;
    if (
      formData.officeName !== currentSelectedOffice.name ||
      formData.region !== currentSelectedOffice.region ||
      (!isMobileCenter && formData.centerName !== expectedCenter)
    ) {
      const updated = {
        ...formData,
        officeName: currentSelectedOffice.name,
        officeNameEn: currentSelectedOffice.nameEn || currentSelectedOffice.name,
        region: currentSelectedOffice.region,
        centerName: expectedCenter,
      };
      setFormData(updated);
      triggerPreview(updated);
    }
  }, [currentSelectedOffice]);

  // Switch between Standard Office Center and Mobile Unit
  const handleCenterTypeChange = (type: 'standard' | 'mobile') => {
    const nextCenterName =
      type === 'mobile' ? MOBILE_UNIT_CENTER_NAME : standardOfficeCenterName;
    const updated = {
      ...formData,
      centerName: nextCenterName,
    };
    setFormData(updated);
    triggerPreview(updated);
  };

  // Inline Admin: Add New Center or Edit Current Center
  const handleOpenAdminCenterPanel = (mode: 'add' | 'edit') => {
    requireAdmin(
      mode === 'add' ? 'เพิ่มชื่อศูนย์บริการใหม่เข้าสู่ระบบ' : 'แก้ไขชื่อศูนย์บริการของสำนักงานนี้',
      () => {
        setAdminCenterMode(mode);
        if (mode === 'edit') {
          setEditCenterNameInput(currentSelectedOffice?.centerName || formData.centerName || '');
          setNewCenterOfficeNameInput(currentSelectedOffice?.name || formData.officeName || '');
        } else {
          setNewCenterNameInput('');
          setNewCenterOfficeNameInput(currentSelectedOffice?.name || formData.officeName || '');
          setNewCenterRegionInput(currentSelectedOffice?.region || formData.region || 'ภาคกลางและตะวันตก');
        }
        setShowAdminCenterPanel(true);
      }
    );
  };

  const handleSaveAdminCenter = () => {
    if (adminCenterMode === 'edit') {
      const trimmedCenter = editCenterNameInput.trim();
      const trimmedOffice = newCenterOfficeNameInput.trim() || currentSelectedOffice?.name || formData.officeName;
      if (!trimmedCenter) {
        onNotify?.('⚠️ กรุณาระบุชื่อศูนย์บริการ');
        return;
      }
      if (currentSelectedOffice && onUpdateOffices) {
        const updatedOffices = officeList.map((o) =>
          o.id === currentSelectedOffice.id
            ? { ...o, name: trimmedOffice, centerName: trimmedCenter }
            : o
        );
        onUpdateOffices(updatedOffices);
      }
      const updatedForm = {
        ...formData,
        officeName: trimmedOffice,
        centerName: trimmedCenter,
      };
      setFormData(updatedForm);
      triggerPreview(updatedForm);
      setShowAdminCenterPanel(false);
      onNotify?.(`บันทึกการแก้ไขชื่อศูนย์ "${trimmedCenter}" เรียบร้อยแล้ว`);
    } else {
      const rawCenter = newCenterNameInput.trim();
      const rawOffice = newCenterOfficeNameInput.trim();
      if (!rawCenter && !rawOffice) {
        onNotify?.('⚠️ กรุณาระบุชื่อศูนย์บริการใหม่ หรือ ชื่อสำนักงานจัดหางาน');
        return;
      }
      const finalOfficeName = rawOffice || rawCenter;
      const finalCenterName =
        rawCenter || `ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว (${finalOfficeName})`;
      const finalRegion = (newCenterRegionInput || currentSelectedOffice?.region || 'ภาคกลางและตะวันตก') as EmploymentOffice['region'];
      const newOfficeItem: EmploymentOffice = {
        id: `office_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: finalOfficeName,
        nameEn: finalOfficeName,
        centerName: finalCenterName,
        region: finalRegion,
        defaultPhone: currentSelectedOffice?.defaultPhone || formData.phoneNumber || '',
        defaultLine: currentSelectedOffice?.defaultLine || formData.lineId || '',
      };
      if (onUpdateOffices) {
        onUpdateOffices([...officeList, newOfficeItem]);
      }
      setOfficeSearch('');
      setSelectedRegionFilter('ทั้งหมด');
      setSelectedOfficeId(newOfficeItem.id);
      const updatedForm = {
        ...formData,
        officeId: newOfficeItem.id,
        officeName: newOfficeItem.name,
        officeNameEn: newOfficeItem.nameEn,
        centerName: newOfficeItem.centerName,
        region: newOfficeItem.region,
      };
      setFormData(updatedForm);
      triggerPreview(updatedForm);
      setShowAdminCenterPanel(false);
      setNewCenterNameInput('');
      onNotify?.(`เพิ่มศูนย์บริการใหม่ "${newOfficeItem.centerName}" และเลือกใช้งานทันทีเรียบร้อยแล้ว`);
    }
  };

  // Inline Admin: Quick Add Category in Section 2
  const handleQuickAddCategory = () => {
    const titleVal = newCatTitleInput.trim() || newCatCodeInput.trim();
    if (!titleVal) {
      onNotify?.('⚠️ กรุณาระบุชื่อหัวข้อกลุ่มเป้าหมายที่ต้องการเพิ่ม');
      return;
    }
    const newCat: ReportCategory = {
      id: `cat_${Date.now()}`,
      code: newCatCodeInput.trim() || '',
      title: titleVal,
      subLabel: newCatSubLabelInput.trim() || '',
      color: 'from-blue-600 to-indigo-600',
      isActive: true,
      isDefault: false,
    };
    const baseCats = categories && categories.length > 0 ? categories : activeCategories;
    onUpdateCategories?.([...baseCats, newCat]);
    setNewCatTitleInput('');
    setNewCatSubLabelInput('');
    setNewCatCodeInput('');
    setShowAdminCategoryPanel(false);
    onNotify?.(`เพิ่มหัวข้อใหม่ "${newCat.title}" เรียบร้อยแล้ว`);
  };

  // Inline Admin: Quick Add Queue Metric in Section 3
  const handleQuickAddQueueMetric = () => {
    const titleVal = newQueueTitleInput.trim();
    if (!titleVal) {
      onNotify?.('⚠️ กรุณาระบุชื่อหัวข้อสถานะคิว/บริการที่ต้องการเพิ่ม');
      return;
    }
    const newQm: QueueMetricCategory = {
      id: `custom_queue_${Date.now()}`,
      title: titleVal,
      unit: newQueueUnitInput.trim() || 'คน',
      subLabel: newQueueSubLabelInput.trim() || '',
      badgeColor: 'text-indigo-700 bg-indigo-50 border-indigo-200',
      isActive: true,
      isDefault: false,
    };
    const baseMetrics = queueMetrics && queueMetrics.length > 0 ? queueMetrics : activeQueueMetrics;
    onUpdateQueueMetrics?.([...baseMetrics, newQm]);
    setNewQueueTitleInput('');
    setNewQueueUnitInput('คน');
    setNewQueueSubLabelInput('');
    setShowAdminQueuePanel(false);
    onNotify?.(`เพิ่มหัวข้อสถานะคิวใหม่ "${newQm.title}" เรียบร้อยแล้ว`);
  };

  // Calculate live sums across all active categories (both default and custom)
  const totalSections = useMemo(() => {
    return calculateReportTotalSections(formData, activeCategories);
  }, [activeCategories, formData]);

  // Handle Office Selection
  const handleOfficeChange = (officeId: string, clearSearch = false) => {
    if (!officeId) return;
    setSelectedOfficeId(officeId);
    const office = officeList.find((o) => o.id === officeId);
    if (office) {
      // Check if a registered reporter belongs to this office
      const matchingReporter = reporters?.find((r) => r.officeId === office.id);
      const targetCenterName = isMobileCenter
        ? formData.centerName || MOBILE_UNIT_CENTER_NAME
        : office.centerName || 'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว';

      const updated = {
        ...formData,
        officeId: office.id,
        officeName: office.name,
        officeNameEn: office.nameEn,
        centerName: targetCenterName,
        region: office.region,
        phoneNumber: matchingReporter?.phoneNumber || formData.phoneNumber || '',
        lineId: matchingReporter?.lineId || formData.lineId || '',
        reporterName: matchingReporter?.name || formData.reporterName || '',
        reporterPosition: matchingReporter?.position || formData.reporterPosition || '',
      };
      setFormData(updated);
      triggerPreview(updated);
      if (clearSearch) {
        setOfficeSearch('');
      }
    }
  };

  // Helper to compute total sum of all categories for given formData
  const computeTotalFromData = (data: typeof formData) => {
    return calculateReportTotalSections(data, activeCategories);
  };

  // Handle Standard Category Change with auto-sum sync for cardsIssued
  const handleCategoryNumberChange = (
    field: 'section59' | 'section62' | 'section63_1' | 'section63_2' | 'section64' | 'mouGroup' | 'modifyDetails' | 'substituteCard',
    val: number
  ) => {
    const safeVal = Math.max(0, isNaN(val) ? 0 : val);
    const updated = { ...formData, [field]: safeVal };
    const newTotal = computeTotalFromData(updated);
    updated.cardsIssued = newTotal;
    setFormData(updated);
    triggerPreview(updated);
  };

  const stepCategoryNumber = (
    field: 'section59' | 'section62' | 'section63_1' | 'section63_2' | 'section64' | 'mouGroup' | 'modifyDetails' | 'substituteCard',
    delta: number
  ) => {
    const current = Number(formData[field]) || 0;
    handleCategoryNumberChange(field, Math.max(0, current + delta));
  };

  // Handle Custom Category Value Change with auto-sum sync for cardsIssued
  const handleCustomCategoryChange = (catId: string, val: number) => {
    const safeVal = Math.max(0, isNaN(val) ? 0 : val);
    const updated = {
      ...formData,
      customCategoryValues: {
        ...(formData.customCategoryValues || {}),
        [catId]: safeVal,
      },
    };
    const newTotal = computeTotalFromData(updated);
    updated.cardsIssued = newTotal;
    setFormData(updated);
    triggerPreview(updated);
  };

  // Handle Custom Queue Metric Value Change
  const handleCustomQueueChange = (metricId: string, val: number) => {
    const safeVal = Math.max(0, isNaN(val) ? 0 : val);
    const updated = {
      ...formData,
      customQueueValues: {
        ...(formData.customQueueValues || {}),
        [metricId]: safeVal,
      },
    };
    setFormData(updated);
    triggerPreview(updated);
  };

  const stepCustomQueue = (metricId: string, delta: number) => {
    const current = (formData.customQueueValues && formData.customQueueValues[metricId]) || 0;
    handleCustomQueueChange(metricId, Math.max(0, current + delta));
  };

  // Handle Date Change
  const handleDateChange = (isoDate: string) => {
    const thaiStr = formatThaiDateFull(isoDate);
    const updated = {
      ...formData,
      reportDate: isoDate,
      reportDateThaiStr: thaiStr,
    };
    setFormData(updated);
    triggerPreview(updated);
  };

  // Handle General Number Field Change
  const handleNumberChange = (
    field: keyof Omit<DOEReport, 'id' | 'createdAt' | 'updatedAt'>,
    val: number
  ) => {
    const safeVal = Math.max(0, isNaN(val) ? 0 : val);
    const updated = { ...formData, [field]: safeVal };
    setFormData(updated);
    triggerPreview(updated);
  };

  // Quick stepper helper
  const stepNumber = (
    field: keyof Omit<DOEReport, 'id' | 'createdAt' | 'updatedAt'>,
    delta: number
  ) => {
    const current = Number(formData[field]) || 0;
    handleNumberChange(field, Math.max(0, current + delta));
  };

  const triggerPreview = (data: typeof formData) => {
    onPreviewLive({
      ...data,
      id: initialReport?.id || `report-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      createdAt: initialReport?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  const [justSaved, setJustSaved] = useState(false);
  const [reporterNameError, setReporterNameError] = useState(false);
  const [reporterPositionError, setReporterPositionError] = useState(false);
  const [phoneNumberError, setPhoneNumberError] = useState(false);
  const [queueAppointmentError, setQueueAppointmentError] = useState(false);
  const reporterNameInputRef = useRef<HTMLInputElement | null>(null);
  const reporterPositionInputRef = useRef<HTMLInputElement | null>(null);
  const phoneNumberInputRef = useRef<HTMLInputElement | null>(null);
  const queueInputRef = useRef<HTMLInputElement | null>(null);
  const [lastSavedMeta, setLastSavedMeta] = useState<{
    officeName: string;
    timeStr: string;
    totalCards: number;
  } | null>(null);

  useEffect(() => {
    if (formData.reporterName && formData.reporterName.trim().length > 0) {
      setReporterNameError(false);
      if (reporterNameInputRef.current) {
        reporterNameInputRef.current.setCustomValidity('');
      }
    }
  }, [formData.reporterName]);

  useEffect(() => {
    if (formData.reporterPosition && formData.reporterPosition.trim().length > 0) {
      setReporterPositionError(false);
      if (reporterPositionInputRef.current) {
        reporterPositionInputRef.current.setCustomValidity('');
      }
    }
  }, [formData.reporterPosition]);

  useEffect(() => {
    if (formData.phoneNumber && formData.phoneNumber.trim().length > 0) {
      setPhoneNumberError(false);
      if (phoneNumberInputRef.current) {
        phoneNumberInputRef.current.setCustomValidity('');
      }
    }
  }, [formData.phoneNumber]);

  useEffect(() => {
    if (formData.queueAppointment > 0) {
      setQueueAppointmentError(false);
      if (queueInputRef.current) {
        queueInputRef.current.setCustomValidity('');
      }
    }
  }, [formData.queueAppointment]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isNameMissing = !formData.reporterName || !formData.reporterName.trim();
    const isPositionMissing = !formData.reporterPosition || !formData.reporterPosition.trim();
    const isPhoneMissing = !formData.phoneNumber || !formData.phoneNumber.trim();
    const isQueueMissing = !formData.queueAppointment || formData.queueAppointment <= 0;

    if (isNameMissing || isPositionMissing || isPhoneMissing || isQueueMissing) {
      if (isNameMissing) setReporterNameError(true);
      if (isPositionMissing) setReporterPositionError(true);
      if (isPhoneMissing) setPhoneNumberError(true);
      if (isQueueMissing) setQueueAppointmentError(true);

      const firstInvalidRef = isNameMissing
        ? reporterNameInputRef.current
        : isPositionMissing
        ? reporterPositionInputRef.current
        : isPhoneMissing
        ? phoneNumberInputRef.current
        : queueInputRef.current;

      if (firstInvalidRef) {
        firstInvalidRef.focus();
        firstInvalidRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setReporterNameError(false);
    setReporterPositionError(false);
    setPhoneNumberError(false);
    setQueueAppointmentError(false);
    const now = new Date();
    const finalReport: DOEReport = {
      ...formData,
      reporterName: formData.reporterName.trim(),
      reporterPosition: formData.reporterPosition.trim(),
      phoneNumber: formData.phoneNumber.trim(),
      id: initialReport?.id || `report-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      createdAt: initialReport?.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
    };
    onSave(finalReport);
    setJustSaved(true);
    setLastSavedMeta({
      officeName: finalReport.officeName,
      timeStr: now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      totalCards: finalReport.cardsIssued,
    });
    setTimeout(() => {
      setJustSaved(false);
    }, 4000);
  };

  const handleClearForm = () => {
    setReporterNameError(false);
    setReporterPositionError(false);
    setPhoneNumberError(false);
    setQueueAppointmentError(false);
    if (reporterNameInputRef.current) reporterNameInputRef.current.setCustomValidity('');
    if (reporterPositionInputRef.current) reporterPositionInputRef.current.setCustomValidity('');
    if (phoneNumberInputRef.current) phoneNumberInputRef.current.setCustomValidity('');
    if (queueInputRef.current) {
      queueInputRef.current.setCustomValidity('');
    }
    const targetOffice =
      officeList.find((o) => o.id === selectedOfficeId) || officeList[0];
    const resetData: Omit<DOEReport, 'id' | 'createdAt' | 'updatedAt'> = {
      reportDate: formData.reportDate,
      reportDateThaiStr: formData.reportDateThaiStr,
      officeId: targetOffice.id,
      officeName: targetOffice.name,
      officeNameEn: targetOffice.nameEn,
      centerName: targetOffice.centerName,
      region: targetOffice.region,
      reporterName: '',
      reporterPosition: '',
      phoneNumber: '',
      lineId: '',
      section59: 0,
      section62: 0,
      section63_1: 0,
      section63_2: 0,
      section64: 0,
      modifyDetails: 0,
      substituteCard: 0,
      queueAppointment: 0,
      cardsIssued: 0,
      identityVerified: 0,
      cardsNotIssued: 0,
      missedAppointment: 0,
      wrongAppointmentDate: 0,
      cumulativeCardsIssued: 0,
      cumulativeSinceDate: '13 ตุลาคม 2568',
      customCategoryValues: {},
      notes: '',
    };
    setFormData(resetData);
    triggerPreview(resetData);
    if (onClearForm) {
      onClearForm();
    }
  };

  const [selectedRegionFilter, setSelectedRegionFilter] = useState('ทั้งหมด');

  // Filtered offices list for search and region
  const filteredOffices = useMemo(() => {
    return officeList.filter((o) => {
      const matchRegion =
        selectedRegionFilter === 'ทั้งหมด' || o.region === selectedRegionFilter;
      const q = officeSearch.toLowerCase().trim();
      const matchSearch =
        !q ||
        o.name.toLowerCase().includes(q) ||
        (o.centerName && o.centerName.toLowerCase().includes(q)) ||
        o.nameEn.toLowerCase().includes(q) ||
        o.region.toLowerCase().includes(q);
      return matchRegion && matchSearch;
    });
  }, [officeList, officeSearch, selectedRegionFilter]);

  // Check if current selected office is within the filtered list
  const isSelectedInFiltered = useMemo(() => {
    return filteredOffices.some((o) => o.id === selectedOfficeId);
  }, [filteredOffices, selectedOfficeId]);

  // Group and sort filtered offices by standard region
  const groupedFilteredOffices = useMemo(() => {
    return groupAndSortOfficesByRegion(filteredOffices);
  }, [filteredOffices]);

  const stepCustomCategory = (catId: string, delta: number) => {
    const current = (formData.customCategoryValues && formData.customCategoryValues[catId]) || 0;
    handleCustomCategoryChange(catId, Math.max(0, current + delta));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* SECTION 1: ข้อมูลผู้รายงาน และสำนักงานจัดหางานทั่วประเทศ */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100 text-blue-900 font-bold text-base">
          <Building2 className="w-5 h-5 text-blue-600" />
          <span>1. ข้อมูลผู้รายงาน และสำนักงานจัดหางาน (ครอบคลุมทั่วประเทศ)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* สำนักงานจัดหางาน และศูนย์บริการ */}
          <div className="md:col-span-2">
            <label htmlFor={searchInputId} className="block text-sm font-bold text-slate-800 mb-1.5 flex items-center justify-between flex-wrap gap-1">
              <span>สำนักงานจัดหางาน และศูนย์บริการ (เรียงตามภูมิภาค) <span className="text-rose-500">*</span></span>
              <span className="text-xs text-sky-700 font-normal">
                พบ {filteredOffices.length} แห่ง ({groupedFilteredOffices.length} ภูมิภาค)
              </span>
            </label>
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2 relative">
                  <div className="relative">
                    <input
                      id={searchInputId}
                      type="text"
                      placeholder="พิมพ์ค้นหาจังหวัด, ศูนย์, หรือพื้นที่... เช่น เชียงราย, ชลบุรี, กทม.พื้นที่ 5"
                      value={officeSearch}
                      onChange={(e) => setOfficeSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (filteredOffices.length > 0) {
                            handleOfficeChange(filteredOffices[0].id);
                          }
                        }
                      }}
                      className="w-full min-w-0 text-sm pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-medium"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    {officeSearch && (
                      <button
                        type="button"
                        onClick={() => setOfficeSearch('')}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 p-0.5 rounded-full hover:bg-slate-200 transition-colors cursor-pointer"
                        title="ล้างคำค้นหา"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <select
                    value={selectedRegionFilter}
                    onChange={(e) => setSelectedRegionFilter(e.target.value)}
                    aria-label="กรองตามภูมิภาค"
                    className="w-full text-sm px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-semibold text-slate-700"
                  >
                    <option value="ทั้งหมด">🌐 ทุกภูมิภาค</option>
                    <option value="กรุงเทพมหานคร">🏛️ กรุงเทพมหานคร</option>
                    <option value="ภาคกลางและตะวันตก">🌾 ภาคกลางและตะวันตก</option>
                    <option value="ภาคตะวันออก">🌊 ภาคตะวันออก</option>
                    <option value="ภาคตะวันออกเฉียงเหนือ">☀️ ภาคตะวันออกเฉียงเหนือ</option>
                    <option value="ภาคเหนือ">⛰️ ภาคเหนือ</option>
                    <option value="ภาคใต้">🏝️ ภาคใต้</option>
                    <option value="เฉพาะกิจ">🚚 เฉพาะกิจ</option>
                  </select>
                </div>
              </div>

              {/* Instant Search Results Suggestions Panel */}
              {officeSearch.trim() && (
                <div className="bg-sky-50/80 border border-sky-200 rounded-xl p-2.5 space-y-1.5 shadow-xs">
                  <div className="flex items-center justify-between px-1 text-[11px] font-bold text-sky-900">
                    <span className="flex items-center gap-1.5">
                      <Search className="w-3.5 h-3.5 text-sky-600" />
                      <span>ผลการค้นพบตรง ({filteredOffices.length} แห่ง) - คลิกเลือกได้ทันที:</span>
                    </span>
                    {filteredOffices.length === 1 && (
                      <span className="text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md text-[10px] flex items-center gap-1 font-semibold">
                        <Check className="w-3 h-3 text-emerald-600" />
                        เลือกศูนย์นี้อัตโนมัติแล้ว
                      </span>
                    )}
                  </div>
                  {filteredOffices.length === 0 ? (
                    <div className="p-3 text-center text-slate-500 text-xs bg-white rounded-lg border border-dashed border-slate-300">
                      ไม่พบสำนักงานหรือชื่อศูนย์ที่ตรงกับคำค้นหา "{officeSearch}"
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1 pr-0.5">
                      {filteredOffices.slice(0, 8).map((office) => {
                        const isSelected = office.id === selectedOfficeId;
                        return (
                          <button
                            key={office.id}
                            type="button"
                            onClick={() => {
                              handleOfficeChange(office.id);
                            }}
                            className={`w-full text-left p-2 rounded-lg transition-all flex items-center justify-between gap-2.5 cursor-pointer border ${
                              isSelected
                                ? 'bg-sky-600 text-white font-bold border-sky-700 shadow-xs'
                                : 'bg-white hover:bg-sky-100/70 text-slate-800 border-slate-200'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-semibold flex items-center gap-1.5">
                                <Building2 className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-sky-600'}`} />
                                <span>{office.name}</span>
                              </div>
                              {office.centerName && (
                                <div
                                  className={`truncate text-[11px] mt-0.5 flex items-center gap-1 font-medium ${
                                    isSelected ? 'text-sky-100' : 'text-blue-700'
                                  }`}
                                  title={office.centerName}
                                >
                                  <MapPin className={`w-3 h-3 shrink-0 ${isSelected ? 'text-sky-200' : 'text-amber-600'}`} />
                                  <span>{office.centerName}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                                  isSelected
                                    ? 'bg-sky-700 text-white'
                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}
                              >
                                {office.region}
                              </span>
                              {isSelected && <Check className="w-4 h-4 text-white" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Select Dropdown */}
              <select
                value={isSelectedInFiltered ? selectedOfficeId : ''}
                onChange={(e) => handleOfficeChange(e.target.value)}
                aria-label="เลือกสำนักงานจัดหางานและศูนย์บริการ"
                className="w-full min-w-0 text-sm sm:text-base px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-semibold text-slate-900 shadow-2xs"
              >
                {!isSelectedInFiltered && (
                  <option value="" disabled>
                    -- กรุณาคลิกเลือกสำนักงาน / ศูนย์บริการที่ค้นพบ ({filteredOffices.length} แห่ง) --
                  </option>
                )}
                {groupedFilteredOffices.map((group) => (
                  <optgroup key={group.region} label={group.regionLabel}>
                    {group.offices.map((office) => (
                      <option key={office.id} value={office.id}>
                        {office.name} {office.centerName ? `• ${office.centerName}` : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          {/* วันที่รายงาน */}
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-1">
              วันที่รายงานผล <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                value={formData.reportDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full min-w-0 text-sm px-3.5 py-2 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-medium"
              />
            </div>
            <div className="text-xs text-sky-700 font-semibold mt-1 truncate">
              {formData.reportDateThaiStr}
            </div>
          </div>

          {/* ชื่อศูนย์บริการประจำสำนักงาน หรือ หน่วยบริการเคลื่อนที่ (Mobile Unit) */}
          <div className="space-y-2 md:col-span-2">
            <label className="block text-sm font-bold text-slate-800 flex items-center justify-between flex-wrap gap-2">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-sky-700" />
                <span>สำนักงานและชื่อศูนย์บริการทางการที่แสดงในรายงาน</span>
              </span>
              <span
                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 border ${
                  isMobileCenter
                    ? 'text-amber-900 bg-amber-50 border-amber-300'
                    : 'text-emerald-800 bg-emerald-50 border-emerald-200'
                }`}
              >
                {isMobileCenter ? (
                  <>
                    <Truck className="w-3.5 h-3.5 text-amber-600" />
                    <span>โหมดหน่วยบริการเคลื่อนที่ (Mobile Unit)</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>เชื่อมโยงตรงตามสำนักงานที่เลือกอัตโนมัติ</span>
                  </>
                )}
              </span>
            </label>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
              {/* ข้อมูลสำนักงานที่เลือก */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10.5px] text-slate-500 font-semibold block">
                      สำนักงานจัดหางานผู้รายงาน:
                    </span>
                    <span className="font-extrabold text-slate-900 text-xs sm:text-sm truncate block" title={formData.officeName}>
                      {formData.officeName || 'สำนักงานจัดหางาน'}
                    </span>
                  </div>
                </div>
                <span className="text-[11px] text-slate-700 bg-white border border-slate-200 px-2.5 py-1 rounded-md font-semibold shrink-0">
                  {formData.region}
                </span>
              </div>

              {/* ตัวเลือกประเภทศูนย์บริการ: ศูนย์ประจำสำนักงาน vs หน่วยบริการเคลื่อนที่ (Mobile Unit) */}
              <div className="pt-2.5 border-t border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-slate-700">
                    เลือกรูปแบบศูนย์บริการที่แสดงในรายงานและโปสเตอร์:
                  </span>
                  <span className="text-[10.5px] text-slate-500">
                    คลิกสลับระหว่างศูนย์บริการประจำสำนักงาน หรือ Mobile Unit ได้ทันที
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* ปุ่มเลือกที่ 1: ศูนย์บริการประจำสำนักงาน */}
                  <button
                    type="button"
                    onClick={() => handleCenterTypeChange('standard')}
                    className={`text-left p-2.5 rounded-xl border transition-all flex items-start gap-2.5 cursor-pointer ${
                      !isMobileCenter
                        ? 'bg-white border-sky-500 ring-2 ring-sky-500/20 shadow-xs'
                        : 'bg-white/70 hover:bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        !isMobileCenter
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`text-xs font-extrabold ${
                            !isMobileCenter ? 'text-sky-950' : 'text-slate-700'
                          }`}
                        >
                          ศูนย์บริการประจำสำนักงาน
                        </span>
                        {!isMobileCenter && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 shrink-0">
                            กำลังใช้งาน
                          </span>
                        )}
                      </div>
                      <span
                        className="text-[11px] text-slate-500 truncate block mt-0.5"
                        title={standardOfficeCenterName}
                      >
                        {standardOfficeCenterName}
                      </span>
                    </div>
                  </button>

                  {/* ปุ่มเลือกที่ 2: หน่วยบริการใบอนุญาตทำงานของคนต่างด้าวแบบเคลื่อนที่ (Mobile Unit) */}
                  <button
                    type="button"
                    onClick={() => handleCenterTypeChange('mobile')}
                    className={`text-left p-2.5 rounded-xl border transition-all flex items-start gap-2.5 cursor-pointer ${
                      isMobileCenter
                        ? 'bg-amber-50/70 border-amber-500 ring-2 ring-amber-500/25 shadow-xs'
                        : 'bg-white/70 hover:bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        isMobileCenter
                          ? 'bg-amber-500 text-white'
                          : 'bg-amber-100/70 text-amber-700'
                      }`}
                    >
                      <Truck className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`text-xs font-extrabold ${
                            isMobileCenter ? 'text-amber-950' : 'text-slate-800'
                          }`}
                        >
                          หน่วยบริการเคลื่อนที่ (Mobile Unit)
                        </span>
                        {isMobileCenter && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-950 shrink-0">
                            กำลังใช้งาน
                          </span>
                        )}
                      </div>
                      <span
                        className="text-[11px] text-slate-500 truncate block mt-0.5"
                        title={MOBILE_UNIT_CENTER_NAME}
                      >
                        {MOBILE_UNIT_CENTER_NAME}
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              {/* แสดงผลชื่อศูนย์บริการที่จะปรากฏบนหัวเรื่องรายงานและโปสเตอร์ + ปุ่มจัดการชื่อศูนย์สำหรับ Admin */}
              <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2.5 min-w-0">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isMobileCenter
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {isMobileCenter ? <Truck className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10.5px] text-slate-500 font-semibold block">
                      ชื่อศูนย์บริการที่แสดงในหัวเรื่องรายงานและโปสเตอร์:
                    </span>
                    <span className="font-extrabold text-blue-900 text-xs sm:text-sm truncate block font-['Prompt']" title={formData.centerName}>
                      {formData.centerName || 'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenAdminCenterPanel('add')}
                    className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                    title="เพิ่มชื่อศูนย์บริการใหม่เข้าสู่ระบบ (สิทธิ์ Admin)"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>เพิ่มศูนย์บริการใหม่ (Admin)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenAdminCenterPanel('edit')}
                    className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                    title="แก้ไขชื่อศูนย์บริการของสำนักงานนี้ (สิทธิ์ Admin)"
                  >
                    <Settings className="w-3.5 h-3.5 text-sky-600" />
                    <span>แก้ไขชื่อศูนย์นี้ (Admin)</span>
                  </button>
                </div>
              </div>

              {/* แผงจัดการเพิ่ม/แก้ไขชื่อศูนย์บริการด่วนสำหรับ Admin */}
              {showAdminCenterPanel && (
                <div className="mt-2 p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-300 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-700" />
                      <span className="font-bold text-xs text-emerald-950">
                        {adminCenterMode === 'add'
                          ? 'เพิ่มชื่อศูนย์บริการใหม่เข้าสู่ระบบ (บันทึกและเลือกใช้งานทันที)'
                          : `แก้ไขชื่อศูนย์บริการของ: ${currentSelectedOffice?.name || formData.officeName}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {onNavigateAdmin && (
                        <button
                          type="button"
                          onClick={() => onNavigateAdmin('offices')}
                          className="text-[11px] font-semibold text-emerald-800 hover:underline px-2 py-0.5 cursor-pointer"
                        >
                          เปิดหน้าจัดการศูนย์ทั้งหมด →
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowAdminCenterPanel(false)}
                        className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-white/60 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {adminCenterMode === 'add' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-bold text-slate-800 mb-1">
                          ชื่อศูนย์บริการใหม่ (แสดงในรายงานและโปสเตอร์) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={newCenterNameInput}
                          onChange={(e) => setNewCenterNameInput(e.target.value)}
                          placeholder="เช่น ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว (ขาเข้า) จังหวัดสมุทรสาคร"
                          className="w-full text-xs px-3 py-2 bg-white border border-emerald-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-medium"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          ชื่อสำนักงานจัดหางานต้นสังกัด
                        </label>
                        <input
                          type="text"
                          value={newCenterOfficeNameInput}
                          onChange={(e) => setNewCenterOfficeNameInput(e.target.value)}
                          placeholder="เช่น สำนักงานจัดหางานจังหวัดสมุทรสาคร"
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          ภูมิภาค / ประเภทศูนย์
                        </label>
                        <select
                          value={newCenterRegionInput || 'ภาคกลางและตะวันตก'}
                          onChange={(e) => setNewCenterRegionInput(e.target.value)}
                          className="w-full text-xs px-2.5 py-2 bg-white border border-slate-300 rounded-lg font-medium"
                        >
                          <option value="กรุงเทพมหานคร">กรุงเทพมหานคร</option>
                          <option value="ภาคกลางและตะวันตก">ภาคกลางและตะวันตก</option>
                          <option value="ภาคตะวันออก">ภาคตะวันออก</option>
                          <option value="ภาคตะวันออกเฉียงเหนือ">ภาคตะวันออกเฉียงเหนือ</option>
                          <option value="ภาคเหนือ">ภาคเหนือ</option>
                          <option value="ภาคใต้">ภาคใต้</option>
                          <option value="เฉพาะกิจ">เฉพาะกิจ</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-bold text-slate-800 mb-1">
                          ชื่อศูนย์บริการที่แสดงในรายงานและโปสเตอร์ <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={editCenterNameInput}
                          onChange={(e) => setEditCenterNameInput(e.target.value)}
                          placeholder="ระบุชื่อศูนย์บริการ..."
                          className="w-full text-xs px-3 py-2 bg-white border border-emerald-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-medium"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          ชื่อสำนักงานจัดหางานต้นสังกัด
                        </label>
                        <input
                          type="text"
                          value={newCenterOfficeNameInput}
                          onChange={(e) => setNewCenterOfficeNameInput(e.target.value)}
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAdminCenterPanel(false)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAdminCenter}
                      className="text-xs px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>
                        {adminCenterMode === 'add'
                          ? 'บันทึกและเลือกศูนย์บริการนี้ทันที'
                          : 'บันทึกการแก้ไขชื่อศูนย์'}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ชื่อผู้รายงาน */}
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-1 flex items-center justify-between gap-2">
              <span>
                ชื่อผู้รายงาน <span className="text-rose-600 font-black">*</span>
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-md font-['Prompt'] shrink-0 ${
                  formData.reporterName && formData.reporterName.trim().length > 0
                    ? 'bg-emerald-600 text-white'
                    : 'bg-rose-600 text-white'
                }`}
              >
                {formData.reporterName && formData.reporterName.trim().length > 0 ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-100" />
                    <span>กรอกแล้ว</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3 text-rose-100" />
                    <span>ต้องกรอก *</span>
                  </>
                )}
              </span>
            </label>
            <div className="relative">
              <input
                ref={reporterNameInputRef}
                type="text"
                value={formData.reporterName}
                onInvalid={(e) => {
                  setReporterNameError(true);
                  (e.target as HTMLInputElement).setCustomValidity(
                    'กรุณากรอกชื่อผู้รายงานก่อนบันทึกรายงาน (ห้ามเว้นว่าง)'
                  );
                }}
                onInput={(e) => {
                  (e.target as HTMLInputElement).setCustomValidity('');
                }}
                onChange={(e) => {
                  const updated = { ...formData, reporterName: e.target.value };
                  setFormData(updated);
                  triggerPreview(updated);
                }}
                className={`w-full min-w-0 text-sm px-3.5 py-2 pl-9 bg-white rounded-lg focus:outline-hidden focus:ring-2 font-medium transition-all ${
                  reporterNameError
                    ? 'border-2 border-rose-500 ring-2 ring-rose-500/20 focus:ring-rose-500 bg-rose-50/40'
                    : !formData.reporterName || !formData.reporterName.trim()
                    ? 'border-2 border-amber-400 focus:ring-amber-500 bg-amber-50/20'
                    : 'border-2 border-teal-500 focus:ring-teal-500'
                }`}
                placeholder="ระบุชื่อ-นามสกุลผู้รายงาน (จำเป็นต้องกรอก) *"
                required
              />
              <User
                className={`w-4 h-4 absolute left-3 top-2.5 ${
                  reporterNameError
                    ? 'text-rose-500'
                    : formData.reporterName && formData.reporterName.trim().length > 0
                    ? 'text-teal-600'
                    : 'text-amber-600'
                }`}
              />
            </div>
            {reporterNameError && (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-rose-600">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>กรุณากรอกชื่อผู้รายงานก่อนบันทึกรายงาน (ห้ามเว้นว่าง)</span>
              </p>
            )}
          </div>

          {/* ตำแหน่ง */}
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-1 flex items-center justify-between gap-2">
              <span>
                ตำแหน่งผู้รายงาน <span className="text-rose-600 font-black">*</span>
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-md font-['Prompt'] shrink-0 ${
                  formData.reporterPosition && formData.reporterPosition.trim().length > 0
                    ? 'bg-emerald-600 text-white'
                    : 'bg-rose-600 text-white'
                }`}
              >
                {formData.reporterPosition && formData.reporterPosition.trim().length > 0 ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-100" />
                    <span>กรอกแล้ว</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3 text-rose-100" />
                    <span>ต้องกรอก *</span>
                  </>
                )}
              </span>
            </label>
            <div className="relative">
              <input
                ref={reporterPositionInputRef}
                type="text"
                value={formData.reporterPosition}
                onInvalid={(e) => {
                  setReporterPositionError(true);
                  (e.target as HTMLInputElement).setCustomValidity(
                    'กรุณากรอกตำแหน่งผู้รายงานก่อนบันทึกรายงาน (ห้ามเว้นว่าง)'
                  );
                }}
                onInput={(e) => {
                  (e.target as HTMLInputElement).setCustomValidity('');
                }}
                onChange={(e) => {
                  const updated = { ...formData, reporterPosition: e.target.value };
                  setFormData(updated);
                  triggerPreview(updated);
                }}
                className={`w-full min-w-0 text-sm px-3.5 py-2 pl-9 bg-white rounded-lg focus:outline-hidden focus:ring-2 font-medium transition-all ${
                  reporterPositionError
                    ? 'border-2 border-rose-500 ring-2 ring-rose-500/20 focus:ring-rose-500 bg-rose-50/40'
                    : !formData.reporterPosition || !formData.reporterPosition.trim()
                    ? 'border-2 border-amber-400 focus:ring-amber-500 bg-amber-50/20'
                    : 'border-2 border-teal-500 focus:ring-teal-500'
                }`}
                placeholder="ระบุตำแหน่งผู้รายงาน เช่น นักวิชาการแรงงานชำนาญการ *"
                required
              />
              <Briefcase
                className={`w-4 h-4 absolute left-3 top-2.5 ${
                  reporterPositionError
                    ? 'text-rose-500'
                    : formData.reporterPosition && formData.reporterPosition.trim().length > 0
                    ? 'text-teal-600'
                    : 'text-amber-600'
                }`}
              />
            </div>
            {reporterPositionError && (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-rose-600">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>กรุณากรอกตำแหน่งผู้รายงานก่อนบันทึกรายงาน (ห้ามเว้นว่าง)</span>
              </p>
            )}
          </div>

          {/* เบอร์โทรศัพท์ */}
          <div className="md:col-span-2">
            <label className="block text-sm font-bold text-slate-800 mb-1 flex items-center justify-between gap-2">
              <span>
                เบอร์โทรศัพท์ <span className="text-rose-600 font-black">*</span>
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-md font-['Prompt'] shrink-0 ${
                  formData.phoneNumber && formData.phoneNumber.trim().length > 0
                    ? 'bg-emerald-600 text-white'
                    : 'bg-rose-600 text-white'
                }`}
              >
                {formData.phoneNumber && formData.phoneNumber.trim().length > 0 ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-100" />
                    <span>กรอกแล้ว</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3 text-rose-100" />
                    <span>ต้องกรอก *</span>
                  </>
                )}
              </span>
            </label>
            <div className="relative">
              <input
                ref={phoneNumberInputRef}
                type="text"
                value={formData.phoneNumber}
                onInvalid={(e) => {
                  setPhoneNumberError(true);
                  (e.target as HTMLInputElement).setCustomValidity(
                    'กรุณากรอกเบอร์โทรศัพท์ก่อนบันทึกรายงาน (ห้ามเว้นว่าง)'
                  );
                }}
                onInput={(e) => {
                  (e.target as HTMLInputElement).setCustomValidity('');
                }}
                onChange={(e) => {
                  const updated = { ...formData, phoneNumber: e.target.value };
                  setFormData(updated);
                  triggerPreview(updated);
                }}
                className={`w-full min-w-0 text-sm px-3.5 py-2 pl-9 bg-white rounded-lg focus:outline-hidden focus:ring-2 font-medium transition-all ${
                  phoneNumberError
                    ? 'border-2 border-rose-500 ring-2 ring-rose-500/20 focus:ring-rose-500 bg-rose-50/40'
                    : !formData.phoneNumber || !formData.phoneNumber.trim()
                    ? 'border-2 border-amber-400 focus:ring-amber-500 bg-amber-50/20'
                    : 'border-2 border-teal-500 focus:ring-teal-500'
                }`}
                placeholder="ระบุเบอร์โทรศัพท์ติดต่อ เช่น 053-152054, 098-7466630 *"
                required
              />
              <Phone
                className={`w-4 h-4 absolute left-3 top-2.5 ${
                  phoneNumberError
                    ? 'text-rose-500'
                    : formData.phoneNumber && formData.phoneNumber.trim().length > 0
                    ? 'text-teal-600'
                    : 'text-amber-600'
                }`}
              />
            </div>
            {phoneNumberError && (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-rose-600">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>กรุณากรอกเบอร์โทรศัพท์ก่อนบันทึกรายงาน (ห้ามเว้นว่าง)</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: การออกบัตรใบอนุญาตทำงาน (จำแนกตามกลุ่มเป้าหมายที่กำหนดในระบบ) */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-sky-900 font-bold text-base">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
            <span>2. การออกบัตรใบอนุญาตทำงาน (จำแนกตาม {activeCategories.length} กลุ่มเป้าหมาย)</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-xs bg-sky-100 text-sky-800 font-bold px-3 py-1 rounded-full">
              รวมออกบัตรแยกกลุ่ม: {formatNumber(totalSections)} คน
            </div>
            <button
              type="button"
              onClick={() =>
                requireAdmin('เพิ่มหัวข้อกลุ่มเป้าหมายใหม่', () =>
                  setShowAdminCategoryPanel((prev) => !prev)
                )
              }
              className="text-xs bg-sky-700 hover:bg-sky-800 text-white font-bold px-2.5 py-1 rounded-md shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
              title="เพิ่มหัวข้อกลุ่มเป้าหมายหรือมาตราอื่นๆ เพิ่มเติมทันที (สิทธิ์ Admin)"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>เพิ่มหัวข้ออื่นๆ (Admin)</span>
            </button>
            {onNavigateAdmin && (
              <button
                type="button"
                onClick={() => onNavigateAdmin('sections')}
                className="text-xs bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold px-2.5 py-1 rounded-md shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                title="จัดการหัวข้อกลุ่มเป้าหมายทั้งหมดในหน้า Admin"
              >
                <Settings className="w-3 h-3 text-sky-700" />
                <span>ตั้งค่าหัวข้อ</span>
              </button>
            )}
          </div>
        </div>

        {/* แผงเพิ่มหัวข้อกลุ่มเป้าหมายด่วนสำหรับ Admin ในส่วนที่ 2 */}
        {showAdminCategoryPanel && (
          <div className="p-3.5 rounded-xl bg-sky-50/80 border border-sky-300 space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-sky-950">
                <Plus className="w-4 h-4 text-sky-600" />
                <span>เพิ่มหัวข้อกลุ่มเป้าหมาย / มาตราอื่นๆ เพิ่มเติม (แสดงในแบบฟอร์มและโปสเตอร์ทันที)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAdminCategoryPanel(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-white/60 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-1">
                  ชื่อหัวข้อกลุ่มเป้าหมาย <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCatTitleInput}
                  onChange={(e) => setNewCatTitleInput(e.target.value)}
                  placeholder="เช่น กลุ่มแรงงานพิเศษ / อื่นๆ"
                  className="w-full text-xs px-3 py-2 bg-white border border-sky-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-medium"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  คำอธิบายย่อย (ไม่บังคับ)
                </label>
                <input
                  type="text"
                  value={newCatSubLabelInput}
                  onChange={(e) => setNewCatSubLabelInput(e.target.value)}
                  placeholder="เช่น รายละเอียดเพิ่มเติมของกลุ่ม"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  รหัสย่อ (ไม่บังคับ)
                </label>
                <input
                  type="text"
                  value={newCatCodeInput}
                  onChange={(e) => setNewCatCodeInput(e.target.value)}
                  placeholder="เช่น อื่นๆ (เว้นว่างได้)"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAdminCategoryPanel(false)}
                className="text-xs px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleQuickAddCategory}
                className="text-xs px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>บันทึกเพิ่มหัวข้อนี้ทันที</span>
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {activeCategories.map((cat, idx) => {
            let val = 0;
            let onValChange = (v: number) => {};
            let onStepChange = (d: number) => {};

            if (cat.id === 'section59') {
              val = formData.section59;
              onValChange = (v) => handleCategoryNumberChange('section59', v);
              onStepChange = (d) => stepCategoryNumber('section59', d);
            } else if (cat.id === 'section62') {
              val = formData.section62;
              onValChange = (v) => handleCategoryNumberChange('section62', v);
              onStepChange = (d) => stepCategoryNumber('section62', d);
            } else if (cat.id === 'section63_1') {
              val = formData.section63_1;
              onValChange = (v) => handleCategoryNumberChange('section63_1', v);
              onStepChange = (d) => stepCategoryNumber('section63_1', d);
            } else if (cat.id === 'section63_2') {
              val = formData.section63_2;
              onValChange = (v) => handleCategoryNumberChange('section63_2', v);
              onStepChange = (d) => stepCategoryNumber('section63_2', d);
            } else if (cat.id === 'section64') {
              val = formData.section64;
              onValChange = (v) => handleCategoryNumberChange('section64', v);
              onStepChange = (d) => stepCategoryNumber('section64', d);
            } else if (cat.id === 'mouGroup') {
              val = formData.mouGroup || 0;
              onValChange = (v) => handleCategoryNumberChange('mouGroup', v);
              onStepChange = (d) => stepCategoryNumber('mouGroup', d);
            } else if (cat.id === 'modifyDetails') {
              val = formData.modifyDetails;
              onValChange = (v) => handleCategoryNumberChange('modifyDetails', v);
              onStepChange = (d) => stepCategoryNumber('modifyDetails', d);
            } else if (cat.id === 'substituteCard') {
              val = formData.substituteCard;
              onValChange = (v) => handleCategoryNumberChange('substituteCard', v);
              onStepChange = (d) => stepCategoryNumber('substituteCard', d);
            } else {
              // Custom category
              val = (formData.customCategoryValues && formData.customCategoryValues[cat.id]) || 0;
              onValChange = (v) => handleCustomCategoryChange(cat.id, v);
              onStepChange = (d) => stepCustomCategory(cat.id, d);
            }

            return (
              <NumberInputField
                key={cat.id}
                label={`${idx + 1}. ${cat.title} (คน)`}
                subLabel={cat.subLabel || cat.code}
                value={val}
                onChange={onValChange}
                onStep={onStepChange}
                highlight={val > 0}
                primary={cat.id === 'section63_2' || cat.id === 'mouGroup'}
                isHot={idx === 0}
              />
            );
          })}
        </div>
      </div>

      {/* SECTION 3: สถานะคิวและการให้บริการประจำวัน */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-teal-900 font-bold text-base">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
            <span>3. สถานะคิวและการให้บริการประจำวัน ({activeQueueMetrics.length} หัวข้อ)</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-bold bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>ยอดออกบัตร ({formatNumber(formData.cardsIssued)} ใบ) คำนวณจากตัวเลขตามจริง {activeCategories.length} กลุ่ม</span>
            </div>
            <button
              type="button"
              onClick={() =>
                requireAdmin('เพิ่มหัวข้อสถานะคิวและการให้บริการใหม่', () =>
                  setShowAdminQueuePanel((prev) => !prev)
                )
              }
              className="text-xs bg-teal-700 hover:bg-teal-800 text-white font-bold px-2.5 py-1 rounded-md shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
              title="เพิ่มหัวข้อสถานะคิวหรือบริการอื่นๆ เพิ่มเติมทันที (สิทธิ์ Admin)"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>เพิ่มหัวข้อคิว/บริการ (Admin)</span>
            </button>
            {onNavigateAdmin && (
              <button
                type="button"
                onClick={() => onNavigateAdmin('queue_metrics')}
                className="text-xs bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold px-2.5 py-1 rounded-md shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                title="จัดการ เพิ่ม ลบ หรือแก้ไขหัวข้อคิวและบริการในหน้า Admin"
              >
                <Settings className="w-3 h-3 text-teal-700" />
                <span>ตั้งค่าหัวข้อ</span>
              </button>
            )}
          </div>
        </div>

        {/* แผงเพิ่มหัวข้อสถานะคิวด่วนสำหรับ Admin ในส่วนที่ 3 */}
        {showAdminQueuePanel && (
          <div className="p-3.5 rounded-xl bg-teal-50/80 border border-teal-300 space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-teal-950">
                <Plus className="w-4 h-4 text-teal-600" />
                <span>เพิ่มหัวข้อสถานะคิวและการให้บริการประจำวัน (แสดงในแบบฟอร์มและโปสเตอร์ทันที)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAdminQueuePanel(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-white/60 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-1">
                  ชื่อหัวข้อสถานะคิว/บริการ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newQueueTitleInput}
                  onChange={(e) => setNewQueueTitleInput(e.target.value)}
                  placeholder="เช่น คิว Walk-in / ให้คำปรึกษา"
                  className="w-full text-xs px-3 py-2 bg-white border border-teal-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-medium"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  หน่วยนับ
                </label>
                <input
                  type="text"
                  value={newQueueUnitInput}
                  onChange={(e) => setNewQueueUnitInput(e.target.value)}
                  placeholder="เช่น คน, คิว, ใบ, ราย"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  คำอธิบายย่อย (ไม่บังคับ)
                </label>
                <input
                  type="text"
                  value={newQueueSubLabelInput}
                  onChange={(e) => setNewQueueSubLabelInput(e.target.value)}
                  placeholder="เช่น ผู้มารับบริการเพิ่มเติม"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAdminQueuePanel(false)}
                className="text-xs px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleQuickAddQueueMetric}
                className="text-xs px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>บันทึกเพิ่มหัวข้อคิวทันที</span>
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {activeQueueMetrics.map((metric) => {
            let val = 0;
            let onValChange = (v: number) => {};
            let onStepChange = (d: number) => {};

            if (metric.id === 'queueAppointment') {
              val = formData.queueAppointment;
              onValChange = (v) => handleNumberChange('queueAppointment', v);
              onStepChange = (d) => stepNumber('queueAppointment', d);
            } else if (metric.id === 'cardsIssued') {
              val = formData.cardsIssued;
              onValChange = (v) => handleNumberChange('cardsIssued', v);
              onStepChange = (d) => stepNumber('cardsIssued', d);
            } else if (metric.id === 'identityVerified') {
              val = formData.identityVerified;
              onValChange = (v) => handleNumberChange('identityVerified', v);
              onStepChange = (d) => stepNumber('identityVerified', d);
            } else if (metric.id === 'cardsNotIssued') {
              val = formData.cardsNotIssued;
              onValChange = (v) => handleNumberChange('cardsNotIssued', v);
              onStepChange = (d) => stepNumber('cardsNotIssued', d);
            } else if (metric.id === 'missedAppointment') {
              val = formData.missedAppointment;
              onValChange = (v) => handleNumberChange('missedAppointment', v);
              onStepChange = (d) => stepNumber('missedAppointment', d);
            } else if (metric.id === 'wrongAppointmentDate') {
              val = formData.wrongAppointmentDate;
              onValChange = (v) => handleNumberChange('wrongAppointmentDate', v);
              onStepChange = (d) => stepNumber('wrongAppointmentDate', d);
            } else {
              val = (formData.customQueueValues && formData.customQueueValues[metric.id]) || 0;
              onValChange = (v) => handleCustomQueueChange(metric.id, v);
              onStepChange = (d) => stepCustomQueue(metric.id, d);
            }

            return (
              <NumberInputField
                key={metric.id}
                label={`${metric.title} (${metric.unit})`}
                subLabel={metric.subLabel || ''}
                value={val}
                onChange={onValChange}
                onStep={onStepChange}
                badgeColor={metric.badgeColor || 'text-teal-700 bg-teal-50 border-teal-200'}
                primary={metric.id === 'queueAppointment' || metric.id === 'cardsIssued'}
                isRequired={metric.id === 'queueAppointment'}
                hasError={metric.id === 'queueAppointment' && queueAppointmentError}
                inputRef={metric.id === 'queueAppointment' ? queueInputRef : undefined}
                onInvalidRequired={
                  metric.id === 'queueAppointment'
                    ? () => setQueueAppointmentError(true)
                    : undefined
                }
              />
            );
          })}
        </div>
      </div>

      {/* SECTION 4: หมายเหตุ / บันทึกเพิ่มเติม */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
          <div className="flex items-center gap-2 text-blue-900 font-bold text-base">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
            <span>4. หมายเหตุ / บันทึกเพิ่มเติมประจำวัน</span>
          </div>
          <span className="text-xs text-slate-500">
            ระบุข้อสังเกตหรือข้อมูลเพิ่มเติมของสำนักงาน (บันทึกได้โดยตรง)
          </span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            บันทึกการปฏิบัติงานหรือข้อสังเกตเพิ่มเติม (รายละเอียดที่บันทึกเข้ามา)
          </label>
          <textarea
            rows={3}
            value={formData.notes || ''}
            onChange={(e) => {
              const updated = { ...formData, notes: e.target.value };
              setFormData(updated);
              triggerPreview(updated);
            }}
            className="w-full text-sm px-3 py-2.5 rounded-lg leading-relaxed bg-white border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-slate-800"
            placeholder="ระบุรายละเอียด ข้อสังเกต หรือสรุปสถานการณ์ประจำวัน เช่น การให้บริการเป็นไปด้วยความเรียบร้อย ไม่มีข้อติดขัด"
          />
        </div>
      </div>

      {/* Submit / Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          {lastSavedMeta ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl shadow-2xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                บันทึกล่าสุด: <strong>{lastSavedMeta.officeName}</strong> ({formatNumber(lastSavedMeta.totalCards)} ใบ) • เวลา {lastSavedMeta.timeStr} น.
              </span>
            </span>
          ) : (
            <span className="text-xs text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-sky-600 shrink-0" />
              <span>บันทึกพร้อมซิงก์ฐานข้อมูลออนไลน์ Cloud Firestore และสำรองในเครื่องอัตโนมัติ</span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 ml-auto">
          <button
            type="button"
            onClick={handleClearForm}
            className="px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-sm shadow-xs transition-all flex items-center gap-2 cursor-pointer hover:border-slate-400 active:scale-98"
            title="ล้างข้อมูลตัวเลขและหมายเหตุทั้งหมดเป็น 0"
          >
            <RotateCcw className="w-4 h-4 text-slate-500" />
            <span>ล้างข้อมูล</span>
          </button>

          <button
            type="submit"
            className={`px-6 py-2.5 rounded-xl text-white font-bold text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-98 ${
              justSaved
                ? 'bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-300'
                : 'bg-blue-900 hover:bg-blue-800'
            }`}
          >
            {justSaved ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>บันทึกรายงานสำเร็จแล้ว!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>บันทึกรายงานผลการปฏิบัติงาน</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Admin Authentication Modal */}
      <AdminPinModal
        isOpen={adminModalOpen}
        adminPin={adminPin}
        actionTitle={adminActionTitle}
        description="การแก้ไขชื่อศูนย์บริการ หรือการบันทึกหมายเหตุ/ข้อสังเกตเพิ่มเติม ต้องใช้สิทธิ์ผู้ดูแลระบบ (Admin)"
        onClose={() => {
          setAdminModalOpen(false);
          setPendingAdminAction(null);
        }}
        onSuccess={() => {
          onAdminAuthenticated?.();
          if (pendingAdminAction) {
            pendingAdminAction();
            setPendingAdminAction(null);
          }
        }}
      />
    </form>
  );
};

// Reusable stepper input box for easy data entry
interface NumberInputFieldProps {
  label: string;
  subLabel?: string;
  value: number;
  onChange: (val: number) => void;
  onStep: (delta: number) => void;
  highlight?: boolean;
  primary?: boolean;
  badgeColor?: string;
  isHot?: boolean;
  isRequired?: boolean;
  hasError?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onInvalidRequired?: () => void;
}

const NumberInputField: React.FC<NumberInputFieldProps> = ({
  label,
  subLabel,
  value,
  onChange,
  onStep,
  highlight,
  primary,
  badgeColor,
  isHot,
  isRequired,
  hasError,
  inputRef,
  onInvalidRequired,
}) => {
  return (
    <div
      className={`p-3.5 rounded-xl border transition-all min-w-0 overflow-hidden ${
        hasError
          ? 'bg-rose-50/90 border-2 border-rose-500 ring-4 ring-rose-500/20 shadow-sm'
          : isRequired
          ? value > 0
            ? 'bg-gradient-to-r from-teal-50/90 via-emerald-50/70 to-sky-50/80 border-2 border-teal-500 ring-2 ring-teal-400/25 shadow-xs'
            : 'bg-gradient-to-r from-amber-50/90 via-orange-50/70 to-rose-50/80 border-2 border-amber-500 ring-2 ring-amber-400/30 shadow-xs'
          : isHot
          ? 'bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-sky-50/80 border-blue-400 ring-2 ring-blue-400/30 shadow-xs'
          : primary
          ? 'bg-blue-50/50 border-blue-200'
          : highlight
          ? 'bg-sky-50/30 border-sky-200'
          : 'bg-slate-50/60 border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-start justify-between gap-1.5 mb-2 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <div
              className={`text-sm sm:text-base font-extrabold leading-tight truncate ${
                hasError
                  ? 'text-rose-950'
                  : isRequired
                  ? 'text-teal-950'
                  : isHot
                  ? 'text-blue-950'
                  : 'text-slate-900'
              }`}
            >
              {label}
              {isRequired && <span className="text-rose-600 font-black ml-1">*</span>}
            </div>
            {isRequired && (
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-md font-['Prompt'] shrink-0 shadow-2xs ${
                  value > 0
                    ? 'bg-emerald-600 text-white'
                    : 'bg-rose-600 text-white'
                }`}
              >
                {value > 0 ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-100" />
                    <span>กรอกแล้ว</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3 text-rose-100" />
                    <span>ต้องกรอก *</span>
                  </>
                )}
              </span>
            )}
            {isHot && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-gradient-to-r from-rose-600 via-orange-500 to-amber-500 text-white font-['Prompt'] shrink-0 shadow-2xs tracking-wider">
                <Star className="w-3 h-3 fill-amber-200 text-amber-100" />
                <span>HOT</span>
              </span>
            )}
          </div>
          {subLabel && (
            <div
              className={`text-xs sm:text-sm leading-tight mt-0.5 truncate ${
                hasError
                  ? 'text-rose-800 font-semibold'
                  : isRequired
                  ? 'text-teal-900 font-medium'
                  : isHot
                  ? 'text-blue-800 font-medium'
                  : 'text-slate-500'
              }`}
            >
              {subLabel}
            </div>
          )}
        </div>
        {value > 0 && (
          <span
            className={`text-xs sm:text-sm font-bold px-2.5 py-0.5 rounded-md shrink-0 border ${
              badgeColor || 'text-blue-800 bg-blue-50 border-blue-200'
            }`}
          >
            {formatNumber(value)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 mt-2 min-w-0">
        <button
          type="button"
          onClick={() => onStep(-1)}
          disabled={value <= 0}
          aria-label={`ลด ${label} ลง 1`}
          className="w-9 h-9 shrink-0 rounded-lg bg-white border border-slate-300 text-slate-700 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs cursor-pointer text-sm"
        >
          <Minus className="w-4 h-4" />
        </button>

        <input
          ref={inputRef}
          type="number"
          min={isRequired ? '1' : '0'}
          required={isRequired}
          value={value === 0 ? '' : value}
          onInvalid={(e) => {
            if (isRequired) {
              (e.target as HTMLInputElement).setCustomValidity(
                'กรุณากรอกจำนวนคิวนัดหมายก่อนบันทึกรายงาน'
              );
              onInvalidRequired?.();
            }
          }}
          onInput={(e) => {
            if (isRequired) {
              (e.target as HTMLInputElement).setCustomValidity('');
            }
          }}
          onChange={(e) => {
            const v = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
            onChange(isNaN(v) ? 0 : v);
          }}
          placeholder={isRequired ? 'ระบุคิว *' : '0'}
          className={`min-w-0 flex-1 w-full text-center font-black text-slate-900 bg-white rounded-lg py-1.5 px-1 text-lg focus:outline-hidden focus:ring-2 shadow-2xs font-['Prompt'] ${
            hasError
              ? 'border-2 border-rose-500 focus:ring-rose-500 placeholder:text-rose-500 placeholder:text-sm placeholder:font-bold'
              : isRequired && value <= 0
              ? 'border-2 border-amber-400 focus:ring-amber-500 placeholder:text-rose-500 placeholder:text-sm placeholder:font-bold'
              : 'border border-slate-300 focus:ring-sky-500'
          }`}
        />

        <button
          type="button"
          onClick={() => onStep(1)}
          aria-label={`เพิ่ม ${label} ขึ้น 1`}
          className="w-9 h-9 shrink-0 rounded-lg bg-white border border-slate-300 text-slate-700 flex items-center justify-center hover:bg-slate-100 shadow-2xs cursor-pointer text-sm"
        >
          <Plus className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onStep(10)}
          title="เพิ่ม 10"
          aria-label={`เพิ่ม ${label} ขึ้น 10`}
          className="px-3 h-9 shrink-0 rounded-lg bg-slate-100 border border-slate-200 text-slate-800 flex items-center justify-center hover:bg-slate-200 shadow-2xs cursor-pointer text-xs sm:text-sm font-bold"
        >
          +10
        </button>
      </div>

      {isRequired && value <= 0 && (
        <div
          className={`mt-2 flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg border ${
            hasError
              ? 'bg-rose-100 text-rose-800 border-rose-300'
              : 'bg-amber-100/80 text-amber-900 border-amber-300'
          }`}
        >
          <AlertCircle
            className={`w-3.5 h-3.5 shrink-0 ${
              hasError ? 'text-rose-600' : 'text-amber-700'
            }`}
          />
          <span>
            {hasError
              ? 'กรุณากรอกจำนวนคิวนัดหมายก่อนบันทึกรายงาน (ห้ามเว้นว่าง)'
              : 'จำเป็นต้องกรอกจำนวนคิวนัดหมายประจำวันก่อนบันทึก'}
          </span>
        </div>
      )}
    </div>
  );
};
