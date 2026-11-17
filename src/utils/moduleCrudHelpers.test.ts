import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveModuleCrudPermissions,
  checkRationDeleteIntegrity,
  checkGrainDeleteIntegrity,
  checkHrDeleteIntegrity,
  createModuleAuditEntry,
  formatArabicDateTime,
} from './moduleCrudHelpers.ts';
import type {
  RationModuleState,
  GrainMaintenanceState,
  HrModuleState,
} from '../types/modules.ts';
import type { AppUser } from '../types.ts';

describe('moduleCrudHelpers — RBAC & Relational Integrity & Audit', () => {
  it('resolveModuleCrudPermissions grants full CRUD to admin and blocks viewer or vault-locked sessions', () => {
    const adminUser: AppUser = {
      id: 'u1',
      username: 'admin',
      password: 'x',
      fullName: 'مدير النظام',
      role: 'admin',
      isActive: true,
      createdAt: '2026-01-01',
    };
    const viewerUser: AppUser = {
      ...adminUser,
      id: 'u2',
      role: 'viewer',
    };

    const adminPerms = resolveModuleCrudPermissions(adminUser, false);
    assert.equal(adminPerms.canAdd, true);
    assert.equal(adminPerms.canEdit, true);
    assert.equal(adminPerms.canDelete, true);
    assert.equal(adminPerms.isReadOnly, false);

    const lockedPerms = resolveModuleCrudPermissions(adminUser, true);
    assert.equal(lockedPerms.canAdd, false);
    assert.equal(lockedPerms.canEdit, false);
    assert.equal(lockedPerms.canDelete, false);
    assert.equal(lockedPerms.isReadOnly, true);

    const viewerPerms = resolveModuleCrudPermissions(viewerUser, false);
    assert.equal(viewerPerms.canAdd, false);
    assert.equal(viewerPerms.canEdit, false);
    assert.equal(viewerPerms.canDelete, false);
    assert.equal(viewerPerms.isReadOnly, true);

    const supervisorUser: AppUser = {
      ...adminUser,
      id: 'u3',
      role: 'supervisor',
      isSuperAdmin: false,
      departmentPermissions: {
        commodities: { view: true, insert: true, update: true, delete: true, print: true, export: true },
      },
    };
    const supervisorPerms = resolveModuleCrudPermissions(supervisorUser, false, 'commodities');
    assert.equal(supervisorPerms.canAdd, true);
    assert.equal(supervisorPerms.canEdit, true);
    assert.equal(supervisorPerms.canDelete, false);
  });

  it('checkRationDeleteIntegrity prevents deleting linked merchants, commodities, and cards, and allows unlinked ones', () => {
    const rationState: RationModuleState = {
      settings: {} as any,
      settingsHistory: [],
      priceHistory: [],
      merchants: [
        { id: 'm-linked', merchantName: 'منفذ مرتبط' } as any,
        { id: 'm-free', merchantName: 'منفذ حر' } as any,
      ],
      commodities: [
        { id: 'c-linked', name: 'سكر' } as any,
        { id: 'c-free', name: 'شاي' } as any,
      ],
      cards: [
        { id: 'card-linked', merchantId: 'm-linked', cardNumber: '111' } as any,
        { id: 'card-free', merchantId: 'm-linked', cardNumber: '222' } as any,
      ],
      warehouses: [{ id: 'w1', commodityId: 'c-linked' } as any],
      movements: [],
      requisitions: [],
      disbursements: [
        {
          id: 'd1',
          merchantId: 'm-linked',
          cardId: 'card-linked',
          commodityId: 'c-linked',
          isReversed: false,
        } as any,
      ],
      financialEntries: [],
      inspections: [],
      complaints: [],
      auditLogs: [],
      gasCylinders: [],
      petroleumProducts: [],
      rationOfficeAccounts: [],
    };

    const mBlocked = checkRationDeleteIntegrity(rationState, 'merchant', 'm-linked');
    assert.equal(mBlocked.canDelete, false);
    assert.ok(mBlocked.reason?.includes('لا يمكن حذف هذا المنفذ'));

    const mAllowed = checkRationDeleteIntegrity(rationState, 'merchant', 'm-free');
    assert.equal(mAllowed.canDelete, true);

    const cBlocked = checkRationDeleteIntegrity(rationState, 'commodity', 'c-linked');
    assert.equal(cBlocked.canDelete, false);

    const cAllowed = checkRationDeleteIntegrity(rationState, 'commodity', 'c-free');
    assert.equal(cAllowed.canDelete, true);

    const cardBlocked = checkRationDeleteIntegrity(rationState, 'card', 'card-linked');
    assert.equal(cardBlocked.canDelete, false);

    const cardAllowed = checkRationDeleteIntegrity(rationState, 'card', 'card-free');
    assert.equal(cardAllowed.canDelete, true);
  });

  it('checkGrainDeleteIntegrity prevents deleting assets or spare parts referenced in maintenance orders', () => {
    const grainState: GrainMaintenanceState = {
      settings: {} as any,
      assets: [
        { id: 'asset-linked', name: 'صومعة 1' } as any,
        { id: 'asset-free', name: 'صومعة 2' } as any,
      ],
      spareParts: [
        { id: 'sp-linked', partName: 'رولمان بلي' } as any,
        { id: 'sp-free', partName: 'سير مطاطي' } as any,
      ],
      technicians: [],
      orders: [
        {
          id: 'o1',
          assetId: 'asset-linked',
          partsUsed: [{ partId: 'sp-linked', partName: 'رولمان بلي', quantity: 2, unitCost: 100 }],
        } as any,
      ],
      grainMovements: [],
      auditLogs: [],
    };

    assert.equal(checkGrainDeleteIntegrity(grainState, 'asset', 'asset-linked').canDelete, false);
    assert.equal(checkGrainDeleteIntegrity(grainState, 'asset', 'asset-free').canDelete, true);
    assert.equal(checkGrainDeleteIntegrity(grainState, 'part', 'sp-linked').canDelete, false);
    assert.equal(checkGrainDeleteIntegrity(grainState, 'part', 'sp-free').canDelete, true);
  });

  it('checkHrDeleteIntegrity blocks employees with active loans, populated departments, and locked payroll runs', () => {
    const hrState: HrModuleState = {
      policySettings: {} as any,
      policyVersionsHistory: [],
      departments: [
        { id: 'dept-populated', name: 'قسم الرقابة' } as any,
        { id: 'dept-empty', name: 'قسم الأرشيف' } as any,
      ],
      employees: [
        { id: 'emp-loan', fullName: 'موظف مقترض', departmentName: 'قسم الرقابة' } as any,
        { id: 'emp-clean', fullName: 'موظف بدون سلفة', departmentName: 'قسم الرقابة' } as any,
      ],
      attendance: [],
      leaveBalances: [],
      leaveRequests: [],
      payrollRuns: [
        { id: 'run-locked', monthKey: '2026-10', status: 'معتمد', lines: [{} as any] } as any,
        { id: 'run-draft', monthKey: '2026-11', status: 'معاينة', lines: [{} as any] } as any,
      ],
      loans: [
        {
          id: 'ln-1',
          employeeId: 'emp-loan',
          status: 'سارية',
          remainingAmount: 3000,
        } as any,
      ],
      promotions: [],
      auditLogs: [],
    };

    assert.equal(checkHrDeleteIntegrity(hrState, 'employee', 'emp-loan').canDelete, false);
    assert.equal(checkHrDeleteIntegrity(hrState, 'employee', 'emp-clean').canDelete, true);
    assert.equal(checkHrDeleteIntegrity(hrState, 'department', 'dept-populated').canDelete, false);
    assert.equal(checkHrDeleteIntegrity(hrState, 'department', 'dept-empty').canDelete, true);
    assert.equal(checkHrDeleteIntegrity(hrState, 'payroll_run', 'run-locked').canDelete, false);
    assert.equal(checkHrDeleteIntegrity(hrState, 'payroll_run', 'run-draft').canDelete, true);
  });

  it('createModuleAuditEntry and formatArabicDateTime produce valid structured output', () => {
    const entry = createModuleAuditEntry({
      branchId: 'b1',
      module: 'commodities',
      actionType: 'تعديل',
      entityName: 'سجل التجار',
      entityId: 'm-1',
      currentUser: null,
      afterSummary: 'تم تعديل الحصة',
    });
    assert.equal(entry.module, 'commodities');
    assert.equal(entry.actionType, 'تعديل');
    assert.ok(entry.timestamp.length > 10);
    assert.notEqual(formatArabicDateTime(entry.timestamp), '—');
  });
});
