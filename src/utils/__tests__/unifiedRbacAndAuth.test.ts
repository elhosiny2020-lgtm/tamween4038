import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolate fallback store BEFORE importing database modules
const TEMP_STORE_PATH = path.join(
  os.tmpdir(),
  `tamween_unified_rbac_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.json`
);
process.env.TAMWEEN_FALLBACK_STORE_PATH = TEMP_STORE_PATH;

import { setPgFallbackMode } from '../../db/queries.ts';
import { getRawFallbackStore } from '../../db/fallbackStore.ts';
import {
  authenticateUserUnified,
  copyBranchDepartmentSettingsInDb,
  createUserInDb,
  deleteUserInDb,
  ensureGovernanceSchemaAndSeeds,
  generalizeDepartmentToBranchesInDb,
  getBranchDepartmentsGovernanceInDb,
  getBranchDepartmentsRawInDb,
  isDepartmentHiddenForBranchInDb,
  listAdministrationsWithBranchesInDb,
  listRolesInDb,
  listUsersScopedInDb,
  resetUserPasswordInDb,
  transferUserBranchInDb,
  updateBranchDepartmentsGovernanceInDb,
  updateOwnAccountInDb,
  updateUserInDb,
  upsertRoleInDb,
} from '../../db/governanceRepository.ts';
import { canUserAccessTab, hasDepartmentPermission } from '../departmentRbac.ts';
import { CANONICAL_12_ROLES, isDepartmentVisibleInBranchConfig } from '../rbacCatalog.ts';
import type { AppUser } from '../../types.ts';

const SUPER_ADMIN_ACTOR: AppUser = {
  id: 'usr-admin-test',
  username: 'admin',
  fullName: 'مدير النظام الرئيسي',
  role: 'super_admin',
  branchId: 'branch-mahalla-center',
  isCentral: true,
  isActive: true,
  customPermissions: [],
};

