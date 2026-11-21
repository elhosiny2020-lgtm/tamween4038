import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  cloneDefaultBranchDepartmentsStructure,
  computeBranchSidebarCounts,
  computeDepartmentRecordCounts,
  formatArabicMonthYear,
  wipeSectionFromModulesBundle,
} from '../branchOperations';
import { createEmptyBranchModulesBundle } from '../../services/modulesStorage';
import {
  ALL_PERMISSIONS_LIST,
  getDefaultPermissionsForRole,
  getRoleNameArabic,
  hasPermission,
} from '../../permissions';
import { canAssignSuperAdmin, isSuperAdmin } from '../departmentRbac';
import { aggregateDebtsByLocalUnit } from '../../components/LocalUnitsDebtsPieChart';
import type { AppUser, Bakery, DebtRecord } from '../../types';

test('1. Branch cloning from Mahalla produces full department structure with 0 operational data', () => {
  const depts = cloneDefaultBranchDepartmentsStructure();
  assert.ok(depts.length >= 9, 'Default branch template should include all 9 department groups');

  const emptyBundle = createEmptyBranchModulesBundle('branch-new-tanta', 'إدارة تموين طنطا', []);
  const counts = computeBranchSidebarCounts({
    bakeries: [],
    debts: [],
    alertsCount: 0,
    largeDebtsCount: 0,
    unreadInboxCount: 0,
    pendingTasksCount: 0,
    modulesBundle: emptyBundle,
    periodMonth: 5,
    periodYear: 2026,
  });

  assert.equal(counts.bakeriesCount, 0);
  assert.equal(counts.codesCount, 0);
  assert.equal(counts.phonesCount, 0);
  assert.equal(counts.debtsCount, 0);
  assert.equal(counts.merchantsCount, 0);
  assert.equal(counts.commoditiesCount, 0);
  assert.equal(counts.establishmentsCount, 0);
  assert.equal(counts.shunasCount, 0);
  assert.equal(counts.employeesCount, 0);
  assert.equal(counts.bakeriesGroupTotal, 0);
  assert.equal(counts.debtsGroupTotal, 0);
  assert.equal(counts.internalTradeGroupTotal, 0);
  assert.equal(counts.grainGroupTotal, 0);
  assert.equal(counts.hrGroupTotal, 0);
  assert.equal(counts.commoditiesBadgeLabel, '0 تاجر – مايو 2026');
});

test('2. RBAC prevents auto Super Admin escalation and enforces granular permissions', () => {
  const superAdmin: AppUser = {
    id: 'u-sa',
    username: 'root_super',
    fullName: 'مدير عام النظام',
    role: 'super_admin',
    isSuperAdmin: true,
    isActive: true,
    createdAt: '2026-01-01',
  };

  const regularAdmin: AppUser = {
    id: 'u-admin2',
    username: 'branch_mgr',
    fullName: 'مدير فرع',
    role: 'admin',
    isActive: true,
    createdAt: '2026-01-01',
  };

  const viewerUser: AppUser = {
    id: 'u-view',
    username: 'viewer1',
    fullName: 'مشاهد',
    role: 'viewer',
    isActive: true,
    createdAt: '2026-01-01',
  };

  const readerUser: AppUser = {
    id: 'u-read',
    username: 'reader1',
    fullName: 'قارئ',
    role: 'reader',
    isActive: true,
    createdAt: '2026-01-01',
  };

  assert.equal(isSuperAdmin(superAdmin), true);
  assert.equal(canAssignSuperAdmin(superAdmin), true);

  // Regular admin must NOT automatically become Super Admin
  assert.equal(isSuperAdmin(regularAdmin), false);
  assert.equal(canAssignSuperAdmin(regularAdmin), false);

  // Super Admin has FACTORY_RESET_BRANCH, regular admin does not by default
  assert.equal(hasPermission(superAdmin, 'FACTORY_RESET_BRANCH'), true);
  assert.equal(
    getDefaultPermissionsForRole('admin').includes('FACTORY_RESET_BRANCH'),
    false
  );
  assert.equal(
    getDefaultPermissionsForRole('admin').includes('MANAGE_DEPARTMENTS'),
    true
  );

  // Reader/Viewer cannot delete or factory-reset
  assert.equal(hasPermission(viewerUser, 'DELETE_BAKERY'), false);
  assert.equal(hasPermission(viewerUser, 'PRINT_DATA'), true);
  assert.equal(hasPermission(readerUser, 'ADD_BAKERY'), false);
  assert.equal(hasPermission(readerUser, 'FACTORY_RESET_SECTION'), false);

  // New granular permissions exist in master permissions catalog
  const permIds = new Set(ALL_PERMISSIONS_LIST.map((p) => p.id));
  for (const requiredPerm of [
    'PRINT_DATA',
    'EXPORT_DATA',
    'MANAGE_USERS',
    'MANAGE_DEPARTMENTS',
    'FACTORY_RESET_SECTION',
    'FACTORY_RESET_BRANCH',
  ]) {
    assert.ok(permIds.has(requiredPerm as any), `Missing granular permission ${requiredPerm}`);
  }
  assert.ok(getRoleNameArabic('custom_role').includes('Custom Role'));
});

