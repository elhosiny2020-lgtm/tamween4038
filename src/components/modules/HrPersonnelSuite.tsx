import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  Users,
  Clock,
  CalendarDays,
  Wallet,
  CreditCard,
  Award,
  Settings,
  History,
  Printer,
  FileSpreadsheet,
  Plus,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Search,
} from 'lucide-react';
import type { AppUser } from '../../types';
import type {
  HrModuleState,
  HrEmployee,
  HrAttendanceRecord,
  HrLeaveRequest,
  HrLoanRecord,
  HrPayrollPeriodRun,
  HrPolicySettingsVersion,
  LeaveCategory,
  ModuleAuditLog,
} from '../../types/modules';
import {
  parseEgyptianNationalId,
  computeAttendanceMetrics,
  computeLeaveDaysInclusive,
  computeRemainingLeaveBalance,
  computeEmployeePayrollLine,
  computeExactServiceDuration,
} from '../../utils/hrPayrollMath';
import { round2 } from '../../utils/rationMathEngine';
import { exportRowsToArabicCsv, printModuleReportA4 } from '../../services/modulesStorage';

export type HrSubView =
  | 'dashboard'
  | 'employees'
  | 'attendance'
  | 'leaves'
  | 'payroll'
  | 'loans_promotions'
  | 'settings'
  | 'audit';

interface HrPersonnelSuiteProps {
  state: HrModuleState;
  branchId: string;
  branchName: string;
  currentUser: AppUser | null;
  initialSubView?: HrSubView;
  onChangeState: (next: HrModuleState) => void;
}

