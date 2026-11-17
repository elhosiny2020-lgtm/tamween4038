import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { calculateLoafWeightShortageFine } from '../auditHelper.ts';
import {
  computeEquipmentKpis,
  computeMaintenanceOrderCost,
  computeSparePartStatus,
} from '../grainMaintenanceMath.ts';
import {
  computeEmployeePayrollLine,
  parseEgyptianNationalId,
} from '../hrPayrollMath.ts';
import {
  computeExecutiveSummary,
  isBakeryStoppedStatus,
} from '../dashboardAnalytics.ts';
import {
  createSessionToken,
  hashPasswordScrypt,
  isScryptHash,
  sanitizeUserForClient,
  sanitizeUsersForClient,
  verifyPasswordScrypt,
  verifySessionToken,
} from '../serverAuth.ts';
import {
  canUserAccessDepartment,
  canUserAccessTab,
  canUserExportDepartment,
  canUserPrintDepartment,
  hasDepartmentPermission,
  isSuperAdmin,
  resolveUserDepartmentMatrix,
} from '../departmentRbac.ts';
import { resolveModuleCrudPermissions } from '../moduleCrudHelpers.ts';
import {
  fallbackAuthenticateUser,
  fallbackDeleteAuditLogs,
  fallbackGetBootstrap,
  fallbackListAuditDeletionSecurityLogs,
  fallbackListStorageFiles,
  fallbackPurgeAll,
  fallbackQueryTablePaginated,
  fallbackResetNonMahallaBranches,
  fallbackUpsertRow,
} from '../../db/fallbackStore.ts';
import type { AppUser } from '../../types.ts';
import { SYSTEM_DEPARTMENT_KEYS } from '../../types.ts';
import type { GrainAsset, HrEmployee, HrPolicySettingsVersion, SparePartItem } from '../../types/modules.ts';

const FALLBACK_STORE_PATH = '/tmp/tamween_pg_fallback_store.json';

test('auditHelper calculateLoafWeightShortageFine matches formula with piaster rounding and negative/zero guards', () => {
  // (9 / 90) * 600 * 20 = 1200.00
  assert.equal(calculateLoafWeightShortageFine(9, 600, 20, 90), 1200);
  // (7 / 90) * 235 * 11 = 201.0555... -> 201.06 (piaster rounding)
  assert.equal(calculateLoafWeightShortageFine(7, 235, 11, 90), 201.06);
  // Zero / negative shortage or inputs return 0 cleanly
  assert.equal(calculateLoafWeightShortageFine(0, 600, 20, 90), 0);
  assert.equal(calculateLoafWeightShortageFine(-5, 600, 20, 90), 0);
  assert.equal(calculateLoafWeightShortageFine(9, -600, 20, 90), 0);
  assert.equal(calculateLoafWeightShortageFine(9, 600, -20, 90), 0);
  // Zero prescribedWeight falls back to 90 (no division by zero / Infinity / NaN)
  assert.equal(calculateLoafWeightShortageFine(9, 600, 20, 0), 1200);
  assert.equal(Number.isFinite(calculateLoafWeightShortageFine(NaN, NaN, NaN, 0)), true);
});

test('grainMaintenanceMath clamps negative values and prevents NaN/Infinity on zero denominators', () => {
  const cost = computeMaintenanceOrderCost({
    technicianCount: -3,
    laborHours: 5,
    hourlyRate: 100,
    partsUsed: [
      { quantity: -2, unitCost: 50 },
      { quantity: 3, unitCost: 25.556 },
    ],
    consumablesCost: -10,
    transportAndOpCost: 40,
    indirectOverheadPercent: 10,
    taxPercent: 14,
  });
  assert.equal(cost.laborCost, 0);
  assert.equal(cost.partsCost, 76.67);
  assert.equal(cost.directCost, 116.67);
  assert.equal(Number.isFinite(cost.totalRepairCost), true);

  const zeroAsset = {
    id: 'asset-zero',
    plannedHoursPerPeriod: 0,
    downtimeHours: 10,
    designProductionTons: 0,
    actualProductionTons: 0,
    conformingTons: 0,
  } as GrainAsset;
  const kpis = computeEquipmentKpis(zeroAsset, []);
  assert.equal(kpis.availabilityPct, null);
  assert.equal(kpis.performancePct, null);
  assert.equal(kpis.qualityPct, null);
  assert.equal(kpis.oeePct, null);
  assert.equal(kpis.mtbfHours, null);
  assert.equal(kpis.mttrHours, null);

  const part = {
    openingStock: 5,
    inboundQty: 2,
    outboundQty: 20,
    damagedQty: 1,
    unitCost: -10,
    avgDailyConsumption: -4,
    supplyLeadDays: 3,
    safetyStock: -1,
    targetStockLevel: 10,
  } as SparePartItem;
  const partStatus = computeSparePartStatus(part);
  assert.equal(partStatus.availableBalance, 0);
  assert.equal(partStatus.stockValue, 0);
  assert.equal(partStatus.reorderPoint, 0);
  assert.equal(partStatus.neededQty, 10);
});

