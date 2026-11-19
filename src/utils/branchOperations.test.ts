import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBranchDepartmentMutation,
  cloneDefaultBranchDepartmentsStructure,
  computeBranchSidebarCounts,
  resolveCustomColumnTitle,
  resolveCustomTableTitle,
  UNIVERSAL_TABLES_CATALOG,
  wipeSectionFromModulesBundle,
  wipeVillageFromModulesBundle,
} from './branchOperations';
import { createEmptyBranchModulesBundle } from '../services/modulesStorage';
import { buildDefaultFlagsForRole } from './departmentRbac';
import { filterBakeryChangeHistory, type SearchableBakeryChangeEntry } from './bakeryAlertsAndHistory';

test('cloneDefaultBranchDepartmentsStructure clones independently without shared references', () => {
  const mahalla = cloneDefaultBranchDepartmentsStructure();
  const samannoud = cloneDefaultBranchDepartmentsStructure(mahalla);

  assert.equal(mahalla.length >= 9, true);
  assert.equal(samannoud.length, mahalla.length);

  const mutated = applyBranchDepartmentMutation(samannoud, {
    type: 'RENAME_DEPARTMENT',
    deptId: 'group-1',
    label: 'إدارة المخابز — سمنود',
  });
  const afterToggle = applyBranchDepartmentMutation(mutated, {
    type: 'TOGGLE_DEPARTMENT_VISIBLE',
    deptId: 'group-8',
  });

  assert.equal(afterToggle.find((d) => d.id === 'group-1')?.label, 'إدارة المخابز — سمنود');
  assert.equal(afterToggle.find((d) => d.id === 'group-8')?.visible, false);
  // Original Mahalla template remains completely untouched
  assert.equal(mahalla.find((d) => d.id === 'group-1')?.label, '1. قسم إدارة المخابز');
  assert.equal(mahalla.find((d) => d.id === 'group-8')?.visible, true);
});

test('applyBranchDepartmentMutation supports add, delete, reorder, and sub-item operations', () => {
  const base = cloneDefaultBranchDepartmentsStructure();
  const added = applyBranchDepartmentMutation(base, {
    type: 'ADD_DEPARTMENT',
    label: 'قسم المتابعة الميدانية الجديد',
    shortLabel: 'المتابعة',
  });
  const customDept = added.find((d) => d.label === 'قسم المتابعة الميدانية الجديد');
  assert.ok(customDept);

  const withSub = applyBranchDepartmentMutation(added, {
    type: 'ADD_SUBITEM',
    deptId: customDept!.id,
    label: 'تفتيش الأسواق الليلي',
  });
  assert.equal(withSub.find((d) => d.id === customDept!.id)?.subItems.length, 1);

  const reordered = applyBranchDepartmentMutation(withSub, {
    type: 'REORDER_DEPARTMENT',
    deptId: 'group-3',
    direction: 'up',
  });
  const sorted = [...reordered].sort((a, b) => a.order - b.order);
  assert.equal(sorted[0].id, 'group-3');

  const removed = applyBranchDepartmentMutation(withSub, {
    type: 'DELETE_DEPARTMENT',
    deptId: customDept!.id,
  });
  assert.equal(removed.some((d) => d.id === customDept!.id), false);
});

test('computeBranchSidebarCounts returns dynamic branch-scoped numbers and zeroes for empty branches', () => {
  const emptyBundle = createEmptyBranchModulesBundle('branch-tanta', 'إدارة تموين طنطا', []);
  const emptyCounts = computeBranchSidebarCounts({
    bakeries: [],
    debts: [],
    alertsCount: 0,
    largeDebtsCount: 0,
    unreadInboxCount: 0,
    pendingTasksCount: 0,
    modulesBundle: emptyBundle,
  });

  assert.equal(emptyCounts.bakeriesCount, 0);
  assert.equal(emptyCounts.merchantsCount, 0);
  assert.equal(emptyCounts.shunasCount, 0);
  assert.equal(emptyCounts.employeesCount, 0);

  emptyBundle.ration.merchants.push({
    id: 'm1',
    branchId: 'branch-tanta',
    merchantName: 'بدال تجريبي',
    outletType: 'تاجر تمويني',
    village: 'سبرباي',
    localUnit: 'سبرباي',
    address: '',
    phone: '01000000000',
    nationalId: '29001011600011',
    activityCardNumber: 'C1',
    wholesaleBranchName: 'طنطا',
    linkedCardsCount: 10,
    linkedBeneficiariesCount: 40,
    monthlyQuotaValue: 2000,
    cashInsuranceAmount: 500,
    commissionRate: 1,
    status: 'نشط',
    updatedAt: '',
  });
  const oneMerchantCounts = computeBranchSidebarCounts({
    bakeries: [],
    debts: [],
    alertsCount: 0,
    largeDebtsCount: 0,
    unreadInboxCount: 0,
    pendingTasksCount: 0,
    modulesBundle: emptyBundle,
  });
  assert.equal(oneMerchantCounts.merchantsCount, 1);
});