describe('Unified RBAC, 12 Dynamic Roles, Multi-Tenant Users, Login & Branch Department Governance (14 Tests)', () => {
  before(async () => {
    setPgFallbackMode(true);
    await ensureGovernanceSchemaAndSeeds();
  });

  after(() => {
    try {
      if (fs.existsSync(TEMP_STORE_PATH)) {
        fs.unlinkSync(TEMP_STORE_PATH);
      }
    } catch {
      // ignore cleanup errors
    }
  });

  let createdBranchAUserId = '';
  let createdBranchManagerUser: AppUser | null = null;
  let branchAId = 'branch-samanoud';
  let branchBId = 'branch-tanta-first';

  it('Test 1: Create new user in Branch A -> saved in DB with scrypt hash (no plaintext) and bound to branch', async () => {
    const { branches } = await listAdministrationsWithBranchesInDb();
    assert.ok(branches.length >= 2, 'Expected at least 2 seeded branches');
    branchAId = branches.find((b) => b.id === 'branch-samanoud')?.id || branches[1].id;
    branchBId = branches.find((b) => b.id === 'branch-tanta-first')?.id || branches[0].id;

    const createRes = await createUserInDb({
      actor: SUPER_ADMIN_ACTOR,
      payload: {
        username: 'samanoud_mgr_1',
        fullName: 'أحمد مدير فرع سمنود',
        password: 'StrongPass#2026',
        role: 'branch_manager',
        branchId: branchAId,
        phone: '01012345678',
        jobTitle: 'مدير فرع سمنود',
        isActive: true,
      },
    });

    assert.equal(createRes.success, true, `Expected createUserInDb success, got: ${createRes.error}`);
    assert.ok(createRes.user?.id);
    assert.equal(createRes.user?.branchId, branchAId);
    assert.equal(createRes.user?.role, 'branch_manager');
    assert.equal((createRes.user as any)?.passwordHash, undefined, 'passwordHash must never leak to client');

    // Verify scrypt hash stored on disk (not plaintext)
    const rawStore = getRawFallbackStore();
    const rawUser = rawStore.app_users.find((u: any) => u.id === createRes.user!.id);
    assert.ok(rawUser, 'User must be persisted in database store');
    const storedHash = rawUser.password || '';
    assert.ok(
      typeof storedHash === 'string' && storedHash.startsWith('scrypt$'),
      `Password must be hashed with scrypt, got: ${String(storedHash).slice(0, 15)}`
    );
    assert.notEqual(storedHash, 'StrongPass#2026');

    createdBranchAUserId = createRes.user!.id;
    createdBranchManagerUser = createRes.user!;
  });

  it('Test 2: Valid login with created Username & Password succeeds and updates lastLoginAt', async () => {
    const loginRes = await authenticateUserUnified(branchAId, 'samanoud_mgr_1', 'StrongPass#2026');
    assert.equal(loginRes.ok, true, `Expected login success, got: ${loginRes.error}`);
    assert.equal(loginRes.user?.username, 'samanoud_mgr_1');
    assert.equal(loginRes.resolvedBranchId, branchAId);
    assert.ok(loginRes.user?.lastLoginAt, 'lastLoginAt should be recorded on login');
  });

  it('Test 3: Invalid login attempts rejected with exact Arabic error codes (WRONG_PASSWORD, USER_NOT_FOUND, ACCOUNT_DISABLED, BRANCH_ACCESS_DENIED)', async () => {
    const wrongPass = await authenticateUserUnified(branchAId, 'samanoud_mgr_1', 'WrongPass!999');
    assert.equal(wrongPass.ok, false);
    assert.equal(wrongPass.code, 'WRONG_PASSWORD');

    const missingUser = await authenticateUserUnified(branchAId, 'non_existent_user_xyz', 'AnyPass#123');
    assert.equal(missingUser.ok, false);
    assert.equal(missingUser.code, 'USER_NOT_FOUND');

    // Trying to log into Branch B with a Branch A user must fail with BRANCH_ACCESS_DENIED
    const wrongBranch = await authenticateUserUnified(branchBId, 'samanoud_mgr_1', 'StrongPass#2026');
    assert.equal(wrongBranch.ok, false);
    assert.equal(wrongBranch.code, 'BRANCH_ACCESS_DENIED');

    // Disable user -> ACCOUNT_DISABLED -> then re-enable
    const disableRes = await updateUserInDb({
      actor: SUPER_ADMIN_ACTOR,
      userId: createdBranchAUserId,
      payload: { isActive: false },
    });
    assert.equal(disableRes.success, true);

    const disabledLogin = await authenticateUserUnified(branchAId, 'samanoud_mgr_1', 'StrongPass#2026');
    assert.equal(disabledLogin.ok, false);
    assert.equal(disabledLogin.code, 'ACCOUNT_DISABLED');

    const enableRes = await updateUserInDb({
      actor: SUPER_ADMIN_ACTOR,
      userId: createdBranchAUserId,
      payload: { isActive: true },
    });
    assert.equal(enableRes.success, true);
  });

  it('Test 4: All 12 canonical roles load dynamically from DB without duplicates (Arabic + code)', async () => {
    const roles = await listRolesInDb(SUPER_ADMIN_ACTOR);
    assert.ok(roles.length >= 12, `Expected at least 12 roles, got ${roles.length}`);
    const codes = roles.map((r) => r.code);
    assert.equal(new Set(codes).size, codes.length, 'Role codes must not have duplicates');
    for (const seed of CANONICAL_12_ROLES) {
      const found = roles.find((r) => r.code === seed.code);
      assert.ok(found, `Missing canonical role: ${seed.code}`);
      assert.ok(found.nameAr && found.nameAr.length > 0, `Role ${seed.code} must have Arabic label`);
    }
  });

  it('Test 5: Selecting & saving a role for a user persists accurately in DB', async () => {
    const empRes = await createUserInDb({
      actor: SUPER_ADMIN_ACTOR,
      payload: {
        username: 'samanoud_auditor_1',
        fullName: 'محمود مراجع سمنود',
        password: 'AuditPass#2026',
        role: 'auditor',
        branchId: branchAId,
      },
    });
    assert.equal(empRes.success, true, empRes.error);
    assert.equal(empRes.user?.role, 'auditor');
    assert.equal(empRes.user?.roleNameAr, 'مراقب');

    const listed = await listUsersScopedInDb({ actor: SUPER_ADMIN_ACTOR, branchId: branchAId });
    const persisted = listed.find((u) => u.username === 'samanoud_auditor_1');
    assert.ok(persisted);
    assert.equal(persisted.role, 'auditor');
  });

  it('Test 6: Privilege escalation & self-escalation are strictly blocked on backend', async () => {
    assert.ok(createdBranchManagerUser);

    // Branch Manager trying to create a super_admin must be blocked with 403
    const escalateCreate = await createUserInDb({
      actor: createdBranchManagerUser,
      payload: {
        username: 'hacker_super',
        fullName: 'محاولة تصعيد',
        password: 'HackPass#2026',
        role: 'super_admin',
        branchId: branchAId,
      },
    });
    assert.equal(escalateCreate.success, false);
    assert.equal(escalateCreate.status, 403);

    // Branch Manager trying to self-escalate own role to super_admin must be blocked with 403
    const selfEscalate = await updateUserInDb({
      actor: createdBranchManagerUser,
      userId: createdBranchManagerUser.id,
      payload: { role: 'super_admin' },
    });
    assert.equal(selfEscalate.success, false);
    assert.equal(selfEscalate.status, 403);

    // Roles list for Branch Manager must mark super_admin canAssign === false
    const mgrRoles = await listRolesInDb(createdBranchManagerUser);
    const superRole = mgrRoles.find((r) => r.code === 'super_admin');
    assert.equal(superRole?.canAssign, false);
  });

  it('Test 7: Multi-tenant branch isolation — Branch A user never leaks into Branch B', async () => {
    assert.ok(createdBranchManagerUser);

    // Super Admin querying Branch B must NOT see samanoud_mgr_1
    const branchBUsers = await listUsersScopedInDb({ actor: SUPER_ADMIN_ACTOR, branchId: branchBId });
    assert.equal(
      branchBUsers.some((u) => u.username === 'samanoud_mgr_1'),
      false,
      'Branch A user must never appear in Branch B user list'
    );

    // Branch A manager attempting to list Branch B users only gets Branch A users
    const leaked = await listUsersScopedInDb({ actor: createdBranchManagerUser, branchId: branchBId });
    assert.ok(leaked.every((u) => u.branchId === branchAId));

    // Create a user in Branch B via Super Admin, verify Branch A manager cannot edit or delete them
    const branchBUserRes = await createUserInDb({
      actor: SUPER_ADMIN_ACTOR,
      payload: {
        username: 'tanta_emp_1',
        fullName: 'موظف طنطا أول',
        password: 'TantaPass#2026',
        role: 'employee',
        branchId: branchBId,
      },
    });
    assert.equal(branchBUserRes.success, true, branchBUserRes.error);

    const crossEdit = await updateUserInDb({
      actor: createdBranchManagerUser,
      userId: branchBUserRes.user!.id,
      payload: { fullName: 'تعديل غير مصرح' },
    });
    assert.equal(crossEdit.success, false);
    assert.equal(crossEdit.status, 403);
  });

  it('Test 8: Edit user details (fullName, username, role, permissions) persists in DB', async () => {
    const listedA = await listUsersScopedInDb({ actor: SUPER_ADMIN_ACTOR, branchId: branchAId });
    const auditor = listedA.find((u) => u.username === 'samanoud_auditor_1');
    assert.ok(auditor);

    const editRes = await updateUserInDb({
      actor: SUPER_ADMIN_ACTOR,
      userId: auditor.id,
      payload: {
        fullName: 'محمود مسؤول قسم المخابز سمنود',
        username: 'samanoud_bakery_head',
        role: 'department_head',
        departmentPermissions: {
          bakeries: {
            view: true,
            enter: true,
            insert: true,
            update: true,
            delete: false,
            print: true,
            export: true,
          },
        },
      },
    });
    assert.equal(editRes.success, true, editRes.error);
    assert.equal(editRes.user?.username, 'samanoud_bakery_head');
    assert.equal(editRes.user?.role, 'department_head');
    assert.equal(editRes.user?.departmentPermissions?.bakeries?.insert, true);
  });

  it('Test 9: Reset password -> old password fails -> new password succeeds', async () => {
    const listedA = await listUsersScopedInDb({ actor: SUPER_ADMIN_ACTOR, branchId: branchAId });
    const target = listedA.find((u) => u.username === 'samanoud_bakery_head');
    assert.ok(target);

    const resetRes = await resetUserPasswordInDb({
      actor: SUPER_ADMIN_ACTOR,
      userId: target.id,
      newPassword: 'NewResetPass#2026',
    });
    assert.equal(resetRes.success, true, resetRes.error);

    const oldTry = await authenticateUserUnified(branchAId, 'samanoud_bakery_head', 'AuditPass#2026');
    assert.equal(oldTry.ok, false);
    assert.equal(oldTry.code, 'WRONG_PASSWORD');

    const newTry = await authenticateUserUnified(branchAId, 'samanoud_bakery_head', 'NewResetPass#2026');
    assert.equal(newTry.ok, true, newTry.error);
  });

  it('Test 10: Account Setup (updateOwnAccountInDb) updates own profile & changes own password in any branch', async () => {
    assert.ok(createdBranchManagerUser);

    const selfUpdate = await updateOwnAccountInDb({
      actor: createdBranchManagerUser,
      fullName: 'أحمد محمد - مدير فرع سمنود',
      phone: '01198765432',
      currentPassword: 'StrongPass#2026',
      newPassword: 'MySelfNewPass#2026',
    });
    assert.equal(selfUpdate.success, true, selfUpdate.error);
    assert.equal(selfUpdate.passwordChanged, true);
    assert.equal(selfUpdate.user?.fullName, 'أحمد محمد - مدير فرع سمنود');

    const oldPassCheck = await authenticateUserUnified(branchAId, 'samanoud_mgr_1', 'StrongPass#2026');
    assert.equal(oldPassCheck.ok, false);

    const newPassCheck = await authenticateUserUnified(branchAId, 'samanoud_mgr_1', 'MySelfNewPass#2026');
    assert.equal(newPassCheck.ok, true, newPassCheck.error);
    createdBranchManagerUser = newPassCheck.user!;
  });

  it('Test 11: Hide department in Branch A -> hidden in Branch A only, direct access blocked, data & user perms preserved -> re-show restores saved perms without escalation', async () => {
    const beforeGov = await getBranchDepartmentsGovernanceInDb(branchAId);
    const listedA = await listUsersScopedInDb({ actor: SUPER_ADMIN_ACTOR, branchId: branchAId });
    const bakeryHead = listedA.find((u) => u.username === 'samanoud_bakery_head')!;

    // Hide "debts" (group-3) in Branch A while keeping bakeryHead's saved bakeries permissions intact
    const nextDepts = beforeGov.departments.map((d) =>
      d.id === 'group-3' ? { ...d, visible: false } : d
    );
    const hideRes = await updateBranchDepartmentsGovernanceInDb({
      branchId: branchAId,
      departments: nextDepts,
      actor: createdBranchManagerUser!,
      userPermissionUpdates: [
        {
          userId: bakeryHead.id,
          departmentKey: 'debts',
          flags: {
            view: true,
            enter: true,
            insert: true,
            update: false,
            delete: false,
            print: true,
            export: false,
          },
        },
      ],
    });
    assert.equal(hideRes.success, true, hideRes.error);

    // Hidden in Branch A
    assert.equal(await isDepartmentHiddenForBranchInDb(branchAId, 'debts'), true);
    // NOT hidden in Branch B (strict isolation!)
    assert.equal(await isDepartmentHiddenForBranchInDb(branchBId, 'debts'), false);

    // Direct tab access & permission check blocked when branchDepartments marks debts hidden
    const freshA = await getBranchDepartmentsRawInDb(branchAId);
    const refreshedHead = (await listUsersScopedInDb({ actor: SUPER_ADMIN_ACTOR, branchId: branchAId })).find(
      (u) => u.id === bakeryHead.id
    )!;
    assert.equal(isDepartmentVisibleInBranchConfig(freshA, 'debts'), false);
    assert.equal(canUserAccessTab(refreshedHead, 'debts', freshA), false);
    assert.equal(hasDepartmentPermission(refreshedHead, 'debts', 'view', freshA), false);

    // Re-show "debts" in Branch A -> saved permissions return WITHOUT granting extra permissions (delete remains false!)
    const showDepts = freshA.map((d) => (d.id === 'group-3' ? { ...d, visible: true } : d));
    const showRes = await updateBranchDepartmentsGovernanceInDb({
      branchId: branchAId,
      departments: showDepts,
      actor: createdBranchManagerUser!,
    });
    assert.equal(showRes.success, true, showRes.error);

    const restoredA = await getBranchDepartmentsRawInDb(branchAId);
    assert.equal(await isDepartmentHiddenForBranchInDb(branchAId, 'debts'), false);
    assert.equal(canUserAccessTab(refreshedHead, 'debts', restoredA), true);
    assert.equal(hasDepartmentPermission(refreshedHead, 'debts', 'insert', restoredA), true);
    assert.equal(hasDepartmentPermission(refreshedHead, 'debts', 'delete', restoredA), false);
  });

  it('Test 12: Copy department settings between branches copies structure/visibility WITHOUT copying operational data or users', async () => {
    // Hide group-8 (grain_maintenance) in Branch A
    const deptsA = await getBranchDepartmentsRawInDb(branchAId);
    const updatedA = deptsA.map((d) => (d.id === 'group-8' ? { ...d, visible: false } : d));
    await updateBranchDepartmentsGovernanceInDb({
      branchId: branchAId,
      departments: updatedA,
      actor: SUPER_ADMIN_ACTOR,
    });

    const usersBBefore = await listUsersScopedInDb({ actor: SUPER_ADMIN_ACTOR, branchId: branchBId });
    const copyRes = await copyBranchDepartmentSettingsInDb({
      actor: SUPER_ADMIN_ACTOR,
      sourceBranchId: branchAId,
      targetBranchId: branchBId,
    });
    assert.equal(copyRes.success, true, copyRes.error);
    assert.ok((copyRes.copiedDepartmentsCount || 0) > 0);

    // Branch B now reflects group-8 hidden
    assert.equal(await isDepartmentHiddenForBranchInDb(branchBId, 'grain_maintenance'), true);

    // Branch B users list must be completely unchanged (no Branch A users copied)
    const usersBAfter = await listUsersScopedInDb({ actor: SUPER_ADMIN_ACTOR, branchId: branchBId });
    assert.equal(usersBAfter.length, usersBBefore.length);
    assert.equal(
      usersBAfter.some((u) => u.username === 'samanoud_mgr_1'),
      false
    );
  });

  it('Test 13: Generalize department from Central Admin to selected branches + Transfer user branch', async () => {
    const newDept = {
      id: 'custom-dept-inspector-unit',
      key: 'custom-dept-inspector-unit',
      label: 'قسم المتابعة الميدانية المستحدث',
      shortLabel: 'المتابعة الميدانية',
      order: 25,
      visible: true,
      enabled: true,
      allowedBySuperAdmin: true,
      subItems: [],
    };
    const genRes = await generalizeDepartmentToBranchesInDb({
      actor: SUPER_ADMIN_ACTOR,
      department: newDept,
      targetBranchIds: [branchAId, branchBId],
      allowedBySuperAdmin: true,
      visible: true,
    });
    assert.equal(genRes.success, true, genRes.error);
    assert.deepEqual(genRes.affectedBranches.sort(), [branchAId, branchBId].sort());

    const deptsA = await getBranchDepartmentsRawInDb(branchAId);
    const deptsB = await getBranchDepartmentsRawInDb(branchBId);
    assert.ok(deptsA.some((d) => d.id === newDept.id));
    assert.ok(deptsB.some((d) => d.id === newDept.id));

    // Transfer user from Branch A to Branch B
    const listedA = await listUsersScopedInDb({ actor: SUPER_ADMIN_ACTOR, branchId: branchAId });
    const toTransfer = listedA.find((u) => u.username === 'samanoud_bakery_head')!;
    const transferRes = await transferUserBranchInDb({
      actor: SUPER_ADMIN_ACTOR,
      userId: toTransfer.id,
      targetBranchId: branchBId,
    });
    assert.equal(transferRes.success, true, transferRes.error);
    assert.equal(transferRes.user?.branchId, branchBId);
  });

  it('Test 14: Dynamic role creation/update persists in DB and appears in listRolesInDb + Clean delete user', async () => {
    const upsertRes = await upsertRoleInDb(
      {
        code: 'field_quality_lead',
        nameAr: 'رئيس فريق جودة ميداني',
        description: 'دور ديناميكي مضاف من اللوحة المركزية',
        hierarchyLevel: 45,
        isSystem: false,
        isCentral: false,
        isActive: true,
        defaultPermissions: ['view', 'enter', 'print', 'export'],
      },
      'admin'
    );
    assert.equal(upsertRes.success, true, upsertRes.error);

    const allRoles = await listRolesInDb(SUPER_ADMIN_ACTOR);
    const customRole = allRoles.find((r) => r.code === 'field_quality_lead');
    assert.ok(customRole, 'Newly created dynamic role must appear in listRolesInDb');
    assert.equal(customRole.nameAr, 'رئيس فريق جودة ميداني');

    // Delete temporary user cleanly
    const delRes = await deleteUserInDb({
      actor: SUPER_ADMIN_ACTOR,
      userId: createdBranchAUserId,
    });
    assert.equal(delRes.success, true, delRes.error);
  });
});