test('hrPayrollMath validates Egyptian National ID and clamps payroll line against negative/zero inputs', () => {
  const validMale = parseEgyptianNationalId('29005141601234');
  assert.equal(validMale.valid, true);
  assert.equal(validMale.birthDate, '1990-05-14');
  assert.equal(validMale.gender, 'ذكر');

  const invalidId = parseEgyptianNationalId('19005141601234');
  assert.equal(invalidId.valid, false);

  const emp = {
    id: 'emp-1',
    employeeCode: 'E001',
    fullName: 'موظف اختبار',
    functionalWage: -1000,
    complementaryWage: 500,
    periodicAllowances: 100,
    specialAllowances: 0,
    allowancesTotal: 0,
    monthlyIncentives: 0,
    rewards: 0,
    extraEntitlements: 0,
    insurableWage: 500,
    taxExemptions: 0,
    otherDeductions: 0,
    healthInsuranceFee: 0,
  } as unknown as HrEmployee;

  const policy: HrPolicySettingsVersion = {
    id: 'pol-1',
    effectiveFrom: '2026-01',
    lawDecisionReference: 'لائحة اختبارية',
    dayCalculationBasis: 30,
    dailyWorkingHours: 8,
    employeeInsuranceRatePct: 11,
    employerInsuranceRatePct: 18.75,
    minInsurableWage: 2000,
    maxInsurableWage: 12000,
    annualTaxExemptionAmount: 20000,
    maxLoanDeductionCeilingPct: 25,
    taxBrackets: [],
    updatedBy: 'admin',
    updatedAt: '2026-01-01',
  };

  const line = computeEmployeePayrollLine({
    employee: emp,
    policy,
    activeLoans: [],
    unexcusedAbsenceDays: -2,
  });
  assert.equal(line.grossEarnings, 600);
  assert.equal(Number.isFinite(line.netSalary), true);
  assert.equal(line.netSalary >= 0, true);
});

test('dashboardAnalytics handles Arabic stopped statuses and zero quotas/totals safely', () => {
  assert.equal(isBakeryStoppedStatus('متوقف جزئي'), true);
  assert.equal(isBakeryStoppedStatus('موقوف بقرار'), true);
  assert.equal(isBakeryStoppedStatus('مغلق إدارياً'), true);
  assert.equal(isBakeryStoppedStatus('ملغى'), true);
  assert.equal(isBakeryStoppedStatus('يعمل'), false);

  const emptySummary = computeExecutiveSummary([], [], 50000);
  assert.equal(emptySummary.bakeriesCount, 0);
  assert.equal(emptySummary.collectionRatePercent, 0);
  assert.equal(emptySummary.operationalRatePercent, 0);
  assert.equal(emptySummary.quotaUtilizationPercent, 0);
  assert.equal(emptySummary.totalRemainingDebt, 0);
});

