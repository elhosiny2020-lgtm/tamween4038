import React, { useState, useMemo } from 'react';
import { Bakery, DebtRecord, VillageHierarchy, SystemConfig } from '../types';
import { PAYMENT_METHODS } from '../defaultData';
import {
  FileSpreadsheet,
  Printer,
  Plus,
  Search,
  Filter,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Edit2,
  Trash2,
  X,
  Save,
  Building,
  RotateCcw,
  Scale
} from 'lucide-react';

import { WeeklyInstallmentsModal } from './WeeklyInstallmentsModal';

interface DebtsViewProps {
  bakeries: Bakery[];
  debts: DebtRecord[];
  villages: VillageHierarchy[];
  issuingEntities: string[];
  violationTypes: string[];
  systemConfig: SystemConfig;
  onSaveDebt: (debt: DebtRecord) => void;
  onDeleteDebt: (debtId: string) => void;
  onUpdateEntities: (entities: string[]) => void;
  onUpdateViolations: (violations: string[]) => void;
  filterBakeryId?: string;
  onClearBakeryFilter?: () => void;
}

export const DebtsView: React.FC<DebtsViewProps> = ({
  bakeries,
  debts,
  villages,
  issuingEntities,
  violationTypes,
  systemConfig,
  onSaveDebt,
  onDeleteDebt,
  onUpdateEntities,
  onUpdateViolations,
  filterBakeryId,
  onClearBakeryFilter,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVillage, setSelectedVillage] = useState('ALL');
  const [selectedUnit, setSelectedUnit] = useState('ALL');
  const [selectedEntity, setSelectedEntity] = useState('ALL');
  const [selectedViolationType, setSelectedViolationType] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'UNPAID' | 'PAID' | 'OVER_20K'>('ALL');

  // Modals state
  const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
  const [debtToEdit, setDebtToEdit] = useState<DebtRecord | null>(null);

  const [isEntitiesModalOpen, setIsEntitiesModalOpen] = useState(false);
  const [isViolationsModalOpen, setIsViolationsModalOpen] = useState(false);
  const [isWeeklyInstallmentsOpen, setIsWeeklyInstallmentsOpen] = useState(false);
  const [installmentBakeryId, setInstallmentBakeryId] = useState<string | undefined>(undefined);

  // Row highlight state
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // Manage entities inside modal
  const [newEntityName, setNewEntityName] = useState('');
  const [newViolationName, setNewViolationName] = useState('');

  // Filtering
  const filteredDebts = useMemo(() => {
    return debts.filter((d) => {
      if (filterBakeryId && d.bakeryId !== filterBakeryId) return false;
      if (selectedVillage !== 'ALL' && d.village !== selectedVillage) return false;
      if (selectedUnit !== 'ALL' && d.localUnit !== selectedUnit) return false;
      if (selectedEntity !== 'ALL' && d.issuingEntity !== selectedEntity) return false;
      if (selectedViolationType !== 'ALL' && d.violationType !== selectedViolationType) return false;

      if (selectedStatus === 'UNPAID' && d.netRemainingDebt <= 0) return false;
      if (selectedStatus === 'PAID' && d.netRemainingDebt > 0) return false;
      if (selectedStatus === 'OVER_20K' && (d.netRemainingDebt || 0) <= 20000) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const match =
          d.bakeryOwnerName.toLowerCase().includes(q) ||
          d.machineNumber.includes(q) ||
          d.village.toLowerCase().includes(q) ||
          d.localUnit.toLowerCase().includes(q) ||
          d.issuingEntity.toLowerCase().includes(q) ||
          d.violationType.toLowerCase().includes(q) ||
          d.violationReceiptNumber.includes(q) ||
          d.addedReceiptNumber.includes(q) ||
          d.disposalReceiptNumber.includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [
    debts,
    filterBakeryId,
    selectedVillage,
    selectedUnit,
    selectedEntity,
    selectedViolationType,
    selectedStatus,
    searchTerm,
  ]);

  // Statistics
  const stats = useMemo(() => {
    let totalViolations = 0;
    let paidViolations = 0;
    let totalAdded = 0;
    let paidAdded = 0;
    let totalDisposal = 0;
    let paidDisposal = 0;
    let netRemainingTotal = 0;

    debts.forEach((d) => {
      totalViolations += d.totalViolations || 0;
      paidViolations += d.paidViolationAmount || 0;
      totalAdded += d.addedAmount || 0;
      paidAdded += d.paidAddedAmount || 0;
      totalDisposal += d.disposalValue || 0;
      paidDisposal += d.paidDisposalAmount || 0;
      netRemainingTotal += d.netRemainingDebt || 0;
    });

    return {
      totalViolations,
      paidViolations,
      totalAdded,
      paidAdded,
      totalDisposal,
      paidDisposal,
      netRemainingTotal,
    };
  }, [debts]);

  // Handle Export to CSV (Excel UTF-8 BOM)
  const handleExportCSV = () => {
    const headers = [
      'م',
      'اسم صاحب المخبز',
      'رقم الماكينة',
      'القرية',
      'الوحدة المحلية',
      'تاريخ المخالفة',
      'الجهة المحررة',
      'نوع المخالفة',
      'قيمة المخالفة',
      'مخالفات قديمة',
      'إجمالي المخالفات',
      'المسدد من المخالفات',
      'المتبقي من المخالفات',
      'المضاف للمخبز',
      'المسدد من المضاف',
      'المتبقي من المضاف',
      'عدد شكاير التصرف',
      'سعر الشيكارة',
      'مضاعفة العقوبة',
      'قيمة التصرف',
      'المسدد من التصرف',
      'المتبقي من التصرف',
      'صافي المتبقي على المخبز',
      'ملاحظات',
    ];

    const rows = filteredDebts.map((d, idx) => [
      idx + 1,
      `"${d.bakeryOwnerName.replace(/"/g, '""')}"`,
      `"${d.machineNumber}"`,
      `"${d.village}"`,
      `"${d.localUnit}"`,
      `"${d.violationDate}"`,
      `"${d.issuingEntity}"`,
      `"${d.violationType}"`,
      d.violationAmount,
      d.oldViolations,
      d.totalViolations,
      d.paidViolationAmount,
      d.remainingViolations,
      d.addedAmount,
      d.paidAddedAmount,
      d.remainingAdded,
      d.disposalBags,
      d.disposalBagPrice,
      `${d.disposalMultiplier}x`,
      d.disposalValue,
      d.paidDisposalAmount,
      d.remainingDisposal,
      d.netRemainingDebt,
      `"${(d.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `كشف_مديونيات_أصحاب_المخابز_مركز_المحلة_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintDebts = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      {/* Active Bakery Filter Notification */}
      {filterBakeryId && (
        <div className="bg-amber-100 border-2 border-amber-500 p-3 rounded-xl flex items-center justify-between text-amber-950 font-black text-xs">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-amber-700" />
            <span>
              عرض مديونيات المخبز المحدد فقط: (
              {debts.find((d) => d.bakeryId === filterBakeryId)?.bakeryOwnerName ||
                bakeries.find((b) => b.id === filterBakeryId)?.bakeryOwnerName}
              )
            </span>
          </div>
          <button
            onClick={onClearBakeryFilter}
            className="inline-flex items-center gap-1 px-3 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            إلغاء التصفية وعرض كافة المخابز
          </button>
        </div>
      )}

      {/* Top Stat Cards for Debts */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
        <div className="bg-white border-2 border-slate-200 rounded-xl p-3 text-center shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 block mb-0.5">
            إجمالي المخالفات
          </span>
          <span className="stat-num text-slate-900 block">
            {stats.totalViolations.toLocaleString()}
          </span>
          <span className="text-[10px] text-slate-400 font-bold">ج.م</span>
        </div>

        <div className="bg-white border-2 border-emerald-200 rounded-xl p-3 text-center shadow-xs">
          <span className="text-[11px] font-bold text-emerald-700 block mb-0.5">
            المسدد من المخالفات
          </span>
          <span className="stat-num text-emerald-800 block">
            {stats.paidViolations.toLocaleString()}
          </span>
          <span className="text-[10px] text-emerald-600 font-bold">ج.م</span>
        </div>

        <div className="bg-white border-2 border-blue-200 rounded-xl p-3 text-center shadow-xs">
          <span className="text-[11px] font-bold text-blue-700 block mb-0.5">إجمالي المضاف</span>
          <span className="stat-num text-blue-800 block">
            {stats.totalAdded.toLocaleString()}
          </span>
          <span className="text-[10px] text-blue-600 font-bold">ج.م</span>
        </div>

        <div className="bg-white border-2 border-indigo-200 rounded-xl p-3 text-center shadow-xs">
          <span className="text-[11px] font-bold text-indigo-700 block mb-0.5">
            المسدد من المضاف
          </span>
          <span className="stat-num text-indigo-800 block">
            {stats.paidAdded.toLocaleString()}
          </span>
          <span className="text-[10px] text-indigo-600 font-bold">ج.م</span>
        </div>

        <div className="bg-white border-2 border-orange-200 rounded-xl p-3 text-center shadow-xs">
          <span className="text-[11px] font-bold text-orange-700 block mb-0.5">إجمالي التصرف</span>
          <span className="stat-num text-orange-800 block">
            {stats.totalDisposal.toLocaleString()}
          </span>
          <span className="text-[10px] text-orange-600 font-bold">ج.م</span>
        </div>

        <div className="bg-white border-2 border-amber-200 rounded-xl p-3 text-center shadow-xs">
          <span className="text-[11px] font-bold text-amber-700 block mb-0.5">
            المسدد من التصرف
          </span>
          <span className="stat-num text-amber-800 block">
            {stats.paidDisposal.toLocaleString()}
          </span>
          <span className="text-[10px] text-amber-600 font-bold">ج.م</span>
        </div>

        <div className="col-span-2 md:col-span-4 lg:col-span-1 bg-gradient-to-br from-red-600 to-rose-700 text-white rounded-xl p-3 text-center shadow-md border-2 border-red-500">
          <span className="text-[11px] font-black text-rose-100 block mb-0.5">
            صافي المتبقي الكلي
          </span>
          <span className="stat-num text-white block">
            {stats.netRemainingTotal.toLocaleString()}
          </span>
          <span className="text-[10px] text-rose-200 font-black">ج.م مستحق</span>
        </div>
      </div>

      {/* Toolbar & Filter Bar */}
      <div className="bg-white border-2 border-slate-200 rounded-xl p-3.5 shadow-sm space-y-3 no-print">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث باسم صاحب المخبز، رقم الماكينة، رقم الإيصال..."
              className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 text-right"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setDebtToEdit(null);
                setIsDebtModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-red-700 to-rose-800 hover:from-red-800 hover:to-rose-900 text-white rounded-lg text-xs font-black shadow-md transition cursor-pointer"
            >
              <Plus className="w-4 h-4 text-rose-200" />
              تسجيل مديونية / مخالفة جديدة
            </button>

            <button
              onClick={() => setIsEntitiesModalOpen(true)}
              className="inline-flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold transition"
            >
              <Building className="w-3.5 h-3.5 text-amber-600" />
              + الجهة المحررة للمحضر
            </button>

            <button
              onClick={() => setIsViolationsModalOpen(true)}
              className="inline-flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold transition"
            >
              <Scale className="w-3.5 h-3.5 text-red-600" />
              + نوع المخالفة
            </button>

            <button
              onClick={() => {
                setInstallmentBakeryId(undefined);
                setIsWeeklyInstallmentsOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-red-800 to-rose-900 hover:from-red-900 hover:to-black text-white rounded-lg text-xs font-black shadow-md border border-red-500 transition cursor-pointer"
            >
              <DollarSign className="w-4 h-4 text-amber-300" />
              جدولة الدفعات الأسبوعية (&gt; 20 ألف)
            </button>

            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-black shadow-sm transition"
            >
              <FileSpreadsheet className="w-4 h-4" />
              تصدير Excel
            </button>

            <button
              onClick={handlePrintDebts}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-black shadow-sm transition"
            >
              <Printer className="w-4 h-4 text-amber-300" />
              طباعة الكشف A4
            </button>
          </div>
        </div>

        {/* Dropdowns Filter */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 pt-2 border-t border-slate-100 text-xs">
          <div>
            <label className="block text-[11px] font-black text-slate-600 mb-1">القرية</label>
            <select
              value={selectedVillage}
              onChange={(e) => {
                setSelectedVillage(e.target.value);
                setSelectedUnit('ALL');
              }}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-black text-slate-800 focus:ring-1 focus:ring-amber-500"
            >
              <option value="ALL">كافة قرى المركز</option>
              {villages.map((v) => (
                <option key={v.village} value={v.village}>
                  {v.village}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-black text-slate-600 mb-1">
              الوحدة المحلية التابعة
            </label>
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-black text-slate-800 focus:ring-1 focus:ring-amber-500"
            >
              <option value="ALL">
                {selectedVillage === 'ALL'
                  ? 'كافة الوحدات المحلية بالمركز'
                  : `كافة وحدات ${selectedVillage}`}
              </option>
              {selectedVillage === 'ALL'
                ? villages.map((v) => (
                    <optgroup key={v.village} label={`قرية ${v.village}`}>
                      {v.localUnits.map((u) => (
                        <option key={`${v.village}-${u}`} value={u}>
                          {u} ({v.village})
                        </option>
                      ))}
                    </optgroup>
                  ))
                : (villages.find((v) => v.village === selectedVillage)?.localUnits || []).map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-black text-slate-600 mb-1">
              الجهة المحررة للمحضر
            </label>
            <select
              value={selectedEntity}
              onChange={(e) => setSelectedEntity(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-black text-slate-800 focus:ring-1 focus:ring-amber-500"
            >
              <option value="ALL">كافة الجهات المحررة</option>
              {issuingEntities.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-black text-slate-600 mb-1">نوع المخالفة</label>
            <select
              value={selectedViolationType}
              onChange={(e) => setSelectedViolationType(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-black text-slate-800 focus:ring-1 focus:ring-amber-500"
            >
              <option value="ALL">كافة أنواع المخالفات</option>
              {violationTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-black text-slate-600 mb-1">حالة السداد والجدولة</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as 'ALL' | 'UNPAID' | 'PAID' | 'OVER_20K')}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-black text-slate-800 focus:ring-1 focus:ring-amber-500"
            >
              <option value="ALL">الكل (المسدد والمتبقي)</option>
              <option value="OVER_20K">مديونيات تتجاوز 20,000 ج.م (تستلزم دفعات)</option>
              <option value="UNPAID">عليه مديونية متبقية فقط</option>
              <option value="PAID">خالص المديونية بالكامل</option>
            </select>
          </div>
        </div>
      </div>

      {/* Official Printable Header (Appears only during print) */}
      <div className="hidden print:block print-container mb-4 text-center border-b-2 border-black pb-3">
        <div className="flex items-center justify-between">
          <div className="text-right">
            <h4 className="text-xs font-black text-slate-800">جمهورية مصر العربية</h4>
            <h4 className="text-xs font-black text-slate-800">{systemConfig.governorateTitle}</h4>
            <h4 className="text-xs font-black text-slate-800">{systemConfig.directorateTitle}</h4>
            <h4 className="text-xs font-black text-slate-800">{systemConfig.administrationTitle}</h4>
          </div>
          <div className="w-16 h-16">
            <img src={systemConfig.logoBase64} alt="شعار" className="w-full h-full object-contain" />
          </div>
          <div className="text-left font-mono text-[10px]">
            <p>كشف مديونيات ومخالفات المخابز</p>
            <p>تاريخ الاستخراج: {new Date().toLocaleDateString('ar-EG')}</p>
          </div>
        </div>
        <h2 className="text-sm font-black mt-2 underline">
          كشف حصر مديونيات ومخالفات أصحاب المخابز البلدية بمركز المحلة الكبرى
        </h2>
      </div>

      {/* Grouped Headers Debts Table */}
      <div className="bg-white border-2 border-slate-300 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto max-h-[650px] relative">
          <table className="w-full text-center border-collapse text-xs">
            {/* Super Headers */}
            <thead className="sticky top-0 z-20 bg-slate-900 text-white font-black">
              <tr className="border-b border-slate-700">
                <th
                  colSpan={5}
                  className="py-2.5 px-2 bg-slate-900 border-l border-slate-700 text-amber-300"
                >
                  1. البيانات الأساسية وموقع المخبز
                </th>
                <th
                  colSpan={6}
                  className="py-2.5 px-2 bg-red-950 border-l border-slate-700 text-rose-200"
                >
                  2. مخالفات المخبز
                </th>
                <th
                  colSpan={5}
                  className="py-2.5 px-2 bg-emerald-950 border-l border-slate-700 text-emerald-200"
                >
                  3. سداد المخالفات
                </th>
                <th
                  colSpan={6}
                  className="py-2.5 px-2 bg-blue-950 border-l border-slate-700 text-blue-200"
                >
                  4. المنصرف وسداد المنصرف (المضاف)
                </th>
                <th
                  colSpan={5}
                  className="py-2.5 px-2 bg-amber-950 border-l border-slate-700 text-amber-200"
                >
                  5. التصرف من المخبز
                </th>
                <th
                  colSpan={5}
                  className="py-2.5 px-2 bg-teal-950 border-l border-slate-700 text-teal-200"
                >
                  6. السداد من التصرف
                </th>
                <th
                  rowSpan={2}
                  className="py-2.5 px-3 bg-red-700 border-l border-red-800 text-white text-xs font-black min-w-[130px]"
                >
                  صافي المتبقي على صاحب المخبز
                </th>
                <th
                  rowSpan={2}
                  className="py-2.5 px-2 bg-slate-800 text-white text-xs font-black no-print min-w-[100px]"
                >
                  الإجراءات
                </th>
              </tr>

              {/* Sub Columns Headers */}
              <tr className="bg-slate-800 text-[11px] text-slate-200 font-black border-b-2 border-slate-600">
                {/* 1. Basic Info */}
                <th className="py-2 px-1 border-l border-slate-700 w-10">م</th>
                <th className="py-2 px-2 border-l border-slate-700 min-w-[150px]">اسم صاحب المخبز</th>
                <th className="py-2 px-2 border-l border-slate-700 min-w-[90px]">رقم الماكينة</th>
                <th className="py-2 px-2 border-l border-slate-700 min-w-[80px]">القرية</th>
                <th className="py-2 px-2 border-l border-slate-700 min-w-[90px]">الوحدة التابعة</th>

                {/* 2. Violations */}
                <th className="py-2 px-2 border-l border-slate-700 min-w-[85px]">تاريخ العملية</th>
                <th className="py-2 px-2 border-l border-slate-700 min-w-[120px]">الجهة المحررة</th>
                <th className="py-2 px-2 border-l border-slate-700 min-w-[130px]">نوع المخالفة</th>
                <th className="py-2 px-2 border-l border-slate-700">قيمة المخالفة</th>
                <th className="py-2 px-2 border-l border-slate-700">مخالفات قديمة</th>
                <th className="py-2 px-2 border-l border-slate-700 bg-red-900/60 text-white">
                  إجمالي المخالفات
                </th>

                {/* 3. Violation Payment */}
                <th className="py-2 px-2 border-l border-slate-700 min-w-[85px]">تاريخ السداد</th>
                <th className="py-2 px-2 border-l border-slate-700 min-w-[80px]">رقم الإيصال</th>
                <th className="py-2 px-2 border-l border-slate-700 min-w-[85px]">نوع السداد</th>
                <th className="py-2 px-2 border-l border-slate-700 text-emerald-300">المبلغ المسدد</th>
                <th className="py-2 px-2 border-l border-slate-700 bg-emerald-900/60 text-white">
                  المتبقي
                </th>

                {/* 4. Added (المضاف) */}
                <th className="py-2 px-2 border-l border-slate-700">المضاف للمخبز</th>
                <th className="py-2 px-2 border-l border-slate-700 min-w-[85px]">تاريخ السداد</th>
                <th className="py-2 px-2 border-l border-slate-700 min-w-[80px]">رقم الإيصال</th>
                <th className="py-2 px-2 border-l border-slate-700 min-w-[85px]">نوع السداد</th>
                <th className="py-2 px-2 border-l border-slate-700 text-blue-300">المسدد من المضاف</th>
                <th className="py-2 px-2 border-l border-slate-700 bg-blue-900/60 text-white">
                  المتبقي
                </th>

                {/* 5. Disposal (التصرف) */}
                <th className="py-2 px-2 border-l border-slate-700 min-w-[85px]">تاريخ التصرف</th>
                <th className="py-2 px-1 border-l border-slate-700">الشكاير</th>
                <th className="py-2 px-2 border-l border-slate-700">سعر الشيكارة</th>
                <th className="py-2 px-1 border-l border-slate-700">المضاعفة</th>
                <th className="py-2 px-2 border-l border-slate-700 bg-amber-900/60 text-white">
                  قيمة التصرف
                </th>

                {/* 6. Disposal Payment */}
                <th className="py-2 px-2 border-l border-slate-700">قيمة التصرف</th>
                <th className="py-2 px-2 border-l border-slate-700 min-w-[85px]">تاريخ السداد</th>
                <th className="py-2 px-2 border-l border-slate-700 min-w-[80px]">رقم الإيصال</th>
                <th className="py-2 px-2 border-l border-slate-700 min-w-[85px]">نوع السداد</th>
                <th className="py-2 px-2 border-l border-slate-700 text-teal-300">السداد من التصرف</th>
              </tr>
            </thead>

            {/* Table Body with Professional Row Highlight */}
            <tbody className="divide-y divide-slate-200 font-bold">
              {filteredDebts.length === 0 ? (
                <tr>
                  <td colSpan={34} className="py-10 text-center text-slate-500 font-black">
                    لا توجد أي قيود مديونية مطابقة لمعايير البحث الحالية
                  </td>
                </tr>
              ) : (
                filteredDebts.map((d, index) => {
                  const isSelected = selectedRowId === d.id;
                  return (
                    <tr
                      key={d.id}
                      onClick={() => setSelectedRowId(d.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'row-selected'
                          : index % 2 === 0
                          ? 'bg-white hover:bg-amber-50/60'
                          : 'bg-slate-50/70 hover:bg-amber-50/60'
                      }`}
                    >
                      {/* 1. Basic Info */}
                      <td className="py-2 px-1 border-l border-slate-200 num-enlarged">{index + 1}</td>
                      <td className="py-2 px-2 border-l border-slate-200 font-black text-slate-900 text-right">
                        {d.bakeryOwnerName}
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200 num-enlarged font-black text-slate-900">
                        {d.machineNumber}
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200">{d.village}</td>
                      <td className="py-2 px-2 border-l border-slate-200 text-slate-600">{d.localUnit}</td>

                      {/* 2. Violations */}
                      <td className="py-2 px-2 border-l border-slate-200 num-enlarged text-slate-700">
                        {d.violationDate || '-'}
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200 text-xs text-slate-700">
                        {d.issuingEntity}
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200 text-xs text-red-900 font-bold">
                        {d.violationType}
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200 num-enlarged text-red-700">
                        {d.violationAmount?.toLocaleString()}
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200 num-enlarged text-slate-600">
                        {d.oldViolations?.toLocaleString()}
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200 num-enlarged font-black bg-red-50 text-red-900">
                        {d.totalViolations?.toLocaleString()}
                      </td>

                      {/* 3. Violation Payment */}
                      <td className="py-2 px-2 border-l border-slate-200 num-enlarged text-slate-700">
                        {d.violationPaymentDate || '-'}
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200 text-slate-700">
                        {d.violationReceiptNumber || '-'}
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 text-slate-800">
                          {d.violationPaymentMethod}
                        </span>
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200 num-enlarged font-black text-emerald-700">
                        {d.paidViolationAmount?.toLocaleString()}
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200 num-enlarged font-black bg-emerald-50 text-emerald-900">
                        {d.remainingViolations?.toLocaleString()}
                      </td>

                      {/* 4. Added (المضاف) */}
                      <td className="py-2 px-2 border-l border-slate-200 num-enlarged text-blue-800">
                        {d.addedAmount?.toLocaleString()}
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200 num-enlarged text-slate-700">
                        {d.addedPaymentDate || '-'}
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200 text-slate-700">
                        {d.addedReceiptNumber || '-'}
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 text-slate-800">
                          {d.addedPaymentMethod}
                        </span>
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200 num-enlarged font-black text-blue-700">
                        {d.paidAddedAmount?.toLocaleString()}
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200 num-enlarged font-black bg-blue-50 text-blue-900">
                        {d.remainingAdded?.toLocaleString()}
                      </td>

                      {/* 5. Disposal (التصرف) */}
                      <td className="py-2 px-2 border-l border-slate-200 num-enlarged text-slate-700">
                        {d.disposalDate || '-'}
                      </td>
                      <td className="py-2 px-1 border-l border-slate-200 num-enlarged">{d.disposalBags}</td>
                      <td className="py-2 px-2 border-l border-slate-200 num-enlarged">
                        {d.disposalBagPrice?.toLocaleString()}
                      </td>
                      <td className="py-2 px-1 border-l border-slate-200 num-enlarged text-amber-700">
                        {d.disposalMultiplier}x
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200 num-enlarged font-black bg-amber-50 text-amber-900">
                        {d.disposalValue?.toLocaleString()}
                      </td>

                      {/* 6. Disposal Payment */}
                      <td className="py-2 px-2 border-l border-slate-200 num-enlarged text-slate-700">
                        {d.disposalValue?.toLocaleString()}
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200 num-enlarged text-slate-700">
                        {d.disposalPaymentDate || '-'}
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200 text-slate-700">
                        {d.disposalReceiptNumber || '-'}
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 text-slate-800">
                          {d.disposalPaymentMethod}
                        </span>
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200 num-enlarged font-black text-teal-700">
                        {d.paidDisposalAmount?.toLocaleString()}
                      </td>

                      {/* Net Remaining Debt */}
                      <td className="py-2 px-3 border-l border-slate-300 num-enlarged font-black">
                        {d.netRemainingDebt > 0 ? (
                          <div className="space-y-1">
                            <span className="inline-block px-2.5 py-1 bg-red-100 text-red-800 border border-red-300 rounded-lg">
                              {d.netRemainingDebt.toLocaleString()} ج.م
                            </span>
                            {d.netRemainingDebt > 20000 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInstallmentBakeryId(d.bakeryId);
                                  setIsWeeklyInstallmentsOpen(true);
                                }}
                                className="block mx-auto text-[10px] bg-red-800 hover:bg-black text-amber-200 px-2 py-0.5 rounded-full font-black animate-pulse cursor-pointer shadow-xs"
                                title="مديونية تتجاوز 20,000 ج.م - انقر لجدولة دفعات أسبوعية"
                              >
                                &gt; 20 ألف (جدول دفعات أسبوعية)
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            خالص (0)
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-2 no-print">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDebtToEdit(d);
                              setIsDebtModalOpen(true);
                            }}
                            className="p-1 hover:bg-amber-100 text-amber-700 rounded transition"
                            title="تعديل المديونية"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`هل أنت متأكد من حذف قيد المديونية الخاص بـ "${d.bakeryOwnerName}"؟`)) {
                                onDeleteDebt(d.id);
                              }
                            }}
                            className="p-1 hover:bg-red-100 text-red-600 rounded transition"
                            title="حذف القيد"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Add / Edit Debt Record */}
      {isDebtModalOpen && (
        <DebtModalForm
          isOpen={isDebtModalOpen}
          onClose={() => setIsDebtModalOpen(false)}
          debtToEdit={debtToEdit}
          bakeries={bakeries}
          issuingEntities={issuingEntities}
          violationTypes={violationTypes}
          onSave={(saved) => {
            onSaveDebt(saved);
            setIsDebtModalOpen(false);
          }}
        />
      )}

      {/* Modal 2: Dynamic Issuing Entities Manager */}
      {isEntitiesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border-2 border-amber-600 w-full max-w-md p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="text-sm font-black text-slate-900">
                إدارة الجهات المحررة لمحاضر المخابز
              </h3>
              <button
                onClick={() => setIsEntitiesModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <input
                type="text"
                value={newEntityName}
                onChange={(e) => setNewEntityName(e.target.value)}
                placeholder="اسم الجهة (مثال: جهاز حماية المستهلك)"
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 text-right"
              />
              <button
                type="button"
                onClick={() => {
                  const name = newEntityName.trim();
                  if (!name) return;
                  if (issuingEntities.includes(name)) {
                    alert('هذه الجهة مسجلة بالفعل');
                    return;
                  }
                  onUpdateEntities([...issuingEntities, name]);
                  setNewEntityName('');
                }}
                className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-black"
              >
                إضافة
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2">
              {issuingEntities.map((ent) => (
                <div
                  key={ent}
                  className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                >
                  <span>{ent}</span>
                  {issuingEntities.length > 1 && (
                    <button
                      onClick={() => onUpdateEntities(issuingEntities.filter((e) => e !== ent))}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setIsEntitiesModalOpen(false)}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-black"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Dynamic Violation Types Manager */}
      {isViolationsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border-2 border-red-600 w-full max-w-md p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="text-sm font-black text-slate-900">
                إدارة أنواع المخالفات التموينية المعتمدة
              </h3>
              <button
                onClick={() => setIsViolationsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <input
                type="text"
                value={newViolationName}
                onChange={(e) => setNewViolationName(e.target.value)}
                placeholder="نوع المخالفة (مثال: عدم نظافة المعجن)"
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 text-right"
              />
              <button
                type="button"
                onClick={() => {
                  const name = newViolationName.trim();
                  if (!name) return;
                  if (violationTypes.includes(name)) {
                    alert('نوع المخالفة مسجل مسبقاً');
                    return;
                  }
                  onUpdateViolations([...violationTypes, name]);
                  setNewViolationName('');
                }}
                className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-black"
              >
                إضافة
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2">
              {violationTypes.map((v) => (
                <div
                  key={v}
                  className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                >
                  <span>{v}</span>
                  {violationTypes.length > 1 && (
                    <button
                      onClick={() => onUpdateViolations(violationTypes.filter((vt) => vt !== v))}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-200 mt-4 flex justify-end">
              <button
                onClick={() => setIsViolationsModalOpen(false)}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-black cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Weekly Installments Schedule (> 20,000 EGP) */}
      {isWeeklyInstallmentsOpen && (
        <WeeklyInstallmentsModal
          isOpen={isWeeklyInstallmentsOpen}
          onClose={() => setIsWeeklyInstallmentsOpen(false)}
          bakeries={bakeries}
          debts={debts}
          systemConfig={systemConfig}
          initialBakeryId={installmentBakeryId}
        />
      )}
    </div>
  );
};

// Sub-component: Add / Edit Debt Modal Form
interface DebtModalFormProps {
  isOpen: boolean;
  onClose: () => void;
  debtToEdit: DebtRecord | null;
  bakeries: Bakery[];
  issuingEntities: string[];
  violationTypes: string[];
  onSave: (debt: DebtRecord) => void;
}

const DebtModalForm: React.FC<DebtModalFormProps> = ({
  isOpen,
  onClose,
  debtToEdit,
  bakeries,
  issuingEntities,
  violationTypes,
  onSave,
}) => {
  // Bakery Selection
  const [selectedBakeryId, setSelectedBakeryId] = useState(
    debtToEdit?.bakeryId || bakeries[0]?.id || ''
  );

  // Violations
  const [violationDate, setViolationDate] = useState(
    debtToEdit?.violationDate || new Date().toISOString().split('T')[0]
  );
  const [issuingEntity, setIssuingEntity] = useState(
    debtToEdit?.issuingEntity || issuingEntities[0] || 'إدارة تموين مركز المحلة الكبرى'
  );
  const [violationType, setViolationType] = useState(
    debtToEdit?.violationType || violationTypes[0] || 'نقص وزن الرغيف البلدي المدعم'
  );
  const [violationAmount, setViolationAmount] = useState<number>(debtToEdit?.violationAmount || 0);
  const [oldViolations, setOldViolations] = useState<number>(debtToEdit?.oldViolations || 0);

  // Violation Payment
  const [violationPaymentDate, setViolationPaymentDate] = useState(
    debtToEdit?.violationPaymentDate || ''
  );
  const [violationReceiptNumber, setViolationReceiptNumber] = useState(
    debtToEdit?.violationReceiptNumber || ''
  );
  const [violationPaymentMethod, setViolationPaymentMethod] = useState(
    debtToEdit?.violationPaymentMethod || 'كاش'
  );
  const [paidViolationAmount, setPaidViolationAmount] = useState<number>(
    debtToEdit?.paidViolationAmount || 0
  );

  // Added (المضاف)
  const [addedAmount, setAddedAmount] = useState<number>(debtToEdit?.addedAmount || 0);
  const [addedPaymentDate, setAddedPaymentDate] = useState(debtToEdit?.addedPaymentDate || '');
  const [addedReceiptNumber, setAddedReceiptNumber] = useState(debtToEdit?.addedReceiptNumber || '');
  const [addedPaymentMethod, setAddedPaymentMethod] = useState(
    debtToEdit?.addedPaymentMethod || 'كاش'
  );
  const [paidAddedAmount, setPaidAddedAmount] = useState<number>(debtToEdit?.paidAddedAmount || 0);

  // Disposal (التصرف)
  const [disposalDate, setDisposalDate] = useState(debtToEdit?.disposalDate || '');
  const [disposalBags, setDisposalBags] = useState<number>(debtToEdit?.disposalBags || 0);
  const [disposalBagPrice, setDisposalBagPrice] = useState<number>(
    debtToEdit?.disposalBagPrice || 950
  );
  const [disposalMultiplier, setDisposalMultiplier] = useState<number>(
    debtToEdit?.disposalMultiplier || 1
  );

  // Disposal Payment
  const [disposalPaymentDate, setDisposalPaymentDate] = useState(
    debtToEdit?.disposalPaymentDate || ''
  );
  const [disposalReceiptNumber, setDisposalReceiptNumber] = useState(
    debtToEdit?.disposalReceiptNumber || ''
  );
  const [disposalPaymentMethod, setDisposalPaymentMethod] = useState(
    debtToEdit?.disposalPaymentMethod || 'كاش'
  );
  const [paidDisposalAmount, setPaidDisposalAmount] = useState<number>(
    debtToEdit?.paidDisposalAmount || 0
  );

  const [notes, setNotes] = useState(debtToEdit?.notes || '');
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string>('');

  // Auto-calculated values
  const totalViolations = (Number(violationAmount) || 0) + (Number(oldViolations) || 0);
  const remainingViolations = Math.max(0, totalViolations - (Number(paidViolationAmount) || 0));

  const remainingAdded = Math.max(0, (Number(addedAmount) || 0) - (Number(paidAddedAmount) || 0));

  // Auto-save draft on any field change
  React.useEffect(() => {
    if (!isOpen) return;

    const draft = {
      selectedBakeryId,
      violationDate,
      issuingEntity,
      violationType,
      violationAmount,
      oldViolations,
      violationPaymentDate,
      violationReceiptNumber,
      violationPaymentMethod,
      paidViolationAmount,
      addedAmount,
      addedPaymentDate,
      addedReceiptNumber,
      addedPaymentMethod,
      paidAddedAmount,
      disposalDate,
      disposalBags,
      disposalBagPrice,
      disposalMultiplier,
      disposalPaymentDate,
      disposalReceiptNumber,
      disposalPaymentMethod,
      paidDisposalAmount,
      notes,
      updatedAt: Date.now(),
    };

    try {
      localStorage.setItem('TAMWEEN_DEBT_DRAFT', JSON.stringify(draft));
      setAutoSaveStatus('saved');
      setLastAutoSaveTime(
        new Date().toLocaleTimeString('ar-EG', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    } catch {
      // storage fallback
    }
  }, [
    isOpen,
    selectedBakeryId,
    violationDate,
    issuingEntity,
    violationType,
    violationAmount,
    oldViolations,
    violationPaymentDate,
    violationReceiptNumber,
    violationPaymentMethod,
    paidViolationAmount,
    addedAmount,
    addedPaymentDate,
    addedReceiptNumber,
    addedPaymentMethod,
    paidAddedAmount,
    disposalDate,
    disposalBags,
    disposalBagPrice,
    disposalMultiplier,
    disposalPaymentDate,
    disposalReceiptNumber,
    disposalPaymentMethod,
    paidDisposalAmount,
    notes,
  ]);

  const disposalValue =
    (Number(disposalBags) || 0) *
    (Number(disposalBagPrice) || 0) *
    (Number(disposalMultiplier) || 1);
  const remainingDisposal = Math.max(0, disposalValue - (Number(paidDisposalAmount) || 0));

  // Required Exact Net Remaining Debt Equation:
  // (قيمة المخالفة + مخالفات قديمة - المبلغ المسدد) + (قيمة التصرف - السداد من التصرف) + (المضاف - المسدد من المضاف)
  const netRemainingDebt = remainingViolations + remainingDisposal + remainingAdded;

  const currentBakery = bakeries.find((b) => b.id === selectedBakeryId) || bakeries[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBakery) {
      alert('يرجى اختيار مخبز مسجل أولاً');
      return;
    }

    const record: DebtRecord = {
      id: debtToEdit ? debtToEdit.id : `d-${Date.now()}`,
      bakeryId: currentBakery.id,
      bakeryOwnerName: currentBakery.bakeryOwnerName,
      machineNumber: currentBakery.machineNumber,
      village: currentBakery.village,
      localUnit: currentBakery.localUnit,

      violationDate,
      issuingEntity,
      violationType,
      violationAmount: Number(violationAmount) || 0,
      oldViolations: Number(oldViolations) || 0,
      totalViolations,

      violationPaymentDate,
      violationReceiptNumber,
      violationPaymentMethod,
      paidViolationAmount: Number(paidViolationAmount) || 0,
      remainingViolations,

      addedAmount: Number(addedAmount) || 0,
      addedPaymentDate,
      addedReceiptNumber,
      addedPaymentMethod,
      paidAddedAmount: Number(paidAddedAmount) || 0,
      remainingAdded,

      disposalDate,
      disposalBags: Number(disposalBags) || 0,
      disposalBagPrice: Number(disposalBagPrice) || 0,
      disposalMultiplier: Number(disposalMultiplier) || 1,
      disposalValue,

      disposalPaymentDate,
      disposalReceiptNumber,
      disposalPaymentMethod,
      paidDisposalAmount: Number(paidDisposalAmount) || 0,
      remainingDisposal,

      netRemainingDebt,
      notes: notes.trim(),
    };

    onSave(record);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border-2 border-red-600/40 w-full max-w-5xl my-4 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Top Header */}
        <div className="bg-gradient-to-r from-red-950 via-slate-900 to-amber-950 p-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Scale className="w-6 h-6 text-amber-300" />
            <div>
              <h3 className="text-base font-black">
                {debtToEdit ? 'تعديل قيد مديونية / مخالفة مخبز' : 'تسجيل قيد مديونية ومخالفة جديدة'}
              </h3>
              <p className="text-[11px] text-amber-100 font-bold">
                حساب آلي للمخالفات، المضاف، التصرف، والسداد بصافي المتبقي الدقيق
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {autoSaveStatus === 'saved' && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 border border-emerald-400/50 rounded-full text-[11px] font-black text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>تم الحفظ التلقائي لكل بيان ({lastAutoSaveTime})</span>
              </div>
            )}
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-4 flex-1">
          {/* Net Remaining Summary Banner */}
          <div className="bg-gradient-to-r from-red-50 via-amber-50 to-red-50 border-2 border-red-300 p-3.5 rounded-xl flex items-center justify-between gap-4">
            <div>
              <span className="text-xs font-black text-slate-700 block">
                المعادلة المعتمدة: (المخالفات - المسدد) + (التصرف - المسدد) + (المضاف - المسدد)
              </span>
              <span className="text-[11px] text-slate-500 font-bold">
                متبقي مخالفات: {remainingViolations.toLocaleString()} | متبقي تصرف: {remainingDisposal.toLocaleString()} | متبقي مضاف: {remainingAdded.toLocaleString()}
              </span>
            </div>
            <div className="text-left">
              <span className="text-[11px] font-bold text-red-900 block">صافي المتبقي على صاحب المخبز</span>
              <span className="text-xl font-black text-red-700 num-enlarged">
                {netRemainingDebt.toLocaleString()} ج.م
              </span>
            </div>
          </div>

          {/* Section 1: Choose Bakery */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <h4 className="text-xs font-black text-slate-800 pb-2 mb-3 border-b border-slate-200 flex items-center gap-1.5">
              <Building className="w-4 h-4 text-amber-600" />
              1. البيانات الأساسية وموقع المخبز (جلب تلقائي)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div className="md:col-span-2">
                <label className="block text-xs font-black text-slate-700 mb-1">
                  اختر صاحب المخبز من قاعدة البيانات *
                </label>
                <select
                  value={selectedBakeryId}
                  onChange={(e) => setSelectedBakeryId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500"
                >
                  {bakeries.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bakeryOwnerName} (ماكينة: {b.machineNumber} - قرية: {b.village})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">رقم الماكينة</label>
                <input
                  type="text"
                  disabled
                  value={currentBakery?.machineNumber || ''}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-black text-slate-700 num-enlarged text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">القرية</label>
                <input
                  type="text"
                  disabled
                  value={currentBakery?.village || ''}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-black text-slate-700 text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">الوحدة التابعة</label>
                <input
                  type="text"
                  disabled
                  value={currentBakery?.localUnit || ''}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-black text-slate-700 text-center"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Violations */}
          <div className="border border-red-200 rounded-xl p-4 bg-red-50/20">
            <h4 className="text-xs font-black text-red-900 pb-2 mb-3 border-b border-red-200 flex items-center justify-between">
              <span>2. مخالفات المخبز</span>
              <span className="text-[11px] text-red-700 font-black">
                إجمالي المخالفات: {totalViolations.toLocaleString()} ج.م
              </span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">تاريخ العملية</label>
                <input
                  type="date"
                  value={violationDate}
                  onChange={(e) => setViolationDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">
                  الجهة المحررة للمحضر
                </label>
                <select
                  value={issuingEntity}
                  onChange={(e) => setIssuingEntity(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                >
                  {issuingEntities.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-black text-slate-700 mb-1">نوع المخالفة</label>
                <select
                  value={violationType}
                  onChange={(e) => setViolationType(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                >
                  {violationTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">قيمة المخالفة (ج.م)</label>
                <input
                  type="number"
                  value={violationAmount}
                  onChange={(e) => setViolationAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black num-enlarged text-center"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">مخالفات قديمة (ج.م)</label>
                <input
                  type="number"
                  value={oldViolations}
                  onChange={(e) => setOldViolations(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black num-enlarged text-center"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Violation Payment */}
          <div className="border border-emerald-200 rounded-xl p-4 bg-emerald-50/20">
            <h4 className="text-xs font-black text-emerald-900 pb-2 mb-3 border-b border-emerald-200 flex items-center justify-between">
              <span>3. سداد المخالفات</span>
              <span className="text-[11px] text-emerald-700 font-black">
                المتبقي من المخالفات: {remainingViolations.toLocaleString()} ج.م
              </span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">تاريخ السداد</label>
                <input
                  type="date"
                  value={violationPaymentDate}
                  onChange={(e) => setViolationPaymentDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">رقم الإيصال / القسيمة</label>
                <input
                  type="text"
                  value={violationReceiptNumber}
                  onChange={(e) => setViolationReceiptNumber(e.target.value)}
                  placeholder="رقم القسيمة"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-center"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">نوع السداد</label>
                <select
                  value={violationPaymentMethod}
                  onChange={(e) => setViolationPaymentMethod(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">المبلغ المسدد (ج.م)</label>
                <input
                  type="number"
                  value={paidViolationAmount}
                  onChange={(e) => setPaidViolationAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-white border border-emerald-400 rounded-lg text-xs font-black num-enlarged text-center"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Added Amount (المضاف) */}
          <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/20">
            <h4 className="text-xs font-black text-blue-900 pb-2 mb-3 border-b border-blue-200 flex items-center justify-between">
              <span>4. المنصرف وسداد المنصرف (المضاف للمخبز)</span>
              <span className="text-[11px] text-blue-700 font-black">
                المتبقي من المضاف: {remainingAdded.toLocaleString()} ج.م
              </span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">المضاف للمخبز (ج.م)</label>
                <input
                  type="number"
                  value={addedAmount}
                  onChange={(e) => setAddedAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black num-enlarged text-center"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">تاريخ السداد</label>
                <input
                  type="date"
                  value={addedPaymentDate}
                  onChange={(e) => setAddedPaymentDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">رقم الإيصال</label>
                <input
                  type="text"
                  value={addedReceiptNumber}
                  onChange={(e) => setAddedReceiptNumber(e.target.value)}
                  placeholder="رقم القسيمة"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-center"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">نوع السداد</label>
                <select
                  value={addedPaymentMethod}
                  onChange={(e) => setAddedPaymentMethod(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">المسدد من المضاف (ج.م)</label>
                <input
                  type="number"
                  value={paidAddedAmount}
                  onChange={(e) => setPaidAddedAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-white border border-blue-400 rounded-lg text-xs font-black num-enlarged text-center"
                />
              </div>
            </div>
          </div>

          {/* Section 5: Disposal (التصرف في الدقيق) */}
          <div className="border border-amber-200 rounded-xl p-4 bg-amber-50/20">
            <h4 className="text-xs font-black text-amber-900 pb-2 mb-3 border-b border-amber-200 flex items-center justify-between">
              <span>5. التصرف من المخبز والسداد من التصرف</span>
              <span className="text-[11px] text-amber-700 font-black">
                قيمة التصرف: {disposalValue.toLocaleString()} ج.م | المتبقي: {remainingDisposal.toLocaleString()} ج.م
              </span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">تاريخ التصرف</label>
                <input
                  type="date"
                  value={disposalDate}
                  onChange={(e) => setDisposalDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">عدد الشكاير</label>
                <input
                  type="number"
                  value={disposalBags}
                  onChange={(e) => setDisposalBags(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black num-enlarged text-center"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">قيمة الشيكارة (ج.م)</label>
                <input
                  type="number"
                  value={disposalBagPrice}
                  onChange={(e) => setDisposalBagPrice(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black num-enlarged text-center"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">
                  مضاعفة العقوبة (1x - 5x)
                </label>
                <select
                  value={disposalMultiplier}
                  onChange={(e) => setDisposalMultiplier(parseInt(e.target.value) || 1)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black"
                >
                  <option value={1}>1x (قيمة عادية)</option>
                  <option value={2}>2x (مضاعفة مرتين)</option>
                  <option value={3}>3x (مضاعفة 3 مرات)</option>
                  <option value={4}>4x (مضاعفة 4 مرات)</option>
                  <option value={5}>5x (مضاعفة 5 مرات)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">تاريخ سداد التصرف</label>
                <input
                  type="date"
                  value={disposalPaymentDate}
                  onChange={(e) => setDisposalPaymentDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">رقم الإيصال</label>
                <input
                  type="text"
                  value={disposalReceiptNumber}
                  onChange={(e) => setDisposalReceiptNumber(e.target.value)}
                  placeholder="رقم القسيمة"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-center"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">نوع السداد</label>
                <select
                  value={disposalPaymentMethod}
                  onChange={(e) => setDisposalPaymentMethod(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">السداد من التصرف (ج.م)</label>
                <input
                  type="number"
                  value={paidDisposalAmount}
                  onChange={(e) => setPaidDisposalAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-white border border-amber-400 rounded-lg text-xs font-black num-enlarged text-center"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-black text-slate-700 mb-1">ملاحظات وقيد السداد</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي ملاحظات حول إجراءات التحصيل أو الإنذارات القضائية"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-right"
            />
          </div>

          {/* Footer Controls */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border border-slate-300 rounded-lg text-xs font-black text-slate-700 hover:bg-slate-100 transition"
            >
              إلغاء
            </button>

            <button
              type="submit"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-red-700 to-rose-900 hover:from-red-800 hover:to-rose-950 text-white rounded-lg text-xs font-black shadow-md transition cursor-pointer"
            >
              <Save className="w-4 h-4 text-amber-200" />
              حفظ قيد المديونية
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