test('wipeSectionFromModulesBundle and wipeVillageFromModulesBundle clear data only without removing sections', () => {
  const bundle = createEmptyBranchModulesBundle('branch-samannoud', 'سمنود', []);
  bundle.ration.merchants.push(
    {
      id: 'm-beshbish',
      branchId: 'branch-samannoud',
      merchantName: 'تاجر قرية 1',
      outletType: 'تاجر تمويني',
      village: 'ميت حبيب',
      localUnit: 'ميت حبيب',
      address: '',
      phone: '01000000001',
      nationalId: '29001011600012',
      activityCardNumber: 'C2',
      wholesaleBranchName: 'سمنود',
      linkedCardsCount: 20,
      linkedBeneficiariesCount: 60,
      monthlyQuotaValue: 3000,
      cashInsuranceAmount: 1000,
      commissionRate: 1,
      status: 'نشط',
      updatedAt: '',
    },
    {
      id: 'm-other',
      branchId: 'branch-samannoud',
      merchantName: 'تاجر قرية 2',
      outletType: 'تاجر تمويني',
      village: 'بهبيت الحجارة',
      localUnit: 'بهبيت الحجارة',
      address: '',
      phone: '01000000002',
      nationalId: '29001011600013',
      activityCardNumber: 'C3',
      wholesaleBranchName: 'سمنود',
      linkedCardsCount: 15,
      linkedBeneficiariesCount: 45,
      monthlyQuotaValue: 2000,
      cashInsuranceAmount: 800,
      commissionRate: 1,
      status: 'نشط',
      updatedAt: '',
    }
  );

  const afterVillageWipe = wipeVillageFromModulesBundle(bundle, 'ميت حبيب', 'tester');
  assert.equal(afterVillageWipe.ration.merchants.length, 1);
  assert.equal(afterVillageWipe.ration.merchants[0].id, 'm-other');

  const afterSectionWipe = wipeSectionFromModulesBundle(afterVillageWipe, 'commodities', 'tester');
  assert.equal(afterSectionWipe.ration.merchants.length, 0);
  // Settings / decision controls remain intact
  assert.ok(afterSectionWipe.ration.settings);
});

test('Universal tables catalog covers all 7 departments and resolves custom titles', () => {
  const deptKeys = new Set(UNIVERSAL_TABLES_CATALOG.map((t) => t.departmentKey));
  assert.equal(deptKeys.has('bakeries'), true);
  assert.equal(deptKeys.has('debts'), true);
  assert.equal(deptKeys.has('commodities'), true);
  assert.equal(deptKeys.has('internal_trade'), true);
  assert.equal(deptKeys.has('grain_maintenance'), true);
  assert.equal(deptKeys.has('hr'), true);
  assert.equal(deptKeys.has('reports'), true);

  const cfg: any = {
    customTableTitles: { debts_main: 'سجل التحصيل المخصص' },
    customColumnTitles: { debts_main: { netRemainingDebt: 'المتبقي الصافي المعتمد' } },
  };
  assert.equal(resolveCustomTableTitle(cfg, 'debts_main', 'افتراضي'), 'سجل التحصيل المخصص');
  assert.equal(resolveCustomColumnTitle(cfg, 'debts_main', 'netRemainingDebt', 'افتراضي'), 'المتبقي الصافي المعتمد');
});

test('reader role is strictly read-only and history instantQuery filters by owner or action', () => {
  const readerFlags = buildDefaultFlagsForRole('reader');
  assert.deepEqual(readerFlags, {
    view: true,
    insert: false,
    update: false,
    delete: false,
    print: false,
    export: false,
  });

  const sampleEntries: SearchableBakeryChangeEntry[] = [
    {
      id: 'h1',
      bakeryId: 'b1',
      bakeryOwnerName: 'أحمد محمد الشهاوي',
      machineNumber: '1234',
      village: 'بشبيش',
      localUnit: 'بشبيش',
      timestamp: '2026-05-01 10:00 ص',
      isoDate: '2026-05-01',
      username: 'admin',
      userFullName: 'مدير النظام',
      userRole: 'super_admin',
      action: 'تعديل الحصة الفعلية',
      details: 'تعديل الحصة من 10 إلى 12',
    },
    {
      id: 'h2',
      bakeryId: 'b2',
      bakeryOwnerName: 'إبراهيم السيد العشري',
      machineNumber: '5678',
      village: 'دمرو',
      localUnit: 'دمرو',
      timestamp: '2026-05-02 11:00 ص',
      isoDate: '2026-05-02',
      username: 'admin',
      userFullName: 'مدير النظام',
      userRole: 'super_admin',
      action: 'تسجيل مخالفة نقص وزن',
      details: 'نقص 15 جرام',
    },
  ];

  assert.equal(filterBakeryChangeHistory(sampleEntries, { instantQuery: 'الشهاوي' }).length, 1);
  assert.equal(filterBakeryChangeHistory(sampleEntries, { instantQuery: 'نقص وزن' }).length, 1);
  assert.equal(filterBakeryChangeHistory(sampleEntries, { instantQuery: 'غير موجود' }).length, 0);
});
