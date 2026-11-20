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
-- 4) جداول قسم التجارة الداخلية والمركز الرقابي الموحد وتداول البوتاجاز والوقود
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ration_merchant_monthly_archives (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  title TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by TEXT DEFAULT '',
  total_merchants INTEGER NOT NULL DEFAULT 116,
  active_count INTEGER NOT NULL DEFAULT 0,
  stopped_count INTEGER NOT NULL DEFAULT 0,
  leave_count INTEGER NOT NULL DEFAULT 0,
  total_insurance NUMERIC(14,2) NOT NULL DEFAULT 0,
  snapshot_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  diff_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_merchant_archive_month UNIQUE (branch_id, month_key)
);

CREATE TABLE IF NOT EXISTS public.internal_trade_establishments (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  establishment_code TEXT NOT NULL,
  linked_bakery_id TEXT DEFAULT NULL,
  owner_name TEXT NOT NULL,
  establishment_name TEXT NOT NULL,
  national_id TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  secondary_phone TEXT DEFAULT '',
  governorate TEXT DEFAULT 'الغربية',
  center TEXT DEFAULT 'المحلة الكبرى',
  village TEXT NOT NULL DEFAULT '',
  local_unit TEXT NOT NULL DEFAULT '',
  detailed_address TEXT DEFAULT '',
  establishment_type TEXT NOT NULL DEFAULT 'محل تجاري',
  activity_type TEXT NOT NULL DEFAULT '',
  activity_category TEXT DEFAULT '',
  commercial_reg_number TEXT DEFAULT '',
  commercial_reg_issue_date TEXT DEFAULT '',
  commercial_reg_expiry_date TEXT DEFAULT '',
  tax_card_number TEXT DEFAULT '',
  tax_card_issue_date TEXT DEFAULT '',
  license_number TEXT DEFAULT '',
  license_issuing_entity TEXT DEFAULT '',
  license_issue_date TEXT DEFAULT '',
  license_expiry_date TEXT DEFAULT '',
  activity_status TEXT NOT NULL DEFAULT 'نشط',
  activity_start_date TEXT DEFAULT '',
  closure_reason TEXT DEFAULT '',
  closure_decision_no TEXT DEFAULT '',
  closure_date TEXT DEFAULT '',
  lat NUMERIC(10,6) DEFAULT NULL,
  lng NUMERIC(10,6) DEFAULT NULL,
  notes TEXT DEFAULT '',
  attachments_json JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_it_est_code UNIQUE (branch_id, establishment_code)
);

CREATE TABLE IF NOT EXISTS public.internal_trade_activities (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  activity_code TEXT NOT NULL,
  activity_name TEXT NOT NULL,
  activity_category TEXT NOT NULL,
  notes TEXT DEFAULT '',
  CONSTRAINT uq_it_activity_code UNIQUE (branch_id, activity_code)
);

CREATE TABLE IF NOT EXISTS public.internal_trade_licenses (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  establishment_id TEXT NOT NULL REFERENCES public.internal_trade_establishments(id) ON DELETE CASCADE,
  license_number TEXT NOT NULL,
  issuing_entity TEXT DEFAULT '',
  issue_date TEXT DEFAULT '',
  expiry_date TEXT DEFAULT '',
  commercial_reg_number TEXT DEFAULT '',
  tax_card_number TEXT DEFAULT '',
  status TEXT DEFAULT 'ساري'
);

CREATE TABLE IF NOT EXISTS public.internal_trade_campaigns (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  campaign_number TEXT NOT NULL,
  campaign_date TEXT NOT NULL,
  campaign_time TEXT DEFAULT '',
  campaign_type TEXT NOT NULL DEFAULT 'دورية',
  geographic_scope TEXT DEFAULT '',
  village TEXT DEFAULT '',
  local_unit TEXT DEFAULT '',
  campaign_head TEXT NOT NULL,
  inspected_count INTEGER NOT NULL DEFAULT 0,
  compliant_count INTEGER NOT NULL DEFAULT 0,
  violating_count INTEGER NOT NULL DEFAULT 0,
  reports_issued_count INTEGER NOT NULL DEFAULT 0,
  total_seizures_count INTEGER NOT NULL DEFAULT 0,
  total_reserved_qty_summary TEXT DEFAULT '',
  final_report_submitted BOOLEAN DEFAULT TRUE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_it_campaign_num UNIQUE (branch_id, campaign_number)
);

