import type { HrEmployee } from '../types/modules';
import { parseEgyptianNationalId } from './hrPayrollMath';
import { round2 } from './rationMathEngine';
import { normalizeLocalUnitLabel } from './tableGroupingHelpers';

export function normalizeArabicDigits(input: string): string {
  const ar = '٠١٢٣٤٥٦٧٨٩';
  return String(input || '')
    .trim()
    .replace(/[٠-٩]/g, (d) => String(ar.indexOf(d)));
}

export function validateEgyptianPhone(phone: string): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  let cleaned = normalizeArabicDigits(phone).replace(/[\s\-()]/g, '');
  if (!cleaned) {
    return { valid: false, normalized: '', error: 'رقم الهاتف مطلوب ولا يمكن تركه فارغاً.' };
  }
  if (cleaned.startsWith('+20')) cleaned = `0${cleaned.slice(3)}`;
  else if (cleaned.startsWith('0020')) cleaned = `0${cleaned.slice(4)}`;
  else if (cleaned.startsWith('20') && cleaned.length === 12) cleaned = `0${cleaned.slice(2)}`;

  if (/^01[0125]\d{8}$/.test(cleaned) || /^0\d{8,9}$/.test(cleaned)) {
    return { valid: true, normalized: cleaned };
  }
  return {
    valid: false,
    normalized: cleaned,
    error: 'رقم الهاتف غير صالح (يجب أن يكون رقماً مصرياً صحيحاً مثل 010xxxxxxxx أو رقم أرضي مبدوءاً بـ 0).',
  };
}

export function validateHrEmployeeInput(params: {
  fullName: string;
  nationalId: string;
  phone: string;
  employeeCode?: string;
  existingEmployees: HrEmployee[];
  editingEmployeeId?: string;
}): {
  valid: boolean;
  error?: string;
  normalizedNationalId: string;
  normalizedPhone: string;
  birthDate?: string;
  gender?: 'ذكر' | 'أنثى';
} {
  const fullName = String(params.fullName || '').trim();
  const nidClean = normalizeArabicDigits(params.nationalId);
  if (!fullName) {
    return {
      valid: false,
      error: 'اسم الموظف رباعي مطلوب.',
      normalizedNationalId: nidClean,
      normalizedPhone: '',
    };
  }

  const parsedNid = parseEgyptianNationalId(nidClean);
  if (!parsedNid.valid) {
    return {
      valid: false,
      error: parsedNid.error || 'الرقم القومي غير صالح.',
      normalizedNationalId: nidClean,
      normalizedPhone: '',
    };
  }

  const dupNid = (params.existingEmployees || []).find(
    (e) =>
      e.id !== params.editingEmployeeId &&
      normalizeArabicDigits(e.nationalId) === nidClean
  );
  if (dupNid) {
    return {
      valid: false,
      error: `الرقم القومي (${nidClean}) مسجل بالفعل للموظف (${dupNid.fullName}).`,
      normalizedNationalId: nidClean,
      normalizedPhone: '',
    };
  }

  if (params.employeeCode && params.employeeCode.trim()) {
    const codeClean = params.employeeCode.trim().toLowerCase();
    const dupCode = (params.existingEmployees || []).find(
      (e) => e.id !== params.editingEmployeeId && String(e.employeeCode || '').trim().toLowerCase() === codeClean
    );
    if (dupCode) {
      return {
        valid: false,
        error: `الكود الوظيفي (${params.employeeCode.trim()}) مسجل بالفعل للموظف (${dupCode.fullName}).`,
        normalizedNationalId: nidClean,
        normalizedPhone: '',
      };
    }
  }

  const phoneCheck = validateEgyptianPhone(params.phone);
  if (!phoneCheck.valid) {
    return {
      valid: false,
      error: phoneCheck.error,
      normalizedNationalId: nidClean,
      normalizedPhone: phoneCheck.normalized,
    };
  }

  return {
    valid: true,
    normalizedNationalId: nidClean,
    normalizedPhone: phoneCheck.normalized,
    birthDate: parsedNid.birthDate,
    gender: parsedNid.gender,
  };
}

