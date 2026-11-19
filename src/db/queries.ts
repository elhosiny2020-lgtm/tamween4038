import { Pool } from 'pg';
import { pool } from './index.ts';
import type {
  Bakery,
  DebtRecord,
  VillageHierarchy,
  AppUser,
  DailyBakeryTask,
  InboxChatMessage,
  HighDebtAlertNotification,
  SystemConfig,
  SupplyBranch,
  ColumnTitles,
} from '../types.ts';
import {
  deduplicateSupplyBranches,
  normalizeBranchNameKey,
  resolveCanonicalBranchIdentity,
  markBranchDeleted,
  unmarkBranchDeleted,
  isBranchMarkedDeleted,
  CANONICAL_DEFAULT_BRANCHES,
  DEFAULT_VAULT_USERNAME,
  DEFAULT_VAULT_PASSCODE,
} from '../utils/branchVaultUtils.ts';
import {
  serializeTaskDescriptionWithMeta,
  parseTaskDescriptionWithMeta,
  scrubProtectedOwnerEmail,
  scrubProtectedOwnerEmailList,
} from '../utils/auditHelper.ts';

export const DEFAULT_BRANCH_ID = 'branch-mahalla';

export const DEFAULT_BRANCH_ROW: SupplyBranch = {
  id: DEFAULT_BRANCH_ID,
  name: 'إدارة تموين مركز المحلة الكبرى',
  governorateTitle: 'محافظة الغربية',
  directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
  description: 'الإدارة الرئيسية الافتراضية لمركز المحلة الكبرى',
  createdAt: new Date().toISOString(),
  isDefault: true,
};

export type NormalizedTableName =
  | 'branches'
  | 'villages'
  | 'bakeries'
  | 'debts'
  | 'app_users'
  | 'daily_tasks'
  | 'inbox_messages'
  | 'high_debt_alerts'
  | 'system_config'
  | 'dropdown_lists'
  | 'audit_logs';

export const ALLOWED_DB_TABLES = new Set<NormalizedTableName>([
  'branches',
  'villages',
  'bakeries',
  'debts',
  'app_users',
  'daily_tasks',
  'inbox_messages',
  'high_debt_alerts',
  'system_config',
  'dropdown_lists',
  'audit_logs',
]);

import {
  DEPARTMENT_SCOPES,
  SYSTEM_DEPARTMENT_KEYS,
  type DepartmentPermissionsMap,
} from '../types.ts';
import {
  hashPasswordScrypt,
  isScryptHash,
  normalizeDigits,
  sanitizeSystemConfigForClient,
  sanitizeUserForClient,
  verifyPasswordScrypt,
} from '../utils/serverAuth.ts';
import { resolveUserDepartmentMatrix } from '../utils/departmentRbac.ts';
import { INITIAL_USERS } from '../defaultData.ts';
import {
  fallbackAuthenticateUser,
  fallbackDeleteAuditLogs,
  fallbackDeleteRow,
  fallbackDeleteStorageFile,
  fallbackGetBootstrap,
  fallbackGetBranchModuleState,
  fallbackGetStorageFile,
  fallbackGetUserByIdAndBranch,
  fallbackListAuditDeletionSecurityLogs,
  fallbackListStorageFiles,
  fallbackPurgeAll,
  fallbackQueryTablePaginated,
  fallbackRecordAuditDeletionSecurityLog,
  fallbackResetNonMahallaBranches,
  fallbackSyncFullBranchState,
  fallbackSyncHighDebtAlerts,
  fallbackUpdateVaultCredentials,
  fallbackUpsertBranchModuleState,
  fallbackUpsertRow,
  fallbackUpsertStorageFile,
  fallbackVerifyVaultCredentials,
  isPostgresUnavailableError,
} from './fallbackStore.ts';

let schemaInitialized = false;
let schemaInitPromise: Promise<void> | null = null;
let pgFallbackMode = !process.env.SQL_HOST;

export async function ensurePostgresSchema(): Promise<void> {
  if (pgFallbackMode) return;
  if (schemaInitialized) return;
  if (schemaInitPromise) return schemaInitPromise;

  schemaInitPromise = (async () => {
    try {
      await pool.query(
        `INSERT INTO public.branches (id, name, governorate_title, directorate_title, description, is_default)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_default = TRUE`,
        [
          DEFAULT_BRANCH_ROW.id,
          DEFAULT_BRANCH_ROW.name,
          DEFAULT_BRANCH_ROW.governorateTitle,
          DEFAULT_BRANCH_ROW.directorateTitle,
          DEFAULT_BRANCH_ROW.description || '',
        ]
      );
      if (!isBranchMarkedDeleted('branch-samanoud', 'إدارة تموين سمنود')) {
        await pool.query(
          `INSERT INTO public.branches (id, name, governorate_title, directorate_title, description, is_default)
           VALUES ('branch-samanoud', 'إدارة تموين سمنود', 'محافظة الغربية', 'مديرية التموين والتجارة الداخلية بالغربية', 'الإدارة التموينية لمركز ومدينة سمنود (قاعدة بيانات مستقلة)', FALSE)
           ON CONFLICT (id) DO UPDATE SET name = 'إدارة تموين سمنود'`
        );
      }
      // Clean up any orphaned synthetic duplicate branch rows that have no bakeries/debts
      await pool.query(
        `DELETE FROM public.branches b
         WHERE b.id NOT IN ('branch-mahalla', 'branch-samanoud')
           AND (b.name ILIKE 'إدارة تموين (branch-%' OR b.name ILIKE '%المحلة الكبرى%' OR b.name ILIKE '%سمنود%')
           AND NOT EXISTS (SELECT 1 FROM public.bakeries bk WHERE bk.branch_id = b.id)
           AND NOT EXISTS (SELECT 1 FROM public.debts dt WHERE dt.branch_id = b.id)`
      );
      // Run DDL migrations using admin credentials when configured so app_user gets full tables & columns
      const adminUser = String(process.env.SQL_ADMIN_USER || '').trim();
      const adminPass = String(process.env.SQL_ADMIN_PASSWORD || '').trim();
      const appUser = String(process.env.SQL_USER || '').trim();
      let ddlPool: Pool = pool;
      let ownsDdlPool = false;
      if (adminUser && adminPass && process.env.SQL_HOST) {
        ddlPool = new Pool({
          host: process.env.SQL_HOST,
          port: Number(process.env.SQL_PORT || 5432),
          user: adminUser,
          password: adminPass,
          database: process.env.SQL_DB_NAME,
          max: 2,
          connectionTimeoutMillis: 10000,
        });
        ownsDdlPool = true;
      }

      try {
        await Promise.all([
          ddlPool
            .query(
              `CREATE TABLE IF NOT EXISTS public.branch_module_states (
                id TEXT PRIMARY KEY,
                branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
                module_key TEXT NOT NULL DEFAULT 'all_modules',
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                updated_by TEXT NOT NULL DEFAULT '',
                version INTEGER NOT NULL DEFAULT 1,
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT uq_branch_module_state UNIQUE (branch_id, module_key)
              )`
            )
            .catch(() => {}),
          ddlPool
            .query(
              `ALTER TABLE public.app_users
                 ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
                 ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE,
                 ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '',
                 ADD COLUMN IF NOT EXISTS department_permissions JSONB DEFAULT NULL`
            )
            .catch(() => {}),
          ddlPool
            .query(
              `CREATE TABLE IF NOT EXISTS public.app_departments (
                id TEXT PRIMARY KEY,
                name_ar TEXT NOT NULL,
                display_order INTEGER NOT NULL DEFAULT 1,
                created_at TIMESTAMPTZ DEFAULT NOW()
              )`
            )
            .catch(() => {}),
          ddlPool
            .query(
              `ALTER TABLE public.audit_logs
                 ADD COLUMN IF NOT EXISTS username TEXT DEFAULT '',
                 ADD COLUMN IF NOT EXISTS department TEXT DEFAULT '',
                 ADD COLUMN IF NOT EXISTS operation TEXT DEFAULT '',
                 ADD COLUMN IF NOT EXISTS record_id TEXT DEFAULT '',
                 ADD COLUMN IF NOT EXISTS result TEXT DEFAULT 'SUCCESS'`
            )
            .catch(() => {}),
          ddlPool
            .query(
              `CREATE TABLE IF NOT EXISTS public.audit_deletion_security_log (
                id TEXT PRIMARY KEY,
                branch_id TEXT NOT NULL DEFAULT 'branch-mahalla',
                deleted_by TEXT NOT NULL,
                deleted_by_full_name TEXT NOT NULL DEFAULT '',
                target_scope TEXT NOT NULL,
                deleted_count INTEGER NOT NULL DEFAULT 0,
                reason TEXT NOT NULL DEFAULT '',
                ip_address TEXT NOT NULL DEFAULT '127.0.0.1',
                created_at TIMESTAMPTZ DEFAULT NOW()
              )`
            )
            .catch(() => {}),
        ]);

        await Promise.all([
          ...SYSTEM_DEPARTMENT_KEYS.map((deptId, i) => {
            const scope = DEPARTMENT_SCOPES.find((d) => d.id === deptId);
            return ddlPool
              .query(
                `INSERT INTO public.app_departments (id, name_ar, display_order)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (id) DO UPDATE SET name_ar = EXCLUDED.name_ar, display_order = EXCLUDED.display_order`,
                [deptId, scope?.label || deptId, i + 1]
              )
              .catch(() => {});
          }),
          ddlPool
            .query(
              `CREATE TABLE IF NOT EXISTS public.user_department_permissions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
                branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
                department_id TEXT NOT NULL REFERENCES public.app_departments(id) ON DELETE CASCADE,
                can_view BOOLEAN NOT NULL DEFAULT FALSE,
                can_insert BOOLEAN NOT NULL DEFAULT FALSE,
                can_update BOOLEAN NOT NULL DEFAULT FALSE,
                can_delete BOOLEAN NOT NULL DEFAULT FALSE,
                can_print BOOLEAN NOT NULL DEFAULT FALSE,
                can_export BOOLEAN NOT NULL DEFAULT FALSE,
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT uq_user_dept_perm UNIQUE (user_id, department_id)
              )`
            )
            .catch(() => {}),
        ]);

        if (ownsDdlPool && /^[a-zA-Z0-9_]+$/.test(appUser)) {
          await ddlPool
            .query(
              `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${appUser}";
               GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${appUser}";`
            )
            .catch(() => {});
        }
      } finally {
        if (ownsDdlPool) {
          await ddlPool.end().catch(() => {});
        }
      }

      const isProd =
        process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start';
      const initialAdminPass = String(process.env.INITIAL_ADMIN_PASSWORD || '').trim();
      if (!isProd || initialAdminPass) {
        const hashedAdminPass = hashPasswordScrypt(initialAdminPass || 'admin');
        await pool
          .query(
            `INSERT INTO public.app_users (
              id, branch_id, username, full_name, password_hash, role, job_title, department, custom_permissions, is_active, is_super_admin
            )
            SELECT 'u-1__branch-mahalla', 'branch-mahalla', 'admin', 'مدير المنظومة التموينية', $1, 'admin', 'مدير عام النظام', 'إدارة تموين مركز المحلة الكبرى', '[]'::jsonb, TRUE, TRUE
            WHERE NOT EXISTS (
              SELECT 1 FROM public.app_users WHERE branch_id = 'branch-mahalla' AND lower(username) = 'admin'
            )
            ON CONFLICT (id) DO NOTHING`,
            [hashedAdminPass]
          )
          .catch(() => {});
      }
      // Auto-upgrade any legacy plaintext passwords stored in app_users to scrypt
      const legacyUsersRes = await pool
        .query(`SELECT id, password_hash FROM public.app_users`)
        .catch(() => ({ rows: [] as any[] }));
      await Promise.all(
        legacyUsersRes.rows
          .filter((row) => {
            const rawHash = String(row.password_hash || '');
            return rawHash && !isScryptHash(rawHash);
          })
          .map((row) =>
            pool
              .query(`UPDATE public.app_users SET password_hash = $1 WHERE id = $2`, [
                hashPasswordScrypt(String(row.password_hash || '')),
                row.id,
              ])
              .catch(() => {})
          )
      );
      schemaInitialized = true;
    } catch (err) {
      schemaInitPromise = null;
      if (isPostgresUnavailableError(err)) {
        pgFallbackMode = true;
        console.warn('PostgreSQL unavailable/unprivileged — using persistent server fallback store.');
        return;
      }
      console.error('Failed to ensure default branch in PostgreSQL:', err);
      throw err;
    }
  })();

  return schemaInitPromise;
}

// =========================================================================
// Row Mappers (Snake Case PG <-> Camel Case App Types)
// =========================================================================

export function mapDbBranchToApp(r: any): SupplyBranch & { version?: number } {
  return {
    id: String(r.id),
    name: String(r.name || ''),
    governorateTitle: String(r.governorate_title || 'محافظة الغربية'),
    directorateTitle: String(r.directorate_title || 'مديرية التموين والتجارة الداخلية بالغربية'),
    description: String(r.description || ''),
    isDefault: Boolean(r.is_default),
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    version: Number(r.version || 1),
  };
}

export function mapDbVillageToApp(r: any): VillageHierarchy & { id?: string; branchId?: string; version?: number } {
  return {
    id: String(r.id),
    branchId: String(r.branch_id || DEFAULT_BRANCH_ID),
    village: String(r.village || ''),
    localUnits: Array.isArray(r.local_units) ? r.local_units : [],
    version: Number(r.version || 1),
  };
}

