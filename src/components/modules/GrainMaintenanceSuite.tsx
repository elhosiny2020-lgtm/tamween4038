import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  Wrench,
  Warehouse,
  Cog,
  Droplets,
  AlertTriangle,
  CheckCircle2,
  Printer,
  FileSpreadsheet,
  Settings,
  History,
  Plus,
} from 'lucide-react';
import type { AppUser } from '../../types';
import type {
  GrainMaintenanceState,
  GrainAsset,
  MaintenanceOrder,
  MaintenanceOrderStatus,
  GrainMovementRecord,
  ModuleAuditLog,
} from '../../types/modules';
import {
  computeEquipmentKpis,
  computeMaintenanceOrderCost,
  computeSparePartStatus,
  computeMoistureCorrectedWeight,
  computeGrainStockAndLossSummary,
  computeCostPerTon,
} from '../../utils/grainMaintenanceMath';
import { exportRowsToArabicCsv, printModuleReportA4 } from '../../services/modulesStorage';

export type GrainSubView =
  | 'dashboard'
  | 'assets'
  | 'orders'
  | 'parts'
  | 'grain_moisture'
  | 'alerts'
  | 'settings'
  | 'audit';

interface GrainMaintenanceSuiteProps {
  state: GrainMaintenanceState;
  branchId: string;
  branchName: string;
  currentUser: AppUser | null;
  initialSubView?: GrainSubView;
  onChangeState: (next: GrainMaintenanceState) => void;
}

const ORDER_STATUSES: MaintenanceOrderStatus[] = [
  'جديد',
  'قيد الفحص',
  'معتمد',
  'قيد التنفيذ',
  'متوقف لعدم توافر قطع الغيار',
  'مكتمل',
  'مغلق',
];