test('3. Section factory reset wipes only target section while keeping other sections intact', () => {
  const bundle = createEmptyBranchModulesBundle('branch-mahalla', 'إدارة تموين المحلة الكبرى', []);
  bundle.ration.merchants = [
    { id: 'm1', merchantName: 'تاجر 1', status: 'نشط' } as any,
    { id: 'm2', merchantName: 'تاجر 2', status: 'نشط' } as any,
  ];
  if (bundle.internalTrade) {
    bundle.internalTrade.establishments = [
      { id: 'e1', name: 'منشأة 1', isActive: true } as any,
    ];
  }
  bundle.hr.employees = [
    { id: 'h1', fullName: 'موظف 1', employeeType: 'دائم', isActive: true } as any,
  ];

  const afterWipeCommodities = wipeSectionFromModulesBundle(bundle, 'commodities');
  assert.equal(afterWipeCommodities.ration.merchants.length, 0);
  assert.equal(afterWipeCommodities.internalTrade?.establishments.length, 1);
  assert.equal(afterWipeCommodities.hr.employees.length, 1);
});

test('4. Local Units Debt Pie Chart aggregates debts accurately per Local Unit', () => {
  const bakeries: Bakery[] = [
    {
      id: 'b1',
      bakeryOwnerName: 'مخبز النصر',
      machineNumber: '1001',
      village: 'صفط تراب',
      localUnit: 'الوحدة المحلية بصفط تراب',
    } as unknown as Bakery,
    {
      id: 'b2',
      bakeryOwnerName: 'مخبز الأمل',
      machineNumber: '1002',
      village: 'محلة أبو علي',
      localUnit: 'الوحدة المحلية بمحلة أبو علي',
    } as unknown as Bakery,
    {
      id: 'b3',
      bakeryOwnerName: 'مخبز السلام',
      machineNumber: '1003',
      village: 'صفط تراب',
      localUnit: 'الوحدة المحلية بصفط تراب',
    } as unknown as Bakery,
  ];

  const debts: DebtRecord[] = [
    {
      id: 'd1',
      bakeryId: 'b1',
      bakeryOwnerName: 'مخبز النصر',
      village: 'صفط تراب',
      localUnit: 'الوحدة المحلية بصفط تراب',
      netRemainingDebt: 40000,
    } as unknown as DebtRecord,
    {
      id: 'd2',
      bakeryId: 'b2',
      bakeryOwnerName: 'مخبز الأمل',
      village: 'محلة أبو علي',
      localUnit: 'الوحدة المحلية بمحلة أبو علي',
      netRemainingDebt: 20000,
    } as unknown as DebtRecord,
    {
      id: 'd3',
      bakeryId: 'b3',
      bakeryOwnerName: 'مخبز السلام',
      village: 'صفط تراب',
      localUnit: 'الوحدة المحلية بصفط تراب',
      netRemainingDebt: 20000,
    } as unknown as DebtRecord,
  ];

  const { slices, totalDebt, totalDebtorBakeries, totalDebtRecords } =
    aggregateDebtsByLocalUnit(debts, bakeries);
  assert.equal(totalDebt, 80000);
  assert.equal(totalDebtorBakeries, 3);
  assert.equal(totalDebtRecords, 3);
  assert.equal(slices.length, 2);
  assert.equal(slices[0].name, 'الوحدة المحلية بصفط تراب');
  assert.equal(slices[0].value, 60000);
  assert.equal(slices[0].debtsCount, 2);
  assert.equal(slices[0].bakeriesCount, 2);
  assert.equal(slices[0].percentage, 75);

  assert.equal(slices[1].name, 'الوحدة المحلية بمحلة أبو علي');
  assert.equal(slices[1].value, 20000);
  assert.equal(slices[1].percentage, 25);

  const totalPct = slices.reduce((sum, s) => sum + s.percentage, 0);
  assert.equal(Math.round(totalPct), 100);
});

