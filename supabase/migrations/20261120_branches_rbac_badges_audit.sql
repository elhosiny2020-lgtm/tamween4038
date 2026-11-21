-- =========================================================================
-- Migration: 20261120_branches_rbac_badges_audit.sql
-- Purpose:
--   1. Multi-Branch Independent Departments table (branch_departments)
--   2. Granular Roles & Permissions tables (roles, role_permissions) + extended columns
--   3. Strict Super Admin non-auto-escalation in RLS
--   4. Immutable Audit Log trigger (blocks UPDATE & DELETE on audit_logs)
--   5. Transactional RPCs:
--        - rpc_create_branch_from_template (clones Mahalla structure with 0 operational rows)
--        - rpc_reset_department_data (wipes 1 section in 1 branch, keeps structure & settings)
--        - rpc_reset_branch_data (double-confirmed full branch operational wipe)
--        - rpc_get_branch_sidebar_counts (optimized COUNT queries excluding deleted/inactive + period filter)
--   6. Supabase Realtime publication for new tables
-- =========================================================================

-- 1. جدول أقسام الفروع المستقلة (Per-Branch Departments)
CREATE TABLE IF NOT EXISTS public.branch_departments (
  id TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  department_key TEXT NOT NULL,
  label TEXT NOT NULL,
  short_label TEXT DEFAULT '',
  icon_key TEXT DEFAULT 'folder',
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 1,
  sub_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (branch_id, id)
);

CREATE INDEX IF NOT EXISTS idx_branch_departments_branch_order
  ON public.branch_departments(branch_id, sort_order);