export function mapDbBakeryToApp(r: any): Bakery & { branchId?: string; version?: number } {
  return {
    id: String(r.id),
    branchId: String(r.branch_id || DEFAULT_BRANCH_ID),
    bakeryOwnerName: String(r.bakery_owner_name || ''),
    machineNumber: String(r.machine_number || ''),
    village: String(r.village || ''),
    localUnit: String(r.local_unit || ''),
    responsibleManager: String(r.responsible_manager || ''),
    insuranceQuota: Number(r.insurance_quota || 0),
    actualQuota: Number(r.actual_quota || 0),
    insuranceValue: Number(r.insurance_value || 0),
    insuranceCheckNumber: String(r.insurance_check_number || ''),
    loavesCount: Number(r.loaves_count || 0),
    villagePopulation: Number(r.village_population || 0),
    perCapitaAverage: String(r.per_capita_average ?? '0'),
    beneficiaries2023: Number(r.beneficiaries_2023 || 0),
    avg2023: String(r.avg_2023 ?? '0'),
    beneficiaries2024: Number(r.beneficiaries_2024 || 0),
    avg2024: String(r.avg_2024 ?? '0'),
    beneficiaries2025: Number(r.beneficiaries_2025 || 0),
    avg2025: String(r.avg_2025 ?? '0'),
    avgDiff: String(r.avg_diff ?? '0'),
    activityStatus: String(r.activity_status || 'يعمل'),
    bakeryCategory: String(r.bakery_category || 'مخبز بلدي مدعم'),
    breadType: String(r.bread_type || 'بلدي مدعم'),
    flourBagPrice: Number(r.flour_bag_price || 0),
    breadTypeCount: String(r.bread_type_count || '660'),
    lineType: String(r.line_type || 'آلي كامل'),
    fuelType: String(r.fuel_type || 'غاز طبيعي'),
    phone: String(r.phone || ''),
    nationalId: String(r.national_id || ''),
    commercialRegNumber: String(r.commercial_reg_number || ''),
    commercialRegDate: String(r.commercial_reg_date || ''),
    bakeryLicenseNumber: String(r.bakery_license_number || ''),
    bakeryLicenseDate: String(r.bakery_license_date || ''),
    leaseContractType: String(r.lease_contract_type || ''),
    leaseAgreementDate: String(r.lease_agreement_date || ''),
    taxCardNumber: String(r.tax_card_number || ''),
    taxCardDate: String(r.tax_card_date || ''),
    notes: String(r.notes || ''),
    activityLog: Array.isArray(r.activity_log) ? r.activity_log : [],
    version: Number(r.version || 1),
  };
}

export function mapDbDebtToApp(r: any): DebtRecord & { branchId?: string; version?: number } {
  return {
    id: String(r.id),
    branchId: String(r.branch_id || DEFAULT_BRANCH_ID),
    bakeryId: String(r.bakery_id),
    bakeryOwnerName: String(r.bakery_owner_name || ''),
    machineNumber: String(r.machine_number || ''),
    village: String(r.village || ''),
    localUnit: String(r.local_unit || ''),
    violationDate: String(r.violation_date || ''),
    issuingEntity: String(r.issuing_entity || ''),
    violationType: String(r.violation_type || ''),
    violationAmount: Number(r.violation_amount || 0),
    oldViolations: Number(r.old_violations || 0),
    totalViolations: Number(r.total_violations || 0),
    violationPaymentDate: String(r.violation_payment_date || ''),
    violationReceiptNumber: String(r.violation_receipt_number || ''),
    violationPaymentMethod: String(r.violation_payment_method || 'كاش'),
    paidViolationAmount: Number(r.paid_violation_amount || 0),
    remainingViolations: Number(r.remaining_violations || 0),
    addedAmount: Number(r.added_amount || 0),
    addedPaymentDate: String(r.added_payment_date || ''),
    addedReceiptNumber: String(r.added_receipt_number || ''),
    addedPaymentMethod: String(r.added_payment_method || 'كاش'),
    paidAddedAmount: Number(r.paid_added_amount || 0),
    remainingAdded: Number(r.remaining_added || 0),
    disposalDate: String(r.disposal_date || ''),
    disposalBags: Number(r.disposal_bags || 0),
    disposalBagPrice: Number(r.disposal_bag_price || 0),
    disposalMultiplier: Number(r.disposal_multiplier || 1),
    disposalValue: Number(r.disposal_value || 0),
    disposalPaymentDate: String(r.disposal_payment_date || ''),
    disposalReceiptNumber: String(r.disposal_receipt_number || ''),
    disposalPaymentMethod: String(r.disposal_payment_method || 'كاش'),
    paidDisposalAmount: Number(r.paid_disposal_amount || 0),
    remainingDisposal: Number(r.remaining_disposal || 0),
    netRemainingDebt: Number(r.net_remaining_debt || 0),
    isScheduled: Boolean(r.is_scheduled),
    scheduleInstallmentsCount: Number(r.schedule_installments_count || 0),
    schedulePeriodType: String(r.schedule_period_type || 'شهري'),
    scheduleInstallmentValue: Number(r.schedule_installment_value || 0),
    scheduleStartDate: String(r.schedule_start_date || ''),
    schedulePaidInstallments: Number(r.schedule_paid_installments || 0),
    scheduleStatus: String(r.schedule_status || 'قيد التحصيل'),
    notes: String(r.notes || ''),
    version: Number(r.version || 1),
  };
}

export function mapDbUserToApp(r: any): AppUser & { version?: number } {
  const rawPerms: string[] = Array.isArray(r.custom_permissions) ? r.custom_permissions.map(String) : [];
  const deptScopes = rawPerms
    .filter((p) => p.startsWith('__dept:'))
    .map((p) => p.slice('__dept:'.length))
    .filter(Boolean);
  const applyAll = rawPerms.includes('__all_branches');
  const cleanPerms = rawPerms.filter((p) => !p.startsWith('__dept:') && p !== '__all_branches');
  const roleStr = String(r.role || 'inspector');
  const mapped: AppUser & { version?: number } = {
    id: String(r.id),
    branchId: String(r.branch_id || DEFAULT_BRANCH_ID),
    username: String(r.username || ''),
    fullName: String(r.full_name || ''),
    hasPassword: Boolean(r.password_hash),
    role: roleStr,
    jobTitle: String(r.job_title || ''),
    department: String(r.department || ''),
    phone: String(r.phone || ''),
    gmailEmail: scrubProtectedOwnerEmail(r.gmail_email),
    googleDriveAutoSync: Boolean(r.google_drive_auto_sync),
    customPermissions: Array.isArray(r.custom_permissions) ? (cleanPerms as any) : undefined,
    allowedDepartments: deptScopes.length > 0 ? (deptScopes as any) : undefined,
    departmentPermissions:
      r.department_permissions && typeof r.department_permissions === 'object'
        ? (r.department_permissions as DepartmentPermissionsMap)
        : undefined,
    applyToAllBranches: applyAll || undefined,
    isActive: r.is_active !== false,
    isSuperAdmin: Boolean(r.is_super_admin || roleStr === 'super_admin' || roleStr === 'admin'),
    notes: String(r.notes || ''),
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
    version: Number(r.version || 1),
  };
  return sanitizeUserForClient(mapped) as AppUser & { version?: number };
}

export function mapDbTaskToApp(r: any): DailyBakeryTask & { branchId?: string; version?: number } {
  const parsedMeta = parseTaskDescriptionWithMeta(r.description, r);
  return {
    id: String(r.id),
    branchId: String(r.branch_id || DEFAULT_BRANCH_ID),
    title: String(r.title || ''),
    description: parsedMeta.cleanDescription,
    bakeryId: r.bakery_id ? String(r.bakery_id) : undefined,
    bakeryName: r.bakery_name ? String(r.bakery_name) : undefined,
    village: r.village ? String(r.village) : undefined,
    priority: (r.priority || 'medium') as DailyBakeryTask['priority'],
    dueDate: String(r.due_date || ''),
    status: (r.status || 'pending') as DailyBakeryTask['status'],
    assignedTo: r.assigned_to ? String(r.assigned_to) : undefined,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    taskType: parsedMeta.taskType,
    showOnWelcomeDashboard: parsedMeta.showOnWelcomeDashboard,
    welcomeReminderDate: parsedMeta.welcomeReminderDate || undefined,
    version: Number(r.version || 1),
  };
}

export function mapDbInboxToApp(r: any): InboxChatMessage & { branchId?: string; version?: number } {
  return {
    id: String(r.id),
    branchId: String(r.branch_id || DEFAULT_BRANCH_ID),
    senderId: String(r.sender_id || ''),
    senderName: String(r.sender_name || ''),
    senderRole: String(r.sender_role || 'inspector'),
    recipientTarget: String(r.recipient_target || 'ALL'),
    recipientLabel: String(r.recipient_label || 'الجميع'),
    messageType: (r.message_type || 'instruction') as InboxChatMessage['messageType'],
    content: String(r.content || ''),
    relatedBakeryId: r.related_bakery_id ? String(r.related_bakery_id) : undefined,
    relatedBakeryName: r.related_bakery_name ? String(r.related_bakery_name) : undefined,
    readBy: Array.isArray(r.read_by) ? r.read_by : [],
    timestamp: String(r.timestamp || new Date().toISOString()),
    version: Number(r.version || 1),
  };
}

export function mapDbAlertToApp(r: any): HighDebtAlertNotification & { version?: number } {
  return {
    id: String(r.id),
    branchId: String(r.branch_id || DEFAULT_BRANCH_ID),
    bakeryId: String(r.bakery_id || ''),
    bakeryOwnerName: String(r.bakery_owner_name || ''),
    machineNumber: String(r.machine_number || ''),
    village: String(r.village || ''),
    debtAmount: Number(r.debt_amount || 0),
    thresholdUsed: Number(r.threshold_used || 50000),
    editedBy: String(r.edited_by || ''),
    editorRole: String(r.editor_role || ''),
    actionType: (r.action_type || 'HIGH_DEBT_SURGE') as HighDebtAlertNotification['actionType'],
    isRead: Boolean(r.is_read),
    notes: String(r.notes || ''),
    createdAtIso: String(r.created_at_iso || ''),
    timestamp: r.created_at_iso || (r.created_at ? new Date(r.created_at).toLocaleString('ar-EG') : ''),
    version: Number(r.version || 1),
  };
}

export function mapDbRowByTable(table: NormalizedTableName, row: any): any {
  switch (table) {
    case 'branches':
      return mapDbBranchToApp(row);
    case 'villages':
      return mapDbVillageToApp(row);
    case 'bakeries':
      return mapDbBakeryToApp(row);
    case 'debts':
      return mapDbDebtToApp(row);
    case 'app_users':
      return mapDbUserToApp(row);
    case 'daily_tasks':
      return mapDbTaskToApp(row);
    case 'inbox_messages':
      return mapDbInboxToApp(row);
    case 'high_debt_alerts':
      return mapDbAlertToApp(row);
    case 'system_config':
      return {
        branchId: String(row.branch_id || DEFAULT_BRANCH_ID),
        systemConfig: sanitizeSystemConfigForClient({
          governorateTitle: String(row.governorate_title || ''),
          directorateTitle: String(row.directorate_title || ''),
          administrationTitle: String(row.administration_title || ''),
          englishSubtitle: String(row.english_subtitle || ''),
          logoBase64: String(row.logo_base64 || ''),
          debtAlertThreshold: Number(row.debt_alert_threshold || 50000),
          dailyAlertConfig: row.daily_alert_config
            ? {
                ...row.daily_alert_config,
                supervisorEmailRecipients: scrubProtectedOwnerEmailList(
                  row.daily_alert_config.supervisorEmailRecipients
                ),
              }
            : undefined,
          rolePermissions: row.role_permissions || undefined,
          roleLabels: row.role_labels || undefined,
          customRoles: Array.isArray(row.custom_roles) ? row.custom_roles : undefined,
        } as SystemConfig),
        columnTitles: (row.column_titles || {}) as Partial<ColumnTitles>,
        activityStatuses: Array.isArray(row.activity_statuses) ? row.activity_statuses : [],
        version: Number(row.version || 1),
      };
    case 'dropdown_lists':
      return {
        id: String(row.id),
        branchId: String(row.branch_id || DEFAULT_BRANCH_ID),
        listKey: String(row.list_key || ''),
        options: Array.isArray(row.options) ? row.options : [],
        version: Number(row.version || 1),
      };
    case 'audit_logs':
      return {
        id: String(row.id),
        branchId: String(row.branch_id || DEFAULT_BRANCH_ID),
        userEmail: String(row.user_email || ''),
        username: String(row.username || row.user_email || ''),
        department: String(row.department || ''),
        operation: String(row.operation || row.action || ''),
        recordId: String(row.record_id || ''),
        result: String(row.result || 'SUCCESS'),
        action: String(row.action || ''),
        details: String(row.details || ''),
        ipAddress: String(row.ip_address || ''),
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      };
    default:
      return row;
  }
}

// =========================================================================
// Full Branch Bootstrap & Paginated Queries
// =========================================================================

export interface PostgresBootstrapResult {
  branchId: string;
  branches: SupplyBranch[];
  villages: VillageHierarchy[];
  bakeries: Bakery[];
  debts: DebtRecord[];
  users: AppUser[];
  dailyTasks: DailyBakeryTask[];
  inboxMessages: InboxChatMessage[];
  highDebtAlerts: HighDebtAlertNotification[];
  systemConfig: SystemConfig | null;
  columnTitles: Partial<ColumnTitles> | null;
  activityStatuses: string[];
  dropdownLists: Record<string, string[]>;
  hasAnyRows: boolean;
}

