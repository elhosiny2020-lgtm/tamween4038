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
  HrDepartment,
  HrAttendanceRecord,
  HrLeaveBalance,
  HrLeaveRequest,
  HrLoanRecord,
  HrPromotionRecord,
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
import {
  resolveModuleCrudPermissions,
  checkHrDeleteIntegrity,
} from '../../utils/moduleCrudHelpers';
import {
  ModuleTableToolbar,
  ModuleRowActions,
  ModuleFormModal,
  ModuleDeleteConfirmModal,
  type CrudFieldDefinition,
} from './ModuleCrudShared';

export type HrSubView =
  | 'dashboard'
  | 'employees'
  | 'public_service_contracts'
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
  onChangeState: (next: HrModuleState, actionSummary?: string) => void;
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
  const permissions = useMemo(() => resolveModuleCrudPermissions(currentUser), [currentUser]);
  const isViewer = permissions.isReadOnly;

  const [empSearch, setEmpSearch] = useState('');
  // New Employee Quick Form
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

  // Attendance quick form
  const [attEmpId, setAttEmpId] = useState(state.employees[0]?.id || '');
  const [attActualIn, setAttActualIn] = useState('08:10');
  const [attActualOut, setAttActualOut] = useState('14:00');

  // Leave request quick form
  const [leaveEmpId, setLeaveEmpId] = useState(state.employees[0]?.id || '');
  const [leaveType, setLeaveType] = useState<LeaveCategory>('اعتيادية');
  const [leaveStart, setLeaveStart] = useState(new Date().toISOString().split('T')[0]);
  const [leaveEnd, setLeaveEnd] = useState(new Date().toISOString().split('T')[0]);

  // Payroll Month Runner
  const [payrollMonth, setPayrollMonth] = useState(
    state.payrollRuns[0]?.monthKey || new Date().toISOString().slice(0, 7)
  );
  const [selectedRunId, setSelectedRunId] = useState(state.payrollRuns[0]?.id || '');

  // Loan quick form
  const [loanEmpId, setLoanEmpId] = useState(state.employees[0]?.id || '');
  const [loanAmount, setLoanAmount] = useState<number>(6000);
  const [loanInstallments, setLoanInstallments] = useState<number>(12);

  // End of Service calculator
  const [eosStart, setEosStart] = useState('2010-03-01');
  const [eosEnd, setEosEnd] = useState(new Date().toISOString().split('T')[0]);

  // Policy Settings Draft
  const [policyDraft, setPolicyDraft] = useState<HrPolicySettingsVersion>(state.policySettings);

  // Unified CRUD Modal State
  const [formModalState, setFormModalState] = useState<{
    isOpen: boolean;
    mode: 'add' | 'edit';
    entityKey:
      | 'employee'
      | 'department'
      | 'attendance'
      | 'leave_balance'
      | 'leave_request'
      | 'loan'
      | 'promotion'
      | 'payroll_run';
    title: string;
    fields: CrudFieldDefinition[];
    initialValues: Record<string, any>;
    targetId?: string;
  } | null>(null);

  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    entityType:
      | 'employee'
      | 'department'
      | 'attendance'
      | 'leave_balance'
      | 'leave_request'
      | 'payroll_run'
      | 'loan'
      | 'promotion';
    entityTitle: string;
    entityId: string;
    recordSummary: { label: string; value: string | number }[];
  } | null>(null);

  const notify = (type: 'ok' | 'err', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  const appendAudit = (
    actionType: ModuleAuditLog['actionType'],
    entityName: string,
    entityId: string,
    afterSummary: string,
    beforeSummary?: string
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
    beforeSummary,
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

  // Field definitions for Unified CRUD Modals
  const getEmployeeFields = (): CrudFieldDefinition[] => [
    { key: 'employeeCode', label: 'الكود الوظيفي', type: 'text', required: true, placeholder: 'EMP-1005' },
    { key: 'fullName', label: 'الاسم رباعي بالكامل', type: 'text', required: true },
    {
      key: 'nationalId',
      label: 'الرقم القومي المصري (14 رقم)',
      type: 'text',
      required: true,
      helperText: 'يتم التحقق من صحة الرقم القومي واستخراج تاريخ الميلاد والنوع آلياً',
    },
    {
      key: 'departmentName',
      label: 'القسم الإداري',
      type: 'select',
      required: true,
      options: state.departments.map((d) => ({ value: d.name, label: d.name })),
    },
    { key: 'jobTitle', label: 'المسمى الوظيفي', type: 'text', required: true },
    { key: 'jobGrade', label: 'الدرجة المالية', type: 'text', required: true, placeholder: 'الأولى / الثانية / الثالثة' },
    {
      key: 'status',
      label: 'الحالة الوظيفية',
      type: 'select',
      required: true,
      options: [
        { value: 'على رأس العمل', label: 'على رأس العمل' },
        { value: 'إجازة', label: 'إجازة' },
        { value: 'منتدب', label: 'منتدب' },
        { value: 'موقوف', label: 'موقوف' },
        { value: 'منتهي الخدمة', label: 'منتهي الخدمة' },
      ],
    },
    { key: 'hireDate', label: 'تاريخ التعيين', type: 'date', required: true },
    { key: 'functionalWage', label: 'الأجر الوظيفي (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'complementaryWage', label: 'الأجر المكمل (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'periodicAllowances', label: 'العلاوات الدورية (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'specialAllowances', label: 'العلاوات الخاصة (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'monthlyIncentives', label: 'الحوافز الشهرية (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'insurableWage', label: 'الأجر التأميني (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'manualDeductions', label: 'استقطاعات يدوية (ج.م)', type: 'number', min: 0 },
    { key: 'penalties', label: 'الجزاءات المالية (ج.م)', type: 'number', min: 0 },
  ];

  const getDepartmentFields = (): CrudFieldDefinition[] => [
    { key: 'name', label: 'اسم القسم / الإدارة الفرعية', type: 'text', required: true },
    { key: 'managerName', label: 'مدير القسم المسؤول', type: 'text', required: true },
  ];

  const getAttendanceFields = (): CrudFieldDefinition[] => [
    {
      key: 'employeeId',
      label: 'الموظف',
      type: 'select',
      required: true,
      options: state.employees.map((e) => ({ value: e.id, label: `${e.employeeCode} — ${e.fullName}` })),
    },
    { key: 'date', label: 'التاريخ', type: 'date', required: true },
    { key: 'officialStart', label: 'ميعاد الحضور الرسمي', type: 'time', required: true },
    { key: 'officialEnd', label: 'ميعاد الانصراف الرسمي', type: 'time', required: true },
    { key: 'actualIn', label: 'وقت الحضور الفعلي', type: 'time', required: true },
    { key: 'actualOut', label: 'وقت الانصراف الفعلي', type: 'time', required: true },
    { key: 'breakMinutes', label: 'دقائق الراحة المسموحة', type: 'number', min: 0 },
    {
      key: 'status',
      label: 'حالة اليوم',
      type: 'select',
      required: true,
      options: [
        { value: 'حضور', label: 'حضور' },
        { value: 'غياب بإذن', label: 'غياب بإذن' },
        { value: 'غياب بدون إذن', label: 'غياب بدون إذن' },
        { value: 'مأمورية', label: 'مأمورية' },
        { value: 'إجازة معتمدة', label: 'إجازة معتمدة' },
      ],
    },
  ];

  const getLeaveBalanceFields = (): CrudFieldDefinition[] => [
    {
      key: 'employeeId',
      label: 'الموظف',
      type: 'select',
      required: true,
      options: state.employees.map((e) => ({ value: e.id, label: `${e.employeeCode} — ${e.fullName}` })),
    },
    {
      key: 'leaveType',
      label: 'فئة الإجازة المستقلة',
      type: 'select',
      required: true,
      options: [
        { value: 'اعتيادية', label: 'اعتيادية' },
        { value: 'عارضة', label: 'عارضة' },
        { value: 'مرضية', label: 'مرضية' },
        { value: 'رسمية', label: 'رسمية' },
        { value: 'بدون أجر', label: 'بدون أجر' },
        { value: 'وضع', label: 'وضع' },
        { value: 'حج', label: 'حج' },
        { value: 'مأمورية', label: 'مأمورية' },
        { value: 'إذن رسمي', label: 'إذن رسمي' },
      ],
    },
    { key: 'previousBalance', label: 'الرصيد المرحل من سنوات سابقة (يوم)', type: 'number', required: true, min: 0 },
    { key: 'entitledDays', label: 'الرصيد المستحق للعام الحالي (يوم)', type: 'number', required: true, min: 0 },
    { key: 'usedDays', label: 'الأيام المستنفدة فعلياً (يوم)', type: 'number', required: true, min: 0 },
  ];

  const getLeaveRequestFields = (): CrudFieldDefinition[] => [
    {
      key: 'employeeId',
      label: 'الموظف',
      type: 'select',
      required: true,
      options: state.employees.map((e) => ({ value: e.id, label: `${e.employeeCode} — ${e.fullName}` })),
    },
    {
      key: 'leaveType',
      label: 'نوع الإجازة',
      type: 'select',
      required: true,
      options: [
        { value: 'اعتيادية', label: 'اعتيادية' },
        { value: 'عارضة', label: 'عارضة' },
        { value: 'مرضية', label: 'مرضية' },
        { value: 'رسمية', label: 'رسمية' },
        { value: 'بدون أجر', label: 'بدون أجر' },
      ],
    },
    { key: 'startDate', label: 'تاريخ بداية الإجازة', type: 'date', required: true },
    { key: 'endDate', label: 'تاريخ نهاية الإجازة', type: 'date', required: true },
    {
      key: 'status',
      label: 'حالة الطلب',
      type: 'select',
      required: true,
      options: [
        { value: 'معتمد', label: 'معتمد' },
        { value: 'قيد المراجعة', label: 'قيد المراجعة' },
        { value: 'مرفوض', label: 'مرفوض' },
      ],
    },
    { key: 'notes', label: 'ملاحظات القرار الإداري', type: 'textarea', colSpan: 2 },
  ];

  const getLoanFields = (): CrudFieldDefinition[] => [
    { key: 'loanNumber', label: 'رقم السلفة', type: 'text', required: true },
    {
      key: 'employeeId',
      label: 'الموظف المستفيد',
      type: 'select',
      required: true,
      options: state.employees.map((e) => ({ value: e.id, label: `${e.employeeCode} — ${e.fullName}` })),
    },
    { key: 'totalAmount', label: 'إجمالي مبلغ السلفة (ج.م)', type: 'number', required: true, min: 1 },
    { key: 'disbursedDate', label: 'تاريخ الصرف', type: 'date', required: true },
    { key: 'installmentsCount', label: 'إجمالي عدد الأقساط (شهر)', type: 'number', required: true, min: 1 },
    { key: 'paidInstallments', label: 'عدد الأقساط المسددة حتى الآن', type: 'number', required: true, min: 0 },
    {
      key: 'status',
      label: 'حالة السلفة',
      type: 'select',
      required: true,
      options: [
        { value: 'سارية', label: 'سارية' },
        { value: 'مسددة بالكامل', label: 'مسددة بالكامل' },
        { value: 'مؤجلة', label: 'مؤجلة' },
      ],
    },
  ];

  const getPromotionFields = (): CrudFieldDefinition[] => [
    {
      key: 'employeeId',
      label: 'الموظف',
      type: 'select',
      required: true,
      options: state.employees.map((e) => ({ value: e.id, label: `${e.employeeCode} — ${e.fullName}` })),
    },
    { key: 'decisionNumber', label: 'رقم قرار الترقية / العلاوة', type: 'text', required: true },
    { key: 'dueDate', label: 'تاريخ الاستحقاق / السريان', type: 'date', required: true },
    { key: 'previousPromotionDate', label: 'تاريخ الترقية السابقة', type: 'date', required: true },
    { key: 'currentGrade', label: 'الدرجة المالية الحالية', type: 'text', required: true },
    { key: 'nextGrade', label: 'الدرجة المالية الجديدة', type: 'text', required: true },
    { key: 'raiseBasisAmount', label: 'وعاء حساب العلاوة (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'raisePct', label: 'نسبة العلاوة %', type: 'number', required: true, min: 0, step: '0.5' },
    { key: 'raiseAmount', label: 'قيمة العلاوة المضافة للأجر (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'applied', label: 'تم التطبيق في مسير الرواتب', type: 'checkbox' },
  ];

  const rebuildDraftPayrollRuns = (
    nextEmployees: HrEmployee[],
    nextLoans: HrLoanRecord[],
    currentRuns: HrPayrollPeriodRun[]
  ): HrPayrollPeriodRun[] => {
    return currentRuns.map((run) => {
      if (run.status === 'معتمد') return run;
      const lines = nextEmployees.map((emp) =>
        computeEmployeePayrollLine({
          employee: emp,
          policy: state.policySettings,
          activeLoans: nextLoans,
          unexcusedAbsenceDays: 0,
        })
      );
      return { ...run, lines };
    });
  };

  const handleModalSubmit = (values: Record<string, any>): string | null => {
    if (!formModalState) return null;
    const nowIso = new Date().toISOString();
    const { mode, entityKey, targetId } = formModalState;

    if (entityKey === 'employee') {
      const fullName = String(values.fullName || '').trim();
      const nationalId = String(values.nationalId || '').trim();
      const employeeCode = String(values.employeeCode || '').trim();
      if (!fullName || !nationalId || !employeeCode) return 'يرجى استكمال الاسم، الرقم القومي، والكود الوظيفي.';

      const parsedNid = parseEgyptianNationalId(nationalId);
      if (!parsedNid.valid) return parsedNid.error || 'الرقم القومي غير صحيح.';

      const duplicateNid = state.employees.some(
        (e) => e.nationalId === nationalId && (mode === 'add' || e.id !== targetId)
      );
      if (duplicateNid) return 'الرقم القومي مسجل بالفعل لموظف آخر.';

      const duplicateCode = state.employees.some(
        (e) => e.employeeCode === employeeCode && (mode === 'add' || e.id !== targetId)
      );
      if (duplicateCode) return `الكود الوظيفي (${employeeCode}) مسجل مسبقاً.`;

      const existing = state.employees.find((e) => e.id === targetId);
      const empObj: HrEmployee = {
        id: mode === 'add' ? `${branchId}-emp-${Date.now()}` : String(targetId),
        branchId,
        employeeCode,
        nationalId,
        fullName,
        birthDate: parsedNid.birthDate || existing?.birthDate || '1990-01-01',
        gender: parsedNid.gender || existing?.gender || 'ذكر',
        maritalStatus: existing?.maritalStatus || 'متزوج',
        childrenCount: existing?.childrenCount || 0,
        address: existing?.address || branchName,
        governorate: 'الغربية',
        district: branchName,
        village: existing?.village || 'المدينة',
        phone: existing?.phone || '',
        jobTitle: String(values.jobTitle || 'مفتش تموين').trim(),
        qualitativeGroup: existing?.qualitativeGroup || 'التنمية الإدارية',
        jobGrade: String(values.jobGrade || 'الثالثة').trim(),
        jobLevel: existing?.jobLevel || 'أ',
        departmentName: String(values.departmentName || state.departments[0]?.name || 'الإدارة'),
        unitSection: String(values.departmentName || 'الإدارة'),
        workEntity: branchName,
        workSite: branchName,
        hireDate: String(values.hireDate || nowIso.split('T')[0]),
        startWorkDate: String(values.hireDate || nowIso.split('T')[0]),
        appointmentType: existing?.appointmentType || 'تعيين دائم',
        appointmentDecisionNo: existing?.appointmentDecisionNo || 'قرار إداري',
        status: values.status as HrEmployee['status'],
        directManager: existing?.directManager || 'مدير الإدارة',
        fileNumber: existing?.fileNumber || `FILE-${employeeCode}`,
        functionalWage: Math.max(0, Number(values.functionalWage) || 0),
        complementaryWage: Math.max(0, Number(values.complementaryWage) || 0),
        periodicAllowances: Math.max(0, Number(values.periodicAllowances) || 0),
        specialAllowances: Math.max(0, Number(values.specialAllowances) || 0),
        monthlyIncentives: Math.max(0, Number(values.monthlyIncentives) || 0),
        rewards: existing?.rewards || 0,
        allowancesTotal: existing?.allowancesTotal || 0,
        extraEntitlements: existing?.extraEntitlements || 0,
        insurableWage: Math.max(0, Number(values.insurableWage) || 0),
        manualDeductions: Math.max(0, Number(values.manualDeductions) || 0),
        penalties: Math.max(0, Number(values.penalties) || 0),
        updatedAt: nowIso,
      };

      const nextEmployees =
        mode === 'add'
          ? [...state.employees, empObj]
          : state.employees.map((e) => (e.id === targetId ? empObj : e));

      const nextLeaveBalances =
        mode === 'add'
          ? [
              ...state.leaveBalances,
              { employeeId: empObj.id, leaveType: 'اعتيادية' as const, previousBalance: 0, entitledDays: 21, usedDays: 0, updatedAt: nowIso },
              { employeeId: empObj.id, leaveType: 'عارضة' as const, previousBalance: 0, entitledDays: 7, usedDays: 0, updatedAt: nowIso },
            ]
          : state.leaveBalances;

      onChangeState(
        {
          ...state,
          employees: nextEmployees,
          leaveBalances: nextLeaveBalances,
          payrollRuns: rebuildDraftPayrollRuns(nextEmployees, state.loans, state.payrollRuns),
          auditLogs: [
            appendAudit(mode === 'add' ? 'إضافة' : 'تعديل', 'ملف الموظفين', empObj.id, `${empObj.fullName} (${empObj.employeeCode})`),
            ...state.auditLogs,
          ],
        },
        `${mode === 'add' ? 'إضافة' : 'تعديل'} موظف: ${empObj.fullName}`
      );
      notify('ok', `تم ${mode === 'add' ? 'إضافة' : 'تعديل'} بيانات الموظف (${empObj.fullName}) وتحديث مسيرات المعاينة تلقائياً.`);
      return null;
    }

    if (entityKey === 'department') {
      const name = String(values.name || '').trim();
      if (!name) return 'يرجى إدخال اسم القسم الإداري.';
      const dept: HrDepartment = {
        id: mode === 'add' ? `${branchId}-dept-${Date.now()}` : String(targetId),
        branchId,
        name,
        managerName: String(values.managerName || 'مدير القسم').trim(),
        updatedAt: nowIso,
      };
      onChangeState(
        {
          ...state,
          departments:
            mode === 'add'
              ? [...state.departments, dept]
              : state.departments.map((d) => (d.id === targetId ? dept : d)),
          auditLogs: [
            appendAudit(mode === 'add' ? 'إضافة' : 'تعديل', 'الأقسام الإدارية', dept.id, dept.name),
            ...state.auditLogs,
          ],
        },
        `${mode === 'add' ? 'إضافة' : 'تعديل'} قسم إداري: ${dept.name}`
      );
      notify('ok', `تم ${mode === 'add' ? 'إضافة' : 'تعديل'} القسم الإداري (${dept.name}).`);
      return null;
    }

    if (entityKey === 'attendance') {
      const officialStart = String(values.officialStart || '08:00');
      const officialEnd = String(values.officialEnd || '14:00');
      const actualIn = String(values.actualIn || '08:00');
      const actualOut = String(values.actualOut || '14:00');
      const breakMinutes = Math.max(0, Number(values.breakMinutes) || 0);
      const metrics = computeAttendanceMetrics({
        officialStart,
        officialEnd,
        actualIn,
        actualOut,
        breakMinutes,
      });
      const attDate = String(values.date || nowIso.split('T')[0]);
      const rec: HrAttendanceRecord = {
        id: mode === 'add' ? `${branchId}-att-${Date.now()}` : String(targetId),
        branchId,
        employeeId: String(values.employeeId),
        date: attDate,
        monthKey: attDate.slice(0, 7),
        officialStart,
        officialEnd,
        actualIn,
        actualOut,
        breakMinutes,
        lateMinutes: metrics.lateMinutes,
        earlyLeaveMinutes: metrics.earlyLeaveMinutes,
        netWorkedMinutes: metrics.netWorkedMinutes,
        status: values.status as HrAttendanceRecord['status'],
        updatedAt: nowIso,
      };
      onChangeState(
        {
          ...state,
          attendance:
            mode === 'add'
              ? [rec, ...state.attendance]
              : state.attendance.map((a) => (a.id === targetId ? rec : a)),
          auditLogs: [
            appendAudit(
              mode === 'add' ? 'إضافة' : 'تعديل',
              'سجل الحضور والانصراف',
              rec.id,
              `${rec.date} — تأخير ${rec.lateMinutes} دقيقة`
            ),
            ...state.auditLogs,
          ],
        },
        `${mode === 'add' ? 'إضافة' : 'تعديل'} سجل حضور: ${rec.date}`
      );
      notify('ok', `تم ${mode === 'add' ? 'تسجيل' : 'تعديل'} الحضور واحتساب التأخير (${rec.lateMinutes} د) وصافي العمل (${rec.netWorkedMinutes} د).`);
      return null;
    }

    if (entityKey === 'leave_balance') {
      const empId = String(values.employeeId);
      const lType = values.leaveType as LeaveCategory;
      const item: HrLeaveBalance = {
        employeeId: empId,
        leaveType: lType,
        previousBalance: Math.max(0, Number(values.previousBalance) || 0),
        entitledDays: Math.max(0, Number(values.entitledDays) || 0),
        usedDays: Math.max(0, Number(values.usedDays) || 0),
        updatedAt: nowIso,
      };
      const compositeKey = `${empId}__${lType}`;
      const existsIdx = state.leaveBalances.findIndex(
        (b) => `${b.employeeId}__${b.leaveType}` === (mode === 'edit' && targetId ? targetId : compositeKey)
      );
      const nextBalances =
        existsIdx >= 0
          ? state.leaveBalances.map((b, i) => (i === existsIdx ? item : b))
          : [...state.leaveBalances, item];

      onChangeState(
        {
          ...state,
          leaveBalances: nextBalances,
          auditLogs: [
            appendAudit(
              mode === 'add' ? 'إضافة' : 'تعديل',
              'أرصدة الإجازات',
              compositeKey,
              `${lType} — متبقي ${computeRemainingLeaveBalance(item)} يوم`
            ),
            ...state.auditLogs,
          ],
        },
        `تحديث رصيد إجازة (${lType})`
      );
      notify('ok', `تم حفظ رصيد الإجازة (${lType}) وتحديث المتبقي (${computeRemainingLeaveBalance(item)} يوم).`);
      return null;
    }

    if (entityKey === 'leave_request') {
      const days = computeLeaveDaysInclusive(String(values.startDate), String(values.endDate));
      if (days <= 0) return 'نطاق تاريخ الإجازة غير صحيح.';
      const req: HrLeaveRequest = {
        id: mode === 'add' ? `${branchId}-lr-${Date.now()}` : String(targetId),
        branchId,
        employeeId: String(values.employeeId),
        leaveType: values.leaveType as LeaveCategory,
        startDate: String(values.startDate),
        endDate: String(values.endDate),
        daysCount: days,
        status: values.status as HrLeaveRequest['status'],
        notes: String(values.notes || ''),
        updatedAt: nowIso,
      };
      onChangeState(
        {
          ...state,
          leaveRequests:
            mode === 'add'
              ? [req, ...state.leaveRequests]
              : state.leaveRequests.map((r) => (r.id === targetId ? req : r)),
          auditLogs: [
            appendAudit(
              mode === 'add' ? 'إضافة' : 'تعديل',
              'طلبات الإجازات',
              req.id,
              `${req.leaveType} — ${req.daysCount} يوم (${req.status})`
            ),
            ...state.auditLogs,
          ],
        },
        `${mode === 'add' ? 'إضافة' : 'تعديل'} طلب إجازة (${req.leaveType})`
      );
      notify('ok', `تم ${mode === 'add' ? 'إضافة' : 'تعديل'} طلب الإجازة (${req.leaveType}) لمدة ${days} يوم.`);
      return null;
    }

    if (entityKey === 'loan') {
      const totalAmount = Math.max(1, Number(values.totalAmount) || 0);
      const installmentsCount = Math.max(1, Number(values.installmentsCount) || 1);
      const paidInstallments = Math.min(
        installmentsCount,
        Math.max(0, Number(values.paidInstallments) || 0)
      );
      const installmentAmount = round2(totalAmount / installmentsCount);
      const remainingAmount = Math.max(
        0,
        round2(totalAmount - paidInstallments * installmentAmount)
      );
      const loan: HrLoanRecord = {
        id: mode === 'add' ? `${branchId}-ln-${Date.now()}` : String(targetId),
        branchId,
        loanNumber: String(values.loanNumber || `LN-${Date.now().toString().slice(-5)}`).trim(),
        employeeId: String(values.employeeId),
        totalAmount,
        disbursedDate: String(values.disbursedDate || nowIso.split('T')[0]),
        installmentsCount,
        installmentAmount,
        paidInstallments,
        remainingAmount,
        status:
          remainingAmount <= 0
            ? 'مسددة بالكامل'
            : (values.status as HrLoanRecord['status']) || 'سارية',
        updatedAt: nowIso,
      };
      const nextLoans =
        mode === 'add'
          ? [loan, ...state.loans]
          : state.loans.map((l) => (l.id === targetId ? loan : l));

      onChangeState(
        {
          ...state,
          loans: nextLoans,
          payrollRuns: rebuildDraftPayrollRuns(state.employees, nextLoans, state.payrollRuns),
          auditLogs: [
            appendAudit(
              mode === 'add' ? 'إضافة' : 'تعديل',
              'السلف والأقساط',
              loan.id,
              `${loan.loanNumber} — متبقي ${loan.remainingAmount} ج.م`
            ),
            ...state.auditLogs,
          ],
        },
        `${mode === 'add' ? 'إضافة' : 'تعديل'} سلفة: ${loan.loanNumber}`
      );
      notify('ok', `تم ${mode === 'add' ? 'تسجيل' : 'تعديل'} السلفة (${loan.loanNumber}) وتحديث الأقساط.`);
      return null;
    }

    if (entityKey === 'promotion') {
      const promo: HrPromotionRecord = {
        id: mode === 'add' ? `${branchId}-prm-${Date.now()}` : String(targetId),
        branchId,
        employeeId: String(values.employeeId),
        decisionNumber: String(values.decisionNumber || '').trim(),
        dueDate: String(values.dueDate || nowIso.split('T')[0]),
        previousPromotionDate: String(values.previousPromotionDate || nowIso.split('T')[0]),
        currentGrade: String(values.currentGrade || 'الثالثة').trim(),
        nextGrade: String(values.nextGrade || 'الثانية').trim(),
        raiseBasisAmount: Math.max(0, Number(values.raiseBasisAmount) || 0),
        raisePct: Math.max(0, Number(values.raisePct) || 0),
        raiseAmount: Math.max(0, Number(values.raiseAmount) || 0),
        applied: Boolean(values.applied),
        updatedAt: nowIso,
      };
      onChangeState(
        {
          ...state,
          promotions:
            mode === 'add'
              ? [promo, ...state.promotions]
              : state.promotions.map((p) => (p.id === targetId ? promo : p)),
          auditLogs: [
            appendAudit(
              mode === 'add' ? 'إضافة' : 'تعديل',
              'الترقيات والعلاوات',
              promo.id,
              `قرار ${promo.decisionNumber} — ${promo.nextGrade}`
            ),
            ...state.auditLogs,
          ],
        },
        `${mode === 'add' ? 'إضافة' : 'تعديل'} ترقية: ${promo.decisionNumber}`
      );
      notify('ok', `تم ${mode === 'add' ? 'إضافة' : 'تعديل'} قرار الترقية (${promo.decisionNumber}).`);
      return null;
    }

    return null;
  };

  const handleConfirmDelete = () => {
    if (!deleteModalState) return;
    const { entityType, entityId, entityTitle } = deleteModalState;
    const check = checkHrDeleteIntegrity(state, entityType, entityId);
    if (!check.canDelete) {
      notify('err', check.reason || 'لا يمكن حذف هذا السجل لارتباطه ببيانات أخرى.');
      return;
    }

    if (entityType === 'employee') {
      const nextEmployees = state.employees.filter((e) => e.id !== entityId);
      onChangeState(
        {
          ...state,
          employees: nextEmployees,
          leaveBalances: state.leaveBalances.filter((b) => b.employeeId !== entityId),
          payrollRuns: rebuildDraftPayrollRuns(nextEmployees, state.loans, state.payrollRuns),
          auditLogs: [appendAudit('حذف', 'ملف الموظفين', entityId, entityTitle), ...state.auditLogs],
        },
        `حذف موظف: ${entityTitle}`
      );
    } else if (entityType === 'department') {
      onChangeState(
        {
          ...state,
          departments: state.departments.filter((d) => d.id !== entityId),
          auditLogs: [appendAudit('حذف', 'الأقسام الإدارية', entityId, entityTitle), ...state.auditLogs],
        },
        `حذف قسم إداري: ${entityTitle}`
      );
    } else if (entityType === 'attendance') {
      onChangeState(
        {
          ...state,
          attendance: state.attendance.filter((a) => a.id !== entityId),
          auditLogs: [appendAudit('حذف', 'سجل الحضور والانصراف', entityId, entityTitle), ...state.auditLogs],
        },
        `حذف سجل حضور: ${entityTitle}`
      );
    } else if (entityType === 'leave_balance') {
      onChangeState(
        {
          ...state,
          leaveBalances: state.leaveBalances.filter(
            (b) => `${b.employeeId}__${b.leaveType}` !== entityId
          ),
          auditLogs: [appendAudit('حذف', 'أرصدة الإجازات', entityId, entityTitle), ...state.auditLogs],
        },
        `حذف رصيد إجازة: ${entityTitle}`
      );
    } else if (entityType === 'leave_request') {
      onChangeState(
        {
          ...state,
          leaveRequests: state.leaveRequests.filter((r) => r.id !== entityId),
          auditLogs: [appendAudit('حذف', 'طلبات الإجازات', entityId, entityTitle), ...state.auditLogs],
        },
        `حذف طلب إجازة: ${entityTitle}`
      );
    } else if (entityType === 'payroll_run') {
      const remaining = state.payrollRuns.filter((r) => r.id !== entityId);
      onChangeState(
        {
          ...state,
          payrollRuns: remaining,
          auditLogs: [appendAudit('حذف', 'مسيرات الرواتب', entityId, entityTitle), ...state.auditLogs],
        },
        `حذف مسير رواتب: ${entityTitle}`
      );
      if (selectedRunId === entityId) {
        setSelectedRunId(remaining[0]?.id || '');
      }
    } else if (entityType === 'loan') {
      const nextLoans = state.loans.filter((l) => l.id !== entityId);
      onChangeState(
        {
          ...state,
          loans: nextLoans,
          payrollRuns: rebuildDraftPayrollRuns(state.employees, nextLoans, state.payrollRuns),
          auditLogs: [appendAudit('حذف', 'السلف والأقساط', entityId, entityTitle), ...state.auditLogs],
        },
        `حذف سلفة: ${entityTitle}`
      );
    } else if (entityType === 'promotion') {
      onChangeState(
        {
          ...state,
          promotions: state.promotions.filter((p) => p.id !== entityId),
          auditLogs: [appendAudit('حذف', 'الترقيات والعلاوات', entityId, entityTitle), ...state.auditLogs],
        },
        `حذف قرار ترقية: ${entityTitle}`
      );
    }

    notify('ok', `تم حذف (${entityTitle}) من قاعدة البيانات وتحديث كافة الجداول.`);
  };

  // Quick Form Handlers
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
    const nowIso = new Date().toISOString();

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
      hireDate: nowIso.split('T')[0],
      startWorkDate: nowIso.split('T')[0],
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
      updatedAt: nowIso,
    };

    const nextEmployees = [...state.employees, created];
    onChangeState(
      {
        ...state,
        employees: nextEmployees,
        leaveBalances: [
          ...state.leaveBalances,
          { employeeId: created.id, leaveType: 'اعتيادية', previousBalance: 0, entitledDays: 21, usedDays: 0, updatedAt: nowIso },
          { employeeId: created.id, leaveType: 'عارضة', previousBalance: 0, entitledDays: 7, usedDays: 0, updatedAt: nowIso },
        ],
        payrollRuns: rebuildDraftPayrollRuns(nextEmployees, state.loans, state.payrollRuns),
        auditLogs: [appendAudit('إضافة', 'ملف الموظفين', created.id, `${created.fullName} (${created.employeeCode})`), ...state.auditLogs],
      },
      `إضافة موظف: ${created.fullName}`
    );
    setNewFullName('');
    setNewNationalId('');
    setNewEmpCode('');
    notify('ok', `تم تعيين وإضافة الموظف (${created.fullName}) واستخراج تاريخ الميلاد والنوع آلياً.`);
  };

  const handleAddAttendance = (e: React.FormEvent) => {
    e.preventDefault();
    const nowIso = new Date().toISOString();
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
      date: nowIso.split('T')[0],
      monthKey: nowIso.slice(0, 7),
      officialStart: '08:00',
      officialEnd: '14:00',
      actualIn: attActualIn,
      actualOut: attActualOut,
      breakMinutes: 0,
      lateMinutes: metrics.lateMinutes,
      earlyLeaveMinutes: metrics.earlyLeaveMinutes,
      netWorkedMinutes: metrics.netWorkedMinutes,
      status: 'حضور',
      updatedAt: nowIso,
    };
    onChangeState(
      {
        ...state,
        attendance: [rec, ...state.attendance],
        auditLogs: [appendAudit('إضافة', 'الحضور والانصراف', rec.id, `تأخير ${metrics.lateMinutes} دقيقة`), ...state.auditLogs],
      },
      `تسجيل حضور: ${rec.date}`
    );
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
    const nowIso = new Date().toISOString();
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
      updatedAt: nowIso,
    };
    const nextBalances = state.leaveBalances.map((b) =>
      b.employeeId === leaveEmpId && b.leaveType === leaveType
        ? { ...b, usedDays: b.usedDays + days, updatedAt: nowIso }
        : b
    );
    onChangeState(
      {
        ...state,
        leaveRequests: [req, ...state.leaveRequests],
        leaveBalances: nextBalances,
        auditLogs: [appendAudit('اعتماد', 'الإجازات', req.id, `${leaveType}: ${days} يوم`), ...state.auditLogs],
      },
      `اعتماد إجازة (${leaveType}) لمدة ${days} يوم`
    );
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

    onChangeState(
      {
        ...state,
        payrollRuns: nextRuns,
        auditLogs: [appendAudit('تعديل', 'مسيرات المرتبات', runObj.id, `معاينة مسير شهر ${payrollMonth}`), ...state.auditLogs],
      },
      `احتساب مسير رواتب شهر ${payrollMonth}`
    );
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
    onChangeState(
      {
        ...state,
        payrollRuns: lockedRuns,
        auditLogs: [appendAudit('اعتماد', 'إقفال مسير الرواتب', runId, `قفل نهائي لشهر ${run.monthKey}`), ...state.auditLogs],
      },
      `إقفال واعتماد مسير رواتب ${run.monthKey}`
    );
    notify('ok', `تم الاعتماد النهائي وإقفال مسير شهر (${run.monthKey}) ضد أي تعديل لاحق.`);
  };

  const handleAddLoan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!(loanAmount > 0) || !(loanInstallments > 0)) return;
    const nowIso = new Date().toISOString();
    const instVal = round2(loanAmount / loanInstallments);
    const loan: HrLoanRecord = {
      id: `${branchId}-ln-${Date.now()}`,
      branchId,
      loanNumber: `LN-${Date.now().toString().slice(-5)}`,
      employeeId: loanEmpId,
      totalAmount: loanAmount,
      disbursedDate: nowIso.split('T')[0],
      installmentsCount: loanInstallments,
      installmentAmount: instVal,
      paidInstallments: 0,
      remainingAmount: loanAmount,
      status: 'سارية',
      updatedAt: nowIso,
    };
    const nextLoans = [loan, ...state.loans];
    onChangeState(
      {
        ...state,
        loans: nextLoans,
        payrollRuns: rebuildDraftPayrollRuns(state.employees, nextLoans, state.payrollRuns),
        auditLogs: [appendAudit('إضافة', 'السلف والأقساط', loan.id, `${loan.loanNumber} — ${loanAmount} ج.م`), ...state.auditLogs],
      },
      `إضافة سلفة: ${loan.loanNumber}`
    );
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
    onChangeState(
      {
        ...state,
        policySettings: versioned,
        policyVersionsHistory: [versioned, ...state.policyVersionsHistory],
        auditLogs: [
          appendAudit('تحديث إعدادات', 'السياسات المالية والتأمينات والضرائب', versioned.id, versioned.lawDecisionReference),
          ...state.auditLogs,
        ],
      },
      'تحديث لائحة الضرائب والتأمينات'
    );
    notify('ok', 'تم حفظ نسخة جديدة من لائحة الضرائب والتأمينات دون التأثير على المسيرات المعتمدة سابقاً.');
  };

  const getContractDaysRemaining = (endDateStr?: string) => {
    if (!endDateStr) return 999;
    const end = new Date(endDateStr).getTime();
    const now = new Date().getTime();
    return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  };

  const contractEmployees = useMemo(() => {
    return state.employees.filter((e) => e.employeeType === 'خدمة عامة' || e.employeeType === 'استعانة');
  }, [state.employees]);

  const expiringContracts = useMemo(() => {
    return contractEmployees.filter((e) => {
      const days = getContractDaysRemaining(e.contractEndDate);
      return days >= 0 && days <= 15;
    });
  }, [contractEmployees]);

  const expiredContractsCount = useMemo(() => {
    return contractEmployees.filter((e) => getContractDaysRemaining(e.contractEndDate) < 0).length;
  }, [contractEmployees]);

  const publicServiceCount = useMemo(() => {
    return contractEmployees.filter((e) => e.employeeType === 'خدمة عامة').length;
  }, [contractEmployees]);

  const assistanceCount = useMemo(() => {
    return contractEmployees.filter((e) => e.employeeType === 'استعانة').length;
  }, [contractEmployees]);

  const activeContractCount = useMemo(() => {
    return contractEmployees.filter((e) => getContractDaysRemaining(e.contractEndDate) > 15).length;
  }, [contractEmployees]);

  const handleRenewContract = (employeeId: string) => {
    const emp = state.employees.find((e) => e.id === employeeId);
    if (!emp) return;
    const currentEnd = emp.contractEndDate ? new Date(emp.contractEndDate) : new Date();
    currentEnd.setFullYear(currentEnd.getFullYear() + 1);
    const newEndStr = currentEnd.toISOString().split('T')[0];
    const updatedEmployees = state.employees.map((e) =>
      e.id === employeeId
        ? {
            ...e,
            contractEndDate: newEndStr,
            status: 'على رأس العمل' as const,
            updatedAt: new Date().toISOString(),
          }
        : e
    );
    onChangeState(
      {
        ...state,
        employees: updatedEmployees,
        auditLogs: [
          appendAudit('تعديل', 'موظفي الخدمة العامة والاستعانة', employeeId, `تجديد تعاقد ${emp.fullName} حتى ${newEndStr}`),
          ...state.auditLogs,
        ],
      },
      `تجديد تعاقد الموظف: ${emp.fullName}`
    );
    notify('ok', `تم تجديد تعاقد الموظف (${emp.fullName}) بنجاح حتى تاريخ ${newEndStr}.`);
  };

  const navItems: { id: HrSubView; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'لوحة الموارد البشرية', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'employees', label: 'الموظفون والأقسام', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'public_service_contracts', label: 'موظفو الخدمة العامة والاستعانة', icon: <Award className="w-3.5 h-3.5" /> },
    { id: 'attendance', label: 'الحضور والانصراف', icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'leaves', label: 'الأرصدة والإجازات', icon: <CalendarDays className="w-3.5 h-3.5" /> },
    { id: 'payroll', label: 'الرواتب والأجور', icon: <Wallet className="w-3.5 h-3.5" /> },
    { id: 'loans_promotions', label: 'السلف والترقيات والخدمة', icon: <CreditCard className="w-3.5 h-3.5" /> },
    { id: 'settings', label: 'الضرائب والتأمينات (قابل للتعديل)', icon: <Settings className="w-3.5 h-3.5" /> },
    { id: 'audit', label: 'سجل التدقيق', icon: <History className="w-3.5 h-3.5" /> },
  ];

  const activeDeleteCheck = useMemo(() => {
    if (!deleteModalState) return { canDelete: true };
    return checkHrDeleteIntegrity(state, deleteModalState.entityType, deleteModalState.entityId);
  }, [deleteModalState, state]);

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
          data-testid="hr-feedback-banner"
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
            data-testid={`hr-nav-${tab.id}`}
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
          {expiringContracts.length > 0 && (
            <div className="bg-amber-50 border-2 border-amber-400 p-4 rounded-2xl shadow-sm flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500 text-white shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-black text-amber-900">
                  تنبيه هام: توجد ({expiringContracts.length}) عقود خدمة عامة أو استعانة ستنتهي خلال 15 يوماً القادمة!
                </h4>
                <p className="text-xs font-bold text-amber-800">
                  يرجى مراجعة قسم موظفي الخدمة العامة والاستعانة لتجديد العقود المستحقة:
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {expiringContracts.map((ec) => {
                    const days = getContractDaysRemaining(ec.contractEndDate);
                    return (
                      <span key={ec.id} className="px-2.5 py-1 bg-white border border-amber-300 rounded-xl text-xs font-black text-amber-900">
                        {ec.fullName} ({ec.employeeType}) — متبقي {days} يوم (ينتهي في {ec.contractEndDate})
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

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

      {subView === 'public_service_contracts' && (
        <div className="space-y-4">
          {expiringContracts.length > 0 && (
            <div className="bg-amber-50 border-2 border-amber-400 p-4 rounded-2xl shadow-sm flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500 text-white shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-black text-amber-900">
                  تنبيه هام: توجد ({expiringContracts.length}) عقود خدمة عامة أو استعانة اقترب موعد انتهائها خلال 15 يوماً القادمة!
                </h4>
                <div className="flex flex-wrap gap-2 mt-2">
                  {expiringContracts.map((ec) => {
                    const days = getContractDaysRemaining(ec.contractEndDate);
                    return (
                      <span key={ec.id} className="px-2.5 py-1 bg-white border border-amber-300 rounded-xl text-xs font-black text-amber-900">
                        {ec.fullName} ({ec.employeeType}) — متبقي {days} يوم (ينتهي في {ec.contractEndDate})
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">إجمالي موظفي الخدمة العامة</div>
              <div className="text-2xl font-black text-[#0A1628] font-mono mt-1">{publicServiceCount}</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">إجمالي موظفي الاستعانة</div>
              <div className="text-2xl font-black text-[#1E40AF] font-mono mt-1">{assistanceCount}</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">على رأس العمل (ساري)</div>
              <div className="text-2xl font-black text-emerald-700 font-mono mt-1">{activeContractCount}</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">اقترب موعد انتهاء التعاقد (≤15 يوم)</div>
              <div className="text-2xl font-black text-amber-600 font-mono mt-1">{expiringContracts.length}</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">العقود المنتهية</div>
              <div className="text-2xl font-black text-rose-700 font-mono mt-1">{expiredContractsCount}</div>
            </div>
          </div>

          {/* Toolbar & Actions */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[260px]">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="بحث باسم الموظف، الرقم القومي، أو الوظيفة..."
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0D9488]"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isViewer && (
                <button
                  type="button"
                  onClick={() =>
                    setFormModalState({
                      isOpen: true,
                      mode: 'add',
                      entityKey: 'employee',
                      title: 'إضافة موظف خدمة عامة أو استعانة جديد',
                      fields: [
                        { key: 'employeeType', label: 'نوع الموظف', type: 'select', required: true, options: [{ value: 'خدمة عامة', label: 'خدمة عامة' }, { value: 'استعانة', label: 'استعانة' }] },
                        { key: 'employeeCode', label: 'الكود الوظيفي / المسلسل', type: 'text', required: true, placeholder: 'EMP-PS-303' },
                        { key: 'fullName', label: 'الاسم رباعي بالكامل', type: 'text', required: true },
                        { key: 'nationalId', label: 'الرقم القومي (14 رقم)', type: 'text', required: true },
                        { key: 'phone', label: 'رقم الهاتف', type: 'text', required: true },
                        { key: 'qualification', label: 'المؤهل الدراسي', type: 'text', required: true, placeholder: 'بكالوريوس / ليسانس / دبلوم' },
                        { key: 'jobTitle', label: 'الوظيفة أو طبيعة العمل', type: 'text', required: true },
                        { key: 'departmentName', label: 'جهة العمل أو الإدارة التابع لها', type: 'select', required: true, options: state.departments.map(d => ({ value: d.name, label: d.name })) },
                        { key: 'hireDate', label: 'تاريخ التعاقد / بداية العمل', type: 'date', required: true },
                        { key: 'contractEndDate', label: 'تاريخ انتهاء التعاقد', type: 'date', required: true },
                        { key: 'contractDurationText', label: 'مدة التعاقد', type: 'text', required: true, placeholder: 'سنة واحدة / 6 أشهر' },
                        { key: 'functionalWage', label: 'الأجر / المكافأة الشهرية (ج.م)', type: 'number', required: true, min: 0 },
                        { key: 'status', label: 'الحالة', type: 'select', required: true, options: [{ value: 'على رأس العمل', label: 'على رأس العمل' }, { value: 'اقترب موعد انتهاء التعاقد', label: 'اقترب موعد انتهاء التعاقد' }, { value: 'منتهي التعاقد', label: 'منتهي التعاقد' }] },
                        { key: 'documentsNotes', label: 'ملاحظات', type: 'textarea', colSpan: 2 },
                      ],
                      initialValues: {
                        employeeType: 'خدمة عامة',
                        employeeCode: `EMP-PS-${100 + contractEmployees.length + 1}`,
                        hireDate: new Date().toISOString().split('T')[0],
                        contractEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                        contractDurationText: 'سنة واحدة',
                        functionalWage: 3500,
                        status: 'على رأس العمل',
                      },
                    })
                  }
                  className="px-3.5 py-2 bg-[#0A1628] hover:bg-[#13294B] text-[#D4AF37] rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4 text-[#D4AF37]" />
                  <span>إضافة موظف جديد</span>
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  exportRowsToArabicCsv(
                    `موظفو_الخدمة_العامة_والاستعانة_${branchName}`,
                    ['المسلسل', 'الكود', 'الاسم', 'الرقم القومي', 'المؤهل', 'الوظيفة', 'الإدارة', 'النوع', 'بداية التعاقد', 'نهاية التعاقد', 'المدة', 'الأيام المتبقية', 'الحالة'],
                    contractEmployees.map((e, idx) => [
                      idx + 1,
                      e.employeeCode,
                      e.fullName,
                      e.nationalId,
                      e.qualification || 'غير محدد',
                      e.jobTitle,
                      e.departmentName,
                      e.employeeType || 'خدمة عامة',
                      e.hireDate,
                      e.contractEndDate || 'غير محدد',
                      e.contractDurationText || 'سنة',
                      getContractDaysRemaining(e.contractEndDate),
                      e.status,
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
                    title: 'تقرير موظفي الخدمة العامة وموظفي الاستعانة',
                    subtitle: `سجل التعاقدات ومتابعة تواريخ انتهاء المدد — ${branchName}`,
                    branchName,
                    headers: ['م', 'الكود', 'اسم الموظف', 'الرقم القومي', 'المؤهل الدراسي', 'الوظيفة', 'الإدارة', 'النوع', 'بداية التعاقد', 'انتهاء التعاقد', 'المتبقي', 'الحالة'],
                    rows: contractEmployees.map((e, idx) => [
                      idx + 1,
                      e.employeeCode,
                      e.fullName,
                      e.nationalId,
                      e.qualification || '—',
                      e.jobTitle,
                      e.departmentName,
                      e.employeeType || 'خدمة عامة',
                      e.hireDate,
                      e.contractEndDate || '—',
                      `${getContractDaysRemaining(e.contractEndDate)} يوم`,
                      e.status,
                    ]),
                    summaryItems: [
                      { label: 'إجمالي الخدمة العامة', value: String(publicServiceCount) },
                      { label: 'إجمالي الاستعانة', value: String(assistanceCount) },
                      { label: 'العقود المنتهية', value: String(expiredContractsCount) },
                    ],
                    preparedBy: currentUser?.fullName,
                  })
                }
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4 text-[#D4AF37]" />
                <span>طباعة تقرير A4</span>
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
              <thead className="bg-[#0A1628] text-white font-black">
                <tr>
                  <th className="py-2.5 px-2 border border-slate-700">م</th>
                  <th className="py-2.5 px-2 border border-slate-700">الكود</th>
                  <th className="py-2.5 px-2 border border-slate-700 text-right">اسم الموظف بالكامل</th>
                  <th className="py-2.5 px-2 border border-slate-700 font-mono">الرقم القومي</th>
                  <th className="py-2.5 px-2 border border-slate-700">المؤهل الدراسي</th>
                  <th className="py-2.5 px-2 border border-slate-700">الوظيفة / طبيعة العمل</th>
                  <th className="py-2.5 px-2 border border-slate-700">جهة العمل / الإدارة</th>
                  <th className="py-2.5 px-2 border border-slate-700">نوع الموظف</th>
                  <th className="py-2.5 px-2 border border-slate-700">بداية التعاقد</th>
                  <th className="py-2.5 px-2 border border-slate-700">انتهاء التعاقد</th>
                  <th className="py-2.5 px-2 border border-slate-700">المتبقي</th>
                  <th className="py-2.5 px-2 border border-slate-700">الحالة</th>
                  <th className="py-2.5 px-2 border border-slate-700">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {contractEmployees
                  .filter((e) => {
                    if (!empSearch.trim()) return true;
                    const q = empSearch.trim().toLowerCase();
                    return `${e.fullName} ${e.employeeCode} ${e.nationalId} ${e.jobTitle} ${e.departmentName}`
                      .toLowerCase()
                      .includes(q);
                  })
                  .map((e, idx) => {
                    const days = getContractDaysRemaining(e.contractEndDate);
                    const isExpired = days < 0;
                    const isExpiring = days >= 0 && days <= 15;
                    return (
                      <tr key={e.id} className={isExpired ? 'bg-rose-50/60' : isExpiring ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                        <td className="py-2.5 px-2 font-mono">{idx + 1}</td>
                        <td className="py-2.5 px-2 font-mono text-[#1E40AF]">{e.employeeCode}</td>
                        <td className="py-2.5 px-2 text-right font-black text-[#0A1628]">{e.fullName}</td>
                        <td className="py-2.5 px-2 font-mono text-[11px]">{e.nationalId}</td>
                        <td className="py-2.5 px-2">{e.qualification || '—'}</td>
                        <td className="py-2.5 px-2 text-[#0D9488]">{e.jobTitle}</td>
                        <td className="py-2.5 px-2">{e.departmentName}</td>
                        <td className="py-2.5 px-2">
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${e.employeeType === 'استعانة' ? 'bg-indigo-100 text-indigo-800' : 'bg-teal-100 text-teal-800'}`}>
                            {e.employeeType || 'خدمة عامة'}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 font-mono text-[11px]">{e.hireDate}</td>
                        <td className="py-2.5 px-2 font-mono text-[11px]">{e.contractEndDate || '—'}</td>
                        <td className="py-2.5 px-2 font-mono">
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${isExpired ? 'bg-rose-100 text-rose-800' : isExpiring ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                            {isExpired ? `منتهي (${Math.abs(days)} يوم)` : `${days} يوم`}
                          </span>
                        </td>
                        <td className="py-2.5 px-2">
                          <span className={`px-2.5 py-1 rounded-xl text-[11px] font-black ${isExpired ? 'bg-rose-600 text-white' : isExpiring ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white'}`}>
                            {isExpired ? 'منتهي التعاقد' : isExpiring ? 'اقترب موعد الانتهاء' : 'على رأس العمل'}
                          </span>
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="flex items-center justify-center gap-1.5">
                            {!isViewer && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleRenewContract(e.id)}
                                  title="تجديد التعاقد لسنة جديدة"
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-black cursor-pointer shadow-sm"
                                >
                                  تجديد
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setFormModalState({
                                      isOpen: true,
                                      mode: 'edit',
                                      entityKey: 'employee',
                                      title: `تعديل بيانات الموظف: ${e.fullName}`,
                                      fields: [
                                        { key: 'employeeType', label: 'نوع الموظف', type: 'select', required: true, options: [{ value: 'خدمة عامة', label: 'خدمة عامة' }, { value: 'استعانة', label: 'استعانة' }] },
                                        { key: 'employeeCode', label: 'الكود الوظيفي', type: 'text', required: true },
                                        { key: 'fullName', label: 'الاسم رباعي بالكامل', type: 'text', required: true },
                                        { key: 'nationalId', label: 'الرقم القومي (14 رقم)', type: 'text', required: true },
                                        { key: 'phone', label: 'رقم الهاتف', type: 'text', required: true },
                                        { key: 'qualification', label: 'المؤهل الدراسي', type: 'text', required: true },
                                        { key: 'jobTitle', label: 'الوظيفة أو طبيعة العمل', type: 'text', required: true },
                                        { key: 'departmentName', label: 'جهة العمل أو الإدارة', type: 'select', required: true, options: state.departments.map(d => ({ value: d.name, label: d.name })) },
                                        { key: 'hireDate', label: 'تاريخ التعاقد', type: 'date', required: true },
                                        { key: 'contractEndDate', label: 'تاريخ انتهاء التعاقد', type: 'date', required: true },
                                        { key: 'contractDurationText', label: 'مدة التعاقد', type: 'text', required: true },
                                        { key: 'functionalWage', label: 'الأجر / المكافأة (ج.م)', type: 'number', required: true, min: 0 },
                                        { key: 'status', label: 'الحالة', type: 'select', required: true, options: [{ value: 'على رأس العمل', label: 'على رأس العمل' }, { value: 'اقترب موعد انتهاء التعاقد', label: 'اقترب موعد انتهاء التعاقد' }, { value: 'منتهي التعاقد', label: 'منتهي التعاقد' }] },
                                      ],
                                      initialValues: {
                                        employeeType: e.employeeType || 'خدمة عامة',
                                        employeeCode: e.employeeCode,
                                        fullName: e.fullName,
                                        nationalId: e.nationalId,
                                        phone: e.phone || '',
                                        qualification: e.qualification || '',
                                        jobTitle: e.jobTitle,
                                        departmentName: e.departmentName,
                                        hireDate: e.hireDate,
                                        contractEndDate: e.contractEndDate || '',
                                        contractDurationText: e.contractDurationText || 'سنة واحدة',
                                        functionalWage: e.functionalWage,
                                        status: e.status,
                                      },
                                      targetId: e.id,
                                    })
                                  }
                                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-black cursor-pointer"
                                >
                                  تعديل
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeleteModalState({
                                      isOpen: true,
                                      entityType: 'employee',
                                      entityTitle: e.fullName,
                                      entityId: e.id,
                                      recordSummary: [
                                        { label: 'الكود', value: e.employeeCode },
                                        { label: 'الاسم', value: e.fullName },
                                        { label: 'النوع', value: e.employeeType || 'خدمة عامة' },
                                        { label: 'تاريخ انتهاء التعاقد', value: e.contractEndDate || '—' },
                                      ],
                                    })
                                  }
                                  className="px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg text-[11px] font-black cursor-pointer"
                                >
                                  حذف
                                </button>
                              </>
                            )}
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

      {subView === 'employees' && (
        <div className="space-y-5">
          {/* Employees Table */}
          <div className="space-y-3">
            <ModuleTableToolbar
              title="سجل بيانات الموظفين وشؤون العاملين"
              subtitle="فحص الرقم القومي 14 رقماً، إدارة الأجور الوظيفية والمكملة، وتحديث المسيرات تلقائياً"
              count={filteredEmployees.length}
              addLabel="إضافة موظف جديد"
              permissions={permissions}
              testIdPrefix="hr-employees"
              onAddClick={() =>
                setFormModalState({
                  isOpen: true,
                  mode: 'add',
                  entityKey: 'employee',
                  title: 'إضافة موظف جديد إلى قاعدة البيانات',
                  fields: getEmployeeFields(),
                  initialValues: {
                    employeeCode: `EMP-${1000 + state.employees.length + 1}`,
                    fullName: '',
                    nationalId: '',
                    departmentName: state.departments[0]?.name || 'قسم الرقابة التموينية والتفتيش',
                    jobTitle: 'مفتش تموين',
                    jobGrade: 'الثالثة',
                    status: 'على رأس العمل',
                    hireDate: new Date().toISOString().split('T')[0],
                    functionalWage: 4500,
                    complementaryWage: 1500,
                    periodicAllowances: 350,
                    specialAllowances: 300,
                    monthlyIncentives: 800,
                    insurableWage: 6000,
                    manualDeductions: 0,
                    penalties: 0,
                  },
                })
              }
            />

            {!isViewer && (
              <form onSubmit={handleAddEmployee} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black text-[#0A1628] flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-[#0D9488]" />
                    <span>إضافة سريعة لموظف جديد (يتم فحص الرقم القومي 14 رقماً واستخراج الميلاد والنوع تلقائياً)</span>
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
                      <th className="py-2 px-2 border border-slate-700">إدارة السجل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-bold">
                    {filteredEmployees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-50">
                        <td className="py-2 px-2 font-mono">{emp.employeeCode}</td>
                        <td className="py-2 px-2 text-right font-black text-[#0A1628]">{emp.fullName}</td>
                        <td className="py-2 px-2 font-mono">{emp.nationalId}</td>
                        <td className="py-2 px-2 font-mono">{emp.birthDate} ({emp.gender})</td>
                        <td className="py-2 px-2">{emp.departmentName} — {emp.jobTitle}</td>
                        <td className="py-2 px-2 font-mono text-[#0D9488]">{(emp.functionalWage + emp.complementaryWage).toLocaleString()} ج.م</td>
                        <td className="py-2 px-2">{emp.status}</td>
                        <td className="py-2 px-2">
                          <ModuleRowActions
                            entityLabel={emp.fullName}
                            updatedAt={emp.updatedAt}
                            permissions={permissions}
                            testIdPrefix={`hr-emp-${emp.id}`}
                            onEdit={() =>
                              setFormModalState({
                                isOpen: true,
                                mode: 'edit',
                                entityKey: 'employee',
                                targetId: emp.id,
                                title: `تعديل ملف الموظف: ${emp.fullName}`,
                                fields: getEmployeeFields(),
                                initialValues: { ...emp },
                              })
                            }
                            onDelete={() =>
                              setDeleteModalState({
                                isOpen: true,
                                entityType: 'employee',
                                entityTitle: emp.fullName,
                                entityId: emp.id,
                                recordSummary: [
                                  { label: 'الكود الوظيفي', value: emp.employeeCode },
                                  { label: 'الاسم', value: emp.fullName },
                                  { label: 'الرقم القومي', value: emp.nationalId },
                                  { label: 'القسم', value: emp.departmentName },
                                ],
                              })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Departments Table */}
          <div className="space-y-3">
            <ModuleTableToolbar
              title="دليل الأقسام والإدارات الفرعية"
              subtitle="إدارة الهيكل التنظيمي والأقسام التابعة للفرع"
              count={state.departments.length}
              addLabel="إضافة قسم إداري جديد"
              permissions={permissions}
              testIdPrefix="hr-departments"
              onAddClick={() =>
                setFormModalState({
                  isOpen: true,
                  mode: 'add',
                  entityKey: 'department',
                  title: 'إضافة قسم إداري جديد',
                  fields: getDepartmentFields(),
                  initialValues: {
                    name: '',
                    managerName: 'مدير القسم',
                  },
                })
              }
            />

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead className="bg-[#0A1628] text-white font-black">
                  <tr>
                    <th className="py-2 px-2 border border-slate-700 text-right">اسم القسم الإداري</th>
                    <th className="py-2 px-2 border border-slate-700">مدير القسم</th>
                    <th className="py-2 px-2 border border-slate-700">عدد الموظفين</th>
                    <th className="py-2 px-2 border border-slate-700">إدارة السجل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {state.departments.map((d) => {
                    const empCount = state.employees.filter((e) => e.departmentName === d.name).length;
                    return (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className="py-2 px-2 text-right font-black text-[#0A1628]">{d.name}</td>
                        <td className="py-2 px-2">{d.managerName}</td>
                        <td className="py-2 px-2 font-mono text-[#0D9488]">{empCount} موظف</td>
                        <td className="py-2 px-2">
                          <ModuleRowActions
                            entityLabel={d.name}
                            updatedAt={d.updatedAt}
                            permissions={permissions}
                            testIdPrefix={`hr-dept-${d.id}`}
                            onEdit={() =>
                              setFormModalState({
                                isOpen: true,
                                mode: 'edit',
                                entityKey: 'department',
                                targetId: d.id,
                                title: `تعديل القسم الإداري: ${d.name}`,
                                fields: getDepartmentFields(),
                                initialValues: { ...d },
                              })
                            }
                            onDelete={() =>
                              setDeleteModalState({
                                isOpen: true,
                                entityType: 'department',
                                entityTitle: d.name,
                                entityId: d.id,
                                recordSummary: [
                                  { label: 'اسم القسم', value: d.name },
                                  { label: 'مدير القسم', value: d.managerName },
                                  { label: 'عدد الموظفين المرتبطين', value: empCount },
                                ],
                              })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subView === 'attendance' && (
        <div className="space-y-4">
          <ModuleTableToolbar
            title="دفتر الحضور والانصراف اليومي"
            subtitle="احتساب آلي لدقائق التأخير والانصراف المبكر وصافي دقائق العمل الفعلية"
            count={state.attendance.length}
            addLabel="إضافة سجل حضور جديد"
            permissions={permissions}
            testIdPrefix="hr-attendance"
            onAddClick={() =>
              setFormModalState({
                isOpen: true,
                mode: 'add',
                entityKey: 'attendance',
                title: 'تسجيل حضور وانصراف موظف',
                fields: getAttendanceFields(),
                initialValues: {
                  employeeId: state.employees[0]?.id || '',
                  date: new Date().toISOString().split('T')[0],
                  officialStart: '08:00',
                  officialEnd: '14:00',
                  actualIn: '08:10',
                  actualOut: '14:00',
                  breakMinutes: 0,
                  status: 'حضور',
                },
              })
            }
          />

          {!isViewer && (
            <form onSubmit={handleAddAttendance} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
              <select value={attEmpId} onChange={(e) => setAttEmpId(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold">
                {state.employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
              </select>
              <input type="time" value={attActualIn} onChange={(e) => setAttActualIn(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
              <input type="time" value={attActualOut} onChange={(e) => setAttActualOut(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
              <button type="submit" className="px-4 py-2 bg-[#0D9488] text-white rounded-xl font-black cursor-pointer">
                تسجيل سريع واحتساب التأخير
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
                  <th className="py-2 px-2 border border-slate-700">الحالة</th>
                  <th className="py-2 px-2 border border-slate-700">إدارة السجل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {state.attendance.map((a) => {
                  const emp = state.employees.find((e) => e.id === a.employeeId);
                  return (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="py-2 px-2 font-black text-[#0A1628]">{emp?.fullName || a.employeeId}</td>
                      <td className="py-2 px-2 font-mono">{a.date}</td>
                      <td className="py-2 px-2 font-mono">{a.actualIn} - {a.actualOut}</td>
                      <td className="py-2 px-2 font-mono text-rose-700">{a.lateMinutes} د</td>
                      <td className="py-2 px-2 font-mono text-amber-700">{a.earlyLeaveMinutes} د</td>
                      <td className="py-2 px-2 font-mono text-[#0D9488]">{a.netWorkedMinutes} د</td>
                      <td className="py-2 px-2">{a.status}</td>
                      <td className="py-2 px-2">
                        <ModuleRowActions
                          entityLabel={`${emp?.fullName || a.employeeId} (${a.date})`}
                          updatedAt={a.updatedAt}
                          permissions={permissions}
                          testIdPrefix={`hr-att-${a.id}`}
                          onEdit={() =>
                            setFormModalState({
                              isOpen: true,
                              mode: 'edit',
                              entityKey: 'attendance',
                              targetId: a.id,
                              title: `تعديل سجل حضور: ${emp?.fullName || a.employeeId}`,
                              fields: getAttendanceFields(),
                              initialValues: { ...a },
                            })
                          }
                          onDelete={() =>
                            setDeleteModalState({
                              isOpen: true,
                              entityType: 'attendance',
                              entityTitle: `${emp?.fullName || a.employeeId} — ${a.date}`,
                              entityId: a.id,
                              recordSummary: [
                                { label: 'الموظف', value: emp?.fullName || a.employeeId },
                                { label: 'التاريخ', value: a.date },
                                { label: 'وقت الحضور والانصراف', value: `${a.actualIn} - ${a.actualOut}` },
                              ],
                            })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subView === 'leaves' && (
        <div className="space-y-5">
          {/* Leave Balances Table */}
          <div className="space-y-3">
            <ModuleTableToolbar
              title="أرصدة الإجازات السنوية والعارضة والمرضية"
              subtitle="الرصيد المتبقي = الرصيد المرحل + المستحق للعام - المستنفد"
              count={state.leaveBalances.length}
              addLabel="إضافة / تخصيص رصيد إجازة"
              permissions={permissions}
              testIdPrefix="hr-leave-balances"
              onAddClick={() =>
                setFormModalState({
                  isOpen: true,
                  mode: 'add',
                  entityKey: 'leave_balance',
                  title: 'إضافة أو تخصيص رصيد إجازة لموظف',
                  fields: getLeaveBalanceFields(),
                  initialValues: {
                    employeeId: state.employees[0]?.id || '',
                    leaveType: 'اعتيادية',
                    previousBalance: 15,
                    entitledDays: 30,
                    usedDays: 5,
                  },
                })
              }
            />

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
                    <th className="py-2 px-2 border border-slate-700">إدارة السجل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {state.leaveBalances.map((b, i) => {
                    const emp = state.employees.find((e) => e.id === b.employeeId);
                    const compositeKey = `${b.employeeId}__${b.leaveType}`;
                    return (
                      <tr key={`${compositeKey}-${i}`} className="hover:bg-slate-50">
                        <td className="py-2 px-2 font-black text-[#0A1628]">{emp?.fullName || b.employeeId}</td>
                        <td className="py-2 px-2">{b.leaveType}</td>
                        <td className="py-2 px-2 font-mono">{b.previousBalance}</td>
                        <td className="py-2 px-2 font-mono">{b.entitledDays}</td>
                        <td className="py-2 px-2 font-mono text-rose-700">{b.usedDays}</td>
                        <td className="py-2 px-2 font-mono font-black text-[#0D9488]">{computeRemainingLeaveBalance(b)} يوم</td>
                        <td className="py-2 px-2">
                          <ModuleRowActions
                            entityLabel={`${emp?.fullName || b.employeeId} (${b.leaveType})`}
                            updatedAt={b.updatedAt}
                            permissions={permissions}
                            testIdPrefix={`hr-lb-${compositeKey}`}
                            onEdit={() =>
                              setFormModalState({
                                isOpen: true,
                                mode: 'edit',
                                entityKey: 'leave_balance',
                                targetId: compositeKey,
                                title: `تعديل رصيد إجازة (${b.leaveType}) — ${emp?.fullName || ''}`,
                                fields: getLeaveBalanceFields(),
                                initialValues: { ...b },
                              })
                            }
                            onDelete={() =>
                              setDeleteModalState({
                                isOpen: true,
                                entityType: 'leave_balance',
                                entityTitle: `رصيد ${b.leaveType} — ${emp?.fullName || b.employeeId}`,
                                entityId: compositeKey,
                                recordSummary: [
                                  { label: 'الموظف', value: emp?.fullName || b.employeeId },
                                  { label: 'نوع الإجازة', value: b.leaveType },
                                  { label: 'المتبقي', value: `${computeRemainingLeaveBalance(b)} يوم` },
                                ],
                              })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Leave Requests Table */}
          <div className="space-y-3">
            <ModuleTableToolbar
              title="سجل طلبات وقرارات الإجازات"
              subtitle="متابعة طلبات الإجازات المعتمدة وقيد المراجعة"
              count={state.leaveRequests.length}
              addLabel="إضافة طلب إجازة جديد"
              permissions={permissions}
              testIdPrefix="hr-leave-requests"
              onAddClick={() =>
                setFormModalState({
                  isOpen: true,
                  mode: 'add',
                  entityKey: 'leave_request',
                  title: 'تسجيل طلب إجازة جديد',
                  fields: getLeaveRequestFields(),
                  initialValues: {
                    employeeId: state.employees[0]?.id || '',
                    leaveType: 'اعتيادية',
                    startDate: new Date().toISOString().split('T')[0],
                    endDate: new Date().toISOString().split('T')[0],
                    status: 'معتمد',
                    notes: '',
                  },
                })
              }
            />

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead className="bg-[#0A1628] text-white font-black">
                  <tr>
                    <th className="py-2 px-2 border border-slate-700">الموظف</th>
                    <th className="py-2 px-2 border border-slate-700">نوع الإجازة</th>
                    <th className="py-2 px-2 border border-slate-700">من تاريخ</th>
                    <th className="py-2 px-2 border border-slate-700">إلى تاريخ</th>
                    <th className="py-2 px-2 border border-slate-700">عدد الأيام</th>
                    <th className="py-2 px-2 border border-slate-700">الحالة</th>
                    <th className="py-2 px-2 border border-slate-700">إدارة السجل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {state.leaveRequests.map((req) => {
                    const emp = state.employees.find((e) => e.id === req.employeeId);
                    return (
                      <tr key={req.id} className="hover:bg-slate-50">
                        <td className="py-2 px-2 font-black text-[#0A1628]">{emp?.fullName || req.employeeId}</td>
                        <td className="py-2 px-2">{req.leaveType}</td>
                        <td className="py-2 px-2 font-mono">{req.startDate}</td>
                        <td className="py-2 px-2 font-mono">{req.endDate}</td>
                        <td className="py-2 px-2 font-mono text-[#0D9488]">{req.daysCount} يوم</td>
                        <td className="py-2 px-2">{req.status}</td>
                        <td className="py-2 px-2">
                          <ModuleRowActions
                            entityLabel={`إجازة ${emp?.fullName || req.employeeId}`}
                            updatedAt={req.updatedAt}
                            permissions={permissions}
                            testIdPrefix={`hr-lr-${req.id}`}
                            onEdit={() =>
                              setFormModalState({
                                isOpen: true,
                                mode: 'edit',
                                entityKey: 'leave_request',
                                targetId: req.id,
                                title: `تعديل طلب إجازة: ${emp?.fullName || ''}`,
                                fields: getLeaveRequestFields(),
                                initialValues: { ...req },
                              })
                            }
                            onDelete={() =>
                              setDeleteModalState({
                                isOpen: true,
                                entityType: 'leave_request',
                                entityTitle: `طلب إجازة (${req.leaveType}) — ${emp?.fullName || req.employeeId}`,
                                entityId: req.id,
                                recordSummary: [
                                  { label: 'الموظف', value: emp?.fullName || req.employeeId },
                                  { label: 'النوع', value: req.leaveType },
                                  { label: 'المدة', value: `${req.daysCount} يوم` },
                                ],
                              })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
              {permissions.canDelete && activeRun && (
                <button
                  type="button"
                  onClick={() =>
                    setDeleteModalState({
                      isOpen: true,
                      entityType: 'payroll_run',
                      entityTitle: `مسير رواتب شهر ${activeRun.monthKey}`,
                      entityId: activeRun.id,
                      recordSummary: [
                        { label: 'الشهر', value: activeRun.monthKey },
                        { label: 'الحالة', value: activeRun.status },
                        { label: 'عدد الموظفين بالمسير', value: activeRun.lines.length },
                      ],
                    })
                  }
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl font-black cursor-pointer"
                >
                  حذف مسير المعاينة
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
                  <th className="py-2 px-2 border border-slate-700">مفردات وتعديل الأجر</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {(activeRun?.lines || []).map((l) => {
                  const emp = state.employees.find((e) => e.id === l.employeeId);
                  return (
                    <tr key={l.id} className="hover:bg-slate-50">
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
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
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
                          {permissions.canEdit && emp && activeRun?.status !== 'معتمد' && (
                            <button
                              type="button"
                              onClick={() =>
                                setFormModalState({
                                  isOpen: true,
                                  mode: 'edit',
                                  entityKey: 'employee',
                                  targetId: emp.id,
                                  title: `تعديل مفردات أجر الموظف: ${emp.fullName}`,
                                  fields: getEmployeeFields(),
                                  initialValues: { ...emp },
                                })
                              }
                              className="px-2.5 py-1 bg-[#0A1628] text-[#D4AF37] rounded-lg text-[11px] font-black cursor-pointer"
                            >
                              تعديل الأجر
                            </button>
                          )}
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

      {subView === 'loans_promotions' && (
        <div className="space-y-5">
          {/* Loans Table */}
          <div className="space-y-3">
            <ModuleTableToolbar
              title="سجل السلف والأقساط الشهرية للعاملين"
              subtitle="جدولة آلية للأقساط الشهرية وربطها المباشر بمسير الرواتب"
              count={state.loans.length}
              addLabel="إضافة سلفة مالية جديدة"
              permissions={permissions}
              testIdPrefix="hr-loans"
              onAddClick={() =>
                setFormModalState({
                  isOpen: true,
                  mode: 'add',
                  entityKey: 'loan',
                  title: 'إضافة سلفة جديدة وجدولة أقساطها',
                  fields: getLoanFields(),
                  initialValues: {
                    loanNumber: `LN-${Date.now().toString().slice(-5)}`,
                    employeeId: state.employees[0]?.id || '',
                    totalAmount: 6000,
                    disbursedDate: new Date().toISOString().split('T')[0],
                    installmentsCount: 12,
                    paidInstallments: 0,
                    status: 'سارية',
                  },
                })
              }
            />

            {!isViewer && (
              <form onSubmit={handleAddLoan} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                <select value={loanEmpId} onChange={(e) => setLoanEmpId(e.target.value)} className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold">
                  {state.employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
                <input type="number" value={loanAmount} onChange={(e) => setLoanAmount(Number(e.target.value) || 0)} placeholder="قيمة السلفة" className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
                <input type="number" value={loanInstallments} onChange={(e) => setLoanInstallments(Number(e.target.value) || 1)} placeholder="عدد الأقساط" className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
                <button type="submit" className="py-2 bg-[#0D9488] text-white rounded-xl font-black cursor-pointer">
                  تسجيل سريع للسلفة
                </button>
              </form>
            )}

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead className="bg-[#0A1628] text-white font-black">
                  <tr>
                    <th className="py-2 px-2 border border-slate-700">رقم السلفة</th>
                    <th className="py-2 px-2 border border-slate-700 text-right">الموظف</th>
                    <th className="py-2 px-2 border border-slate-700">إجمالي السلفة</th>
                    <th className="py-2 px-2 border border-slate-700">القسط الشهري</th>
                    <th className="py-2 px-2 border border-slate-700">الأقساط المسددة / الكلية</th>
                    <th className="py-2 px-2 border border-slate-700">المبلغ المتبقي</th>
                    <th className="py-2 px-2 border border-slate-700">الحالة</th>
                    <th className="py-2 px-2 border border-slate-700">إدارة السجل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {state.loans.map((ln) => {
                    const emp = state.employees.find((e) => e.id === ln.employeeId);
                    return (
                      <tr key={ln.id} className="hover:bg-slate-50">
                        <td className="py-2 px-2 font-mono">{ln.loanNumber}</td>
                        <td className="py-2 px-2 text-right font-black text-[#0A1628]">{emp?.fullName || ln.employeeId}</td>
                        <td className="py-2 px-2 font-mono">{ln.totalAmount.toLocaleString()} ج.م</td>
                        <td className="py-2 px-2 font-mono text-[#0D9488]">{ln.installmentAmount.toLocaleString()} ج.م</td>
                        <td className="py-2 px-2 font-mono">{ln.paidInstallments} / {ln.installmentsCount}</td>
                        <td className="py-2 px-2 font-mono font-black text-rose-700">{ln.remainingAmount.toLocaleString()} ج.م</td>
                        <td className="py-2 px-2">{ln.status}</td>
                        <td className="py-2 px-2">
                          <ModuleRowActions
                            entityLabel={ln.loanNumber}
                            updatedAt={ln.updatedAt}
                            permissions={permissions}
                            testIdPrefix={`hr-loan-${ln.id}`}
                            onEdit={() =>
                              setFormModalState({
                                isOpen: true,
                                mode: 'edit',
                                entityKey: 'loan',
                                targetId: ln.id,
                                title: `تعديل السلفة: ${ln.loanNumber}`,
                                fields: getLoanFields(),
                                initialValues: { ...ln },
                              })
                            }
                            onDelete={() =>
                              setDeleteModalState({
                                isOpen: true,
                                entityType: 'loan',
                                entityTitle: `${ln.loanNumber} — ${emp?.fullName || ''}`,
                                entityId: ln.id,
                                recordSummary: [
                                  { label: 'رقم السلفة', value: ln.loanNumber },
                                  { label: 'الموظف', value: emp?.fullName || ln.employeeId },
                                  { label: 'المبلغ المتبقي', value: `${ln.remainingAmount} ج.م` },
                                ],
                              })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Promotions Table */}
          <div className="space-y-3">
            <ModuleTableToolbar
              title="سجل قرارات الترقيات والعلاوات التشجيعية"
              subtitle="توثيق القرارات الإدارية للترقية وتعديل الدرجة المالية والعلاوة المقررة"
              count={state.promotions.length}
              addLabel="إضافة قرار ترقية / علاوة"
              permissions={permissions}
              testIdPrefix="hr-promotions"
              onAddClick={() =>
                setFormModalState({
                  isOpen: true,
                  mode: 'add',
                  entityKey: 'promotion',
                  title: 'إضافة قرار ترقية أو علاوة جديد',
                  fields: getPromotionFields(),
                  initialValues: {
                    employeeId: state.employees[0]?.id || '',
                    decisionNumber: `PRM-${new Date().getFullYear()}-${state.promotions.length + 1}`,
                    dueDate: new Date().toISOString().split('T')[0],
                    previousPromotionDate: '2022-07-01',
                    currentGrade: 'الثالثة',
                    nextGrade: 'الثانية',
                    raiseBasisAmount: 4500,
                    raisePct: 10,
                    raiseAmount: 450,
                    applied: true,
                  },
                })
              }
            />

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead className="bg-[#0A1628] text-white font-black">
                  <tr>
                    <th className="py-2 px-2 border border-slate-700">رقم القرار</th>
                    <th className="py-2 px-2 border border-slate-700 text-right">الموظف</th>
                    <th className="py-2 px-2 border border-slate-700">تاريخ الاستحقاق</th>
                    <th className="py-2 px-2 border border-slate-700">الدرجة الحالية ← الجديدة</th>
                    <th className="py-2 px-2 border border-slate-700">العلاوة المقررة</th>
                    <th className="py-2 px-2 border border-slate-700">إدارة السجل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {state.promotions.map((prm) => {
                    const emp = state.employees.find((e) => e.id === prm.employeeId);
                    return (
                      <tr key={prm.id} className="hover:bg-slate-50">
                        <td className="py-2 px-2 font-mono">{prm.decisionNumber}</td>
                        <td className="py-2 px-2 text-right font-black text-[#0A1628]">{emp?.fullName || prm.employeeId}</td>
                        <td className="py-2 px-2 font-mono">{prm.dueDate}</td>
                        <td className="py-2 px-2">{prm.currentGrade} ← {prm.nextGrade}</td>
                        <td className="py-2 px-2 font-mono text-[#0D9488] font-black">+{prm.raiseAmount} ج.م ({prm.raisePct}%)</td>
                        <td className="py-2 px-2">
                          <ModuleRowActions
                            entityLabel={prm.decisionNumber}
                            updatedAt={prm.updatedAt}
                            permissions={permissions}
                            testIdPrefix={`hr-prm-${prm.id}`}
                            onEdit={() =>
                              setFormModalState({
                                isOpen: true,
                                mode: 'edit',
                                entityKey: 'promotion',
                                targetId: prm.id,
                                title: `تعديل قرار الترقية: ${prm.decisionNumber}`,
                                fields: getPromotionFields(),
                                initialValues: { ...prm },
                              })
                            }
                            onDelete={() =>
                              setDeleteModalState({
                                isOpen: true,
                                entityType: 'promotion',
                                entityTitle: `قرار ترقية ${prm.decisionNumber}`,
                                entityId: prm.id,
                                recordSummary: [
                                  { label: 'رقم القرار', value: prm.decisionNumber },
                                  { label: 'الموظف', value: emp?.fullName || prm.employeeId },
                                  { label: 'الدرجة الجديدة', value: prm.nextGrade },
                                ],
                              })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* End of Service Calculator */}
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
                <th className="py-2 px-2 border border-slate-700">الجدول</th>
                <th className="py-2 px-2 border border-slate-700 text-right">التفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-bold">
              {state.auditLogs.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 px-2 font-mono">{new Date(a.timestamp).toLocaleString('ar-EG')}</td>
                  <td className="py-2 px-2">{a.userFullName}</td>
                  <td className="py-2 px-2 text-[#0D9488]">{a.actionType}</td>
                  <td className="py-2 px-2">{a.entityName}</td>
                  <td className="py-2 px-2 text-right">{a.afterSummary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Unified Add/Edit Modal */}
      {formModalState && (
        <ModuleFormModal
          isOpen={formModalState.isOpen}
          mode={formModalState.mode}
          title={formModalState.title}
          fields={formModalState.fields}
          initialValues={formModalState.initialValues}
          onClose={() => setFormModalState(null)}
          onSubmit={handleModalSubmit}
        />
      )}

      {/* Unified Delete Confirmation Modal */}
      {deleteModalState && (
        <ModuleDeleteConfirmModal
          isOpen={deleteModalState.isOpen}
          entityTitle={deleteModalState.entityTitle}
          recordSummary={deleteModalState.recordSummary}
          canDelete={activeDeleteCheck.canDelete}
          blockReason={activeDeleteCheck.reason}
          onClose={() => setDeleteModalState(null)}
          onConfirmDelete={handleConfirmDelete}
        />
      )}
    </div>
  );
};