test('5. Live sidebar badges exclude deleted/inactive rows, filter by month/year, and compute deduplicated totals', () => {
  const bundle = createEmptyBranchModulesBundle('branch-mahalla', 'إدارة تموين المحلة الكبرى', []);
  bundle.ration.merchants = [
    { id: 'm1', merchantName: 'تاجر مايو', status: 'نشط' } as any,
    { id: 'm2', merchantName: 'تاجر مايو 2', status: 'نشط' } as any,
    { id: 'm3', merchantName: 'تاجر محذوف', isDeleted: true } as any,
    { id: 'm4', merchantName: 'تاجر غير نشط', isActive: false } as any,
    { id: 'm5', merchantName: 'تاجر نشط 3', status: 'نشط' } as any,
  ];
  bundle.ration.requisitions = [
    { id: 'q1', month: '2026-05', status: 'معتمد' } as any,
    { id: 'q2', month: '2026-04', status: 'معتمد' } as any,
  ];

  const bakeries: any[] = [
    { id: 'b1', machineNumber: '101', phone: '01012345678', activityStatus: 'يعمل' },
    { id: 'b2', machineNumber: '102', phone: '', activityStatus: 'يعمل' },
    { id: 'b3', machineNumber: '103', phone: '01099999999', deletedAt: '2026-05-01' },
  ];

  const debts: any[] = [
    { id: 'd1', bakeryId: 'b1', netRemainingDebt: 15000, violationDate: '2026-05-05', status: 'متأخر' },
    { id: 'd2', bakeryId: 'b2', netRemainingDebt: 25000, violationDate: '2026-04-05', status: 'متأخر' },
    { id: 'd3', bakeryId: 'b1', netRemainingDebt: 5000, violationDate: '2026-05-09', isDeleted: true },
  ];

  const mayCounts = computeBranchSidebarCounts({
    bakeries,
    debts,
    alertsCount: 1,
    largeDebtsCount: 1,
    unreadInboxCount: 2,
    pendingTasksCount: 3,
    modulesBundle: bundle,
    periodMonth: 5,
    periodYear: 2026,
  });

  assert.equal(formatArabicMonthYear(5, 2026), 'مايو 2026');
  assert.equal(mayCounts.bakeriesCount, 2);
  assert.equal(mayCounts.codesCount, 2);
  assert.equal(mayCounts.phonesCount, 1);
  assert.equal(mayCounts.debtsCount, 1);
  assert.equal(mayCounts.quotasCount, 1);
  assert.equal(mayCounts.merchantsCount, 3);
  assert.equal(mayCounts.commoditiesBadgeLabel, '3 تاجر – مايو 2026');
  assert.equal(mayCounts.reportsSecurityGroupTotal, 5);

  const deptCounts = computeDepartmentRecordCounts(mayCounts);
  assert.equal(deptCounts['group-1'], 2);
  assert.equal(deptCounts['group-3'], 1);
  assert.equal(deptCounts['group-6'], 3);
});

test('6. Database backup and hardened RLS/Realtime/Audit migration exist and include all required safeguards', () => {
  const root = process.cwd();
  const backupPath = path.join(root, 'supabase/backups/schema_backup_20261120.sql');
  const migrationPath = path.join(
    root,
    'supabase/migrations/20261120_branches_rbac_badges_audit.sql'
  );

  assert.ok(fs.existsSync(backupPath), 'Database backup file must exist before migration');
  assert.ok(fs.statSync(backupPath).size > 1000, 'Database backup must be non-empty');

  assert.ok(fs.existsSync(migrationPath), 'Hardened Supabase migration must exist');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  const requiredConstructs = [
    'public.branch_departments',
    'public.roles',
    'public.role_permissions',
    'FORCE ROW LEVEL SECURITY',
    'prevent_audit_log_mutation',
    'rpc_create_branch_from_template',
    'rpc_reset_department_data',
    'rpc_reset_branch_data',
    'rpc_get_branch_sidebar_counts',
    'supabase_realtime',
  ];
  for (const token of requiredConstructs) {
    assert.ok(sql.includes(token), `Migration SQL must include ${token}`);
  }
});
