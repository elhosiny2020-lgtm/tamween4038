import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MANUAL_DEPARTMENTS,
  MANUAL_EQUATION_GROUPS,
  LOCAL_PARTITION_OPTIONS,
  getManualStatsSummary,
  filterManualDepartments,
  filterManualButtons,
  filterManualEquations,
  buildManualPdfFilename,
  buildUserManualPrintableHtml,
} from './userManualData';
import { MINISTRY_LOGO_URL } from '../services/modulesStorage';

test('MANUAL_DEPARTMENTS contains all 9 departments in exact required sidebar order', () => {
  assert.equal(MANUAL_DEPARTMENTS.length, 9);
  const titles = MANUAL_DEPARTMENTS.map((d) => d.title);
  assert.ok(titles[0].includes('إدارة المخابز'));
  assert.ok(titles[1].includes('سجل المديونيات'));
  assert.ok(titles[2].includes('التجارة الداخلية'));
  assert.ok(titles[3].includes('السلع التموينية'));
  assert.ok(titles[4].includes('صيانة الحبوب'));
  assert.ok(titles[5].includes('الموارد البشرية'));
  assert.ok(titles[6].includes('التعديلات والعرض'));
  assert.ok(titles[7].includes('التقارير والأمان'));
  assert.ok(titles[8].includes('الحفظ والنسخ'));
});

test('getManualStatsSummary accurately counts departments, tabs, buttons, and equations', () => {
  const stats = getManualStatsSummary();
  assert.equal(stats.departmentsCount, 9);
  assert.ok(stats.tabsCount >= 65, `Expected at least 65 tabs documented, got ${stats.tabsCount}`);
  assert.ok(stats.buttonsCount >= 18, `Expected at least 18 buttons documented, got ${stats.buttonsCount}`);
  assert.ok(stats.equationsCount >= 20, `Expected at least 20 equations documented, got ${stats.equationsCount}`);
  assert.ok(LOCAL_PARTITION_OPTIONS.length >= 4);
});

test('filterManualDepartments and filterManualButtons match Arabic queries with alef/teh marbuta normalization', () => {
  const deptRes = filterManualDepartments('سجل التغييرات التاريخي');
  assert.ok(deptRes.length >= 1);
  const editsDept = deptRes.find((d) => d.id === 'dept-7-edits-view');
  assert.ok(editsDept);
  assert.ok(editsDept.tabs.some((t) => t.id === 'bakery-change-history'));

  const btnRes = filterManualButtons('بارتيشن');
  assert.ok(btnRes.length >= 1);
  assert.ok(btnRes.some((g) => g.buttons.some((b) => b.id === 'btn-manual-test-partition')));
});

test('filterManualEquations finds equations across all 7 engines including unified subtotals & loaf weight fines', () => {
  assert.equal(MANUAL_EQUATION_GROUPS.length, 7);

  const flourEq = filterManualEquations('الحصة التأمينية');
  assert.ok(flourEq.some((g) => g.equations.some((e) => e.code === 'M-01')));

  const loafFineEq = filterManualEquations('نقص وزن الرغيف');
  assert.ok(loafFineEq.some((g) => g.equations.some((e) => e.code === 'D-03')));

  const unifiedSubtotalEq = filterManualEquations('الوحدة المحلية');
  assert.ok(unifiedSubtotalEq.some((g) => g.equations.some((e) => e.code === 'T-01')));

  const lpgEq = filterManualEquations('البوتاجاز');
  assert.ok(lpgEq.some((g) => g.equations.some((e) => e.code === 'IT-02')));

  const moistureEq = filterManualEquations('الرطوبة');
  assert.ok(moistureEq.some((g) => g.equations.some((e) => e.code === 'GR-03')));

  const payrollEq = filterManualEquations('الرقم القومي');
  assert.ok(payrollEq.some((g) => g.equations.some((e) => e.code === 'HR-01')));
});

test('buildManualPdfFilename sanitizes illegal filesystem characters and appends .pdf extension', () => {
  const f1 = buildManualPdfFilename('دليل: المستخدم / 2026*?', 'full');
  assert.ok(f1.endsWith('.pdf'));
  assert.ok(!/[<>:"/\\|?*]/.test(f1));

  const f2 = buildManualPdfFilename('', 'equations_only');
  assert.ok(f2.includes('المعادلات_الحسابية'));
  assert.ok(f2.endsWith('.pdf'));
});

test('buildUserManualPrintableHtml embeds Ministry logo, RTL dir, escaped inputs, and respects scope', () => {
  const fullHtml = buildUserManualPrintableHtml({
    administrationTitle: 'إدارة تموين <مركز المحلة>',
    scope: 'full',
    targetPartitionLabel: 'D:\\تقارير_التموين',
  });
  assert.ok(fullHtml.includes('dir="rtl"'));
  assert.ok(fullHtml.includes(MINISTRY_LOGO_URL));
  assert.ok(fullHtml.includes('&lt;مركز المحلة&gt;'));
  assert.ok(fullHtml.includes('القسم الأول: فهرس الأقسام التسعة'));
  assert.ok(fullHtml.includes('القسم الثاني: دليل جميع الأزرار'));
  assert.ok(fullHtml.includes('القسم الثالث: المرجع الشامل لجميع المعادلات'));

  const eqOnlyHtml = buildUserManualPrintableHtml({ scope: 'equations_only' });
  assert.ok(!eqOnlyHtml.includes('القسم الأول: فهرس الأقسام التسعة'));
  assert.ok(eqOnlyHtml.includes('القسم الثالث: المرجع الشامل لجميع المعادلات'));
});
