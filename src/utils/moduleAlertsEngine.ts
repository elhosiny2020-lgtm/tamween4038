import type { AppUser } from '../types';
import type {
  GrainMaintenanceState,
  HrModuleState,
  InternalTradeState,
  RationModuleState,
} from '../types/modules';
import { hasDepartmentPermission, isSuperAdmin } from './departmentRbac';
import { computeWarehouseStockStatus } from './rationMathEngine';
import { normalizeLocalUnitLabel } from './tableGroupingHelpers';

export type DepartmentAlertScope = 'commodities' | 'internal_trade' | 'hr' | 'grain_maintenance';
export type DepartmentAlertSeverity = 'critical' | 'warning' | 'info';

export interface DepartmentAlertItem {
  id: string;
  department: DepartmentAlertScope;
  type: string;
  title: string;
  message: string;
  severity: DepartmentAlertSeverity;
  localUnit: string;
  village?: string;
  sourceLabel: string;
  sourceId?: string;
  timestamp: string;
  dateKey: string;
}

export interface DepartmentAlertFilters {
  type?: string;
  localUnit?: string;
  dateFrom?: string;
  dateTo?: string;
  unreadOnly?: boolean;
  readIds?: string[];
}

export function canViewDepartmentAlerts(
  user: AppUser | null | undefined,
  dept: DepartmentAlertScope
): boolean {
  if (!user || user.isActive === false) return false;
  if (isSuperAdmin(user)) return true;
  return hasDepartmentPermission(user, dept, 'view');
}

/**
 * حذف التنبيهات مقتصر على مدير النظام الرئيسي فقط
 */
export function canDeleteDepartmentAlert(user: AppUser | null | undefined): boolean {
  return isSuperAdmin(user);
}

function resolveDateKey(raw?: string, fallback?: string): string {
  const s = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return fallback || new Date().toISOString().slice(0, 10);
}