export interface ContractCountdownInfo {
  statusLabel: 'ساري التعاقد' | 'اقترب موعد انتهاء التعاقد' | 'منتهي التعاقد' | 'غير محدد';
  daysRemaining: number | null;
  isExpired: boolean;
  isExpiringSoon: boolean;
}

export function classifyContractCountdown(
  contractEndDate?: string,
  referenceDateIso: string = new Date().toISOString().slice(0, 10)
): ContractCountdownInfo {
  const raw = String(contractEndDate || '').trim();
  if (!raw) {
    return { statusLabel: 'غير محدد', daysRemaining: null, isExpired: false, isExpiringSoon: false };
  }
  const end = new Date(`${raw.slice(0, 10)}T00:00:00Z`);
  const ref = new Date(`${referenceDateIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(end.getTime()) || Number.isNaN(ref.getTime())) {
    return { statusLabel: 'غير محدد', daysRemaining: null, isExpired: false, isExpiringSoon: false };
  }
  const daysRemaining = Math.round((end.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
  if (daysRemaining < 0) {
    return { statusLabel: 'منتهي التعاقد', daysRemaining, isExpired: true, isExpiringSoon: false };
  }
  if (daysRemaining <= 30) {
    return {
      statusLabel: 'اقترب موعد انتهاء التعاقد',
      daysRemaining,
      isExpired: false,
      isExpiringSoon: true,
    };
  }
  return { statusLabel: 'ساري التعاقد', daysRemaining, isExpired: false, isExpiringSoon: false };
}

export function isPublicServiceEmployee(emp: HrEmployee): boolean {
  const empType = String(emp.employeeType || emp.appointmentType || '').trim();
  return empType === 'خدمة عامة';
}

export function isAssistanceEmployee(emp: HrEmployee): boolean {
  const empType = String(emp.employeeType || emp.appointmentType || '').trim();
  return empType === 'استعانة';
}

export interface WorkSiteSummary {
  workSite: string;
  count: number;
  activeCount: number;
  expiringCount: number;
  expiredCount: number;
  totalMonthlyGross: number;
}

export function partitionAndGroupSpecialEmployees(
  employees: HrEmployee[],
  referenceDateIso: string = new Date().toISOString().slice(0, 10)
): {
  publicService: HrEmployee[];
  assistance: HrEmployee[];
  publicServiceByWorkSite: WorkSiteSummary[];
  assistanceByWorkSite: WorkSiteSummary[];
} {
  const publicService = (employees || []).filter(isPublicServiceEmployee);
  const assistance = (employees || []).filter(isAssistanceEmployee);

  const summarizeByWorkSite = (list: HrEmployee[]): WorkSiteSummary[] => {
    const map = new Map<string, HrEmployee[]>();
    for (const e of list) {
      const site = normalizeLocalUnitLabel(e.workSite || e.workEntity || e.departmentName);
      const bucket = map.get(site);
      if (bucket) bucket.push(e);
      else map.set(site, [e]);
    }
    return Array.from(map.entries()).map(([workSite, items]) => {
      let expiringCount = 0;
      let expiredCount = 0;
      let activeCount = 0;
      let totalMonthlyGross = 0;
      for (const item of items) {
        const info = classifyContractCountdown(item.contractEndDate, referenceDateIso);
        if (info.isExpired || item.status === 'منتهي التعاقد') expiredCount += 1;
        else if (info.isExpiringSoon || item.status === 'اقترب موعد انتهاء التعاقد') expiringCount += 1;
        else activeCount += 1;
        totalMonthlyGross +=
          (Number(item.functionalWage) || 0) +
          (Number(item.complementaryWage) || 0) +
          (Number(item.monthlyIncentives) || 0) +
          (Number(item.allowancesTotal) || 0);
      }
      return {
        workSite,
        count: items.length,
        activeCount,
        expiringCount,
        expiredCount,
        totalMonthlyGross: round2(totalMonthlyGross),
      };
    });
  };

  return {
    publicService,
    assistance,
    publicServiceByWorkSite: summarizeByWorkSite(publicService),
    assistanceByWorkSite: summarizeByWorkSite(assistance),
  };
}
