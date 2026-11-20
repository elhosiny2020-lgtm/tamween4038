import { pool } from './index.ts';
import {
  DEFAULT_BRANCH_ID,
  ensurePostgresSchema,
  isPgFallbackMode,
  setPgFallbackMode,
  mapDbUserToApp,
  recordAuditLog,
} from './queries.ts';
import {
  getRawFallbackStore,
  saveRawFallbackStore,
  isPostgresUnavailableError,
} from './fallbackStore.ts';
import {
  CANONICAL_12_ROLES,
  DEFAULT_ADMINISTRATIONS,
  GRANULAR_PERMISSIONS_CATALOG,
  canActorAssignRole,
  canActorManageTargetUser,
  getCanonicalRoleLabelAr,
  getEffectiveUserHierarchyLevel,
  isCentralRoleCode,
  isCentralUser,
  isDepartmentVisibleInBranchConfig,
  resolveDefaultAdministrationIdForBranch,
} from '../utils/rbacCatalog.ts';
import {
  cloneDefaultBranchDepartmentsStructure,
  DEFAULT_BRANCH_DEPARTMENTS_TEMPLATE,
} from '../utils/branchOperations.ts';
import {
  hashPasswordScrypt,
  isScryptHash,
  normalizeDigits,
  sanitizeUserForClient,
  validatePasswordComplexity,
  verifyPasswordScrypt,
} from '../utils/serverAuth.ts';
import {
  isSuperAdmin,
  resolveUserDepartmentMatrix,
} from '../utils/departmentRbac.ts';
import { INITIAL_USERS } from '../defaultData.ts';
import { deduplicateSupplyBranches } from '../utils/branchVaultUtils.ts';
import {
  SYSTEM_DEPARTMENT_KEYS,
  type AdministrationRecord,
  type AppUser,
  type BranchDepartmentConfigItem,
  type DepartmentPermissionFlags,
  type DepartmentPermissionsMap,
  type RoleRecord,
  type SupplyBranch,
  type SystemDepartmentKey,
} from '../types.ts';

let governanceSchemaReady = false;

export type AuthFailureCode =
  | 'USER_NOT_FOUND'
  | 'WRONG_PASSWORD'
  | 'ACCOUNT_DISABLED'
  | 'NO_BRANCH_ASSIGNED'
  | 'NO_LOGIN_PERMISSION'
  | 'ROLE_UNAVAILABLE'
  | 'BRANCH_ACCESS_DENIED';

export interface UnifiedAuthResult {
  ok: boolean;
  status?: number;
  code?: AuthFailureCode;
  error?: string;
  user?: AppUser;
  resolvedBranchId?: string;
}

export interface BranchDepartmentGovernanceItem extends BranchDepartmentConfigItem {
  allowedUsers: Array<{
    userId: string;
    username: string;
    fullName: string;
    role: string;
    roleNameAr: string;
    flags: DepartmentPermissionFlags;
  }>;
  allowedUsersCount: number;
}

/**
 * تهيئة الجداول الإضافية والأدوار الـ 12 والإدارات والأقسام المركزية بأمان (Idempotent) دون حذف أي بيانات
 */