CREATE TABLE IF NOT EXISTS public.internal_trade_campaign_members (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES public.internal_trade_campaigns(id) ON DELETE CASCADE,
  member_name TEXT NOT NULL,
  job_role TEXT DEFAULT 'مفتش تموين وتجارة داخلية'
);

CREATE TABLE IF NOT EXISTS public.internal_trade_violations (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  report_number TEXT NOT NULL,
  report_date TEXT NOT NULL,
  report_time TEXT DEFAULT '',
  campaign_id TEXT REFERENCES public.internal_trade_campaigns(id) ON DELETE SET NULL,
  establishment_code TEXT NOT NULL,
  establishment_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  activity_type TEXT DEFAULT '',
  village TEXT DEFAULT '',
  local_unit TEXT DEFAULT '',
  violation_type TEXT NOT NULL,
  violation_description TEXT DEFAULT '',
  governing_law_or_decision TEXT DEFAULT '',
  legal_article TEXT DEFAULT '',
  fine_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  issuing_entity TEXT DEFAULT '',
  case_number TEXT DEFAULT '',
  prosecution_entity TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'جديد',
  disposition_result TEXT DEFAULT '',
  reconciliation_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_date TEXT DEFAULT '',
  payment_method TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_it_violation_num UNIQUE (branch_id, report_number)
);