export const GrainMaintenanceSuite: React.FC<GrainMaintenanceSuiteProps> = ({
  state,
  branchId,
  branchName,
  currentUser,
  initialSubView = 'dashboard',
  onChangeState,
}) => {
  const [subView, setSubView] = useState<GrainSubView>(initialSubView);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const isViewer = currentUser?.role === 'viewer';

  // Add Asset form
  const [assetCode, setAssetCode] = useState('');
  const [assetName, setAssetName] = useState('');
  const [assetType, setAssetType] = useState<GrainAsset['assetType']>('صومعة');
  const [assetSite, setAssetSite] = useState(`مجمع صوامع ${branchName}`);

  // Add Order form
  const [orderAssetId, setOrderAssetId] = useState(state.assets[0]?.id || '');
  const [orderType, setOrderType] = useState<MaintenanceOrder['maintenanceType']>('علاجية طارئة');
  const [orderFault, setOrderFault] = useState('');
  const [orderHours, setOrderHours] = useState<number>(6);
  const [orderHourlyRate, setOrderHourlyRate] = useState<number>(120);
  const [orderPartId, setOrderPartId] = useState<string>(state.spareParts[0]?.id || '');
  const [orderPartQty, setOrderPartQty] = useState<number>(1);
  const [orderConsumables, setOrderConsumables] = useState<number>(250);

  // Grain Moisture Correction & Movement form
  const [gmDocNo, setGmDocNo] = useState('');
  const [gmSilo, setGmSilo] = useState(state.assets[0]?.siloOrWarehouseName || 'صومعة حبوب رقم 1');
  const [gmType, setGmType] = useState<GrainMovementRecord['movementType']>('وارد');
  const [gmOriginalTons, setGmOriginalTons] = useState<number>(500);
  const [gmActualMoisture, setGmActualMoisture] = useState<number>(13.5);
  const [gmRefMoisture, setGmRefMoisture] = useState<number>(state.settings.defaultReferenceMoisturePct || 12);
  const [gmPhysicalCount, setGmPhysicalCount] = useState<number>(0);

  const [settingsDraft, setSettingsDraft] = useState(state.settings);

  const notify = (type: 'ok' | 'err', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  const appendAudit = (
    actionType: ModuleAuditLog['actionType'],
    entityName: string,
    entityId: string,
    afterSummary: string
  ): ModuleAuditLog => ({
    id: `aud-gm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    branchId,
    module: 'grain_maintenance',
    timestamp: new Date().toISOString(),
    username: currentUser?.username || 'system',
    userFullName: currentUser?.fullName || 'مستخدم المنظومة',
    actionType,
    entityName,
    entityId,
    afterSummary,
  });

  const grainSummary = useMemo(
    () => computeGrainStockAndLossSummary(state.grainMovements),
    [state.grainMovements]
  );

  const totalMaintenanceCost = useMemo(
    () => state.orders.reduce((s, o) => s + (o.totalRepairCost || 0), 0),
    [state.orders]
  );

  const costPerTon = useMemo(
    () => computeCostPerTon(totalMaintenanceCost, grainSummary.openingTons + grainSummary.inboundTons),
    [totalMaintenanceCost, grainSummary]
  );

  const assetOeeChartData = useMemo(
    () =>
      state.assets.map((a) => {
        const kpi = computeEquipmentKpis(a, state.orders);
        return {
          name: a.assetCode,
          الإتاحة: kpi.availabilityPct ?? 0,
          الكفاءة_OEE: kpi.oeePct ?? 0,
        };
      }),
    [state.assets, state.orders]
  );

  const smartAlerts = useMemo(() => {
    const list: { level: 'high' | 'med'; msg: string }[] = [];
    state.spareParts.forEach((p) => {
      const st = computeSparePartStatus(p);
      if (st.needsReorder) {
        list.push({
          level: 'high',
          msg: `قطعة الغيار (${p.partName}) بلغت حد إعادة الطلب (${st.availableBalance} ≤ ${st.reorderPoint})`,
        });
      }
    });
    state.assets.forEach((a) => {
      if (a.operationalStatus !== 'عاملة') {
        list.push({
          level: 'high',
          msg: `المعدة/الصومعة (${a.name}) حالتها: ${a.operationalStatus}`,
        });
      }
    });
    if (
      grainSummary.lossPercentage !== null &&
      grainSummary.lossPercentage > state.settings.maxAcceptableGrainLossPct
    ) {
      list.push({
        level: 'high',
        msg: `نسبة فاقد الحبوب (${grainSummary.lossPercentage}%) تجاوزت الحد المسموح (${state.settings.maxAcceptableGrainLossPct}%)`,
      });
    }
    return list;
  }, [state.spareParts, state.assets, grainSummary, state.settings.maxAcceptableGrainLossPct]);

  const previewCorrectedWeight = useMemo(
    () => computeMoistureCorrectedWeight(gmOriginalTons, gmActualMoisture, gmRefMoisture),
    [gmOriginalTons, gmActualMoisture, gmRefMoisture]
  );

  const handleAddAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetCode.trim() || !assetName.trim()) {
      notify('err', 'يرجى إدخال كود واسم الأصل/الصومعة.');
      return;
    }
    const created: GrainAsset = {
      id: `${branchId}-asset-${Date.now()}`,
      branchId,
      assetCode: assetCode.trim(),
      name: assetName.trim(),
      assetType,
      locationSite: assetSite,
      siloOrWarehouseName: assetName.trim(),
      manufacturer: 'معتمد محلياً',
      model: 'STD-2026',
      serialNumber: `SN-${Date.now().toString().slice(-6)}`,
      supplyDate: new Date().toISOString().split('T')[0],
      installDate: new Date().toISOString().split('T')[0],
      purchaseValue: 1000000,
      ratedCapacityTonPerHour: 80,
      operationalStatus: 'عاملة',
      lastMaintenanceDate: new Date().toISOString().split('T')[0],
      nextMaintenanceDate: '2027-01-01',
      operatingLifeYears: 15,
      warrantyEndDate: '2028-01-01',
      plannedHoursPerPeriod: 200,
      downtimeHours: 0,
      actualProductionTons: 1000,
      designProductionTons: 1200,
      conformingTons: 995,
      energyConsumptionKwh: 1200,
      fuelConsumptionLiters: 50,
    };
    onChangeState({
      ...state,
      assets: [...state.assets, created],
      auditLogs: [appendAudit('إضافة', 'سجل الأصول والصوامع', created.id, created.name), ...state.auditLogs],
    });
    setAssetCode('');
    setAssetName('');
    notify('ok', `تم إضافة الأصل (${created.name}) إلى سجل الصوامع والمعدات.`);
  };

  const handleAddOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const asset = state.assets.find((a) => a.id === orderAssetId);
    const part = state.spareParts.find((p) => p.id === orderPartId);
    if (!asset || !orderFault.trim()) {
      notify('err', 'يرجى اختيار المعدة ووصف العطل.');
      return;
    }
    const partsUsed =
      part && orderPartQty > 0
        ? [{ partId: part.id, partName: part.partName, quantity: orderPartQty, unitCost: part.unitCost }]
        : [];
    const costs = computeMaintenanceOrderCost({
      technicianCount: 1,
      laborHours: orderHours,
      hourlyRate: orderHourlyRate,
      partsUsed,
      consumablesCost: orderConsumables,
      transportAndOpCost: 0,
      indirectOverheadPercent: state.settings.defaultIndirectOverheadPct,
      taxPercent: state.settings.defaultTaxPct,
    });
    const order: MaintenanceOrder = {
      id: `${branchId}-mo-${Date.now()}`,
      branchId,
      orderNumber: `MNT-${Date.now().toString().slice(-5)}`,
      requestDate: new Date().toISOString().split('T')[0],
      siteName: asset.locationSite,
      assetId: asset.id,
      maintenanceType: orderType,
      faultDescription: orderFault.trim(),
      severity: 'متوسطة',
      stopStartDate: new Date().toISOString().slice(0, 16),
      technicianCount: 1,
      technicianNames: state.technicians[0]?.name || 'مهندس الصيانة',
      laborHours: orderHours,
      hourlyRate: orderHourlyRate,
      consumablesCost: orderConsumables,
      transportAndOpCost: 0,
      indirectOverheadPercent: state.settings.defaultIndirectOverheadPct,
      taxPercent: state.settings.defaultTaxPct,
      partsUsed,
      ...costs,
      status: 'جديد',
      createdAt: new Date().toISOString(),
    };
    const nextParts =
      part && orderPartQty > 0
        ? state.spareParts.map((sp) =>
            sp.id === part.id ? { ...sp, outboundQty: sp.outboundQty + orderPartQty } : sp
          )
        : state.spareParts;

    onChangeState({
      ...state,
      orders: [order, ...state.orders],
      spareParts: nextParts,
      auditLogs: [
        appendAudit('إضافة', 'أوامر الصيانة', order.id, `${order.orderNumber} — تكلفة ${order.totalRepairCost} ج.م`),
        ...state.auditLogs,
      ],
    });
    setOrderFault('');
    notify('ok', `تم إنشاء أمر الصيانة (${order.orderNumber}) وحساب التكلفة الكلية آلياً.`);
  };

  const handleAdvanceOrderStatus = (orderId: string, nextStatus: MaintenanceOrderStatus) => {
    onChangeState({
      ...state,
      orders: state.orders.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)),
      auditLogs: [appendAudit('تعديل', 'حالة أمر الصيانة', orderId, nextStatus), ...state.auditLogs],
    });
    notify('ok', `تم تحديث حالة أمر الصيانة إلى (${nextStatus}).`);
  };

  const handleAddGrainMovement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gmDocNo.trim()) {
      notify('err', 'يرجى إدخال رقم المستند المخزني للحبوب.');
      return;
    }
    const rec: GrainMovementRecord = {
      id: `${branchId}-gm-${Date.now()}`,
      branchId,
      documentNumber: gmDocNo.trim(),
      date: new Date().toISOString().split('T')[0],
      siloName: gmSilo,
      grainType: 'قمح تمويني',
      movementType: gmType,
      originalWeightTons: gmOriginalTons,
      actualMoisturePct: gmActualMoisture,
      referenceMoisturePct: gmRefMoisture,
      correctedWeightTons: previewCorrectedWeight,
      actualPhysicalCountTons: gmType === 'جرد فعلي' ? gmPhysicalCount : undefined,
      notes: 'احتساب رطوبة آلي بالمعادلة المرجعية',
    };
    onChangeState({
      ...state,
      grainMovements: [rec, ...state.grainMovements],
      auditLogs: [
        appendAudit('إضافة', 'حركات الحبوب والرطوبة', rec.id, `${rec.documentNumber} — مصحح ${previewCorrectedWeight} طن`),
        ...state.auditLogs,
      ],
    });
    setGmDocNo('');
    notify('ok', `تم تسجيل حركة الحبوب (${rec.documentNumber}) بالوزن المصحح (${previewCorrectedWeight} طن).`);
  };

  const navItems: { id: GrainSubView; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'لوحة الأداء OEE', icon: <Wrench className="w-3.5 h-3.5" /> },
    { id: 'assets', label: 'الصوامع والأصول', icon: <Warehouse className="w-3.5 h-3.5" /> },
    { id: 'orders', label: 'أوامر الصيانة والتكلفة', icon: <Cog className="w-3.5 h-3.5" /> },
    { id: 'parts', label: 'قطع الغيار وإعادة الطلب', icon: <Cog className="w-3.5 h-3.5" /> },
    { id: 'grain_moisture', label: 'الحبوب والرطوبة والفاقد', icon: <Droplets className="w-3.5 h-3.5" /> },
    { id: 'alerts', label: `التنبيهات (${smartAlerts.length})`, icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    { id: 'settings', label: 'الإعدادات', icon: <Settings className="w-3.5 h-3.5" /> },
    { id: 'audit', label: 'سجل التدقيق', icon: <History className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-4" dir="rtl" data-testid="grain-maintenance-suite">
      {/* Banner */}
      <div className="bg-gradient-to-l from-[#0A1628] via-[#13294B] to-[#0D9488] text-white rounded-2xl p-5 shadow-lg border border-[#D4AF37]/40 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-[#D4AF37] text-[#0A1628] shadow-md">
            <Wrench className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-black">منظومة صيانة الحبوب والصوامع والشون ومؤشرات OEE</h2>
            <p className="text-xs text-[#5EEAD4] font-bold mt-0.5">
              {branchName} • الصوامع والمعدات · أوامر الصيانة · قطع الغيار · معادلة تصحيح الرطوبة والفاقد
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportRowsToArabicCsv(
                `صيانة_الصوامع_${branchName}`,
                ['رقم الأمر', 'التاريخ', 'الموقع', 'النوع', 'ساعات العمل', 'تكلفة العمالة', 'قطع الغيار', 'الإجمالي', 'الحالة'],
                state.orders.map((o) => [
                  o.orderNumber,
                  o.requestDate,
                  o.siteName,
                  o.maintenanceType,
                  o.laborHours,
                  o.laborCost,
                  o.partsCost,
                  o.totalRepairCost,
                  o.status,
                ])
              )
            }
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير Excel</span>
          </button>

          <button
            type="button"
            onClick={() =>
              printModuleReportA4({
                title: 'تقرير صيانة الحبوب والصوامع والشون',
                subtitle: 'مؤشرات الأداء الفني، أوامر الصيانة، وتصحيح الرطوبة',
                branchName,
                headers: ['رقم الأمر', 'الموقع', 'نوع الصيانة', 'التكلفة المباشرة', 'الإجمالي', 'الحالة'],
                rows: state.orders.map((o) => [
                  o.orderNumber,
                  o.siteName,
                  o.maintenanceType,
                  `${o.directCost.toLocaleString()} ج.م`,
                  `${o.totalRepairCost.toLocaleString()} ج.م`,
                  o.status,
                ]),
                summaryItems: [
                  { label: 'الأصول المسجلة', value: String(state.assets.length) },
                  { label: 'إجمالي تكلفة الصيانة', value: `${totalMaintenanceCost.toLocaleString()} ج.م` },
                  { label: 'رصيد الحبوب الدفتري', value: `${grainSummary.bookBalanceTons} طن` },
                  { label: 'تكلفة الصيانة/طن', value: costPerTon ? `${costPerTon} ج.م` : '—' },
                ],
                preparedBy: currentUser?.fullName,
              })
            }
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/25 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4 text-[#D4AF37]" />
            <span>طباعة A4</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs font-black flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
              : 'bg-rose-50 border-rose-400 text-rose-900'
          }`}
        >
          {feedback.type === 'ok' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Nav */}
      <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-sm flex flex-wrap gap-1.5">
        {navItems.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubView(tab.id)}
            className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer ${
              subView === tab.id ? 'bg-[#0A1628] text-[#D4AF37]' : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {subView === 'dashboard' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">الأصول والصوامع المسجلة</div>
              <div className="text-2xl font-black text-[#0A1628] font-mono mt-1">{state.assets.length}</div>
              <div className="text-[11px] font-bold text-[#0D9488]">
                أوامر الصيانة: {state.orders.length}
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">إجمالي تكلفة الصيانة</div>
              <div className="text-2xl font-black text-rose-700 font-mono mt-1">
                {totalMaintenanceCost.toLocaleString()} ج.م
              </div>
              <div className="text-[11px] font-bold text-slate-500">
                تكلفة الصيانة/طن: {costPerTon ? `${costPerTon} ج.م` : 'لا توجد كمية'}
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">رصيد الحبوب الدفتري المصحح</div>
              <div className="text-2xl font-black text-[#0D9488] font-mono mt-1">
                {grainSummary.bookBalanceTons.toLocaleString()} طن
              </div>
              <div className="text-[11px] font-bold text-amber-700">
                الفاقد المسجل: {grainSummary.recordedLossTons} طن
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">التنبيهات الهندسية والمخزنية</div>
              <div className="text-2xl font-black text-amber-700 font-mono mt-1">{smartAlerts.length}</div>
              <div className="text-[11px] font-bold text-slate-500">قطع الغيار والمعدات والفاقد</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
            <h3 className="text-sm font-black text-[#0A1628]">مقارنة كفاءة المعدات OEE (%) ونسبة الإتاحة</h3>
            <div className="h-64 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={assetOeeChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fontWeight: 700 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="الإتاحة" fill="#1E40AF" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="الكفاءة_OEE" fill="#0D9488" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {subView === 'assets' && (
        <div className="space-y-4">
          {!isViewer && (
            <form onSubmit={handleAddAsset} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-5 gap-2.5 text-xs">
              <input type="text" value={assetCode} onChange={(e) => setAssetCode(e.target.value)} placeholder="كود الأصل *" className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
              <input type="text" value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder="اسم الصومعة / المعدة *" className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold" />
              <select value={assetType} onChange={(e) => setAssetType(e.target.value as GrainAsset['assetType'])} className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold">
                <option value="صومعة">صومعة</option>
                <option value="شونة">شونة</option>
                <option value="مصعد">مصعد</option>
                <option value="سير ناقل">سير ناقل</option>
                <option value="غربال ومنقي">غربال ومنقي</option>
                <option value="ميزان">ميزان</option>
              </select>
              <input type="text" value={assetSite} onChange={(e) => setAssetSite(e.target.value)} placeholder="الموقع" className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold" />
              <button type="submit" className="px-4 py-2 bg-[#0D9488] text-white rounded-xl font-black cursor-pointer flex items-center justify-center gap-1">
                <Plus className="w-4 h-4" />
                <span>إضافة أصل</span>
              </button>
            </form>
          )}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
              <thead className="bg-[#0A1628] text-white font-black">
                <tr>
                  <th className="py-2 px-2 border border-slate-700">الكود</th>
                  <th className="py-2 px-2 border border-slate-700 text-right">المعدة / الصومعة</th>
                  <th className="py-2 px-2 border border-slate-700">الإتاحة %</th>
                  <th className="py-2 px-2 border border-slate-700">OEE %</th>
                  <th className="py-2 px-2 border border-slate-700">MTBF / MTTR</th>
                  <th className="py-2 px-2 border border-slate-700">الحالة التشغيلية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {state.assets.map((a) => {
                  const kpi = computeEquipmentKpis(a, state.orders);
                  return (
                    <tr key={a.id}>
                      <td className="py-2 px-2 font-mono">{a.assetCode}</td>
                      <td className="py-2 px-2 text-right font-black text-[#0A1628]">{a.name}</td>
                      <td className="py-2 px-2 font-mono text-[#1E40AF]">{kpi.availabilityPct ?? '—'}%</td>
                      <td className="py-2 px-2 font-mono text-[#0D9488] font-black">{kpi.oeePct ?? '—'}%</td>
                      <td className="py-2 px-2 font-mono">
                        {kpi.mtbfHours ?? '—'} س / {kpi.mttrHours ?? '—'} س
                      </td>
                      <td className="py-2 px-2">{a.operationalStatus}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subView === 'orders' && (
        <div className="space-y-4">
          {!isViewer && (
            <form onSubmit={handleAddOrder} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-7 gap-2 text-xs">
              <select value={orderAssetId} onChange={(e) => setOrderAssetId(e.target.value)} className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold">
                {state.assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select value={orderType} onChange={(e) => setOrderType(e.target.value as MaintenanceOrder['maintenanceType'])} className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold">
                <option value="وقائية">وقائية</option>
                <option value="علاجية طارئة">علاجية طارئة</option>
                <option value="معايرة موازين">معايرة موازين</option>
              </select>
              <input type="text" value={orderFault} onChange={(e) => setOrderFault(e.target.value)} placeholder="وصف العطل *" className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold sm:col-span-2" />
              <input type="number" value={orderHours} onChange={(e) => setOrderHours(Number(e.target.value) || 0)} placeholder="ساعات" className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
              <select value={orderPartId} onChange={(e) => setOrderPartId(e.target.value)} className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold">
                {state.spareParts.map((p) => <option key={p.id} value={p.id}>{p.partName}</option>)}
              </select>
              <button type="submit" className="px-4 py-2 bg-[#0D9488] text-white rounded-xl font-black cursor-pointer">
                فتح أمر صيانة
              </button>
            </form>
          )}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
              <thead className="bg-[#0A1628] text-white font-black">
                <tr>
                  <th className="py-2 px-2 border border-slate-700">رقم الأمر</th>
                  <th className="py-2 px-2 border border-slate-700 text-right">المعدة والوصف</th>
                  <th className="py-2 px-2 border border-slate-700">العمالة + قطع الغيار</th>
                  <th className="py-2 px-2 border border-slate-700">المباشرة / غير المباشرة</th>
                  <th className="py-2 px-2 border border-slate-700">الإجمالي النهائي</th>
                  <th className="py-2 px-2 border border-slate-700">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {state.orders.map((o) => {
                  const asset = state.assets.find((a) => a.id === o.assetId);
                  return (
                    <tr key={o.id}>
                      <td className="py-2 px-2 font-mono">{o.orderNumber}</td>
                      <td className="py-2 px-2 text-right">
                        <div className="font-black text-[#0A1628]">{asset?.name || o.assetId}</div>
                        <div className="text-[11px] text-slate-500">{o.faultDescription}</div>
                      </td>
                      <td className="py-2 px-2 font-mono">{o.laborCost} + {o.partsCost} ج.م</td>
                      <td className="py-2 px-2 font-mono">{o.directCost} / {o.indirectCost} ج.م</td>
                      <td className="py-2 px-2 font-mono font-black text-rose-700">{o.totalRepairCost.toLocaleString()} ج.م</td>
                      <td className="py-2 px-2">
                        <select
                          disabled={isViewer}
                          value={o.status}
                          onChange={(e) => handleAdvanceOrderStatus(o.id, e.target.value as MaintenanceOrderStatus)}
                          className="px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-[11px] font-black cursor-pointer"
                        >
                          {ORDER_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subView === 'parts' && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-xs text-center border-collapse">
            <thead className="bg-[#0A1628] text-white font-black">
              <tr>
                <th className="py-2 px-2 border border-slate-700">الكود</th>
                <th className="py-2 px-2 border border-slate-700 text-right">اسم قطعة الغيار</th>
                <th className="py-2 px-2 border border-slate-700">سعر الوحدة</th>
                <th className="py-2 px-2 border border-slate-700">الرصيد المتاح</th>
                <th className="py-2 px-2 border border-slate-700">حد إعادة الطلب</th>
                <th className="py-2 px-2 border border-slate-700">الكمية المطلوب شراؤها</th>
                <th className="py-2 px-2 border border-slate-700">حالة التنبيه</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-bold">
              {state.spareParts.map((sp) => {
                const st = computeSparePartStatus(sp);
                return (
                  <tr key={sp.id}>
                    <td className="py-2 px-2 font-mono">{sp.partCode}</td>
                    <td className="py-2 px-2 text-right font-black text-[#0A1628]">{sp.partName}</td>
                    <td className="py-2 px-2 font-mono">{sp.unitCost} ج.م</td>
                    <td className="py-2 px-2 font-mono font-black text-[#0D9488]">{st.availableBalance}</td>
                    <td className="py-2 px-2 font-mono">{st.reorderPoint}</td>
                    <td className="py-2 px-2 font-mono">{st.neededQty}</td>
                    <td className="py-2 px-2">
                      {st.needsReorder ? (
                        <span className="px-2 py-0.5 bg-rose-100 text-rose-900 rounded-full text-[11px] font-black">
                          يلزم إعادة طلب
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 rounded-full text-[11px] font-black">
                          متوافر
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {subView === 'grain_moisture' && (
        <div className="space-y-4">
          {!isViewer && (
            <form onSubmit={handleAddGrainMovement} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="text-xs font-black text-[#0A1628]">
                حركة الحبوب وتصحيح الوزن حسب الرطوبة المرجعية: الوزن المصحح = الأصلي × (100 - الرطوبة الفعلية) ÷ (100 - المرجعية)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 text-xs">
                <input type="text" value={gmDocNo} onChange={(e) => setGmDocNo(e.target.value)} placeholder="رقم المستند *" className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
                <select value={gmType} onChange={(e) => setGmType(e.target.value as GrainMovementRecord['movementType'])} className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold">
                  <option value="وارد">وارد</option>
                  <option value="منصرف">منصرف</option>
                  <option value="جرد فعلي">جرد فعلي</option>
                </select>
                <input type="number" step="0.1" value={gmOriginalTons} onChange={(e) => setGmOriginalTons(Number(e.target.value) || 0)} placeholder="الوزن الأصلي (طن)" className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
                <input type="number" step="0.1" value={gmActualMoisture} onChange={(e) => setGmActualMoisture(Number(e.target.value) || 0)} placeholder="الرطوبة الفعلية %" className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
                <div className="px-3 py-2 bg-teal-50 border border-teal-300 rounded-xl font-mono font-black text-[#0D9488] flex items-center justify-center">
                  المصحح: {previewCorrectedWeight} طن
                </div>
                <button type="submit" className="px-4 py-2 bg-[#0D9488] text-white rounded-xl font-black cursor-pointer">
                  تسجيل الحركة
                </button>
              </div>
            </form>
          )}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
              <thead className="bg-[#0A1628] text-white font-black">
                <tr>
                  <th className="py-2 px-2 border border-slate-700">رقم المستند</th>
                  <th className="py-2 px-2 border border-slate-700">الصومعة / الشونة</th>
                  <th className="py-2 px-2 border border-slate-700">الحركة</th>
                  <th className="py-2 px-2 border border-slate-700">الوزن الأصلي</th>
                  <th className="py-2 px-2 border border-slate-700">الرطوبة الفعلية %</th>
                  <th className="py-2 px-2 border border-slate-700">الوزن المصحح (طن)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {state.grainMovements.map((g) => (
                  <tr key={g.id}>
                    <td className="py-2 px-2 font-mono">{g.documentNumber}</td>
                    <td className="py-2 px-2">{g.siloName}</td>
                    <td className="py-2 px-2">{g.movementType}</td>
                    <td className="py-2 px-2 font-mono">{g.originalWeightTons} طن</td>
                    <td className="py-2 px-2 font-mono">{g.actualMoisturePct}%</td>
                    <td className="py-2 px-2 font-mono font-black text-[#0D9488]">{g.correctedWeightTons} طن</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subView === 'alerts' && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2.5">
          <h3 className="text-sm font-black text-[#0A1628]">التنبيهات الذكية للصيانة وقطع الغيار والفاقد</h3>
          {smartAlerts.length === 0 ? (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-black text-emerald-900">
              كافة الصوامع والمعدات وقطع الغيار ومؤشرات الفاقد ضمن الحدود الآمنة ✓
            </div>
          ) : (
            smartAlerts.map((a, i) => (
              <div key={i} className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs font-black text-rose-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{a.msg}</span>
              </div>
            ))
          )}
        </div>
      )}

      {subView === 'settings' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onChangeState({
              ...state,
              settings: settingsDraft,
              auditLogs: [appendAudit('تحديث إعدادات', 'إعدادات صيانة الحبوب', branchId, settingsDraft.decisionNote), ...state.auditLogs],
            });
            notify('ok', 'تم حفظ إعدادات ومعادلات صيانة الحبوب والصوامع.');
          }}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 text-xs"
        >
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">نسبة التحميل غير المباشر %</label>
              <input type="number" step="0.5" value={settingsDraft.defaultIndirectOverheadPct} onChange={(e) => setSettingsDraft({ ...settingsDraft, defaultIndirectOverheadPct: Number(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">نسبة الضرائب %</label>
              <input type="number" step="0.5" value={settingsDraft.defaultTaxPct} onChange={(e) => setSettingsDraft({ ...settingsDraft, defaultTaxPct: Number(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">الحد الأقصى المقبول للفاقد %</label>
              <input type="number" step="0.1" value={settingsDraft.maxAcceptableGrainLossPct} onChange={(e) => setSettingsDraft({ ...settingsDraft, maxAcceptableGrainLossPct: Number(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">الرطوبة المرجعية الافتراضية %</label>
              <input type="number" step="0.1" value={settingsDraft.defaultReferenceMoisturePct} onChange={(e) => setSettingsDraft({ ...settingsDraft, defaultReferenceMoisturePct: Number(e.target.value) || 12 })} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
            </div>
          </div>
          {!isViewer && (
            <button type="submit" className="px-5 py-2 bg-[#0A1628] text-[#D4AF37] rounded-xl font-black cursor-pointer">
              حفظ الإعدادات
            </button>
          )}
        </form>
      )}

      {subView === 'audit' && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-xs text-center border-collapse">
            <thead className="bg-[#0A1628] text-white font-black">
              <tr>
                <th className="py-2 px-2 border border-slate-700">الوقت</th>
                <th className="py-2 px-2 border border-slate-700">المستخدم</th>
                <th className="py-2 px-2 border border-slate-700">الإجراء</th>
                <th className="py-2 px-2 border border-slate-700 text-right">التفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-bold">
              {state.auditLogs.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 px-2 font-mono">{new Date(a.timestamp).toLocaleString('ar-EG')}</td>
                  <td className="py-2 px-2">{a.userFullName}</td>
                  <td className="py-2 px-2 text-[#0D9488]">{a.actionType}</td>
                  <td className="py-2 px-2 text-right">{a.afterSummary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
