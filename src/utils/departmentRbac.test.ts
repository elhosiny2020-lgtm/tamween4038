import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canUserAccessDepartment,
  canUserAccessTab,
  getDefaultTabForUser,
} from './departmentRbac.ts';
import type { AppUser } from '../types.ts';

test('Department-scoped managers can ONLY access their assigned department and default to it', () => {
  const hrManager: AppUser = {
    id: 'u-hr',
    username: 'hr_lead',
    fullName: 'مسئول الموارد البشرية',
    role: 'supervisor',
    allowedDepartments: ['hr'],
    applyToAllBranches: true,
  };

  assert.equal(canUserAccessDepartment(hrManager, 'hr'), true);
  assert.equal(canUserAccessDepartment(hrManager, 'bakeries'), false);
  assert.equal(canUserAccessDepartment(hrManager, 'debts'), false);
  assert.equal(canUserAccessDepartment(hrManager, 'commodities'), false);
  assert.equal(canUserAccessTab(hrManager, 'hr-personnel'), true);
  assert.equal(canUserAccessTab(hrManager, 'bakeries'), false);
  assert.equal(canUserAccessTab(hrManager, 'debts'), false);
  assert.equal(getDefaultTabForUser(hrManager), 'hr-personnel');

  const debtsManager: AppUser = {
    id: 'u-debts',
    username: 'debts_lead',
    fullName: 'مسئول المديونيات',
    role: 'auditor',
    allowedDepartments: ['debts'],
  };
  assert.equal(canUserAccessTab(debtsManager, 'debts'), true);
  assert.equal(canUserAccessTab(debtsManager, 'bakeries'), false);
  assert.equal(getDefaultTabForUser(debtsManager), 'debts');

  const fullAdmin: AppUser = {
    id: 'u-admin',
    username: 'admin',
    fullName: 'مدير النظام',
    role: 'admin',
  };
  assert.equal(canUserAccessDepartment(fullAdmin, 'commodities'), true);
  assert.equal(canUserAccessTab(fullAdmin, 'bakeries'), true);
  assert.equal(getDefaultTabForUser(fullAdmin), 'welcome');
});