CREATE TABLE IF NOT EXISTS public.internal_trade_seizures (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  seizure_order_number TEXT NOT NULL,
  linked_report_number TEXT NOT NULL,
  seizure_date TEXT NOT NULL,
  establishment_code TEXT DEFAULT '',
  establishment_name TEXT NOT NULL,
  owner_name TEXT DEFAULT '',
  village TEXT DEFAULT '',
  commodity_type TEXT NOT NULL,
  commodity_description TEXT DEFAULT '',
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'كجم',
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  storage_location TEXT DEFAULT '',
  seizure_status TEXT NOT NULL DEFAULT 'متحفظ عليها',
  disposition_date TEXT DEFAULT '',
  disposition_entity TEXT DEFAULT '',
  disposition_result TEXT DEFAULT '',
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.internal_trade_complaints (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  complaint_number TEXT NOT NULL,
  received_date TEXT NOT NULL,
  source TEXT NOT NULL,
  complainant_name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  subject TEXT NOT NULL,
  target_establishment_code TEXT DEFAULT '',
  target_establishment_name TEXT NOT NULL,
  village TEXT DEFAULT '',
  local_unit TEXT DEFAULT '',
  complaint_type TEXT NOT NULL,
  assigned_employee TEXT DEFAULT '',
  inspection_date TEXT DEFAULT '',
  inspection_result TEXT DEFAULT '',
  action_taken TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'جديدة',
  closure_date TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.internal_trade_market_prices (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  commodity_code TEXT NOT NULL,
  commodity_name TEXT NOT NULL,
  category TEXT DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'كجم',
  declared_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  actual_market_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  previous_period_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  establishment_name TEXT DEFAULT '',
  observation_date TEXT NOT NULL,
  month_key TEXT NOT NULL,
  village TEXT DEFAULT '',
  local_unit TEXT DEFAULT '',
  observer_employee TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.internal_trade_reconciliations (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  violation_id TEXT NOT NULL REFERENCES public.internal_trade_violations(id) ON DELETE CASCADE,
  reconciliation_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_date TEXT NOT NULL,
  payment_method TEXT DEFAULT '',
  receipt_number TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.internal_trade_documents (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_code TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT DEFAULT '',
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lpg_village_circulation (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  serial_no INTEGER NOT NULL DEFAULT 1,
  village_code TEXT NOT NULL,
  village TEXT NOT NULL,
  local_unit TEXT NOT NULL,
  population INTEGER NOT NULL DEFAULT 1,
  families_count INTEGER NOT NULL DEFAULT 1,
  beneficiaries_count INTEGER NOT NULL DEFAULT 1,
  depots_count INTEGER NOT NULL DEFAULT 1,
  distributors_count INTEGER NOT NULL DEFAULT 1,
  cylinder_type TEXT NOT NULL DEFAULT 'أسطوانة منزلية',
  cylinder_weight_kg NUMERIC(8,2) NOT NULL DEFAULT 12.5,
  prescribed_monthly_quota INTEGER NOT NULL DEFAULT 0,
  prescribed_daily_quota INTEGER NOT NULL DEFAULT 0,
  actual_inbound_qty INTEGER NOT NULL DEFAULT 0,
  actual_disbursed_qty INTEGER NOT NULL DEFAULT 0,
  month_key TEXT NOT NULL DEFAULT '2026-05',
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.petroleum_village_circulation (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  serial_no INTEGER NOT NULL DEFAULT 1,
  village TEXT NOT NULL,
  local_unit TEXT NOT NULL,
  population INTEGER NOT NULL DEFAULT 1,
  stations_count INTEGER NOT NULL DEFAULT 1,
  fuel_type TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'لتر',
  opening_balance_liters NUMERIC(14,2) NOT NULL DEFAULT 0,
  inbound_liters NUMERIC(14,2) NOT NULL DEFAULT 0,
  disbursed_liters NUMERIC(14,2) NOT NULL DEFAULT 0,
  prescribed_quota_liters NUMERIC(14,2) NOT NULL DEFAULT 0,
  month_key TEXT NOT NULL DEFAULT '2026-05',
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.fuel_stations_control (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  station_code TEXT NOT NULL,
  station_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  manager_name TEXT DEFAULT '',
  village TEXT NOT NULL,
  local_unit TEXT NOT NULL,
  address TEXT DEFAULT '',
  distribution_company TEXT DEFAULT '',
  tanks_count INTEGER NOT NULL DEFAULT 1,
  tank_capacity_liters NUMERIC(14,2) NOT NULL DEFAULT 0,
  primary_fuel_type TEXT NOT NULL DEFAULT 'السولار',
  opening_balance_liters NUMERIC(14,2) NOT NULL DEFAULT 0,
  inbound_liters NUMERIC(14,2) NOT NULL DEFAULT 0,
  sold_disbursed_liters NUMERIC(14,2) NOT NULL DEFAULT 0,
  actual_stock_liters NUMERIC(14,2) NOT NULL DEFAULT 0,
  last_inventory_date TEXT DEFAULT '',
  license_status TEXT DEFAULT 'ساري',
  station_status TEXT DEFAULT 'تعمل بانتظام',
  CONSTRAINT uq_fuel_station_code UNIQUE (branch_id, station_code)
);

CREATE TABLE IF NOT EXISTS public.fuel_station_daily_movements (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  station_code TEXT NOT NULL,
  station_name TEXT NOT NULL,
  movement_date TEXT NOT NULL,
  fuel_type TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  quantity_liters NUMERIC(14,2) NOT NULL DEFAULT 0,
  invoice_or_doc_number TEXT DEFAULT '',
  inspector_or_operator TEXT DEFAULT '',
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.lpg_depots_control (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  depot_code TEXT NOT NULL,
  depot_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  manager_name TEXT DEFAULT '',
  village TEXT NOT NULL,
  local_unit TEXT NOT NULL,
  license_number TEXT DEFAULT '',
  license_expiry_date TEXT DEFAULT '',
  prescribed_quota INTEGER NOT NULL DEFAULT 0,
  inbound_cylinders INTEGER NOT NULL DEFAULT 0,
  disbursed_cylinders INTEGER NOT NULL DEFAULT 0,
  full_cylinders_count INTEGER NOT NULL DEFAULT 0,
  empty_cylinders_count INTEGER NOT NULL DEFAULT 0,
  damaged_cylinders_count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT uq_lpg_depot_code UNIQUE (branch_id, depot_code)
);

CREATE TABLE IF NOT EXISTS public.lpg_distributors_registry (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  distributor_code TEXT NOT NULL,
  distributor_name TEXT NOT NULL,
  national_id TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  distribution_scope_village TEXT NOT NULL,
  local_unit TEXT NOT NULL,
  affiliated_depot_name TEXT DEFAULT '',
  prescribed_quota INTEGER NOT NULL DEFAULT 0,
  received_qty INTEGER NOT NULL DEFAULT 0,
  distributed_qty INTEGER NOT NULL DEFAULT 0,
  vehicle_details TEXT DEFAULT '',
  license_number TEXT DEFAULT '',
  status TEXT DEFAULT 'نشط',
  CONSTRAINT uq_lpg_distributor_code UNIQUE (branch_id, distributor_code)
);

-- -------------------------------------------------------------------------
-- 5) جدول حزمة حالة الأقسام التوسعية الموحّد لكل فرع (Branch Modules Bundle)
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

-- -------------------------------------------------------------------------
-- 6) جداول منظومة قسم صيانة الحبوب الشاملة (الشون، الثلاجات، المطاحن، حصص الدقيق)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grain_warehouses (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  shuna_code TEXT NOT NULL,
  shuna_name TEXT NOT NULL,
  village TEXT NOT NULL,
  affiliated_entity TEXT NOT NULL,
  manager_name TEXT DEFAULT '',
  total_area_sqm NUMERIC(12,2) NOT NULL DEFAULT 0,
  used_area_sqm NUMERIC(12,2) NOT NULL DEFAULT 0,
  storage_capacity_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  approved_opening_balance_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  approved_inbound_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  approved_outbound_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  net_transfers_and_adjustments_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  ton_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  assets_and_fixtures_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  internal_equipment_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  scale_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  handling_equipment_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  operating_status TEXT NOT NULL DEFAULT 'تعمل',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_grain_warehouse_code UNIQUE (branch_id, shuna_code)
);

CREATE TABLE IF NOT EXISTS public.grain_receipts (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  receipt_order_number TEXT NOT NULL,
  receipt_date TEXT NOT NULL,
  shuna_code TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  wheat_type TEXT NOT NULL DEFAULT 'محلي',
  gross_weight_kg NUMERIC(14,2) NOT NULL DEFAULT 0,
  tare_weight_kg NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_weight_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  moisture_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
  impurities_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
  cleanliness_grade TEXT NOT NULL DEFAULT '23.5',
  excluded_weight_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  accepted_net_weight_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  ton_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_supply_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  approval_status TEXT NOT NULL DEFAULT 'معتمد',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_grain_receipt_order UNIQUE (branch_id, receipt_order_number)
);

CREATE TABLE IF NOT EXISTS public.grain_issues (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  issue_order_number TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  shuna_code TEXT NOT NULL,
  beneficiary_mill_code TEXT NOT NULL,
  issued_weight_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  ton_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_issue_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  approval_status TEXT NOT NULL DEFAULT 'معتمد',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_grain_issue_order UNIQUE (branch_id, issue_order_number)
);

CREATE TABLE IF NOT EXISTS public.grain_adjustments (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  reconciliation_date TEXT NOT NULL,
  shuna_code TEXT NOT NULL,
  book_balance_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  actual_inventory_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  variance_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  variance_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  approval_status TEXT NOT NULL DEFAULT 'معتمد',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.refrigerators (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  refrigerator_code TEXT NOT NULL,
  refrigerator_name TEXT NOT NULL,
  village_or_city TEXT NOT NULL,
  refrigerator_type TEXT NOT NULL DEFAULT 'تبريد وتجميد',
  max_storage_capacity_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  current_stored_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  operating_status TEXT NOT NULL DEFAULT 'تعمل',
  total_fixed_assets_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_stored_inventory_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_refrigerator_code UNIQUE (branch_id, refrigerator_code)
);

CREATE TABLE IF NOT EXISTS public.refrigerator_rooms (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  room_code TEXT NOT NULL,
  refrigerator_code TEXT NOT NULL,
  capacity_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  current_stored_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  target_temp_c NUMERIC(6,2) NOT NULL DEFAULT 0,
  actual_temp_c NUMERIC(6,2) NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.refrigerator_receipts (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  receipt_order_number TEXT NOT NULL,
  receipt_date TEXT NOT NULL,
  refrigerator_code TEXT NOT NULL,
  accepted_net_weight_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  total_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  approval_status TEXT NOT NULL DEFAULT 'معتمد',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.refrigerator_issues (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  issue_order_number TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  refrigerator_code TEXT NOT NULL,
  issued_weight_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  total_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  approval_status TEXT NOT NULL DEFAULT 'معتمد',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.refrigerator_assets (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  asset_code TEXT NOT NULL,
  refrigerator_code TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  current_estimated_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.refrigerator_temperature_logs (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  refrigerator_code TEXT NOT NULL,
  room_code TEXT NOT NULL,
  log_date TEXT NOT NULL,
  actual_temp_c NUMERIC(6,2) NOT NULL DEFAULT 0,
  is_temp_exceeded BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.refrigerator_maintenance (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  maintenance_order_number TEXT NOT NULL,
  refrigerator_code TEXT NOT NULL,
  maintenance_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'مكتمل',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.refrigerator_financial_transactions (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  refrigerator_code TEXT NOT NULL,
  pricing_mode TEXT NOT NULL DEFAULT 'يومي',
  total_storage_due NUMERIC(16,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  remaining_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.mills (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  mill_code TEXT NOT NULL,
  mill_name TEXT NOT NULL,
  mill_type TEXT NOT NULL DEFAULT 'قطاع عام',
  village_or_city TEXT NOT NULL,
  design_capacity_tons_per_day NUMERIC(14,3) NOT NULL DEFAULT 0,
  actual_operating_capacity_tons_per_day NUMERIC(14,3) NOT NULL DEFAULT 0,
  extraction_rate_pct NUMERIC(6,2) NOT NULL DEFAULT 87.5,
  current_wheat_balance_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  current_flour_balance_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  operating_status TEXT NOT NULL DEFAULT 'يعمل',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_mill_code UNIQUE (branch_id, mill_code)
);

CREATE TABLE IF NOT EXISTS public.mill_licenses (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  mill_code TEXT NOT NULL,
  license_number TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.mill_receipts (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  receipt_order_number TEXT NOT NULL,
  mill_code TEXT NOT NULL,
  source_shuna_code TEXT NOT NULL,
  accepted_net_weight_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  total_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  approval_status TEXT NOT NULL DEFAULT 'معتمد',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.mill_operations (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  operation_date TEXT NOT NULL,
  mill_code TEXT NOT NULL,
  actual_milled_wheat_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  produced_flour_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  actual_extraction_pct NUMERIC(6,2) NOT NULL DEFAULT 87.5,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.mill_production (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  mill_code TEXT NOT NULL,
  output_flour_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  total_produced_flour_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  approval_status TEXT NOT NULL DEFAULT 'معتمد',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.mill_machinery (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  line_code TEXT NOT NULL,
  mill_code TEXT NOT NULL,
  estimated_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.mill_maintenance (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  mill_code TEXT NOT NULL,
  cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.mill_inspections (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  report_number TEXT NOT NULL,
  mill_code TEXT NOT NULL,
  actual_extraction_pct NUMERIC(6,2) NOT NULL DEFAULT 87.5,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.mill_assets (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  mill_code TEXT NOT NULL,
  total_estimated_mill_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.flour_quota_master (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  quota_code TEXT NOT NULL,
  mill_code TEXT NOT NULL,
  bakery_id TEXT NOT NULL,
  bakery_name TEXT NOT NULL,
  daily_prescribed_sacks INTEGER NOT NULL DEFAULT 0,
  monthly_prescribed_sacks INTEGER NOT NULL DEFAULT 0,
  disbursed_sacks INTEGER NOT NULL DEFAULT 0,
  remaining_sacks INTEGER NOT NULL DEFAULT 0,
  quota_status TEXT NOT NULL DEFAULT 'منتظمة',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_flour_quota_code UNIQUE (branch_id, quota_code)
);

CREATE TABLE IF NOT EXISTS public.flour_daily_quotas (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  distribution_date TEXT NOT NULL,
  quota_code TEXT NOT NULL,
  bakery_id TEXT NOT NULL,
  disbursed_sacks INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.flour_monthly_quotas (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  quota_code TEXT NOT NULL,
  bakery_id TEXT NOT NULL,
  total_disbursed_sacks INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.flour_issues (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  issue_order_number TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  mill_code TEXT NOT NULL,
  bakery_id TEXT NOT NULL,
  sacks_count INTEGER NOT NULL DEFAULT 0,
  total_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  approval_status TEXT NOT NULL DEFAULT 'معتمد',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.flour_quota_amendments (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  amendment_date TEXT NOT NULL,
  quota_code TEXT NOT NULL,
  bakery_id TEXT NOT NULL,
  amendment_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.flour_distribution (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  mill_code TEXT NOT NULL,
  bakery_id TEXT NOT NULL,
  daily_quota_sacks INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.flour_inventory_movements (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  mill_code TEXT NOT NULL,
  current_balance_tons NUMERIC(14,3) NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- RLS Policies for all new module tables (Granular Per-Department RBAC, Fail-Closed)
DO $$
DECLARE
  tbl TEXT;
  dept TEXT;
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
    'ration_merchant_monthly_archives',
    'internal_trade_establishments', 'internal_trade_activities', 'internal_trade_licenses',
    'internal_trade_campaigns', 'internal_trade_campaign_members', 'internal_trade_violations',
    'internal_trade_seizures', 'internal_trade_complaints', 'internal_trade_market_prices',
    'internal_trade_reconciliations', 'internal_trade_documents',
    'lpg_village_circulation', 'petroleum_village_circulation', 'fuel_stations_control',
    'fuel_station_daily_movements', 'lpg_depots_control', 'lpg_distributors_registry',
    'maintenance_assets', 'maintenance_technicians', 'maintenance_spare_parts',
    'maintenance_inventory', 'maintenance_orders', 'maintenance_tasks',
    'maintenance_costs', 'grain_movements', 'grain_stock', 'maintenance_alerts',
    'maintenance_settings',
    'grain_warehouses', 'grain_receipts', 'grain_issues', 'grain_adjustments',
    'refrigerators', 'refrigerator_rooms', 'refrigerator_receipts', 'refrigerator_issues',
    'refrigerator_assets', 'refrigerator_temperature_logs', 'refrigerator_maintenance',
    'refrigerator_financial_transactions', 'mills', 'mill_licenses', 'mill_receipts',
    'mill_operations', 'mill_production', 'mill_machinery', 'mill_maintenance',
    'mill_inspections', 'mill_assets', 'flour_quota_master', 'flour_daily_quotas',
    'flour_monthly_quotas', 'flour_issues', 'flour_quota_amendments',
    'flour_distribution', 'flour_inventory_movements',
    'departments', 'job_titles', 'job_grades', 'employees', 'employee_personal_data',
    'employee_documents', 'attendance_records', 'leave_balances', 'leave_requests',
    'payroll_periods', 'payroll_items', 'allowances', 'incentives', 'deductions',
    'insurance_records', 'tax_records', 'promotions', 'loans', 'loan_installments',
    'employee_transfers', 'employee_evaluations', 'employee_service_history',
    'hr_settings', 'hr_audit_logs', 'branch_module_states'
  ];
BEGIN
  FOREACH tbl IN ARRAY module_tables LOOP
    dept := CASE
      WHEN tbl LIKE 'ration_%' THEN 'commodities'
      WHEN tbl LIKE 'internal_trade_%' OR tbl LIKE 'lpg_%' OR tbl LIKE 'petroleum_%' OR tbl LIKE 'fuel_%' THEN 'internal_trade'
      WHEN tbl LIKE 'maintenance_%' OR tbl LIKE 'grain_%' OR tbl LIKE 'refrigerator%' OR tbl LIKE 'mill%' OR tbl LIKE 'flour_%' THEN 'grain_maintenance'
      WHEN tbl = 'branch_module_states' THEN 'all'
      ELSE 'hr'
    END;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Tamween module read on %s" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Tamween module write on %s" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Tamween module insert on %s" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Tamween module update on %s" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Tamween module delete on %s" ON public.%I', tbl, tbl);

    IF dept = 'all' THEN
      EXECUTE 'CREATE POLICY "Tamween module read on branch_module_states" ON public.branch_module_states FOR SELECT USING (auth.role() = ''authenticated'')';
      EXECUTE 'CREATE POLICY "Tamween module insert on branch_module_states" ON public.branch_module_states FOR INSERT WITH CHECK (public.is_tamween_authorized_writer())';
      EXECUTE 'CREATE POLICY "Tamween module update on branch_module_states" ON public.branch_module_states FOR UPDATE USING (public.is_tamween_authorized_writer()) WITH CHECK (public.is_tamween_authorized_writer())';
      EXECUTE 'CREATE POLICY "Tamween module delete on branch_module_states" ON public.branch_module_states FOR DELETE USING (public.is_tamween_super_admin())';
    ELSE
      EXECUTE format(
        'CREATE POLICY "Tamween module read on %s" ON public.%I FOR SELECT USING (public.has_department_permission(%L, ''view''))',
        tbl, tbl, dept
      );
      EXECUTE format(
        'CREATE POLICY "Tamween module insert on %s" ON public.%I FOR INSERT WITH CHECK (public.has_department_permission(%L, ''insert''))',
        tbl, tbl, dept
      );
      EXECUTE format(
        'CREATE POLICY "Tamween module update on %s" ON public.%I FOR UPDATE USING (public.has_department_permission(%L, ''update'')) WITH CHECK (public.has_department_permission(%L, ''update''))',
        tbl, tbl, dept, dept
      );
      EXECUTE format(
        'CREATE POLICY "Tamween module delete on %s" ON public.%I FOR DELETE USING (public.has_department_permission(%L, ''delete''))',
        tbl, tbl, dept
      );
    END IF;
  END LOOP;
END $$;


