-- =========================================================================
-- المخطط العلائقي الموحد لقاعدة بيانات Supabase & PostgreSQL
-- منظومة إدارة بيانات المخابز والتموين والمديونيات (الإصدار الموحد 2026)
-- Unified Normalized Relational Schema + Indexes + Triggers + RLS + Realtime
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- دالة موحدة لتحديث updated_at وزيادة رقم الإصدار (Optimistic Concurrency Control)
CREATE OR REPLACE FUNCTION public.bump_updated_at_and_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  IF TG_OP = 'UPDATE' THEN
    NEW.version = COALESCE(OLD.version, 1) + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. الإدارات التموينية (Branches)
CREATE TABLE IF NOT EXISTS public.branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  governorate_title TEXT DEFAULT 'محافظة الغربية',
  directorate_title TEXT DEFAULT 'مديرية التموين والتجارة الداخلية بالغربية',
  description TEXT DEFAULT '',
  is_default BOOLEAN DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. القرى والوحدات المحلية (Villages Hierarchy)
CREATE TABLE IF NOT EXISTS public.villages (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  village TEXT NOT NULL,
  local_units JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_villages_branch_name UNIQUE (branch_id, village)
);

-- 3. المخابز (Bakeries)
CREATE TABLE IF NOT EXISTS public.bakeries (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  bakery_owner_name TEXT NOT NULL,
  machine_number TEXT NOT NULL,
  village TEXT NOT NULL,
  local_unit TEXT NOT NULL,
  responsible_manager TEXT DEFAULT '',

  insurance_quota DOUBLE PRECISION DEFAULT 0,
  actual_quota DOUBLE PRECISION DEFAULT 0,
  insurance_value DOUBLE PRECISION DEFAULT 0,
  insurance_check_number TEXT DEFAULT '',
  loaves_count DOUBLE PRECISION DEFAULT 0,

  village_population INTEGER DEFAULT 0,
  per_capita_average TEXT DEFAULT '0',
  beneficiaries_2023 INTEGER DEFAULT 0,
  avg_2023 TEXT DEFAULT '0',
  beneficiaries_2024 INTEGER DEFAULT 0,
  avg_2024 TEXT DEFAULT '0',
  beneficiaries_2025 INTEGER DEFAULT 0,
  avg_2025 TEXT DEFAULT '0',
  avg_diff TEXT DEFAULT '0',

  activity_status TEXT DEFAULT 'يعمل',
  bakery_category TEXT DEFAULT 'مخبز بلدي مدعم',
  bread_type TEXT DEFAULT 'بلدي مدعم',
  flour_bag_price DOUBLE PRECISION DEFAULT 0,
  bread_type_count TEXT DEFAULT '660',
  line_type TEXT DEFAULT 'آلي كامل',
  fuel_type TEXT DEFAULT 'غاز طبيعي',

  phone TEXT DEFAULT '',
  national_id TEXT DEFAULT '',
  commercial_reg_number TEXT DEFAULT '',
  commercial_reg_date TEXT DEFAULT '',
  bakery_license_number TEXT DEFAULT '',
  bakery_license_date TEXT DEFAULT '',
  lease_contract_type TEXT DEFAULT '',
  lease_agreement_date TEXT DEFAULT '',
  tax_card_number TEXT DEFAULT '',
  tax_card_date TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  activity_log JSONB DEFAULT '[]'::jsonb,

  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_bakeries_branch_machine UNIQUE (branch_id, machine_number)
);