export async function getBootstrapFromPostgres(requestedBranchId = DEFAULT_BRANCH_ID): Promise<PostgresBootstrapResult> {
  await ensurePostgresSchema();
  if (pgFallbackMode) {
    return fallbackGetBootstrap(requestedBranchId);
  }
  const branchId = requestedBranchId || DEFAULT_BRANCH_ID;
  try {
    const [
      branchesRes,
      villagesRes,
      bakeriesRes,
      debtsRes,
      usersRes,
      tasksRes,
      inboxRes,
      alertsRes,
      cfgRes,
      listsRes,
      totalCountRes,
    ] = await Promise.all([
      pool.query(`SELECT * FROM public.branches ORDER BY is_default DESC, created_at ASC`),
      pool.query(`SELECT * FROM public.villages WHERE branch_id = $1 ORDER BY village ASC`, [branchId]),
      pool.query(`SELECT * FROM public.bakeries WHERE branch_id = $1 ORDER BY created_at ASC, id ASC`, [branchId]),
      pool.query(`SELECT * FROM public.debts WHERE branch_id = $1 ORDER BY created_at DESC, id ASC`, [branchId]),
      pool.query(`SELECT * FROM public.app_users WHERE branch_id = $1 ORDER BY created_at ASC`, [branchId]),
      pool.query(`SELECT * FROM public.daily_tasks WHERE branch_id = $1 ORDER BY due_date ASC, created_at DESC`, [branchId]),
      pool.query(`SELECT * FROM public.inbox_messages WHERE branch_id = $1 ORDER BY created_at ASC`, [branchId]),
      pool.query(`SELECT * FROM public.high_debt_alerts WHERE branch_id = $1 ORDER BY created_at DESC LIMIT 250`, [branchId]),
      pool.query(`SELECT * FROM public.system_config WHERE branch_id = $1`, [branchId]),
      pool.query(`SELECT * FROM public.dropdown_lists WHERE branch_id = $1`, [branchId]),
      pool.query(`
        SELECT (
          (SELECT count(*)::int FROM public.bakeries) +
          (SELECT count(*)::int FROM public.debts) +
          (SELECT count(*)::int FROM public.villages) +
          (SELECT count(*)::int FROM public.app_users) +
          (SELECT count(*)::int FROM public.daily_tasks) +
          (SELECT count(*)::int FROM public.inbox_messages)
        )::int AS total
      `),
    ]);

    const dropdownLists: Record<string, string[]> = {};
    for (const r of listsRes.rows) {
      if (r.list_key && Array.isArray(r.options)) {
        dropdownLists[String(r.list_key)] = r.options.map(String);
      }
    }

    const cfgRow = cfgRes.rows[0];
    const mappedCfg = cfgRow ? mapDbRowByTable('system_config', cfgRow) : null;

    return {
      branchId,
      branches: deduplicateSupplyBranches(branchesRes.rows.map(mapDbBranchToApp)),
      villages: villagesRes.rows.map((r) => ({
        village: String(r.village),
        localUnits: Array.isArray(r.local_units) ? r.local_units : [],
      })),
      bakeries: bakeriesRes.rows.map(mapDbBakeryToApp),
      debts: debtsRes.rows.map(mapDbDebtToApp),
      users: usersRes.rows.map(mapDbUserToApp),
      dailyTasks: tasksRes.rows.map(mapDbTaskToApp),
      inboxMessages: inboxRes.rows.map(mapDbInboxToApp),
      highDebtAlerts: alertsRes.rows.map(mapDbAlertToApp),
      systemConfig: mappedCfg?.systemConfig || null,
      columnTitles: mappedCfg?.columnTitles || null,
      activityStatuses: mappedCfg?.activityStatuses || [],
      dropdownLists,
      hasAnyRows: (totalCountRes.rows[0]?.total || 0) > 0,
    };
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      pgFallbackMode = true;
      return fallbackGetBootstrap(requestedBranchId);
    }
    throw err;
  }
}

