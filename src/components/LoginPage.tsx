import React, { useState } from 'react';
import { DOELogo } from './DOELogo';
import { AuthUser, UserRole } from '../types/auth';
import { EMPLOYMENT_OFFICES } from '../data/offices';
import {
  ShieldCheck,
  Building2,
  Lock,
  User,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  FileEdit,
  LayoutDashboard,
  Sparkles,
} from 'lucide-react';

interface LoginPageProps {
  onLogin: (user: AuthUser) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>('provincial_officer');

  // Executive Login State
  const [execUsername, setExecUsername] = useState('executive.doe');
  const [execPassword, setExecPassword] = useState('••••••••');
  const [execName, setExecName] = useState('นายสมชาย บริหารงานรัฐ');
  const [execPosition, setExecPosition] = useState('ผู้ตรวจราชการกรมการจัดหางาน');

  // Provincial Officer Login State
  const [selectedOfficeId, setSelectedOfficeId] = useState('chiangrai');
  const [officerName, setOfficerName] = useState('นางสาวสิริพร สุขเกษม');
  const [officerPosition, setOfficerPosition] = useState('นักวิชาการแรงงานชำนาญการ');
  const [officerPassword, setOfficerPassword] = useState('••••••••');

  const handleExecutiveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const user: AuthUser = {
      id: 'user-exec-1',
      username: execUsername || 'executive.doe',
      fullName: execName || 'ผู้บริหารกรมการจัดหางาน',
      position: execPosition || 'ผู้บริหารระดับสูง',
      role: 'executive',
      officeName: 'กรมการจัดหางาน (ส่วนกลาง)',
      region: 'ส่วนกลาง',
    };
    onLogin(user);
  };

  const handleOfficerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const office = EMPLOYMENT_OFFICES.find((o) => o.id === selectedOfficeId) || EMPLOYMENT_OFFICES[0];
    const user: AuthUser = {
      id: `user-officer-${office.id}`,
      username: `officer.${office.id}`,
      fullName: officerName || 'เจ้าหน้าที่บันทึกรายงาน',
      position: officerPosition || 'นักวิชาการแรงงาน',
      role: 'provincial_officer',
      officeId: office.id,
      officeName: office.name,
      region: office.region,
      phoneNumber: office.defaultPhone,
      lineId: office.defaultLine,
    };
    onLogin(user);
  };

  // Quick Demo Logins
  const handleQuickLoginExecutive = () => {
    onLogin({
      id: 'exec-demo',
      username: 'executive.doe',
      fullName: 'นายสมชาย บริหารงานรัฐ',
      position: 'ผู้ตรวจราชการกรมการจัดหางาน',
      role: 'executive',
      officeName: 'กรมการจัดหางาน (ส่วนกลาง)',
      region: 'ส่วนกลาง',
    });
  };

  const handleQuickLoginOfficer = (officeId: string, name: string, pos: string) => {
    const office = EMPLOYMENT_OFFICES.find((o) => o.id === officeId) || EMPLOYMENT_OFFICES[0];
    onLogin({
      id: `officer-demo-${office.id}`,
      username: `officer.${office.id}`,
      fullName: name,
      position: pos,
      role: 'provincial_officer',
      officeId: office.id,
      officeName: office.name,
      region: office.region,
      phoneNumber: office.defaultPhone,
      lineId: office.defaultLine,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-700 via-indigo-700 to-sky-700 flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-sans">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-sky-300/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] bg-amber-300/20 rounded-full blur-3xl" />
      </div>

      {/* Main Center Card */}
      <div className="max-w-4xl w-full mx-auto relative z-10 my-auto">
        {/* Emblem & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-2xl mb-4">
            <DOELogo size={84} />
          </div>
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-[11px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-mono shadow-xs">
              DOE REPORTING PORTAL
            </span>
            <span className="text-xs text-sky-100 font-semibold">
              กรมการจัดหางาน กระทรวงแรงงาน
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-['Prompt']">
            ระบบรายงานผลการปฏิบัติงานศูนย์บริการคนต่างด้าว
          </h1>
          <p className="text-sm text-sky-100 mt-2 max-w-xl mx-auto">
            เข้าสู่ระบบตามระดับสิทธิ์การใช้งานเพื่อความปลอดภัยและความถูกต้องของข้อมูลสถิติ
          </p>
        </div>

        {/* Login Container Box */}
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden">
          {/* Role Selection Tabs */}
          <div className="grid grid-cols-2 p-2 bg-slate-100/80 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setSelectedRole('provincial_officer')}
              className={`py-3.5 px-4 rounded-2xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                selectedRole === 'provincial_officer'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <FileEdit className="w-4 h-4 text-emerald-400" />
              <span>สำนักงานจัดหางานจังหวัด</span>
              <span className="text-[10px] hidden sm:inline px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-normal">
                (เฉพาะแบบฟอร์ม)
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedRole('executive')}
              className={`py-3.5 px-4 rounded-2xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                selectedRole === 'executive'
                  ? 'bg-blue-900 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-amber-400" />
              <span>ผู้บริหาร / ส่วนกลาง</span>
              <span className="text-[10px] hidden sm:inline px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-normal">
                (ดูข้อมูลทั้งหมด)
              </span>
            </button>
          </div>

          <div className="p-6 sm:p-8">
            {/* 1. PROVINCIAL OFFICER LOGIN FORM */}
            {selectedRole === 'provincial_officer' && (
              <form onSubmit={handleOfficerSubmit} className="space-y-5">
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <h2 className="text-xs font-bold text-emerald-950">
                      สิทธิ์การใช้งาน: เจ้าหน้าที่สำนักงานจัดหางานจังหวัด
                    </h2>
                    <p className="text-[11px] text-emerald-800 mt-0.5">
                      สามารถเข้าใช้งานได้ **เฉพาะแท็บแบบฟอร์มรายงานผลประจำวัน** ของสำนักงานของท่านเท่านั้น เพื่อบันทึกข้อมูลและดูโปสเตอร์สรุปผลประจำวัน
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Select Employment Office */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      เลือกสำนักงานจัดหางานจังหวัดที่สังกัด <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={selectedOfficeId}
                        onChange={(e) => setSelectedOfficeId(e.target.value)}
                        className="w-full text-xs sm:text-sm pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600 font-semibold text-slate-900"
                        required
                      >
                        {EMPLOYMENT_OFFICES.map((office) => (
                          <option key={office.id} value={office.id}>
                            [{office.region}] {office.name}
                          </option>
                        ))}
                      </select>
                      <Building2 className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    </div>
                  </div>

                  {/* Reporter Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      ชื่อ-สกุล ผู้รายงาน <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={officerName}
                        onChange={(e) => setOfficerName(e.target.value)}
                        placeholder="เช่น นางสาวสิริพร สุขเกษม"
                        className="w-full text-xs sm:text-sm pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                        required
                      />
                      <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    </div>
                  </div>

                  {/* Reporter Position */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      ตำแหน่ง <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={officerPosition}
                        onChange={(e) => setOfficerPosition(e.target.value)}
                        placeholder="เช่น นักวิชาการแรงงานชำนาญการ"
                        className="w-full text-xs sm:text-sm pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                        required
                      />
                      <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      รหัสผ่านความปลอดภัย (ระบบภายใน DOE)
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        value={officerPassword}
                        onChange={(e) => setOfficerPassword(e.target.value)}
                        className="w-full text-xs sm:text-sm pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600 font-mono"
                      />
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-900 to-blue-800 hover:from-blue-800 hover:to-blue-700 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  <span>เข้าสู่ระบบเพื่อกรอกแบบฟอร์มรายงานประจำวัน</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* 2. EXECUTIVE LOGIN FORM */}
            {selectedRole === 'executive' && (
              <form onSubmit={handleExecutiveSubmit} className="space-y-5">
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <h2 className="text-xs font-bold text-amber-950">
                      สิทธิ์การใช้งาน: ผู้บริหาร / กรมการจัดหางานส่วนกลาง (Full Access)
                    </h2>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      สามารถเข้าใช้งานได้ **ทุกแท็บและดูข้อมูลทั้งหมดของทั้งประเทศ** ประกอบด้วย แดชบอร์ดสรุปผลภาพรวม, สถิติแยกตามภูมิภาค, รายชื่อสำนักงานที่ยังไม่รายงาน, ประวัติรายงานย้อนหลัง, และส่งออกไฟล์ CSV
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      ชื่อบัญชีผู้บริหาร (Username) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={execUsername}
                        onChange={(e) => setExecUsername(e.target.value)}
                        className="w-full text-xs sm:text-sm pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600 font-mono"
                        required
                      />
                      <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      รหัสผ่าน (Password) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        value={execPassword}
                        onChange={(e) => setExecPassword(e.target.value)}
                        className="w-full text-xs sm:text-sm pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600 font-mono"
                        required
                      />
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      ชื่อ-สกุล ผู้บริหาร
                    </label>
                    <input
                      type="text"
                      value={execName}
                      onChange={(e) => setExecName(e.target.value)}
                      className="w-full text-xs sm:text-sm px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      ตำแหน่ง
                    </label>
                    <input
                      type="text"
                      value={execPosition}
                      onChange={(e) => setExecPosition(e.target.value)}
                      className="w-full text-xs sm:text-sm px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  <span>เข้าสู่ระบบในฐานะผู้บริหาร (ดูข้อมูลทั้งหมด)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* Quick Demo Access Bar */}
            <div className="mt-8 pt-6 border-t border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-slate-700">
                  ทดสอบการใช้งานด่วน (One-Click Demo Access):
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={handleQuickLoginExecutive}
                  className="p-3 rounded-xl border border-amber-300 bg-amber-50/70 hover:bg-amber-100/90 text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-amber-950">
                    <span>👑 ระดับผู้บริหาร</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                  <div className="text-[11px] text-amber-800 mt-0.5">
                    ดูภาพรวมทั้งประเทศครบทุกแท็บ
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleQuickLoginOfficer('chiangrai', 'นางสาวสิริพร สุขเกษม', 'นักวิชาการแรงงานชำนาญการ')
                  }
                  className="p-3 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100/90 text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-blue-950">
                    <span>🏢 จัดหางานเชียงราย</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                  <div className="text-[11px] text-blue-800 mt-0.5">
                    เฉพาะแบบฟอร์มรายงาน (ภาคเหนือ)
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleQuickLoginOfficer('samutsakhon', 'นายณัฐพงษ์ เจริญทรัพย์', 'เจ้าพนักงานแรงงานชำนาญงาน')
                  }
                  className="p-3 rounded-xl border border-teal-200 bg-teal-50/70 hover:bg-teal-100/90 text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-teal-950">
                    <span>🏢 จัดหางานสมุทรสาคร</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                  <div className="text-[11px] text-teal-800 mt-0.5">
                    เฉพาะแบบฟอร์มรายงาน (ภาคกลาง)
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer copyright */}
      <footer className="text-center text-xs text-slate-400 py-4 relative z-10">
        © 2026 กรมการจัดหางาน กระทรวงแรงงาน (Department of Employment, Ministry of Labour) • ระบบรายงานผลประจำศูนย์
      </footer>
    </div>
  );
};