test('serverAuth scrypt hashing, Arabic-Indic digit normalization, HMAC session tokens, and user sanitization', () => {
  const hash = hashPasswordScrypt('Pass١٢٣!');
  assert.equal(isScryptHash(hash), true);
  assert.equal(verifyPasswordScrypt('Pass123!', hash), true);
  assert.equal(verifyPasswordScrypt('Pass١٢٣!', hash), true);
  assert.equal(verifyPasswordScrypt('WrongPass', hash), false);

  const token = createSessionToken({
    userId: 'u-1',
    branchId: 'branch-mahalla',
    username: 'admin',
    role: 'admin',
    isSuperAdmin: true,
    ttlMs: 60_000,
  });
  const verified = verifySessionToken(`Bearer ${token}`);
  assert.ok(verified);
  assert.equal(verified?.userId, 'u-1');
  assert.equal(verified?.isSuperAdmin, true);

  // Tamper signature -> must reject
  const [body, sig] = token.split('.');
  const tamperedSig = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A');
  assert.equal(verifySessionToken(`${body}.${tamperedSig}`), null);

  // Expired token -> must reject
  const expiredToken = createSessionToken({
    userId: 'u-2',
    branchId: 'branch-mahalla',
    username: 'expired',
    role: 'viewer',
    isSuperAdmin: false,
    ttlMs: -1000,
  });
  assert.equal(verifySessionToken(expiredToken), null);

  const rawUser: AppUser & Record<string, any> = {
    id: 'u-secret',
    username: 'inspector1',
    fullName: 'مفتش',
    role: 'inspector',
    password: 'scrypt$salt$hashvalue',
    passwordHash: 'legacyhash',
    gmailPassword: 'gmail-app-password',
  };
  const sanitized = sanitizeUserForClient(rawUser) as Record<string, any>;
  assert.equal('password' in sanitized, false);
  assert.equal('passwordHash' in sanitized, false);
  assert.equal('gmailPassword' in sanitized, false);
  assert.equal(sanitized.hasPassword, true);

  const list = sanitizeUsersForClient([rawUser]) as Array<Record<string, any>>;
  assert.equal(list.length, 1);
  assert.equal('password' in list[0], false);
});

test('departmentRbac enforces fail-closed 7x6 matrix, view dependency, reports tab, and Super Admin bypass', () => {
  const emptyRestrictedUser: AppUser = {
    id: 'u-empty',
    username: 'empty_user',
    fullName: 'مستخدم بلا صلاحيات',
    role: 'inspector',
    allowedDepartments: [],
  };
  const emptyMatrix = resolveUserDepartmentMatrix(emptyRestrictedUser);
  for (const dept of SYSTEM_DEPARTMENT_KEYS) {
    assert.deepEqual(emptyMatrix[dept], {
      view: false,
      insert: false,
      update: false,
      delete: false,
      print: false,
      export: false,
    });
  }
  assert.equal(canUserAccessTab(emptyRestrictedUser, 'bakeries'), false);
  assert.equal(canUserAccessTab(emptyRestrictedUser, 'reports'), false);

  // If view=false for a department, even if insert/print flags were forced true, all must evaluate false
  const viewFalseUser: AppUser = {
    id: 'u-view-false',
    username: 'view_false',
    fullName: 'تجريبي',
    role: 'inspector',
    departmentPermissions: {
      commodities: {
        view: false,
        insert: true,
        update: true,
        delete: true,
        print: true,
        export: true,
      },
      reports: {
        view: true,
        insert: false,
        update: false,
        delete: false,
        print: true,
        export: false,
      },
    },
  };
  assert.equal(hasDepartmentPermission(viewFalseUser, 'commodities', 'view'), false);
  assert.equal(hasDepartmentPermission(viewFalseUser, 'commodities', 'insert'), false);
  assert.equal(canUserPrintDepartment(viewFalseUser, 'commodities'), false);
  assert.equal(canUserExportDepartment(viewFalseUser, 'commodities'), false);
  assert.equal(canUserAccessDepartment(viewFalseUser, 'reports'), true);
  assert.equal(canUserAccessTab(viewFalseUser, 'reports'), true);
  assert.equal(canUserPrintDepartment(viewFalseUser, 'reports'), true);
  assert.equal(canUserExportDepartment(viewFalseUser, 'reports'), false);

  // Granular commodities view+print only user
  const commPrintOnly: AppUser = {
    id: 'u-comm-print',
    username: 'comm_print',
    fullName: 'مراقب سلع طباعة فقط',
    role: 'viewer',
    departmentPermissions: {
      commodities: {
        view: true,
        insert: false,
        update: false,
        delete: false,
        print: true,
        export: false,
      },
    },
  };
  const crud = resolveModuleCrudPermissions(commPrintOnly, false, 'commodities');
  assert.equal(crud.canView, true);
  assert.equal(crud.canAdd, false);
  assert.equal(crud.canEdit, false);
  assert.equal(crud.canDelete, false);
  assert.equal(crud.canPrint, true);
  assert.equal(crud.canExport, false);
  assert.equal(crud.isReadOnly, true);

  const superAdminUser: AppUser = {
    id: 'u-sa',
    username: 'admin',
    fullName: 'مدير النظام',
    role: 'admin',
    isSuperAdmin: true,
  };
  assert.equal(isSuperAdmin(superAdminUser), true);
  for (const dept of SYSTEM_DEPARTMENT_KEYS) {
    assert.equal(hasDepartmentPermission(superAdminUser, dept, 'delete'), true);
    assert.equal(hasDepartmentPermission(superAdminUser, dept, 'export'), true);
  }
});