-- 4. المديونيات والمخالفات (Debts)
CREATE TABLE IF NOT EXISTS public.debts (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  bakery_id TEXT NOT NULL REFERENCES public.bakeries(id) ON DELETE CASCADE,
  bakery_owner_name TEXT NOT NULL,
  machine_number TEXT NOT NULL,
  village TEXT NOT NULL,
  local_unit TEXT NOT NULL,

  violation_date TEXT DEFAULT '',
  issuing_entity TEXT DEFAULT '',
  violation_type TEXT DEFAULT '',
  violation_amount DOUBLE PRECISION DEFAULT 0,
  old_violations DOUBLE PRECISION DEFAULT 0,
  total_violations DOUBLE PRECISION DEFAULT 0,
  violation_payment_date TEXT DEFAULT '',
  violation_receipt_number TEXT DEFAULT '',
  violation_payment_method TEXT DEFAULT 'كاش',
  paid_violation_amount DOUBLE PRECISION DEFAULT 0,
  remaining_violations DOUBLE PRECISION DEFAULT 0,

  added_amount DOUBLE PRECISION DEFAULT 0,
  added_payment_date TEXT DEFAULT '',
  added_receipt_number TEXT DEFAULT '',
  added_payment_method TEXT DEFAULT 'كاش',
  paid_added_amount DOUBLE PRECISION DEFAULT 0,
  remaining_added DOUBLE PRECISION DEFAULT 0,

  disposal_date TEXT DEFAULT '',
  disposal_bags DOUBLE PRECISION DEFAULT 0,
  disposal_bag_price DOUBLE PRECISION DEFAULT 0,
  disposal_multiplier DOUBLE PRECISION DEFAULT 1,
  disposal_value DOUBLE PRECISION DEFAULT 0,
  disposal_payment_date TEXT DEFAULT '',
  disposal_receipt_number TEXT DEFAULT '',
  disposal_payment_method TEXT DEFAULT 'كاش',
  paid_disposal_amount DOUBLE PRECISION DEFAULT 0,
  remaining_disposal DOUBLE PRECISION DEFAULT 0,

  net_remaining_debt DOUBLE PRECISION DEFAULT 0,
  is_scheduled BOOLEAN DEFAULT FALSE,
  schedule_installments_count INTEGER DEFAULT 0,
  schedule_period_type TEXT DEFAULT 'شهري',
  schedule_installment_value DOUBLE PRECISION DEFAULT 0,
  schedule_start_date TEXT DEFAULT '',
  schedule_paid_installments INTEGER DEFAULT 0,
  schedule_status TEXT DEFAULT 'قيد التحصيل',
  notes TEXT DEFAULT '',

  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. المستخدمين والصلاحيات (App Users)
CREATE TABLE IF NOT EXISTS public.app_users (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'inspector',
  job_title TEXT DEFAULT '',
  department TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  gmail_email TEXT DEFAULT '',
  gmail_password TEXT DEFAULT '',
  google_drive_auto_sync BOOLEAN DEFAULT FALSE,
  custom_permissions JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT DEFAULT '',
  department_permissions JSONB DEFAULT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_app_users_branch_username UNIQUE (branch_id, username)
);

-- 5b. تعريف أقسام النظام (App Departments)
CREATE TABLE IF NOT EXISTS public.app_departments (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.app_departments (id, name_ar, display_order) VALUES
  ('bakeries', 'إدارة المخابز', 1),
  ('debts', 'سجل المديونيات', 2),
  ('commodities', 'السلع التموينية', 3),
  ('internal_trade', 'التجارة الداخلية', 4),
  ('grain_maintenance', 'صيانة الحبوب', 5),
  ('hr', 'الموارد البشرية وشؤون العاملين', 6),
  ('reports', 'مركز التقارير والطباعة والتصدير', 7)
ON CONFLICT (id) DO UPDATE SET name_ar = EXCLUDED.name_ar, display_order = EXCLUDED.display_order;

-- 5c. مصفوفة الصلاحيات التفصيلية للمستخدمين على مستوى كل قسم (Granular RBAC)
CREATE TABLE IF NOT EXISTS public.user_department_permissions (
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
);

-- 6. المهام اليومية (Daily Tasks)
CREATE TABLE IF NOT EXISTS public.daily_tasks (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  bakery_id TEXT DEFAULT '',
  bakery_name TEXT DEFAULT '',
  village TEXT DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium',
  due_date TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_to TEXT DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. رسائل وتكليفات صندوق الوارد (Inbox Messages)
CREATE TABLE IF NOT EXISTS public.inbox_messages (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  recipient_target TEXT NOT NULL DEFAULT 'ALL',
  recipient_label TEXT DEFAULT 'الجميع',
  message_type TEXT NOT NULL DEFAULT 'instruction',
  content TEXT NOT NULL,
  related_bakery_id TEXT DEFAULT '',
  related_bakery_name TEXT DEFAULT '',
  read_by JSONB DEFAULT '[]'::jsonb,
  timestamp TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. تنبيهات المديونيات المرتفعة (High Debt Alerts)
CREATE TABLE IF NOT EXISTS public.high_debt_alerts (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  bakery_id TEXT NOT NULL,
  bakery_owner_name TEXT NOT NULL,
  machine_number TEXT DEFAULT '',
  village TEXT DEFAULT '',
  debt_amount DOUBLE PRECISION DEFAULT 0,
  threshold_used DOUBLE PRECISION DEFAULT 50000,
  edited_by TEXT DEFAULT '',
  editor_role TEXT DEFAULT '',
  action_type TEXT DEFAULT 'HIGH_DEBT_SURGE',
  is_read BOOLEAN DEFAULT FALSE,
  notes TEXT DEFAULT '',
  created_at_iso TEXT DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. إعدادات المنظومة وعناوين الأعمدة (System Config & Column Titles)
CREATE TABLE IF NOT EXISTS public.system_config (
  branch_id TEXT PRIMARY KEY REFERENCES public.branches(id) ON DELETE CASCADE,
  governorate_title TEXT DEFAULT '',
  directorate_title TEXT DEFAULT '',
  administration_title TEXT DEFAULT '',
  english_subtitle TEXT DEFAULT '',
  logo_base64 TEXT DEFAULT '',
  debt_alert_threshold DOUBLE PRECISION DEFAULT 50000,
  daily_alert_config JSONB DEFAULT '{}'::jsonb,
  role_permissions JSONB DEFAULT '{}'::jsonb,
  role_labels JSONB DEFAULT '{}'::jsonb,
  custom_roles JSONB DEFAULT '[]'::jsonb,
  column_titles JSONB DEFAULT '{}'::jsonb,
  activity_statuses JSONB DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. قوائم الاختيار المنسدلة (Dropdown Lists)
CREATE TABLE IF NOT EXISTS public.dropdown_lists (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  list_key TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_dropdown_lists_branch_key UNIQUE (branch_id, list_key)
);

-- 11. سجل المراجعة والأمان غير القابل للتعديل (Immutable Audit Logs)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id BIGSERIAL PRIMARY KEY,
  branch_id TEXT DEFAULT '',
  user_email TEXT NOT NULL DEFAULT 'system',
  username TEXT DEFAULT '',
  department TEXT DEFAULT '',
  operation TEXT DEFAULT '',
  record_id TEXT DEFAULT '',
  result TEXT DEFAULT 'SUCCESS',
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  ip_address TEXT DEFAULT '127.0.0.1',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. لقطات النسخ الاحتياطي الموحدة (Backup Snapshots)
CREATE TABLE IF NOT EXISTS public.backup_snapshots (
  id TEXT PRIMARY KEY,
  branch_id TEXT DEFAULT 'default',
  payload JSONB NOT NULL,
  client_id TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- الفهارس (Indexes) لتسريع الاستعلامات والبحث والتصفية والصفحات
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_villages_branch_id ON public.villages(branch_id);
CREATE INDEX IF NOT EXISTS idx_bakeries_branch_id ON public.bakeries(branch_id);
CREATE INDEX IF NOT EXISTS idx_bakeries_village ON public.bakeries(branch_id, village);
CREATE INDEX IF NOT EXISTS idx_bakeries_local_unit ON public.bakeries(branch_id, local_unit);
CREATE INDEX IF NOT EXISTS idx_bakeries_status ON public.bakeries(branch_id, activity_status);
CREATE INDEX IF NOT EXISTS idx_bakeries_machine ON public.bakeries(machine_number);
CREATE INDEX IF NOT EXISTS idx_debts_branch_id ON public.debts(branch_id);
CREATE INDEX IF NOT EXISTS idx_debts_bakery_id ON public.debts(bakery_id);
CREATE INDEX IF NOT EXISTS idx_debts_violation_date ON public.debts(branch_id, violation_date);
CREATE INDEX IF NOT EXISTS idx_debts_schedule_status ON public.debts(branch_id, schedule_status);
CREATE INDEX IF NOT EXISTS idx_app_users_branch_id ON public.app_users(branch_id);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_branch_id ON public.daily_tasks(branch_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_branch_id ON public.inbox_messages(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_high_debt_alerts_branch_id ON public.high_debt_alerts(branch_id, is_read);
CREATE INDEX IF NOT EXISTS idx_dropdown_lists_branch_id ON public.dropdown_lists(branch_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_created ON public.audit_logs(branch_id, created_at DESC);

-- =========================================================================
-- المشغلات (Triggers) للتحديث التلقائي للتاريخ والإصدار
-- =========================================================================
DROP TRIGGER IF EXISTS trg_branches_version ON public.branches;
CREATE TRIGGER trg_branches_version BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.bump_updated_at_and_version();

DROP TRIGGER IF EXISTS trg_villages_version ON public.villages;
CREATE TRIGGER trg_villages_version BEFORE UPDATE ON public.villages FOR EACH ROW EXECUTE FUNCTION public.bump_updated_at_and_version();

DROP TRIGGER IF EXISTS trg_bakeries_version ON public.bakeries;
CREATE TRIGGER trg_bakeries_version BEFORE UPDATE ON public.bakeries FOR EACH ROW EXECUTE FUNCTION public.bump_updated_at_and_version();

DROP TRIGGER IF EXISTS trg_debts_version ON public.debts;
CREATE TRIGGER trg_debts_version BEFORE UPDATE ON public.debts FOR EACH ROW EXECUTE FUNCTION public.bump_updated_at_and_version();

DROP TRIGGER IF EXISTS trg_app_users_version ON public.app_users;
CREATE TRIGGER trg_app_users_version BEFORE UPDATE ON public.app_users FOR EACH ROW EXECUTE FUNCTION public.bump_updated_at_and_version();

DROP TRIGGER IF EXISTS trg_daily_tasks_version ON public.daily_tasks;
CREATE TRIGGER trg_daily_tasks_version BEFORE UPDATE ON public.daily_tasks FOR EACH ROW EXECUTE FUNCTION public.bump_updated_at_and_version();

DROP TRIGGER IF EXISTS trg_inbox_messages_version ON public.inbox_messages;
CREATE TRIGGER trg_inbox_messages_version BEFORE UPDATE ON public.inbox_messages FOR EACH ROW EXECUTE FUNCTION public.bump_updated_at_and_version();

DROP TRIGGER IF EXISTS trg_high_debt_alerts_version ON public.high_debt_alerts;
CREATE TRIGGER trg_high_debt_alerts_version BEFORE UPDATE ON public.high_debt_alerts FOR EACH ROW EXECUTE FUNCTION public.bump_updated_at_and_version();

DROP TRIGGER IF EXISTS trg_system_config_version ON public.system_config;
CREATE TRIGGER trg_system_config_version BEFORE UPDATE ON public.system_config FOR EACH ROW EXECUTE FUNCTION public.bump_updated_at_and_version();

DROP TRIGGER IF EXISTS trg_dropdown_lists_version ON public.dropdown_lists;
CREATE TRIGGER trg_dropdown_lists_version BEFORE UPDATE ON public.dropdown_lists FOR EACH ROW EXECUTE FUNCTION public.bump_updated_at_and_version();

-- =========================================================================
-- الأمان وسياسات الوصول على مستوى الصف (Row Level Security - RLS)
-- =========================================================================
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.villages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.villages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bakeries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bakeries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users FORCE ROW LEVEL SECURITY;
ALTER TABLE public.app_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_departments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_department_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_department_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.high_debt_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.high_debt_alerts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dropdown_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropdown_lists FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.backup_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_snapshots FORCE ROW LEVEL SECURITY;

-- دالة مساعدة للتحقق من الدور والصلاحية في JWT عند تفعيل Supabase Auth (Fail-Closed: Default Empty Role)
CREATE OR REPLACE FUNCTION public.is_tamween_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN auth.role() = 'authenticated'
    AND (
      COALESCE((auth.jwt() -> 'app_metadata' ->> 'app_role'), '') IN ('super_admin', 'admin')
      OR COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_super_admin'), 'false') = 'true'
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_access_branch(target_branch_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  jwt_branch TEXT;
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RETURN FALSE;
  END IF;
  IF public.is_tamween_super_admin() THEN
    RETURN TRUE;
  END IF;
  jwt_branch := COALESCE((auth.jwt() -> 'app_metadata' ->> 'branch_id'), '');
  IF jwt_branch = '' OR target_branch_id IS NULL OR target_branch_id = '' THEN
    RETURN FALSE;
  END IF;
  RETURN jwt_branch = target_branch_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_tamween_authorized_writer()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN auth.role() = 'authenticated'
    AND COALESCE((auth.jwt() -> 'app_metadata' ->> 'app_role'), '') IN ('super_admin', 'admin', 'supervisor', 'inspector', 'data_entry');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_tamween_admin_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN auth.role() = 'authenticated'
    AND COALESCE((auth.jwt() -> 'app_metadata' ->> 'app_role'), '') IN ('super_admin', 'admin', 'supervisor');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_department_permission(dept_id TEXT, perm_action TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  uid TEXT;
  allowed BOOLEAN := FALSE;
BEGIN
  IF public.is_tamween_super_admin() THEN
    RETURN TRUE;
  END IF;
  IF auth.role() <> 'authenticated' THEN
    RETURN FALSE;
  END IF;
  uid := COALESCE((auth.jwt() -> 'app_metadata' ->> 'app_user_id'), auth.uid()::text, '');
  IF uid = '' THEN
    RETURN FALSE;
  END IF;
  SELECT CASE perm_action
    WHEN 'view' THEN p.can_view
    WHEN 'insert' THEN p.can_view AND p.can_insert
    WHEN 'update' THEN p.can_view AND p.can_update
    WHEN 'delete' THEN p.can_view AND p.can_delete
    WHEN 'print' THEN p.can_view AND p.can_print
    WHEN 'export' THEN p.can_view AND p.can_export
    ELSE FALSE
  END INTO allowed
  FROM public.user_department_permissions p
  JOIN public.app_users u ON u.id = p.user_id
  WHERE p.user_id = uid AND p.department_id = dept_id AND u.is_active = TRUE
  LIMIT 1;

  RETURN COALESCE(allowed, FALSE);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- سياسات القراءة والكتابة الآمنة على مستوى الصف (RLS Policies - Granular & Branch Isolated, Fail-Closed)
DO $$
DECLARE
  tbl TEXT;
  all_tables TEXT[] := ARRAY[
    'branches', 'villages', 'bakeries', 'debts', 'app_users',
    'app_departments', 'user_department_permissions',
    'daily_tasks', 'inbox_messages', 'high_debt_alerts',
    'system_config', 'dropdown_lists', 'audit_logs', 'backup_snapshots'
  ];
BEGIN
  FOREACH tbl IN ARRAY all_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Tamween read policy on %s" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Tamween write policy on %s" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Tamween update policy on %s" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Tamween delete policy on %s" ON public.%I', tbl, tbl);

    IF tbl = 'audit_logs' THEN
      -- سجل المراجعة غير قابل للتعديل أو الحذف لأي مستخدم، والقراءة متاحة فقط لـ Super Admin
      EXECUTE 'CREATE POLICY "Tamween read policy on audit_logs" ON public.audit_logs FOR SELECT USING (public.is_tamween_super_admin())';
      EXECUTE 'CREATE POLICY "Tamween write policy on audit_logs" ON public.audit_logs FOR INSERT WITH CHECK (auth.role() = ''authenticated'')';
    ELSIF tbl = 'branches' THEN
      EXECUTE 'CREATE POLICY "Tamween read policy on branches" ON public.branches FOR SELECT USING (public.can_access_branch(id))';
      EXECUTE 'CREATE POLICY "Tamween write policy on branches" ON public.branches FOR ALL USING (public.is_tamween_super_admin()) WITH CHECK (public.is_tamween_super_admin())';
    ELSIF tbl = 'app_departments' THEN
      EXECUTE 'CREATE POLICY "Tamween read policy on app_departments" ON public.app_departments FOR SELECT USING (auth.role() = ''authenticated'')';
      EXECUTE 'CREATE POLICY "Tamween write policy on app_departments" ON public.app_departments FOR ALL USING (public.is_tamween_super_admin()) WITH CHECK (public.is_tamween_super_admin())';
    ELSIF tbl IN ('app_users', 'system_config', 'user_department_permissions', 'backup_snapshots') THEN
      EXECUTE format(
        'CREATE POLICY "Tamween read policy on %s" ON public.%I FOR SELECT USING (public.is_tamween_super_admin() OR public.can_access_branch(branch_id))',
        tbl, tbl
      );
      EXECUTE format(
        'CREATE POLICY "Tamween write policy on %s" ON public.%I FOR ALL USING (public.is_tamween_super_admin()) WITH CHECK (public.is_tamween_super_admin())',
        tbl, tbl
      );
    ELSIF tbl = 'bakeries' THEN
      EXECUTE 'CREATE POLICY "Tamween read policy on bakeries" ON public.bakeries FOR SELECT USING (public.can_access_branch(branch_id) AND (public.has_department_permission(''bakeries'', ''view'') OR public.has_department_permission(''debts'', ''view'') OR public.has_department_permission(''reports'', ''view'')))';
      EXECUTE 'CREATE POLICY "Tamween write policy on bakeries" ON public.bakeries FOR INSERT WITH CHECK (public.can_access_branch(branch_id) AND public.has_department_permission(''bakeries'', ''insert''))';
      EXECUTE 'CREATE POLICY "Tamween update policy on bakeries" ON public.bakeries FOR UPDATE USING (public.can_access_branch(branch_id) AND public.has_department_permission(''bakeries'', ''update'')) WITH CHECK (public.can_access_branch(branch_id) AND public.has_department_permission(''bakeries'', ''update''))';
      EXECUTE 'CREATE POLICY "Tamween delete policy on bakeries" ON public.bakeries FOR DELETE USING (public.can_access_branch(branch_id) AND public.has_department_permission(''bakeries'', ''delete''))';
    ELSIF tbl = 'debts' THEN
      EXECUTE 'CREATE POLICY "Tamween read policy on debts" ON public.debts FOR SELECT USING (public.can_access_branch(branch_id) AND (public.has_department_permission(''debts'', ''view'') OR public.has_department_permission(''reports'', ''view'')))';
      EXECUTE 'CREATE POLICY "Tamween write policy on debts" ON public.debts FOR INSERT WITH CHECK (public.can_access_branch(branch_id) AND public.has_department_permission(''debts'', ''insert''))';
      EXECUTE 'CREATE POLICY "Tamween update policy on debts" ON public.debts FOR UPDATE USING (public.can_access_branch(branch_id) AND public.has_department_permission(''debts'', ''update'')) WITH CHECK (public.can_access_branch(branch_id) AND public.has_department_permission(''debts'', ''update''))';
      EXECUTE 'CREATE POLICY "Tamween delete policy on debts" ON public.debts FOR DELETE USING (public.can_access_branch(branch_id) AND public.has_department_permission(''debts'', ''delete''))';
    ELSE
      EXECUTE format(
        'CREATE POLICY "Tamween read policy on %s" ON public.%I FOR SELECT USING (public.can_access_branch(branch_id))',
        tbl, tbl
      );
      EXECUTE format(
        'CREATE POLICY "Tamween write policy on %s" ON public.%I FOR INSERT WITH CHECK (public.can_access_branch(branch_id) AND public.is_tamween_authorized_writer())',
        tbl, tbl
      );
      EXECUTE format(
        'CREATE POLICY "Tamween update policy on %s" ON public.%I FOR UPDATE USING (public.can_access_branch(branch_id) AND public.is_tamween_authorized_writer()) WITH CHECK (public.can_access_branch(branch_id) AND public.is_tamween_authorized_writer())',
        tbl, tbl
      );
      EXECUTE format(
        'CREATE POLICY "Tamween delete policy on %s" ON public.%I FOR DELETE USING (public.can_access_branch(branch_id) AND public.is_tamween_authorized_writer())',
        tbl, tbl
      );
    END IF;
  END LOOP;
END $$;

-- =========================================================================
-- تفعيل المزامنة اللحظية (Supabase Realtime Replication) لجميع الجداول
-- =========================================================================
ALTER TABLE public.branches REPLICA IDENTITY FULL;
ALTER TABLE public.villages REPLICA IDENTITY FULL;
ALTER TABLE public.bakeries REPLICA IDENTITY FULL;
ALTER TABLE public.debts REPLICA IDENTITY FULL;
ALTER TABLE public.app_users REPLICA IDENTITY FULL;
ALTER TABLE public.daily_tasks REPLICA IDENTITY FULL;
ALTER TABLE public.inbox_messages REPLICA IDENTITY FULL;
ALTER TABLE public.high_debt_alerts REPLICA IDENTITY FULL;
ALTER TABLE public.system_config REPLICA IDENTITY FULL;
ALTER TABLE public.dropdown_lists REPLICA IDENTITY FULL;
ALTER TABLE public.backup_snapshots REPLICA IDENTITY FULL;

DO $$
DECLARE
  rt_tbl TEXT;
  rt_tables TEXT[] := ARRAY[
    'branches', 'villages', 'bakeries', 'debts', 'app_users',
    'daily_tasks', 'inbox_messages', 'high_debt_alerts',
    'system_config', 'dropdown_lists', 'backup_snapshots'
  ];
BEGIN
  FOREACH rt_tbl IN ARRAY rt_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = rt_tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', rt_tbl);
    END IF;
  END LOOP;
END $$;

-- =========================================================================
-- إعداد حاوية التخزين السحابي (Supabase Storage Bucket) وسياسات الوصول الآمنة (Authenticated Only)
-- =========================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('tamween-backups', 'tamween-backups', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Tamween storage read policy" ON storage.objects;
CREATE POLICY "Tamween storage read policy" ON storage.objects
  FOR SELECT USING (bucket_id = 'tamween-backups' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Tamween storage insert policy" ON storage.objects;
CREATE POLICY "Tamween storage insert policy" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'tamween-backups' AND auth.role() = 'authenticated' AND public.is_tamween_authorized_writer());

DROP POLICY IF EXISTS "Tamween storage update policy" ON storage.objects;
CREATE POLICY "Tamween storage update policy" ON storage.objects
  FOR UPDATE USING (bucket_id = 'tamween-backups' AND auth.role() = 'authenticated' AND public.is_tamween_authorized_writer())
  WITH CHECK (bucket_id = 'tamween-backups' AND auth.role() = 'authenticated' AND public.is_tamween_authorized_writer());

DROP POLICY IF EXISTS "Tamween storage delete policy" ON storage.objects;
CREATE POLICY "Tamween storage delete policy" ON storage.objects
  FOR DELETE USING (bucket_id = 'tamween-backups' AND auth.role() = 'authenticated' AND public.is_tamween_super_admin());