export async function queryTablePaginated(
  table: NormalizedTableName,
  options: {
    branchId?: string;
    search?: string;
    village?: string;
    localUnit?: string;
    activityStatus?: string;
    bakeryId?: string;
    status?: string;
    priority?: string;
    page?: number;
    pageSize?: number;
  }
) {
  await ensurePostgresSchema();
  if (pgFallbackMode) {
    return fallbackQueryTablePaginated(table, options);
  }
  const branchId = options.branchId || DEFAULT_BRANCH_ID;
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.min(1000, Math.max(1, Number(options.pageSize || 100)));
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: any[] = [];
  const pushParam = (val: any) => {
    params.push(val);
    return `$${params.length}`;
  };

  if (table !== 'branches' && !(table === 'audit_logs' && options.branchId === 'ALL')) {
    conditions.push(`branch_id = ${pushParam(branchId)}`);
  }

  if (table === 'bakeries') {
    if (options.village && options.village !== 'الكل') {
      conditions.push(`village = ${pushParam(options.village)}`);
    }
    if (options.localUnit && options.localUnit !== 'الكل') {
      conditions.push(`local_unit = ${pushParam(options.localUnit)}`);
    }
    if (options.activityStatus && options.activityStatus !== 'الكل') {
      conditions.push(`activity_status = ${pushParam(options.activityStatus)}`);
    }
    if (options.search?.trim()) {
      const q = `%${options.search.trim()}%`;
      const p = pushParam(q);
      conditions.push(
        `(bakery_owner_name ILIKE ${p} OR machine_number ILIKE ${p} OR village ILIKE ${p} OR local_unit ILIKE ${p} OR phone ILIKE ${p} OR national_id ILIKE ${p})`
      );
    }
  } else if (table === 'debts') {
    if (options.bakeryId) {
      conditions.push(`bakery_id = ${pushParam(options.bakeryId)}`);
    }
    if (options.village && options.village !== 'الكل') {
      conditions.push(`village = ${pushParam(options.village)}`);
    }
    if (options.search?.trim()) {
      const q = `%${options.search.trim()}%`;
      const p = pushParam(q);
      conditions.push(
        `(bakery_owner_name ILIKE ${p} OR machine_number ILIKE ${p} OR village ILIKE ${p} OR violation_type ILIKE ${p} OR notes ILIKE ${p})`
      );
    }
  } else if (table === 'daily_tasks') {
    if (options.status && options.status !== 'all') {
      conditions.push(`status = ${pushParam(options.status)}`);
    }
    if (options.priority && options.priority !== 'all') {
      conditions.push(`priority = ${pushParam(options.priority)}`);
    }
    if (options.search?.trim()) {
      const q = `%${options.search.trim()}%`;
      const p = pushParam(q);
      conditions.push(`(title ILIKE ${p} OR description ILIKE ${p} OR bakery_name ILIKE ${p} OR village ILIKE ${p})`);
    }
  } else if (table === 'audit_logs') {
    if (options.status && options.status !== 'all') {
      if (options.status === 'SUCCESS') {
        conditions.push(`result IN ('SUCCESS', 'ALLOWED')`);
      } else {
        conditions.push(`result = ${pushParam(options.status)}`);
      }
    }
    if (options.search?.trim()) {
      const q = `%${options.search.trim()}%`;
      const p = pushParam(q);
      conditions.push(
        `(user_email ILIKE ${p} OR COALESCE(username, '') ILIKE ${p} OR COALESCE(department, '') ILIKE ${p} OR action ILIKE ${p} OR details ILIKE ${p} OR COALESCE(ip_address, '') ILIKE ${p})`
      );
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const countRes = await pool.query(`SELECT count(*)::int AS total FROM public.${table} ${whereClause}`, params);
    const total = Number(countRes.rows[0]?.total || 0);

    const orderBy =
      table === 'system_config'
        ? 'ORDER BY branch_id ASC'
        : table === 'audit_logs'
        ? 'ORDER BY created_at DESC, id DESC'
        : 'ORDER BY updated_at DESC, id ASC';

    const limitParam = pushParam(pageSize);
    const offsetParam = pushParam(offset);
    const rowsRes = await pool.query(
      `SELECT * FROM public.${table} ${whereClause} ${orderBy} LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params
    );

    return {
      rows: rowsRes.rows.map((r) => mapDbRowByTable(table, r)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      pgFallbackMode = true;
      return fallbackQueryTablePaginated(table, options);
    }
    throw err;
  }
}

// =========================================================================
// Optimistic Concurrency Upsert & Delete per Normalized Table
// =========================================================================

export interface UpsertRowResult {
  success: boolean;
  conflict?: boolean;
  operation: 'INSERT' | 'UPDATE';
  row?: any;
  latestRow?: any;
  error?: string;
}

async function ensureBranchRecord(client: any, branchId: string, branchData?: Partial<SupplyBranch>) {
  if (branchId !== DEFAULT_BRANCH_ID && isBranchMarkedDeleted(branchId, branchData?.name)) {
    return;
  }
  const { canonicalId, canonicalName, isCanonicalDefault } = resolveCanonicalBranchIdentity(
    branchId,
    branchData?.name
  );
  if (branchId !== DEFAULT_BRANCH_ID && isBranchMarkedDeleted(canonicalId, canonicalName)) {
    return;
  }
  await client.query(
    `INSERT INTO public.branches (id, name, governorate_title, directorate_title, description, is_default)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [
      branchId || canonicalId,
      canonicalName,
      branchData?.governorateTitle || 'محافظة الغربية',
      branchData?.directorateTitle || 'مديرية التموين والتجارة الداخلية بالغربية',
      branchData?.description || '',
      branchId === DEFAULT_BRANCH_ID || isCanonicalDefault,
    ]
  );
}

export async function upsertRowWithClient(
  client: any,
  table: NormalizedTableName,
  branchId: string,
  payload: any,
  expectedVersion?: number
): Promise<UpsertRowResult> {
  const effectiveBranchId = String(payload?.branchId || payload?.branch_id || branchId || DEFAULT_BRANCH_ID);

  if (table !== 'branches') {
    await ensureBranchRecord(client, effectiveBranchId);
  }

  const pkColumn = table === 'system_config' ? 'branch_id' : 'id';
  const recordId =
    table === 'system_config'
      ? effectiveBranchId
      : table === 'villages'
      ? String(payload?.id || `${effectiveBranchId}__${payload?.village || ''}`)
      : table === 'dropdown_lists'
      ? String(payload?.id || `${effectiveBranchId}__${payload?.listKey || ''}`)
      : String(payload?.id || '');

  if (!recordId) {
    return { success: false, operation: 'INSERT', error: 'معرف السجل (id) مفقود.' };
  }

  // Row-level lock ensures serialized atomic updates without rejecting user edits on version drift
  const existingRes = await client.query(
    `SELECT * FROM public.${table} WHERE ${pkColumn} = $1 FOR UPDATE`,
    [recordId]
  );
  const exists = existingRes.rows.length > 0;
  const existingRow = exists ? existingRes.rows[0] : null;
  void expectedVersion;

  const operation: 'INSERT' | 'UPDATE' = exists ? 'UPDATE' : 'INSERT';
  let resultRow: any = null;

  switch (table) {
    case 'branches': {
      const { canonicalId, canonicalName, isCanonicalDefault } = resolveCanonicalBranchIdentity(
        recordId,
        payload.name
      );
      // Also check if another branch with the same normalized Arabic name already exists in DB
      const allBranchesRes = await client.query(`SELECT id, name FROM public.branches`);
      const targetNorm = normalizeBranchNameKey(canonicalName);
      const matchedExisting = allBranchesRes.rows.find(
        (r: any) => normalizeBranchNameKey(r.name) === targetNorm
      );
      const finalBranchId = matchedExisting ? String(matchedExisting.id) : canonicalId;

      const res = await client.query(
        `INSERT INTO public.branches (id, name, governorate_title, directorate_title, description, is_default)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           governorate_title = EXCLUDED.governorate_title,
           directorate_title = EXCLUDED.directorate_title,
           description = EXCLUDED.description,
           is_default = EXCLUDED.is_default,
           version = public.branches.version + 1,
           updated_at = NOW()
         RETURNING *`,
        [
          finalBranchId,
          canonicalName,
          String(payload.governorateTitle || 'محافظة الغربية'),
          String(payload.directorateTitle || 'مديرية التموين والتجارة الداخلية بالغربية'),
          String(payload.description || ''),
          Boolean(payload.isDefault || isCanonicalDefault),
        ]
      );
      resultRow = mapDbRowByTable('branches', res.rows[0]);
      break;
    }

    case 'villages': {
      const res = await client.query(
        `INSERT INTO public.villages (id, branch_id, village, local_units)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (branch_id, village) DO UPDATE SET
           local_units = EXCLUDED.local_units,
           version = public.villages.version + 1,
           updated_at = NOW()
         RETURNING *`,
        [
          recordId,
          effectiveBranchId,
          String(payload.village || ''),
          JSON.stringify(Array.isArray(payload.localUnits) ? payload.localUnits : []),
        ]
      );
      resultRow = mapDbRowByTable('villages', res.rows[0]);
      break;
    }

    case 'bakeries': {
      const b = payload as Bakery;
      const cleanMachine = String(b.machineNumber || '').trim();
      if (cleanMachine) {
        const dupMachineRes = await client.query(
          `SELECT id, bakery_owner_name FROM public.bakeries
           WHERE branch_id = $1 AND machine_number = $2 AND id <> $3
           LIMIT 1 FOR UPDATE`,
          [effectiveBranchId, cleanMachine, recordId]
        );
        if (dupMachineRes.rows.length > 0) {
          return {
            success: false,
            operation,
            error: `رقم الماكينة (${cleanMachine}) مسجل بالفعل لمخبز آخر (${dupMachineRes.rows[0].bakery_owner_name}) في نفس الإدارة.`,
          };
        }
      }
      const res = await client.query(
        `INSERT INTO public.bakeries (
          id, branch_id, bakery_owner_name, machine_number, village, local_unit, responsible_manager,
          insurance_quota, actual_quota, insurance_value, insurance_check_number, loaves_count,
          village_population, per_capita_average, beneficiaries_2023, avg_2023,
          beneficiaries_2024, avg_2024, beneficiaries_2025, avg_2025, avg_diff,
          activity_status, bakery_category, bread_type, flour_bag_price, bread_type_count,
          line_type, fuel_type, phone, national_id, commercial_reg_number, commercial_reg_date,
          bakery_license_number, bakery_license_date, lease_contract_type, lease_agreement_date,
          tax_card_number, tax_card_date, notes, activity_log
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12,
          $13, $14, $15, $16,
          $17, $18, $19, $20, $21,
          $22, $23, $24, $25, $26,
          $27, $28, $29, $30, $31, $32,
          $33, $34, $35, $36,
          $37, $38, $39, $40::jsonb
        )
        ON CONFLICT (id) DO UPDATE SET
          branch_id = EXCLUDED.branch_id,
          bakery_owner_name = EXCLUDED.bakery_owner_name,
          machine_number = EXCLUDED.machine_number,
          village = EXCLUDED.village,
          local_unit = EXCLUDED.local_unit,
          responsible_manager = EXCLUDED.responsible_manager,
          insurance_quota = EXCLUDED.insurance_quota,
          actual_quota = EXCLUDED.actual_quota,
          insurance_value = EXCLUDED.insurance_value,
          insurance_check_number = EXCLUDED.insurance_check_number,
          loaves_count = EXCLUDED.loaves_count,
          village_population = EXCLUDED.village_population,
          per_capita_average = EXCLUDED.per_capita_average,
          beneficiaries_2023 = EXCLUDED.beneficiaries_2023,
          avg_2023 = EXCLUDED.avg_2023,
          beneficiaries_2024 = EXCLUDED.beneficiaries_2024,
          avg_2024 = EXCLUDED.avg_2024,
          beneficiaries_2025 = EXCLUDED.beneficiaries_2025,
          avg_2025 = EXCLUDED.avg_2025,
          avg_diff = EXCLUDED.avg_diff,
          activity_status = EXCLUDED.activity_status,
          bakery_category = EXCLUDED.bakery_category,
          bread_type = EXCLUDED.bread_type,
          flour_bag_price = EXCLUDED.flour_bag_price,
          bread_type_count = EXCLUDED.bread_type_count,
          line_type = EXCLUDED.line_type,
          fuel_type = EXCLUDED.fuel_type,
          phone = EXCLUDED.phone,
          national_id = EXCLUDED.national_id,
          commercial_reg_number = EXCLUDED.commercial_reg_number,
          commercial_reg_date = EXCLUDED.commercial_reg_date,
          bakery_license_number = EXCLUDED.bakery_license_number,
          bakery_license_date = EXCLUDED.bakery_license_date,
          lease_contract_type = EXCLUDED.lease_contract_type,
          lease_agreement_date = EXCLUDED.lease_agreement_date,
          tax_card_number = EXCLUDED.tax_card_number,
          tax_card_date = EXCLUDED.tax_card_date,
          notes = EXCLUDED.notes,
          activity_log = EXCLUDED.activity_log,
          version = public.bakeries.version + 1,
          updated_at = NOW()
        RETURNING *`,
        [
          recordId,
          effectiveBranchId,
          String(b.bakeryOwnerName || ''),
          String(b.machineNumber || ''),
          String(b.village || ''),
          String(b.localUnit || ''),
          String(b.responsibleManager || ''),
          Number(b.insuranceQuota || 0),
          Number(b.actualQuota || 0),
          Number(b.insuranceValue || 0),
          String(b.insuranceCheckNumber || ''),
          Number(b.loavesCount || 0),
          Math.round(Number(b.villagePopulation || 0)),
          String(b.perCapitaAverage ?? '0'),
          Math.round(Number(b.beneficiaries2023 || 0)),
          String(b.avg2023 ?? '0'),
          Math.round(Number(b.beneficiaries2024 || 0)),
          String(b.avg2024 ?? '0'),
          Math.round(Number(b.beneficiaries2025 || 0)),
          String(b.avg2025 ?? '0'),
          String(b.avgDiff ?? '0'),
          String(b.activityStatus || 'يعمل'),
          String(b.bakeryCategory || 'مخبز بلدي مدعم'),
          String(b.breadType || 'بلدي مدعم'),
          Number(b.flourBagPrice || 0),
          String(b.breadTypeCount || '660'),
          String(b.lineType || 'آلي كامل'),
          String(b.fuelType || 'غاز طبيعي'),
          String(b.phone || ''),
          String(b.nationalId || ''),
          String(b.commercialRegNumber || ''),
          String(b.commercialRegDate || ''),
          String(b.bakeryLicenseNumber || ''),
          String(b.bakeryLicenseDate || ''),
          String(b.leaseContractType || ''),
          String(b.leaseAgreementDate || ''),
          String(b.taxCardNumber || ''),
          String(b.taxCardDate || ''),
          String(b.notes || ''),
          JSON.stringify(Array.isArray(b.activityLog) ? b.activityLog : []),
        ]
      );
      resultRow = mapDbRowByTable('bakeries', res.rows[0]);
      break;
    }

    case 'debts': {
      const d = payload as DebtRecord;
      const res = await client.query(
        `INSERT INTO public.debts (
          id, branch_id, bakery_id, bakery_owner_name, machine_number, village, local_unit,
          violation_date, issuing_entity, violation_type, violation_amount, old_violations, total_violations,
          violation_payment_date, violation_receipt_number, violation_payment_method, paid_violation_amount, remaining_violations,
          added_amount, added_payment_date, added_receipt_number, added_payment_method, paid_added_amount, remaining_added,
          disposal_date, disposal_bags, disposal_bag_price, disposal_multiplier, disposal_value,
          disposal_payment_date, disposal_receipt_number, disposal_payment_method, paid_disposal_amount, remaining_disposal,
          net_remaining_debt, is_scheduled, schedule_installments_count, schedule_period_type,
          schedule_installment_value, schedule_start_date, schedule_paid_installments, schedule_status, notes
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18,
          $19, $20, $21, $22, $23, $24,
          $25, $26, $27, $28, $29,
          $30, $31, $32, $33, $34,
          $35, $36, $37, $38,
          $39, $40, $41, $42, $43
        )
        ON CONFLICT (id) DO UPDATE SET
          branch_id = EXCLUDED.branch_id,
          bakery_id = EXCLUDED.bakery_id,
          bakery_owner_name = EXCLUDED.bakery_owner_name,
          machine_number = EXCLUDED.machine_number,
          village = EXCLUDED.village,
          local_unit = EXCLUDED.local_unit,
          violation_date = EXCLUDED.violation_date,
          issuing_entity = EXCLUDED.issuing_entity,
          violation_type = EXCLUDED.violation_type,
          violation_amount = EXCLUDED.violation_amount,
          old_violations = EXCLUDED.old_violations,
          total_violations = EXCLUDED.total_violations,
          violation_payment_date = EXCLUDED.violation_payment_date,
          violation_receipt_number = EXCLUDED.violation_receipt_number,
          violation_payment_method = EXCLUDED.violation_payment_method,
          paid_violation_amount = EXCLUDED.paid_violation_amount,
          remaining_violations = EXCLUDED.remaining_violations,
          added_amount = EXCLUDED.added_amount,
          added_payment_date = EXCLUDED.added_payment_date,
          added_receipt_number = EXCLUDED.added_receipt_number,
          added_payment_method = EXCLUDED.added_payment_method,
          paid_added_amount = EXCLUDED.paid_added_amount,
          remaining_added = EXCLUDED.remaining_added,
          disposal_date = EXCLUDED.disposal_date,
          disposal_bags = EXCLUDED.disposal_bags,
          disposal_bag_price = EXCLUDED.disposal_bag_price,
          disposal_multiplier = EXCLUDED.disposal_multiplier,
          disposal_value = EXCLUDED.disposal_value,
          disposal_payment_date = EXCLUDED.disposal_payment_date,
          disposal_receipt_number = EXCLUDED.disposal_receipt_number,
          disposal_payment_method = EXCLUDED.disposal_payment_method,
          paid_disposal_amount = EXCLUDED.paid_disposal_amount,
          remaining_disposal = EXCLUDED.remaining_disposal,
          net_remaining_debt = EXCLUDED.net_remaining_debt,
          is_scheduled = EXCLUDED.is_scheduled,
          schedule_installments_count = EXCLUDED.schedule_installments_count,
          schedule_period_type = EXCLUDED.schedule_period_type,
          schedule_installment_value = EXCLUDED.schedule_installment_value,
          schedule_start_date = EXCLUDED.schedule_start_date,
          schedule_paid_installments = EXCLUDED.schedule_paid_installments,
          schedule_status = EXCLUDED.schedule_status,
          notes = EXCLUDED.notes,
          version = public.debts.version + 1,
          updated_at = NOW()
        RETURNING *`,
        [
          recordId,
          effectiveBranchId,
          String(d.bakeryId || ''),
          String(d.bakeryOwnerName || ''),
          String(d.machineNumber || ''),
          String(d.village || ''),
          String(d.localUnit || ''),
          String(d.violationDate || ''),
          String(d.issuingEntity || ''),
          String(d.violationType || ''),
          Number(d.violationAmount || 0),
          Number(d.oldViolations || 0),
          Number(d.totalViolations || 0),
          String(d.violationPaymentDate || ''),
          String(d.violationReceiptNumber || ''),
          String(d.violationPaymentMethod || 'كاش'),
          Number(d.paidViolationAmount || 0),
          Number(d.remainingViolations || 0),
          Number(d.addedAmount || 0),
          String(d.addedPaymentDate || ''),
          String(d.addedReceiptNumber || ''),
          String(d.addedPaymentMethod || 'كاش'),
          Number(d.paidAddedAmount || 0),
          Number(d.remainingAdded || 0),
          String(d.disposalDate || ''),
          Number(d.disposalBags || 0),
          Number(d.disposalBagPrice || 0),
          Number(d.disposalMultiplier || 1),
          Number(d.disposalValue || 0),
          String(d.disposalPaymentDate || ''),
          String(d.disposalReceiptNumber || ''),
          String(d.disposalPaymentMethod || 'كاش'),
          Number(d.paidDisposalAmount || 0),
          Number(d.remainingDisposal || 0),
          Number(d.netRemainingDebt || 0),
          Boolean(d.isScheduled),
          Math.round(Number(d.scheduleInstallmentsCount || 0)),
          String(d.schedulePeriodType || 'شهري'),
          Number(d.scheduleInstallmentValue || 0),
          String(d.scheduleStartDate || ''),
          Math.round(Number(d.schedulePaidInstallments || 0)),
          String(d.scheduleStatus || 'قيد التحصيل'),
          String(d.notes || ''),
        ]
      );
      resultRow = mapDbRowByTable('debts', res.rows[0]);
      break;
    }

    case 'app_users': {
      const u = payload as AppUser;
      const cleanUsername = String(u.username || '').trim();
      let effectiveUserId = recordId;
      let existingUserRow: any = null;
      if (cleanUsername) {
        const existingByUsername = await client.query(
          `SELECT * FROM public.app_users
           WHERE branch_id = $1 AND lower(username) = lower($2)
           LIMIT 1 FOR UPDATE`,
          [effectiveBranchId, cleanUsername]
        );
        if (existingByUsername.rows.length > 0) {
          effectiveUserId = String(existingByUsername.rows[0].id);
          existingUserRow = existingByUsername.rows[0];
        } else {
          const existingIdRow = await client.query(
            `SELECT * FROM public.app_users WHERE id = $1 LIMIT 1 FOR UPDATE`,
            [effectiveUserId]
          );
          if (existingIdRow.rows.length > 0) {
            if (String(existingIdRow.rows[0].branch_id) !== effectiveBranchId) {
              effectiveUserId = `${recordId}__${effectiveBranchId}`;
            } else {
              existingUserRow = existingIdRow.rows[0];
            }
          }
        }
      } else {
        const existingIdRow = await client.query(
          `SELECT * FROM public.app_users WHERE id = $1 LIMIT 1 FOR UPDATE`,
          [effectiveUserId]
        );
        if (existingIdRow.rows.length > 0) {
          if (String(existingIdRow.rows[0].branch_id) !== effectiveBranchId) {
            effectiveUserId = `${recordId}__${effectiveBranchId}`;
          } else {
            existingUserRow = existingIdRow.rows[0];
          }
        }
      }
      const incomingPassword = typeof u.password === 'string' ? u.password.trim() : '';
      const passwordHashToSave = incomingPassword
        ? isScryptHash(incomingPassword)
          ? incomingPassword
          : hashPasswordScrypt(incomingPassword)
        : existingUserRow?.password_hash
        ? String(existingUserRow.password_hash)
        : '';
      const resolvedRole = String(u.role || existingUserRow?.role || 'inspector');
      const isSuper = Boolean(
        u.isSuperAdmin !== undefined
          ? u.isSuperAdmin
          : resolvedRole === 'super_admin' || resolvedRole === 'admin'
      );
      const isActive = u.isActive !== undefined ? Boolean(u.isActive) : existingUserRow?.is_active !== false;
      const matrix = resolveUserDepartmentMatrix({
        ...u,
        role: resolvedRole,
        isSuperAdmin: isSuper,
      });
      const encodedPerms: string[] = [
        ...(Array.isArray(u.customPermissions)
          ? u.customPermissions.filter((p) => !String(p).startsWith('__dept:') && p !== '__all_branches')
          : []),
        ...(Array.isArray(u.allowedDepartments) ? u.allowedDepartments.map((d) => `__dept:${d}`) : []),
        ...(u.applyToAllBranches ? ['__all_branches'] : []),
      ];
      const res = await client.query(
        `INSERT INTO public.app_users (
          id, branch_id, username, full_name, password_hash, role, job_title, department,
          phone, gmail_email, gmail_password, google_drive_auto_sync, custom_permissions,
          is_active, is_super_admin, notes, department_permissions
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, $17::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          branch_id = EXCLUDED.branch_id,
          username = EXCLUDED.username,
          full_name = EXCLUDED.full_name,
          password_hash = CASE WHEN EXCLUDED.password_hash <> '' THEN EXCLUDED.password_hash ELSE public.app_users.password_hash END,
          role = EXCLUDED.role,
          job_title = EXCLUDED.job_title,
          department = EXCLUDED.department,
          phone = EXCLUDED.phone,
          gmail_email = EXCLUDED.gmail_email,
          gmail_password = CASE WHEN EXCLUDED.gmail_password <> '' THEN EXCLUDED.gmail_password ELSE public.app_users.gmail_password END,
          google_drive_auto_sync = EXCLUDED.google_drive_auto_sync,
          custom_permissions = EXCLUDED.custom_permissions,
          is_active = EXCLUDED.is_active,
          is_super_admin = EXCLUDED.is_super_admin,
          notes = EXCLUDED.notes,
          department_permissions = EXCLUDED.department_permissions,
          version = public.app_users.version + 1,
          updated_at = NOW()
        RETURNING *`,
        [
          effectiveUserId,
          effectiveBranchId,
          cleanUsername,
          String(u.fullName || ''),
          passwordHashToSave,
          resolvedRole,
          String(u.jobTitle || ''),
          String(u.department || ''),
          String(u.phone || ''),
          String(u.gmailEmail || ''),
          String(u.gmailPassword || ''),
          Boolean(u.googleDriveAutoSync),
          JSON.stringify(encodedPerms),
          isActive,
          isSuper,
          String(u.notes || ''),
          JSON.stringify(matrix),
        ]
      );
      for (const deptId of SYSTEM_DEPARTMENT_KEYS) {
        const flags = matrix[deptId];
        await client
          .query(
            `INSERT INTO public.user_department_permissions (
              id, user_id, branch_id, department_id,
              can_view, can_insert, can_update, can_delete, can_print, can_export, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            ON CONFLICT (user_id, department_id) DO UPDATE SET
              branch_id = EXCLUDED.branch_id,
              can_view = EXCLUDED.can_view,
              can_insert = EXCLUDED.can_insert,
              can_update = EXCLUDED.can_update,
              can_delete = EXCLUDED.can_delete,
              can_print = EXCLUDED.can_print,
              can_export = EXCLUDED.can_export,
              updated_at = NOW()`,
            [
              `${effectiveUserId}__${deptId}`,
              effectiveUserId,
              effectiveBranchId,
              deptId,
              Boolean(flags?.view),
              Boolean(flags?.insert),
              Boolean(flags?.update),
              Boolean(flags?.delete),
              Boolean(flags?.print),
              Boolean(flags?.export),
            ]
          )
          .catch(() => {});
      }
      resultRow = mapDbRowByTable('app_users', res.rows[0]);
      break;
    }

    case 'daily_tasks': {
      const t = payload as DailyBakeryTask;
      const res = await client.query(
        `INSERT INTO public.daily_tasks (
          id, branch_id, title, description, bakery_id, bakery_name, village, priority, due_date, status, assigned_to
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          bakery_id = EXCLUDED.bakery_id,
          bakery_name = EXCLUDED.bakery_name,
          village = EXCLUDED.village,
          priority = EXCLUDED.priority,
          due_date = EXCLUDED.due_date,
          status = EXCLUDED.status,
          assigned_to = EXCLUDED.assigned_to,
          version = public.daily_tasks.version + 1,
          updated_at = NOW()
        RETURNING *`,
        [
          recordId,
          effectiveBranchId,
          String(t.title || ''),
          serializeTaskDescriptionWithMeta(t),
          String(t.bakeryId || ''),
          String(t.bakeryName || ''),
          String(t.village || ''),
          String(t.priority || 'medium'),
          String(t.dueDate || ''),
          String(t.status || 'pending'),
          String(t.assignedTo || ''),
        ]
      );
      resultRow = mapDbRowByTable('daily_tasks', res.rows[0]);
      break;
    }

    case 'inbox_messages': {
      const m = payload as InboxChatMessage;
      const res = await client.query(
        `INSERT INTO public.inbox_messages (
          id, branch_id, sender_id, sender_name, sender_role, recipient_target, recipient_label,
          message_type, content, related_bakery_id, related_bakery_name, read_by, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
        ON CONFLICT (id) DO UPDATE SET
          recipient_target = EXCLUDED.recipient_target,
          recipient_label = EXCLUDED.recipient_label,
          message_type = EXCLUDED.message_type,
          content = EXCLUDED.content,
          read_by = EXCLUDED.read_by,
          timestamp = EXCLUDED.timestamp,
          version = public.inbox_messages.version + 1,
          updated_at = NOW()
        RETURNING *`,
        [
          recordId,
          effectiveBranchId,
          String(m.senderId || ''),
          String(m.senderName || ''),
          String(m.senderRole || 'inspector'),
          String(m.recipientTarget || 'ALL'),
          String(m.recipientLabel || 'الجميع'),
          String(m.messageType || 'instruction'),
          String(m.content || ''),
          String(m.relatedBakeryId || ''),
          String(m.relatedBakeryName || ''),
          JSON.stringify(Array.isArray(m.readBy) ? m.readBy : []),
          String(m.timestamp || new Date().toISOString()),
        ]
      );
      resultRow = mapDbRowByTable('inbox_messages', res.rows[0]);
      break;
    }

    case 'high_debt_alerts': {
      const a = payload as HighDebtAlertNotification;
      const res = await client.query(
        `INSERT INTO public.high_debt_alerts (
          id, branch_id, bakery_id, bakery_owner_name, machine_number, village,
          debt_amount, threshold_used, edited_by, editor_role, action_type, is_read, notes, created_at_iso
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE SET
          debt_amount = EXCLUDED.debt_amount,
          threshold_used = EXCLUDED.threshold_used,
          is_read = EXCLUDED.is_read,
          notes = EXCLUDED.notes,
          version = public.high_debt_alerts.version + 1,
          updated_at = NOW()
        RETURNING *`,
        [
          recordId,
          effectiveBranchId,
          String(a.bakeryId || ''),
          String(a.bakeryOwnerName || ''),
          String(a.machineNumber || ''),
          String(a.village || ''),
          Number(a.debtAmount || 0),
          Number(a.thresholdUsed || 50000),
          String(a.editedBy || ''),
          String(a.editorRole || ''),
          String(a.actionType || 'HIGH_DEBT_SURGE'),
          Boolean(a.isRead),
          String(a.notes || ''),
          String(a.createdAtIso || a.timestamp || new Date().toISOString()),
        ]
      );
      resultRow = mapDbRowByTable('high_debt_alerts', res.rows[0]);
      break;
    }

    case 'system_config': {
      const cfg = (payload.systemConfig || payload) as SystemConfig;
      const colTitles = payload.columnTitles || existingRow?.column_titles || {};
      const actStatuses = payload.activityStatuses || existingRow?.activity_statuses || [];
      const hashVaultPassIfPlain = (candidate: string | undefined, fallbackStored: string): string => {
        const raw = String(candidate || '').trim();
        if (!raw || raw === '••••••••') return fallbackStored;
        return isScryptHash(raw) ? raw : hashPasswordScrypt(raw);
      };
      const existingPass =
        existingRow?.daily_alert_config?.vaultPasscode ||
        existingRow?.vault_passcode ||
        hashPasswordScrypt(DEFAULT_VAULT_PASSCODE);
      const resolvedVaultPass = hashVaultPassIfPlain(cfg.vaultPasscode, existingPass);
      const rawCredMap =
        cfg.branchVaultCredentials && typeof cfg.branchVaultCredentials === 'object'
          ? cfg.branchVaultCredentials
          : existingRow?.daily_alert_config?.branchVaultCredentials;
      let resolvedCredMap: Record<string, any> | undefined = undefined;
      if (rawCredMap && typeof rawCredMap === 'object') {
        resolvedCredMap = {};
        for (const [bKey, cred] of Object.entries(rawCredMap)) {
          if (!cred || typeof cred !== 'object') continue;
          const prevCred = existingRow?.daily_alert_config?.branchVaultCredentials?.[bKey];
          const prevCredPass = prevCred?.password || resolvedVaultPass;
          resolvedCredMap[bKey] = {
            ...cred,
            username: normalizeDigits(
              String((cred as any).username || prevCred?.username || DEFAULT_VAULT_USERNAME)
            ),
            password: hashVaultPassIfPlain((cred as any).password, prevCredPass),
          };
        }
      }
      const mergedDailyAlertConfig = {
        ...(existingRow?.daily_alert_config || {}),
        ...(cfg.dailyAlertConfig || {}),
        vaultUsername: String(
          cfg.vaultUsername ??
            existingRow?.daily_alert_config?.vaultUsername ??
            DEFAULT_VAULT_USERNAME
        ),
        vaultPasscode: resolvedVaultPass,
        branchVaultCredentials: resolvedCredMap,
      };
      const res = await client.query(
        `INSERT INTO public.system_config (
          branch_id, governorate_title, directorate_title, administration_title, english_subtitle,
          logo_base64, debt_alert_threshold, daily_alert_config, role_permissions, role_labels,
          custom_roles, column_titles, activity_statuses
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb)
        ON CONFLICT (branch_id) DO UPDATE SET
          governorate_title = EXCLUDED.governorate_title,
          directorate_title = EXCLUDED.directorate_title,
          administration_title = EXCLUDED.administration_title,
          english_subtitle = EXCLUDED.english_subtitle,
          logo_base64 = EXCLUDED.logo_base64,
          debt_alert_threshold = EXCLUDED.debt_alert_threshold,
          daily_alert_config = EXCLUDED.daily_alert_config,
          role_permissions = EXCLUDED.role_permissions,
          role_labels = EXCLUDED.role_labels,
          custom_roles = EXCLUDED.custom_roles,
          column_titles = EXCLUDED.column_titles,
          activity_statuses = EXCLUDED.activity_statuses,
          version = public.system_config.version + 1,
          updated_at = NOW()
        RETURNING *`,
        [
          effectiveBranchId,
          String(cfg.governorateTitle ?? existingRow?.governorate_title ?? ''),
          String(cfg.directorateTitle ?? existingRow?.directorate_title ?? ''),
          String(cfg.administrationTitle ?? existingRow?.administration_title ?? ''),
          String(cfg.englishSubtitle ?? existingRow?.english_subtitle ?? ''),
          String(cfg.logoBase64 ?? existingRow?.logo_base64 ?? ''),
          Number(cfg.debtAlertThreshold ?? existingRow?.debt_alert_threshold ?? 50000),
          JSON.stringify(mergedDailyAlertConfig),
          JSON.stringify(cfg.rolePermissions ?? existingRow?.role_permissions ?? {}),
          JSON.stringify(cfg.roleLabels ?? existingRow?.role_labels ?? {}),
          JSON.stringify(cfg.customRoles ?? existingRow?.custom_roles ?? []),
          JSON.stringify(colTitles),
          JSON.stringify(Array.isArray(actStatuses) ? actStatuses : []),
        ]
      );
      resultRow = mapDbRowByTable('system_config', res.rows[0]);
      break;
    }

    case 'dropdown_lists': {
      const listKey = String(payload.listKey || '');
      const options = Array.isArray(payload.options) ? payload.options : [];
      const res = await client.query(
        `INSERT INTO public.dropdown_lists (id, branch_id, list_key, options)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (branch_id, list_key) DO UPDATE SET
           options = EXCLUDED.options,
           version = public.dropdown_lists.version + 1,
           updated_at = NOW()
         RETURNING *`,
        [recordId, effectiveBranchId, listKey, JSON.stringify(options)]
      );
      resultRow = mapDbRowByTable('dropdown_lists', res.rows[0]);
      break;
    }

    case 'audit_logs': {
      try {
        const res = await client.query(
          `INSERT INTO public.audit_logs (branch_id, user_email, username, department, operation, record_id, result, action, details, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            effectiveBranchId,
            String(payload.userEmail || 'system'),
            String(payload.username || payload.userEmail || 'system'),
            String(payload.department || ''),
            String(payload.operation || payload.action || ''),
            String(payload.recordId || ''),
            String(payload.result || 'SUCCESS'),
            String(payload.action || 'ACTION'),
            String(payload.details || ''),
            String(payload.ipAddress || '127.0.0.1'),
          ]
        );
        resultRow = mapDbRowByTable('audit_logs', res.rows[0]);
      } catch (colErr: any) {
        if (String(colErr?.code || '') !== '42703') throw colErr;
        const res = await client.query(
          `INSERT INTO public.audit_logs (branch_id, user_email, action, details, ip_address)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [
            effectiveBranchId,
            String(payload.userEmail || 'system'),
            String(payload.action || 'ACTION'),
            String(payload.details || ''),
            String(payload.ipAddress || '127.0.0.1'),
          ]
        );
        resultRow = mapDbRowByTable('audit_logs', res.rows[0]);
      }
      break;
    }
  }

  return { success: true, operation, row: resultRow };
}

export async function upsertRowInPostgres(
  table: NormalizedTableName,
  branchId: string,
  payload: any,
  expectedVersion?: number
): Promise<UpsertRowResult> {
  if (table === 'branches') {
    unmarkBranchDeleted(payload?.id || branchId, payload?.name);
    fallbackUpsertRow('branches', branchId, payload);
  }
  await ensurePostgresSchema();
  if (pgFallbackMode) {
    return fallbackUpsertRow(table, branchId, payload);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await upsertRowWithClient(client, table, branchId, payload, expectedVersion);
    if (res.conflict || !res.success) {
      await client.query('ROLLBACK');
      return res;
    }
    await client.query('COMMIT');
    return res;
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    if (isPostgresUnavailableError(err)) {
      pgFallbackMode = true;
      return fallbackUpsertRow(table, branchId, payload);
    }
    return {
      success: false,
      operation: 'UPDATE',
      error: err?.message || 'فشل حفظ السجل في قاعدة بيانات PostgreSQL.',
    };
  } finally {
    client.release();
  }
}

export async function deleteRowInPostgres(
  table: NormalizedTableName,
  id: string,
  branchId?: string
): Promise<{ success: boolean; deletedRow?: any; error?: string }> {
  if (table === 'branches' && id === DEFAULT_BRANCH_ID) {
    return {
      success: false,
      error: 'لا يمكن حذف أو مسح الإدارة الرئيسية الافتراضية (إدارة تموين مركز المحلة الكبرى).',
    };
  }
  if (table === 'branches') {
    const canonicalMatch = CANONICAL_DEFAULT_BRANCHES.find((b) => b.id === id);
    markBranchDeleted(id, canonicalMatch?.name);
    fallbackDeleteRow('branches', id, branchId);
  }
  await ensurePostgresSchema();
  if (pgFallbackMode) {
    return fallbackDeleteRow(table, id, branchId);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (table === 'branches') {
      const existingBranchRes = await client.query(
        `SELECT * FROM public.branches WHERE id = $1`,
        [id]
      );
      const existingRow = existingBranchRes.rows[0];
      const canonicalMatch = CANONICAL_DEFAULT_BRANCHES.find((b) => b.id === id);
      markBranchDeleted(id, existingRow?.name || canonicalMatch?.name);
      fallbackDeleteRow('branches', id, branchId);

      // Explicitly remove dependent branch rows before deleting branch record
      await client.query(`DELETE FROM public.debts WHERE branch_id = $1`, [id]);
      await client.query(`DELETE FROM public.bakeries WHERE branch_id = $1`, [id]);
      await client.query(`DELETE FROM public.villages WHERE branch_id = $1`, [id]);
      await client.query(`DELETE FROM public.app_users WHERE branch_id = $1`, [id]);
      await client.query(`DELETE FROM public.daily_tasks WHERE branch_id = $1`, [id]);
      await client.query(`DELETE FROM public.inbox_messages WHERE branch_id = $1`, [id]);
      await client.query(`DELETE FROM public.high_debt_alerts WHERE branch_id = $1`, [id]);
      await client.query(`DELETE FROM public.system_config WHERE branch_id = $1`, [id]);
      await client.query(`DELETE FROM public.dropdown_lists WHERE branch_id = $1`, [id]);
      await client.query(`DELETE FROM public.branch_module_states WHERE branch_id = $1`, [id]).catch(() => {});

      const delBranchRes = await client.query(
        `DELETE FROM public.branches WHERE id = $1 RETURNING *`,
        [id]
      );
      await client.query('COMMIT');
      const deletedObj = delBranchRes.rows[0]
        ? mapDbRowByTable('branches', delBranchRes.rows[0])
        : canonicalMatch || { id };
      return { success: true, deletedRow: deletedObj };
    }

    const pkColumn = table === 'system_config' ? 'branch_id' : 'id';
    const params: any[] = [id];
    let branchFilter = '';
    if (branchId && table !== 'system_config') {
      params.push(branchId);
      branchFilter = ` AND branch_id = $2`;
    }
    let delRes = await client.query(
      `DELETE FROM public.${table} WHERE ${pkColumn} = $1 ${branchFilter} RETURNING *`,
      params
    );
    if (delRes.rows.length === 0 && table === 'app_users' && branchId) {
      const scopedId = id.includes(`__${branchId}`) ? id.split(`__${branchId}`)[0] : `${id}__${branchId}`;
      delRes = await client.query(
        `DELETE FROM public.app_users WHERE id = $1 AND branch_id = $2 RETURNING *`,
        [scopedId, branchId]
      );
    }
    await client.query('COMMIT');
    if (delRes.rows.length === 0) {
      return { success: true, deletedRow: null };
    }
    return { success: true, deletedRow: mapDbRowByTable(table, delRes.rows[0]) };
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    if (isPostgresUnavailableError(err)) {
      pgFallbackMode = true;
      return fallbackDeleteRow(table, id, branchId);
    }
    return { success: false, error: err?.message || 'فشل حذف السجل من قاعدة البيانات.' };
  } finally {
    client.release();
  }
}

export async function syncFullBranchStateToPostgres(
  branchId: string,
  stateData: any,
  options?: { pruneRemoved?: boolean }
): Promise<{ success: boolean; syncedCounts: Record<string, number>; error?: string }> {
  await ensurePostgresSchema();
  if (pgFallbackMode) {
    return fallbackSyncFullBranchState(branchId, stateData, options);
  }
  const effectiveBranchId = branchId || stateData?.activeBranchId || DEFAULT_BRANCH_ID;
  const client = await pool.connect();
  const syncedCounts: Record<string, number> = {
    branches: 0,
    villages: 0,
    bakeries: 0,
    debts: 0,
    app_users: 0,
    daily_tasks: 0,
    inbox_messages: 0,
    dropdown_lists: 0,
  };

  try {
    await client.query('BEGIN');

    // 1. Branches
    const branchesList: SupplyBranch[] = Array.isArray(stateData?.branches) ? stateData.branches : [];
    for (const br of branchesList) {
      if (br?.id && !isBranchMarkedDeleted(br.id, br.name)) {
        await upsertRowWithClient(client, 'branches', br.id, br);
        syncedCounts.branches += 1;
      }
    }
    await ensureBranchRecord(client, effectiveBranchId);

    // 2. Villages
    const hasVillagesArray = Array.isArray(stateData?.villages);
    const villagesList: VillageHierarchy[] = hasVillagesArray ? stateData.villages : [];
    const incomingVillageNames = villagesList.map((v) => String(v.village)).filter(Boolean);
    for (const v of villagesList) {
      if (v?.village) {
        await upsertRowWithClient(client, 'villages', effectiveBranchId, {
          id: `${effectiveBranchId}__${v.village}`,
          branchId: effectiveBranchId,
          village: v.village,
          localUnits: v.localUnits || [],
        });
        syncedCounts.villages += 1;
      }
    }
    if (options?.pruneRemoved && hasVillagesArray) {
      if (incomingVillageNames.length === 0) {
        await client.query(`DELETE FROM public.villages WHERE branch_id = $1`, [effectiveBranchId]);
      } else {
        await client.query(`DELETE FROM public.villages WHERE branch_id = $1 AND NOT (village = ANY($2::text[]))`, [
          effectiveBranchId,
          incomingVillageNames,
        ]);
      }
    }

    // 3. Bakeries
    const hasBakeriesArray = Array.isArray(stateData?.bakeries);
    const bakeriesList: Bakery[] = hasBakeriesArray ? stateData.bakeries : [];
    const incomingBakeryIds = bakeriesList.map((b) => String(b.id)).filter(Boolean);
    for (const b of bakeriesList) {
      if (b?.id) {
        const bRes = await upsertRowWithClient(client, 'bakeries', effectiveBranchId, b);
        if (bRes.success) {
          syncedCounts.bakeries += 1;
        }
      }
    }

    // 4. Debts (only for existing bakeries)
    const hasDebtsArray = Array.isArray(stateData?.debts);
    const debtsList: DebtRecord[] = hasDebtsArray ? stateData.debts : [];
    const validBakeryIds = new Set(incomingBakeryIds);
    const incomingDebtIds: string[] = [];
    for (const d of debtsList) {
      if (d?.id && d?.bakeryId && (validBakeryIds.has(d.bakeryId) || !options?.pruneRemoved || !hasBakeriesArray)) {
        const res = await upsertRowWithClient(client, 'debts', effectiveBranchId, d);
        if (res.success) {
          incomingDebtIds.push(d.id);
          syncedCounts.debts += 1;
        }
      }
    }

    if (options?.pruneRemoved && hasDebtsArray) {
      if (incomingDebtIds.length === 0) {
        await client.query(`DELETE FROM public.debts WHERE branch_id = $1`, [effectiveBranchId]);
      } else {
        await client.query(`DELETE FROM public.debts WHERE branch_id = $1 AND NOT (id = ANY($2::text[]))`, [
          effectiveBranchId,
          incomingDebtIds,
        ]);
      }
    }
    if (options?.pruneRemoved && hasBakeriesArray) {
      if (incomingBakeryIds.length === 0) {
        await client.query(`DELETE FROM public.bakeries WHERE branch_id = $1`, [effectiveBranchId]);
      } else {
        await client.query(`DELETE FROM public.bakeries WHERE branch_id = $1 AND NOT (id = ANY($2::text[]))`, [
          effectiveBranchId,
          incomingBakeryIds,
        ]);
      }
    }

    // 5. Users
    const hasUsersArray = Array.isArray(stateData?.users);
    const usersList: AppUser[] = hasUsersArray ? stateData.users : [];
    const syncedUserIds: string[] = [];
    for (const u of usersList) {
      if (u?.id && u?.username) {
        const uRes = await upsertRowWithClient(client, 'app_users', effectiveBranchId, u);
        if (uRes.success) {
          syncedCounts.app_users += 1;
          if (uRes.row?.id) syncedUserIds.push(String(uRes.row.id));
        }
      }
    }
    if (options?.pruneRemoved && hasUsersArray && syncedUserIds.length > 0) {
      await client.query(`DELETE FROM public.app_users WHERE branch_id = $1 AND NOT (id = ANY($2::text[]))`, [
        effectiveBranchId,
        syncedUserIds,
      ]);
    }

    // 6. Daily Tasks
    const hasTasksArray = Array.isArray(stateData?.dailyTasks);
    const tasksList: DailyBakeryTask[] = hasTasksArray ? stateData.dailyTasks : [];
    const incomingTaskIds = tasksList.map((t) => String(t.id)).filter(Boolean);
    for (const t of tasksList) {
      if (t?.id) {
        await upsertRowWithClient(client, 'daily_tasks', effectiveBranchId, t);
        syncedCounts.daily_tasks += 1;
      }
    }
    if (options?.pruneRemoved && hasTasksArray) {
      if (incomingTaskIds.length === 0) {
        await client.query(`DELETE FROM public.daily_tasks WHERE branch_id = $1`, [effectiveBranchId]);
      } else {
        await client.query(`DELETE FROM public.daily_tasks WHERE branch_id = $1 AND NOT (id = ANY($2::text[]))`, [
          effectiveBranchId,
          incomingTaskIds,
        ]);
      }
    }

    // 7. Inbox Messages
    const hasInboxArray = Array.isArray(stateData?.inboxMessages);
    const inboxList: InboxChatMessage[] = hasInboxArray ? stateData.inboxMessages : [];
    const incomingMsgIds = inboxList.map((m) => String(m.id)).filter(Boolean);
    for (const m of inboxList) {
      if (m?.id) {
        await upsertRowWithClient(client, 'inbox_messages', effectiveBranchId, m);
        syncedCounts.inbox_messages += 1;
      }
    }
    if (options?.pruneRemoved && hasInboxArray) {
      if (incomingMsgIds.length === 0) {
        await client.query(`DELETE FROM public.inbox_messages WHERE branch_id = $1`, [effectiveBranchId]);
      } else {
        await client.query(`DELETE FROM public.inbox_messages WHERE branch_id = $1 AND NOT (id = ANY($2::text[]))`, [
          effectiveBranchId,
          incomingMsgIds,
        ]);
      }
    }

    // 8. System Config, Column Titles & Activity Statuses
    if (stateData?.systemConfig || stateData?.columnTitles || stateData?.activityStatuses) {
      await upsertRowWithClient(client, 'system_config', effectiveBranchId, {
        branchId: effectiveBranchId,
        systemConfig: stateData.systemConfig || {},
        columnTitles: stateData.columnTitles || {},
        activityStatuses: stateData.activityStatuses || [],
      });
    }

    // 9. Dropdown Lists (both explicit stateData.dropdownLists and top-level AppState dropdown arrays)
    const TOP_LEVEL_DROPDOWN_KEYS = [
      'issuingEntities',
      'violationTypes',
      'activityStatuses',
      'bakeryCategories',
      'breadTypes',
      'breadTypeCounts',
      'lineTypes',
      'fuelTypes',
      'leaseContractTypes',
      'responsibleManagerOptions',
      'paymentMethods',
    ] as const;
    const mergedDropdowns: Record<string, string[]> = {
      ...(stateData?.dropdownLists && typeof stateData.dropdownLists === 'object' ? stateData.dropdownLists : {}),
    };
    for (const k of TOP_LEVEL_DROPDOWN_KEYS) {
      if (Array.isArray(stateData?.[k])) {
        mergedDropdowns[k] = stateData[k];
      }
    }
    for (const [listKey, opts] of Object.entries(mergedDropdowns)) {
      if (Array.isArray(opts)) {
        await upsertRowWithClient(client, 'dropdown_lists', effectiveBranchId, {
          id: `${effectiveBranchId}__${listKey}`,
          branchId: effectiveBranchId,
          listKey,
          options: opts,
        });
        syncedCounts.dropdown_lists += 1;
      }
    }

    await client.query('COMMIT');
    return { success: true, syncedCounts };
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    if (isPostgresUnavailableError(err)) {
      pgFallbackMode = true;
      return fallbackSyncFullBranchState(branchId, stateData, options);
    }
    console.error('syncFullBranchStateToPostgres error:', err);
    return { success: false, syncedCounts, error: err?.message || 'PG batch sync error' };
  } finally {
    client.release();
  }
}

export async function syncHighDebtAlertsToPostgres(
  branchId: string,
  alerts: HighDebtAlertNotification[],
  debtAlertThreshold?: number
) {
  await ensurePostgresSchema();
  if (pgFallbackMode) {
    fallbackSyncHighDebtAlerts(branchId, alerts, debtAlertThreshold);
    return;
  }
  const effectiveBranchId = branchId || DEFAULT_BRANCH_ID;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureBranchRecord(client, effectiveBranchId);
    const ids = alerts.map((a) => String(a.id)).filter(Boolean);
    for (const a of alerts) {
      await upsertRowWithClient(client, 'high_debt_alerts', a.branchId || effectiveBranchId, a);
    }
    if (ids.length === 0) {
      await client.query(`DELETE FROM public.high_debt_alerts WHERE branch_id = $1`, [effectiveBranchId]);
    } else {
      await client.query(`DELETE FROM public.high_debt_alerts WHERE branch_id = $1 AND NOT (id = ANY($2::text[]))`, [
        effectiveBranchId,
        ids,
      ]);
    }
    if (typeof debtAlertThreshold === 'number' && debtAlertThreshold > 0) {
      await client.query(
        `INSERT INTO public.system_config (branch_id, debt_alert_threshold)
         VALUES ($1, $2)
         ON CONFLICT (branch_id) DO UPDATE SET debt_alert_threshold = EXCLUDED.debt_alert_threshold`,
        [effectiveBranchId, debtAlertThreshold]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (isPostgresUnavailableError(err)) {
      pgFallbackMode = true;
      fallbackSyncHighDebtAlerts(branchId, alerts, debtAlertThreshold);
      return;
    }
    console.error('syncHighDebtAlertsToPostgres failed:', err);
  } finally {
    client.release();
  }
}

export async function purgeAllPostgresData(): Promise<void> {
  await ensurePostgresSchema();
  if (pgFallbackMode) {
    fallbackPurgeAll();
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      TRUNCATE TABLE
        public.high_debt_alerts,
        public.inbox_messages,
        public.daily_tasks,
        public.debts,
        public.bakeries,
        public.villages,
        public.dropdown_lists,
        public.system_config,
        public.app_users,
        public.backup_snapshots
      CASCADE;
    `);
    await client.query(
      `INSERT INTO public.branches (id, name, governorate_title, directorate_title, description, is_default)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [
        DEFAULT_BRANCH_ROW.id,
        DEFAULT_BRANCH_ROW.name,
        DEFAULT_BRANCH_ROW.governorateTitle,
        DEFAULT_BRANCH_ROW.directorateTitle,
        DEFAULT_BRANCH_ROW.description || '',
      ]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (isPostgresUnavailableError(err)) {
      pgFallbackMode = true;
      fallbackPurgeAll();
      return;
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function authenticateUserInPostgres(
  branchId: string,
  usernameOrName: string,
  password: string
): Promise<{ ok: boolean; user?: AppUser; error?: string; status?: number }> {
  await ensurePostgresSchema();
  if (pgFallbackMode) {
    return fallbackAuthenticateUser(branchId, usernameOrName, password);
  }
  const effectiveBranchId = branchId || DEFAULT_BRANCH_ID;
  const cleanTarget = String(usernameOrName || '').trim().toLowerCase();
  try {
    let usersRes = await pool.query(
      `SELECT * FROM public.app_users WHERE branch_id = $1`,
      [effectiveBranchId]
    );
    const isProd =
      process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start';
    if (usersRes.rows.length === 0) {
      const envAdminPass = String(process.env.INITIAL_ADMIN_PASSWORD || '').trim();
      if (isProd) {
        if (envAdminPass) {
          const adminSeed = INITIAL_USERS.find((u) => u.role === 'admin');
          if (adminSeed) {
            const seedId = effectiveBranchId === DEFAULT_BRANCH_ID ? adminSeed.id : `${adminSeed.id}__${effectiveBranchId}`;
            await upsertRowInPostgres('app_users', effectiveBranchId, {
              ...adminSeed,
              id: seedId,
              branchId: effectiveBranchId,
              password: envAdminPass,
              isSuperAdmin: true,
              isActive: true,
            });
          }
        }
      } else {
        for (const seed of INITIAL_USERS) {
          const seedId = effectiveBranchId === DEFAULT_BRANCH_ID ? seed.id : `${seed.id}__${effectiveBranchId}`;
          const resolvedPass = seed.role === 'admin' && envAdminPass ? envAdminPass : seed.password;
          await upsertRowInPostgres('app_users', effectiveBranchId, {
            ...seed,
            id: seedId,
            branchId: effectiveBranchId,
            password: resolvedPass,
            isSuperAdmin: seed.role === 'admin',
            isActive: seed.isActive !== false,
          });
        }
      }
      usersRes = await pool.query(
        `SELECT * FROM public.app_users WHERE branch_id = $1`,
        [effectiveBranchId]
      );
    }

    const matched = usersRes.rows.find(
      (r) =>
        String(r.username || '').trim().toLowerCase() === cleanTarget ||
        String(r.full_name || '').trim().toLowerCase() === cleanTarget
    );
    if (!matched) {
      return { ok: false, status: 401, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }
    const storedHash = String(matched.password_hash || '');
    if (!verifyPasswordScrypt(password, storedHash)) {
      return { ok: false, status: 401, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }
    if (matched.is_active === false) {
      return { ok: false, status: 403, error: 'هذا الحساب موقوف حالياً. يرجى مراجعة مدير النظام.' };
    }
    if (storedHash && !isScryptHash(storedHash)) {
      await pool
        .query(`UPDATE public.app_users SET password_hash = $1 WHERE id = $2`, [
          hashPasswordScrypt(password),
          matched.id,
        ])
        .catch(() => {});
    }
    return { ok: true, user: mapDbUserToApp(matched) };
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      pgFallbackMode = true;
      return fallbackAuthenticateUser(branchId, usernameOrName, password);
    }
    throw err;
  }
}

export async function getUserByIdAndBranchFromPostgres(
  branchId: string,
  userId: string
): Promise<AppUser | null> {
  await ensurePostgresSchema();
  if (pgFallbackMode) {
    return fallbackGetUserByIdAndBranch(branchId, userId);
  }
  try {
    const res = await pool.query(
      `SELECT * FROM public.app_users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    if (res.rows.length === 0) return null;
    const mapped = mapDbUserToApp(res.rows[0]);
    if (branchId && mapped.branchId !== branchId && !mapped.applyToAllBranches && !mapped.isSuperAdmin) {
      return null;
    }
    return mapped;
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      pgFallbackMode = true;
      return fallbackGetUserByIdAndBranch(branchId, userId);
    }
    throw err;
  }
}

export async function resetNonMahallaBranchesInPostgres(actorUsername = 'super_admin'): Promise<{
  success: boolean;
  backupFileName: string;
  removedBranchesCount: number;
  preservedMahallaCounts: { bakeries: number; debts: number; villages: number; users: number };
}> {
  await ensurePostgresSchema();
  if (pgFallbackMode) {
    return fallbackResetNonMahallaBranches(actorUsername);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `pre_reset_non_mahalla_branches_${ts}.json`;

    const [branchesRes, villagesRes, bakeriesRes, debtsRes, usersRes, tasksRes, inboxRes, alertsRes, cfgRes, listsRes, modRes] =
      await Promise.all([
        client.query(`SELECT * FROM public.branches WHERE id <> $1`, [DEFAULT_BRANCH_ID]),
        client.query(`SELECT * FROM public.villages WHERE branch_id <> $1`, [DEFAULT_BRANCH_ID]),
        client.query(`SELECT * FROM public.bakeries WHERE branch_id <> $1`, [DEFAULT_BRANCH_ID]),
        client.query(`SELECT * FROM public.debts WHERE branch_id <> $1`, [DEFAULT_BRANCH_ID]),
        client.query(`SELECT * FROM public.app_users WHERE branch_id <> $1`, [DEFAULT_BRANCH_ID]),
        client.query(`SELECT * FROM public.daily_tasks WHERE branch_id <> $1`, [DEFAULT_BRANCH_ID]),
        client.query(`SELECT * FROM public.inbox_messages WHERE branch_id <> $1`, [DEFAULT_BRANCH_ID]),
        client.query(`SELECT * FROM public.high_debt_alerts WHERE branch_id <> $1`, [DEFAULT_BRANCH_ID]),
        client.query(`SELECT * FROM public.system_config WHERE branch_id <> $1`, [DEFAULT_BRANCH_ID]),
        client.query(`SELECT * FROM public.dropdown_lists WHERE branch_id <> $1`, [DEFAULT_BRANCH_ID]),
        client.query(`SELECT * FROM public.branch_module_states WHERE branch_id <> $1`, [DEFAULT_BRANCH_ID]),
      ]);

    const snapshotPayload = {
      createdAt: new Date().toISOString(),
      createdBy: actorUsername,
      branches: branchesRes.rows.map(mapDbBranchToApp),
      villages: villagesRes.rows.map(mapDbVillageToApp),
      bakeries: bakeriesRes.rows.map(mapDbBakeryToApp),
      debts: debtsRes.rows.map(mapDbDebtToApp),
      app_users: usersRes.rows.map(mapDbUserToApp),
      daily_tasks: tasksRes.rows.map(mapDbTaskToApp),
      inbox_messages: inboxRes.rows.map(mapDbInboxToApp),
      high_debt_alerts: alertsRes.rows.map(mapDbAlertToApp),
      system_config: cfgRes.rows,
      dropdown_lists: listsRes.rows,
      branch_module_states: modRes.rows,
    };

    await upsertStorageFileInPostgres({
      branchId: DEFAULT_BRANCH_ID,
      fileName: backupFileName,
      content: JSON.stringify(snapshotPayload),
      contentType: 'application/json',
      clientId: actorUsername,
    });

    // Strictly delete ONLY non-Mahalla branches and rows — NEVER touch branch-mahalla
    await client.query(`DELETE FROM public.branch_module_states WHERE branch_id <> $1`, [DEFAULT_BRANCH_ID]).catch(() => {});
    await client.query(`DELETE FROM public.high_debt_alerts WHERE branch_id <> $1`, [DEFAULT_BRANCH_ID]);
    await client.query(`DELETE FROM public.inbox_messages WHERE branch_id <> $1`, [DEFAULT_BRANCH_ID]);
    await client.query(`DELETE FROM public.daily_tasks WHERE branch_id <> $1`, [DEFAULT_BRANCH_ID]);
    await client.query(`DELETE FROM public.debts WHERE branch_id <> $1`, [DEFAULT_BRANCH_ID]);
    await client.query(`DELETE FROM public.bakeries WHERE branch_id <> $1`, [DEFAULT_BRANCH_ID]);
    await client.query(`DELETE FROM public.villages WHERE branch_id <> $1`, [DEFAULT_BRANCH_ID]);
    await client.query(`DELETE FROM public.dropdown_lists WHERE branch_id <> $1`, [DEFAULT_BRANCH_ID]);
    await client.query(`DELETE FROM public.system_config WHERE branch_id <> $1`, [DEFAULT_BRANCH_ID]);
    await client.query(`DELETE FROM public.app_users WHERE branch_id <> $1`, [DEFAULT_BRANCH_ID]);
    await client.query(`DELETE FROM public.branches WHERE id <> $1`, [DEFAULT_BRANCH_ID]);

    const countsRes = await client.query(
      `SELECT
        (SELECT count(*)::int FROM public.bakeries WHERE branch_id = $1) AS bakeries,
        (SELECT count(*)::int FROM public.debts WHERE branch_id = $1) AS debts,
        (SELECT count(*)::int FROM public.villages WHERE branch_id = $1) AS villages,
        (SELECT count(*)::int FROM public.app_users WHERE branch_id = $1) AS users`,
      [DEFAULT_BRANCH_ID]
    );

    await client.query(
      `INSERT INTO public.audit_logs (branch_id, user_email, username, department, operation, record_id, result, action, details, ip_address)
       VALUES ($1, $2, $3, 'system', 'RESET_NON_MAHALLA_BRANCHES', 'non-mahalla', 'SUCCESS', 'SELECTIVE_BRANCH_RESET', $4, '127.0.0.1')`,
      [
        DEFAULT_BRANCH_ID,
        actorUsername,
        actorUsername,
        `تم تصفير الإدارات غير الرئيسية فقط (${branchesRes.rows.length} إدارة) مع أخذ نسخة احتياطية (${backupFileName}) والإبقاء التام على بيانات مركز المحلة الكبرى.`,
      ]
    );

    await client.query('COMMIT');
    return {
      success: true,
      backupFileName,
      removedBranchesCount: branchesRes.rows.length,
      preservedMahallaCounts: {
        bakeries: Number(countsRes.rows[0]?.bakeries || 0),
        debts: Number(countsRes.rows[0]?.debts || 0),
        villages: Number(countsRes.rows[0]?.villages || 0),
        users: Number(countsRes.rows[0]?.users || 0),
      },
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (isPostgresUnavailableError(err)) {
      pgFallbackMode = true;
      return fallbackResetNonMahallaBranches(actorUsername);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function recordAuditLog(
  userEmail: string,
  action: string,
  details: string,
  ipAddress?: string,
  branchId = DEFAULT_BRANCH_ID,
  extra?: {
    username?: string;
    department?: string;
    operation?: string;
    recordId?: string;
    result?: string;
  }
) {
  try {
    await ensurePostgresSchema();
    if (pgFallbackMode) {
      fallbackUpsertRow('audit_logs', branchId, {
        userEmail,
        username: extra?.username || userEmail,
        department: extra?.department || '',
        operation: extra?.operation || action,
        recordId: extra?.recordId || '',
        result: extra?.result || 'SUCCESS',
        action,
        details,
        ipAddress,
      });
      return;
    }
    try {
      await pool.query(
        `INSERT INTO public.audit_logs (branch_id, user_email, username, department, operation, record_id, result, action, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          branchId,
          userEmail,
          extra?.username || userEmail,
          extra?.department || '',
          extra?.operation || action,
          extra?.recordId || '',
          extra?.result || 'SUCCESS',
          action,
          details,
          ipAddress || '127.0.0.1',
        ]
      );
    } catch (colErr: any) {
      if (String(colErr?.code || '') !== '42703') throw colErr;
      await pool.query(
        `INSERT INTO public.audit_logs (branch_id, user_email, action, details, ip_address)
         VALUES ($1, $2, $3, $4, $5)`,
        [branchId, userEmail, action, details, ipAddress || '127.0.0.1']
      );
    }
  } catch (error) {
    if (isPostgresUnavailableError(error)) {
      pgFallbackMode = true;
      fallbackUpsertRow('audit_logs', branchId, {
        userEmail,
        username: extra?.username || userEmail,
        department: extra?.department || '',
        operation: extra?.operation || action,
        recordId: extra?.recordId || '',
        result: extra?.result || 'SUCCESS',
        action,
        details,
        ipAddress,
      });
      return;
    }
    console.error('Failed to record audit log:', error);
  }
}

export interface StoredFileEntry {
  id: string;
  fileName: string;
  branchId: string;
  contentType: string;
  sizeBytes: number;
  updatedAt: string;
  content?: string;
}

export function normalizeStorageFileKey(branchId: string, fileName: string): {
  id: string;
  cleanFileName: string;
  effectiveBranchId: string;
} {
  const effectiveBranchId = (branchId || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID;
  const cleanFileName = String(fileName || 'tamween-backup.json')
    .trim()
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9._\-\u0600-\u06FF]/g, '_')
    .slice(0, 120) || 'tamween-backup.json';
  return {
    id: `storage__${effectiveBranchId}__${cleanFileName}`,
    cleanFileName,
    effectiveBranchId,
  };
}

export async function upsertStorageFileInPostgres(params: {
  branchId?: string;
  fileName: string;
  content: string;
  contentType?: string;
  clientId?: string;
}): Promise<StoredFileEntry> {
  await ensurePostgresSchema();
  const { id, cleanFileName, effectiveBranchId } = normalizeStorageFileKey(
    params.branchId || DEFAULT_BRANCH_ID,
    params.fileName
  );
  const contentStr = String(params.content ?? '');
  const contentType = String(params.contentType || 'application/json');
  const sizeBytes = Buffer.byteLength(contentStr, 'utf-8');
  if (pgFallbackMode) {
    return fallbackUpsertStorageFile({
      id,
      fileName: cleanFileName,
      branchId: effectiveBranchId,
      contentType,
      sizeBytes,
      content: contentStr,
    });
  }
  const payload = {
    kind: 'storage_file',
    fileName: cleanFileName,
    contentType,
    sizeBytes,
    content: contentStr,
  };
  try {
    const res = await pool.query(
      `INSERT INTO public.backup_snapshots (id, branch_id, payload, client_id, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, NOW())
       ON CONFLICT (id) DO UPDATE SET
         branch_id = EXCLUDED.branch_id,
         payload = EXCLUDED.payload,
         client_id = EXCLUDED.client_id,
         updated_at = NOW()
       RETURNING id, branch_id, updated_at`,
      [id, effectiveBranchId, JSON.stringify(payload), String(params.clientId || '')]
    );
    return {
      id: res.rows[0].id,
      fileName: cleanFileName,
      branchId: res.rows[0].branch_id || effectiveBranchId,
      contentType,
      sizeBytes,
      updatedAt: res.rows[0].updated_at ? new Date(res.rows[0].updated_at).toISOString() : new Date().toISOString(),
    };
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      pgFallbackMode = true;
      return fallbackUpsertStorageFile({
        id,
        fileName: cleanFileName,
        branchId: effectiveBranchId,
        contentType,
        sizeBytes,
        content: contentStr,
      });
    }
    throw err;
  }
}

export async function listStorageFilesInPostgres(branchId?: string): Promise<StoredFileEntry[]> {
  await ensurePostgresSchema();
  const effectiveBranchId = (branchId || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID;
  if (pgFallbackMode) {
    return fallbackListStorageFiles(effectiveBranchId);
  }
  try {
    const res = await pool.query(
      `SELECT id, branch_id, payload->>'fileName' AS file_name,
              COALESCE(payload->>'contentType', 'application/json') AS content_type,
              COALESCE((payload->>'sizeBytes')::int, 0) AS size_bytes,
              updated_at
       FROM public.backup_snapshots
       WHERE id LIKE 'storage__%' AND branch_id = $1
       ORDER BY updated_at DESC`,
      [effectiveBranchId]
    );
    return res.rows.map((r) => ({
      id: String(r.id),
      fileName: String(r.file_name || r.id),
      branchId: String(r.branch_id || effectiveBranchId),
      contentType: String(r.content_type || 'application/json'),
      sizeBytes: Number(r.size_bytes || 0),
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
    }));
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      pgFallbackMode = true;
      return fallbackListStorageFiles(effectiveBranchId);
    }
    throw err;
  }
}

export async function getStorageFileFromPostgres(
  fileNameOrId: string,
  branchId?: string
): Promise<StoredFileEntry | null> {
  await ensurePostgresSchema();
  const effectiveBranchId = (branchId || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID;
  const candidateId = fileNameOrId.startsWith('storage__')
    ? fileNameOrId
    : normalizeStorageFileKey(effectiveBranchId, fileNameOrId).id;
  if (pgFallbackMode) {
    return fallbackGetStorageFile(candidateId);
  }
  try {
    const res = await pool.query(
      `SELECT id, branch_id, payload, updated_at
       FROM public.backup_snapshots
       WHERE id = $1`,
      [candidateId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    const p = row.payload || {};
    return {
      id: String(row.id),
      fileName: String(p.fileName || row.id),
      branchId: String(row.branch_id || effectiveBranchId),
      contentType: String(p.contentType || 'application/json'),
      sizeBytes: Number(p.sizeBytes || 0),
      content: typeof p.content === 'string' ? p.content : JSON.stringify(p.content ?? ''),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    };
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      pgFallbackMode = true;
      return fallbackGetStorageFile(candidateId);
    }
    throw err;
  }
}

export async function deleteStorageFileInPostgres(
  fileNameOrId: string,
  branchId?: string
): Promise<boolean> {
  await ensurePostgresSchema();
  const effectiveBranchId = (branchId || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID;
  const candidateId = fileNameOrId.startsWith('storage__')
    ? fileNameOrId
    : normalizeStorageFileKey(effectiveBranchId, fileNameOrId).id;
  if (pgFallbackMode) {
    return fallbackDeleteStorageFile(candidateId);
  }
  try {
    const res = await pool.query(`DELETE FROM public.backup_snapshots WHERE id = $1 RETURNING id`, [candidateId]);
    return res.rows.length > 0;
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      pgFallbackMode = true;
      return fallbackDeleteStorageFile(candidateId);
    }
    throw err;
  }
}

export async function getBranchModuleStateFromPostgres(
  branchId: string,
  moduleKey = 'all_modules'
): Promise<{ exists: boolean; payload: any; version: number; updatedAt: string | null }> {
  await ensurePostgresSchema();
  const cleanBranch = (branchId || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID;
  if (pgFallbackMode) {
    return fallbackGetBranchModuleState(cleanBranch, moduleKey);
  }
  try {
    const res = await pool.query(
      `SELECT payload, version, updated_at
       FROM public.branch_module_states
       WHERE branch_id = $1 AND module_key = $2`,
      [cleanBranch, moduleKey]
    );
    if (res.rows.length === 0) {
      return { exists: false, payload: null, version: 0, updatedAt: null };
    }
    const row = res.rows[0];
    return {
      exists: true,
      payload: row.payload,
      version: Number(row.version || 1),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    };
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      return fallbackGetBranchModuleState(cleanBranch, moduleKey);
    }
    throw err;
  }
}

export async function upsertBranchModuleStateInPostgres(
  branchId: string,
  payload: any,
  updatedBy = '',
  moduleKey = 'all_modules'
): Promise<{ version: number; updatedAt: string }> {
  await ensurePostgresSchema();
  const cleanBranch = (branchId || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID;
  if (pgFallbackMode) {
    return fallbackUpsertBranchModuleState(cleanBranch, payload, updatedBy, moduleKey);
  }
  const rowId = `mod__${cleanBranch}__${moduleKey}`;
  try {
    const res = await pool.query(
      `INSERT INTO public.branch_module_states (id, branch_id, module_key, payload, updated_by, version, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, 1, NOW())
       ON CONFLICT (branch_id, module_key) DO UPDATE SET
         payload = EXCLUDED.payload,
         updated_by = EXCLUDED.updated_by,
         version = public.branch_module_states.version + 1,
         updated_at = NOW()
       RETURNING version, updated_at`,
      [rowId, cleanBranch, moduleKey, JSON.stringify(payload || {}), updatedBy || 'system']
    );
    return {
      version: Number(res.rows[0]?.version || 1),
      updatedAt: res.rows[0]?.updated_at
        ? new Date(res.rows[0].updated_at).toISOString()
        : new Date().toISOString(),
    };
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      return fallbackUpsertBranchModuleState(cleanBranch, payload, updatedBy, moduleKey);
    }
    throw err;
  }
}

export interface AuditDeletionSecurityEntry {
  id: string;
  branchId: string;
  deletedBy: string;
  deletedByFullName: string;
  targetScope: string;
  deletedCount: number;
  reason: string;
  ipAddress: string;
  createdAt: string;
}

export async function recordAuditDeletionSecurityLog(entry: {
  branchId?: string;
  deletedBy: string;
  deletedByFullName?: string;
  targetScope: string;
  deletedCount: number;
  reason: string;
  ipAddress?: string;
}): Promise<AuditDeletionSecurityEntry> {
  await ensurePostgresSchema();
  if (pgFallbackMode) {
    return fallbackRecordAuditDeletionSecurityLog(entry);
  }
  const id = `aud-sec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const cleanBranch = (entry.branchId || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID;
  try {
    const res = await pool.query(
      `INSERT INTO public.audit_deletion_security_log
        (id, branch_id, deleted_by, deleted_by_full_name, target_scope, deleted_count, reason, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        cleanBranch,
        entry.deletedBy,
        entry.deletedByFullName || entry.deletedBy,
        entry.targetScope,
        Math.max(0, Number(entry.deletedCount) || 0),
        entry.reason || '',
        entry.ipAddress || '127.0.0.1',
      ]
    );
    const r = res.rows[0];
    return {
      id: String(r.id),
      branchId: String(r.branch_id || cleanBranch),
      deletedBy: String(r.deleted_by || entry.deletedBy),
      deletedByFullName: String(r.deleted_by_full_name || entry.deletedBy),
      targetScope: String(r.target_scope || entry.targetScope),
      deletedCount: Number(r.deleted_count || 0),
      reason: String(r.reason || ''),
      ipAddress: String(r.ip_address || '127.0.0.1'),
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    };
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      pgFallbackMode = true;
      return fallbackRecordAuditDeletionSecurityLog(entry);
    }
    throw err;
  }
}

export async function listAuditDeletionSecurityLogsFromPostgres(
  branchId?: string
): Promise<AuditDeletionSecurityEntry[]> {
  await ensurePostgresSchema();
  if (pgFallbackMode) {
    return fallbackListAuditDeletionSecurityLogs(branchId);
  }
  try {
    const useBranch = Boolean(branchId && branchId !== 'ALL');
    const res = await pool.query(
      useBranch
        ? `SELECT * FROM public.audit_deletion_security_log WHERE branch_id = $1 ORDER BY created_at DESC LIMIT 500`
        : `SELECT * FROM public.audit_deletion_security_log ORDER BY created_at DESC LIMIT 500`,
      useBranch ? [branchId] : []
    );
    return res.rows.map((r) => ({
      id: String(r.id),
      branchId: String(r.branch_id || DEFAULT_BRANCH_ID),
      deletedBy: String(r.deleted_by || ''),
      deletedByFullName: String(r.deleted_by_full_name || ''),
      targetScope: String(r.target_scope || ''),
      deletedCount: Number(r.deleted_count || 0),
      reason: String(r.reason || ''),
      ipAddress: String(r.ip_address || '127.0.0.1'),
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    }));
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      pgFallbackMode = true;
      return fallbackListAuditDeletionSecurityLogs(branchId);
    }
    throw err;
  }
}

export async function deleteAuditLogsInPostgres(params: {
  branchId?: string;
  ids?: string[];
  deletedBy: string;
  deletedByFullName?: string;
  targetScope: string;
  reason: string;
  ipAddress?: string;
}): Promise<{ deletedCount: number; securityEntry: AuditDeletionSecurityEntry }> {
  await ensurePostgresSchema();
  if (pgFallbackMode) {
    return fallbackDeleteAuditLogs(params);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let delRes;
    const hasIds = Array.isArray(params.ids) && params.ids.length > 0;
    const useBranch = Boolean(params.branchId && params.branchId !== 'ALL');
    if (hasIds) {
      const numericIds = params.ids!.map((v) => Number(v)).filter((n) => Number.isFinite(n));
      if (numericIds.length === 0) {
        await client.query('COMMIT');
        const secEntry = await recordAuditDeletionSecurityLog({
          branchId: params.branchId && params.branchId !== 'ALL' ? params.branchId : DEFAULT_BRANCH_ID,
          deletedBy: params.deletedBy,
          deletedByFullName: params.deletedByFullName,
          targetScope: params.targetScope,
          deletedCount: 0,
          reason: params.reason,
          ipAddress: params.ipAddress,
        });
        return { deletedCount: 0, securityEntry: secEntry };
      }
      delRes = await client.query(
        useBranch
          ? `DELETE FROM public.audit_logs WHERE id = ANY($1::int[]) AND branch_id = $2 RETURNING id`
          : `DELETE FROM public.audit_logs WHERE id = ANY($1::int[]) RETURNING id`,
        useBranch ? [numericIds, params.branchId] : [numericIds]
      );
    } else if (useBranch) {
      delRes = await client.query(`DELETE FROM public.audit_logs WHERE branch_id = $1 RETURNING id`, [
        params.branchId,
      ]);
    } else {
      delRes = await client.query(`DELETE FROM public.audit_logs RETURNING id`);
    }
    const deletedCount = delRes.rows.length;
    const secId = `aud-sec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const cleanBranch = (params.branchId && params.branchId !== 'ALL' ? params.branchId : DEFAULT_BRANCH_ID).trim();
    const secRes = await client.query(
      `INSERT INTO public.audit_deletion_security_log
        (id, branch_id, deleted_by, deleted_by_full_name, target_scope, deleted_count, reason, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        secId,
        cleanBranch,
        params.deletedBy,
        params.deletedByFullName || params.deletedBy,
        params.targetScope,
        deletedCount,
        params.reason || '',
        params.ipAddress || '127.0.0.1',
      ]
    );
    await client.query('COMMIT');
    const r = secRes.rows[0];
    return {
      deletedCount,
      securityEntry: {
        id: String(r.id),
        branchId: String(r.branch_id || cleanBranch),
        deletedBy: String(r.deleted_by || params.deletedBy),
        deletedByFullName: String(r.deleted_by_full_name || params.deletedBy),
        targetScope: String(r.target_scope || params.targetScope),
        deletedCount: Number(r.deleted_count || 0),
        reason: String(r.reason || ''),
        ipAddress: String(r.ip_address || '127.0.0.1'),
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      },
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (isPostgresUnavailableError(err)) {
      pgFallbackMode = true;
      return fallbackDeleteAuditLogs(params);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function verifyVaultCredentialsInPostgres(params: {
  branchId: string;
  enteredUsername?: string;
  enteredPassword: string;
}): Promise<boolean> {
  await ensurePostgresSchema();
  if (pgFallbackMode) {
    return fallbackVerifyVaultCredentials(params);
  }
  const effectiveBranchId = params.branchId || DEFAULT_BRANCH_ID;
  try {
    const res = await pool.query(
      `SELECT daily_alert_config FROM public.system_config WHERE branch_id IN ($1, $2)`,
      [effectiveBranchId, DEFAULT_BRANCH_ID]
    );
    const branchRow = res.rows.find((r) => r.branch_id === effectiveBranchId) || res.rows[0];
    const alertCfg = branchRow?.daily_alert_config || {};
    const cred = alertCfg?.branchVaultCredentials?.[effectiveBranchId];
    const targetUser = normalizeDigits(
      String(cred?.username || alertCfg?.vaultUsername || DEFAULT_VAULT_USERNAME)
    ).toLowerCase();
    const isProd =
      process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start';
    const defaultVaultPass = isProd
      ? String(process.env.INITIAL_VAULT_PASSCODE || '').trim()
      : DEFAULT_VAULT_PASSCODE;
    const targetPass = String(cred?.password || alertCfg?.vaultPasscode || defaultVaultPass);
    if (!targetPass) return false;
    if (!verifyPasswordScrypt(params.enteredPassword, targetPass)) return false;

    const cleanUser = normalizeDigits(String(params.enteredUsername || '')).toLowerCase();
    if (cleanUser) return cleanUser === targetUser;
    return targetUser === DEFAULT_VAULT_USERNAME.toLowerCase();
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      pgFallbackMode = true;
      return fallbackVerifyVaultCredentials(params);
    }
    throw err;
  }
}

export async function updateVaultCredentialsInPostgres(params: {
  targetScope: 'all' | string;
  newUsername: string;
  newPassword: string;
}): Promise<{ updatedBranches: string[] }> {
  await ensurePostgresSchema();
  if (pgFallbackMode) {
    return fallbackUpdateVaultCredentials(params);
  }
  const cleanUser = normalizeDigits(params.newUsername) || DEFAULT_VAULT_USERNAME;
  const hashedPass = hashPasswordScrypt(params.newPassword);
  const nowIso = new Date().toISOString();
  try {
    const branchesRes = await pool.query(`SELECT id FROM public.branches`);
    const allIds = branchesRes.rows.map((r) => String(r.id)).filter(Boolean);
    const targetIds =
      params.targetScope === 'all' || params.targetScope === 'ALL'
        ? allIds.length > 0
          ? allIds
          : [DEFAULT_BRANCH_ID]
        : [params.targetScope];

    for (const bId of targetIds) {
      const res = await pool.query(
        `SELECT daily_alert_config FROM public.system_config WHERE branch_id = $1`,
        [bId]
      );
      const prevAlertCfg = res.rows[0]?.daily_alert_config || {};
      const nextMap = { ...(prevAlertCfg.branchVaultCredentials || {}) };
      nextMap[bId] = {
        branchId: bId,
        username: cleanUser,
        password: hashedPass,
        updatedAt: nowIso,
      };
      await upsertRowInPostgres('system_config', bId, {
        branchId: bId,
        systemConfig: {
          vaultUsername: cleanUser,
          vaultPasscode: hashedPass,
          branchVaultCredentials: nextMap,
        },
      });
    }
    return { updatedBranches: targetIds };
  } catch (err) {
    if (isPostgresUnavailableError(err)) {
      pgFallbackMode = true;
      return fallbackUpdateVaultCredentials(params);
    }
    throw err;
  }
}