export const HrPersonnelSuite: React.FC<HrPersonnelSuiteProps> = ({
  state,
  branchId,
  branchName,
  currentUser,
  initialSubView = 'dashboard',
  onChangeState,
}) => {
  const [subView, setSubView] = useState<HrSubView>(initialSubView);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const isViewer = currentUser?.role === 'viewer';

  const [empSearch, setEmpSearch] = useState('');
  // New Employee Form
  const [newFullName, setNewFullName] = useState('');
  const [newNationalId, setNewNationalId] = useState('');
  const [newEmpCode, setNewEmpCode] = useState('');
  const [newJobTitle, setNewJobTitle] = useState('مفتش تموين');
  const [newDepartment, setNewDepartment] = useState(
    state.departments[0]?.name || 'قسم الرقابة التموينية والتفتيش'
  );
  const [newFunctionalWage, setNewFunctionalWage] = useState<number>(4500);
  const [newComplementaryWage, setNewComplementaryWage] = useState<number>(1500);
  const [newInsurableWage, setNewInsurableWage] = useState<number>(6000);

  // Attendance form
  const [attEmpId, setAttEmpId] = useState(state.employees[0]?.id || '');
  const [attActualIn, setAttActualIn] = useState('08:10');
  const [attActualOut, setAttActualOut] = useState('14:00');

  // Leave request form
  const [leaveEmpId, setLeaveEmpId] = useState(state.employees[0]?.id || '');
  const [leaveType, setLeaveType] = useState<LeaveCategory>('اعتيادية');
  const [leaveStart, setLeaveStart] = useState(new Date().toISOString().split('T')[0]);
  const [leaveEnd, setLeaveEnd] = useState(new Date().toISOString().split('T')[0]);

  // Payroll Month Runner
  const [payrollMonth, setPayrollMonth] = useState(
    state.payrollRuns[0]?.monthKey || new Date().toISOString().slice(0, 7)
  );
  const [selectedRunId, setSelectedRunId] = useState(state.payrollRuns[0]?.id || '');

  // Loan form
  const [loanEmpId, setLoanEmpId] = useState(state.employees[0]?.id || '');
  const [loanAmount, setLoanAmount] = useState<number>(6000);
  const [loanInstallments, setLoanInstallments] = useState<number>(12);

  // End of Service calculator
  const [eosStart, setEosStart] = useState('2010-03-01');
  const [eosEnd, setEosEnd] = useState(new Date().toISOString().split('T')[0]);

  // Policy Settings Draft
  const [policyDraft, setPolicyDraft] = useState<HrPolicySettingsVersion>(state.policySettings);

  const notify = (type: 'ok' | 'err', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  const appendAudit = (
    actionType: ModuleAuditLog['actionType'],
    entityName: string,
    entityId: string,
    afterSummary: string
  ): ModuleAuditLog => ({
    id: `aud-hr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    branchId,
    module: 'hr',
    timestamp: new Date().toISOString(),
    username: currentUser?.username || 'system',
    userFullName: currentUser?.fullName || 'مستخدم المنظومة',
    actionType,
    entityName,
    entityId,
    afterSummary,
  });

  const nidPreview = useMemo(() => {
    if (!newNationalId.trim()) return null;
    return parseEgyptianNationalId(newNationalId.trim());
  }, [newNationalId]);

  const filteredEmployees = useMemo(() => {
    if (!empSearch.trim()) return state.employees;
    const q = empSearch.trim().toLowerCase();
    return state.employees.filter((e) =>
      `${e.fullName} ${e.employeeCode} ${e.nationalId} ${e.departmentName} ${e.jobTitle}`
        .toLowerCase()
        .includes(q)
    );
  }, [state.employees, empSearch]);

  const activeRun = useMemo(
    () => state.payrollRuns.find((r) => r.id === selectedRunId) || state.payrollRuns[0] || null,
    [state.payrollRuns, selectedRunId]
  );

  const payrollSummary = useMemo(() => {
    const lines = activeRun?.lines || [];
    return {
      grossTotal: round2(lines.reduce((s, l) => s + l.grossEarnings, 0)),
      netTotal: round2(lines.reduce((s, l) => s + l.netSalary, 0)),
      insuranceTotal: round2(lines.reduce((s, l) => s + l.employeeInsurance, 0)),
      taxTotal: round2(lines.reduce((s, l) => s + l.monthlyIncomeTax, 0)),
    };
  }, [activeRun]);

  const deptPayrollChartData = useMemo(() => {
    const map = new Map<string, { name: string; الإجمالي: number; الصافي: number }>();
    (activeRun?.lines || []).forEach((l) => {
      const key = l.departmentName || 'الإدارة';
      const cur = map.get(key) || { name: key.slice(0, 18), الإجمالي: 0, الصافي: 0 };
      cur.الإجمالي = round2(cur.الإجمالي + l.grossEarnings);
      cur.الصافي = round2(cur.الصافي + l.netSalary);
      map.set(key, cur);
    });
    return Array.from(map.values());
  }, [activeRun]);

  const eosDuration = useMemo(() => computeExactServiceDuration(eosStart, eosEnd), [eosStart, eosEnd]);

  // Handlers
  const handleAddEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName.trim()) {
      notify('err', 'يرجى إدخال الاسم بالكامل للموظف.');
      return;
    }
    const parsedNid = parseEgyptianNationalId(newNationalId.trim());
    if (!parsedNid.valid) {
      notify('err', parsedNid.error || 'الرقم القومي غير صحيح.');
      return;
    }
    if (state.employees.some((emp) => emp.nationalId === newNationalId.trim())) {
      notify('err', 'الرقم القومي مسجل بالفعل لموظف آخر — يُمنع التكرار.');
      return;
    }
    const code = newEmpCode.trim() || `EMP-${1000 + state.employees.length + 1}`;
    if (state.employees.some((emp) => emp.employeeCode === code)) {
      notify('err', `الكود الوظيفي (${code}) مسجل مسبقاً.`);
      return;
    }

    const created: HrEmployee = {
      id: `${branchId}-emp-${Date.now()}`,
      branchId,
      employeeCode: code,
      nationalId: newNationalId.trim(),
      fullName: newFullName.trim(),
      birthDate: parsedNid.birthDate || '1990-01-01',
      gender: parsedNid.gender || 'ذكر',
      maritalStatus: 'أعزب',
      childrenCount: 0,
      address: branchName,
      governorate: 'الغربية',
      district: branchName,
      village: 'المدينة',
      phone: '',
      jobTitle: newJobTitle,
      qualitativeGroup: 'التنمية الإدارية',
      jobGrade: 'الثالثة',
      jobLevel: 'باحث ثالث',
      departmentName: newDepartment,
      unitSection: newDepartment,
      workEntity: branchName,
      workSite: branchName,
      hireDate: new Date().toISOString().split('T')[0],
      startWorkDate: new Date().toISOString().split('T')[0],
      appointmentType: 'تعيين دائم',
      appointmentDecisionNo: 'قرار إداري جديد',
      status: 'على رأس العمل',
      directManager: 'مدير الإدارة',
      fileNumber: `FILE-${code}`,
      functionalWage: Math.max(0, newFunctionalWage),
      complementaryWage: Math.max(0, newComplementaryWage),
      periodicAllowances: 0,
      specialAllowances: 0,
      monthlyIncentives: 0,
      rewards: 0,
      allowancesTotal: 0,
      extraEntitlements: 0,
      insurableWage: Math.max(0, newInsurableWage),
      manualDeductions: 0,
      penalties: 0,
    };

    onChangeState({
      ...state,
      employees: [...state.employees, created],
      leaveBalances: [
        ...state.leaveBalances,
        { employeeId: created.id, leaveType: 'اعتيادية', previousBalance: 0, entitledDays: 21, usedDays: 0 },
        { employeeId: created.id, leaveType: 'عارضة', previousBalance: 0, entitledDays: 7, usedDays: 0 },
      ],
      auditLogs: [appendAudit('إضافة', 'ملف الموظفين', created.id, `${created.fullName} (${created.employeeCode})`), ...state.auditLogs],
    });
    setNewFullName('');
    setNewNationalId('');
    setNewEmpCode('');
    notify('ok', `تم تعيين وإضافة الموظف (${created.fullName}) واستخراج تاريخ الميلاد والنوع آلياً.`);
  };

  const handleAddAttendance = (e: React.FormEvent) => {
    e.preventDefault();
    const metrics = computeAttendanceMetrics({
      officialStart: '08:00',
      officialEnd: '14:00',
      actualIn: attActualIn,
      actualOut: attActualOut,
      breakMinutes: 0,
    });
    const rec: HrAttendanceRecord = {
      id: `${branchId}-att-${Date.now()}`,
      branchId,
      employeeId: attEmpId,
      date: new Date().toISOString().split('T')[0],
      monthKey: new Date().toISOString().slice(0, 7),
      officialStart: '08:00',
      officialEnd: '14:00',
      actualIn: attActualIn,
      actualOut: attActualOut,
      breakMinutes: 0,
      lateMinutes: metrics.lateMinutes,
      earlyLeaveMinutes: metrics.earlyLeaveMinutes,
      netWorkedMinutes: metrics.netWorkedMinutes,
      status: 'حضور',
    };
    onChangeState({
      ...state,
      attendance: [rec, ...state.attendance],
      auditLogs: [appendAudit('إضافة', 'الحضور والانصراف', rec.id, `تأخير ${metrics.lateMinutes} دقيقة`), ...state.auditLogs],
    });
    notify('ok', `تم تسجيل الحضور واحتساب التأخير (${metrics.lateMinutes} دقيقة) وصافي العمل (${metrics.netWorkedMinutes} دقيقة).`);
  };

  const handleSubmitLeave = (e: React.FormEvent) => {
    e.preventDefault();
    const days = computeLeaveDaysInclusive(leaveStart, leaveEnd);
    if (days <= 0) {
      notify('err', 'نطاق تاريخ الإجازة غير صحيح.');
      return;
    }
    const bal = state.leaveBalances.find((b) => b.employeeId === leaveEmpId && b.leaveType === leaveType);
    if (bal && leaveType !== 'بدون أجر' && days > computeRemainingLeaveBalance(bal)) {
      notify('err', `الرصيد المتاح لنوع الإجازة (${leaveType}) هو ${computeRemainingLeaveBalance(bal)} يوم فقط.`);
      return;
    }
    const req: HrLeaveRequest = {
      id: `${branchId}-lr-${Date.now()}`,
      branchId,
      employeeId: leaveEmpId,
      leaveType,
      startDate: leaveStart,
      endDate: leaveEnd,
      daysCount: days,
      status: 'معتمد',
      notes: 'اعتماد فوري مع خصم الرصيد المستقل',
    };
    const nextBalances = state.leaveBalances.map((b) =>
      b.employeeId === leaveEmpId && b.leaveType === leaveType
        ? { ...b, usedDays: b.usedDays + days }
        : b
    );
    onChangeState({
      ...state,
      leaveRequests: [req, ...state.leaveRequests],
      leaveBalances: nextBalances,
      auditLogs: [appendAudit('اعتماد', 'الإجازات', req.id, `${leaveType}: ${days} يوم`), ...state.auditLogs],
    });
    notify('ok', `تم اعتماد إجازة (${leaveType}) لمدة (${days}) يوم وخصمها من رصيدها المستقل.`);
  };

  const handleRunOrRecalculatePayroll = () => {
    const existing = state.payrollRuns.find((r) => r.monthKey === payrollMonth);
    if (existing && existing.status === 'معتمد') {
      notify('err', `مسير مرتبات شهر (${payrollMonth}) معتمد ومقفل نهائياً — لا يمكن إعادة احتسابه أو تكراره.`);
      return;
    }
    const lines = state.employees.map((emp) =>
      computeEmployeePayrollLine({
        employee: emp,
        policy: state.policySettings,
        activeLoans: state.loans,
        unexcusedAbsenceDays: 0,
      })
    );
    const runObj: HrPayrollPeriodRun = {
      id: existing ? existing.id : `${branchId}-pay-${payrollMonth}-${Date.now()}`,
      branchId,
      monthKey: payrollMonth,
      fiscalYear: payrollMonth.slice(0, 4),
      policyVersionId: state.policySettings.id,
      status: 'معاينة',
      lines,
    };
    const nextRuns = existing
      ? state.payrollRuns.map((r) => (r.id === existing.id ? runObj : r))
      : [runObj, ...state.payrollRuns];

    onChangeState({
      ...state,
      payrollRuns: nextRuns,
      auditLogs: [appendAudit('تعديل', 'مسيرات المرتبات', runObj.id, `معاينة مسير شهر ${payrollMonth}`), ...state.auditLogs],
    });
    setSelectedRunId(runObj.id);
    notify('ok', `تم احتساب ومعاينة مسير رواتب شهر (${payrollMonth}) وفقاً للائحة الضرائب والتأمينات الحالية.`);
  };

  const handleApprovePayrollLock = (runId: string) => {
    const run = state.payrollRuns.find((r) => r.id === runId);
    if (!run || run.status === 'معتمد') return;
    const lockedRuns = state.payrollRuns.map((r) =>
      r.id === runId
        ? {
            ...r,
            status: 'معتمد' as const,
            approvedBy: currentUser?.fullName || 'مدير الإدارة',
            approvedAt: new Date().toISOString(),
          }
        : r
    );
    onChangeState({
      ...state,
      payrollRuns: lockedRuns,
      auditLogs: [appendAudit('اعتماد', 'إقفال مسير الرواتب', runId, `قفل نهائي لشهر ${run.monthKey}`), ...state.auditLogs],
    });
    notify('ok', `تم الاعتماد النهائي وإقفال مسير شهر (${run.monthKey}) ضد أي تعديل لاحق.`);
  };

  const handleAddLoan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!(loanAmount > 0) || !(loanInstallments > 0)) return;
    const instVal = round2(loanAmount / loanInstallments);
    const loan: HrLoanRecord = {
      id: `${branchId}-ln-${Date.now()}`,
      branchId,
      loanNumber: `LN-${Date.now().toString().slice(-5)}`,
      employeeId: loanEmpId,
      totalAmount: loanAmount,
      disbursedDate: new Date().toISOString().split('T')[0],
      installmentsCount: loanInstallments,
      installmentAmount: instVal,
      paidInstallments: 0,
      remainingAmount: loanAmount,
      status: 'سارية',
    };
    onChangeState({
      ...state,
      loans: [loan, ...state.loans],
      auditLogs: [appendAudit('إضافة', 'السلف والأقساط', loan.id, `${loan.loanNumber} — ${loanAmount} ج.م`), ...state.auditLogs],
    });
    notify('ok', `تم تسجيل السلفة (${loan.loanNumber}) بقسط شهري (${instVal} ج.م).`);
  };

  const handleSavePolicySettings = (e: React.FormEvent) => {
    e.preventDefault();
    const versioned: HrPolicySettingsVersion = {
      ...policyDraft,
      id: `hr-pol-${Date.now()}`,
      updatedBy: currentUser?.fullName || 'الإدارة',
      updatedAt: new Date().toISOString(),
    };
    onChangeState({
      ...state,
      policySettings: versioned,
      policyVersionsHistory: [versioned, ...state.policyVersionsHistory],
      auditLogs: [
        appendAudit('تحديث إعدادات', 'السياسات المالية والتأمينات والضرائب', versioned.id, versioned.lawDecisionReference),
        ...state.auditLogs,
      ],
    });
    notify('ok', 'تم حفظ نسخة جديدة من لائحة الضرائب والتأمينات دون التأثير على المسيرات المعتمدة سابقاً.');
  };

  const navItems: { id: HrSubView; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'لوحة الموارد البشرية', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'employees', label: 'الموظفون والرقم القومي', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'attendance', label: 'الحضور والانصراف', icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'leaves', label: 'الأرصدة والإجازات', icon: <CalendarDays className="w-3.5 h-3.5" /> },
    { id: 'payroll', label: 'الرواتب والأجور', icon: <Wallet className="w-3.5 h-3.5" /> },
    { id: 'loans_promotions', label: 'السلف والترقيات والخدمة', icon: <CreditCard className="w-3.5 h-3.5" /> },
    { id: 'settings', label: 'الضرائب والتأمينات (قابل للتعديل)', icon: <Settings className="w-3.5 h-3.5" /> },
    { id: 'audit', label: 'سجل التدقيق', icon: <History className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-4" dir="rtl" data-testid="hr-personnel-suite">
      {/* Banner */}
      <div className="bg-gradient-to-l from-[#0A1628] via-[#13294B] to-[#0D9488] text-white rounded-2xl p-5 shadow-lg border border-[#D4AF37]/40 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-[#D4AF37] text-[#0A1628] shadow-md">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-black">منظومة الموارد البشرية وشؤون العاملين والمرتبات</h2>
            <p className="text-xs text-[#5EEAD4] font-bold mt-0.5">
              {branchName} • {state.policySettings.lawDecisionReference}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportRowsToArabicCsv(
                `مسير_رواتب_${branchName}`,
                ['الكود', 'الاسم', 'القسم', 'الأجر الوظيفي', 'المكمل', 'العلاوات', 'الحوافز', 'الإجمالي', 'التأمين', 'الضريبة', 'السلف', 'الصافي'],
                (activeRun?.lines || []).map((l) => [
                  l.employeeCode,
                  l.employeeName,
                  l.departmentName,
                  l.functionalWage,
                  l.complementaryWage,
                  l.allowancesAndRaises,
                  l.incentivesAndRewards,
                  l.grossEarnings,
                  l.employeeInsurance,
                  l.monthlyIncomeTax,
                  l.loanInstallmentDeduction,
                  l.netSalary,
                ])
              )
            }
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير Excel</span>
          </button>

          <button
            type="button"
            onClick={() =>
              printModuleReportA4({
                title: `كشف استحقاقات ومرتبات العاملين — شهر ${activeRun?.monthKey || payrollMonth}`,
                subtitle: `${state.policySettings.lawDecisionReference}`,
                branchName,
                headers: ['الكود', 'اسم الموظف', 'القسم', 'الإجمالي', 'التأمينات', 'الضريبة', 'أقساط السلف', 'الصافي المنصرف'],
                rows: (activeRun?.lines || []).map((l) => [
                  l.employeeCode,
                  l.employeeName,
                  l.departmentName,
                  `${l.grossEarnings.toLocaleString()} ج.م`,
                  `${l.employeeInsurance.toLocaleString()} ج.م`,
                  `${l.monthlyIncomeTax.toLocaleString()} ج.م`,
                  `${l.loanInstallmentDeduction.toLocaleString()} ج.م`,
                  `${l.netSalary.toLocaleString()} ج.م`,
                ]),
                summaryItems: [
                  { label: 'عدد الموظفين', value: String(state.employees.length) },
                  { label: 'إجمالي الاستحقاقات', value: `${payrollSummary.grossTotal.toLocaleString()} ج.م` },
                  { label: 'إجمالي التأمين والضريبة', value: `${(payrollSummary.insuranceTotal + payrollSummary.taxTotal).toLocaleString()} ج.م` },
                  { label: 'صافي المنصرف', value: `${payrollSummary.netTotal.toLocaleString()} ج.م` },
                ],
                preparedBy: currentUser?.fullName,
              })
            }
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/25 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4 text-[#D4AF37]" />
            <span>طباعة كشف الرواتب A4</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs font-black flex items-center gap-2 ${
            feedback.type === 'ok' ? 'bg-emerald-50 border-emerald-400 text-emerald-950' : 'bg-rose-50 border-rose-400 text-rose-900'
          }`}
        >
          {feedback.type === 'ok' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Nav */}
      <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-sm flex flex-wrap gap-1.5">
        {navItems.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubView(tab.id)}
            className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer ${
              subView === tab.id ? 'bg-[#0A1628] text-[#D4AF37]' : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {subView === 'dashboard' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">إجمالي العاملين على رأس العمل</div>
              <div className="text-2xl font-black text-[#0A1628] font-mono mt-1">{state.employees.length}</div>
              <div className="text-[11px] font-bold text-[#0D9488]">الأقسام الإدارية: {state.departments.length}</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">إجمالي الرواتب المستحقة ({activeRun?.monthKey})</div>
              <div className="text-2xl font-black text-[#1E40AF] font-mono mt-1">{payrollSummary.grossTotal.toLocaleString()} ج.م</div>
              <div className="text-[11px] font-bold text-emerald-700">الصافي: {payrollSummary.netTotal.toLocaleString()} ج.م</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">التأمينات وضريبة الدخل</div>
              <div className="text-2xl font-black text-rose-700 font-mono mt-1">
                {(payrollSummary.insuranceTotal + payrollSummary.taxTotal).toLocaleString()} ج.م
              </div>
              <div className="text-[11px] font-bold text-slate-500">
                حصة الموظف {state.policySettings.employeeInsuranceRatePct}%
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">السلف والترقيات القائمة</div>
              <div className="text-2xl font-black text-amber-700 font-mono mt-1">{state.loans.length} سلفة</div>
              <div className="text-[11px] font-bold text-slate-500">ترقيات مرصودة: {state.promotions.length}</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
            <h3 className="text-sm font-black text-[#0A1628]">توزيع إجمالي وصافي الرواتب حسب الأقسام الإدارية</h3>
            <div className="h-64 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptPayrollChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} />
                  <YAxis tick={{ fontSize: 11, fontWeight: 700 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="الإجمالي" fill="#1E40AF" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="الصافي" fill="#0D9488" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {subView === 'employees' && (
        <div className="space-y-4">
          {!isViewer && (
            <form onSubmit={handleAddEmployee} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black text-[#0A1628] flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-[#0D9488]" />
                  <span>إضافة موظف جديد (يتم فحص الرقم القومي 14 رقماً واستخراج الميلاد والنوع تلقائياً)</span>
                </span>
                {nidPreview && (
                  <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full ${nidPreview.valid ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'}`}>
                    {nidPreview.valid
                      ? `ميلاد: ${nidPreview.birthDate} · العمر: ${nidPreview.ageYears} سنة · النوع: ${nidPreview.gender}`
                      : nidPreview.error}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-6 gap-2.5 text-xs">
                <input type="text" value={newFullName} onChange={(e) => setNewFullName(e.target.value)} placeholder="الاسم رباعي *" className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold sm:col-span-2" />
                <input type="text" value={newNationalId} onChange={(e) => setNewNationalId(e.target.value)} placeholder="الرقم القومي (14 رقم) *" className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
                <input type="text" value={newEmpCode} onChange={(e) => setNewEmpCode(e.target.value)} placeholder="الكود الوظيفي (اختياري)" className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
                <select value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold">
                  {state.departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
                <input type="text" value={newJobTitle} onChange={(e) => setNewJobTitle(e.target.value)} placeholder="المسمى الوظيفي" className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold" />
                <input type="number" value={newFunctionalWage} onChange={(e) => setNewFunctionalWage(Number(e.target.value) || 0)} placeholder="الأجر الوظيفي" className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
                <input type="number" value={newComplementaryWage} onChange={(e) => setNewComplementaryWage(Number(e.target.value) || 0)} placeholder="الأجر المكمل" className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
                <input type="number" value={newInsurableWage} onChange={(e) => setNewInsurableWage(Number(e.target.value) || 0)} placeholder="الأجر التأميني" className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
                <button type="submit" className="px-4 py-2 bg-[#0D9488] text-white rounded-xl font-black cursor-pointer sm:col-span-3">
                  حفظ وإدراج بالخدمة
                </button>
              </div>
            </form>
          )}

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="relative max-w-md text-xs">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input type="text" value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} placeholder="بحث بالاسم، الكود، الرقم القومي، أو القسم..." className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead className="bg-[#0A1628] text-white font-black">
                  <tr>
                    <th className="py-2 px-2 border border-slate-700">الكود</th>
                    <th className="py-2 px-2 border border-slate-700 text-right">الاسم بالكامل</th>
                    <th className="py-2 px-2 border border-slate-700">الرقم القومي</th>
                    <th className="py-2 px-2 border border-slate-700">الميلاد / النوع</th>
                    <th className="py-2 px-2 border border-slate-700">القسم والمسمى</th>
                    <th className="py-2 px-2 border border-slate-700">الوظيفي + المكمل</th>
                    <th className="py-2 px-2 border border-slate-700">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {filteredEmployees.map((emp) => (
                    <tr key={emp.id}>
                      <td className="py-2 px-2 font-mono">{emp.employeeCode}</td>
                      <td className="py-2 px-2 text-right font-black text-[#0A1628]">{emp.fullName}</td>
                      <td className="py-2 px-2 font-mono">{emp.nationalId}</td>
                      <td className="py-2 px-2 font-mono">{emp.birthDate} ({emp.gender})</td>
                      <td className="py-2 px-2">{emp.departmentName} — {emp.jobTitle}</td>
                      <td className="py-2 px-2 font-mono text-[#0D9488]">{(emp.functionalWage + emp.complementaryWage).toLocaleString()} ج.م</td>
                      <td className="py-2 px-2">{emp.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subView === 'attendance' && (
        <div className="space-y-4">
          {!isViewer && (
            <form onSubmit={handleAddAttendance} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
              <select value={attEmpId} onChange={(e) => setAttEmpId(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold">
                {state.employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
              </select>
              <input type="time" value={attActualIn} onChange={(e) => setAttActualIn(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
              <input type="time" value={attActualOut} onChange={(e) => setAttActualOut(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
              <button type="submit" className="px-4 py-2 bg-[#0D9488] text-white rounded-xl font-black cursor-pointer">
                تسجيل حضور واحتساب التأخير
              </button>
            </form>
          )}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
              <thead className="bg-[#0A1628] text-white font-black">
                <tr>
                  <th className="py-2 px-2 border border-slate-700">الموظف</th>
                  <th className="py-2 px-2 border border-slate-700">التاريخ</th>
                  <th className="py-2 px-2 border border-slate-700">الحضور / الانصراف</th>
                  <th className="py-2 px-2 border border-slate-700">التأخير (دقيقة)</th>
                  <th className="py-2 px-2 border border-slate-700">انصراف مبكر</th>
                  <th className="py-2 px-2 border border-slate-700">صافي العمل (دقيقة)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {state.attendance.map((a) => {
                  const emp = state.employees.find((e) => e.id === a.employeeId);
                  return (
                    <tr key={a.id}>
                      <td className="py-2 px-2 font-black">{emp?.fullName || a.employeeId}</td>
                      <td className="py-2 px-2 font-mono">{a.date}</td>
                      <td className="py-2 px-2 font-mono">{a.actualIn} - {a.actualOut}</td>
                      <td className="py-2 px-2 font-mono text-rose-700">{a.lateMinutes} د</td>
                      <td className="py-2 px-2 font-mono text-amber-700">{a.earlyLeaveMinutes} د</td>
                      <td className="py-2 px-2 font-mono text-[#0D9488]">{a.netWorkedMinutes} د</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subView === 'leaves' && (
        <div className="space-y-4">
          {!isViewer && (
            <form onSubmit={handleSubmitLeave} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-5 gap-2.5 text-xs">
              <select value={leaveEmpId} onChange={(e) => setLeaveEmpId(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold">
                {state.employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
              </select>
              <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveCategory)} className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold">
                <option value="اعتيادية">اعتيادية</option>
                <option value="عارضة">عارضة</option>
                <option value="مرضية">مرضية</option>
                <option value="رسمية">رسمية</option>
                <option value="بدون أجر">بدون أجر</option>
              </select>
              <input type="date" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
              <input type="date" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
              <button type="submit" className="px-4 py-2 bg-[#0D9488] text-white rounded-xl font-black cursor-pointer">
                اعتماد وخصم من الرصيد المستقل
              </button>
            </form>
          )}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
              <thead className="bg-[#0A1628] text-white font-black">
                <tr>
                  <th className="py-2 px-2 border border-slate-700">الموظف</th>
                  <th className="py-2 px-2 border border-slate-700">فئة الإجازة المستقلة</th>
                  <th className="py-2 px-2 border border-slate-700">مرحل</th>
                  <th className="py-2 px-2 border border-slate-700">مستحق</th>
                  <th className="py-2 px-2 border border-slate-700">مستخدم</th>
                  <th className="py-2 px-2 border border-slate-700">المتبقي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {state.leaveBalances.map((b, i) => {
                  const emp = state.employees.find((e) => e.id === b.employeeId);
                  return (
                    <tr key={`${b.employeeId}-${b.leaveType}-${i}`}>
                      <td className="py-2 px-2 font-black">{emp?.fullName || b.employeeId}</td>
                      <td className="py-2 px-2">{b.leaveType}</td>
                      <td className="py-2 px-2 font-mono">{b.previousBalance}</td>
                      <td className="py-2 px-2 font-mono">{b.entitledDays}</td>
                      <td className="py-2 px-2 font-mono text-rose-700">{b.usedDays}</td>
                      <td className="py-2 px-2 font-mono font-black text-[#0D9488]">{computeRemainingLeaveBalance(b)} يوم</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subView === 'payroll' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <input type="month" value={payrollMonth} onChange={(e) => setPayrollMonth(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
              {!isViewer && (
                <button type="button" onClick={handleRunOrRecalculatePayroll} className="px-4 py-2 bg-[#0D9488] hover:bg-teal-700 text-white rounded-xl font-black cursor-pointer">
                  احتساب / معاينة مسير الشهر
                </button>
              )}
              {!isViewer && activeRun && activeRun.status === 'معاينة' && (
                <button type="button" onClick={() => handleApprovePayrollLock(activeRun.id)} className="px-4 py-2 bg-[#0A1628] text-[#D4AF37] rounded-xl font-black cursor-pointer flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" />
                  <span>اعتماد وإقفال نهائي</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <select value={activeRun?.id || ''} onChange={(e) => setSelectedRunId(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold">
                {state.payrollRuns.map((r) => (
                  <option key={r.id} value={r.id}>مسير {r.monthKey} ({r.status})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
              <thead className="bg-[#0A1628] text-white font-black">
                <tr>
                  <th className="py-2 px-2 border border-slate-700">الكود</th>
                  <th className="py-2 px-2 border border-slate-700 text-right">الموظف</th>
                  <th className="py-2 px-2 border border-slate-700">الاستحقاق الإجمالي</th>
                  <th className="py-2 px-2 border border-slate-700">تأمين الموظف</th>
                  <th className="py-2 px-2 border border-slate-700">ضريبة الدخل</th>
                  <th className="py-2 px-2 border border-slate-700">أقساط السلف</th>
                  <th className="py-2 px-2 border border-slate-700">الصافي المنصرف</th>
                  <th className="py-2 px-2 border border-slate-700">مفردات فردية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {(activeRun?.lines || []).map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 px-2 font-mono">{l.employeeCode}</td>
                    <td className="py-2 px-2 text-right font-black text-[#0A1628]">{l.employeeName}</td>
                    <td className="py-2 px-2 font-mono">{l.grossEarnings.toLocaleString()}</td>
                    <td className="py-2 px-2 font-mono text-amber-800">{l.employeeInsurance.toLocaleString()}</td>
                    <td className="py-2 px-2 font-mono text-rose-700">{l.monthlyIncomeTax.toLocaleString()}</td>
                    <td className="py-2 px-2 font-mono">
                      {l.loanInstallmentDeduction.toLocaleString()}
                      {l.exceedsLegalDeductionCeiling && (
                        <span className="block text-[10px] text-rose-700 font-black">تجاوز سقف الاستقطاع!</span>
                      )}
                    </td>
                    <td className="py-2 px-2 font-mono font-black text-[#0D9488]">{l.netSalary.toLocaleString()} ج.م</td>
                    <td className="py-2 px-2">
                      <button
                        type="button"
                        onClick={() =>
                          printModuleReportA4({
                            title: `مفردات راتب فردية — شهر ${activeRun?.monthKey}`,
                            subtitle: `${l.employeeName} (${l.employeeCode}) — ${l.departmentName}`,
                            branchName,
                            headers: ['البند', 'المبلغ (جنيه مصري)'],
                            rows: [
                              ['الأجر الوظيفي', l.functionalWage],
                              ['الأجر المكمل', l.complementaryWage],
                              ['العلاوات والبدلات', l.allowancesAndRaises],
                              ['الحوافز والمكافآت', l.incentivesAndRewards],
                              ['إجمالي الاستحقاقات', l.grossEarnings],
                              ['حصة التأمينات الاجتماعية', -l.employeeInsurance],
                              ['ضريبة كسب العمل الشهرية', -l.monthlyIncomeTax],
                              ['أقساط السلف', -l.loanInstallmentDeduction],
                              ['صافي الراتب المستحق', l.netSalary],
                            ],
                            preparedBy: currentUser?.fullName,
                          })
                        }
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[11px] font-black cursor-pointer"
                      >
                        طباعة مفردات
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subView === 'loans_promotions' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-sm font-black text-[#0A1628]">السلف والأقساط الشهرية</h3>
            {!isViewer && (
              <form onSubmit={handleAddLoan} className="grid grid-cols-3 gap-2 text-xs">
                <select value={loanEmpId} onChange={(e) => setLoanEmpId(e.target.value)} className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold">
                  {state.employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
                <input type="number" value={loanAmount} onChange={(e) => setLoanAmount(Number(e.target.value) || 0)} placeholder="قيمة السلفة" className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
                <input type="number" value={loanInstallments} onChange={(e) => setLoanInstallments(Number(e.target.value) || 1)} placeholder="عدد الأقساط" className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
                <button type="submit" className="col-span-3 py-2 bg-[#0D9488] text-white rounded-xl font-black cursor-pointer">
                  تسجيل سلفة وجدولة الأقساط
                </button>
              </form>
            )}
            <div className="divide-y divide-slate-200 text-xs">
              {state.loans.map((ln) => {
                const emp = state.employees.find((e) => e.id === ln.employeeId);
                return (
                  <div key={ln.id} className="py-2 flex items-center justify-between">
                    <div>
                      <div className="font-black text-[#0A1628]">{ln.loanNumber} — {emp?.fullName}</div>
                      <div className="text-slate-500 font-bold">القسط: {ln.installmentAmount} ج.م × {ln.installmentsCount} شهر</div>
                    </div>
                    <span className="font-mono font-black text-rose-700">متبقي: {ln.remainingAmount.toLocaleString()} ج.م</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-sm font-black text-[#0A1628] flex items-center gap-1.5">
              <Award className="w-4 h-4 text-[#D4AF37]" />
              <span>حاسبة مدة الخدمة الدقيقة ونهاية الخدمة</span>
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">تاريخ التعيين</label>
                <input type="date" value={eosStart} onChange={(e) => setEosStart(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">تاريخ نهاية الخدمة / الحساب</label>
                <input type="date" value={eosEnd} onChange={(e) => setEosEnd(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
              </div>
            </div>
            {eosDuration && (
              <div className="p-3 bg-[#0A1628] text-white rounded-xl text-xs font-black flex items-center justify-between">
                <span>مدة الخدمة الفعلية:</span>
                <span className="font-mono text-[#D4AF37]">
                  {eosDuration.years} سنة · {eosDuration.months} شهر · {eosDuration.days} يوم
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {subView === 'settings' && (
        <form onSubmit={handleSavePolicySettings} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 text-xs">
          <h3 className="text-sm font-black text-[#0A1628]">
            الإعدادات المرنة للتأمينات الاجتماعية وشرائح الضرائب التصاعدية (لا توجد نسب ثابتة مقيدة)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">حصة الموظف للتأمينات %</label>
              <input type="number" step="0.25" value={policyDraft.employeeInsuranceRatePct} onChange={(e) => setPolicyDraft({ ...policyDraft, employeeInsuranceRatePct: Number(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">الحد الأدنى التأميني</label>
              <input type="number" value={policyDraft.minInsurableWage} onChange={(e) => setPolicyDraft({ ...policyDraft, minInsurableWage: Number(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">الحد الأقصى التأميني</label>
              <input type="number" value={policyDraft.maxInsurableWage} onChange={(e) => setPolicyDraft({ ...policyDraft, maxInsurableWage: Number(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">الإعفاء الضريبي السنوي</label>
              <input type="number" value={policyDraft.annualTaxExemptionAmount} onChange={(e) => setPolicyDraft({ ...policyDraft, annualTaxExemptionAmount: Number(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">أساس احتساب اليوم</label>
              <select value={policyDraft.dayCalculationBasis} onChange={(e) => setPolicyDraft({ ...policyDraft, dayCalculationBasis: Number(e.target.value) as 30 | 22 | 26 })} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold">
                <option value={30}>30 يوماً (شهر قياسي)</option>
                <option value={26}>26 يوم عمل</option>
                <option value={22}>22 يوم عمل</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">سقف خصم السلف %</label>
              <input type="number" value={policyDraft.maxLoanDeductionCeilingPct} onChange={(e) => setPolicyDraft({ ...policyDraft, maxLoanDeductionCeilingPct: Number(e.target.value) || 25 })} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">مرجع القرار / اللائحة</label>
              <input type="text" value={policyDraft.lawDecisionReference} onChange={(e) => setPolicyDraft({ ...policyDraft, lawDecisionReference: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold" />
            </div>
          </div>

          {/* Configurable Tax Brackets */}
          <div className="space-y-2 border-t border-slate-200 pt-3">
            <div className="font-black text-[#0A1628]">شرائح ضريبة الدخل التصاعدية السنوية (قابلة للتعديل):</div>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              {policyDraft.taxBrackets.map((tb, idx) => (
                <div key={tb.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <div className="text-[11px] font-bold text-slate-500">
                    من {tb.minAnnual.toLocaleString()} {tb.maxAnnual ? `إلى ${tb.maxAnnual.toLocaleString()}` : 'فأكثر'}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-bold">النسبة %:</span>
                    <input
                      type="number"
                      step="0.5"
                      value={tb.ratePct}
                      onChange={(e) => {
                        const rate = Number(e.target.value) || 0;
                        setPolicyDraft({
                          ...policyDraft,
                          taxBrackets: policyDraft.taxBrackets.map((x, i) =>
                            i === idx ? { ...x, ratePct: rate } : x
                          ),
                        });
                      }}
                      className="w-16 px-2 py-1 bg-white border border-slate-300 rounded font-mono font-black"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {!isViewer && (
            <button type="submit" className="px-5 py-2.5 bg-[#0A1628] text-[#D4AF37] rounded-xl font-black cursor-pointer">
              اعتماد وحفظ نسخة جديدة من اللائحة المالية
            </button>
          )}
        </form>
      )}

      {subView === 'audit' && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-xs text-center border-collapse">
            <thead className="bg-[#0A1628] text-white font-black">
              <tr>
                <th className="py-2 px-2 border border-slate-700">الوقت</th>
                <th className="py-2 px-2 border border-slate-700">المستخدم</th>
                <th className="py-2 px-2 border border-slate-700">الإجراء</th>
                <th className="py-2 px-2 border border-slate-700 text-right">التفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-bold">
              {state.auditLogs.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 px-2 font-mono">{new Date(a.timestamp).toLocaleString('ar-EG')}</td>
                  <td className="py-2 px-2">{a.userFullName}</td>
                  <td className="py-2 px-2 text-[#0D9488]">{a.actionType}</td>
                  <td className="py-2 px-2 text-right">{a.afterSummary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