test('fallbackStore hashes passwords, sanitizes auth, preserves Mahalla on selective reset, and logs immutable audit entries', () => {
  const hadExistingFile = fs.existsSync(FALLBACK_STORE_PATH);
  const previousContent = hadExistingFile ? fs.readFileSync(FALLBACK_STORE_PATH, 'utf-8') : null;

  try {
    fallbackPurgeAll();

    // 1. Seeded authentication must succeed and strip plaintext password
    const authRes = fallbackAuthenticateUser('branch-mahalla', 'admin', 'admin');
    assert.equal(authRes.ok, true);
    assert.ok(authRes.user);
    assert.equal('password' in (authRes.user as Record<string, any>), false);

    // 2. Creating/upserting user hashes password with scrypt$ and strips password from returned row
    const createdUserRes = fallbackUpsertRow('app_users', 'branch-mahalla', {
      id: 'u-test-comm',
      username: 'comm_auditor',
      fullName: 'مراجع سلع',
      password: 'StrongPass99!',
      role: 'auditor',
      departmentPermissions: {
        commodities: {
          view: true,
          insert: false,
          update: false,
          delete: false,
          print: true,
          export: false,
        },
      },
    });
    assert.equal(createdUserRes.success, true);
    assert.equal('password' in (createdUserRes.row || {}), false);

    const authRestricted = fallbackAuthenticateUser('branch-mahalla', 'comm_auditor', 'StrongPass99!');
    assert.equal(authRestricted.ok, true);
    assert.equal(authRestricted.user?.username, 'comm_auditor');
    assert.equal(hasDepartmentPermission(authRestricted.user, 'commodities', 'print'), true);
    assert.equal(hasDepartmentPermission(authRestricted.user, 'commodities', 'insert'), false);

    // 3. Populate Mahalla data and Samanoud data, then run selective reset
    fallbackUpsertRow('bakeries', 'branch-mahalla', {
      id: 'b-mah-1',
      bakeryOwnerName: 'مخبز المحلة المحمي',
      machineNumber: '11122233',
      village: 'بشبيش',
      localUnit: 'بشبيش الرئيسية',
    });
    fallbackUpsertRow('bakeries', 'branch-samanoud', {
      id: 'b-sam-1',
      bakeryOwnerName: 'مخبز سمنود المؤقت',
      machineNumber: '99988877',
      village: 'سمنود',
      localUnit: 'سمنود الرئيسية',
    });

    const resetResult = fallbackResetNonMahallaBranches('admin');
    assert.equal(resetResult.success, true);
    assert.equal(resetResult.preservedMahallaCounts.bakeries, 1);

    const mahallaAfter = fallbackGetBootstrap('branch-mahalla');
    assert.equal(mahallaAfter.bakeries.length, 1);
    assert.equal(mahallaAfter.bakeries[0].id, 'b-mah-1');
    assert.equal(
      mahallaAfter.branches.some((b) => b.id === 'branch-mahalla'),
      true
    );
    assert.equal(
      mahallaAfter.branches.some((b) => b.id === 'branch-samanoud'),
      false
    );

    const samAfter = fallbackGetBootstrap('branch-samanoud');
    assert.equal(samAfter.bakeries.length, 0);

    // Backup file must exist in Mahalla storage files
    const storageFiles = fallbackListStorageFiles('branch-mahalla');
    assert.equal(
      storageFiles.some((f) => f.fileName === resetResult.backupFileName),
      true
    );

    // 4. Audit log append & query
    const auditRes = fallbackUpsertRow('audit_logs', 'branch-mahalla', {
      id: 'aud-test-1',
      username: 'comm_auditor',
      userEmail: 'comm_auditor',
      department: 'debts',
      operation: 'INSERT',
      recordId: 'd-test',
      result: 'DENIED',
      action: 'DENIED_WRITE',
      details: 'محاولة كتابة غير مصرح بها',
      ipAddress: '127.0.0.1',
      createdAt: new Date().toISOString(),
    });
    assert.equal(auditRes.success, true);

    const auditPage = fallbackQueryTablePaginated('audit_logs', {
      branchId: 'branch-mahalla',
      status: 'DENIED',
    });
    assert.equal(auditPage.rows.some((r: any) => r.id === 'aud-test-1'), true);

    const allBranchesAuditPage = fallbackQueryTablePaginated('audit_logs', {
      branchId: 'ALL',
      status: 'all',
    });
    assert.equal(allBranchesAuditPage.rows.some((r: any) => r.id === 'aud-test-1'), true);

    fallbackUpsertRow('audit_logs', 'branch-mahalla', {
      id: 'aud-test-allowed',
      username: 'admin',
      userEmail: 'admin',
      department: 'auth',
      operation: 'LOGIN',
      recordId: 'u-1',
      result: 'ALLOWED',
      action: 'LOGIN_SUCCESS',
      details: 'دخول مسموح',
      ipAddress: '127.0.0.1',
    });
    const successAuditPage = fallbackQueryTablePaginated('audit_logs', {
      branchId: 'ALL',
      status: 'SUCCESS',
    });
    assert.equal(successAuditPage.rows.some((r: any) => r.id === 'aud-test-allowed'), true);

    // 5. Admin-only audit deletion preserves operational records and records immutable security log
    const delAuditRes = fallbackDeleteAuditLogs({
      branchId: 'branch-mahalla',
      ids: ['aud-test-1'],
      deletedBy: 'admin',
      deletedByFullName: 'مدير النظام',
      targetScope: 'سجل التدقيق العام',
      reason: 'تنظيف تجريبي لسجلات قديمة',
      ipAddress: '127.0.0.1',
    });
    assert.equal(delAuditRes.deletedCount, 1);
    assert.equal(delAuditRes.securityEntry.deletedBy, 'admin');
    assert.equal(delAuditRes.securityEntry.deletedCount, 1);

    const remainingAudits = fallbackQueryTablePaginated('audit_logs', {
      branchId: 'branch-mahalla',
      status: 'all',
    });
    assert.equal(remainingAudits.rows.some((r: any) => r.id === 'aud-test-1'), false);
    assert.equal(remainingAudits.rows.some((r: any) => r.id === 'aud-test-allowed'), true);

    // Operational bakeries must remain completely untouched
    const bakeriesAfterAuditDelete = fallbackGetBootstrap('branch-mahalla').bakeries;
    assert.equal(bakeriesAfterAuditDelete.length, 1);
    assert.equal(bakeriesAfterAuditDelete[0].id, 'b-mah-1');

    const securityTrail = fallbackListAuditDeletionSecurityLogs('branch-mahalla');
    assert.equal(securityTrail.length >= 1, true);
    assert.equal(securityTrail[0].reason, 'تنظيف تجريبي لسجلات قديمة');
  } finally {
    fallbackPurgeAll();
    if (hadExistingFile && previousContent !== null) {
      fs.writeFileSync(FALLBACK_STORE_PATH, previousContent, { encoding: 'utf-8', mode: 0o600 });
    } else if (fs.existsSync(FALLBACK_STORE_PATH)) {
      fs.unlinkSync(FALLBACK_STORE_PATH);
    }
  }
});
