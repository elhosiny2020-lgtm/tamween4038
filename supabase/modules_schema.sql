-- =========================================================================
-- المخطط العلائقي التوسعي لقاعدة بيانات Supabase (الأقسام التموينية المتكاملة)
-- 1) قسم السلع التموينية والتجارة التموينية والداخلية (20 جدولاً علائقياً)
-- 2) قسم صيانة الحبوب والصوامع والشون (11 جدولاً علائقياً)
-- 3) قسم الموارد البشرية وشؤون العاملين (24 جدولاً علائقياً)
-- 4) حزمة مزامنة الأقسام متعددة الفروع (branch_module_states)
-- يُضاف هذا الملف دون المساس بجداول المخابز والمديونيات الحالية.
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -------------------------------------------------------------------------
-- 1) جداول السلع التموينية والتجارة الداخلية (Supabase)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ration_merchants (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  serial_no INTEGER NOT NULL DEFAULT 1,
  merchant_name TEXT NOT NULL,
  owner_name TEXT NOT NULL DEFAULT '',
  activity_card_number TEXT DEFAULT '',
  pos_machine_number TEXT DEFAULT '',
  outlet_type TEXT NOT NULL DEFAULT 'تاجر تمويني',
  governorate TEXT DEFAULT 'الغربية',
  district TEXT DEFAULT 'المحلة الكبرى',
  village TEXT NOT NULL DEFAULT '',
  local_unit TEXT NOT NULL DEFAULT '',
  detailed_address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  national_id TEXT DEFAULT '',
  commercial_reg_number TEXT DEFAULT '',
  tax_card_number TEXT DEFAULT '',
  license_number TEXT DEFAULT '',
  license_issue_date TEXT DEFAULT '',
  license_expiry_date TEXT DEFAULT '',
  cash_insurance_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  linked_cards_count INTEGER NOT NULL DEFAULT 0,
  linked_beneficiaries_count INTEGER NOT NULL DEFAULT 0,
  activity_status TEXT NOT NULL DEFAULT 'نشط',
  wholesale_branch_name TEXT DEFAULT '',
  last_requisition_date TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ration_outlets (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  merchant_id TEXT REFERENCES public.ration_merchants(id) ON DELETE SET NULL,
  outlet_name TEXT NOT NULL,
  outlet_type TEXT NOT NULL,
  village TEXT DEFAULT '',
  local_unit TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'نشط',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ration_commodities (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'كيلو',
  pack_weight_grams_or_ml NUMERIC(12,2) DEFAULT 1000,
  official_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  free_market_ref_price NUMERIC(12,2) DEFAULT 0,
  supply_cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  profit_margin NUMERIC(12,2) DEFAULT 0,
  commission_type TEXT DEFAULT 'per_unit',
  commission_value NUMERIC(12,4) DEFAULT 0,
  max_per_beneficiary NUMERIC(12,4) DEFAULT 0,
  max_per_card NUMERIC(12,4) DEFAULT 0,
  monthly_quota_per_beneficiary NUMERIC(12,4) DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  supplier_company TEXT DEFAULT '',
  reorder_level NUMERIC(12,2) DEFAULT 50,
  decision_number TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_ration_commodity_branch_code UNIQUE (branch_id, code)
);

CREATE TABLE IF NOT EXISTS public.ration_goods (LIKE public.ration_commodities INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.ration_prices (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  commodity_id TEXT NOT NULL REFERENCES public.ration_commodities(id) ON DELETE CASCADE,
  official_price NUMERIC(12,2) NOT NULL,
  supply_cost_price NUMERIC(12,2) NOT NULL,
  profit_margin NUMERIC(12,2) DEFAULT 0,
  effective_from TEXT NOT NULL,
  effective_to TEXT DEFAULT '',
  decision_number TEXT DEFAULT '',
  updated_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ration_cards (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  merchant_id TEXT REFERENCES public.ration_merchants(id) ON DELETE SET NULL,
  card_number TEXT NOT NULL,
  head_of_family_name TEXT NOT NULL,
  head_national_id TEXT DEFAULT '',
  village TEXT DEFAULT '',
  local_unit TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'سارية',
  has_additional_grant BOOLEAN DEFAULT FALSE,
  additional_grant_amount NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_ration_card_branch_num UNIQUE (branch_id, card_number)
);

CREATE TABLE IF NOT EXISTS public.ration_beneficiaries (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES public.ration_cards(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  national_id TEXT NOT NULL,
  relation TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'مستحق',
  suspension_reason TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.ration_quotas (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  commodity_id TEXT NOT NULL REFERENCES public.ration_commodities(id) ON DELETE CASCADE,
  quota_per_beneficiary NUMERIC(12,4) NOT NULL DEFAULT 0,
  max_per_card NUMERIC(12,4) NOT NULL DEFAULT 0,
  decision_number TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.ration_monthly_entitlements (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  card_id TEXT NOT NULL REFERENCES public.ration_cards(id) ON DELETE CASCADE,
  eligible_count INTEGER NOT NULL DEFAULT 0,
  support_budget NUMERIC(12,2) NOT NULL DEFAULT 0,
  additional_grant NUMERIC(12,2) NOT NULL DEFAULT 0,
  remaining_support NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.ration_disbursements (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  operation_number TEXT NOT NULL,
  month_key TEXT NOT NULL,
  card_id TEXT REFERENCES public.ration_cards(id) ON DELETE SET NULL,
  merchant_id TEXT REFERENCES public.ration_merchants(id) ON DELETE SET NULL,
  commodity_id TEXT REFERENCES public.ration_commodities(id) ON DELETE SET NULL,
  quantity NUMERIC(12,4) NOT NULL,
  official_unit_price NUMERIC(12,2) NOT NULL,
  total_sale_value NUMERIC(14,2) NOT NULL,
  support_deducted NUMERIC(14,2) NOT NULL DEFAULT 0,
  citizen_paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  commission_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_reversed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_ration_disb_op UNIQUE (branch_id, operation_number)
);

CREATE TABLE IF NOT EXISTS public.ration_warehouses (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  merchant_id TEXT NOT NULL,
  warehouse_name TEXT NOT NULL,
  commodity_id TEXT NOT NULL REFERENCES public.ration_commodities(id) ON DELETE CASCADE,
  opening_balance NUMERIC(14,4) NOT NULL DEFAULT 0,
  total_in NUMERIC(14,4) NOT NULL DEFAULT 0,
  total_out NUMERIC(14,4) NOT NULL DEFAULT 0,
  inbound_returns NUMERIC(14,4) NOT NULL DEFAULT 0,
  outbound_returns NUMERIC(14,4) NOT NULL DEFAULT 0,
  approved_adjustments NUMERIC(14,4) NOT NULL DEFAULT 0,
  reorder_level NUMERIC(14,4) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.ration_inventory_movements (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  document_number TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  commodity_id TEXT NOT NULL REFERENCES public.ration_commodities(id) ON DELETE CASCADE,
  quantity NUMERIC(14,4) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_before NUMERIC(14,4) NOT NULL DEFAULT 0,
  balance_after NUMERIC(14,4) NOT NULL DEFAULT 0,
  is_reversed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_ration_inv_doc UNIQUE (branch_id, document_number)
);

CREATE TABLE IF NOT EXISTS public.ration_requisitions (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  request_number TEXT NOT NULL,
  invoice_number TEXT DEFAULT '',
  month_key TEXT NOT NULL,
  merchant_id TEXT REFERENCES public.ration_merchants(id) ON DELETE CASCADE,
  total_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'جديد',
  lines_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_ration_req_num UNIQUE (branch_id, request_number)
);

CREATE TABLE IF NOT EXISTS public.ration_invoices (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  merchant_id TEXT REFERENCES public.ration_merchants(id) ON DELETE CASCADE,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  issued_date TEXT NOT NULL,
  CONSTRAINT uq_ration_inv_num UNIQUE (branch_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS public.ration_payments (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL,
  merchant_id TEXT REFERENCES public.ration_merchants(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ration_insurances (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  merchant_id TEXT REFERENCES public.ration_merchants(id) ON DELETE CASCADE,
  recorded_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  committed_amount NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.ration_settlements (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  document_number TEXT NOT NULL,
  merchant_id TEXT REFERENCES public.ration_merchants(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL,
  debit_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_approved BOOLEAN DEFAULT TRUE,
  is_reversed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ration_allocations (LIKE public.ration_quotas INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.ration_receipts (LIKE public.ration_inventory_movements INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.ration_sales (LIKE public.ration_disbursements INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.ration_returns (LIKE public.ration_inventory_movements INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.ration_stock_movements (LIKE public.ration_inventory_movements INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.ration_commissions (LIKE public.ration_settlements INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.ration_debts (LIKE public.ration_settlements INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.ration_adjustments (LIKE public.ration_settlements INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.ration_inventory (LIKE public.ration_warehouses INCLUDING ALL);

CREATE TABLE IF NOT EXISTS public.ration_inspections (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  merchant_id TEXT REFERENCES public.ration_merchants(id) ON DELETE SET NULL,
  inspector_name TEXT NOT NULL,
  inspection_date_time TEXT NOT NULL,
  inspection_result TEXT NOT NULL,
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.ration_violations (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  inspection_id TEXT REFERENCES public.ration_inspections(id) ON DELETE SET NULL,
  merchant_id TEXT REFERENCES public.ration_merchants(id) ON DELETE SET NULL,
  report_number TEXT NOT NULL,
  violation_type TEXT NOT NULL,
  financial_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  disposition_status TEXT NOT NULL DEFAULT 'قيد الفحص'
);

CREATE TABLE IF NOT EXISTS public.ration_complaints (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  ticket_number TEXT NOT NULL,
  citizen_name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'جديدة',
  details TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.ration_settings (
  branch_id TEXT PRIMARY KEY REFERENCES public.branches(id) ON DELETE CASCADE,
  active_month TEXT NOT NULL,
  support_per_beneficiary NUMERIC(12,2) NOT NULL DEFAULT 50,
  decision_number TEXT DEFAULT '',
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ration_audit_logs (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  action_type TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- 2) جداول صيانة الحبوب والصوامع والشون
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_assets (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  asset_code TEXT NOT NULL,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  silo_name TEXT NOT NULL,
  operational_status TEXT NOT NULL DEFAULT 'عاملة',
  purchase_value NUMERIC(14,2) DEFAULT 0,
  rated_capacity_ton_hr NUMERIC(10,2) DEFAULT 0,
  CONSTRAINT uq_maint_asset_code UNIQUE (branch_id, asset_code)
);

CREATE TABLE IF NOT EXISTS public.maintenance_technicians (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  specialty TEXT DEFAULT '',
  hourly_wage NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.maintenance_spare_parts (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  part_code TEXT NOT NULL,
  part_name TEXT NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  available_stock NUMERIC(12,2) NOT NULL DEFAULT 0,
  reorder_point NUMERIC(12,2) NOT NULL DEFAULT 0,
  CONSTRAINT uq_maint_part_code UNIQUE (branch_id, part_code)
);

CREATE TABLE IF NOT EXISTS public.maintenance_inventory (LIKE public.maintenance_spare_parts INCLUDING ALL);

CREATE TABLE IF NOT EXISTS public.maintenance_orders (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  asset_id TEXT REFERENCES public.maintenance_assets(id) ON DELETE CASCADE,
  maintenance_type TEXT NOT NULL,
  total_repair_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'جديد',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_maint_order_num UNIQUE (branch_id, order_number)
);

CREATE TABLE IF NOT EXISTS public.maintenance_tasks (LIKE public.maintenance_orders INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.maintenance_costs (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES public.maintenance_orders(id) ON DELETE CASCADE,
  direct_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  indirect_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.grain_movements (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  document_number TEXT NOT NULL,
  silo_name TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  original_weight_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  actual_moisture_pct NUMERIC(6,2) DEFAULT 12,
  reference_moisture_pct NUMERIC(6,2) DEFAULT 12,
  corrected_weight_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grain_stock (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  silo_name TEXT NOT NULL,
  grain_type TEXT NOT NULL,
  book_balance_tons NUMERIC(14,3) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.maintenance_alerts (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  message TEXT NOT NULL,
  is_resolved BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS public.maintenance_settings (
  branch_id TEXT PRIMARY KEY REFERENCES public.branches(id) ON DELETE CASCADE,
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- -------------------------------------------------------------------------
-- 3) جداول الموارد البشرية وشؤون العاملين
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.departments (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  manager_name TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.job_titles (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  title TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.job_grades (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  grade_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.employees (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  employee_code TEXT NOT NULL,
  national_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  department_name TEXT DEFAULT '',
  job_title TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'على رأس العمل',
  functional_wage NUMERIC(12,2) NOT NULL DEFAULT 0,
  complementary_wage NUMERIC(12,2) NOT NULL DEFAULT 0,
  CONSTRAINT uq_hr_emp_code UNIQUE (branch_id, employee_code),
  CONSTRAINT uq_hr_emp_nid UNIQUE (branch_id, national_id)
);

CREATE TABLE IF NOT EXISTS public.employee_personal_data (
  employee_id TEXT PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  birth_date TEXT DEFAULT '',
  gender TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.employee_documents (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  doc_ref TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  early_leave_minutes INTEGER NOT NULL DEFAULT 0,
  net_worked_minutes INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.leave_balances (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  previous_balance NUMERIC(8,2) DEFAULT 0,
  entitled_days NUMERIC(8,2) DEFAULT 0,
  used_days NUMERIC(8,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'جديد'
);

CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'معاينة',
  approved_by TEXT DEFAULT '',
  CONSTRAINT uq_hr_payroll_month UNIQUE (branch_id, month_key)
);

CREATE TABLE IF NOT EXISTS public.payroll_items (
  id TEXT PRIMARY KEY,
  period_id TEXT NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  gross_earnings NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_salary NUMERIC(14,2) NOT NULL DEFAULT 0,
  CONSTRAINT uq_hr_payroll_emp_period UNIQUE (period_id, employee_id)
);

CREATE TABLE IF NOT EXISTS public.allowances (id TEXT PRIMARY KEY, employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE, title TEXT, amount NUMERIC(12,2) DEFAULT 0);
CREATE TABLE IF NOT EXISTS public.incentives (id TEXT PRIMARY KEY, employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE, title TEXT, amount NUMERIC(12,2) DEFAULT 0);
CREATE TABLE IF NOT EXISTS public.deductions (id TEXT PRIMARY KEY, employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE, title TEXT, amount NUMERIC(12,2) DEFAULT 0);
CREATE TABLE IF NOT EXISTS public.insurance_records (id TEXT PRIMARY KEY, employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE, insurable_wage NUMERIC(12,2) DEFAULT 0, employee_share NUMERIC(12,2) DEFAULT 0, employer_share NUMERIC(12,2) DEFAULT 0);
CREATE TABLE IF NOT EXISTS public.tax_records (id TEXT PRIMARY KEY, employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE, annual_taxable NUMERIC(14,2) DEFAULT 0, monthly_tax NUMERIC(12,2) DEFAULT 0);
CREATE TABLE IF NOT EXISTS public.promotions (id TEXT PRIMARY KEY, employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE, next_grade TEXT, raise_amount NUMERIC(12,2) DEFAULT 0);
CREATE TABLE IF NOT EXISTS public.loans (id TEXT PRIMARY KEY, employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE, total_amount NUMERIC(14,2) DEFAULT 0, remaining_amount NUMERIC(14,2) DEFAULT 0);
CREATE TABLE IF NOT EXISTS public.loan_installments (id TEXT PRIMARY KEY, loan_id TEXT REFERENCES public.loans(id) ON DELETE CASCADE, installment_amount NUMERIC(12,2) DEFAULT 0, is_paid BOOLEAN DEFAULT FALSE);
CREATE TABLE IF NOT EXISTS public.employee_transfers (id TEXT PRIMARY KEY, employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE, destination_site TEXT, decision_no TEXT);
CREATE TABLE IF NOT EXISTS public.employee_evaluations (id TEXT PRIMARY KEY, employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE, score NUMERIC(5,2), year TEXT);
CREATE TABLE IF NOT EXISTS public.employee_service_history (id TEXT PRIMARY KEY, employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE, event_title TEXT, event_date TEXT);
CREATE TABLE IF NOT EXISTS public.hr_settings (branch_id TEXT PRIMARY KEY REFERENCES public.branches(id) ON DELETE CASCADE, settings_json JSONB NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS public.hr_audit_logs (id TEXT PRIMARY KEY, branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE, username TEXT, action_type TEXT, details TEXT, created_at TIMESTAMPTZ DEFAULT NOW());

-- -------------------------------------------------------------------------
-- 4) جدول حزمة حالة الأقسام التوسعية الموحّد لكل فرع (Branch Modules Bundle)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branch_module_states (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL DEFAULT 'all_modules',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by TEXT DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_branch_module_state UNIQUE (branch_id, module_key)
);

-- RLS Policies for all new module tables
DO $$
DECLARE
  tbl TEXT;
  module_tables TEXT[] := ARRAY[
    'ration_merchants', 'ration_outlets', 'ration_commodities', 'ration_goods',
    'ration_prices', 'ration_cards', 'ration_beneficiaries', 'ration_quotas',
    'ration_monthly_entitlements', 'ration_disbursements', 'ration_warehouses',
    'ration_inventory_movements', 'ration_requisitions', 'ration_invoices',
    'ration_payments', 'ration_insurances', 'ration_settlements',
    'ration_allocations', 'ration_receipts', 'ration_sales', 'ration_returns',
    'ration_stock_movements', 'ration_commissions', 'ration_debts',
    'ration_adjustments', 'ration_inventory', 'ration_inspections',
    'ration_violations', 'ration_complaints', 'ration_settings', 'ration_audit_logs',
    'maintenance_assets', 'maintenance_technicians', 'maintenance_spare_parts',
    'maintenance_inventory', 'maintenance_orders', 'maintenance_tasks',
    'maintenance_costs', 'grain_movements', 'grain_stock', 'maintenance_alerts',
    'maintenance_settings',
    'departments', 'job_titles', 'job_grades', 'employees', 'employee_personal_data',
    'employee_documents', 'attendance_records', 'leave_balances', 'leave_requests',
    'payroll_periods', 'payroll_items', 'allowances', 'incentives', 'deductions',
    'insurance_records', 'tax_records', 'promotions', 'loans', 'loan_installments',
    'employee_transfers', 'employee_evaluations', 'employee_service_history',
    'hr_settings', 'hr_audit_logs', 'branch_module_states'
  ];
BEGIN
  FOREACH tbl IN ARRAY module_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Tamween module read on %s" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Tamween module write on %s" ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY "Tamween module read on %s" ON public.%I FOR SELECT USING (auth.role() IN (''anon'', ''authenticated''))',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "Tamween module write on %s" ON public.%I FOR ALL USING (auth.role() IN (''anon'', ''authenticated'') AND public.is_tamween_authorized_writer()) WITH CHECK (auth.role() IN (''anon'', ''authenticated'') AND public.is_tamween_authorized_writer())',
      tbl, tbl
    );
  END LOOP;
END $$;
