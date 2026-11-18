-- =========================================================================
-- Migration: 20261118_security_rls_hardening.sql
-- Hardens PostgreSQL/Supabase RLS, enables FORCE ROW LEVEL SECURITY across
-- all tables (including branch_module_states & audit_deletion_security_log),
-- isolates rows per branch_id, and removes anonymous storage bucket access.
-- =========================================================================

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

-- Enable + Force RLS on every table present in public schema
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rec.tablename);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', rec.tablename);
  END LOOP;
END $$;

-- Harden audit_deletion_security_log if present (immutable append-only for authenticated, read/delete blocked for non-super-admins)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_deletion_security_log'
  ) THEN
    DROP POLICY IF EXISTS "Tamween read policy on audit_deletion_security_log" ON public.audit_deletion_security_log;
    DROP POLICY IF EXISTS "Tamween write policy on audit_deletion_security_log" ON public.audit_deletion_security_log;
    CREATE POLICY "Tamween read policy on audit_deletion_security_log"
      ON public.audit_deletion_security_log
      FOR SELECT USING (public.is_tamween_super_admin());
    CREATE POLICY "Tamween write policy on audit_deletion_security_log"
      ON public.audit_deletion_security_log
      FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Harden branch_module_states if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'branch_module_states'
  ) THEN
    DROP POLICY IF EXISTS "Tamween module read on branch_module_states" ON public.branch_module_states;
    DROP POLICY IF EXISTS "Tamween module insert on branch_module_states" ON public.branch_module_states;
    DROP POLICY IF EXISTS "Tamween module update on branch_module_states" ON public.branch_module_states;
    DROP POLICY IF EXISTS "Tamween module delete on branch_module_states" ON public.branch_module_states;
    CREATE POLICY "Tamween module read on branch_module_states"
      ON public.branch_module_states
      FOR SELECT USING (public.can_access_branch(branch_id));
    CREATE POLICY "Tamween module insert on branch_module_states"
      ON public.branch_module_states
      FOR INSERT WITH CHECK (public.can_access_branch(branch_id) AND public.is_tamween_authorized_writer());
    CREATE POLICY "Tamween module update on branch_module_states"
      ON public.branch_module_states
      FOR UPDATE USING (public.can_access_branch(branch_id) AND public.is_tamween_authorized_writer())
      WITH CHECK (public.can_access_branch(branch_id) AND public.is_tamween_authorized_writer());
    CREATE POLICY "Tamween module delete on branch_module_states"
      ON public.branch_module_states
      FOR DELETE USING (public.is_tamween_super_admin());
  END IF;
END $$;

-- Revoke anonymous access on Supabase Storage tamween-backups bucket
UPDATE storage.buckets SET public = false WHERE id = 'tamween-backups';

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
