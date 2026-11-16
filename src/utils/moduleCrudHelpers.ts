import type {
  GrainMaintenanceState,
  HrModuleState,
  ModuleAuditLog,
  RationModuleState,
} from '../types/modules';
import type { AppUser } from '../types';

export interface RelationalCheckResult {
  canDelete: boolean;
  reason?: string;
  relatedCount?: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface ModulePermissions {
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isReadOnly: boolean;
}

/**
 * صلاحيات المستخدم لتنفيذ عمليات الإضافة والتعديل والحذف داخل الأقسام
 */
export function resolveModuleCrudPermissions(
  currentUser: AppUser | null,
  isVaultLocked = false
): ModulePermissions {
  if (!currentUser) {
    return {
      canAdd: !isVaultLocked,
      canEdit: !isVaultLocked,
      canDelete: !isVaultLocked,
      isReadOnly: isVaultLocked,
    };
  }
  if (currentUser.role === 'viewer' || isVaultLocked) {
    return {
      canAdd: false,
      canEdit: false,
      canDelete: false,
      isReadOnly: true,
    };
  }
  const custom = currentUser.customPermissions;
  const hasCustom = Array.isArray(custom) && custom.length > 0;
  const canAdd = hasCustom ? custom.includes('add') || custom.includes('canAdd') || currentUser.role === 'admin' : true;
  const canEdit = hasCustom ? custom.includes('edit') || custom.includes('canEdit') || currentUser.role === 'admin' : true;
  const canDelete =
    currentUser.role === 'admin' || currentUser.role === 'supervisor'
      ? true
      : hasCustom
        ? custom.includes('delete') || custom.includes('canDelete')
        : true;

  return {
    canAdd,
    canEdit,
    canDelete,
    isReadOnly: !canAdd && !canEdit && !canDelete,
  };
}

/**
 * فحص العلاقات المرجعية قبل الحذف في قسم السلع التموينية والتجارة الداخلية
 * لمنع تلف البيانات المرتبطة
 */
export function checkRationDeleteIntegrity(
  state: RationModuleState,
  entityType:
    | 'merchant'
    | 'card'
    | 'commodity'
    | 'disbursement'
    | 'warehouse'
    | 'movement'
    | 'requisition'
    | 'financial'
    | 'inspection'
    | 'complaint',
  entityId: string
): RelationalCheckResult {
  if (entityType === 'merchant') {
    const linkedCards = state.cards.filter((c) => c.merchantId === entityId).length;
    const linkedDisb = state.disbursements.filter(
      (d) => d.merchantId === entityId && !d.isReversed
    ).length;
    const linkedReq = state.requisitions.filter(
      (r) => r.merchantId === entityId && r.status !== 'ملغي'
    ).length;
    const totalLinked = linkedCards + linkedDisb + linkedReq;
    if (totalLinked > 0) {
      return {
        canDelete: false,
        relatedCount: totalLinked,
        reason: `لا يمكن حذف هذا المنفذ لارتباطه بـ (${linkedCards} بطاقة، ${linkedDisb} عملية صرف، ${linkedReq} طلب استعاضة). يرجى نقل أو حذف السجلات المرتبطة أولاً حفاظاً على سلامة قاعدة البيانات.`,
      };
    }
  }

  if (entityType === 'commodity') {
    const linkedDisb = state.disbursements.filter(
      (d) => d.commodityId === entityId && !d.isReversed
    ).length;
    const linkedWh = state.warehouses.filter((w) => w.commodityId === entityId).length;
    const totalLinked = linkedDisb + linkedWh;
    if (totalLinked > 0) {
      return {
        canDelete: false,
        relatedCount: totalLinked,
        reason: `لا يمكن حذف السلعة لارتباطها بـ (${linkedWh} رصيد مخزني و${linkedDisb} عملية صرف تمويني). يمكنك تعديل بياناتها أو إيقاف تفعيلها بدلاً من الحذف.`,
      };
    }
  }

  if (entityType === 'card') {
    const linkedDisb = state.disbursements.filter(
      (d) => d.cardId === entityId && !d.isReversed
    ).length;
    if (linkedDisb > 0) {
      return {
        canDelete: false,
        relatedCount: linkedDisb,
        reason: `لا يمكن حذف البطاقة التموينية لوجود (${linkedDisb}) عمليات صرف مسجلة عليها في الشهر النشط. يرجى حذف عمليات الصرف المرتبطة أولاً أو تغيير حالة البطاقة إلى موقوفة.`,
      };
    }
  }

  return { canDelete: true };
}

/**
 * فحص العلاقات المرجعية قبل الحذف في قسم صيانة الحبوب والصوامع
 */
export function checkGrainDeleteIntegrity(
  state: GrainMaintenanceState,
  entityType: 'asset' | 'order' | 'part' | 'technician' | 'grain_movement',
  entityId: string
): RelationalCheckResult {
  if (entityType === 'asset') {
    const linkedOrders = state.orders.filter((o) => o.assetId === entityId).length;
    if (linkedOrders > 0) {
      return {
        canDelete: false,
        relatedCount: linkedOrders,
        reason: `لا يمكن حذف الصومعة/المعدة لارتباطها بـ (${linkedOrders}) أمر صيانة مسجل. يرجى حذف أوامر الصيانة المرتبطة أولاً.`,
      };
    }
  }

  if (entityType === 'part') {
    const linkedOrders = state.orders.filter((o) =>
      o.partsUsed.some((pu) => pu.partId === entityId)
    ).length;
    if (linkedOrders > 0) {
      return {
        canDelete: false,
        relatedCount: linkedOrders,
        reason: `لا يمكن حذف قطعة الغيار لارتباطها بـ (${linkedOrders}) أمر صيانة مسجل بالتكاليف.`,
      };
    }
  }

  return { canDelete: true };
}

/**
 * فحص العلاقات المرجعية قبل الحذف في قسم الموارد البشرية
 */
export function checkHrDeleteIntegrity(
  state: HrModuleState,
  entityType:
    | 'employee'
    | 'department'
    | 'attendance'
    | 'leave_request'
    | 'leave_balance'
    | 'payroll_run'
    | 'loan'
    | 'promotion',
  entityId: string
): RelationalCheckResult {
  if (entityType === 'employee') {
    const activeLoans = state.loans.filter(
      (l) => l.employeeId === entityId && l.status === 'سارية' && l.remainingAmount > 0
    ).length;
    if (activeLoans > 0) {
      return {
        canDelete: false,
        relatedCount: activeLoans,
        reason: `لا يمكن حذف ملف الموظف لوجود (${activeLoans}) سلفة مالية سارية غير مسددة بالكامل. يرجى تسوية أو حذف السلفة أولاً.`,
      };
    }
  }

  if (entityType === 'department') {
    const dept = state.departments.find((d) => d.id === entityId);
    if (dept) {
      const linkedEmps = state.employees.filter((e) => e.departmentName === dept.name).length;
      if (linkedEmps > 0) {
        return {
          canDelete: false,
          relatedCount: linkedEmps,
          reason: `لا يمكن حذف القسم الإداري (${dept.name}) لوجود (${linkedEmps}) موظف مسجل عليه حالياً.`,
        };
      }
    }
  }

  if (entityType === 'payroll_run') {
    const run = state.payrollRuns.find((r) => r.id === entityId);
    if (run && run.status === 'معتمد') {
      return {
        canDelete: false,
        relatedCount: run.lines.length,
        reason: `لا يمكن حذف مسير رواتب شهر (${run.monthKey}) لأنه معتمد ومقفل نهائياً.`,
      };
    }
  }

  return { canDelete: true };
}

/**
 * إنشاء قيد تدقيق ومراجعة موحد يتضمن اسم المستخدم ونوع العملية وتاريخها ووقتها
 */
export function createModuleAuditEntry(params: {
  branchId: string;
  module: ModuleAuditLog['module'];
  actionType: ModuleAuditLog['actionType'];
  entityName: string;
  entityId: string;
  currentUser: AppUser | null;
  afterSummary: string;
  beforeSummary?: string;
}): ModuleAuditLog {
  return {
    id: `aud-${params.module}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    branchId: params.branchId,
    module: params.module,
    timestamp: new Date().toISOString(),
    username: params.currentUser?.username || 'admin',
    userFullName: params.currentUser?.fullName || 'مسؤول النظام',
    actionType: params.actionType,
    entityName: params.entityName,
    entityId: params.entityId,
    beforeSummary: params.beforeSummary,
    afterSummary: params.afterSummary,
  };
}

/**
 * تنسيق تاريخ ووقت آخر تعديل بالصيغة العربية الرسمية
 */
export function formatArabicDateTime(iso?: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('ar-EG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
