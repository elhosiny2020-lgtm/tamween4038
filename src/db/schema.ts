import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const administrations = pgTable('administrations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  governorateTitle: text('governorate_title').notNull().default('محافظة الغربية'),
  directorateTitle: text('directorate_title').notNull().default('مديرية التموين والتجارة الداخلية بالغربية'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const branches = pgTable('branches', {
  id: text('id').primaryKey(),
  administrationId: text('administration_id').notNull().default('admin-mahalla-sector'),
  name: text('name').notNull(),
  governorateTitle: text('governorate_title').notNull().default('محافظة الغربية'),
  directorateTitle: text('directorate_title').notNull().default('مديرية التموين والتجارة الداخلية بالغربية'),
  description: text('description').notNull().default(''),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const roles = pgTable('roles', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  nameAr: text('name_ar').notNull(),
  hierarchyLevel: integer('hierarchy_level').notNull().default(20),
  isCentral: boolean('is_central').notNull().default(false),
  isSystem: boolean('is_system').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  badgeColor: text('badge_color').notNull().default('bg-slate-100 text-slate-900 border-slate-400'),
  description: text('description').notNull().default(''),
  defaultPermissions: jsonb('default_permissions').notNull().default([]),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const permissions = pgTable('permissions', {
  code: text('code').primaryKey(),
  nameAr: text('name_ar').notNull(),
  category: text('category').notNull().default('عام'),
  description: text('description').notNull().default(''),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: text('id').primaryKey(),
    roleCode: text('role_code')
      .notNull()
      .references(() => roles.code, { onDelete: 'cascade' }),
    permissionCode: text('permission_code')
      .notNull()
      .references(() => permissions.code, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('uq_role_permission').on(t.roleCode, t.permissionCode)]
);

export const villages = pgTable(
  'villages',
  {
    id: text('id').primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    village: text('village').notNull(),
    localUnits: jsonb('local_units').notNull().default([]),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_villages_branch_name').on(t.branchId, t.village),
    index('idx_villages_branch_id').on(t.branchId),
  ]
);

export const bakeries = pgTable(
  'bakeries',
  {
    id: text('id').primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    bakeryOwnerName: text('bakery_owner_name').notNull(),
    machineNumber: text('machine_number').notNull(),
    village: text('village').notNull(),
    localUnit: text('local_unit').notNull(),
    responsibleManager: text('responsible_manager').notNull().default(''),

    insuranceQuota: doublePrecision('insurance_quota').notNull().default(0),
    actualQuota: doublePrecision('actual_quota').notNull().default(0),
    insuranceValue: doublePrecision('insurance_value').notNull().default(0),
    insuranceCheckNumber: text('insurance_check_number').notNull().default(''),
    loavesCount: doublePrecision('loaves_count').notNull().default(0),

    villagePopulation: integer('village_population').notNull().default(0),
    perCapitaAverage: text('per_capita_average').notNull().default('0'),
    beneficiaries2023: integer('beneficiaries_2023').notNull().default(0),
    avg2023: text('avg_2023').notNull().default('0'),
    beneficiaries2024: integer('beneficiaries_2024').notNull().default(0),
    avg2024: text('avg_2024').notNull().default('0'),
    beneficiaries2025: integer('beneficiaries_2025').notNull().default(0),
    avg2025: text('avg_2025').notNull().default('0'),
    avgDiff: text('avg_diff').notNull().default('0'),

    activityStatus: text('activity_status').notNull().default('يعمل'),
    bakeryCategory: text('bakery_category').notNull().default('مخبز بلدي مدعم'),
    breadType: text('bread_type').notNull().default('بلدي مدعم'),
    flourBagPrice: doublePrecision('flour_bag_price').notNull().default(0),
    breadTypeCount: text('bread_type_count').notNull().default('660'),
    lineType: text('line_type').notNull().default('آلي كامل'),
    fuelType: text('fuel_type').notNull().default('غاز طبيعي'),

    phone: text('phone').notNull().default(''),
    nationalId: text('national_id').notNull().default(''),

    commercialRegNumber: text('commercial_reg_number').notNull().default(''),
    commercialRegDate: text('commercial_reg_date').notNull().default(''),
    bakeryLicenseNumber: text('bakery_license_number').notNull().default(''),
    bakeryLicenseDate: text('bakery_license_date').notNull().default(''),
    leaseContractType: text('lease_contract_type').notNull().default(''),
    leaseAgreementDate: text('lease_agreement_date').notNull().default(''),
    taxCardNumber: text('tax_card_number').notNull().default(''),
    taxCardDate: text('tax_card_date').notNull().default(''),
    notes: text('notes').notNull().default(''),

    activityLog: jsonb('activity_log').default([]),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_bakeries_branch_machine').on(t.branchId, t.machineNumber),
    index('idx_bakeries_branch_id').on(t.branchId),
    index('idx_bakeries_village').on(t.branchId, t.village),
    index('idx_bakeries_local_unit').on(t.branchId, t.localUnit),
    index('idx_bakeries_status').on(t.branchId, t.activityStatus),
    index('idx_bakeries_machine').on(t.machineNumber),
  ]
);

export const debts = pgTable(
  'debts',
  {
    id: text('id').primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    bakeryId: text('bakery_id')
      .notNull()
      .references(() => bakeries.id, { onDelete: 'cascade' }),
    bakeryOwnerName: text('bakery_owner_name').notNull(),
    machineNumber: text('machine_number').notNull(),
    village: text('village').notNull(),
    localUnit: text('local_unit').notNull(),

    violationDate: text('violation_date').notNull().default(''),
    issuingEntity: text('issuing_entity').notNull().default(''),
    violationType: text('violation_type').notNull().default(''),
    violationAmount: doublePrecision('violation_amount').notNull().default(0),
    oldViolations: doublePrecision('old_violations').notNull().default(0),
    totalViolations: doublePrecision('total_violations').notNull().default(0),

    violationPaymentDate: text('violation_payment_date').notNull().default(''),
    violationReceiptNumber: text('violation_receipt_number').notNull().default(''),
    violationPaymentMethod: text('violation_payment_method').notNull().default('كاش'),
    paidViolationAmount: doublePrecision('paid_violation_amount').notNull().default(0),
    remainingViolations: doublePrecision('remaining_violations').notNull().default(0),

    addedAmount: doublePrecision('added_amount').notNull().default(0),
    addedPaymentDate: text('added_payment_date').notNull().default(''),
    addedReceiptNumber: text('added_receipt_number').notNull().default(''),
    addedPaymentMethod: text('added_payment_method').notNull().default('كاش'),
    paidAddedAmount: doublePrecision('paid_added_amount').notNull().default(0),
    remainingAdded: doublePrecision('remaining_added').notNull().default(0),

    disposalDate: text('disposal_date').notNull().default(''),
    disposalBags: doublePrecision('disposal_bags').notNull().default(0),
    disposalBagPrice: doublePrecision('disposal_bag_price').notNull().default(0),
    disposalMultiplier: doublePrecision('disposal_multiplier').notNull().default(1),
    disposalValue: doublePrecision('disposal_value').notNull().default(0),

    disposalPaymentDate: text('disposal_payment_date').notNull().default(''),
    disposalReceiptNumber: text('disposal_receipt_number').notNull().default(''),
    disposalPaymentMethod: text('disposal_payment_method').notNull().default('كاش'),
    paidDisposalAmount: doublePrecision('paid_disposal_amount').notNull().default(0),
    remainingDisposal: doublePrecision('remaining_disposal').notNull().default(0),

    netRemainingDebt: doublePrecision('net_remaining_debt').notNull().default(0),
    isScheduled: boolean('is_scheduled').notNull().default(false),
    scheduleInstallmentsCount: integer('schedule_installments_count').notNull().default(0),
    schedulePeriodType: text('schedule_period_type').notNull().default('شهري'),
    scheduleInstallmentValue: doublePrecision('schedule_installment_value').notNull().default(0),
    scheduleStartDate: text('schedule_start_date').notNull().default(''),
    schedulePaidInstallments: integer('schedule_paid_installments').notNull().default(0),
    scheduleStatus: text('schedule_status').notNull().default('قيد التحصيل'),
    notes: text('notes').notNull().default(''),

    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    index('idx_debts_branch_id').on(t.branchId),
    index('idx_debts_bakery_id').on(t.bakeryId),
    index('idx_debts_violation_date').on(t.branchId, t.violationDate),
    index('idx_debts_schedule_status').on(t.branchId, t.scheduleStatus),
  ]
);

export const appUsers = pgTable(
  'app_users',
  {
    id: text('id').primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    administrationId: text('administration_id').notNull().default('admin-mahalla-sector'),
    username: text('username').notNull(),
    fullName: text('full_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('employee'),
    isActive: boolean('is_active').notNull().default(true),
    isSuperAdmin: boolean('is_super_admin').notNull().default(false),
    isCentral: boolean('is_central').notNull().default(false),
    jobTitle: text('job_title').notNull().default(''),
    department: text('department').notNull().default(''),
    phone: text('phone').notNull().default(''),
    gmailEmail: text('gmail_email').notNull().default(''),
    gmailPassword: text('gmail_password').notNull().default(''),
    googleDriveAutoSync: boolean('google_drive_auto_sync').notNull().default(false),
    notes: text('notes').notNull().default(''),
    customPermissions: jsonb('custom_permissions').default([]),
    departmentPermissions: jsonb('department_permissions').default({}),
    lastLoginAt: timestamp('last_login_at'),
    updatedBy: text('updated_by').notNull().default(''),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_app_users_branch_username').on(t.branchId, t.username),
    index('idx_app_users_branch_id').on(t.branchId),
  ]
);

export const userRoles = pgTable(
  'user_roles',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    roleCode: text('role_code').notNull(),
    branchId: text('branch_id'),
    assignedBy: text('assigned_by').notNull().default('system'),
    assignedAt: timestamp('assigned_at').defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_user_role_branch').on(t.userId, t.roleCode),
    index('idx_user_roles_user').on(t.userId),
  ]
);

export const userBranches = pgTable(
  'user_branches',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    isPrimary: boolean('is_primary').notNull().default(true),
    assignedBy: text('assigned_by').notNull().default('system'),
    assignedAt: timestamp('assigned_at').defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_user_branch').on(t.userId, t.branchId),
    index('idx_user_branches_branch').on(t.branchId),
  ]
);

export const appDepartments = pgTable('app_departments', {
  id: text('id').primaryKey(),
  code: text('code').notNull().default(''),
  nameAr: text('name_ar').notNull(),
  shortLabel: text('short_label').notNull().default(''),
  iconKey: text('icon_key').notNull().default('folder'),
  description: text('description').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  isSystem: boolean('is_system').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  subItemsJson: jsonb('sub_items_json').notNull().default([]),
  createdAt: timestamp('created_at').defaultNow(),
});

export const branchDepartments = pgTable(
  'branch_departments',
  {
    id: text('id').primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    departmentId: text('department_id').notNull(),
    departmentKey: text('department_key').notNull().default('bakeries'),
    label: text('label').notNull(),
    shortLabel: text('short_label').notNull().default(''),
    iconKey: text('icon_key').notNull().default('folder'),
    visible: boolean('visible').notNull().default(true),
    enabled: boolean('enabled').notNull().default(true),
    allowedBySuperAdmin: boolean('allowed_by_super_admin').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    subItemsJson: jsonb('sub_items_json').notNull().default([]),
    updatedBy: text('updated_by').notNull().default('system'),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_branch_department').on(t.branchId, t.departmentId),
    index('idx_branch_departments_branch').on(t.branchId),
  ]
);

export const userDepartmentPermissions = pgTable(
  'user_department_permissions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    departmentId: text('department_id')
      .notNull()
      .references(() => appDepartments.id, { onDelete: 'cascade' }),
    canView: boolean('can_view').notNull().default(false),
    canEnter: boolean('can_enter').notNull().default(true),
    canHide: boolean('can_hide').notNull().default(false),
    canInsert: boolean('can_insert').notNull().default(false),
    canUpdate: boolean('can_update').notNull().default(false),
    canDelete: boolean('can_delete').notNull().default(false),
    canApprove: boolean('can_approve').notNull().default(false),
    canPrint: boolean('can_print').notNull().default(false),
    canExport: boolean('can_export').notNull().default(false),
    canManageUsers: boolean('can_manage_users').notNull().default(false),
    canAssignPermissions: boolean('can_assign_permissions').notNull().default(false),
    canDepartmentSettings: boolean('can_department_settings').notNull().default(false),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_user_dept_perm').on(t.userId, t.departmentId),
    index('idx_user_dept_perm_user').on(t.userId),
  ]
);

export const dailyTasks = pgTable(
  'daily_tasks',
  {
    id: text('id').primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    bakeryId: text('bakery_id').notNull().default(''),
    bakeryName: text('bakery_name').notNull().default(''),
    village: text('village').notNull().default(''),
    priority: text('priority').notNull().default('medium'),
    dueDate: text('due_date').notNull().default(''),
    status: text('status').notNull().default('pending'),
    assignedTo: text('assigned_to').notNull().default(''),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [index('idx_daily_tasks_branch_id').on(t.branchId, t.status, t.dueDate)]
);

export const inboxMessages = pgTable(
  'inbox_messages',
  {
    id: text('id').primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    senderId: text('sender_id').notNull(),
    senderName: text('sender_name').notNull(),
    senderRole: text('sender_role').notNull(),
    recipientTarget: text('recipient_target').notNull().default('ALL'),
    recipientLabel: text('recipient_label').notNull().default('الجميع'),
    messageType: text('message_type').notNull().default('instruction'),
    content: text('content').notNull(),
    relatedBakeryId: text('related_bakery_id').notNull().default(''),
    relatedBakeryName: text('related_bakery_name').notNull().default(''),
    readBy: jsonb('read_by').default([]),
    timestamp: text('timestamp').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [index('idx_inbox_messages_branch_id').on(t.branchId, t.createdAt)]
);

export const highDebtAlerts = pgTable(
  'high_debt_alerts',
  {
    id: text('id').primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    bakeryId: text('bakery_id').notNull(),
    bakeryOwnerName: text('bakery_owner_name').notNull(),
    machineNumber: text('machine_number').notNull().default(''),
    village: text('village').notNull().default(''),
    debtAmount: doublePrecision('debt_amount').notNull().default(0),
    thresholdUsed: doublePrecision('threshold_used').notNull().default(50000),
    editedBy: text('edited_by').notNull().default(''),
    editorRole: text('editor_role').notNull().default(''),
    actionType: text('action_type').notNull().default('HIGH_DEBT_SURGE'),
    isRead: boolean('is_read').notNull().default(false),
    notes: text('notes').notNull().default(''),
    createdAtIso: text('created_at_iso').notNull().default(''),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [index('idx_high_debt_alerts_branch_id').on(t.branchId, t.isRead)]
);

export const systemConfig = pgTable('system_config', {
  branchId: text('branch_id')
    .primaryKey()
    .references(() => branches.id, { onDelete: 'cascade' }),
  governorateTitle: text('governorate_title').notNull().default(''),
  directorateTitle: text('directorate_title').notNull().default(''),
  administrationTitle: text('administration_title').notNull().default(''),
  englishSubtitle: text('english_subtitle').notNull().default(''),
  logoBase64: text('logo_base64').notNull().default(''),
  debtAlertThreshold: doublePrecision('debt_alert_threshold').notNull().default(50000),
  dailyAlertConfig: jsonb('daily_alert_config').default({}),
  rolePermissions: jsonb('role_permissions').default({}),
  roleLabels: jsonb('role_labels').default({}),
  customRoles: jsonb('custom_roles').default([]),
  columnTitles: jsonb('column_titles').default({}),
  activityStatuses: jsonb('activity_statuses').default([]),
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const dropdownLists = pgTable(
  'dropdown_lists',
  {
    id: text('id').primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    listKey: text('list_key').notNull(),
    options: jsonb('options').notNull().default([]),
    version: integer('version').notNull().default(1),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [uniqueIndex('uq_dropdown_lists_branch_key').on(t.branchId, t.listKey)]
);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  fullName: text('full_name').notNull(),
  role: text('role').notNull().default('inspector'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  branchId: text('branch_id').default(''),
  userEmail: text('user_email').notNull(),
  username: text('username').notNull().default('system'),
  department: text('department').notNull().default('system'),
  operation: text('operation').notNull().default('ACTION'),
  recordId: text('record_id').notNull().default(''),
  result: text('result').notNull().default('ALLOWED'),
  action: text('action').notNull(),
  details: text('details').notNull(),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const auditDeletionSecurityLog = pgTable(
  'audit_deletion_security_log',
  {
    id: text('id').primaryKey(),
    branchId: text('branch_id').notNull().default('branch-mahalla'),
    deletedBy: text('deleted_by').notNull(),
    deletedByFullName: text('deleted_by_full_name').notNull().default(''),
    targetScope: text('target_scope').notNull(),
    deletedCount: integer('deleted_count').notNull().default(0),
    reason: text('reason').notNull().default(''),
    ipAddress: text('ip_address').notNull().default('127.0.0.1'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [index('idx_audit_del_sec_branch_created').on(t.branchId, t.createdAt)]
);

export const backupSnapshots = pgTable('backup_snapshots', {
  id: text('id').primaryKey(),
  branchId: text('branch_id').default('default'),
  payload: jsonb('payload').notNull(),
  clientId: text('client_id').default(''),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const branchModuleStates = pgTable(
  'branch_module_states',
  {
    id: text('id').primaryKey(),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    moduleKey: text('module_key').notNull().default('all_modules'),
    payload: jsonb('payload').notNull().default({}),
    updatedBy: text('updated_by').notNull().default(''),
    version: integer('version').notNull().default(1),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [uniqueIndex('uq_branch_module_state').on(t.branchId, t.moduleKey)]
);

// Relations
export const bakeriesRelations = relations(bakeries, ({ many, one }) => ({
  debts: many(debts),
  branch: one(branches, {
    fields: [bakeries.branchId],
    references: [branches.id],
  }),
}));

export const debtsRelations = relations(debts, ({ one }) => ({
  bakery: one(bakeries, {
    fields: [debts.bakeryId],
    references: [bakeries.id],
  }),
  branch: one(branches, {
    fields: [debts.branchId],
    references: [branches.id],
  }),
}));
