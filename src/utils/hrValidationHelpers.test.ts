import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyContractCountdown,
  partitionAndGroupSpecialEmployees,
  validateEgyptianPhone,
  validateHrEmployeeInput,
} from './hrValidationHelpers.ts';
import type { HrEmployee } from '../types/modules.ts';

describe('hrValidationHelpers — NID, Phone, Public Service & Assistance', () => {
  it('validates Egyptian mobile and landline phone numbers including Arabic digits', () => {
    const mobileOk = validateEgyptianPhone('٠١٠١١٢٢٣٣٤٤');
    assert.equal(mobileOk.valid, true);
    assert.equal(mobileOk.normalized, '01011223344');

    const intlOk = validateEgyptianPhone('+201223344556');
    assert.equal(intlOk.valid, true);
    assert.equal(intlOk.normalized, '01223344556');

    const bad = validateEgyptianPhone('12345');
    assert.equal(bad.valid, false);
  });

  it('rejects duplicate 14-digit national IDs on create and allows editing own record', () => {
    const existing: HrEmployee[] = [
      {
        id: 'emp-1',
        branchId: 'b1',
        employeeCode: 'EMP-1',
        nationalId: '28305141601119',
        fullName: 'محمود الدسوقي',
        phone: '01011223344',
      } as HrEmployee,
    ];

    const dup = validateHrEmployeeInput({
      fullName: 'موظف آخر',
      nationalId: '28305141601119',
      phone: '01122334455',
      existingEmployees: existing,
    });
    assert.equal(dup.valid, false);

    const selfEdit = validateHrEmployeeInput({
      fullName: 'محمود الدسوقي',
      nationalId: '28305141601119',
      phone: '01011223344',
      existingEmployees: existing,
      editingEmployeeId: 'emp-1',
    });
    assert.equal(selfEdit.valid, true);
    assert.equal(selfEdit.birthDate, '1983-05-14');
    assert.equal(selfEdit.gender, 'ذكر');
  });

  it('partitions Public Service and Assistance employees separately and aggregates by workSite', () => {
    const emps: HrEmployee[] = [
      {
        id: 'ps-1',
        fullName: 'خدمة عامة 1',
        employeeType: 'خدمة عامة',
        workSite: 'مكتب تموين بشبيش',
        contractEndDate: '2026-11-25',
        functionalWage: 3000,
        complementaryWage: 500,
        monthlyIncentives: 200,
        allowancesTotal: 0,
        status: 'اقترب موعد انتهاء التعاقد',
      } as HrEmployee,
      {
        id: 'ast-1',
        fullName: 'استعانة 1',
        employeeType: 'استعانة',
        workSite: 'إدارة التفتيش',
        contractEndDate: '2026-11-01',
        functionalWage: 4500,
        complementaryWage: 1000,
        monthlyIncentives: 500,
        allowancesTotal: 0,
        status: 'منتهي التعاقد',
      } as HrEmployee,
      {
        id: 'perm-1',
        fullName: 'تعيين دائم',
        employeeType: 'تعيين دائم',
        workSite: 'الديوان',
        functionalWage: 6000,
        status: 'على رأس العمل',
      } as HrEmployee,
    ];

    const grouped = partitionAndGroupSpecialEmployees(emps, '2026-11-17');
    assert.equal(grouped.publicService.length, 1);
    assert.equal(grouped.assistance.length, 1);
    assert.equal(grouped.publicServiceByWorkSite[0].workSite, 'مكتب تموين بشبيش');
    assert.equal(grouped.publicServiceByWorkSite[0].expiringCount, 1);
    assert.equal(grouped.publicServiceByWorkSite[0].totalMonthlyGross, 3700);
    assert.equal(grouped.assistanceByWorkSite[0].expiredCount, 1);
    assert.equal(grouped.assistanceByWorkSite[0].totalMonthlyGross, 6000);

    const countdown = classifyContractCountdown('2026-11-25', '2026-11-17');
    assert.equal(countdown.daysRemaining, 8);
    assert.equal(countdown.isExpiringSoon, true);
  });
});
