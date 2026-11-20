-- ============================================================================
-- Migration: 20261120_unified_rbac_departments_users.sql
-- Purpose: Safe additive multi-tenant RBAC, 12 dynamic roles, administrations,
--          central department catalog, branch_departments visibility governance,
--          user_roles, user_branches, granular permissions, and audit fields.
-- Safety: Strictly idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).
--         Zero deletion or mutation of existing Mahalla data or existing users.
-- ============================================================================

-- 1. Administrations (الإدارات الرئيسية والفرعية)
CREATE TABLE IF NOT EXISTS public.administrations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  governorate_title TEXT NOT NULL DEFAULT 'محافظة الغربية',
  directorate_title TEXT NOT NULL DEFAULT 'مديرية التموين والتجارة الداخلية بالغربية',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.administrations (id, name, governorate_title, directorate_title, is_active) VALUES
  ('admin-gharbia-directorate', 'مديرية التموين والتجارة الداخلية بالغربية', 'محافظة الغربية', 'مديرية التموين والتجارة الداخلية بالغربية', TRUE),
  ('admin-mahalla-sector', 'قطاع إدارات تموين المحلة الكبرى', 'محافظة الغربية', 'مديرية التموين والتجارة الداخلية بالغربية', TRUE),
  ('admin-tanta-sector', 'قطاع إدارات تموين طنطا والمراكز', 'محافظة الغربية', 'مديرية التموين والتجارة الداخلية بالغربية', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 2. Extend branches with administration_id & is_active
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS administration_id TEXT DEFAULT 'admin-mahalla-sector';
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- 3. Roles (الأدوار الوظيفية الـ 12 الديناميكية + قابلة للتوسعة)
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

INSERT INTO public.roles (id, code, name_ar, hierarchy_level, is_central, is_system, is_active, description, default_permissions) VALUES
  ('role-super-admin', 'super_admin', 'مدير النظام الرئيسي', 100, TRUE, TRUE, TRUE, 'صلاحية مركزية كاملة على جميع الإدارات والفروع والأقسام والأدوار وسجل التدقيق.', '["view","hide","enter","insert","update","delete","approve","print","export","manage_users","assign_permissions","department_settings"]'::jsonb),
  ('role-main-admin-manager', 'main_admin_manager', 'مدير الإدارة الرئيسية', 90, TRUE, TRUE, TRUE, 'إدارة ومتابعة الإدارات الفرعية والفروع والأقسام واعتماد التقارير وإدارة المستخدمين.', '["view","hide","enter","insert","update","delete","approve","print","export","manage_users","assign_permissions","department_settings"]'::jsonb),
  ('role-supply-admin-manager', 'supply_admin_manager', 'مدير إدارة التموين', 85, TRUE, TRUE, TRUE, 'إدارة وتشغيل إدارة التموين والفروع التابعة لها واعتماد السجلات والتحكم بالأقسام.', '["view","hide","enter","insert","update","approve","print","export","manage_users","assign_permissions","department_settings"]'::jsonb),
  ('role-branch-manager', 'branch_manager', 'مدير الفرع', 75, FALSE, TRUE, TRUE, 'إدارة كاملة داخل الفرع المخصص فقط، إظهار وإخفاء الأقسام، وإدارة مستخدمي الفرع وصلاحياتهم.', '["view","hide","enter","insert","update","delete","approve","print","export","manage_users","assign_permissions","department_settings"]'::jsonb),
  ('role-deputy-branch-manager', 'deputy_branch_manager', 'نائب مدير الفرع', 70, FALSE, TRUE, TRUE, 'معاونة مدير الفرع في المتابعة والاعتماد وإدارة الأقسام والمستخدمين ضمن صلاحيات الفرع.', '["view","hide","enter","insert","update","approve","print","export","manage_users","assign_permissions","department_settings"]'::jsonb),
  ('role-system-officer', 'system_officer', 'مسؤول النظام', 65, FALSE, TRUE, TRUE, 'إدارة إعدادات التشغيل والمستخدمين وتوزيع الصلاحيات وإعدادات الأقسام داخل الفرع.', '["view","hide","enter","insert","update","print","export","manage_users","assign_permissions","department_settings"]'::jsonb),
  ('role-department-manager', 'department_manager', 'مدير القسم', 55, FALSE, TRUE, TRUE, 'إدارة كاملة للقسم المخصص له مع صلاحيات الإضافة والتعديل والاعتماد والطباعة والتصدير.', '["view","enter","insert","update","approve","print","export","department_settings"]'::jsonb),
  ('role-department-head', 'department_head', 'رئيس قسم', 50, FALSE, TRUE, TRUE, 'إشراف تشغيلي ومراجعة واعتماد العمليات داخل القسم المخصص له.', '["view","enter","insert","update","approve","print","export"]'::jsonb),
  ('role-department-officer', 'department_officer', 'مسؤول القسم', 45, FALSE, TRUE, TRUE, 'تشغيل القسم المخصص وإدخال وتعديل البيانات وطباعة وتصدير التقارير.', '["view","enter","insert","update","print","export"]'::jsonb),
  ('role-employee', 'employee', 'موظف', 30, FALSE, TRUE, TRUE, 'إدخال وتحديث البيانات اليومية وعرض وطباعة السجلات ضمن القسم المخصص فقط.', '["view","enter","insert","update","print"]'::jsonb),
  ('role-auditor', 'auditor', 'مراقب', 25, FALSE, TRUE, TRUE, 'مراقبة ومراجعة السجلات والتقارير والطباعة والتصدير دون صلاحية حذف أو تعديل الإعدادات.', '["view","enter","print","export"]'::jsonb),
  ('role-custom-user', 'custom_user', 'مستخدم بصلاحيات مخصصة', 20, FALSE, TRUE, TRUE, 'مستخدم تُحدد صلاحياته وأقسامه يدوياً بدقة لكل قسم ولكل عملية.', '["view","enter"]'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- 4. Permissions Catalog (كتالوج الصلاحيات الدقيقة)
CREATE TABLE IF NOT EXISTS public.permissions (
  code TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'عام',
  description TEXT NOT NULL DEFAULT ''
);

INSERT INTO public.permissions (code, name_ar, category, description) VALUES
  ('view', 'عرض', 'الأقسام', 'عرض البيانات والشاشات المصرح بها داخل القسم'),
  ('hide', 'إخفاء', 'الأقسام', 'إخفاء وإظهار الأقسام في قائمة الفرع'),
  ('enter', 'دخول', 'الأقسام', 'الدخول المباشر إلى شاشات ونماذج القسم'),
  ('insert', 'إضافة', 'العمليات', 'إضافة سجلات وبيانات جديدة داخل القسم'),
  ('update', 'تعديل', 'العمليات', 'تعديل وتحديث السجلات القائمة'),
  ('delete', 'حذف', 'العمليات', 'حذف السجلات داخل القسم المصرح به'),
  ('approve', 'اعتماد', 'الرقابة', 'اعتماد القرارات والمحاضر والتقارير الرسمية'),
  ('print', 'طباعة', 'التقارير', 'طباعة الكشوف والتقارير الرسمية A4'),
  ('export', 'تصدير', 'التقارير', 'تصدير الجداول والتقارير إلى Excel / CSV / PDF'),
  ('manage_users', 'إدارة مستخدمين', 'الإدارة', 'إضافة وتعديل وتعطيل حسابات المستخدمين في النطاق المصرح به'),
  ('assign_permissions', 'توزيع صلاحيات', 'الإدارة', 'توزيع وتخصيص صلاحيات المستخدمين على الأقسام'),
  ('department_settings', 'إعدادات القسم', 'الإدارة', 'التحكم في ظهور وتفعيل وإعدادات الأقسام')
ON CONFLICT (code) DO NOTHING;

-- 5. Role Permissions Join Table
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id TEXT PRIMARY KEY,
  role_code TEXT NOT NULL REFERENCES public.roles(code) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
  CONSTRAINT uq_role_permission UNIQUE (role_code, permission_code)
);

-- 6. Extend app_users safely with administration_id, is_central, last_login_at, updated_by
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS administration_id TEXT DEFAULT 'admin-mahalla-sector';
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS is_central BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS updated_by TEXT DEFAULT '';

-- 7. User Roles & User Branches Relational Bindings
CREATE TABLE IF NOT EXISTS public.user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  role_code TEXT NOT NULL,
  branch_id TEXT,
  assigned_by TEXT NOT NULL DEFAULT 'system',
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_user_role_branch UNIQUE (user_id, role_code)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);

