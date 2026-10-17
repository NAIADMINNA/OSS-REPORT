import React, { useState, useEffect, useId, useMemo } from 'react';
import { DOEReport, EmploymentOffice, ReportCategory, ReporterProfile } from '../types/doe';
import { EMPLOYMENT_OFFICES } from '../data/offices';
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
} from 'lucide-react';

export const MOBILE_UNIT_CENTER_NAME =
  'หน่วยบริการใบอนุญาตทำงานของคนต่างด้าวแบบเคลื่อนที่ (Mobile Unit)';

interface ReportFormProps {
  initialReport?: DOEReport | null;
  onSave: (report: DOEReport) => void;
  onPreviewLive: (report: DOEReport) => void;
  onClearForm?: () => void;
  offices?: EmploymentOffice[];
  categories?: ReportCategory[];
  reporters?: ReporterProfile[];
  isAdmin?: boolean;
  adminPin?: string;
  onAdminAuthenticated?: () => void;
}

export const ReportForm: React.FC<ReportFormProps> = ({
  initialReport,
  onSave,
  onPreviewLive,
  onClearForm,
  offices,
  categories,
  reporters,
  isAdmin = false,
  adminPin = '0841543524',
  onAdminAuthenticated,
}) => {
  const searchInputId = useId();
  const [officeSearch, setOfficeSearch] = useState('');
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>(
    initialReport?.officeId || EMPLOYMENT_OFFICES[0]?.id || 'bkk_1'
  );

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
      { id: 'modifyDetails', code: 'เปลี่ยนแปลง', title: 'เปลี่ยนแปลงรายการในใบอนุญาตทำงาน', subLabel: 'ย้ายนายจ้าง / เปลี่ยนแปลงสถานที่ทำงาน', isActive: true },
      { id: 'substituteCard', code: 'ใบแทน', title: 'ใบแทนใบอนุญาตทำงาน', subLabel: 'กรณีบัตรชำรุด สูญหาย หรือขอใบแทน', isActive: true },
    ];
  }, [categories]);

  const todayIso = getTodayIsoDate();
  const initialDefaultOffice = EMPLOYMENT_OFFICES[0];

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
    modifyDetails: initialReport?.modifyDetails ?? 0,
    substituteCard: initialReport?.substituteCard ?? 0,
    queueAppointment: initialReport?.queueAppointment ?? 0,
    cardsIssued: initialReport?.cardsIssued ?? 0,
    identityVerified: initialReport?.identityVerified ?? 0,
    cardsNotIssued: initialReport?.cardsNotIssued ?? 0,
    missedAppointment: initialReport?.missedAppointment ?? 0,
    wrongAppointmentDate: initialReport?.wrongAppointmentDate ?? 0,
    cumulativeCardsIssued: initialReport?.cumulativeCardsIssued ?? 0,
    cumulativeSinceDate: initialReport?.cumulativeSinceDate || '13 ตุลาคม 2568',
    customCategoryValues: initialReport?.customCategoryValues || {},
    notes: initialReport?.notes || '',
  });

  useEffect(() => {
    if (initialReport) {
      setSelectedOfficeId(initialReport.officeId || initialDefaultOffice.id);
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
        modifyDetails: initialReport.modifyDetails ?? 0,
        substituteCard: initialReport.substituteCard ?? 0,
        queueAppointment: initialReport.queueAppointment ?? 0,
        cardsIssued: initialReport.cardsIssued ?? 0,
        identityVerified: initialReport.identityVerified ?? 0,
        cardsNotIssued: initialReport.cardsNotIssued ?? 0,
        missedAppointment: initialReport.missedAppointment ?? 0,
        wrongAppointmentDate: initialReport.wrongAppointmentDate ?? 0,
        cumulativeCardsIssued: initialReport.cumulativeCardsIssued ?? 0,
        cumulativeSinceDate: initialReport.cumulativeSinceDate || '13 ตุลาคม 2568',
        customCategoryValues: initialReport.customCategoryValues || {},
        notes: initialReport.notes || '',
      });
    }
  }, [initialReport, todayIso]);

  // Calculate live sums across all active categories (both default and custom)
  const totalSections = useMemo(() => {
    let sum = 0;
    activeCategories.forEach((cat) => {
      if (cat.id === 'section59') sum += formData.section59;
      else if (cat.id === 'section62') sum += formData.section62;
      else if (cat.id === 'section63_1') sum += formData.section63_1;
      else if (cat.id === 'section63_2') sum += formData.section63_2;
      else if (cat.id === 'section64') sum += formData.section64;
      else if (cat.id === 'modifyDetails') sum += formData.modifyDetails;
      else if (cat.id === 'substituteCard') sum += formData.substituteCard;
      else {
        sum += (formData.customCategoryValues && formData.customCategoryValues[cat.id]) || 0;
      }
    });
    return sum;
  }, [activeCategories, formData]);

  // Handle Office Selection
  const handleOfficeChange = (officeId: string) => {
    setSelectedOfficeId(officeId);
    const office = officeList.find((o) => o.id === officeId);
    if (office) {
      // Check if a registered reporter belongs to this office
      const matchingReporter = reporters?.find((r) => r.officeId === office.id);
      const isMobile =
        formData.centerName === MOBILE_UNIT_CENTER_NAME ||
        formData.centerName.includes('Mobile Unit');

      const updated = {
        ...formData,
        officeId: office.id,
        officeName: office.name,
        officeNameEn: office.nameEn,
        centerName: isMobile ? formData.centerName : office.centerName,
        region: office.region,
        phoneNumber: matchingReporter?.phoneNumber || formData.phoneNumber || '',
        lineId: matchingReporter?.lineId || formData.lineId || '',
        reporterName: matchingReporter?.name || formData.reporterName || '',
        reporterPosition: matchingReporter?.position || formData.reporterPosition || '',
      };
      setFormData(updated);
      triggerPreview(updated);
    }
  };

  // Handle Custom Category Value Change
  const handleCustomCategoryChange = (catId: string, val: number) => {
    const safeVal = Math.max(0, isNaN(val) ? 0 : val);
    const updated = {
      ...formData,
      customCategoryValues: {
        ...(formData.customCategoryValues || {}),
        [catId]: safeVal,
      },
    };
    setFormData(updated);
    triggerPreview(updated);
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

  // Handle Number Field Change
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalReport: DOEReport = {
      ...formData,
      id: initialReport?.id || `report-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      createdAt: initialReport?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onSave(finalReport);
  };

  const handleClearForm = () => {
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
                <div className="sm:col-span-2">
                  <input
                    id={searchInputId}
                    type="text"
                    placeholder="พิมพ์ค้นหาจังหวัด, ศูนย์, หรือพื้นที่... เช่น เชียงราย, ชลบุรี, กทม.พื้นที่ 5"
                    value={officeSearch}
                    onChange={(e) => setOfficeSearch(e.target.value)}
                    className="w-full min-w-0 text-sm px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-medium"
                  />
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

              <select
                value={selectedOfficeId}
                onChange={(e) => handleOfficeChange(e.target.value)}
                aria-label="เลือกสำนักงานจัดหางานและศูนย์บริการ"
                className="w-full min-w-0 text-sm sm:text-base px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-semibold text-slate-900"
              >
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

          {/* ชื่อศูนย์บริการ */}
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="block text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <span>ชื่อศูนย์บริการ (ระบุในหัวเรื่องโปสเตอร์)</span>
                {!isAdmin && <Lock className="w-3.5 h-3.5 text-amber-600" />}
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {!isAdmin ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                    <Lock className="w-3 h-3 text-amber-700" />
                    ล็อกชื่อศูนย์ (ไม่อนุญาตให้แก้ไข)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    สิทธิ์ Admin: แก้ไขได้
                  </span>
                )}
                {formData.centerName === MOBILE_UNIT_CENTER_NAME ||
                formData.centerName?.includes('Mobile Unit') ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <Truck className="w-3 h-3" />
                    หน่วยบริการเคลื่อนที่
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-sky-100 text-sky-800 border border-sky-200">
                    <Building2 className="w-3 h-3" />
                    ชื่อศูนย์ตามระบุ
                  </span>
                )}
              </div>
            </div>

            {/* Selector: ชื่อศูนย์ตามระบุ vs หน่วยบริการเคลื่อนที่ (Mobile Unit) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!isAdmin) {
                    requireAdmin('เปลี่ยนรูปแบบชื่อศูนย์บริการเป็น "ชื่อศูนย์ตามระบุ"', () => {
                      const currentOffice = officeList.find((o) => o.id === selectedOfficeId);
                      const targetName =
                        currentOffice?.centerName || 'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว';
                      const updated = { ...formData, centerName: targetName };
                      setFormData(updated);
                      triggerPreview(updated);
                    });
                    return;
                  }
                  const currentOffice = officeList.find((o) => o.id === selectedOfficeId);
                  const targetName =
                    currentOffice?.centerName || 'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว';
                  const updated = { ...formData, centerName: targetName };
                  setFormData(updated);
                  triggerPreview(updated);
                }}
                className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  !isAdmin ? 'opacity-90 bg-slate-50/70 border-slate-200 hover:border-amber-300' : ''
                } ${
                  !(
                    formData.centerName === MOBILE_UNIT_CENTER_NAME ||
                    formData.centerName?.includes('Mobile Unit')
                  )
                    ? 'bg-sky-50/90 border-sky-500 ring-2 ring-sky-500/20 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 text-slate-600'
                }`}
              >
                <div
                  className={`p-1.5 rounded-lg shrink-0 ${
                    !(
                      formData.centerName === MOBILE_UNIT_CENTER_NAME ||
                      formData.centerName?.includes('Mobile Unit')
                    )
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1">
                      <span>ชื่อศูนย์ตามระบุ</span>
                      {!isAdmin && <Lock className="w-3 h-3 text-amber-600" />}
                    </span>
                    {!(
                      formData.centerName === MOBILE_UNIT_CENTER_NAME ||
                      formData.centerName?.includes('Mobile Unit')
                    ) && <span className="w-2 h-2 rounded-full bg-sky-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {officeList.find((o) => o.id === selectedOfficeId)?.centerName ||
                      'ตามที่ระบุประจำสำนักงาน'}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!isAdmin) {
                    requireAdmin('เปลี่ยนรูปแบบชื่อศูนย์บริการเป็น "หน่วยบริการเคลื่อนที่ (Mobile Unit)"', () => {
                      const updated = { ...formData, centerName: MOBILE_UNIT_CENTER_NAME };
                      setFormData(updated);
                      triggerPreview(updated);
                    });
                    return;
                  }
                  const updated = { ...formData, centerName: MOBILE_UNIT_CENTER_NAME };
                  setFormData(updated);
                  triggerPreview(updated);
                }}
                className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  !isAdmin ? 'opacity-90 bg-slate-50/70 border-slate-200 hover:border-amber-300' : ''
                } ${
                  formData.centerName === MOBILE_UNIT_CENTER_NAME ||
                  formData.centerName?.includes('Mobile Unit')
                    ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 text-slate-600'
                }`}
              >
                <div
                  className={`p-1.5 rounded-lg shrink-0 ${
                    formData.centerName === MOBILE_UNIT_CENTER_NAME ||
                    formData.centerName?.includes('Mobile Unit')
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <Truck className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1">
                      <span>หน่วยบริการเคลื่อนที่ (Mobile Unit)</span>
                      {!isAdmin && <Lock className="w-3 h-3 text-amber-600" />}
                    </span>
                    {(formData.centerName === MOBILE_UNIT_CENTER_NAME ||
                      formData.centerName?.includes('Mobile Unit')) && (
                      <span className="w-2 h-2 rounded-full bg-emerald-600" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    หน่วยบริการใบอนุญาตทำงานแบบเคลื่อนที่
                  </p>
                </div>
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="relative">
                <input
                  type="text"
                  value={formData.centerName}
                  readOnly={!isAdmin}
                  onChange={(e) => {
                    if (!isAdmin) return;
                    const updated = { ...formData, centerName: e.target.value };
                    setFormData(updated);
                    triggerPreview(updated);
                  }}
                  className={`w-full min-w-0 text-sm px-3.5 py-2.5 rounded-lg font-medium transition-colors ${
                    !isAdmin
                      ? 'bg-slate-100 text-slate-600 border border-slate-200 cursor-not-allowed select-none'
                      : 'bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-slate-800'
                  }`}
                  placeholder="ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว..."
                />
                {!isAdmin && (
                  <div className="absolute right-3 top-2.5 flex items-center gap-1 text-xs text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-md border border-amber-300">
                    <Lock className="w-3 h-3 text-amber-700" />
                    <span>ล็อกสิทธิ์ Admin</span>
                  </div>
                )}
              </div>

              {!isAdmin ? (
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-amber-50/80 border border-amber-200 text-xs text-amber-950">
                  <div className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>ชื่อศูนย์บริการถูกล็อคตามมาตรฐานสำนักงาน ไม่อนุญาตให้ผู้ใช้งานทั่วไปแก้ไข</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAdminActionTitle('ปลดล็อกสิทธิ์เพื่อแก้ไขชื่อศูนย์บริการ');
                      setAdminModalOpen(true);
                    }}
                    className="font-bold underline text-amber-800 hover:text-amber-950 cursor-pointer flex items-center gap-1 text-[11px] bg-white px-2 py-0.5 rounded-md border border-amber-300 shadow-2xs"
                  >
                    <ShieldCheck className="w-3 h-3 text-amber-600" />
                    <span>ปลดล็อกสิทธิ์ Admin</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 pt-0.5">
                  <span className="text-emerald-700 font-medium">
                    ✓ สิทธิ์ Admin: สามารถปรับแต่งชื่อศูนย์บริการ หรือกดคืนค่าตามสำนักงานได้
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const currentOffice = officeList.find((o) => o.id === selectedOfficeId);
                      const defaultName =
                        currentOffice?.centerName || 'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว';
                      const updated = { ...formData, centerName: defaultName };
                      setFormData(updated);
                      triggerPreview(updated);
                    }}
                    className="text-sky-600 hover:text-sky-700 font-medium underline shrink-0 ml-2 cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>คืนค่าตามสำนักงาน</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ชื่อผู้รายงาน */}
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-1">
              ชื่อผู้รายงาน <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.reporterName}
                onChange={(e) => {
                  const updated = { ...formData, reporterName: e.target.value };
                  setFormData(updated);
                  triggerPreview(updated);
                }}
                className="w-full min-w-0 text-sm px-3.5 py-2 pl-9 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-medium"
                placeholder="เช่น นางสาวสิริพร สุขเกษม"
                required
              />
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            </div>
          </div>

          {/* ตำแหน่ง */}
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-1">
              ตำแหน่งผู้รายงาน <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.reporterPosition}
                onChange={(e) => {
                  const updated = { ...formData, reporterPosition: e.target.value };
                  setFormData(updated);
                  triggerPreview(updated);
                }}
                className="w-full min-w-0 text-sm px-3.5 py-2 pl-9 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-medium"
                placeholder="เช่น นักวิชาการแรงงานชำนาญการ"
                required
              />
              <Briefcase className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            </div>
          </div>

          {/* เบอร์โทรศัพท์ */}
          <div className="md:col-span-2">
            <label className="block text-sm font-bold text-slate-800 mb-1">
              เบอร์โทรศัพท์
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.phoneNumber}
                onChange={(e) => {
                  const updated = { ...formData, phoneNumber: e.target.value };
                  setFormData(updated);
                  triggerPreview(updated);
                }}
                className="w-full min-w-0 text-sm px-3.5 py-2 pl-9 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-medium"
                placeholder="053-152054, 098-7466630"
              />
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            </div>
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
          <div className="text-xs bg-sky-100 text-sky-800 font-bold px-3 py-1 rounded-full">
            รวมออกบัตรแยกกลุ่ม: {formatNumber(totalSections)} คน
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {activeCategories.map((cat, idx) => {
            const isStandard = [
              'section59',
              'section62',
              'section63_1',
              'section63_2',
              'section64',
              'modifyDetails',
              'substituteCard',
            ].includes(cat.id);

            let val = 0;
            let onValChange = (v: number) => {};
            let onStepChange = (d: number) => {};

            if (cat.id === 'section59') {
              val = formData.section59;
              onValChange = (v) => handleNumberChange('section59', v);
              onStepChange = (d) => stepNumber('section59', d);
            } else if (cat.id === 'section62') {
              val = formData.section62;
              onValChange = (v) => handleNumberChange('section62', v);
              onStepChange = (d) => stepNumber('section62', d);
            } else if (cat.id === 'section63_1') {
              val = formData.section63_1;
              onValChange = (v) => handleNumberChange('section63_1', v);
              onStepChange = (d) => stepNumber('section63_1', d);
            } else if (cat.id === 'section63_2') {
              val = formData.section63_2;
              onValChange = (v) => handleNumberChange('section63_2', v);
              onStepChange = (d) => stepNumber('section63_2', d);
            } else if (cat.id === 'section64') {
              val = formData.section64;
              onValChange = (v) => handleNumberChange('section64', v);
              onStepChange = (d) => stepNumber('section64', d);
            } else if (cat.id === 'modifyDetails') {
              val = formData.modifyDetails;
              onValChange = (v) => handleNumberChange('modifyDetails', v);
              onStepChange = (d) => stepNumber('modifyDetails', d);
            } else if (cat.id === 'substituteCard') {
              val = formData.substituteCard;
              onValChange = (v) => handleNumberChange('substituteCard', v);
              onStepChange = (d) => stepNumber('substituteCard', d);
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
                primary={cat.id === 'section63_2'}
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
            <span>3. สถานะคิวและการให้บริการประจำวัน</span>
          </div>
          {formData.cardsIssued === totalSections ? (
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>ยอดออกบัตร ({formData.cardsIssued}) ตรงกับยอด 7 กลุ่ม</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 font-medium bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              <span>ยอดออกบัตร ({formData.cardsIssued}) ไม่เท่ากับผลรวมกลุ่ม ({totalSections})</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* คิวนัดหมาย */}
          <NumberInputField
            label="คิวนัดหมาย (คิว)"
            subLabel="จำนวนคิวที่นัดหมายเข้ารับบริการทั้งหมด"
            value={formData.queueAppointment}
            onChange={(v) => handleNumberChange('queueAppointment', v)}
            onStep={(d) => stepNumber('queueAppointment', d)}
            badgeColor="text-teal-700 bg-teal-50 border-teal-200"
            primary
          />

          {/* ออกบัตร */}
          <NumberInputField
            label="ออกบัตร (ใบ)"
            subLabel="จำนวนบัตรที่พิมพ์และออกให้เรียบร้อย"
            value={formData.cardsIssued}
            onChange={(v) => handleNumberChange('cardsIssued', v)}
            onStep={(d) => stepNumber('cardsIssued', d)}
            badgeColor="text-emerald-700 bg-emerald-50 border-emerald-200"
            primary
          />

          {/* ยืนยันตัวตน */}
          <NumberInputField
            label="ยืนยันตัวตน (คน)"
            subLabel="ตรวจอัตลักษณ์/ยืนยันตัวตนในระบบ"
            value={formData.identityVerified}
            onChange={(v) => handleNumberChange('identityVerified', v)}
            onStep={(d) => stepNumber('identityVerified', d)}
            badgeColor="text-emerald-700 bg-emerald-50 border-emerald-200"
          />

          {/* ไม่ออกบัตร */}
          <NumberInputField
            label="ไม่ออกบัตร (คน)"
            subLabel="เอกสารไม่ครบ หรือขาดคุณสมบัติ"
            value={formData.cardsNotIssued}
            onChange={(v) => handleNumberChange('cardsNotIssued', v)}
            onStep={(d) => stepNumber('cardsNotIssued', d)}
            badgeColor="text-rose-700 bg-rose-50 border-rose-200"
          />

          {/* ไม่มาตามนัด */}
          <NumberInputField
            label="ไม่มาตามนัด (คน)"
            subLabel="ขาดนัดในวันเวลาที่กำหนด"
            value={formData.missedAppointment}
            onChange={(v) => handleNumberChange('missedAppointment', v)}
            onStep={(d) => stepNumber('missedAppointment', d)}
            badgeColor="text-rose-700 bg-rose-50 border-rose-200"
          />

          {/* ไม่ตรงวันนัด */}
          <NumberInputField
            label="ไม่ตรงวันนัด (คน)"
            subLabel="มาติดต่อก่อนหรือหลังวันนัดหมาย"
            value={formData.wrongAppointmentDate}
            onChange={(v) => handleNumberChange('wrongAppointmentDate', v)}
            onStep={(d) => stepNumber('wrongAppointmentDate', d)}
            badgeColor="text-orange-700 bg-orange-50 border-orange-200"
          />
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
      <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
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
          className="px-6 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-bold text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-98"
        >
          <Save className="w-4 h-4" />
          <span>บันทึกรายงานผลการปฏิบัติงาน</span>
        </button>
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
}) => {
  return (
    <div
      className={`p-3.5 rounded-xl border transition-all min-w-0 overflow-hidden ${
        primary
          ? 'bg-blue-50/50 border-blue-200'
          : highlight
          ? 'bg-sky-50/30 border-sky-200'
          : 'bg-slate-50/60 border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-start justify-between gap-1.5 mb-2 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="text-sm sm:text-base font-extrabold text-slate-900 leading-tight truncate">{label}</div>
          {subLabel && (
            <div className="text-xs sm:text-sm text-slate-500 leading-tight mt-0.5 truncate">
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
          type="number"
          min="0"
          value={value === 0 ? '' : value}
          onChange={(e) => {
            const v = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
            onChange(isNaN(v) ? 0 : v);
          }}
          placeholder="0"
          className="min-w-0 flex-1 w-full text-center font-black text-slate-900 bg-white border border-slate-300 rounded-lg py-1.5 px-1 text-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 shadow-2xs font-['Prompt']"
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
    </div>
  );
};
