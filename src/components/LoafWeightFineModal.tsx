import React, { useMemo, useState } from 'react';
import {
  Calculator,
  X,
  Save,
  Printer,
  Settings,
  AlertTriangle,
  CheckCircle2,
  Scale,
} from 'lucide-react';
import type { Bakery, DebtRecord, LoafWeightSettings, AppUser } from '../types';
import {
  calculateLoafWeightShortageFine,
  DEFAULT_LOAF_WEIGHT_SETTINGS,
} from '../utils/loafWeightFinesMath';
import { printModuleReportA4 } from '../services/modulesStorage';

interface LoafWeightFineModalProps {
  isOpen: boolean;
  onClose: () => void;
  bakeries: Bakery[];
  existingDebts: DebtRecord[];
  issuingEntities: string[];
  currentUser?: AppUser | null;
  branchName: string;
  settings?: LoafWeightSettings;
  onUpdateSettings?: (next: LoafWeightSettings) => void;
  onSaveFineDebt: (debt: DebtRecord) => Promise<void> | void;
}

export const LoafWeightFineModal: React.FC<LoafWeightFineModalProps> = ({
  isOpen,
  onClose,
  bakeries,
  existingDebts,
  issuingEntities,
  currentUser,
  branchName,
  settings,
  onUpdateSettings,
  onSaveFineDebt,
}) => {
  const activeSettings = settings || DEFAULT_LOAF_WEIGHT_SETTINGS;
  const [selectedBakeryId, setSelectedBakeryId] = useState<string>(bakeries[0]?.id || '');
  const [reportNumber, setReportNumber] = useState<string>('');
  const [violationDate, setViolationDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [issuingEntity, setIssuingEntity] = useState<string>(
    issuingEntities[0] || 'إدارة الرقابة التموينية'
  );
  const [prescribedWeightGrams, setPrescribedWeightGrams] = useState<number>(
    activeSettings.defaultPrescribedWeightGrams || 90
  );
  const [actualWeightGrams, setActualWeightGrams] = useState<number>(81);
  const [repeatFactor, setRepeatFactor] = useState<number>(1);
  const [closureDays, setClosureDays] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [showSettingsEditor, setShowSettingsEditor] = useState<boolean>(false);
  const [editableSettings, setEditableSettings] = useState<LoafWeightSettings>(activeSettings);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const selectedBakery = useMemo(
    () => bakeries.find((b) => b.id === selectedBakeryId) || bakeries[0] || null,
    [bakeries, selectedBakeryId]
  );

  const [overrideBagPrice, setOverrideBagPrice] = useState<number | null>(null);
  const [overrideQuota, setOverrideQuota] = useState<number | null>(null);

  const bagPriceAtViolation =
    overrideBagPrice !== null ? overrideBagPrice : Number(selectedBakery?.flourBagPrice || 235);
  const insuranceQuotaAtViolation =
    overrideQuota !== null ? overrideQuota : Number(selectedBakery?.insuranceQuota || 10);

  const calcResult = useMemo(
    () =>
      calculateLoafWeightShortageFine({
        prescribedWeightGrams,
        actualWeightGrams,
        bagPriceAtViolation,
        insuranceQuotaAtViolation,
        repeatFactor,
        breadType: selectedBakery?.breadType || 'بلدي مدعم',
        reportNumber,
        closureDays,
        calculatedBy: currentUser?.fullName || 'النظام',
        settings: editableSettings,
      }),
    [
      prescribedWeightGrams,
      actualWeightGrams,
      bagPriceAtViolation,
      insuranceQuotaAtViolation,
      repeatFactor,
      selectedBakery?.breadType,
      reportNumber,
      closureDays,
      currentUser?.fullName,
      editableSettings,
    ]
  );

  if (!isOpen) return null;

  const isDuplicateReport =
    reportNumber.trim().length > 0 &&
    existingDebts.some(
      (d) =>
        d.weightFineDetails?.reportNumber &&
        d.weightFineDetails.reportNumber.trim() === reportNumber.trim()
    );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!selectedBakery) {
      setErrorMsg('يرجى اختيار المخبز أولاً.');
      return;
    }
    if (isDuplicateReport) {
      setErrorMsg(`رقم المحضر (${reportNumber}) مسجل مسبقاً — يرجى منع التكرار.`);
      return;
    }
    if (!calcResult.valid || !calcResult.isViolation || !calcResult.record) {
      setErrorMsg(calcResult.error || 'تعذر احتساب الغرامة بالمعطيات الحالية.');
      return;
    }

    const finalFine = calcResult.record.finalFineAmount;
    const paid = Math.min(finalFine, Math.max(0, Number(paidAmount) || 0));
    const remaining = Math.max(0, Math.round((finalFine - paid) * 100) / 100);

    const newDebt: DebtRecord = {
      id: `debt-lw-${Date.now()}`,
      bakeryId: selectedBakery.id,
      bakeryOwnerName: selectedBakery.bakeryOwnerName,
      machineNumber: selectedBakery.machineNumber,
      village: selectedBakery.village,
      localUnit: selectedBakery.localUnit,
      violationDate,
      issuingEntity,
      violationType: 'نقص وزن الرغيف',
      violationAmount: finalFine,
      oldViolations: 0,
      totalViolations: finalFine,
      violationPaymentDate: paid > 0 ? violationDate : '',
      violationReceiptNumber: reportNumber.trim() ? `محضر ${reportNumber.trim()}` : '',
      violationPaymentMethod: paid > 0 ? 'نقدي' : '-',
      paidViolationAmount: paid,
      remainingViolations: remaining,
      addedAmount: 0,
      addedPaymentDate: '',
      addedReceiptNumber: '',
      addedPaymentMethod: '-',
      paidAddedAmount: 0,
      remainingAdded: 0,
      disposalDate: '',
      disposalBags: 0,
      disposalBagPrice: bagPriceAtViolation,
      disposalMultiplier: calcResult.record.tierMultiplier,
      disposalValue: 0,
      disposalPaymentDate: '',
      disposalReceiptNumber: '',
      disposalPaymentMethod: '-',
      paidDisposalAmount: 0,
      remainingDisposal: 0,
      netRemainingDebt: remaining,
      notes:
        notes.trim() ||
        `غرامة نقص وزن (${calcResult.record.shortageGrams} جم · ${calcResult.record.tierLabel}) — ${editableSettings.decisionReference}`,
      weightFineDetails: calcResult.record,
    };

    setIsSaving(true);
    try {
      await onSaveFineDebt(newDebt);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء حفظ غرامة نقص الوزن.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrintMinutes = () => {
    if (!selectedBakery || !calcResult.record) return;
    const r = calcResult.record;
    printModuleReportA4({
      title: 'محضر احتساب غرامة نقص وزن الرغيف',
      subtitle: `${r.decisionReference || ''}`,
      branchName,
      headers: ['البند الحسابي', 'القيمة المعتمدة'],
      rows: [
        ['المخبز', selectedBakery.bakeryOwnerName],
        ['رقم الماكينة / القرية', `${selectedBakery.machineNumber} / ${selectedBakery.village}`],
        ['رقم المحضر وتاريخه', `${reportNumber || '—'} بتاريخ ${violationDate}`],
        ['الوزن المقرر للرغيف', `${r.prescribedWeightGrams} جم`],
        ['الوزن الفعلي المضبوط', `${r.actualWeightGrams} جم`],
        ['مقدار النقص بالجرام', `${r.shortageGrams} جم`],
        ['شريحة المخالفة والمعامل', `${r.tierLabel} (${r.tierMultiplier}x)`],
        ['سعر الشيكارة وقت المخالفة', `${r.bagPriceAtViolation.toLocaleString()} ج.م`],
        ['الحصة التأمينية وقت المخالفة', `${r.insuranceQuotaAtViolation} شيكارة`],
        ['الغرامة الأساسية', `${r.baseFineAmount.toLocaleString()} ج.م`],
        ['الغرامة النهائية المستحقة', `${r.finalFineAmount.toLocaleString()} ج.م`],
      ],
      preparedBy: currentUser?.fullName || 'المختص',
    });
  };

  return (
    <div
      data-testid="loaf-weight-fine-modal"
      className="fixed inset-0 z-[120] bg-black/75 flex items-center justify-center p-3 overflow-y-auto"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl shadow-2xl border-2 border-[#D4AF37]/50 w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-l from-[#0A1628] via-[#142A4E] to-[#0D9488] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#D4AF37] text-[#0A1628] rounded-xl">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black">
                حاسبة وتسجيل غرامة نقص وزن الرغيف (المرتبطة بسجل المديونيات)
              </h3>
              <p className="text-[11px] text-[#5EEAD4] font-bold">
                {editableSettings.decisionReference}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSettingsEditor((p) => !p)}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black flex items-center gap-1.5 cursor-pointer border border-white/20"
            >
              <Settings className="w-4 h-4 text-[#D4AF37]" />
              <span>إعدادات الشرائح والأوزان</span>
            </button>
            <button
              type="button"
              data-testid="lw-close-btn"
              onClick={onClose}
              aria-label="إغلاق نافذة حاسبة غرامة نقص الوزن"
              className="p-1.5 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSave} className="p-5 overflow-y-auto space-y-4 flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-300 text-rose-800 rounded-xl text-xs font-black flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isDuplicateReport && (
            <div className="p-3 bg-amber-50 border border-amber-400 text-amber-950 rounded-xl text-xs font-black flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
              <span>تنبيه: رقم المحضر ({reportNumber}) مسجل مسبقاً في سجل المديونيات!</span>
            </div>
          )}

          {/* Optional Dynamic Settings Panel */}
          {showSettingsEditor && (
            <div className="p-3.5 bg-amber-50/70 border border-amber-300 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-amber-950">
                  تعديل حدود شرائح نقص الوزن والمعاملات والوزن الافتراضي (قابلة للتعديل من الإدارة)
                </span>
                {onUpdateSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateSettings(editableSettings);
                      setShowSettingsEditor(false);
                    }}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-black cursor-pointer"
                  >
                    حفظ كإعدادات افتراضية
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الوزن المقرر الافتراضي (جم)</label>
                  <input
                    type="number"
                    value={editableSettings.defaultPrescribedWeightGrams}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 90;
                      setEditableSettings((s) => ({ ...s, defaultPrescribedWeightGrams: v }));
                      setPrescribedWeightGrams(v);
                    }}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">معامل أقل من {editableSettings.tier1MaxExclusive} جم</label>
                  <input
                    type="number"
                    step="0.5"
                    value={editableSettings.tier1Multiplier}
                    onChange={(e) =>
                      setEditableSettings((s) => ({ ...s, tier1Multiplier: Number(e.target.value) || 1 }))
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">معامل 10 - &lt;20 جم</label>
                  <input
                    type="number"
                    step="0.5"
                    value={editableSettings.tier2Multiplier}
                    onChange={(e) =>
                      setEditableSettings((s) => ({ ...s, tier2Multiplier: Number(e.target.value) || 2 }))
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">معامل 30 جم فأكثر</label>
                  <input
                    type="number"
                    step="0.5"
                    value={editableSettings.tier4Multiplier}
                    onChange={(e) =>
                      setEditableSettings((s) => ({ ...s, tier4Multiplier: Number(e.target.value) || 4 }))
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Bakery & Violation Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="sm:col-span-2">
              <label className="block font-black text-slate-800 mb-1">اختر المخبز *</label>
              <select
                value={selectedBakery?.id || ''}
                onChange={(e) => {
                  setSelectedBakeryId(e.target.value);
                  setOverrideBagPrice(null);
                  setOverrideQuota(null);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900"
              >
                {bakeries.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bakeryOwnerName} — ماكينة {b.machineNumber} ({b.village}) • الحصة: {b.insuranceQuota} • الشيكارة: {b.flourBagPrice} ج.م
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-black text-slate-800 mb-1">رقم المحضر</label>
              <input
                type="text"
                data-testid="lw-report-number"
                value={reportNumber}
                onChange={(e) => setReportNumber(e.target.value)}
                placeholder="مثال: 2026/154"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono font-bold"
              />
            </div>

            <div>
              <label className="block font-black text-slate-800 mb-1">تاريخ المخالفة</label>
              <input
                type="date"
                value={violationDate}
                onChange={(e) => setViolationDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono font-bold"
              />
            </div>

            <div>
              <label className="block font-black text-slate-800 mb-1">الجهة المحررة</label>
              <select
                value={issuingEntity}
                onChange={(e) => setIssuingEntity(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold"
              >
                {issuingEntities.map((ent) => (
                  <option key={ent} value={ent}>
                    {ent}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-black text-slate-800 mb-1">معامل التكرار (اختياري)</label>
              <input
                type="number"
                min={1}
                step={1}
                value={repeatFactor}
                onChange={(e) => setRepeatFactor(Math.max(1, Number(e.target.value) || 1))}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono font-bold"
              />
            </div>
          </div>

          {/* Calculation Inputs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <div>
              <label className="block font-black text-slate-800 mb-1">الوزن المقرر (جم)</label>
              <input
                type="number"
                step="0.5"
                data-testid="lw-prescribed-weight"
                value={prescribedWeightGrams}
                onChange={(e) => setPrescribedWeightGrams(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono font-black text-[#0F2342]"
              />
            </div>

            <div>
              <label className="block font-black text-slate-800 mb-1">الوزن الفعلي المضبوط (جم)</label>
              <input
                type="number"
                step="0.5"
                data-testid="lw-actual-weight"
                value={actualWeightGrams}
                onChange={(e) => setActualWeightGrams(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-white border-2 border-[#0D9488] rounded-xl font-mono font-black text-[#0D9488]"
              />
            </div>

            <div>
              <label className="block font-black text-slate-800 mb-1">سعر الشيكارة وقت المخالفة</label>
              <input
                type="number"
                step="0.5"
                data-testid="lw-bag-price"
                value={bagPriceAtViolation}
                onChange={(e) => setOverrideBagPrice(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono font-black"
              />
            </div>

            <div>
              <label className="block font-black text-slate-800 mb-1">الحصة التأمينية وقت المخالفة</label>
              <input
                type="number"
                step="0.5"
                data-testid="lw-quota"
                value={insuranceQuotaAtViolation}
                onChange={(e) => setOverrideQuota(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono font-black"
              />
            </div>
          </div>

          {/* Live Calculation Breakdown */}
          {calcResult.isViolation && calcResult.record ? (
            <div className="p-4 rounded-2xl bg-gradient-to-l from-[#0A1628] to-[#0F294A] text-white border border-[#D4AF37]/60 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 pb-2">
                <span className="text-xs font-black text-[#D4AF37] flex items-center gap-1.5">
                  <Calculator className="w-4 h-4" />
                  <span>نتيجة احتساب غرامة نقص الوزن (تُحفظ بالقيم التاريخية عند التسجيل)</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-[#0D9488] text-white">
                  {calcResult.record.tierLabel} • معامل {calcResult.record.tierMultiplier}x
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                <div className="bg-white/10 rounded-xl p-2.5">
                  <div className="text-slate-300 font-bold">مقدار النقص</div>
                  <div className="text-lg font-black font-mono text-amber-300">
                    {calcResult.record.shortageGrams} جم
                  </div>
                </div>
                <div className="bg-white/10 rounded-xl p-2.5">
                  <div className="text-slate-300 font-bold">الغرامة الأساسية</div>
                  <div className="text-lg font-black font-mono text-[#5EEAD4]">
                    {calcResult.record.baseFineAmount.toLocaleString()} ج.م
                  </div>
                </div>
                <div className="bg-white/10 rounded-xl p-2.5">
                  <div className="text-slate-300 font-bold">معامل الشريحة × التكرار</div>
                  <div className="text-lg font-black font-mono text-white">
                    {calcResult.record.tierMultiplier} × {calcResult.record.repeatFactor || 1}
                  </div>
                </div>
                <div className="bg-[#D4AF37] text-[#0A1628] rounded-xl p-2.5">
                  <div className="font-black text-[11px]">الغرامة النهائية المستحقة</div>
                  <div className="text-xl font-black font-mono">
                    {calcResult.record.finalFineAmount.toLocaleString()} ج.م
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-black flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{calcResult.error || 'لا توجد مخالفة نقص وزن.'}</span>
            </div>
          )}

          {/* Optional immediate payment & administrative closure days */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">المسدد مبدئياً (ج.م)</label>
              <input
                type="number"
                min={0}
                value={paidAmount}
                onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono font-bold"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">أيام الغلق الإداري (حقل مستقل)</label>
              <input
                type="number"
                min={0}
                value={closureDays}
                onChange={(e) => setClosureDays(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono font-bold"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">ملاحظات إضافية</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات المحضر..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              disabled={!calcResult.isViolation}
              onClick={handlePrintMinutes}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-[#0A1628] border border-slate-300 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة محضر احتساب الغرامة (A4)</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                data-testid="lw-submit-btn"
                disabled={isSaving || !calcResult.isViolation || isDuplicateReport}
                className="px-5 py-2 bg-gradient-to-l from-[#0D9488] to-[#0A1628] hover:opacity-95 disabled:opacity-50 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                <Save className="w-4 h-4 text-[#D4AF37]" />
                <span>{isSaving ? 'جاري الترحيل...' : 'اعتماد وترحيل الغرامة لسجل المديونيات'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