CREATE TABLE IF NOT EXISTS public.user_branches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_by TEXT NOT NULL DEFAULT 'system',
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_user_branch UNIQUE (user_id, branch_id)
);
CREATE INDEX IF NOT EXISTS idx_user_branches_branch ON public.user_branches(branch_id);

-- 8. Extend app_departments & user_department_permissions
ALTER TABLE public.app_departments ADD COLUMN IF NOT EXISTS code TEXT DEFAULT '';
ALTER TABLE public.app_departments ADD COLUMN IF NOT EXISTS short_label TEXT DEFAULT '';
ALTER TABLE public.app_departments ADD COLUMN IF NOT EXISTS icon_key TEXT DEFAULT 'folder';
ALTER TABLE public.app_departments ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.app_departments ADD COLUMN IF NOT EXISTS sub_items_json JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.user_department_permissions ADD COLUMN IF NOT EXISTS can_enter BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.user_department_permissions ADD COLUMN IF NOT EXISTS can_hide BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.user_department_permissions ADD COLUMN IF NOT EXISTS can_approve BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.user_department_permissions ADD COLUMN IF NOT EXISTS can_manage_users BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.user_department_permissions ADD COLUMN IF NOT EXISTS can_assign_permissions BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.user_department_permissions ADD COLUMN IF NOT EXISTS can_department_settings BOOLEAN NOT NULL DEFAULT FALSE;

-- 9. Branch Departments Visibility & Governance Table (استقلالية الأقسام لكل فرع)
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
CREATE INDEX IF NOT EXISTS idx_branch_departments_branch ON public.branch_departments(branch_id);
