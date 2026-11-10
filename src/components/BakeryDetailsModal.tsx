import React from 'react';
import { Bakery, DebtRecord, ColumnTitles } from '../types';
import { formatDateDDMMYYYY, extractBreadLoafMultiplier } from '../utils/auditHelper';
import {
  X,
  Store,
  Calculator,
  MapPin,
  Phone,
  CreditCard,
  Calendar,
  Scale,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  Wheat,
  Users,
} from 'lucide-react';

interface BakeryDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  bakery: Bakery | null;
  debts: DebtRecord[];
  columnTitles: ColumnTitles;
  canEdit: boolean;
  onEditBakery: (bakery: Bakery) => void;
  onJumpToDebts: (bakeryId: string) => void;
}

export const BakeryDetailsModal: React.FC<BakeryDetailsModalProps> = ({
  isOpen,
  onClose,
  bakery,
  debts,
  columnTitles: ct,
  canEdit,
  onEditBakery,
  onJumpToDebts,
}) => {
  if (!isOpen || !bakery) return null;

  const bakeryDebts = debts.filter((d) => d.bakeryId === bakery.id);
  const totalRemainingDebt = bakeryDebts.reduce((sum, d) => sum + (Number(d.netRemainingDebt) || 0), 0);
  const multiplier = extractBreadLoafMultiplier(bakery.breadTypeCount);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white text-slate-800 border border-slate-200 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-[#0F2342] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#1E3A8A] rounded-xl border border-sky-400/30">
              <Store className="w-5 h-5 text-sky-200" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                بطاقة البيانات التفصيلية للمخبز: {bakery.bakeryOwnerName}
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                رقم الماكينة: <span className="font-mono font-bold text-sky-300">{bakery.machineNumber}</span> · القرية:{' '}
                <span className="font-bold text-white">{bakery.village}</span> ({bakery.localUnit})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditBakery(bakery);
                }}
                className="px-3.5 py-2 bg-[#1E40AF] hover:bg-[#2563EB] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>تعديل بيانات المخبز</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق النافذة"
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto bg-[#F8FAFC]">
          {/* Section 1: Basic & Operational Data */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
            <h4 className="text-xs font-extrabold text-[#0F2342] mb-3 pb-2 border-b border-slate-100 flex items-center gap-2">
              <Wheat className="w-4 h-4 text-[#1E40AF]" />
              <span>أولاً: البيانات الأساسية والتشغيلية (مدخلة يدوياً)</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                <span className="text-slate-500 block text-[11px]">{ct.bakeryOwnerName}</span>
                <span className="font-extrabold text-slate-900 mt-0.5 block">{bakery.bakeryOwnerName}</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                <span className="text-slate-500 block text-[11px]">{ct.machineNumber}</span>
                <span className="font-mono font-extrabold text-[#1E3A8A] mt-0.5 block tabular-nums">
                  {bakery.machineNumber}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                <span className="text-slate-500 block text-[11px]">{ct.village} / {ct.localUnit}</span>
                <span className="font-bold text-slate-800 mt-0.5 block">
                  {bakery.village} - {bakery.localUnit}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                <span className="text-slate-500 block text-[11px]">{ct.activityStatus}</span>
                <span
                  className={`font-bold mt-0.5 inline-block ${
                    bakery.activityStatus === 'شغال' ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {bakery.activityStatus}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                <span className="text-slate-500 block text-[11px]">{ct.bakeryCategory || 'نوع المخابز'}</span>
                <span className="font-bold text-slate-800 mt-0.5 block">
                  {bakery.bakeryCategory || 'مخبز بلدي مدعم'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                <span className="text-slate-500 block text-[11px]">{ct.breadType}</span>
                <span className="font-bold text-slate-800 mt-0.5 block">{bakery.breadType}</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                <span className="text-slate-500 block text-[11px]">{ct.breadTypeCount} (المعامل)</span>
                <span className="font-mono font-extrabold text-[#1E3A8A] mt-0.5 block tabular-nums">
                  {bakery.breadTypeCount} ({multiplier} رغيف/شيكارة)
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                <span className="text-slate-500 block text-[11px]">{ct.lineType} / {ct.fuelType}</span>
                <span className="font-bold text-slate-800 mt-0.5 block">
                  {bakery.lineType} · {bakery.fuelType}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Quotas & Beneficiaries Inputs */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
            <h4 className="text-xs font-extrabold text-[#0F2342] mb-3 pb-2 border-b border-slate-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-[#1E40AF]" />
              <span>ثانياً: بيانات الحصص والمبالغ التأمينية والمستفيدين (مدخلات المعادلات)</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-center">
                <span className="text-slate-500 block text-[10px]">سعر الشيكارة</span>
                <span className="font-mono font-extrabold text-slate-900 text-sm tabular-nums">
                  {(bakery.flourBagPrice ?? 950).toLocaleString()} ج.م
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-center">
                <span className="text-slate-500 block text-[10px]">{ct.insuranceValue}</span>
                <span className="font-mono font-extrabold text-slate-900 text-sm tabular-nums">
                  {bakery.insuranceValue?.toLocaleString()} ج.م
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-center">
                <span className="text-slate-500 block text-[10px]">{ct.actualQuota}</span>
                <span className="font-mono font-extrabold text-[#1E3A8A] text-sm tabular-nums">
                  {bakery.actualQuota} شيكارة
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-center">
                <span className="text-slate-500 block text-[10px]">{ct.villagePopulation}</span>
                <span className="font-mono font-bold text-slate-800 text-sm tabular-nums">
                  {bakery.villagePopulation?.toLocaleString()}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-center">
                <span className="text-slate-500 block text-[10px]">{ct.beneficiaries2023}</span>
                <span className="font-mono font-bold text-slate-800 text-sm tabular-nums">
                  {bakery.beneficiaries2023?.toLocaleString()}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-center">
                <span className="text-slate-500 block text-[10px]">{ct.beneficiaries2024}</span>
                <span className="font-mono font-bold text-slate-800 text-sm tabular-nums">
                  {bakery.beneficiaries2024?.toLocaleString()}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-center">
                <span className="text-slate-500 block text-[10px]">{ct.beneficiaries2025}</span>
                <span className="font-mono font-bold text-slate-800 text-sm tabular-nums">
                  {bakery.beneficiaries2025?.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: The 7 Calculated Equations Breakdown */}
          <div className="bg-[#EFF6FF] border border-blue-200 rounded-xl p-4 shadow-2xs">
            <h4 className="text-xs font-extrabold text-[#0F2342] mb-3 pb-2 border-b border-blue-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-[#1E40AF]" />
                <span>ثالثاً: النتائج الحسابية التلقائية للمخبز (المعادلات السبع المعتمدة)</span>
              </div>
              <span className="text-[11px] font-bold text-[#1E40AF]">تحديث تلقائي فوري ∑</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="bg-white p-3 rounded-lg border border-blue-200">
                <span className="text-[11px] text-slate-500 block">1. الحصة التأمينية (المبلغ ÷ 235 ÷ 3)</span>
                <span className="text-base font-mono font-black text-[#0F2342] mt-1 block tabular-nums">
                  {bakery.insuranceQuota} شيكارة
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {bakery.insuranceValue} ÷ 235 ÷ 3
                </span>
              </div>

              <div className="bg-white p-3 rounded-lg border border-blue-200">
                <span className="text-[11px] text-slate-500 block">2. عدد الأرغفة (الحصة الفعلية × {multiplier})</span>
                <span className="text-base font-mono font-black text-[#0F2342] mt-1 block tabular-nums">
                  {bakery.loavesCount?.toLocaleString()} رغيف
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {bakery.actualQuota} × {multiplier}
                </span>
              </div>

              <div className="bg-white p-3 rounded-lg border border-blue-200">
                <span className="text-[11px] text-slate-500 block">3. متوسط نصيب الفرد لعام 2023</span>
                <span className="text-base font-mono font-black text-[#1E40AF] mt-1 block tabular-nums">
                  {bakery.avg2023} رغيف/فرد
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {bakery.loavesCount} ÷ {bakery.beneficiaries2023}
                </span>
              </div>

              <div className="bg-white p-3 rounded-lg border border-blue-200">
                <span className="text-[11px] text-slate-500 block">4. متوسط نصيب الفرد لعام 2024</span>
                <span className="text-base font-mono font-black text-[#1E40AF] mt-1 block tabular-nums">
                  {bakery.avg2024} رغيف/فرد
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {bakery.loavesCount} ÷ {bakery.beneficiaries2024}
                </span>
              </div>

              <div className="bg-white p-3 rounded-lg border border-blue-200">
                <span className="text-[11px] text-slate-500 block">5. متوسط نصيب الفرد لعام 2025</span>
                <span className="text-base font-mono font-black text-[#1E40AF] mt-1 block tabular-nums">
                  {bakery.avg2025} رغيف/فرد
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {bakery.loavesCount} ÷ {bakery.beneficiaries2025}
                </span>
              </div>

              <div className="bg-white p-3 rounded-lg border border-blue-200">
                <span className="text-[11px] text-slate-500 block">6. متوسط نصيب الفرد للمخبز الواحد</span>
                <span className="text-base font-mono font-black text-emerald-700 mt-1 block tabular-nums">
                  {Number(bakery.perCapitaAverage || 0).toFixed(2)} رغيف/فرد
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  الأرغفة ({bakery.loavesCount}) ÷ مستفيدي 2025 ({bakery.beneficiaries2025})
                </span>
              </div>

              <div className="bg-white p-3 rounded-lg border border-blue-200 sm:col-span-2">
                <span className="text-[11px] text-slate-500 block">
                  7. الفرق التراكمي لمتوسطات نصيب الفرد (متوسط 2023 - متوسط 2024 - متوسط 2025)
                </span>
                <span className="text-base font-mono font-black text-amber-700 mt-1 block tabular-nums">
                  {bakery.avgDiff}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {bakery.avg2023} - {bakery.avg2024} - {bakery.avg2025}
                </span>
              </div>
            </div>
          </div>

          {/* Section 4: Contact, Identity, Licenses & Debts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs text-xs space-y-2.5">
              <h4 className="font-extrabold text-[#0F2342] pb-2 border-b border-slate-100 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#1E40AF]" />
                <span>بيانات الاتصال والتراخيص والعقود</span>
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-500 block text-[11px]">{ct.phone}:</span>
                  <span className="font-mono font-bold text-slate-800">{bakery.phone || 'غير مسجل'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">{ct.nationalId}:</span>
                  <span className="font-mono font-bold text-slate-800">{bakery.nationalId || 'غير مسجل'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">{ct.commercialRegDate}:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {formatDateDDMMYYYY(bakery.commercialRegDate) || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">{ct.bakeryLicenseDate}:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {formatDateDDMMYYYY(bakery.bakeryLicenseDate) || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">{ct.leaseAgreementDate}:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {formatDateDDMMYYYY(bakery.leaseAgreementDate) || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">{ct.taxCardDate}:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {formatDateDDMMYYYY(bakery.taxCardDate) || '-'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs text-xs flex flex-col justify-between">
              <div>
                <h4 className="font-extrabold text-[#0F2342] pb-2 border-b border-slate-100 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-[#1E40AF]" />
                    <span>الموقف المالي والمديونيات المسجلة</span>
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">{bakeryDebts.length} قيد</span>
                </h4>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-slate-600 font-semibold">إجمالي المديونية المتبقية:</span>
                  <span
                    className={`text-base font-mono font-black tabular-nums ${
                      totalRemainingDebt > 0 ? 'text-red-600' : 'text-emerald-700'
                    }`}
                  >
                    {totalRemainingDebt.toLocaleString()} ج.م
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onJumpToDebts(bakery.id);
                  }}
                  className="px-3.5 py-2 bg-[#0F2342] hover:bg-[#1E3A8A] text-white rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  استعراض سجل مديونيات المخبز ←
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