export async function ensureGovernanceSchemaAndSeeds(): Promise<void> {
  await ensurePostgresSchema();

  if (isPgFallbackMode()) {
    const store = getRawFallbackStore();
    let dirty = false;

    if (!Array.isArray(store.administrations) || store.administrations.length === 0) {
      store.administrations = DEFAULT_ADMINISTRATIONS.map((a) => ({
        ...a,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      dirty = true;
    }

    if (!Array.isArray(store.roles) || store.roles.length === 0) {
      store.roles = CANONICAL_12_ROLES.map((r) => ({
        ...r,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      dirty = true;
    } else {
      // Ensure all 12 canonical roles exist without duplicates
      const existingCodes = new Set(store.roles.map((r) => String(r.code || '').toLowerCase()));
      for (const seed of CANONICAL_12_ROLES) {
        if (!existingCodes.has(seed.code.toLowerCase())) {
          store.roles.push({
            ...seed,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          dirty = true;
        }
      }
    }

    if (!Array.isArray(store.central_departments) || store.central_departments.length === 0) {
      store.central_departments = cloneDefaultBranchDepartmentsStructure(DEFAULT_BRANCH_DEPARTMENTS_TEMPLATE);
      dirty = true;
    }

    // Ensure branches have administrationId & isActive
    for (const br of store.branches || []) {
      if (!br.administrationId) {
        br.administrationId = resolveDefaultAdministrationIdForBranch(br.id);
        dirty = true;
      }
      if (br.isActive === undefined) {
        br.isActive = true;
        dirty = true;
      }
    }

    // Seed Mahalla default users whenever the database has zero users (both dev & prod)
    const hasAnyUser = Array.isArray(store.app_users) && store.app_users.length > 0;
    const envAdminPass = String(process.env.INITIAL_ADMIN_PASSWORD || '').trim();
    if (!hasAnyUser) {
      for (const seed of INITIAL_USERS) {
        const isRoot = seed.role === 'admin' && seed.username === 'admin';
        const resolvedPass = isRoot && envAdminPass ? envAdminPass : seed.password || '123';
        store.app_users.push({
          ...seed,
          branchId: DEFAULT_BRANCH_ID,
          administrationId: resolveDefaultAdministrationIdForBranch(DEFAULT_BRANCH_ID),
          password: hashPasswordScrypt(resolvedPass),
          isSuperAdmin: isRoot,
          isCentral: isRoot,
          applyToAllBranches: isRoot,
          isActive: seed.isActive !== false,
          createdAt: seed.createdAt || new Date().toISOString(),
          version: 1,
        });
      }
      dirty = true;
    } else {
      // Ensure existing root admin account is marked central & super_admin so it works across all branches
      for (const u of store.app_users) {
        if (
          String(u.username || '').trim().toLowerCase() === 'admin' &&
          (u.role === 'admin' || u.role === 'super_admin' || u.isSuperAdmin)
        ) {
          if (!u.isSuperAdmin) {
            u.isSuperAdmin = true;
            dirty = true;
          }
          if (!u.isCentral) {
            u.isCentral = true;
            dirty = true;
          }
        }
      }
    }

    if (dirty) {
      saveRawFallbackStore(store);
    }
    governanceSchemaReady = true;
    return;
  }

  if (governanceSchemaReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.administrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        governorate_title TEXT NOT NULL DEFAULT 'محافظة الغربية',
        directorate_title TEXT NOT NULL DEFAULT 'مديرية التموين والتجارة الداخلية بالغربية',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS administration_id TEXT DEFAULT 'admin-mahalla-sector';
      ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

      CREATE TABLE IF NOT EXISTS public.roles (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name_ar TEXT NOT NULL,
        hierarchy_level INTEGER NOT NULL DEFAULT 20,
        is_central BOOLEAN NOT NULL DEFAULT FALSE,
        is_system BOOLEAN NOT NULL DEFAULT TRUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        badge_color TEXT NOT NULL DEFAULT 'bg-slate-100 text-slate-900 border-slate-400',
        description TEXT NOT NULL DEFAULT '',
        default_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS public.permissions (
        code TEXT PRIMARY KEY,
        name_ar TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'عام',
        description TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS public.role_permissions (
        id TEXT PRIMARY KEY,
        role_code TEXT NOT NULL REFERENCES public.roles(code) ON DELETE CASCADE,
        permission_code TEXT NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
        CONSTRAINT uq_role_permission UNIQUE (role_code, permission_code)
      );

      ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS administration_id TEXT DEFAULT 'admin-mahalla-sector';
      ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS is_central BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
      ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS updated_by TEXT DEFAULT '';

      CREATE TABLE IF NOT EXISTS public.user_roles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
        role_code TEXT NOT NULL,
        branch_id TEXT,
        assigned_by TEXT NOT NULL DEFAULT 'system',
        assigned_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_user_role_branch UNIQUE (user_id, role_code)
      );

      CREATE TABLE IF NOT EXISTS public.user_branches (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
        branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
        is_primary BOOLEAN NOT NULL DEFAULT TRUE,
        assigned_by TEXT NOT NULL DEFAULT 'system',
        assigned_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_user_branch UNIQUE (user_id, branch_id)
      );

      ALTER TABLE public.app_departments ADD COLUMN IF NOT EXISTS code TEXT DEFAULT '';
      ALTER TABLE public.app_departments ADD COLUMN IF NOT EXISTS short_label TEXT DEFAULT '';
      ALTER TABLE public.app_departments ADD COLUMN IF NOT EXISTS icon_key TEXT DEFAULT 'folder';
      ALTER TABLE public.app_departments ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE public.app_departments ADD COLUMN IF NOT EXISTS sub_items_json JSONB NOT NULL DEFAULT '[]'::jsonb;

      CREATE TABLE IF NOT EXISTS public.branch_departments (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
        department_id TEXT NOT NULL,
        department_key TEXT NOT NULL DEFAULT 'bakeries',
        label TEXT NOT NULL,
        short_label TEXT NOT NULL DEFAULT '',
        icon_key TEXT NOT NULL DEFAULT 'folder',
        visible BOOLEAN NOT NULL DEFAULT TRUE,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        allowed_by_super_admin BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        sub_items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_by TEXT NOT NULL DEFAULT 'system',
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_branch_department UNIQUE (branch_id, department_id)
      );

      ALTER TABLE public.user_department_permissions ADD COLUMN IF NOT EXISTS can_enter BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE public.user_department_permissions ADD COLUMN IF NOT EXISTS can_hide BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE public.user_department_permissions ADD COLUMN IF NOT EXISTS can_approve BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE public.user_department_permissions ADD COLUMN IF NOT EXISTS can_manage_users BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE public.user_department_permissions ADD COLUMN IF NOT EXISTS can_assign_permissions BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE public.user_department_permissions ADD COLUMN IF NOT EXISTS can_department_settings BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    for (const adm of DEFAULT_ADMINISTRATIONS) {
      await pool.query(
        `INSERT INTO public.administrations (id, name, governorate_title, directorate_title, is_active)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
        [adm.id, adm.name, adm.governorateTitle, adm.directorateTitle, adm.isActive]
      );
    }

    for (const perm of GRANULAR_PERMISSIONS_CATALOG) {
      await pool.query(
        `INSERT INTO public.permissions (code, name_ar, category, description)
         VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO NOTHING`,
        [perm.code, perm.nameAr, perm.category, perm.description]
      );
    }

    for (const role of CANONICAL_12_ROLES) {
      await pool.query(
        `INSERT INTO public.roles (id, code, name_ar, hierarchy_level, is_central, is_system, is_active, badge_color, description, default_permissions)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
         ON CONFLICT (code) DO NOTHING`,
        [
          role.id,
          role.code,
          role.nameAr,
          role.hierarchyLevel,
          role.isCentral,
          role.isSystem,
          role.isActive,
          role.badgeColor,
          role.description,
          JSON.stringify(role.defaultPermissions),
        ]
      );
      for (const permCode of role.defaultPermissions) {
        await pool.query(
          `INSERT INTO public.role_permissions (id, role_code, permission_code)
           VALUES ($1, $2, $3) ON CONFLICT (role_code, permission_code) DO NOTHING`,
          [`rp_${role.code}_${permCode}`, role.code, permCode]
        );
      }
    }

    // Ensure default initial users exist in PostgreSQL whenever app_users is completely empty (prevents lockout in fresh dev/prod DBs)
    const userCountRes = await pool
      .query(`SELECT COUNT(*)::int AS cnt FROM public.app_users`)
      .catch(() => ({ rows: [{ cnt: 0 }] }));
    if (Number(userCountRes.rows[0]?.cnt || 0) === 0) {
      const envAdminPass = String(process.env.INITIAL_ADMIN_PASSWORD || '').trim();
      for (const seed of INITIAL_USERS) {
        const isRoot = seed.role === 'admin' && seed.username === 'admin';
        const resolvedPass = isRoot && envAdminPass ? envAdminPass : seed.password || '123';
        await pool
          .query(
            `INSERT INTO public.app_users (
              id, branch_id, administration_id, username, full_name, password_hash, role,
              job_title, department, custom_permissions, is_active, is_super_admin, is_central
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'[]'::jsonb,$10,$11,$12)
            ON CONFLICT (id) DO NOTHING`,
            [
              seed.id,
              DEFAULT_BRANCH_ID,
              resolveDefaultAdministrationIdForBranch(DEFAULT_BRANCH_ID),
              seed.username,
              seed.fullName,
              hashPasswordScrypt(resolvedPass),
              seed.role,
              seed.jobTitle || (isRoot ? 'مدير عام النظام' : ''),
              seed.department || 'إدارة تموين مركز المحلة الكبرى',
              seed.isActive !== false,
              isRoot,
              isRoot,
            ]
          )
          .catch(() => {});
      }
    } else {
      // Ensure existing root admin has is_central = TRUE so root admin can sign in across all branches
      await pool
        .query(
          `UPDATE public.app_users
           SET is_central = TRUE, is_super_admin = TRUE
           WHERE LOWER(TRIM(username)) = 'admin' AND (role IN ('admin', 'super_admin') OR is_super_admin = TRUE) AND is_central = FALSE`
        )
        .catch(() => {});
    }

    governanceSchemaReady = true;
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      setPgFallbackMode(true);
      await ensureGovernanceSchemaAndSeeds();
      return;
    }
    throw err;
  }
}

function enrichUserMeta(
  user: AppUser,
  branches: SupplyBranch[],
  roles: RoleRecord[]
): AppUser {
  const sanitized = sanitizeUserForClient(user) as AppUser;
  const matchedBranch = branches.find((b) => b.id === sanitized.branchId);
  const central = isCentralUser(sanitized);
  return {
    ...sanitized,
    isCentral: central,
    administrationId:
      sanitized.administrationId ||
      matchedBranch?.administrationId ||
      resolveDefaultAdministrationIdForBranch(sanitized.branchId || DEFAULT_BRANCH_ID),
    branchName: central && !sanitized.branchId
      ? 'حساب مركزي (جميع الفروع)'
      : matchedBranch?.name || sanitized.department || sanitized.branchId || '',
    roleNameAr: getCanonicalRoleLabelAr(sanitized.role, roles),
  };
}

/**
 * جلب كافة الأدوار من قاعدة البيانات ديناميكياً بدون تكرار + تحديد قابلية التعيين حسب مستوى المستخدم الحالي
 */
export async function listRolesInDb(actor?: AppUser | null): Promise<RoleRecord[]> {
  await ensureGovernanceSchemaAndSeeds();
  let rows: RoleRecord[] = [];

  if (isPgFallbackMode()) {
    const store = getRawFallbackStore();
    rows = (store.roles || []).map((r) => ({ ...r }));
  } else {
    try {
      const res = await pool.query(`SELECT * FROM public.roles ORDER BY hierarchy_level DESC, created_at ASC`);
      rows = res.rows.map((r) => ({
        id: String(r.id),
        code: String(r.code),
        nameAr: String(r.name_ar),
        hierarchyLevel: Number(r.hierarchy_level || 20),
        isCentral: Boolean(r.is_central),
        isSystem: r.is_system !== false,
        isActive: r.is_active !== false,
        badgeColor: String(r.badge_color || 'bg-slate-100 text-slate-900 border-slate-400'),
        description: String(r.description || ''),
        defaultPermissions: Array.isArray(r.default_permissions) ? r.default_permissions.map(String) : [],
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
      }));
    } catch (err) {
      if (isPostgresUnavailableError(err)) {
        setPgFallbackMode(true);
        return listRolesInDb(actor);
      }
      throw err;
    }
  }

  // Deduplicate by code
  const map = new Map<string, RoleRecord>();
  for (const r of rows) {
    const key = r.code.toLowerCase();
    if (!map.has(key)) {
      map.set(key, r);
    }
  }
  const deduped = Array.from(map.values()).sort((a, b) => b.hierarchyLevel - a.hierarchyLevel);
  if (!actor) return deduped;

  return deduped.map((r) => ({
    ...r,
    canAssign: canActorAssignRole(actor, r.code, deduped),
  }));
}

export async function upsertRoleInDb(
  payload: Partial<RoleRecord> & { code: string; nameAr: string },
  actorUsername: string,
  ipAddress = '127.0.0.1'
): Promise<{ success: boolean; role?: RoleRecord; error?: string }> {
  await ensureGovernanceSchemaAndSeeds();
  const code = String(payload.code || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  const nameAr = String(payload.nameAr || '').trim();
  if (!code || code.length < 2 || !nameAr) {
    return { success: false, error: 'يرجى إدخال المعرّف البرمجي (إنجليزي) والاسم العربي للدور.' };
  }

  const hierarchyLevel = Math.max(10, Math.min(100, Number(payload.hierarchyLevel) || 25));
  const defaultPermissions = Array.isArray(payload.defaultPermissions)
    ? Array.from(new Set(payload.defaultPermissions.map(String)))
    : ['view', 'enter'];

  const roleObj: RoleRecord = {
    id: payload.id || `role-${code}`,
    code,
    nameAr,
    hierarchyLevel: code === 'super_admin' ? 100 : Math.min(99, hierarchyLevel),
    isCentral: Boolean(payload.isCentral || code === 'super_admin'),
    isSystem: payload.isSystem !== undefined ? Boolean(payload.isSystem) : CANONICAL_12_ROLES.some((r) => r.code === code),
    isActive: payload.isActive !== false,
    badgeColor: String(payload.badgeColor || 'bg-slate-100 text-slate-900 border-slate-400'),
    description: String(payload.description || ''),
    defaultPermissions,
    updatedAt: new Date().toISOString(),
  };

  if (isPgFallbackMode()) {
    const store = getRawFallbackStore();
    if (!Array.isArray(store.roles)) store.roles = [];
    const idx = store.roles.findIndex((r) => r.code.toLowerCase() === code);
    if (idx >= 0) {
      store.roles[idx] = {
        ...store.roles[idx],
        ...roleObj,
        id: store.roles[idx].id,
        createdAt: store.roles[idx].createdAt || new Date().toISOString(),
      };
    } else {
      store.roles.push({
        ...roleObj,
        badgeColor: roleObj.badgeColor || 'bg-slate-100 text-slate-900 border-slate-400',
        description: roleObj.description || '',
        createdAt: new Date().toISOString(),
      });
    }
    saveRawFallbackStore(store);
  } else {
    try {
      await pool.query(
        `INSERT INTO public.roles (id, code, name_ar, hierarchy_level, is_central, is_system, is_active, badge_color, description, default_permissions, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())
         ON CONFLICT (code) DO UPDATE SET
           name_ar = EXCLUDED.name_ar,
           hierarchy_level = EXCLUDED.hierarchy_level,
           is_central = EXCLUDED.is_central,
           is_active = EXCLUDED.is_active,
           badge_color = EXCLUDED.badge_color,
           description = EXCLUDED.description,
           default_permissions = EXCLUDED.default_permissions,
           updated_at = NOW()`,
        [
          roleObj.id,
          roleObj.code,
          roleObj.nameAr,
          roleObj.hierarchyLevel,
          roleObj.isCentral,
          roleObj.isSystem,
          roleObj.isActive,
          roleObj.badgeColor,
          roleObj.description,
          JSON.stringify(roleObj.defaultPermissions),
        ]
      );
      await pool.query(`DELETE FROM public.role_permissions WHERE role_code = $1`, [roleObj.code]);
      for (const permCode of roleObj.defaultPermissions) {
        await pool
          .query(
            `INSERT INTO public.role_permissions (id, role_code, permission_code)
             VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [`rp_${roleObj.code}_${permCode}`, roleObj.code, permCode]
          )
          .catch(() => {});
      }
    } catch (err) {
      if (isPostgresUnavailableError(err)) {
        setPgFallbackMode(true);
        return upsertRoleInDb(payload, actorUsername, ipAddress);
      }
      throw err;
    }
  }

  await recordAuditLog(
    actorUsername,
    'ROLE_SAVED',
    `حفظ/تحديث الدور الوظيفي (${roleObj.nameAr} — ${roleObj.code}) بمستوى (${roleObj.hierarchyLevel})`,
    ipAddress,
    DEFAULT_BRANCH_ID,
    { username: actorUsername, department: 'roles', operation: 'UPSERT_ROLE', recordId: roleObj.code, result: 'SUCCESS' }
  ).catch(() => {});

  return { success: true, role: roleObj };
}

export async function listAdministrationsWithBranchesInDb(): Promise<{
  administrations: AdministrationRecord[];
  branches: SupplyBranch[];
}> {
  await ensureGovernanceSchemaAndSeeds();
  let admins: AdministrationRecord[] = [];
  let branches: SupplyBranch[] = [];

  if (isPgFallbackMode()) {
    const store = getRawFallbackStore();
    admins = (store.administrations || DEFAULT_ADMINISTRATIONS).map((a) => ({ ...a }));
    branches = deduplicateSupplyBranches(store.branches || []).map((b) => ({
      ...b,
      administrationId: b.administrationId || resolveDefaultAdministrationIdForBranch(b.id),
      isActive: b.isActive !== false,
    }));
  } else {
    try {
      const [admRes, brRes] = await Promise.all([
        pool.query(`SELECT * FROM public.administrations ORDER BY id ASC`),
        pool.query(`SELECT * FROM public.branches ORDER BY is_default DESC, created_at ASC`),
      ]);
      admins = admRes.rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        governorateTitle: String(r.governorate_title || 'محافظة الغربية'),
        directorateTitle: String(r.directorate_title || 'مديرية التموين والتجارة الداخلية بالغربية'),
        isActive: r.is_active !== false,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
      }));
      branches = deduplicateSupplyBranches(
        brRes.rows.map((r) => ({
          id: String(r.id),
          administrationId: String(r.administration_id || resolveDefaultAdministrationIdForBranch(String(r.id))),
          name: String(r.name),
          governorateTitle: String(r.governorate_title || 'محافظة الغربية'),
          directorateTitle: String(r.directorate_title || 'مديرية التموين والتجارة الداخلية بالغربية'),
          description: String(r.description || ''),
          isDefault: Boolean(r.is_default),
          isActive: r.is_active !== false,
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        }))
      );
    } catch (err) {
      if (isPostgresUnavailableError(err)) {
        setPgFallbackMode(true);
        return listAdministrationsWithBranchesInDb();
      }
      throw err;
    }
  }

  const withBranches = admins.map((adm) => ({
    ...adm,
    branches: branches.filter((b) => (b.administrationId || resolveDefaultAdministrationIdForBranch(b.id)) === adm.id),
  }));

  return { administrations: withBranches, branches };
}

/**
 * المصادقة الموحدة (تسجيل الدخول) مع رسائل خطأ عربية دقيقة لكل حالة من الحالات الـ 9
 * ودعم المستخدمين المركزيين والمستخدمين المربوطين بفرع محدد وتحديث آخر دخول في قاعدة البيانات
 */
function normalizeLoginIdentifier(input: string): string {
  return normalizeDigits(String(input || ''))
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeArabicIdentifier(input: string): string {
  return normalizeLoginIdentifier(input)
    .replace(/[\u0640\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

function matchesUserLoginIdentifier(
  candidate: { username?: string; fullName?: string; gmailEmail?: string; full_name?: string; gmail_email?: string },
  cleanTarget: string,
  arabicTarget: string,
  exactOnly: boolean
): boolean {
  const fields = [
    candidate.username || '',
    candidate.fullName || candidate.full_name || '',
    candidate.gmailEmail || candidate.gmail_email || '',
  ];
  for (const field of fields) {
    if (!field) continue;
    if (exactOnly) {
      if (normalizeLoginIdentifier(field) === cleanTarget) return true;
    } else {
      if (normalizeArabicIdentifier(field) === arabicTarget) return true;
    }
  }
  return false;
}

export async function authenticateUserUnified(
  requestedBranchId: string,
  usernameOrName: string,
  password: string
): Promise<UnifiedAuthResult> {
  await ensureGovernanceSchemaAndSeeds();
  const cleanTarget = normalizeLoginIdentifier(usernameOrName);
  const arabicTarget = normalizeArabicIdentifier(usernameOrName);
  const cleanPass = String(password || '');
  const targetBranchId = String(requestedBranchId || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID;

  if (!cleanTarget || !cleanPass) {
    return {
      ok: false,
      status: 400,
      code: 'USER_NOT_FOUND',
      error: 'يرجى إدخال اسم المستخدم وكلمة المرور.',
    };
  }

  const [rolesList, { branches }] = await Promise.all([
    listRolesInDb(),
    listAdministrationsWithBranchesInDb(),
  ]);

  const checkRoleValid = (roleCode: string): boolean => {
    const cleanRole = String(roleCode || '').trim().toLowerCase();
    const legacyAllowed = new Set(['admin', 'supervisor', 'inspector', 'data_entry', 'viewer', 'reader', 'custom_role']);
    if (legacyAllowed.has(cleanRole)) return true;
    const found = rolesList.find((r) => r.code.toLowerCase() === cleanRole);
    return Boolean(found && found.isActive !== false);
  };

  if (isPgFallbackMode()) {
    const store = getRawFallbackStore();
    if (!Array.isArray(store.app_users) || store.app_users.length === 0) {
      governanceSchemaReady = false;
      await ensureGovernanceSchemaAndSeeds();
    }
    const allUsers = getRawFallbackStore().app_users || [];

    // 1. Try exact match in requested branch first, then normalized Arabic match in requested branch
    let matched =
      allUsers.find(
        (u) =>
          u.branchId === targetBranchId &&
          matchesUserLoginIdentifier(u, cleanTarget, arabicTarget, true)
      ) ||
      allUsers.find(
        (u) =>
          u.branchId === targetBranchId &&
          matchesUserLoginIdentifier(u, cleanTarget, arabicTarget, false)
      );

    // 2. If not found in requested branch, check globally (for central users OR to detect wrong-branch attempt)
    if (!matched) {
      let globalMatches = allUsers.filter((u) =>
        matchesUserLoginIdentifier(u, cleanTarget, arabicTarget, true)
      );
      if (globalMatches.length === 0) {
        globalMatches = allUsers.filter((u) =>
          matchesUserLoginIdentifier(u, cleanTarget, arabicTarget, false)
        );
      }
      if (globalMatches.length === 0) {
        return {
          ok: false,
          status: 401,
          code: 'USER_NOT_FOUND',
          error: 'المستخدم غير موجود. يرجى التأكد من اسم المستخدم والمحاولة مرة أخرى.',
        };
      }
      // Prefer central/super_admin match if available
      const centralMatch = globalMatches.find((u) => isCentralUser(u) || isSuperAdmin(u));
      if (centralMatch) {
        matched = centralMatch;
      } else {
        matched = globalMatches[0];
        // Verify password first so we don't leak branch info on wrong password
        if (!verifyPasswordScrypt(cleanPass, matched.password || '')) {
          return {
            ok: false,
            status: 401,
            code: 'WRONG_PASSWORD',
            error: 'كلمة المرور غير صحيحة. يرجى التأكد من كلمة المرور والمحاولة مرة أخرى.',
          };
        }
        if (matched.isActive === false) {
          return {
            ok: false,
            status: 403,
            code: 'ACCOUNT_DISABLED',
            error: 'هذا الحساب معطّل حالياً. يرجى مراجعة مدير الفرع أو مدير النظام.',
          };
        }
        const assignedBranch = branches.find((b) => b.id === matched!.branchId);
        return {
          ok: false,
          status: 403,
          code: 'BRANCH_ACCESS_DENIED',
          error: `هذا الحساب مربوط بـ (${assignedBranch?.name || matched.branchId}) فقط ولا يملك صلاحية الدخول على هذا الفرع.`,
        };
      }
    }

    // Verify password
    const storedPass = String(matched.password || '');
    if (!verifyPasswordScrypt(cleanPass, storedPass)) {
      return {
        ok: false,
        status: 401,
        code: 'WRONG_PASSWORD',
        error: 'كلمة المرور غير صحيحة. يرجى التأكد من كلمة المرور والمحاولة مرة أخرى.',
      };
    }

    // Check account enabled
    if (matched.isActive === false) {
      return {
        ok: false,
        status: 403,
        code: 'ACCOUNT_DISABLED',
        error: 'هذا الحساب معطّل حالياً. يرجى مراجعة مدير الفرع أو مدير النظام.',
      };
    }

    // Check role availability
    if (!checkRoleValid(matched.role)) {
      return {
        ok: false,
        status: 403,
        code: 'ROLE_UNAVAILABLE',
        error: `الدور الوظيفي (${matched.role}) غير متاح أو معطّل حالياً.`,
      };
    }

    // Check branch assignment for non-central users
    const central = isCentralUser(matched) || isSuperAdmin(matched);
    if (!central && !matched.branchId) {
      return {
        ok: false,
        status: 403,
        code: 'NO_BRANCH_ASSIGNED',
        error: 'هذا الحساب غير مربوط بأي فرع حالياً. يرجى مراجعة مدير النظام لربطه بفرع.',
      };
    }

    // Check login permission (non-super/non-central users must have at least one viewable department or valid role)
    const effectiveMatrix = resolveUserDepartmentMatrix(matched);
    const hasAnyAccess =
      isSuperAdmin(matched) ||
      central ||
      SYSTEM_DEPARTMENT_KEYS.some((k) => Boolean(effectiveMatrix[k]?.view)) ||
      (Array.isArray(matched.customPermissions) && matched.customPermissions.length > 0) ||
      Boolean(matched.role);
    if (!hasAnyAccess) {
      return {
        ok: false,
        status: 403,
        code: 'NO_LOGIN_PERMISSION',
        error: 'لا توجد صلاحية دخول مفعّلة لهذا الحساب حالياً.',
      };
    }

    // Upgrade plaintext legacy password to scrypt + update lastLoginAt
    if (storedPass && !isScryptHash(storedPass)) {
      matched.password = hashPasswordScrypt(cleanPass);
    }
    matched.lastLoginAt = new Date().toISOString();
    saveRawFallbackStore(store);

    const resolvedBranchId = central ? targetBranchId : matched.branchId || targetBranchId;
    const enriched = enrichUserMeta(matched, branches, rolesList);
    return { ok: true, user: enriched, resolvedBranchId };
  }

  // PostgreSQL mode
  try {
    let branchUsersRes = await pool.query(
      `SELECT * FROM public.app_users
       WHERE LOWER(TRIM(username)) = $1
          OR LOWER(TRIM(full_name)) = $1
          OR LOWER(TRIM(COALESCE(gmail_email, ''))) = $1`,
      [cleanTarget]
    );
    if (branchUsersRes.rows.length === 0) {
      // Secondary normalized match (handles Arabic digits, extra whitespace, hamza/teh marbuta variations, and empty-table re-seed)
      const allUsersRes = await pool.query(`SELECT * FROM public.app_users`);
      if (allUsersRes.rows.length === 0) {
        governanceSchemaReady = false;
        await ensureGovernanceSchemaAndSeeds();
        const seededRes = await pool.query(`SELECT * FROM public.app_users`);
        branchUsersRes = {
          ...seededRes,
          rows: seededRes.rows.filter(
            (r) =>
              matchesUserLoginIdentifier(r, cleanTarget, arabicTarget, true) ||
              matchesUserLoginIdentifier(r, cleanTarget, arabicTarget, false)
          ),
        };
      } else {
        const exactMatches = allUsersRes.rows.filter((r) =>
          matchesUserLoginIdentifier(r, cleanTarget, arabicTarget, true)
        );
        const normalizedMatches =
          exactMatches.length > 0
            ? exactMatches
            : allUsersRes.rows.filter((r) =>
                matchesUserLoginIdentifier(r, cleanTarget, arabicTarget, false)
              );
        branchUsersRes = { ...allUsersRes, rows: normalizedMatches };
      }
    }
    if (branchUsersRes.rows.length === 0) {
      return {
        ok: false,
        status: 401,
        code: 'USER_NOT_FOUND',
        error: 'المستخدم غير موجود. يرجى التأكد من اسم المستخدم والمحاولة مرة أخرى.',
      };
    }

    let matchedRow = branchUsersRes.rows.find((r) => String(r.branch_id) === targetBranchId);
    if (!matchedRow) {
      const centralRow = branchUsersRes.rows.find((r) => {
        const mapped = mapDbUserToApp(r);
        return isCentralUser(mapped) || isSuperAdmin(mapped);
      });
      if (centralRow) {
        matchedRow = centralRow;
      } else {
        matchedRow = branchUsersRes.rows[0];
        if (!verifyPasswordScrypt(cleanPass, String(matchedRow.password_hash || ''))) {
          return {
            ok: false,
            status: 401,
            code: 'WRONG_PASSWORD',
            error: 'كلمة المرور غير صحيحة. يرجى التأكد من كلمة المرور والمحاولة مرة أخرى.',
          };
        }
        if (matchedRow.is_active === false) {
          return {
            ok: false,
            status: 403,
            code: 'ACCOUNT_DISABLED',
            error: 'هذا الحساب معطّل حالياً. يرجى مراجعة مدير الفرع أو مدير النظام.',
          };
        }
        const assignedBranch = branches.find((b) => b.id === String(matchedRow.branch_id));
        return {
          ok: false,
          status: 403,
          code: 'BRANCH_ACCESS_DENIED',
          error: `هذا الحساب مربوط بـ (${assignedBranch?.name || matchedRow.branch_id}) فقط ولا يملك صلاحية الدخول على هذا الفرع.`,
        };
      }
    }

    const storedHash = String(matchedRow.password_hash || '');
    if (!verifyPasswordScrypt(cleanPass, storedHash)) {
      return {
        ok: false,
        status: 401,
        code: 'WRONG_PASSWORD',
        error: 'كلمة المرور غير صحيحة. يرجى التأكد من كلمة المرور والمحاولة مرة أخرى.',
      };
    }

    if (matchedRow.is_active === false) {
      return {
        ok: false,
        status: 403,
        code: 'ACCOUNT_DISABLED',
        error: 'هذا الحساب معطّل حالياً. يرجى مراجعة مدير الفرع أو مدير النظام.',
      };
    }

    const mappedUser = mapDbUserToApp(matchedRow);
    if (!checkRoleValid(mappedUser.role)) {
      return {
        ok: false,
        status: 403,
        code: 'ROLE_UNAVAILABLE',
        error: `الدور الوظيفي (${mappedUser.role}) غير متاح أو معطّل حالياً.`,
      };
    }

    const central = isCentralUser(mappedUser) || isSuperAdmin(mappedUser);
    if (!central && !mappedUser.branchId) {
      return {
        ok: false,
        status: 403,
        code: 'NO_BRANCH_ASSIGNED',
        error: 'هذا الحساب غير مربوط بأي فرع حالياً. يرجى مراجعة مدير النظام لربطه بفرع.',
      };
    }

    if (storedHash && !isScryptHash(storedHash)) {
      await pool
        .query(`UPDATE public.app_users SET password_hash = $1, last_login_at = NOW() WHERE id = $2`, [
          hashPasswordScrypt(cleanPass),
          matchedRow.id,
        ])
        .catch(() => {});
    } else {
      await pool
        .query(`UPDATE public.app_users SET last_login_at = NOW() WHERE id = $1`, [matchedRow.id])
        .catch(() => {});
    }

    mappedUser.lastLoginAt = new Date().toISOString();
    const resolvedBranchId = central ? targetBranchId : mappedUser.branchId || targetBranchId;
    return {
      ok: true,
      user: enrichUserMeta(mappedUser, branches, rolesList),
      resolvedBranchId,
    };
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      setPgFallbackMode(true);
      return authenticateUserUnified(requestedBranchId, usernameOrName, password);
    }
    throw err;
  }
}

/**
 * استرجاع قائمة المستخدمين مع عزل صارم للفروع وبحث وفلترة (بالاسم، الفرع، الدور، الحالة)
 */
export async function listUsersScopedInDb(params: {
  actor: AppUser;
  branchId?: string;
  administrationId?: string;
  role?: string;
  search?: string;
  status?: 'all' | 'active' | 'disabled';
}): Promise<AppUser[]> {
  await ensureGovernanceSchemaAndSeeds();
  const [rolesList, { branches }] = await Promise.all([
    listRolesInDb(),
    listAdministrationsWithBranchesInDb(),
  ]);

  const actorIsCentral = isCentralUser(params.actor) || isSuperAdmin(params.actor);
  // Strict multi-tenant isolation: non-central users ONLY see their own branch
  const enforcedBranchId = actorIsCentral
    ? params.branchId && params.branchId !== 'ALL'
      ? params.branchId
      : undefined
    : params.actor.branchId || DEFAULT_BRANCH_ID;

  let rawUsers: AppUser[] = [];
  if (isPgFallbackMode()) {
    const store = getRawFallbackStore();
    rawUsers = (store.app_users || []).map((u) => sanitizeUserForClient(u) as AppUser);
  } else {
    try {
      const sql = enforcedBranchId
        ? `SELECT * FROM public.app_users WHERE branch_id = $1 ORDER BY created_at DESC`
        : `SELECT * FROM public.app_users ORDER BY created_at DESC`;
      const res = enforcedBranchId ? await pool.query(sql, [enforcedBranchId]) : await pool.query(sql);
      rawUsers = res.rows.map((r) => mapDbUserToApp(r));
    } catch (err) {
      if (isPostgresUnavailableError(err)) {
        setPgFallbackMode(true);
        return listUsersScopedInDb(params);
      }
      throw err;
    }
  }

  let filtered = rawUsers.map((u) => enrichUserMeta(u, branches, rolesList));

  if (enforcedBranchId) {
    filtered = filtered.filter((u) => u.branchId === enforcedBranchId);
  }
  if (params.administrationId && params.administrationId !== 'ALL') {
    filtered = filtered.filter((u) => u.administrationId === params.administrationId);
  }
  if (params.role && params.role !== 'ALL') {
    filtered = filtered.filter((u) => u.role === params.role);
  }
  if (params.status === 'active') {
    filtered = filtered.filter((u) => u.isActive !== false);
  } else if (params.status === 'disabled') {
    filtered = filtered.filter((u) => u.isActive === false);
  }
  if (params.search && params.search.trim()) {
    const q = params.search.trim().toLowerCase();
    filtered = filtered.filter((u) =>
      [u.fullName, u.username, u.branchName, u.roleNameAr, u.role, u.jobTitle, u.phone]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q))
    );
  }

  return filtered;
}

/**
 * إنشاء مستخدم جديد وربطه بفرع محدد (أو حساب مركزي) مع تشفير كلمة المرور والتحقق الفعلي من الحفظ
 */
export async function createUserInDb(params: {
  actor: AppUser;
  payload: Partial<AppUser> & { password?: string };
  ipAddress?: string;
}): Promise<{ success: boolean; status?: number; user?: AppUser; error?: string }> {
  await ensureGovernanceSchemaAndSeeds();
  const [rolesList, { branches }] = await Promise.all([
    listRolesInDb(),
    listAdministrationsWithBranchesInDb(),
  ]);

  const username = normalizeDigits(String(params.payload.username || '')).trim();
  const fullName = String(params.payload.fullName || '').trim();
  const rawPassword = String(params.payload.password || '').trim();
  const roleCode = String(params.payload.role || '').trim();

  if (!username || username.length < 3) {
    return { success: false, status: 400, error: 'اسم المستخدم يجب أن يتكون من 3 أحرف على الأقل.' };
  }
  if (!fullName) {
    return { success: false, status: 400, error: 'يرجى إدخال الاسم الكامل للمستخدم.' };
  }
  if (!roleCode) {
    return { success: false, status: 400, error: 'يرجى اختيار الدور الوظيفي من القائمة.' };
  }
  const roleRecord = rolesList.find((r) => r.code === roleCode);
  if (!roleRecord || roleRecord.isActive === false) {
    return { success: false, status: 400, error: 'الدور الوظيفي المختار غير متاح في النظام.' };
  }

  // Prevent privilege escalation: cannot assign role higher than actor's level
  if (!canActorAssignRole(params.actor, roleCode, rolesList)) {
    return {
      success: false,
      status: 403,
      error: `غير مصرح لك بمنح دور (${roleRecord.nameAr}) لأنه أعلى من مستواك الوظيفي.`,
    };
  }

  const complexity = validatePasswordComplexity(rawPassword);
  if (!complexity.valid) {
    return { success: false, status: 400, error: complexity.error || 'كلمة المرور غير مطابقة لشروط الأمان.' };
  }

  const actorIsCentral = isCentralUser(params.actor) || isSuperAdmin(params.actor);
  const requestedCentral = Boolean(params.payload.isCentral || params.payload.applyToAllBranches || roleRecord.isCentral);
  const isCentral = actorIsCentral && requestedCentral;
  const targetBranchId = actorIsCentral
    ? String(params.payload.branchId || params.actor.branchId || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID
    : params.actor.branchId || DEFAULT_BRANCH_ID;

  const targetBranch = branches.find((b) => b.id === targetBranchId);
  if (!targetBranch) {
    return { success: false, status: 400, error: 'الفرع المحدد غير موجود في قاعدة البيانات.' };
  }

  const administrationId =
    String(params.payload.administrationId || targetBranch.administrationId || resolveDefaultAdministrationIdForBranch(targetBranchId));

  const isTargetSuper = roleCode === 'super_admin' && isSuperAdmin(params.actor);
  const matrix = resolveUserDepartmentMatrix({
    ...params.payload,
    id: 'tmp',
    username,
    fullName,
    role: roleCode,
    isSuperAdmin: isTargetSuper,
    allowedDepartments:
      Array.isArray(params.payload.allowedDepartments) && params.payload.allowedDepartments.length > 0
        ? params.payload.allowedDepartments
        : isTargetSuper
        ? ['all']
        : SYSTEM_DEPARTMENT_KEYS,
  });

  const allowedDepartments = isTargetSuper
    ? (['all'] as any)
    : SYSTEM_DEPARTMENT_KEYS.filter((k) => Boolean(matrix[k]?.view));

  const newUserId = `u-${targetBranchId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const hashedPassword = hashPasswordScrypt(rawPassword);
  const nowIso = new Date().toISOString();

  if (isPgFallbackMode()) {
    const store = getRawFallbackStore();
    const dup = (store.app_users || []).find(
      (u) =>
        u.username.trim().toLowerCase() === username.toLowerCase() &&
        (u.branchId === targetBranchId || isCentral || isCentralUser(u))
    );
    if (dup) {
      return {
        success: false,
        status: 409,
        error: 'اسم المستخدم مسجل بالفعل. يرجى اختيار اسم مستخدم آخر.',
      };
    }

    const row: AppUser & { branchId: string; version: number } = {
      id: newUserId,
      branchId: targetBranchId,
      administrationId,
      username,
      fullName,
      password: hashedPassword,
      role: roleCode,
      isSuperAdmin: isTargetSuper,
      isCentral,
      applyToAllBranches: isCentral,
      jobTitle: String(params.payload.jobTitle || roleRecord.nameAr),
      department: String(params.payload.department || targetBranch.name),
      phone: String(params.payload.phone || ''),
      gmailEmail: String(params.payload.gmailEmail || ''),
      googleDriveAutoSync: Boolean(params.payload.googleDriveAutoSync),
      customPermissions: Array.isArray(params.payload.customPermissions)
        ? params.payload.customPermissions
        : [],
      allowedDepartments,
      departmentPermissions: matrix,
      isActive: params.payload.isActive !== false,
      notes: String(params.payload.notes || ''),
      createdAt: nowIso,
      updatedAt: nowIso,
      updatedBy: params.actor.username,
      version: 1,
    };

    store.app_users.push(row);
    saveRawFallbackStore(store);

    // Verify persistence
    const verify = getRawFallbackStore().app_users.find((u) => u.id === newUserId);
    if (!verify) {
      return { success: false, status: 500, error: 'فشل التحقق من حفظ المستخدم في قاعدة البيانات.' };
    }

    await recordAuditLog(
      params.actor.username,
      'USER_CREATED',
      `إنشاء مستخدم جديد (${fullName} — ${username}) بدور (${roleRecord.nameAr}) وربطه بفرع (${targetBranch.name})`,
      params.ipAddress || '127.0.0.1',
      targetBranchId,
      { username: params.actor.username, department: 'users', operation: 'CREATE_USER', recordId: newUserId, result: 'SUCCESS' }
    ).catch(() => {});

    return { success: true, user: enrichUserMeta(verify, branches, rolesList) };
  }

  // PostgreSQL mode
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const dupRes = await client.query(
      `SELECT id, branch_id, is_central FROM public.app_users WHERE LOWER(TRIM(username)) = $1`,
      [username.toLowerCase()]
    );
    const hasConflict = dupRes.rows.some(
      (r) => String(r.branch_id) === targetBranchId || isCentral || Boolean(r.is_central)
    );
    if (hasConflict) {
      await client.query('ROLLBACK');
      return {
        success: false,
        status: 409,
        error: 'اسم المستخدم مسجل بالفعل. يرجى اختيار اسم مستخدم آخر.',
      };
    }

    const encodedPerms: string[] = [
      ...(Array.isArray(params.payload.customPermissions)
        ? params.payload.customPermissions.filter((p) => !String(p).startsWith('__dept:') && p !== '__all_branches')
        : []),
      ...allowedDepartments.map((d: string) => `__dept:${d}`),
      ...(isCentral ? ['__all_branches'] : []),
    ];

    const insertRes = await client.query(
      `INSERT INTO public.app_users (
        id, branch_id, administration_id, username, full_name, password_hash, role,
        job_title, department, phone, gmail_email, google_drive_auto_sync,
        custom_permissions, is_active, is_super_admin, is_central, notes,
        department_permissions, updated_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13::jsonb, $14, $15, $16, $17,
        $18::jsonb, $19
      ) RETURNING *`,
      [
        newUserId,
        targetBranchId,
        administrationId,
        username,
        fullName,
        hashedPassword,
        roleCode,
        String(params.payload.jobTitle || roleRecord.nameAr),
        String(params.payload.department || targetBranch.name),
        String(params.payload.phone || ''),
        String(params.payload.gmailEmail || ''),
        Boolean(params.payload.googleDriveAutoSync),
        JSON.stringify(encodedPerms),
        params.payload.isActive !== false,
        isTargetSuper,
        isCentral,
        String(params.payload.notes || ''),
        JSON.stringify(matrix),
        params.actor.username,
      ]
    );

    if (insertRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, status: 500, error: 'تعذر تأكيد حفظ المستخدم في قاعدة البيانات.' };
    }

    await client.query(
      `INSERT INTO public.user_roles (id, user_id, role_code, branch_id, assigned_by)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id, role_code) DO UPDATE SET branch_id = EXCLUDED.branch_id`,
      [`ur_${newUserId}_${roleCode}`, newUserId, roleCode, targetBranchId, params.actor.username]
    );
    await client.query(
      `INSERT INTO public.user_branches (id, user_id, branch_id, is_primary, assigned_by)
       VALUES ($1, $2, $3, TRUE, $4) ON CONFLICT (user_id, branch_id) DO NOTHING`,
      [`ub_${newUserId}_${targetBranchId}`, newUserId, targetBranchId, params.actor.username]
    );

    for (const deptId of SYSTEM_DEPARTMENT_KEYS) {
      const f = matrix[deptId];
      await client
        .query(
          `INSERT INTO public.user_department_permissions (
            id, user_id, branch_id, department_id,
            can_view, can_enter, can_hide, can_insert, can_update, can_delete,
            can_approve, can_print, can_export, can_manage_users, can_assign_permissions, can_department_settings, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
          ON CONFLICT (user_id, department_id) DO UPDATE SET
            branch_id = EXCLUDED.branch_id,
            can_view = EXCLUDED.can_view,
            can_enter = EXCLUDED.can_enter,
            can_hide = EXCLUDED.can_hide,
            can_insert = EXCLUDED.can_insert,
            can_update = EXCLUDED.can_update,
            can_delete = EXCLUDED.can_delete,
            can_approve = EXCLUDED.can_approve,
            can_print = EXCLUDED.can_print,
            can_export = EXCLUDED.can_export,
            can_manage_users = EXCLUDED.can_manage_users,
            can_assign_permissions = EXCLUDED.can_assign_permissions,
            can_department_settings = EXCLUDED.can_department_settings,
            updated_at = NOW()`,
          [
            `udp_${newUserId}_${deptId}`,
            newUserId,
            targetBranchId,
            deptId,
            Boolean(f?.view),
            Boolean(f?.enter ?? f?.view),
            Boolean(f?.hide),
            Boolean(f?.insert),
            Boolean(f?.update),
            Boolean(f?.delete),
            Boolean(f?.approve),
            Boolean(f?.print),
            Boolean(f?.export),
            Boolean(f?.manageUsers),
            Boolean(f?.assignPermissions),
            Boolean(f?.departmentSettings),
          ]
        )
        .catch(() => {});
    }

    await client.query('COMMIT');

    await recordAuditLog(
      params.actor.username,
      'USER_CREATED',
      `إنشاء مستخدم جديد (${fullName} — ${username}) بدور (${roleRecord.nameAr}) وربطه بفرع (${targetBranch.name})`,
      params.ipAddress || '127.0.0.1',
      targetBranchId,
      { username: params.actor.username, department: 'users', operation: 'CREATE_USER', recordId: newUserId, result: 'SUCCESS' }
    ).catch(() => {});

    return {
      success: true,
      user: enrichUserMeta(mapDbUserToApp(insertRes.rows[0]), branches, rolesList),
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (isPostgresUnavailableError(err)) {
      setPgFallbackMode(true);
      return createUserInDb(params);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function updateUserInDb(params: {
  actor: AppUser;
  userId: string;
  payload: Partial<AppUser> & { password?: string };
  ipAddress?: string;
}): Promise<{ success: boolean; status?: number; user?: AppUser; error?: string; revokeTokens?: boolean }> {
  await ensureGovernanceSchemaAndSeeds();
  const [rolesList, { branches }] = await Promise.all([
    listRolesInDb(),
    listAdministrationsWithBranchesInDb(),
  ]);

  let existingUser: AppUser | null = null;
  if (isPgFallbackMode()) {
    const store = getRawFallbackStore();
    const found = (store.app_users || []).find((u) => u.id === params.userId);
    if (found) existingUser = { ...found };
  } else {
    try {
      const res = await pool.query(`SELECT * FROM public.app_users WHERE id = $1 LIMIT 1`, [params.userId]);
      if (res.rows.length > 0) existingUser = mapDbUserToApp(res.rows[0]);
    } catch (err) {
      if (isPostgresUnavailableError(err)) {
        setPgFallbackMode(true);
        return updateUserInDb(params);
      }
      throw err;
    }
  }

  if (!existingUser) {
    return { success: false, status: 404, error: 'المستخدم المطلوب تعديله غير موجود.' };
  }

  // Prevent privilege escalation & cross-branch tampering
  if (!canActorManageTargetUser(params.actor, existingUser, rolesList)) {
    return {
      success: false,
      status: 403,
      error: 'غير مصرح لك بتعديل حساب هذا المستخدم (أعلى من مستواك الوظيفي أو تابع لفرع آخر).',
    };
  }

  const nextRole = String(params.payload.role || existingUser.role);
  // Prevent self-escalation
  if (params.actor.id === existingUser.id && nextRole !== existingUser.role) {
    const curLvl = getEffectiveUserHierarchyLevel(existingUser, rolesList);
    const nextLvl = rolesList.find((r) => r.code === nextRole)?.hierarchyLevel ?? curLvl;
    if (nextLvl > curLvl) {
      return {
        success: false,
        status: 403,
        error: 'يُحظر تصعيد الصلاحيات: لا يمكن للمستخدم ترقية دوره الوظيفي بنفسه.',
      };
    }
  }

  if (nextRole !== existingUser.role && !canActorAssignRole(params.actor, nextRole, rolesList)) {
    return {
      success: false,
      status: 403,
      error: 'غير مصرح لك بمنح هذا الدور الوظيفي لأنه أعلى من مستواك.',
    };
  }

  const newUsername = params.payload.username
    ? normalizeDigits(String(params.payload.username)).trim()
    : existingUser.username;
  if (!newUsername || newUsername.length < 3) {
    return { success: false, status: 400, error: 'اسم المستخدم يجب أن يتكون من 3 أحرف على الأقل.' };
  }

  const rawPassword = typeof params.payload.password === 'string' ? params.payload.password.trim() : '';
  let hashedPassToSave = '';
  if (rawPassword && rawPassword !== '••••••••') {
    const comp = validatePasswordComplexity(rawPassword);
    if (!comp.valid) {
      return { success: false, status: 400, error: comp.error || 'كلمة المرور غير مطابقة لشروط الأمان.' };
    }
    hashedPassToSave = hashPasswordScrypt(rawPassword);
  }

  const actorIsCentral = isCentralUser(params.actor) || isSuperAdmin(params.actor);
  const nextBranchId =
    actorIsCentral && params.payload.branchId
      ? String(params.payload.branchId).trim()
      : existingUser.branchId || DEFAULT_BRANCH_ID;
  const targetBranch = branches.find((b) => b.id === nextBranchId);
  const nextIsCentral = actorIsCentral
    ? params.payload.isCentral !== undefined
      ? Boolean(params.payload.isCentral)
      : params.payload.applyToAllBranches !== undefined
      ? Boolean(params.payload.applyToAllBranches)
      : isCentralRoleCode(nextRole, rolesList) || Boolean(existingUser.isCentral)
    : false;
  const nextIsSuper =
    nextRole === 'super_admin' && isSuperAdmin(params.actor)
      ? true
      : existingUser.role === 'admin' && existingUser.username.toLowerCase() === 'admin' && nextRole === 'admin';

  const nextActive = params.payload.isActive !== undefined ? Boolean(params.payload.isActive) : existingUser.isActive !== false;
  const nextMatrix =
    params.payload.departmentPermissions !== undefined
      ? resolveUserDepartmentMatrix({
          ...existingUser,
          ...params.payload,
          role: nextRole,
          isSuperAdmin: nextIsSuper,
          departmentPermissions: params.payload.departmentPermissions,
        })
      : resolveUserDepartmentMatrix({
          ...existingUser,
          role: nextRole,
          isSuperAdmin: nextIsSuper,
          allowedDepartments: params.payload.allowedDepartments ?? existingUser.allowedDepartments,
        });

  const nextAllowedDepts = nextIsSuper
    ? (['all'] as any)
    : SYSTEM_DEPARTMENT_KEYS.filter((k) => Boolean(nextMatrix[k]?.view));

  const nextAdminId = String(
    params.payload.administrationId ||
      targetBranch?.administrationId ||
      existingUser.administrationId ||
      resolveDefaultAdministrationIdForBranch(nextBranchId)
  );

  const shouldRevoke =
    !nextActive ||
    Boolean(hashedPassToSave) ||
    nextRole !== existingUser.role ||
    nextBranchId !== existingUser.branchId;

  if (isPgFallbackMode()) {
    const store = getRawFallbackStore();
    const idx = store.app_users.findIndex((u) => u.id === params.userId);
    if (idx < 0) return { success: false, status: 404, error: 'المستخدم غير موجود.' };

    const dup = store.app_users.find(
      (u) =>
        u.id !== params.userId &&
        u.username.trim().toLowerCase() === newUsername.toLowerCase() &&
        (u.branchId === nextBranchId || nextIsCentral || isCentralUser(u))
    );
    if (dup) {
      return { success: false, status: 409, error: 'اسم المستخدم مستخدم بالفعل لحساب آخر.' };
    }

    const updated: AppUser & { branchId: string; version?: number } = {
      ...store.app_users[idx],
      branchId: nextBranchId,
      administrationId: nextAdminId,
      username: newUsername,
      fullName: String(params.payload.fullName ?? store.app_users[idx].fullName),
      password: hashedPassToSave || store.app_users[idx].password,
      role: nextRole,
      isSuperAdmin: nextIsSuper,
      isCentral: nextIsCentral,
      applyToAllBranches: nextIsCentral,
      jobTitle: String(params.payload.jobTitle ?? store.app_users[idx].jobTitle ?? ''),
      department: String(params.payload.department ?? targetBranch?.name ?? store.app_users[idx].department ?? ''),
      phone: String(params.payload.phone ?? store.app_users[idx].phone ?? ''),
      gmailEmail: String(params.payload.gmailEmail ?? store.app_users[idx].gmailEmail ?? ''),
      customPermissions:
        params.payload.customPermissions !== undefined
          ? params.payload.customPermissions
          : store.app_users[idx].customPermissions,
      allowedDepartments: nextAllowedDepts,
      departmentPermissions: nextMatrix,
      isActive: nextActive,
      notes: String(params.payload.notes ?? store.app_users[idx].notes ?? ''),
      updatedAt: new Date().toISOString(),
      updatedBy: params.actor.username,
      version: Number(store.app_users[idx].version || 1) + 1,
    };
    store.app_users[idx] = updated;
    saveRawFallbackStore(store);

    await recordAuditLog(
      params.actor.username,
      'USER_UPDATED',
      `تعديل حساب المستخدم (${updated.fullName} — ${updated.username}) الدور: (${getCanonicalRoleLabelAr(nextRole, rolesList)}) الحالة: (${nextActive ? 'نشط' : 'معطّل'})`,
      params.ipAddress || '127.0.0.1',
      nextBranchId,
      { username: params.actor.username, department: 'users', operation: 'UPDATE_USER', recordId: updated.id, result: 'SUCCESS' }
    ).catch(() => {});

    return {
      success: true,
      user: enrichUserMeta(updated, branches, rolesList),
      revokeTokens: shouldRevoke,
    };
  }

  // PostgreSQL mode
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const encodedPerms: string[] = [
      ...(Array.isArray(params.payload.customPermissions ?? existingUser.customPermissions)
        ? (params.payload.customPermissions ?? existingUser.customPermissions ?? []).filter(
            (p) => !String(p).startsWith('__dept:') && p !== '__all_branches'
          )
        : []),
      ...nextAllowedDepts.map((d: string) => `__dept:${d}`),
      ...(nextIsCentral ? ['__all_branches'] : []),
    ];

    const res = await client.query(
      `UPDATE public.app_users SET
        branch_id = $2,
        administration_id = $3,
        username = $4,
        full_name = $5,
        password_hash = CASE WHEN $6 <> '' THEN $6 ELSE password_hash END,
        role = $7,
        job_title = $8,
        department = $9,
        phone = $10,
        gmail_email = $11,
        custom_permissions = $12::jsonb,
        is_active = $13,
        is_super_admin = $14,
        is_central = $15,
        notes = $16,
        department_permissions = $17::jsonb,
        updated_by = $18,
        version = version + 1,
        updated_at = NOW()
      WHERE id = $1 RETURNING *`,
      [
        params.userId,
        nextBranchId,
        nextAdminId,
        newUsername,
        String(params.payload.fullName ?? existingUser.fullName),
        hashedPassToSave,
        nextRole,
        String(params.payload.jobTitle ?? existingUser.jobTitle ?? ''),
        String(params.payload.department ?? targetBranch?.name ?? existingUser.department ?? ''),
        String(params.payload.phone ?? existingUser.phone ?? ''),
        String(params.payload.gmailEmail ?? existingUser.gmailEmail ?? ''),
        JSON.stringify(encodedPerms),
        nextActive,
        nextIsSuper,
        nextIsCentral,
        String(params.payload.notes ?? existingUser.notes ?? ''),
        JSON.stringify(nextMatrix),
        params.actor.username,
      ]
    );

    if (res.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, status: 404, error: 'تعذر تحديث المستخدم في قاعدة البيانات.' };
    }

    await client.query(`DELETE FROM public.user_roles WHERE user_id = $1`, [params.userId]);
    await client.query(
      `INSERT INTO public.user_roles (id, user_id, role_code, branch_id, assigned_by)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
      [`ur_${params.userId}_${nextRole}`, params.userId, nextRole, nextBranchId, params.actor.username]
    );

    await client.query(`DELETE FROM public.user_branches WHERE user_id = $1`, [params.userId]);
    await client.query(
      `INSERT INTO public.user_branches (id, user_id, branch_id, is_primary, assigned_by)
       VALUES ($1, $2, $3, TRUE, $4) ON CONFLICT DO NOTHING`,
      [`ub_${params.userId}_${nextBranchId}`, params.userId, nextBranchId, params.actor.username]
    );

    for (const deptId of SYSTEM_DEPARTMENT_KEYS) {
      const f = nextMatrix[deptId];
      await client
        .query(
          `INSERT INTO public.user_department_permissions (
            id, user_id, branch_id, department_id,
            can_view, can_enter, can_hide, can_insert, can_update, can_delete,
            can_approve, can_print, can_export, can_manage_users, can_assign_permissions, can_department_settings, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
          ON CONFLICT (user_id, department_id) DO UPDATE SET
            branch_id = EXCLUDED.branch_id,
            can_view = EXCLUDED.can_view,
            can_enter = EXCLUDED.can_enter,
            can_hide = EXCLUDED.can_hide,
            can_insert = EXCLUDED.can_insert,
            can_update = EXCLUDED.can_update,
            can_delete = EXCLUDED.can_delete,
            can_approve = EXCLUDED.can_approve,
            can_print = EXCLUDED.can_print,
            can_export = EXCLUDED.can_export,
            can_manage_users = EXCLUDED.can_manage_users,
            can_assign_permissions = EXCLUDED.can_assign_permissions,
            can_department_settings = EXCLUDED.can_department_settings,
            updated_at = NOW()`,
          [
            `udp_${params.userId}_${deptId}`,
            params.userId,
            nextBranchId,
            deptId,
            Boolean(f?.view),
            Boolean(f?.enter ?? f?.view),
            Boolean(f?.hide),
            Boolean(f?.insert),
            Boolean(f?.update),
            Boolean(f?.delete),
            Boolean(f?.approve),
            Boolean(f?.print),
            Boolean(f?.export),
            Boolean(f?.manageUsers),
            Boolean(f?.assignPermissions),
            Boolean(f?.departmentSettings),
          ]
        )
        .catch(() => {});
    }

    await client.query('COMMIT');

    await recordAuditLog(
      params.actor.username,
      'USER_UPDATED',
      `تعديل حساب المستخدم (${res.rows[0].full_name} — ${newUsername}) الدور: (${getCanonicalRoleLabelAr(nextRole, rolesList)}) الحالة: (${nextActive ? 'نشط' : 'معطّل'})`,
      params.ipAddress || '127.0.0.1',
      nextBranchId,
      { username: params.actor.username, department: 'users', operation: 'UPDATE_USER', recordId: params.userId, result: 'SUCCESS' }
    ).catch(() => {});

    return {
      success: true,
      user: enrichUserMeta(mapDbUserToApp(res.rows[0]), branches, rolesList),
      revokeTokens: shouldRevoke,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (isPostgresUnavailableError(err)) {
      setPgFallbackMode(true);
      return updateUserInDb(params);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function resetUserPasswordInDb(params: {
  actor: AppUser;
  userId: string;
  newPassword: string;
  ipAddress?: string;
}): Promise<{ success: boolean; status?: number; error?: string }> {
  const res = await updateUserInDb({
    actor: params.actor,
    userId: params.userId,
    payload: { password: params.newPassword },
    ipAddress: params.ipAddress,
  });
  if (!res.success) return { success: false, status: res.status, error: res.error };

  await recordAuditLog(
    params.actor.username,
    'USER_PASSWORD_RESET',
    `إعادة تعيين كلمة المرور للمستخدم (${res.user?.username || params.userId}) بواسطة (${params.actor.username})`,
    params.ipAddress || '127.0.0.1',
    res.user?.branchId || DEFAULT_BRANCH_ID,
    { username: params.actor.username, department: 'users', operation: 'RESET_PASSWORD', recordId: params.userId, result: 'SUCCESS' }
  ).catch(() => {});

  return { success: true };
}

export async function transferUserBranchInDb(params: {
  actor: AppUser;
  userId: string;
  targetBranchId: string;
  targetAdministrationId?: string;
  ipAddress?: string;
}): Promise<{ success: boolean; status?: number; user?: AppUser; error?: string }> {
  await ensureGovernanceSchemaAndSeeds();
  if (!isCentralUser(params.actor) && !isSuperAdmin(params.actor)) {
    return {
      success: false,
      status: 403,
      error: 'نقل المستخدمين بين الفروع متاح لمدير النظام الرئيسي أو مدير الإدارة الرئيسية فقط.',
    };
  }
  const { branches } = await listAdministrationsWithBranchesInDb();
  const destBranch = branches.find((b) => b.id === params.targetBranchId);
  if (!destBranch) {
    return { success: false, status: 404, error: 'الفرع الهدف غير موجود.' };
  }

  const res = await updateUserInDb({
    actor: params.actor,
    userId: params.userId,
    payload: {
      branchId: destBranch.id,
      administrationId:
        params.targetAdministrationId ||
        destBranch.administrationId ||
        resolveDefaultAdministrationIdForBranch(destBranch.id),
      department: destBranch.name,
    },
    ipAddress: params.ipAddress,
  });

  if (!res.success) return res;

  await recordAuditLog(
    params.actor.username,
    'USER_BRANCH_TRANSFERRED',
    `نقل المستخدم (${res.user?.fullName} — ${res.user?.username}) إلى فرع (${destBranch.name}) بواسطة (${params.actor.username})`,
    params.ipAddress || '127.0.0.1',
    destBranch.id,
    { username: params.actor.username, department: 'users', operation: 'TRANSFER_BRANCH', recordId: params.userId, result: 'SUCCESS' }
  ).catch(() => {});

  return res;
}

export async function deleteUserInDb(params: {
  actor: AppUser;
  userId: string;
  ipAddress?: string;
}): Promise<{ success: boolean; status?: number; error?: string }> {
  await ensureGovernanceSchemaAndSeeds();
  const rolesList = await listRolesInDb();

  if (params.actor.id === params.userId) {
    return { success: false, status: 400, error: 'لا يمكنك حذف حسابك الشخصي أثناء تسجيل الدخول به.' };
  }

  let targetUser: AppUser | null = null;
  if (isPgFallbackMode()) {
    const store = getRawFallbackStore();
    targetUser = (store.app_users || []).find((u) => u.id === params.userId) || null;
  } else {
    try {
      const res = await pool.query(`SELECT * FROM public.app_users WHERE id = $1 LIMIT 1`, [params.userId]);
      if (res.rows.length > 0) targetUser = mapDbUserToApp(res.rows[0]);
    } catch (err) {
      if (isPostgresUnavailableError(err)) {
        setPgFallbackMode(true);
        return deleteUserInDb(params);
      }
      throw err;
    }
  }

  if (!targetUser) {
    return { success: false, status: 404, error: 'المستخدم غير موجود.' };
  }
  if (targetUser.username.toLowerCase() === 'admin' && targetUser.branchId === DEFAULT_BRANCH_ID) {
    return { success: false, status: 403, error: 'لا يمكن حذف الحساب الجذري الافتراضي للنظام (admin).' };
  }
  if (!canActorManageTargetUser(params.actor, targetUser, rolesList)) {
    return { success: false, status: 403, error: 'غير مصرح لك بحذف هذا المستخدم.' };
  }

  if (isPgFallbackMode()) {
    const store = getRawFallbackStore();
    store.app_users = store.app_users.filter((u) => u.id !== params.userId);
    saveRawFallbackStore(store);
  } else {
    await pool.query(`DELETE FROM public.app_users WHERE id = $1`, [params.userId]);
  }

  await recordAuditLog(
    params.actor.username,
    'USER_DELETED',
    `حذف حساب المستخدم (${targetUser.fullName} — ${targetUser.username}) من فرع (${targetUser.branchId})`,
    params.ipAddress || '127.0.0.1',
    targetUser.branchId || DEFAULT_BRANCH_ID,
    { username: params.actor.username, department: 'users', operation: 'DELETE_USER', recordId: params.userId, result: 'SUCCESS' }
  ).catch(() => {});

  return { success: true };
}

/**
 * إعداد الحساب الشخصي ("إعداد الحساب") — متاح لكل مستخدم مصادق في كل فرع
 * يسمح بتعديل الاسم والهاتف والمسمى الوظيفي وتغيير كلمة المرور الخاصة به فقط دون تصعيد صلاحيات
 */
export async function updateOwnAccountInDb(params: {
  actor: AppUser;
  fullName?: string;
  phone?: string;
  jobTitle?: string;
  gmailEmail?: string;
  currentPassword?: string;
  newPassword?: string;
  ipAddress?: string;
}): Promise<{ success: boolean; status?: number; user?: AppUser; error?: string; passwordChanged?: boolean }> {
  await ensureGovernanceSchemaAndSeeds();
  const [rolesList, { branches }] = await Promise.all([
    listRolesInDb(),
    listAdministrationsWithBranchesInDb(),
  ]);

  let passwordChanged = false;
  let newHash = '';
  if (params.newPassword && params.newPassword.trim()) {
    const comp = validatePasswordComplexity(params.newPassword.trim());
    if (!comp.valid) {
      return { success: false, status: 400, error: comp.error || 'كلمة المرور الجديدة ضعيفة.' };
    }
    if (!params.currentPassword || !params.currentPassword.trim()) {
      return { success: false, status: 400, error: 'يرجى إدخال كلمة المرور الحالية لتأكيد تغيير كلمة المرور.' };
    }
    // Verify current password
    let storedHash = '';
    if (isPgFallbackMode()) {
      const store = getRawFallbackStore();
      const found = store.app_users.find((u) => u.id === params.actor.id);
      storedHash = String(found?.password || '');
    } else {
      const r = await pool.query(`SELECT password_hash FROM public.app_users WHERE id = $1 LIMIT 1`, [params.actor.id]);
      storedHash = String(r.rows[0]?.password_hash || '');
    }
    if (!verifyPasswordScrypt(params.currentPassword.trim(), storedHash)) {
      return { success: false, status: 401, error: 'كلمة المرور الحالية غير صحيحة.' };
    }
    newHash = hashPasswordScrypt(params.newPassword.trim());
    passwordChanged = true;
  }

  if (isPgFallbackMode()) {
    const store = getRawFallbackStore();
    const idx = store.app_users.findIndex((u) => u.id === params.actor.id);
    if (idx < 0) return { success: false, status: 404, error: 'الحساب غير موجود.' };
    store.app_users[idx] = {
      ...store.app_users[idx],
      fullName: params.fullName?.trim() || store.app_users[idx].fullName,
      phone: params.phone !== undefined ? params.phone.trim() : store.app_users[idx].phone,
      jobTitle: params.jobTitle !== undefined ? params.jobTitle.trim() : store.app_users[idx].jobTitle,
      gmailEmail: params.gmailEmail !== undefined ? params.gmailEmail.trim() : store.app_users[idx].gmailEmail,
      password: newHash || store.app_users[idx].password,
      updatedAt: new Date().toISOString(),
      updatedBy: params.actor.username,
    };
    saveRawFallbackStore(store);

    await recordAuditLog(
      params.actor.username,
      passwordChanged ? 'SELF_ACCOUNT_PASSWORD_CHANGED' : 'SELF_ACCOUNT_UPDATED',
      `تحديث إعدادات الحساب الشخصي للمستخدم (${params.actor.username})${passwordChanged ? ' مع تغيير كلمة المرور' : ''}`,
      params.ipAddress || '127.0.0.1',
      params.actor.branchId || DEFAULT_BRANCH_ID,
      { username: params.actor.username, department: 'account', operation: 'ACCOUNT_SETUP', recordId: params.actor.id, result: 'SUCCESS' }
    ).catch(() => {});

    return {
      success: true,
      user: enrichUserMeta(store.app_users[idx], branches, rolesList),
      passwordChanged,
    };
  }

  const res = await pool.query(
    `UPDATE public.app_users SET
      full_name = COALESCE(NULLIF($2, ''), full_name),
      phone = COALESCE($3, phone),
      job_title = COALESCE($4, job_title),
      gmail_email = COALESCE($5, gmail_email),
      password_hash = CASE WHEN $6 <> '' THEN $6 ELSE password_hash END,
      updated_by = $7,
      updated_at = NOW(),
      version = version + 1
    WHERE id = $1 RETURNING *`,
    [
      params.actor.id,
      params.fullName?.trim() || '',
      params.phone !== undefined ? params.phone.trim() : null,
      params.jobTitle !== undefined ? params.jobTitle.trim() : null,
      params.gmailEmail !== undefined ? params.gmailEmail.trim() : null,
      newHash,
      params.actor.username,
    ]
  );
  if (res.rows.length === 0) return { success: false, status: 404, error: 'الحساب غير موجود.' };

  await recordAuditLog(
    params.actor.username,
    passwordChanged ? 'SELF_ACCOUNT_PASSWORD_CHANGED' : 'SELF_ACCOUNT_UPDATED',
    `تحديث إعدادات الحساب الشخصي للمستخدم (${params.actor.username})${passwordChanged ? ' مع تغيير كلمة المرور' : ''}`,
    params.ipAddress || '127.0.0.1',
    params.actor.branchId || DEFAULT_BRANCH_ID,
    { username: params.actor.username, department: 'account', operation: 'ACCOUNT_SETUP', recordId: params.actor.id, result: 'SUCCESS' }
  ).catch(() => {});

  return {
    success: true,
    user: enrichUserMeta(mapDbUserToApp(res.rows[0]), branches, rolesList),
    passwordChanged,
  };
}

/**
 * كتالوج الأقسام المركزية (المستخرج من أقسام المحلة الفعلية + قابل للإضافة مستقبلاً)
 */
export async function listCentralDepartmentsInDb(): Promise<BranchDepartmentConfigItem[]> {
  await ensureGovernanceSchemaAndSeeds();
  if (isPgFallbackMode()) {
    const store = getRawFallbackStore();
    return cloneDefaultBranchDepartmentsStructure(
      store.central_departments && store.central_departments.length > 0
        ? store.central_departments
        : DEFAULT_BRANCH_DEPARTMENTS_TEMPLATE
    );
  }
  try {
    const res = await pool.query(`SELECT * FROM public.app_departments ORDER BY sort_order ASC`);
    const template = cloneDefaultBranchDepartmentsStructure(DEFAULT_BRANCH_DEPARTMENTS_TEMPLATE);
    if (res.rows.length === 0) return template;
    const byId = new Map(template.map((d) => [d.id, d]));
    for (const r of res.rows) {
      const id = String(r.id);
      if (byId.has(id)) {
        const base = byId.get(id)!;
        byId.set(id, {
          ...base,
          label: String(r.name_ar || base.label),
          shortLabel: String(r.short_label || base.shortLabel || ''),
          enabled: r.is_active !== false,
          order: Number(r.sort_order || base.order),
        });
      } else if (id.startsWith('group-') || id.startsWith('custom-dept-')) {
        byId.set(id, {
          id,
          key: String(r.code || 'bakeries'),
          label: String(r.name_ar),
          shortLabel: String(r.short_label || r.name_ar),
          iconKey: String(r.icon_key || 'folder'),
          visible: true,
          enabled: r.is_active !== false,
          allowedBySuperAdmin: r.is_active !== false,
          order: Number(r.sort_order || byId.size + 1),
          subItems: Array.isArray(r.sub_items_json) ? r.sub_items_json : [],
        });
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.order - b.order);
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      setPgFallbackMode(true);
      return listCentralDepartmentsInDb();
    }
    throw err;
  }
}

export async function upsertCentralDepartmentInDb(
  dept: Partial<BranchDepartmentConfigItem> & { label: string },
  actorUsername: string,
  ipAddress = '127.0.0.1'
): Promise<{ success: boolean; department?: BranchDepartmentConfigItem; departments?: BranchDepartmentConfigItem[]; error?: string }> {
  await ensureGovernanceSchemaAndSeeds();
  const label = String(dept.label || '').trim();
  if (!label) return { success: false, error: 'يرجى إدخال اسم القسم.' };

  const current = await listCentralDepartmentsInDb();
  const id = dept.id?.trim() || `custom-dept-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  const existingIdx = current.findIndex((d) => d.id === id);
  const nowIso = new Date().toISOString();

  const savedDept: BranchDepartmentConfigItem = {
    id,
    key: String(dept.key || (existingIdx >= 0 ? current[existingIdx].key : 'bakeries')),
    label,
    shortLabel: String(dept.shortLabel || label),
    iconKey: String(dept.iconKey || (existingIdx >= 0 ? current[existingIdx].iconKey : 'folder')),
    visible: dept.visible !== false,
    enabled: dept.enabled !== false,
    allowedBySuperAdmin: dept.allowedBySuperAdmin !== false,
    order: Number.isFinite(Number(dept.order))
      ? Number(dept.order)
      : existingIdx >= 0
      ? current[existingIdx].order
      : current.length + 1,
    subItems: Array.isArray(dept.subItems)
      ? dept.subItems
      : existingIdx >= 0
      ? current[existingIdx].subItems
      : [],
    updatedAt: nowIso,
    updatedBy: actorUsername,
  };

  if (existingIdx >= 0) current[existingIdx] = savedDept;
  else current.push(savedDept);

  if (isPgFallbackMode()) {
    const store = getRawFallbackStore();
    store.central_departments = current;
    saveRawFallbackStore(store);
  } else {
    await pool.query(
      `INSERT INTO public.app_departments (id, code, name_ar, short_label, icon_key, description, sort_order, is_system, is_active, sub_items_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         code = EXCLUDED.code,
         name_ar = EXCLUDED.name_ar,
         short_label = EXCLUDED.short_label,
         icon_key = EXCLUDED.icon_key,
         sort_order = EXCLUDED.sort_order,
         is_active = EXCLUDED.is_active,
         sub_items_json = EXCLUDED.sub_items_json`,
      [
        savedDept.id,
        savedDept.key,
        savedDept.label,
        savedDept.shortLabel || '',
        savedDept.iconKey || 'folder',
        savedDept.shortLabel || '',
        savedDept.order,
        savedDept.id.startsWith('group-'),
        savedDept.enabled,
        JSON.stringify(savedDept.subItems || []),
      ]
    );
  }

  await recordAuditLog(
    actorUsername,
    'CENTRAL_DEPARTMENT_SAVED',
    `حفظ/تحديث القسم المركزي (${savedDept.label} — ${savedDept.id}) الحالة: (${savedDept.enabled ? 'نشط' : 'معطّل'})`,
    ipAddress,
    DEFAULT_BRANCH_ID,
    { username: actorUsername, department: 'central_departments', operation: 'UPSERT_CENTRAL_DEPT', recordId: savedDept.id, result: 'SUCCESS' }
  ).catch(() => {});

  return { success: true, department: savedDept, departments: current };
}

/**
 * قراءة أقسام فرع معين (مع دمج آخر تعديل ومن عدّل والمستخدمين المسموح لهم وصلاحياتهم في نفس القائمة)
 */
export async function getBranchDepartmentsRawInDb(branchId: string): Promise<BranchDepartmentConfigItem[]> {
  await ensureGovernanceSchemaAndSeeds();
  const effectiveBranchId = branchId || DEFAULT_BRANCH_ID;
  const centralTemplate = await listCentralDepartmentsInDb();

  if (isPgFallbackMode()) {
    const store = getRawFallbackStore();
    const cfg = store.system_config.find((c) => c.branchId === effectiveBranchId);
    const saved = cfg?.systemConfig?.branchDepartments;
    if (Array.isArray(saved) && saved.length > 0) {
      return cloneDefaultBranchDepartmentsStructure(saved);
    }
    return cloneDefaultBranchDepartmentsStructure(centralTemplate);
  }

  try {
    const res = await pool.query(
      `SELECT * FROM public.branch_departments WHERE branch_id = $1 ORDER BY sort_order ASC`,
      [effectiveBranchId]
    );
    if (res.rows.length > 0) {
      return res.rows.map((r) => ({
        id: String(r.department_id),
        key: String(r.department_key || 'bakeries'),
        label: String(r.label),
        shortLabel: String(r.short_label || ''),
        iconKey: String(r.icon_key || 'folder'),
        visible: r.visible !== false,
        enabled: r.enabled !== false,
        allowedBySuperAdmin: r.allowed_by_super_admin !== false,
        order: Number(r.sort_order || 0),
        subItems: Array.isArray(r.sub_items_json) ? r.sub_items_json : [],
        updatedBy: String(r.updated_by || 'system'),
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
      }));
    }
    // Fall back to system_config.daily_alert_config.branchDepartments if present
    const cfgRes = await pool.query(
      `SELECT daily_alert_config FROM public.system_config WHERE branch_id = $1 LIMIT 1`,
      [effectiveBranchId]
    );
    const savedInCfg = cfgRes.rows[0]?.daily_alert_config?.branchDepartments;
    if (Array.isArray(savedInCfg) && savedInCfg.length > 0) {
      return cloneDefaultBranchDepartmentsStructure(savedInCfg);
    }
    return cloneDefaultBranchDepartmentsStructure(centralTemplate);
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      setPgFallbackMode(true);
      return getBranchDepartmentsRawInDb(branchId);
    }
    throw err;
  }
}

export async function getBranchDepartmentsGovernanceInDb(
  branchId: string
): Promise<{
  branchId: string;
  departments: BranchDepartmentGovernanceItem[];
  branchUsers: AppUser[];
}> {
  await ensureGovernanceSchemaAndSeeds();
  const effectiveBranchId = branchId || DEFAULT_BRANCH_ID;
  const [depts, rolesList, { branches }] = await Promise.all([
    getBranchDepartmentsRawInDb(effectiveBranchId),
    listRolesInDb(),
    listAdministrationsWithBranchesInDb(),
  ]);

  let branchUsers: AppUser[] = [];
  if (isPgFallbackMode()) {
    const store = getRawFallbackStore();
    branchUsers = (store.app_users || [])
      .filter((u) => u.branchId === effectiveBranchId || isCentralUser(u))
      .map((u) => enrichUserMeta(u, branches, rolesList));
  } else {
    const res = await pool.query(
      `SELECT * FROM public.app_users WHERE branch_id = $1 OR is_central = TRUE OR is_super_admin = TRUE`,
      [effectiveBranchId]
    );
    branchUsers = res.rows.map((r) => enrichUserMeta(mapDbUserToApp(r), branches, rolesList));
  }

  const enrichedDepts: BranchDepartmentGovernanceItem[] = depts.map((dept) => {
    const deptKey = String(dept.key || 'bakeries') as SystemDepartmentKey;
    const allowedUsers = branchUsers
      .filter((u) => u.isActive !== false)
      .map((u) => {
        const matrix = resolveUserDepartmentMatrix(u);
        const flags = matrix[deptKey] || {
          view: false,
          enter: false,
          hide: false,
          insert: false,
          update: false,
          delete: false,
          approve: false,
          print: false,
          export: false,
          manageUsers: false,
          assignPermissions: false,
          departmentSettings: false,
        };
        return {
          userId: u.id,
          username: u.username,
          fullName: u.fullName,
          role: u.role,
          roleNameAr: u.roleNameAr || getCanonicalRoleLabelAr(u.role, rolesList),
          flags,
        };
      })
      .filter((entry) => entry.flags.view);

    return {
      ...dept,
      allowedUsers,
      allowedUsersCount: allowedUsers.length,
    };
  });

  return {
    branchId: effectiveBranchId,
    departments: enrichedDepts,
    branchUsers,
  };
}

/**
 * حفظ إعدادات أقسام الفرع مع إمكانية تحديث صلاحيات المستخدمين المرتبطة بالقسم في نفس القائمة،
 * والحفاظ التام على البيانات والصلاحيات عند الإخفاء واسترجاعها كما هي عند الإظهار دون صلاحيات إضافية.
 */
export async function updateBranchDepartmentsGovernanceInDb(params: {
  branchId: string;
  departments: BranchDepartmentConfigItem[];
  actor: AppUser;
  userPermissionUpdates?: Array<{
    userId: string;
    departmentKey: SystemDepartmentKey;
    flags: DepartmentPermissionFlags;
  }>;
  ipAddress?: string;
}): Promise<{ success: boolean; departments: BranchDepartmentConfigItem[]; error?: string }> {
  await ensureGovernanceSchemaAndSeeds();
  const effectiveBranchId = params.branchId || DEFAULT_BRANCH_ID;
  const nowIso = new Date().toISOString();
  const prevDepts = await getBranchDepartmentsRawInDb(effectiveBranchId);
  const prevById = new Map(prevDepts.map((d) => [d.id, d]));
  const actorIsSuper = isSuperAdmin(params.actor);

  const normalized = cloneDefaultBranchDepartmentsStructure(params.departments).map((dept) => {
    const prev = prevById.get(dept.id);
    // Branch managers cannot override Super Admin's allowedBySuperAdmin lock
    const allowedBySuperAdmin = actorIsSuper
      ? dept.allowedBySuperAdmin !== false
      : prev
      ? prev.allowedBySuperAdmin !== false
      : true;
    const changed =
      !prev ||
      prev.visible !== dept.visible ||
      prev.enabled !== dept.enabled ||
      prev.label !== dept.label ||
      prev.order !== dept.order ||
      prev.allowedBySuperAdmin !== allowedBySuperAdmin;

    return {
      ...dept,
      allowedBySuperAdmin,
      updatedAt: changed ? nowIso : prev?.updatedAt || nowIso,
      updatedBy: changed ? params.actor.username : prev?.updatedBy || params.actor.username,
    };
  });

  if (isPgFallbackMode()) {
    const store = getRawFallbackStore();
    const idx = store.system_config.findIndex((c) => c.branchId === effectiveBranchId);
    if (idx >= 0) {
      store.system_config[idx] = {
        ...store.system_config[idx],
        systemConfig: {
          ...store.system_config[idx].systemConfig,
          branchDepartments: normalized,
        },
        version: Number(store.system_config[idx].version || 1) + 1,
      };
    } else {
      const br = store.branches.find((b) => b.id === effectiveBranchId);
      store.system_config.push({
        branchId: effectiveBranchId,
        systemConfig: {
          governorateTitle: br?.governorateTitle || 'محافظة الغربية',
          directorateTitle: br?.directorateTitle || 'مديرية التموين والتجارة الداخلية بالغربية',
          administrationTitle: br?.name || effectiveBranchId,
          englishSubtitle: '',
          logoBase64: '',
          branchDepartments: normalized,
        },
        columnTitles: {},
        activityStatuses: ['يعمل', 'متوقف كلي', 'متوقف جزئي', 'ملغى'],
        version: 1,
      });
    }
    saveRawFallbackStore(store);
  } else {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM public.branch_departments WHERE branch_id = $1`, [effectiveBranchId]);
      for (const dept of normalized) {
        await client.query(
          `INSERT INTO public.branch_departments (
            id, branch_id, department_id, department_key, label, short_label, icon_key,
            visible, enabled, allowed_by_super_admin, sort_order, sub_items_json, updated_by, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14)`,
          [
            `bd_${effectiveBranchId}_${dept.id}`,
            effectiveBranchId,
            dept.id,
            String(dept.key || 'bakeries'),
            dept.label,
            dept.shortLabel || '',
            dept.iconKey || 'folder',
            dept.visible !== false,
            dept.enabled !== false,
            dept.allowedBySuperAdmin !== false,
            dept.order,
            JSON.stringify(dept.subItems || []),
            dept.updatedBy || params.actor.username,
            dept.updatedAt || nowIso,
          ]
        );
      }
      // Keep system_config mirror synced for bootstrap
      await client.query(
        `UPDATE public.system_config
         SET daily_alert_config = jsonb_set(COALESCE(daily_alert_config, '{}'::jsonb), '{branchDepartments}', $2::jsonb, TRUE),
             updated_at = NOW(), version = version + 1
         WHERE branch_id = $1`,
        [effectiveBranchId, JSON.stringify(normalized)]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (isPostgresUnavailableError(err)) {
        setPgFallbackMode(true);
        return updateBranchDepartmentsGovernanceInDb(params);
      }
      throw err;
    } finally {
      client.release();
    }
  }

  // Apply linked user-department permission updates in the same menu if provided
  if (Array.isArray(params.userPermissionUpdates) && params.userPermissionUpdates.length > 0) {
    const updatesByUser = new Map<string, Array<{ departmentKey: SystemDepartmentKey; flags: DepartmentPermissionFlags }>>();
    for (const upd of params.userPermissionUpdates) {
      if (!upd?.userId || !upd?.departmentKey) continue;
      const list = updatesByUser.get(upd.userId) || [];
      list.push({ departmentKey: upd.departmentKey, flags: upd.flags });
      updatesByUser.set(upd.userId, list);
    }

    for (const [targetUserId, deptUpdates] of updatesByUser.entries()) {
      const branchUsers = await listUsersScopedInDb({ actor: params.actor, branchId: effectiveBranchId });
      const targetUser = branchUsers.find((u) => u.id === targetUserId);
      if (!targetUser || isSuperAdmin(targetUser)) continue;
      const currentMatrix: DepartmentPermissionsMap = { ...resolveUserDepartmentMatrix(targetUser) };
      for (const u of deptUpdates) {
        currentMatrix[u.departmentKey] = {
          view: Boolean(u.flags.view),
          enter: Boolean(u.flags.view && (u.flags.enter !== false)),
          hide: Boolean(u.flags.hide),
          insert: Boolean(u.flags.view && u.flags.insert),
          update: Boolean(u.flags.view && u.flags.update),
          delete: Boolean(u.flags.view && u.flags.delete),
          approve: Boolean(u.flags.view && u.flags.approve),
          print: Boolean(u.flags.view && u.flags.print),
          export: Boolean(u.flags.view && u.flags.export),
          manageUsers: Boolean(u.flags.manageUsers),
          assignPermissions: Boolean(u.flags.assignPermissions),
          departmentSettings: Boolean(u.flags.departmentSettings),
        };
      }
      await updateUserInDb({
        actor: params.actor,
        userId: targetUserId,
        payload: {
          departmentPermissions: currentMatrix,
          allowedDepartments: SYSTEM_DEPARTMENT_KEYS.filter((k) => Boolean(currentMatrix[k]?.view)),
        },
        ipAddress: params.ipAddress,
      }).catch(() => {});
    }
  }

  const hiddenCount = normalized.filter((d) => !d.visible || !d.enabled || d.allowedBySuperAdmin === false).length;
  await recordAuditLog(
    params.actor.username,
    'BRANCH_DEPARTMENTS_UPDATED',
    `تحديث أقسام فرع (${effectiveBranchId}): إجمالي (${normalized.length}) قسم — مخفي/معطّل (${hiddenCount}) بواسطة (${params.actor.username})`,
    params.ipAddress || '127.0.0.1',
    effectiveBranchId,
    { username: params.actor.username, department: 'branch_departments', operation: 'UPDATE_BRANCH_DEPARTMENTS', recordId: effectiveBranchId, result: 'SUCCESS' }
  ).catch(() => {});

  return { success: true, departments: normalized };
}

/**
 * تعميم قسم على جميع الفروع أو فروع محددة (صلاحية مدير النظام الرئيسي)
 */
export async function generalizeDepartmentToBranchesInDb(params: {
  actor: AppUser;
  department: BranchDepartmentConfigItem;
  targetBranchIds: string[] | 'ALL';
  allowedBySuperAdmin?: boolean;
  visible?: boolean;
  ipAddress?: string;
}): Promise<{ success: boolean; affectedBranches: string[]; error?: string }> {
  await ensureGovernanceSchemaAndSeeds();
  const { branches } = await listAdministrationsWithBranchesInDb();
  const targetIds =
    params.targetBranchIds === 'ALL'
      ? branches.map((b) => b.id)
      : params.targetBranchIds.filter((id) => branches.some((b) => b.id === id));

  const affectedBranches: string[] = [];
  for (const bId of targetIds) {
    const current = await getBranchDepartmentsRawInDb(bId);
    const idx = current.findIndex((d) => d.id === params.department.id);
    const nextItem: BranchDepartmentConfigItem = {
      ...params.department,
      visible: params.visible !== undefined ? params.visible : params.department.visible !== false,
      enabled: params.department.enabled !== false,
      allowedBySuperAdmin: params.allowedBySuperAdmin !== false,
      updatedBy: params.actor.username,
      updatedAt: new Date().toISOString(),
    };
    const nextList = [...current];
    if (idx >= 0) {
      nextList[idx] = { ...nextList[idx], ...nextItem };
    } else {
      nextList.push({ ...nextItem, order: nextList.length + 1 });
    }
    await updateBranchDepartmentsGovernanceInDb({
      branchId: bId,
      departments: nextList,
      actor: params.actor,
      ipAddress: params.ipAddress,
    });
    affectedBranches.push(bId);
  }

  await recordAuditLog(
    params.actor.username,
    'DEPARTMENT_GENERALIZED',
    `تعميم القسم (${params.department.label}) على (${affectedBranches.length}) فرع بواسطة (${params.actor.username})`,
    params.ipAddress || '127.0.0.1',
    DEFAULT_BRANCH_ID,
    { username: params.actor.username, department: 'central_departments', operation: 'GENERALIZE_DEPT', recordId: params.department.id, result: 'SUCCESS' }
  ).catch(() => {});

  return { success: true, affectedBranches };
}

/**
 * نسخ إعدادات الأقسام (الإظهار/الإخفاء/الترتيب/الهيكل فقط) بين فرعين بدون نسخ أي بيانات تشغيلية أو مستخدمين
 */
export async function copyBranchDepartmentSettingsInDb(params: {
  actor: AppUser;
  sourceBranchId: string;
  targetBranchId: string;
  ipAddress?: string;
}): Promise<{ success: boolean; copiedDepartmentsCount?: number; error?: string }> {
  await ensureGovernanceSchemaAndSeeds();
  if (!params.sourceBranchId || !params.targetBranchId || params.sourceBranchId === params.targetBranchId) {
    return { success: false, error: 'يرجى اختيار فرع مصدر وفرع هدف مختلفين.' };
  }
  const sourceDepts = await getBranchDepartmentsRawInDb(params.sourceBranchId);
  const copied = cloneDefaultBranchDepartmentsStructure(sourceDepts).map((d) => ({
    ...d,
    updatedBy: params.actor.username,
    updatedAt: new Date().toISOString(),
  }));

  await updateBranchDepartmentsGovernanceInDb({
    branchId: params.targetBranchId,
    departments: copied,
    actor: params.actor,
    ipAddress: params.ipAddress,
  });

  await recordAuditLog(
    params.actor.username,
    'COPY_BRANCH_DEPARTMENTS',
    `نسخ إعدادات الأقسام (${copied.length} قسم — بدون بيانات أو مستخدمين) من فرع (${params.sourceBranchId}) إلى فرع (${params.targetBranchId})`,
    params.ipAddress || '127.0.0.1',
    params.targetBranchId,
    { username: params.actor.username, department: 'branch_departments', operation: 'COPY_DEPT_SETTINGS', recordId: `${params.sourceBranchId}->${params.targetBranchId}`, result: 'SUCCESS' }
  ).catch(() => {});

  return { success: true, copiedDepartmentsCount: copied.length };
}

/**
 * فحص سريع في الـ Backend لمنع الوصول المباشر للأقسام المخفية داخل الفرع
 */
export async function isDepartmentHiddenForBranchInDb(
  branchId: string,
  deptKeyOrGroupId: string
): Promise<boolean> {
  if (!deptKeyOrGroupId || deptKeyOrGroupId === 'shared' || deptKeyOrGroupId === 'super_admin') {
    return false;
  }
  const depts = await getBranchDepartmentsRawInDb(branchId || DEFAULT_BRANCH_ID);
  return !isDepartmentVisibleInBranchConfig(depts, deptKeyOrGroupId);
}

/**
 * نظرة عامة مركزية للوحة مدير النظام
 */
export async function getGovernanceOverviewInDb(actor: AppUser) {
  await ensureGovernanceSchemaAndSeeds();
  const [{ administrations, branches }, roles, centralDepartments, users] = await Promise.all([
    listAdministrationsWithBranchesInDb(),
    listRolesInDb(actor),
    listCentralDepartmentsInDb(),
    listUsersScopedInDb({ actor }),
  ]);

  const branchSummaries = await Promise.all(
    branches.map(async (b) => {
      const depts = await getBranchDepartmentsRawInDb(b.id);
      const activeCount = depts.filter((d) => d.visible !== false && d.enabled !== false && d.allowedBySuperAdmin !== false).length;
      const hiddenCount = depts.length - activeCount;
      const usersCount = users.filter((u) => u.branchId === b.id).length;
      return {
        ...b,
        totalDepartments: depts.length,
        activeDepartments: activeCount,
        hiddenDepartments: hiddenCount,
        usersCount,
        departments: depts,
      };
    })
  );

  return {
    administrations,
    branches: branchSummaries,
    roles,
    centralDepartments,
    permissions: GRANULAR_PERMISSIONS_CATALOG,
    totalUsers: users.length,
  };
}

/**
 * تسجيل مستخدم جديد من بوابة الدخول (Self-Registration) مع التحقق الفعلي من الحفظ في قاعدة البيانات
 * وربطه بالفرع والإدارة والدور وجداول الصلاحيات (بدون السماح بتصعيد الصلاحيات)
 */
export async function registerSelfUserInDb(params: {
  branchId?: string;
  username: string;
  fullName: string;
  password: string;
  role?: string;
  jobTitle?: string;
  department?: string;
  phone?: string;
  applyToAllBranches?: boolean;
  isPrivilegedCaller?: boolean;
  actorUsername?: string;
  ipAddress?: string;
}): Promise<{ success: boolean; status?: number; user?: AppUser; resolvedBranchId?: string; error?: string }> {
  await ensureGovernanceSchemaAndSeeds();
  const [rolesList, { branches }] = await Promise.all([
    listRolesInDb(),
    listAdministrationsWithBranchesInDb(),
  ]);

  const username = normalizeDigits(String(params.username || '')).trim();
  const fullName = String(params.fullName || '').trim();
  const rawPassword = String(params.password || '').trim();
  const requestedRole = String(params.role || 'employee').trim() || 'employee';

  if (!username || username.length < 3 || !fullName || !rawPassword) {
    return {
      success: false,
      status: 400,
      error: 'يرجى إدخال الاسم الكامل واسم المستخدم (3 أحرف فأكثر) وكلمة المرور.',
    };
  }

  const complexity = validatePasswordComplexity(rawPassword);
  if (!complexity.valid) {
    return {
      success: false,
      status: 400,
      error: complexity.error || 'كلمة المرور يجب أن تتكون من 8 أحرف على الأقل وتشمل حروفاً وأرقاماً.',
    };
  }

  const privilegedRoles = new Set([
    'super_admin',
    'admin',
    'main_admin_manager',
    'supply_admin_manager',
    'branch_manager',
    'deputy_branch_manager',
    'system_officer',
  ]);

  if (privilegedRoles.has(requestedRole.toLowerCase()) && !params.isPrivilegedCaller) {
    return {
      success: false,
      status: 403,
      error: 'إنشاء حساب بصلاحية إدارية عليا مقتصر على مدير النظام أو مدير الفرع المعتمد من لوحة إدارة المستخدمين.',
    };
  }

  const allowedSelfRoles = new Set([
    'employee',
    'reader',
    'viewer',
    'data_entry',
    'inspector',
    'auditor',
    'supervisor',
    'department_officer',
    'custom_user',
  ]);
  const finalRole = params.isPrivilegedCaller
    ? requestedRole
    : allowedSelfRoles.has(requestedRole)
    ? requestedRole
    : 'employee';

  const requestedBranchId = String(params.branchId || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID;
  const targetBranch =
    branches.find((b) => b.id === requestedBranchId) ||
    branches.find((b) => b.id === DEFAULT_BRANCH_ID) ||
    branches[0];
  const resolvedBranchId = targetBranch?.id || DEFAULT_BRANCH_ID;
  const administrationId =
    targetBranch?.administrationId || resolveDefaultAdministrationIdForBranch(resolvedBranchId);

  const roleRecord = rolesList.find((r) => r.code === finalRole);
  const isSuper = Boolean(params.isPrivilegedCaller && (finalRole === 'super_admin' || finalRole === 'admin'));
  const isCentral = Boolean(params.isPrivilegedCaller && (params.applyToAllBranches || isSuper));
  const cleanUserLower = normalizeLoginIdentifier(username);

  const matrix = resolveUserDepartmentMatrix({
    id: 'tmp-register',
    username,
    fullName,
    role: finalRole,
    isSuperAdmin: isSuper,
    allowedDepartments: isSuper ? ['all'] : SYSTEM_DEPARTMENT_KEYS,
  });
  const allowedDepartments = isSuper
    ? (['all'] as any)
    : SYSTEM_DEPARTMENT_KEYS.filter((k) => Boolean(matrix[k]?.view));

  const newUserId = `u-${resolvedBranchId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const hashedPassword = hashPasswordScrypt(rawPassword);
  const nowIso = new Date().toISOString();
  const resolvedJobTitle =
    String(params.jobTitle || '').trim() ||
    roleRecord?.nameAr ||
    (finalRole === 'reader' ? 'قارئ فقط' : finalRole === 'viewer' ? 'مشاهد' : 'موظف منظومة');
  const resolvedDepartment =
    String(params.department || '').trim() ||
    targetBranch?.name ||
    'إدارة تموين مركز المحلة الكبرى';

  if (isPgFallbackMode()) {
    const store = getRawFallbackStore();
    const dup = (store.app_users || []).find(
      (u) =>
        normalizeLoginIdentifier(u.username) === cleanUserLower &&
        (u.branchId === resolvedBranchId || isCentral || isCentralUser(u))
    );
    if (dup) {
      return {
        success: false,
        status: 409,
        error: 'اسم المستخدم مسجل بالفعل. يرجى اختيار اسم مستخدم آخر.',
      };
    }

    const row: AppUser & { branchId: string; version: number } = {
      id: newUserId,
      branchId: resolvedBranchId,
      administrationId,
      username,
      fullName,
      password: hashedPassword,
      role: finalRole,
      isSuperAdmin: isSuper,
      isCentral,
      applyToAllBranches: isCentral,
      jobTitle: resolvedJobTitle,
      department: resolvedDepartment,
      phone: String(params.phone || '').trim(),
      gmailEmail: '',
      googleDriveAutoSync: false,
      customPermissions: [],
      allowedDepartments,
      departmentPermissions: matrix,
      isActive: true,
      notes: '',
      createdAt: nowIso,
      updatedAt: nowIso,
      updatedBy: params.actorUsername || username,
      version: 1,
    };

    store.app_users.push(row);
    saveRawFallbackStore(store);

    const verified = getRawFallbackStore().app_users.find((u) => u.id === newUserId);
    if (!verified) {
      return {
        success: false,
        status: 500,
        error: 'تعذر تأكيد حفظ المستخدم الجديد في قاعدة البيانات.',
      };
    }

    await recordAuditLog(
      params.actorUsername || username,
      'USER_REGISTERED',
      `تسجيل حساب جديد (${fullName} — ${username}) بدور (${resolvedJobTitle}) في فرع (${targetBranch?.name || resolvedBranchId})`,
      params.ipAddress || '127.0.0.1',
      resolvedBranchId,
      { username, department: 'auth', operation: 'REGISTER', recordId: newUserId, result: 'SUCCESS' }
    ).catch(() => {});

    return {
      success: true,
      user: enrichUserMeta(verified, branches, rolesList),
      resolvedBranchId,
    };
  }

  // PostgreSQL mode
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure branch exists in public.branches to satisfy FK
    await client
      .query(
        `INSERT INTO public.branches (id, name, governorate_title, directorate_title, administration_id, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE) ON CONFLICT (id) DO NOTHING`,
        [
          resolvedBranchId,
          targetBranch?.name || resolvedDepartment,
          targetBranch?.governorateTitle || 'محافظة الغربية',
          targetBranch?.directorateTitle || 'مديرية التموين والتجارة الداخلية بالغربية',
          administrationId,
        ]
      )
      .catch(() => {});

    const dupRes = await client.query(
      `SELECT id, branch_id, is_central FROM public.app_users WHERE LOWER(TRIM(username)) = $1`,
      [cleanUserLower]
    );
    const hasConflict = dupRes.rows.some(
      (r) => String(r.branch_id) === resolvedBranchId || isCentral || Boolean(r.is_central)
    );
    if (hasConflict) {
      await client.query('ROLLBACK');
      return {
        success: false,
        status: 409,
        error: 'اسم المستخدم مسجل بالفعل. يرجى اختيار اسم مستخدم آخر.',
      };
    }

    const encodedPerms: string[] = [
      ...allowedDepartments.map((d: string) => `__dept:${d}`),
      ...(isCentral ? ['__all_branches'] : []),
    ];

    const insertRes = await client.query(
      `INSERT INTO public.app_users (
        id, branch_id, administration_id, username, full_name, password_hash, role,
        job_title, department, phone, gmail_email, google_drive_auto_sync,
        custom_permissions, is_active, is_super_admin, is_central, notes,
        department_permissions, updated_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, '', FALSE,
        $11::jsonb, TRUE, $12, $13, '',
        $14::jsonb, $15
      ) RETURNING *`,
      [
        newUserId,
        resolvedBranchId,
        administrationId,
        username,
        fullName,
        hashedPassword,
        finalRole,
        resolvedJobTitle,
        resolvedDepartment,
        String(params.phone || '').trim(),
        JSON.stringify(encodedPerms),
        isSuper,
        isCentral,
        JSON.stringify(matrix),
        params.actorUsername || username,
      ]
    );

    if (insertRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        status: 500,
        error: 'تعذر تأكيد حفظ المستخدم الجديد في قاعدة البيانات.',
      };
    }

    await client
      .query(
        `INSERT INTO public.user_roles (id, user_id, role_code, branch_id, assigned_by)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id, role_code) DO UPDATE SET branch_id = EXCLUDED.branch_id`,
        [`ur_${newUserId}_${finalRole}`, newUserId, finalRole, resolvedBranchId, params.actorUsername || username]
      )
      .catch(() => {});

    await client
      .query(
        `INSERT INTO public.user_branches (id, user_id, branch_id, is_primary, assigned_by)
         VALUES ($1, $2, $3, TRUE, $4) ON CONFLICT (user_id, branch_id) DO NOTHING`,
        [`ub_${newUserId}_${resolvedBranchId}`, newUserId, resolvedBranchId, params.actorUsername || username]
      )
      .catch(() => {});

    for (const deptId of SYSTEM_DEPARTMENT_KEYS) {
      const f = matrix[deptId];
      await client
        .query(
          `INSERT INTO public.user_department_permissions (
            id, user_id, branch_id, department_id,
            can_view, can_enter, can_hide, can_insert, can_update, can_delete,
            can_approve, can_print, can_export, can_manage_users, can_assign_permissions, can_department_settings, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
          ON CONFLICT (user_id, department_id) DO UPDATE SET
            branch_id = EXCLUDED.branch_id,
            can_view = EXCLUDED.can_view,
            can_enter = EXCLUDED.can_enter,
            can_hide = EXCLUDED.can_hide,
            can_insert = EXCLUDED.can_insert,
            can_update = EXCLUDED.can_update,
            can_delete = EXCLUDED.can_delete,
            can_approve = EXCLUDED.can_approve,
            can_print = EXCLUDED.can_print,
            can_export = EXCLUDED.can_export,
            can_manage_users = EXCLUDED.can_manage_users,
            can_assign_permissions = EXCLUDED.can_assign_permissions,
            can_department_settings = EXCLUDED.can_department_settings,
            updated_at = NOW()`,
          [
            `udp_${newUserId}_${deptId}`,
            newUserId,
            resolvedBranchId,
            deptId,
            Boolean(f?.view),
            Boolean(f?.enter ?? f?.view),
            Boolean(f?.hide),
            Boolean(f?.insert),
            Boolean(f?.update),
            Boolean(f?.delete),
            Boolean(f?.approve),
            Boolean(f?.print),
            Boolean(f?.export),
            Boolean(f?.manageUsers),
            Boolean(f?.assignPermissions),
            Boolean(f?.departmentSettings),
          ]
        )
        .catch(() => {});
    }

    await client.query('COMMIT');

    await recordAuditLog(
      params.actorUsername || username,
      'USER_REGISTERED',
      `تسجيل حساب جديد (${fullName} — ${username}) بدور (${resolvedJobTitle}) في فرع (${targetBranch?.name || resolvedBranchId})`,
      params.ipAddress || '127.0.0.1',
      resolvedBranchId,
      { username, department: 'auth', operation: 'REGISTER', recordId: newUserId, result: 'SUCCESS' }
    ).catch(() => {});

    return {
      success: true,
      user: enrichUserMeta(mapDbUserToApp(insertRes.rows[0]), branches, rolesList),
      resolvedBranchId,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (isPostgresUnavailableError(err)) {
      setPgFallbackMode(true);
      return registerSelfUserInDb(params);
    }
    throw err;
  } finally {
    client.release();
  }
}