function daysUntilDate(targetIso: string, todayIso: string): number {
  const t = new Date(`${String(targetIso || '').slice(0, 10)}T00:00:00Z`);
  const ref = new Date(`${String(todayIso || '').slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t.getTime()) || Number.isNaN(ref.getTime())) return 9999;
  return Math.round((t.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
}

function checkExpiryStatus(
  expiryDate: string | undefined,
  todayIso: string,
  warnDays = 30
): 'expired' | 'expiring' | 'ok' {
  if (!expiryDate || !expiryDate.trim()) return 'ok';
  const days = daysUntilDate(expiryDate, todayIso);
  if (days < 0) return 'expired';
  if (days <= warnDays) return 'expiring';
  return 'ok';
}

/**
 * استخراج تنبيهات وإشعارات قسم السلع التموينية من قاعدة البيانات الفعلية
 */
export function buildCommoditiesDepartmentAlerts(
  ration: RationModuleState | undefined,
  referenceDateIso: string = new Date().toISOString().slice(0, 10)
): DepartmentAlertItem[] {
  if (!ration) return [];
  const alerts: DepartmentAlertItem[] = [];

  for (const m of ration.merchants || []) {
    const unit = normalizeLocalUnitLabel(m.localUnit);
    const updatedTs = m.updatedAt || referenceDateIso;

    // 1. انتهاء / قرب انتهاء الرخصة، البطاقة الضريبية، السجل التجاري
    const licState = checkExpiryStatus(m.licenseExpiryDate, referenceDateIso, 30);
    if (licState !== 'ok') {
      alerts.push({
        id: `comm-lic-${m.id}-${m.licenseExpiryDate}`,
        department: 'commodities',
        type: 'انتهاء تراخيص',
        title: licState === 'expired' ? `رخصة منتهية: ${m.merchantName}` : `رخصة تقترب من الانتهاء: ${m.merchantName}`,
        message:
          licState === 'expired'
            ? `انتهت رخصة المنفذ (${m.licenseNumber || '—'}) بتاريخ ${m.licenseExpiryDate}.`
            : `رخصة المنفذ (${m.licenseNumber || '—'}) تنتهي خلال ${daysUntilDate(m.licenseExpiryDate, referenceDateIso)} يوماً (${m.licenseExpiryDate}).`,
        severity: licState === 'expired' ? 'critical' : 'warning',
        localUnit: unit,
        village: m.village,
        sourceLabel: 'قاعدة بيانات التجار والمنافذ',
        sourceId: m.id,
        timestamp: updatedTs,
        dateKey: resolveDateKey(m.licenseExpiryDate, referenceDateIso),
      });
    }

    const taxState = checkExpiryStatus(m.taxCardExpiryDate, referenceDateIso, 30);
    if (taxState !== 'ok') {
      alerts.push({
        id: `comm-tax-${m.id}-${m.taxCardExpiryDate}`,
        department: 'commodities',
        type: 'انتهاء تراخيص',
        title: taxState === 'expired' ? `بطاقة ضريبية منتهية: ${m.merchantName}` : `بطاقة ضريبية تقترب من الانتهاء: ${m.merchantName}`,
        message: `البطاقة الضريبية (${m.taxCardNumber || '—'}) بتاريخ انتهاء ${m.taxCardExpiryDate}.`,
        severity: taxState === 'expired' ? 'critical' : 'warning',
        localUnit: unit,
        village: m.village,
        sourceLabel: 'قاعدة بيانات التجار والمنافذ',
        sourceId: m.id,
        timestamp: updatedTs,
        dateKey: resolveDateKey(m.taxCardExpiryDate, referenceDateIso),
      });
    }

    const regState = checkExpiryStatus(m.commercialRegExpiryDate, referenceDateIso, 30);
    if (regState !== 'ok') {
      alerts.push({
        id: `comm-reg-${m.id}-${m.commercialRegExpiryDate}`,
        department: 'commodities',
        type: 'انتهاء تراخيص',
        title: regState === 'expired' ? `سجل تجاري منتهٍ: ${m.merchantName}` : `سجل تجاري يقترب من الانتهاء: ${m.merchantName}`,
        message: `السجل التجاري (${m.commercialRegNumber || '—'}) بتاريخ انتهاء ${m.commercialRegExpiryDate}.`,
        severity: regState === 'expired' ? 'critical' : 'warning',
        localUnit: unit,
        village: m.village,
        sourceLabel: 'قاعدة بيانات التجار والمنافذ',
        sourceId: m.id,
        timestamp: updatedTs,
        dateKey: resolveDateKey(m.commercialRegExpiryDate, referenceDateIso),
      });
    }

    // 2. نواقص بيانات التاجر الجوهرية أو مبلغ التأمين
    if ((Number(m.cashInsuranceAmount) || 0) <= 0 || !String(m.posMachineNumber || '').trim()) {
      alerts.push({
        id: `comm-data-${m.id}`,
        department: 'commodities',
        type: 'نقص بيانات أو تأمين',
        title: `تنبيه بيانات تاجر: ${m.merchantName}`,
        message:
          (Number(m.cashInsuranceAmount) || 0) <= 0
            ? 'مبلغ التأمين النقدي مسجل بقيمة صفر أو غير مستوفى.'
            : 'رقم ماكينة الصرف POS غير مسجل لهذا المنفذ.',
        severity: 'warning',
        localUnit: unit,
        village: m.village,
        sourceLabel: 'مراجعة بيانات التجار',
        sourceId: m.id,
        timestamp: updatedTs,
        dateKey: resolveDateKey(updatedTs, referenceDateIso),
      });
    }
  }

  // 3. تنبيهات المخزون والأرصدة والعجز
  const commodityById = new Map((ration.commodities || []).map((c) => [c.id, c]));
  const merchantById = new Map((ration.merchants || []).map((m) => [m.id, m]));
  for (const w of ration.warehouses || []) {
    const c = commodityById.get(w.commodityId);
    const merch = merchantById.get(w.merchantId);
    const status = computeWarehouseStockStatus(w, c?.supplyCostPrice || 0, referenceDateIso);
    if (status.alerts.length > 0) {
      alerts.push({
        id: `comm-wh-${w.id}`,
        department: 'commodities',
        type: 'تنبيه مخزني',
        title: `تنبيه مخزن (${c?.name || w.commodityId}) - ${w.warehouseName}`,
        message: status.alerts.join(' • '),
        severity:
          status.bookBalance < 0 || status.varianceType === 'عجز' || status.alerts.some((a) => a.includes('صلاحية'))
            ? 'critical'
            : 'warning',
        localUnit: normalizeLocalUnitLabel(merch?.localUnit),
        village: merch?.village,
        sourceLabel: 'أرصدة المخازن والجرد',
        sourceId: w.id,
        timestamp: w.updatedAt || referenceDateIso,
        dateKey: resolveDateKey(w.lastMovementDate || w.updatedAt, referenceDateIso),
      });
    }
  }

  // 4. شكاوى مفتوحة
  for (const cmp of ration.complaints || []) {
    if (cmp.status !== 'تم الحل' && cmp.status !== 'مغلقة') {
      const merch = cmp.merchantId ? merchantById.get(cmp.merchantId) : undefined;
      alerts.push({
        id: `comm-cmp-${cmp.id}`,
        department: 'commodities',
        type: 'شكاوى وبلاغات',
        title: `شكوى (${cmp.ticketNumber}) - ${cmp.category}`,
        message: `${cmp.citizenName}: ${cmp.details} (الحالة: ${cmp.status})`,
        severity: 'warning',
        localUnit: normalizeLocalUnitLabel(merch?.localUnit || cmp.village),
        village: cmp.village,
        sourceLabel: 'شكاوى السلع التموينية',
        sourceId: cmp.id,
        timestamp: cmp.updatedAt || cmp.date || referenceDateIso,
        dateKey: resolveDateKey(cmp.date, referenceDateIso),
      });
    }
  }

  // 5. محاضر/حملات تموينية قيد الفحص
  for (const ins of ration.inspections || []) {
    if (ins.inspectionResult === 'مخالف' && ins.dispositionStatus === 'قيد الفحص') {
      const merch = merchantById.get(ins.merchantId);
      alerts.push({
        id: `comm-ins-${ins.id}`,
        department: 'commodities',
        type: 'مخالفات ورقابة',
        title: `مخالفة قيد الفحص (${ins.reportNumber || 'بدون رقم'})`,
        message: `${ins.violationType}: ${ins.violationDescription}`,
        severity: 'critical',
        localUnit: normalizeLocalUnitLabel(merch?.localUnit || ins.village),
        village: ins.village,
        sourceLabel: 'حملات السلع التموينية',
        sourceId: ins.id,
        timestamp: ins.updatedAt || ins.inspectionDateTime || referenceDateIso,
        dateKey: resolveDateKey(ins.inspectionDateTime, referenceDateIso),
      });
    }
  }

  // 6. طلبات استعاضة مرفوضة أو متأخرة
  for (const req of ration.requisitions || []) {
    if (req.status === 'جديد' || req.status === 'مرفوض' || req.status === 'تسليم جزئي') {
      const merch = merchantById.get(req.merchantId);
      alerts.push({
        id: `comm-req-${req.id}`,
        department: 'commodities',
        type: 'استعاضات تموينية',
        title: `طلب استعاضة (${req.requestNumber}) - ${req.status}`,
        message: `منفذ ${merch?.merchantName || req.merchantId} بقيمة ${Number(req.totalValue || 0).toLocaleString()} ج.م.`,
        severity: req.status === 'مرفوض' ? 'critical' : 'info',
        localUnit: normalizeLocalUnitLabel(merch?.localUnit),
        village: merch?.village,
        sourceLabel: 'متابعة الاستعاضات',
        sourceId: req.id,
        timestamp: req.updatedAt || req.requestDate || referenceDateIso,
        dateKey: resolveDateKey(req.requestDate, referenceDateIso),
      });
    }
  }

  return alerts;
}

/**
 * استخراج تنبيهات وإشعارات قسم التجارة الداخلية والرقابة الموحدة من قاعدة البيانات الفعلية
 */
export function buildInternalTradeDepartmentAlerts(
  internalTrade: InternalTradeState | undefined,
  referenceDateIso: string = new Date().toISOString().slice(0, 10)
): DepartmentAlertItem[] {
  if (!internalTrade) return [];
  const alerts: DepartmentAlertItem[] = [];

  // 1. تراخيص وسجلات المنشآت والمنشآت المغلقة/المتوقفة
  for (const est of internalTrade.establishments || []) {
    const unit = normalizeLocalUnitLabel(est.localUnit);
    const ts = est.updatedAt || est.activityStartDate || referenceDateIso;
    const licState = checkExpiryStatus(est.licenseExpiryDate, referenceDateIso, 30);
    if (licState !== 'ok') {
      alerts.push({
        id: `it-lic-${est.id}-${est.licenseExpiryDate}`,
        department: 'internal_trade',
        type: 'انتهاء تراخيص',
        title:
          licState === 'expired'
            ? `ترخيص منشأة منتهٍ: ${est.establishmentName}`
            : `ترخيص منشأة قارب على الانتهاء: ${est.establishmentName}`,
        message: `الكود ${est.establishmentCode} — رقم الترخيص ${est.licenseNumber || '—'} ينتهي في ${est.licenseExpiryDate}.`,
        severity: licState === 'expired' ? 'critical' : 'warning',
        localUnit: unit,
        village: est.village,
        sourceLabel: 'تراخيص المنشآت التجارية',
        sourceId: est.id,
        timestamp: ts,
        dateKey: resolveDateKey(est.licenseExpiryDate, referenceDateIso),
      });
    }

    const regState = checkExpiryStatus(est.commercialRegExpiryDate, referenceDateIso, 30);
    if (regState !== 'ok') {
      alerts.push({
        id: `it-reg-${est.id}-${est.commercialRegExpiryDate}`,
        department: 'internal_trade',
        type: 'انتهاء تراخيص',
        title:
          regState === 'expired'
            ? `سجل تجاري منتهٍ: ${est.establishmentName}`
            : `سجل تجاري قارب على الانتهاء: ${est.establishmentName}`,
        message: `السجل التجاري (${est.commercialRegNumber || '—'}) ينتهي في ${est.commercialRegExpiryDate}.`,
        severity: regState === 'expired' ? 'critical' : 'warning',
        localUnit: unit,
        village: est.village,
        sourceLabel: 'السجلات التجارية',
        sourceId: est.id,
        timestamp: ts,
        dateKey: resolveDateKey(est.commercialRegExpiryDate, referenceDateIso),
      });
    }

    if (est.activityStatus === 'مغلق' || est.activityStatus === 'متوقف') {
      alerts.push({
        id: `it-closed-${est.id}`,
        department: 'internal_trade',
        type: 'منشآت مغلقة ومتوقفة',
        title: `منشأة ${est.activityStatus}: ${est.establishmentName}`,
        message: est.closureReason ? `السبب: ${est.closureReason}` : `تتطلب متابعة ميدانية (${est.establishmentCode}).`,
        severity: est.activityStatus === 'مغلق' ? 'critical' : 'warning',
        localUnit: unit,
        village: est.village,
        sourceLabel: 'متابعة المنشآت المغلقة',
        sourceId: est.id,
        timestamp: ts,
        dateKey: resolveDateKey(est.closureDate || ts, referenceDateIso),
      });
    }
  }

  // 2. الحملات التموينية غير المعتمدة أو عالية المخالفات
  for (const camp of internalTrade.campaigns || []) {
    if (!camp.finalReportSubmitted || (Number(camp.violatingCount) || 0) > 0) {
      alerts.push({
        id: `it-camp-${camp.id}`,
        department: 'internal_trade',
        type: 'حملات تموينية',
        title: !camp.finalReportSubmitted
          ? `حملة بدون تقرير نهائي: ${camp.campaignNumber}`
          : `حملة رصدت (${camp.violatingCount}) مخالفة: ${camp.campaignNumber}`,
        message: `نطاق الحملة: ${camp.village} / ${camp.geographicScope} — رئيس الحملة: ${camp.campaignHead}.`,
        severity: !camp.finalReportSubmitted ? 'warning' : 'info',
        localUnit: normalizeLocalUnitLabel(camp.localUnit),
        village: camp.village,
        sourceLabel: 'الحملات التموينية',
        sourceId: camp.id,
        timestamp: camp.updatedAt || camp.campaignDate || referenceDateIso,
        dateKey: resolveDateKey(camp.campaignDate, referenceDateIso),
      });
    }
  }

  // 3. المخالفات والمحاضر المفتوحة
  for (const v of internalTrade.violations || []) {
    if (v.status === 'جديد' || v.status === 'قيد التحقيق') {
      alerts.push({
        id: `it-viol-${v.id}`,
        department: 'internal_trade',
        type: 'مخالفات ومحاضر',
        title: `محضر (${v.reportNumber}) - ${v.establishmentName}`,
        message: `${v.violationType} — غرامة مقدرة ${(Number(v.fineAmount) || 0).toLocaleString()} ج.م (الحالة: ${v.status}).`,
        severity: 'critical',
        localUnit: normalizeLocalUnitLabel(v.localUnit),
        village: v.village,
        sourceLabel: 'المخالفات والمحاضر',
        sourceId: v.id,
        timestamp: v.updatedAt || v.reportDate || referenceDateIso,
        dateKey: resolveDateKey(v.reportDate, referenceDateIso),
      });
    }
  }

  // 4. المضبوطات والتحفظات قيد التحفظ أو الفحص
  for (const s of internalTrade.seizures || []) {
    if (s.seizureStatus === 'متحفظ عليها' || s.seizureStatus === 'تحت الفحص المعملي') {
      alerts.push({
        id: `it-seiz-${s.id}`,
        department: 'internal_trade',
        type: 'مضبوطات وتحفظات',
        title: `حرز (${s.seizureOrderNumber}) - ${s.commodityType}`,
        message: `${s.quantity} ${s.unit} لدى ${s.establishmentName} — الحالة: ${s.seizureStatus}.`,
        severity: 'warning',
        localUnit: normalizeLocalUnitLabel(s.village),
        village: s.village,
        sourceLabel: 'المضبوطات والتحفظات',
        sourceId: s.id,
        timestamp: s.updatedAt || s.seizureDate || referenceDateIso,
        dateKey: resolveDateKey(s.seizureDate, referenceDateIso),
      });
    }
  }

  // 5. الشكاوى والبلاغات المفتوحة
  for (const c of internalTrade.complaints || []) {
    if (c.status === 'جديدة' || c.status === 'قيد الفحص') {
      alerts.push({
        id: `it-cmp-${c.id}`,
        department: 'internal_trade',
        type: 'شكاوى وبلاغات',
        title: `شكوى (${c.complaintNumber}) - ${c.complaintType}`,
        message: `ضد ${c.targetEstablishmentName} (${c.source}) — الحالة: ${c.status}.`,
        severity: 'critical',
        localUnit: normalizeLocalUnitLabel(c.localUnit),
        village: c.village,
        sourceLabel: 'الشكاوى والبلاغات',
        sourceId: c.id,
        timestamp: c.updatedAt || c.receivedDate || referenceDateIso,
        dateKey: resolveDateKey(c.receivedDate, referenceDateIso),
      });
    }
  }

  // 6. محطات الوقود ومستودعات البوتاجاز
  for (const st of internalTrade.fuelStations || []) {
    if (
      st.licenseStatus === 'منتهي' ||
      st.licenseStatus === 'قارب على الانتهاء' ||
      st.stationStatus === 'مغلقة إدارياً' ||
      st.stationStatus === 'توقف جزئي'
    ) {
      alerts.push({
        id: `it-fuel-${st.id}`,
        department: 'internal_trade',
        type: 'مواد بترولية وبوتاجاز',
        title: `محطة وقود (${st.stationName}): ${st.stationStatus}`,
        message: `حالة الترخيص: ${st.licenseStatus} — الإجراء: ${st.inspectionActionTaken || 'يتطلب متابعة'}.`,
        severity: st.licenseStatus === 'منتهي' || st.stationStatus === 'مغلقة إدارياً' ? 'critical' : 'warning',
        localUnit: normalizeLocalUnitLabel(st.localUnit),
        village: st.village,
        sourceLabel: 'محطات الوقود',
        sourceId: st.id,
        timestamp: st.lastInventoryDate || referenceDateIso,
        dateKey: resolveDateKey(st.lastInventoryDate, referenceDateIso),
      });
    }
  }

  for (const dep of internalTrade.lpgDepots || []) {
    const depExp = checkExpiryStatus(dep.licenseExpiryDate, referenceDateIso, 30);
    if (depExp !== 'ok') {
      alerts.push({
        id: `it-lpg-${dep.id}`,
        department: 'internal_trade',
        type: 'مواد بترولية وبوتاجاز',
        title:
          depExp === 'expired'
            ? `ترخيص مستودع بوتاجاز منتهٍ: ${dep.depotName}`
            : `ترخيص مستودع بوتاجاز يقترب من الانتهاء: ${dep.depotName}`,
        message: `رقم الترخيص ${dep.licenseNumber} ينتهي في ${dep.licenseExpiryDate}.`,
        severity: depExp === 'expired' ? 'critical' : 'warning',
        localUnit: normalizeLocalUnitLabel(dep.localUnit),
        village: dep.village,
        sourceLabel: 'مستودعات البوتاجاز',
        sourceId: dep.id,
        timestamp: dep.licenseExpiryDate || referenceDateIso,
        dateKey: resolveDateKey(dep.licenseExpiryDate, referenceDateIso),
      });
    }
  }

  return alerts;
}

/**
 * استخراج تنبيهات وإشعارات قسم الموارد البشرية وشؤون العاملين (بما في ذلك عقود الخدمة العامة والاستعانة قبل 30 يوماً)
 */
export function buildHrDepartmentAlerts(
  hr: HrModuleState | undefined,
  referenceDateIso: string = new Date().toISOString().slice(0, 10)
): DepartmentAlertItem[] {
  if (!hr) return [];
  const alerts: DepartmentAlertItem[] = [];

  for (const emp of hr.employees || []) {
    const isContractEmp = emp.employeeType === 'خدمة عامة' || emp.employeeType === 'استعانة';
    if (isContractEmp && emp.contractEndDate) {
      const expState = checkExpiryStatus(emp.contractEndDate, referenceDateIso, 30);
      if (expState !== 'ok') {
        const daysLeft = daysUntilDate(emp.contractEndDate, referenceDateIso);
        alerts.push({
          id: `hr-contract-${emp.id}-${emp.contractEndDate}`,
          department: 'hr',
          type: emp.employeeType === 'استعانة' ? 'عقود موظفي الاستعانة' : 'عقود الخدمة العامة',
          title:
            expState === 'expired'
              ? `عقد ${emp.employeeType} منتهٍ: ${emp.fullName}`
              : `عقد ${emp.employeeType} ينتهي خلال ${daysLeft} يوماً: ${emp.fullName}`,
          message: `الكود (${emp.employeeCode}) — الهاتف (${emp.phone || 'غير مسجل'}) — القسم: ${emp.departmentName} — ينتهي في ${emp.contractEndDate}.`,
          severity: expState === 'expired' ? 'critical' : 'warning',
          localUnit: normalizeLocalUnitLabel(emp.workSite || emp.departmentName),
          village: emp.village,
          sourceLabel: emp.employeeType === 'استعانة' ? 'قسم موظفو الاستعانة' : 'قسم موظفو الخدمة العامة',
          sourceId: emp.id,
          timestamp: emp.updatedAt || referenceDateIso,
          dateKey: resolveDateKey(emp.contractEndDate, referenceDateIso),
        });
      }
    }

    if (!String(emp.phone || '').trim()) {
      alerts.push({
        id: `hr-phone-${emp.id}`,
        department: 'hr',
        type: 'نواقص بيانات العاملين',
        title: `رقم الهاتف غير مسجل: ${emp.fullName}`,
        message: `الموظف (${emp.employeeCode}) في ${emp.departmentName} غير مسجل له رقم هاتف محمول.`,
        severity: 'info',
        localUnit: normalizeLocalUnitLabel(emp.workSite || emp.departmentName),
        village: emp.village,
        sourceLabel: 'ملف الموظفين',
        sourceId: emp.id,
        timestamp: emp.updatedAt || referenceDateIso,
        dateKey: resolveDateKey(emp.updatedAt, referenceDateIso),
      });
    }
  }

  for (const run of hr.payrollRuns || []) {
    if (run.status === 'معاينة') {
      alerts.push({
        id: `hr-payroll-draft-${run.id}`,
        department: 'hr',
        type: 'مسيرات الرواتب',
        title: `مسير رواتب قيد المعاينة (${run.monthKey})`,
        message: `يوجد مسير رواتب لشهر ${run.monthKey} بعدد (${run.lines.length}) موظف لم يتم اعتماده وإقفاله نهائياً بعد.`,
        severity: 'warning',
        localUnit: 'الإدارة العامة',
        sourceLabel: 'مسيرات المرتبات',
        sourceId: run.id,
        timestamp: `${run.monthKey}-01`,
        dateKey: `${run.monthKey}-01`,
      });
    }
  }

  return alerts;
}

/**
 * استخراج تنبيهات وإشعارات قسم صيانة الحبوب والصوامع
 */
export function buildGrainDepartmentAlerts(
  grain: GrainMaintenanceState | undefined,
  referenceDateIso: string = new Date().toISOString().slice(0, 10)
): DepartmentAlertItem[] {
  if (!grain) return [];
  const alerts: DepartmentAlertItem[] = [];

  for (const lic of grain.millLicenses || []) {
    const expState = checkExpiryStatus(lic.expiryDate, referenceDateIso, 30);
    if (expState !== 'ok') {
      const licRec = lic as unknown as Record<string, unknown>;
      const authority = licRec.issuingAuthority || licRec.licenseType || 'مديرية التموين';
      alerts.push({
        id: `grain-mill-lic-${lic.id}`,
        department: 'grain_maintenance',
        type: 'تراخيص المطاحن',
        title: expState === 'expired' ? `ترخيص مطحن منتهٍ (${lic.licenseNumber})` : `ترخيص مطحن يقترب من الانتهاء (${lic.licenseNumber})`,
        message: `ينتهي بتاريخ ${lic.expiryDate} — جهة الإصدار: ${String(authority)}.`,
        severity: expState === 'expired' ? 'critical' : 'warning',
        localUnit: 'المطاحن التموينية',
        sourceLabel: 'تراخيص المطاحن',
        sourceId: lic.id,
        timestamp: lic.expiryDate || referenceDateIso,
        dateKey: resolveDateKey(lic.expiryDate, referenceDateIso),
      });
    }
  }

  for (const part of grain.spareParts || []) {
    const pRec = part as unknown as Record<string, unknown>;
    const curStock = Number(pRec.currentStock ?? pRec.quantity ?? 0) || 0;
    const minLevel = Number(pRec.reorderPoint ?? pRec.minThreshold ?? 0) || 0;
    if (curStock <= minLevel) {
      alerts.push({
        id: `grain-part-${part.id}`,
        department: 'grain_maintenance',
        type: 'قطع الغيار والصيانة',
        title: `وصول قطعة غيار لحد الطلب: ${part.partName}`,
        message: `الرصيد الحالي (${curStock}) أقل من أو يساوي حد إعادة الطلب (${minLevel}).`,
        severity: curStock === 0 ? 'critical' : 'warning',
        localUnit: 'مخزن قطع الغيار',
        sourceLabel: 'مخزن قطع الغيار',
        sourceId: part.id,
        timestamp: part.updatedAt || referenceDateIso,
        dateKey: resolveDateKey(part.updatedAt, referenceDateIso),
      });
    }
  }

  return alerts;
}

export function filterDepartmentAlerts(
  alerts: DepartmentAlertItem[],
  filters: DepartmentAlertFilters
): DepartmentAlertItem[] {
  const readSet = new Set(filters.readIds || []);
  return alerts.filter((a) => {
    if (filters.type && filters.type !== 'الكل' && a.type !== filters.type) return false;
    if (filters.localUnit && filters.localUnit !== 'الكل' && a.localUnit !== filters.localUnit) return false;
    if (filters.dateFrom && a.dateKey < filters.dateFrom) return false;
    if (filters.dateTo && a.dateKey > filters.dateTo) return false;
    if (filters.unreadOnly && readSet.has(a.id)) return false;
    return true;
  });
}

export function countUnreadDepartmentAlerts(
  alerts: DepartmentAlertItem[],
  readIds: string[] = []
): number {
  const readSet = new Set(readIds);
  let unread = 0;
  for (const a of alerts) {
    if (!readSet.has(a.id)) unread += 1;
  }
  return unread;
}