-- 2. جداول الأدوار والصلاحيات التفصيلية (Roles & Granular Permissions)
CREATE TABLE IF NOT EXISTS public.roles (
  id TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label_ar TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_custom BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (branch_id, id)
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL,
  department_id TEXT NOT NULL DEFAULT 'all',
  can_view BOOLEAN NOT NULL DEFAULT FALSE,
  can_insert BOOLEAN NOT NULL DEFAULT FALSE,
  can_update BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete BOOLEAN NOT NULL DEFAULT FALSE,
  can_print BOOLEAN NOT NULL DEFAULT FALSE,
  can_export BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_users BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_departments BOOLEAN NOT NULL DEFAULT FALSE,
  can_factory_reset_section BOOLEAN NOT NULL DEFAULT FALSE,
  can_factory_reset_branch BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_role_permissions_branch_role_dept UNIQUE (branch_id, role_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_branch
  ON public.role_permissions(branch_id, role_id);

-- 3. توسيع جدول صلاحيات المستخدم التفصيلية بالصلاحيات الإدارية وإعادة الضبط
ALTER TABLE public.user_department_permissions
  ADD COLUMN IF NOT EXISTS can_manage_users BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_manage_departments BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_factory_reset_section BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_factory_reset_branch BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. أعمدة اختيارية للاستبعاد المنطقي للبيانات غير النشطة أو المحذوفة (لدعم استعلامات COUNT المحسّنة)
ALTER TABLE public.bakeries
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.debts
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

-- فهارس محسّنة لاستعلامات COUNT الخاصة بالشارات الرقمية في القائمة الجانبية
CREATE INDEX IF NOT EXISTS idx_bakeries_branch_active_count
  ON public.bakeries(branch_id) WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_debts_branch_active_period_count
  ON public.debts(branch_id, violation_date) WHERE is_deleted = FALSE;

-- 5. تفعيل RLS الصارم على الجداول الجديدة
ALTER TABLE public.branch_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_departments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions FORCE ROW LEVEL SECURITY;

-- 6. تشديد دالة Super Admin: لا يُمنح Super Admin تلقائياً لدور admin العادي
CREATE OR REPLACE FUNCTION public.is_tamween_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN auth.role() = 'authenticated'
    AND (
      COALESCE((auth.jwt() -> 'app_metadata' ->> 'app_role'), '') = 'super_admin'
      OR COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_super_admin'), 'false') = 'true'
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 7. توسيع دالة فحص الصلاحيات التفصيلية لتشمل إدارة المستخدمين والأقسام وإعادة ضبط المصنع
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
    WHEN 'manage_users' THEN p.can_manage_users
    WHEN 'manage_departments' THEN p.can_manage_departments
    WHEN 'factory_reset_section' THEN p.can_factory_reset_section
    WHEN 'factory_reset_branch' THEN p.can_factory_reset_branch
    ELSE FALSE
  END INTO allowed
  FROM public.user_department_permissions p
  JOIN public.app_users u ON u.id = p.user_id
  WHERE p.user_id = uid
    AND (p.department_id = dept_id OR p.department_id = 'all')
    AND u.is_active = TRUE
  ORDER BY (CASE WHEN p.department_id = dept_id THEN 0 ELSE 1 END)
  LIMIT 1;

  RETURN COALESCE(allowed, FALSE);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 8. سياسات RLS على branch_departments و roles و role_permissions
DROP POLICY IF EXISTS "Tamween read policy on branch_departments" ON public.branch_departments;
DROP POLICY IF EXISTS "Tamween write policy on branch_departments" ON public.branch_departments;
CREATE POLICY "Tamween read policy on branch_departments"
  ON public.branch_departments FOR SELECT
  USING (public.can_access_branch(branch_id));
CREATE POLICY "Tamween write policy on branch_departments"
  ON public.branch_departments FOR ALL
  USING (
    public.can_access_branch(branch_id)
    AND (public.is_tamween_super_admin() OR public.has_department_permission('all', 'manage_departments'))
  )
  WITH CHECK (
    public.can_access_branch(branch_id)
    AND (public.is_tamween_super_admin() OR public.has_department_permission('all', 'manage_departments'))
  );

DROP POLICY IF EXISTS "Tamween read policy on roles" ON public.roles;
DROP POLICY IF EXISTS "Tamween write policy on roles" ON public.roles;
CREATE POLICY "Tamween read policy on roles"
  ON public.roles FOR SELECT
  USING (public.can_access_branch(branch_id));
CREATE POLICY "Tamween write policy on roles"
  ON public.roles FOR ALL
  USING (
    public.can_access_branch(branch_id)
    AND (public.is_tamween_super_admin() OR public.has_department_permission('all', 'manage_users'))
  )
  WITH CHECK (
    public.can_access_branch(branch_id)
    AND (public.is_tamween_super_admin() OR public.has_department_permission('all', 'manage_users'))
  );

DROP POLICY IF EXISTS "Tamween read policy on role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Tamween write policy on role_permissions" ON public.role_permissions;
CREATE POLICY "Tamween read policy on role_permissions"
  ON public.role_permissions FOR SELECT
  USING (public.can_access_branch(branch_id));
CREATE POLICY "Tamween write policy on role_permissions"
  ON public.role_permissions FOR ALL
  USING (
    public.can_access_branch(branch_id)
    AND (public.is_tamween_super_admin() OR public.has_department_permission('all', 'manage_users'))
  )
  WITH CHECK (
    public.can_access_branch(branch_id)
    AND (public.is_tamween_super_admin() OR public.has_department_permission('all', 'manage_users'))
  );

-- 9. حماية سجل المراجعة (Immutable Audit Log) ضد أي تعديل أو حذف على مستوى PostgreSQL Trigger + RLS
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'سجل المراجعة محمي بشكل صارم ضد التعديل والحذف (Immutable Audit Log Violation on %).', TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_deletion_security_log'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_deletion_security_immutable ON public.audit_deletion_security_log';
    EXECUTE 'CREATE TRIGGER trg_audit_deletion_security_immutable BEFORE UPDATE OR DELETE ON public.audit_deletion_security_log FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation()';
  END IF;
END $$;

DROP POLICY IF EXISTS "Tamween update policy on audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Tamween delete policy on audit_logs" ON public.audit_logs;
CREATE POLICY "Tamween update policy on audit_logs"
  ON public.audit_logs FOR UPDATE USING (FALSE);
CREATE POLICY "Tamween delete policy on audit_logs"
  ON public.audit_logs FOR DELETE USING (FALSE);

-- 10. دالة RPC معاملاتية لإنشاء فرع جديد بنسخ هيكل الأقسام والإعدادات من المحلة الكبرى دون نسخ أي بيانات تشغيلية
CREATE OR REPLACE FUNCTION public.rpc_create_branch_from_template(
  p_branch_id TEXT,
  p_name TEXT,
  p_directorate TEXT DEFAULT 'مديرية التموين والتجارة الداخلية بالغربية',
  p_governorate TEXT DEFAULT 'محافظة الغربية',
  p_description TEXT DEFAULT '',
  p_source_branch_id TEXT DEFAULT 'branch-mahalla'
)
RETURNS JSONB AS $$
DECLARE
  v_actor TEXT := COALESCE((auth.jwt() -> 'app_metadata' ->> 'username'), auth.uid()::text, 'system');
  v_src_cfg RECORD;
BEGIN
  IF NOT public.is_tamween_super_admin() THEN
    RAISE EXCEPTION 'إنشاء الفروع الجديدة مقصور على مدير عام النظام (Super Admin) فقط.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.branches (id, name, directorate_title, governorate_title, description, is_default)
  VALUES (p_branch_id, p_name, p_directorate, p_governorate, p_description, FALSE)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    directorate_title = EXCLUDED.directorate_title,
    governorate_title = EXCLUDED.governorate_title,
    description = EXCLUDED.description,
    updated_at = NOW();

  -- نسخ هيكل الإعدادات ومسميات الأعمدة دون أي بيانات تشغيلية
  SELECT * INTO v_src_cfg FROM public.system_config WHERE branch_id = p_source_branch_id LIMIT 1;
  INSERT INTO public.system_config (
    branch_id, governorate_title, directorate_title, administration_title,
    english_subtitle, debt_alert_threshold, daily_alert_config,
    role_permissions, role_labels, custom_roles, column_titles, activity_statuses
  )
  VALUES (
    p_branch_id,
    p_governorate,
    p_directorate,
    p_name,
    COALESCE(v_src_cfg.english_subtitle, ''),
    COALESCE(v_src_cfg.debt_alert_threshold, 50000),
    COALESCE(v_src_cfg.daily_alert_config, '{}'::jsonb),
    COALESCE(v_src_cfg.role_permissions, '{}'::jsonb),
    COALESCE(v_src_cfg.role_labels, '{}'::jsonb),
    COALESCE(v_src_cfg.custom_roles, '[]'::jsonb),
    COALESCE(v_src_cfg.column_titles, '{}'::jsonb),
    COALESCE(v_src_cfg.activity_statuses, '[]'::jsonb)
  )
  ON CONFLICT (branch_id) DO NOTHING;

  -- نسخ هيكل الأقسام المستقل من فرع المحلة الكبرى
  INSERT INTO public.branch_departments (
    id, branch_id, department_key, label, short_label, icon_key,
    visible, enabled, sort_order, sub_items, default_permissions
  )
  SELECT
    id, p_branch_id, department_key, label, short_label, icon_key,
    visible, enabled, sort_order, sub_items, default_permissions
  FROM public.branch_departments
  WHERE branch_id = p_source_branch_id
  ON CONFLICT (branch_id, id) DO NOTHING;

  -- تسجيل عملية إنشاء الفرع في سجل المراجعة المحمي
  INSERT INTO public.audit_logs (branch_id, user_email, username, department, operation, record_id, result, action, details)
  VALUES (
    p_branch_id, v_actor, v_actor, 'branches', 'CREATE_BRANCH', p_branch_id,
    'SUCCESS', 'CREATE_BRANCH_FROM_TEMPLATE',
    format('إنشاء فرع جديد (%s) بنسخ الهيكل والإعدادات من (%s) بدون أي بيانات تشغيلية.', p_name, p_source_branch_id)
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'branchId', p_branch_id,
    'operationalRowsCopied', 0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 11. دالة RPC معاملاتية لإعادة ضبط المصنع لبيانات قسم محدد داخل فرع محدد
CREATE OR REPLACE FUNCTION public.rpc_reset_department_data(
  p_branch_id TEXT,
  p_section_key TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_actor TEXT := COALESCE((auth.jwt() -> 'app_metadata' ->> 'username'), auth.uid()::text, 'system');
  v_deleted_bakeries INTEGER := 0;
  v_deleted_debts INTEGER := 0;
BEGIN
  IF NOT (
    public.can_access_branch(p_branch_id)
    AND (
      public.is_tamween_super_admin()
      OR public.has_department_permission(p_section_key, 'factory_reset_section')
    )
  ) THEN
    RAISE EXCEPTION 'صلاحية إعادة ضبط المصنع للقسم مطلوبة ومقصورة على المخوّلين فقط.' USING ERRCODE = '42501';
  END IF;

  IF p_section_key = 'bakeries' THEN
    DELETE FROM public.debts WHERE branch_id = p_branch_id;
    GET DIAGNOSTICS v_deleted_debts = ROW_COUNT;
    DELETE FROM public.bakeries WHERE branch_id = p_branch_id;
    GET DIAGNOSTICS v_deleted_bakeries = ROW_COUNT;
    DELETE FROM public.high_debt_alerts WHERE branch_id = p_branch_id;
  ELSIF p_section_key = 'debts' THEN
    DELETE FROM public.debts WHERE branch_id = p_branch_id;
    GET DIAGNOSTICS v_deleted_debts = ROW_COUNT;
    DELETE FROM public.high_debt_alerts WHERE branch_id = p_branch_id;
  END IF;

  INSERT INTO public.audit_logs (branch_id, user_email, username, department, operation, record_id, result, action, details)
  VALUES (
    p_branch_id, v_actor, v_actor, p_section_key, 'SECTION_FACTORY_RESET', p_section_key,
    'SUCCESS', 'SECTION_FACTORY_RESET',
    format('إعادة ضبط المصنع لبيانات قسم (%s) داخل الفرع (%s) مع الإبقاء التام على الهيكل والإعدادات.', p_section_key, p_branch_id)
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'branchId', p_branch_id,
    'sectionKey', p_section_key,
    'deletedBakeries', v_deleted_bakeries,
    'deletedDebts', v_deleted_debts
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 12. دالة RPC معاملاتية لتصفير جميع بيانات الفرع التشغيلية بتأكيد مزدوج مع الإبقاء على الأقسام والمستخدمين والإعدادات
CREATE OR REPLACE FUNCTION public.rpc_reset_branch_data(
  p_branch_id TEXT,
  p_confirm_first BOOLEAN,
  p_confirm_double BOOLEAN
)
RETURNS JSONB AS $$
DECLARE
  v_actor TEXT := COALESCE((auth.jwt() -> 'app_metadata' ->> 'username'), auth.uid()::text, 'system');
  v_deleted_bakeries INTEGER := 0;
  v_deleted_debts INTEGER := 0;
  v_deleted_tasks INTEGER := 0;
  v_deleted_msgs INTEGER := 0;
BEGIN
  IF NOT (p_confirm_first IS TRUE AND p_confirm_double IS TRUE) THEN
    RAISE EXCEPTION 'يلزم التأكيد المزدوج (confirm_first & confirm_double) لتصفير جميع بيانات الفرع.' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.can_access_branch(p_branch_id)
    AND (
      public.is_tamween_super_admin()
      OR public.has_department_permission('all', 'factory_reset_branch')
    )
  ) THEN
    RAISE EXCEPTION 'صلاحية تصفير جميع بيانات الفرع مقصورة على مدير النظام المخوّل فقط.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.debts WHERE branch_id = p_branch_id;
  GET DIAGNOSTICS v_deleted_debts = ROW_COUNT;

  DELETE FROM public.bakeries WHERE branch_id = p_branch_id;
  GET DIAGNOSTICS v_deleted_bakeries = ROW_COUNT;

  DELETE FROM public.high_debt_alerts WHERE branch_id = p_branch_id;

  DELETE FROM public.daily_tasks WHERE branch_id = p_branch_id;
  GET DIAGNOSTICS v_deleted_tasks = ROW_COUNT;

  DELETE FROM public.inbox_messages WHERE branch_id = p_branch_id;
  GET DIAGNOSTICS v_deleted_msgs = ROW_COUNT;

  -- لاحظ: لا يتم المساس بجداول branches أو branch_departments أو app_users أو system_config أو roles
  INSERT INTO public.audit_logs (branch_id, user_email, username, department, operation, record_id, result, action, details)
  VALUES (
    p_branch_id, v_actor, v_actor, 'branches', 'BRANCH_FACTORY_RESET', p_branch_id,
    'SUCCESS', 'BRANCH_FACTORY_RESET',
    format('تصفير جميع البيانات التشغيلية للفرع (%s) بتأكيد مزدوج (مخابز: %s، مديونيات: %s) مع الإبقاء التام على الأقسام والمستخدمين والإعدادات.', p_branch_id, v_deleted_bakeries, v_deleted_debts)
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'branchId', p_branch_id,
    'deletedBakeries', v_deleted_bakeries,
    'deletedDebts', v_deleted_debts,
    'deletedTasks', v_deleted_tasks,
    'deletedMessages', v_deleted_msgs
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 13. دالة RPC محسّنة لاستعلامات COUNT الخاصة بشارات القائمة الجانبية (مستقلة لكل فرع وتستبعد المحذوف/غير النشط)
CREATE OR REPLACE FUNCTION public.rpc_get_branch_sidebar_counts(
  p_branch_id TEXT,
  p_month INTEGER DEFAULT NULL,
  p_year INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_bakeries_count INTEGER := 0;
  v_codes_count INTEGER := 0;
  v_phones_count INTEGER := 0;
  v_debts_count INTEGER := 0;
  v_large_debts_count INTEGER := 0;
  v_pending_tasks_count INTEGER := 0;
  v_period_prefix TEXT := NULL;
BEGIN
  IF NOT public.can_access_branch(p_branch_id) THEN
    RAISE EXCEPTION 'غير مصرح بالوصول لإحصائيات هذا الفرع.' USING ERRCODE = '42501';
  END IF;

  IF p_year IS NOT NULL AND p_month IS NOT NULL THEN
    v_period_prefix := lpad(p_year::text, 4, '0') || '-' || lpad(p_month::text, 2, '0');
  ELSIF p_year IS NOT NULL THEN
    v_period_prefix := lpad(p_year::text, 4, '0');
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE COALESCE(is_deleted, FALSE) = FALSE AND COALESCE(activity_status, '') NOT IN ('محذوف', 'ملغى نهائياً')),
    COUNT(DISTINCT NULLIF(trim(machine_number), '')) FILTER (WHERE COALESCE(is_deleted, FALSE) = FALSE AND COALESCE(activity_status, '') NOT IN ('محذوف', 'ملغى نهائياً')),
    COUNT(*) FILTER (WHERE COALESCE(is_deleted, FALSE) = FALSE AND COALESCE(activity_status, '') NOT IN ('محذوف', 'ملغى نهائياً') AND length(trim(COALESCE(phone, ''))) >= 8)
  INTO v_bakeries_count, v_codes_count, v_phones_count
  FROM public.bakeries
  WHERE branch_id = p_branch_id;

  SELECT
    COUNT(*) FILTER (
      WHERE COALESCE(is_deleted, FALSE) = FALSE
        AND (v_period_prefix IS NULL OR violation_date LIKE (v_period_prefix || '%'))
    ),
    COUNT(*) FILTER (
      WHERE COALESCE(is_deleted, FALSE) = FALSE
        AND net_remaining_debt > 20000
        AND (v_period_prefix IS NULL OR violation_date LIKE (v_period_prefix || '%'))
    )
  INTO v_debts_count, v_large_debts_count
  FROM public.debts
  WHERE branch_id = p_branch_id;

  SELECT COUNT(*)
  INTO v_pending_tasks_count
  FROM public.daily_tasks
  WHERE branch_id = p_branch_id AND COALESCE(status, 'pending') <> 'completed';

  RETURN jsonb_build_object(
    'branchId', p_branch_id,
    'periodMonth', p_month,
    'periodYear', p_year,
    'bakeriesCount', COALESCE(v_bakeries_count, 0),
    'codesCount', COALESCE(v_codes_count, 0),
    'phonesCount', COALESCE(v_phones_count, 0),
    'debtsCount', COALESCE(v_debts_count, 0),
    'largeDebtsCount', COALESCE(v_large_debts_count, 0),
    'pendingTasksCount', COALESCE(v_pending_tasks_count, 0)
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 14. تفعيل المزامنة اللحظية (Supabase Realtime) للجداول الجديدة
ALTER TABLE public.branch_departments REPLICA IDENTITY FULL;
ALTER TABLE public.roles REPLICA IDENTITY FULL;
ALTER TABLE public.role_permissions REPLICA IDENTITY FULL;

DO $$
DECLARE
  rt_tbl TEXT;
  rt_tables TEXT[] := ARRAY['branch_departments', 'roles', 'role_permissions'];
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
