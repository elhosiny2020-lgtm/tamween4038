import React, { useState, useEffect } from 'react';
import { Bakery, VillageHierarchy } from '../types';
import {
  X,
  Calculator,
  Save,
  Store,
  MapPin,
  Calendar,
  AlertCircle,
  Hash,
  Phone,
  CreditCard,
  FileText
} from 'lucide-react';

interface BakeryModalProps {
  isOpen: boolean;
  onClose: () => void;
  bakeryToEdit?: Bakery | null;
  villages: VillageHierarchy[];
  activityStatuses?: string[];
  onSave: (bakery: Bakery) => void;
  onAddActivityStatus?: (status: string) => void;
  onAddLocalUnit?: (village: string, unit: string) => void;
}

export const BakeryModal: React.FC<BakeryModalProps> = ({
  isOpen,
  onClose,
  bakeryToEdit,
  villages,
  activityStatuses = ['شغال', 'متوقف جزئي', 'متوقف كلي', 'ملغى'],
  onSave,
  onAddActivityStatus,
  onAddLocalUnit,
}) => {
  // Inline quick adds
  const [showAddUnitInput, setShowAddUnitInput] = useState(false);
  const [newUnitInput, setNewUnitInput] = useState('');
  const [showAddStatusInput, setShowAddStatusInput] = useState(false);
  const [newStatusInput, setNewStatusInput] = useState('');
  // Form State
  const [ownerName, setOwnerName] = useState('');
  const [machineNumber, setMachineNumber] = useState('');
  const [selectedVillage, setSelectedVillage] = useState(villages[0]?.village || 'بشبيش');
  const [selectedUnit, setSelectedUnit] = useState(villages[0]?.localUnits[0] || 'بشبيش الرئيسية');

  // Quotas & Calculations
  const [insuranceQuota, setInsuranceQuota] = useState<number>(20);
  const [actualQuota, setActualQuota] = useState<number>(20);
  const [insuranceValue, setInsuranceValue] = useState<number>(15000);
  const [loavesCount, setLoavesCount] = useState<number>(20 * 1350);

  // Demographics & Averages
  const [villagePopulation, setVillagePopulation] = useState<number>(30000);
  const [perCapitaAverage, setPerCapitaAverage] = useState<string>('0.900');
  const [beneficiaries2023, setBeneficiaries2023] = useState<number>(27000);
  const [avg2023, setAvg2023] = useState<string>('1.000');
  const [beneficiaries2024, setBeneficiaries2024] = useState<number>(28500);
  const [avg2024, setAvg2024] = useState<string>('0.947');
  const [beneficiaries2025, setBeneficiaries2025] = useState<number>(29800);
  const [avg2025, setAvg2025] = useState<string>('0.906');
  const [avgDiff, setAvgDiff] = useState<string>('-0.094');

  // Classification & Operations
  const [activityStatus, setActivityStatus] = useState('شغال');
  const [breadType, setBreadType] = useState('بلدي مدعم ماو');
  const [breadTypeCount, setBreadTypeCount] = useState<number>(1);
  const [lineType, setLineType] = useState('نصف آلي');
  const [fuelType, setFuelType] = useState('غاز طبيعي');

  // Contact & ID
  const [phone, setPhone] = useState('');
  const [nationalId, setNationalId] = useState('');

  // Licenses Dates
  const [taxCardDate, setTaxCardDate] = useState('');
  const [commercialRegDate, setCommercialRegDate] = useState('');
  const [bakeryLicenseDate, setBakeryLicenseDate] = useState('');
  const [leaseAgreementDate, setLeaseAgreementDate] = useState('');

  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string>('');

  // Sync available local units when village changes
  const currentVillageUnits = villages.find((v) => v.village === selectedVillage)?.localUnits || [];

  // Effect to automatically persist draft on any field change
  useEffect(() => {
    if (!isOpen) return;

    const draftData = {
      ownerName,
      machineNumber,
      selectedVillage,
      selectedUnit,
      insuranceQuota,
      actualQuota,
      insuranceValue,
      loavesCount,
      villagePopulation,
      perCapitaAverage,
      beneficiaries2023,
      avg2023,
      beneficiaries2024,
      avg2024,
      beneficiaries2025,
      avg2025,
      avgDiff,
      activityStatus,
      breadType,
      breadTypeCount,
      lineType,
      fuelType,
      phone,
      nationalId,
      taxCardDate,
      commercialRegDate,
      bakeryLicenseDate,
      leaseAgreementDate,
      notes,
      updatedAt: Date.now(),
    };

    try {
      localStorage.setItem('TAMWEEN_BAKERY_DRAFT', JSON.stringify(draftData));
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
    ownerName,
    machineNumber,
    selectedVillage,
    selectedUnit,
    insuranceQuota,
    actualQuota,
    insuranceValue,
    loavesCount,
    villagePopulation,
    perCapitaAverage,
    beneficiaries2023,
    avg2023,
    beneficiaries2024,
    avg2024,
    beneficiaries2025,
    avg2025,
    avgDiff,
    activityStatus,
    breadType,
    breadTypeCount,
    lineType,
    fuelType,
    phone,
    nationalId,
    taxCardDate,
    commercialRegDate,
    bakeryLicenseDate,
    leaseAgreementDate,
    notes,
  ]);

  useEffect(() => {
    if (bakeryToEdit) {
      setOwnerName(bakeryToEdit.bakeryOwnerName);
      setMachineNumber(bakeryToEdit.machineNumber);
      setSelectedVillage(bakeryToEdit.village);
      setSelectedUnit(bakeryToEdit.localUnit);

      setInsuranceQuota(bakeryToEdit.insuranceQuota);
      setActualQuota(bakeryToEdit.actualQuota);
      setInsuranceValue(bakeryToEdit.insuranceValue);
      setLoavesCount(bakeryToEdit.loavesCount);

      setVillagePopulation(bakeryToEdit.villagePopulation);
      setPerCapitaAverage(bakeryToEdit.perCapitaAverage);
      setBeneficiaries2023(bakeryToEdit.beneficiaries2023);
      setAvg2023(bakeryToEdit.avg2023);
      setBeneficiaries2024(bakeryToEdit.beneficiaries2024);
      setAvg2024(bakeryToEdit.avg2024);
      setBeneficiaries2025(bakeryToEdit.beneficiaries2025);
      setAvg2025(bakeryToEdit.avg2025);
      setAvgDiff(bakeryToEdit.avgDiff);

      setActivityStatus(bakeryToEdit.activityStatus || 'شغال');
      setBreadType(bakeryToEdit.breadType || 'بلدي مدعم ماو');
      setBreadTypeCount(bakeryToEdit.breadTypeCount || 1);
      setLineType(bakeryToEdit.lineType || 'نصف آلي');
      setFuelType(bakeryToEdit.fuelType || 'غاز طبيعي');

      setPhone(bakeryToEdit.phone);
      setNationalId(bakeryToEdit.nationalId);

      setTaxCardDate(bakeryToEdit.taxCardDate || '');
      setCommercialRegDate(bakeryToEdit.commercialRegDate || '');
      setBakeryLicenseDate(bakeryToEdit.bakeryLicenseDate || '');
      setLeaseAgreementDate(bakeryToEdit.leaseAgreementDate || '');

      setNotes(bakeryToEdit.notes || '');
    } else {
      // Reset for new bakery
      setOwnerName('');
      setMachineNumber('');
      const defaultV = villages[0]?.village || 'بشبيش';
      setSelectedVillage(defaultV);
      const units = villages.find((v) => v.village === defaultV)?.localUnits || [];
      setSelectedUnit(units[0] || 'بشبيش الرئيسية');

      setInsuranceQuota(20);
      setActualQuota(20);
      setInsuranceValue(15000);
      const loaves = 20 * 1350;
      setLoavesCount(loaves);
      setVillagePopulation(30000);
      setPerCapitaAverage((loaves / 30000).toFixed(3));
      setBeneficiaries2023(27000);
      setAvg2023((loaves / 27000).toFixed(3));
      setBeneficiaries2024(28500);
      setAvg2024((loaves / 28500).toFixed(3));
      setBeneficiaries2025(29800);
      const a25 = loaves / 29800;
      setAvg2025(a25.toFixed(3));
      setAvgDiff((a25 - loaves / 27000).toFixed(3));

      setActivityStatus('شغال');
      setBreadType('بلدي مدعم ماو');
      setBreadTypeCount(1);
      setLineType('نصف آلي');
      setFuelType('غاز طبيعي');
      setPhone('');
      setNationalId('');

      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      const defaultDate = nextYear.toISOString().split('T')[0];
      setTaxCardDate(defaultDate);
      setCommercialRegDate(defaultDate);
      setBakeryLicenseDate(defaultDate);
      setLeaseAgreementDate(defaultDate);
      setNotes('');
    }
    setErrors({});
  }, [bakeryToEdit, isOpen, villages]);

  const handleVillageChange = (vName: string) => {
    setSelectedVillage(vName);
    const units = villages.find((v) => v.village === vName)?.localUnits || [];
    setSelectedUnit(units[0] || '');
  };

  // Dedicated Auto-Calculation Engine
  const calculateAllAverages = (customQuota?: number, customPop?: number, customB23?: number, customB24?: number, customB25?: number) => {
    const q = customQuota !== undefined ? customQuota : insuranceQuota;
    const pop = customPop !== undefined ? customPop : villagePopulation;
    const b23 = customB23 !== undefined ? customB23 : beneficiaries2023;
    const b24 = customB24 !== undefined ? customB24 : beneficiaries2024;
    const b25 = customB25 !== undefined ? customB25 : beneficiaries2025;

    const calculatedLoaves = Math.round(Number(q || 0) * 1350);
    setLoavesCount(calculatedLoaves);

    const calculatedPerCapita = pop > 0 ? (calculatedLoaves / pop).toFixed(3) : '0.000';
    setPerCapitaAverage(calculatedPerCapita);

    const cAvg23 = b23 > 0 ? (calculatedLoaves / b23).toFixed(3) : '0.000';
    setAvg2023(cAvg23);

    const cAvg24 = b24 > 0 ? (calculatedLoaves / b24).toFixed(3) : '0.000';
    setAvg2024(cAvg24);

    const cAvg25 = b25 > 0 ? (calculatedLoaves / b25).toFixed(3) : '0.000';
    setAvg2025(cAvg25);

    const diff = (parseFloat(cAvg25) - parseFloat(cAvg23)).toFixed(3);
    setAvgDiff(diff);
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!ownerName.trim()) {
      newErrors.ownerName = 'اسم صاحب المخبز مطلوب';
    }

    if (!machineNumber.trim()) {
      newErrors.machineNumber = 'رقم الماكينة مطلوب';
    }

    // Strict 11-digit phone check
    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (cleanPhone.length !== 11) {
      newErrors.phone = 'ضع رقم تليفون صحيح (يجب أن يتكون من 11 رقماً بالضبط)';
    }

    // Strict 14-digit National ID check
    const cleanNid = nationalId.trim().replace(/\D/g, '');
    if (cleanNid.length !== 14) {
      newErrors.nationalId = 'ضع رقم قومي صحيح (يجب أن يتكون من 14 رقماً بالضبط)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const bakery: Bakery = {
      id: bakeryToEdit ? bakeryToEdit.id : `b-${Date.now()}`,
      bakeryOwnerName: ownerName.trim(),
      machineNumber: machineNumber.trim(),
      village: selectedVillage,
      localUnit: selectedUnit,
      insuranceQuota: Number(insuranceQuota) || 0,
      actualQuota: Number(actualQuota) || 0,
      insuranceValue: Number(insuranceValue) || 0,
      loavesCount: Number(loavesCount) || 0,
      villagePopulation: Number(villagePopulation) || 0,
      perCapitaAverage: String(perCapitaAverage),
      beneficiaries2023: Number(beneficiaries2023) || 0,
      avg2023: String(avg2023),
      beneficiaries2024: Number(beneficiaries2024) || 0,
      avg2024: String(avg2024),
      beneficiaries2025: Number(beneficiaries2025) || 0,
      avg2025: String(avg2025),
      avgDiff: String(avgDiff),
      activityStatus,
      breadType,
      breadTypeCount: Number(breadTypeCount) || 1,
      lineType,
      fuelType,
      phone: phone.trim(),
      nationalId: nationalId.trim(),
      taxCardDate,
      commercialRegDate,
      bakeryLicenseDate,
      leaseAgreementDate,
      notes: notes.trim(),
    };

    onSave(bakery);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border-2 border-amber-600/40 w-full max-w-5xl my-4 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Top Header */}
        <div className="bg-gradient-to-r from-slate-900 via-amber-900 to-slate-900 p-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Store className="w-6 h-6 text-amber-300" />
            <div>
              <h3 className="text-base font-black">
                {bakeryToEdit ? 'تعديل بيانات المخبز التمويني' : 'تسجيل وإضافة مخبز تمويني جديد'}
              </h3>
              <p className="text-[11px] text-amber-100 font-bold flex items-center gap-1.5 mt-0.5">
                <span className="text-black font-black bg-amber-400 px-2 py-0.2 rounded text-[10px]">
                  إدارة تموين مركز المحلة الكبرى
                </span>
                <span>- قاعدة بيانات المخابز والمديونيات</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Auto-Save Indicator */}
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

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-5 flex-1">
          {/* Quick Recalculate Toolbar */}
          <div className="bg-amber-50 border-2 border-amber-200 p-3 rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-amber-900">
              <Calculator className="w-5 h-5 text-amber-700" />
              <span className="text-xs font-black">
                المعيار التمويني المعتمد: الحصة التأمينية × 1350 رغيفاً للشيكارة الواحدة
              </span>
            </div>
            <button
              type="button"
              onClick={() => calculateAllAverages()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-black shadow-sm transition cursor-pointer"
            >
              <Calculator className="w-3.5 h-3.5" />
              إعادة الحساب التلقائي لكافة الحصص والمتوسطات
            </button>
          </div>

          {/* Section 1: Basic Info & Village */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <h4 className="text-xs font-black text-slate-800 pb-2 mb-3 border-b border-slate-200 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-amber-600" />
              1. البيانات الأساسية وموقع المخبز
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
              <div className="md:col-span-2">
                <label className="block text-xs font-black text-slate-700 mb-1">
                  اسم صاحب المخبز *
                </label>
                <input
                  type="text"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="الاسم الرباعي لصاحب المخبز"
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 text-right ${
                    errors.ownerName ? 'border-red-500' : 'border-slate-300'
                  }`}
                />
                {errors.ownerName && (
                  <p className="text-[10px] text-red-600 font-bold mt-0.5">{errors.ownerName}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  رقم الماكينة (POS) *
                </label>
                <input
                  type="text"
                  required
                  value={machineNumber}
                  onChange={(e) => setMachineNumber(e.target.value)}
                  placeholder="رقم ماكينة الصرف"
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 num-enlarged text-right ${
                    errors.machineNumber ? 'border-red-500' : 'border-slate-300'
                  }`}
                />
                {errors.machineNumber && (
                  <p className="text-[10px] text-red-600 font-bold mt-0.5">{errors.machineNumber}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">القرية</label>
                <select
                  value={selectedVillage}
                  onChange={(e) => handleVillageChange(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500"
                >
                  {villages.map((v) => (
                    <option key={v.village} value={v.village}>
                      {v.village}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-black text-slate-700">
                    الوحدة المحلية التابعة للقرية
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddUnitInput(!showAddUnitInput)}
                    className="text-[10px] text-amber-700 hover:text-amber-900 font-black bg-amber-50 px-2 py-0.5 rounded border border-amber-200"
                  >
                    {showAddUnitInput ? 'إلغاء' : '+ وحدة جديدة للقرية'}
                  </button>
                </div>

                {showAddUnitInput && (
                  <div className="flex items-center gap-1.5 mb-2 animate-in fade-in">
                    <input
                      type="text"
                      value={newUnitInput}
                      onChange={(e) => setNewUnitInput(e.target.value)}
                      placeholder={`اسم الوحدة التابعة لـ ${selectedVillage}`}
                      className="flex-1 px-2.5 py-1 bg-white border border-amber-400 rounded-lg text-xs font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = newUnitInput.trim();
                        if (!val) return;
                        if (onAddLocalUnit) {
                          onAddLocalUnit(selectedVillage, val);
                        }
                        setSelectedUnit(val);
                        setNewUnitInput('');
                        setShowAddUnitInput(false);
                      }}
                      className="px-2.5 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-black"
                    >
                      حفظ واختيار
                    </button>
                  </div>
                )}

                <select
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500"
                >
                  {currentVillageUnits.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                  {selectedUnit && !currentVillageUnits.includes(selectedUnit) && (
                    <option value={selectedUnit}>{selectedUnit}</option>
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Classification and Operations */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <h4 className="text-xs font-black text-slate-800 pb-2 mb-3 border-b border-slate-200 flex items-center gap-1.5">
              <Store className="w-4 h-4 text-amber-600" />
              2. التصنيف والتشغيل
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-black text-slate-700">نشاط المخبز</label>
                  <button
                    type="button"
                    onClick={() => setShowAddStatusInput(!showAddStatusInput)}
                    className="text-[10px] text-emerald-700 hover:text-emerald-900 font-black bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200"
                    title="إضافة حالة نشاط جديدة"
                  >
                    {showAddStatusInput ? 'إلغاء' : '+ جديد'}
                  </button>
                </div>

                {showAddStatusInput && (
                  <div className="flex items-center gap-1 mb-1.5 animate-in fade-in">
                    <input
                      type="text"
                      value={newStatusInput}
                      onChange={(e) => setNewStatusInput(e.target.value)}
                      placeholder="حالة النشاط"
                      className="w-full px-2 py-0.5 bg-white border border-emerald-400 rounded text-[11px] font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = newStatusInput.trim();
                        if (!val) return;
                        if (onAddActivityStatus) {
                          onAddActivityStatus(val);
                        }
                        setActivityStatus(val);
                        setNewStatusInput('');
                        setShowAddStatusInput(false);
                      }}
                      className="px-2 py-0.5 bg-emerald-700 text-white rounded text-[11px] font-black"
                    >
                      حفظ
                    </button>
                  </div>
                )}

                <select
                  value={activityStatus}
                  onChange={(e) => setActivityStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500"
                >
                  {activityStatuses.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                  {activityStatus && !activityStatuses.includes(activityStatus) && (
                    <option value={activityStatus}>{activityStatus}</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">نوع الخبز</label>
                <select
                  value={breadType}
                  onChange={(e) => setBreadType(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500"
                >
                  <option value="بلدي مدعم ماو">بلدي مدعم ماو</option>
                  <option value="بلدي مجر">بلدي مجر</option>
                  <option value="خبز آلي">خبز آلي</option>
                  <option value="طباقي">طباقي</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">عدد نوع الخبز</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={breadTypeCount}
                  onChange={(e) => setBreadTypeCount(Number(e.target.value) || 1)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 num-enlarged text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">نوع خط الإنتاج</label>
                <select
                  value={lineType}
                  onChange={(e) => setLineType(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500"
                >
                  <option value="نصف آلي">نصف آلي</option>
                  <option value="آلي كامل">آلي كامل</option>
                  <option value="يدوي">يدوي</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">نوع الوقود</label>
                <select
                  value={fuelType}
                  onChange={(e) => setFuelType(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500"
                >
                  <option value="غاز طبيعي">غاز طبيعي</option>
                  <option value="سولار">سولار</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Contact and Identity */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <h4 className="text-xs font-black text-slate-800 pb-2 mb-3 border-b border-slate-200 flex items-center gap-1.5">
              <Phone className="w-4 h-4 text-amber-600" />
              3. بيانات الاتصال والهوية (تدقيق صارم 11 و 14 رقماً)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1 flex items-center justify-between">
                  <span>رقم التليفون المحمول (11 رقماً) *</span>
                  <span className="text-[11px] text-slate-500 font-bold">
                    العدد الحالي: {phone.replace(/\D/g, '').length} / 11
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    maxLength={11}
                    value={phone}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setPhone(val);
                      if (val.length === 11) {
                        setErrors((prev) => ({ ...prev, phone: '' }));
                      }
                    }}
                    placeholder="01012345678"
                    className={`w-full px-3 py-2 bg-white border rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 num-enlarged text-left tracking-wider ${
                      errors.phone ? 'border-red-500 bg-red-50/50' : 'border-slate-300'
                    }`}
                  />
                </div>
                {errors.phone && (
                  <p className="text-[11px] text-red-600 font-black mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {errors.phone}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1 flex items-center justify-between">
                  <span>الرقم القومي لصاحب المخبز (14 رقماً) *</span>
                  <span className="text-[11px] text-slate-500 font-bold">
                    العدد الحالي: {nationalId.replace(/\D/g, '').length} / 14
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    maxLength={14}
                    value={nationalId}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setNationalId(val);
                      if (val.length === 14) {
                        setErrors((prev) => ({ ...prev, nationalId: '' }));
                      }
                    }}
                    placeholder="29010101600123"
                    className={`w-full px-3 py-2 bg-white border rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 num-enlarged text-left tracking-wider ${
                      errors.nationalId ? 'border-red-500 bg-red-50/50' : 'border-slate-300'
                    }`}
                  />
                </div>
                {errors.nationalId && (
                  <p className="text-[11px] text-red-600 font-black mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {errors.nationalId}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Section 4: Quotas and Loaves */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <h4 className="text-xs font-black text-slate-800 pb-2 mb-3 border-b border-slate-200 flex items-center gap-1.5">
              <Hash className="w-4 h-4 text-amber-600" />
              4. الحصص والبيانات التموينية والتأمينية
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  الحصة التأمينية (بالشيكارة)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={insuranceQuota}
                  onChange={(e) => {
                    const q = parseFloat(e.target.value) || 0;
                    setInsuranceQuota(q);
                    calculateAllAverages(q);
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 num-enlarged text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  الحصة الفعلية (بالشيكارة)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={actualQuota}
                  onChange={(e) => setActualQuota(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 num-enlarged text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  القيمة التأمينية (بالجنيه)
                </label>
                <input
                  type="number"
                  value={insuranceValue}
                  onChange={(e) => setInsuranceValue(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 num-enlarged text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  عدد الأرغفة اليومية (الحصة × 1350)
                </label>
                <input
                  type="number"
                  value={loavesCount}
                  onChange={(e) => setLoavesCount(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-amber-50 border-2 border-amber-400 rounded-lg text-xs font-black text-amber-950 focus:ring-2 focus:ring-amber-500 num-enlarged text-center"
                />
              </div>
            </div>
          </div>

          {/* Section 5: Demographics & Yearly Averages */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <h4 className="text-xs font-black text-slate-800 pb-2 mb-3 border-b border-slate-200 flex items-center gap-1.5">
              <Calculator className="w-4 h-4 text-amber-600" />
              5. إحصائيات السكان والمستفيدين والمتوسطات (2023 - 2025)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  عدد سكان القرية
                </label>
                <input
                  type="number"
                  value={villagePopulation}
                  onChange={(e) => {
                    const pop = parseInt(e.target.value) || 0;
                    setVillagePopulation(pop);
                    calculateAllAverages(insuranceQuota, pop);
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 num-enlarged text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  متوسط الفرد للمخبز (الأرغفة ÷ السكان)
                </label>
                <input
                  type="text"
                  value={perCapitaAverage}
                  onChange={(e) => setPerCapitaAverage(e.target.value)}
                  className="w-full px-3 py-2 bg-amber-50 border border-amber-300 rounded-lg text-xs font-black text-amber-950 num-enlarged text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">مستفيدي 2023</label>
                <input
                  type="number"
                  value={beneficiaries2023}
                  onChange={(e) => {
                    const b = parseInt(e.target.value) || 0;
                    setBeneficiaries2023(b);
                    calculateAllAverages(insuranceQuota, villagePopulation, b);
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 num-enlarged text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  متوسط 2023 (الأرغفة ÷ مستفيدي 23)
                </label>
                <input
                  type="text"
                  value={avg2023}
                  onChange={(e) => setAvg2023(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 num-enlarged text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">مستفيدي 2024</label>
                <input
                  type="number"
                  value={beneficiaries2024}
                  onChange={(e) => {
                    const b = parseInt(e.target.value) || 0;
                    setBeneficiaries2024(b);
                    calculateAllAverages(insuranceQuota, villagePopulation, beneficiaries2023, b);
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 num-enlarged text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  متوسط 2024 (الأرغفة ÷ مستفيدي 24)
                </label>
                <input
                  type="text"
                  value={avg2024}
                  onChange={(e) => setAvg2024(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 num-enlarged text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">مستفيدي 2025</label>
                <input
                  type="number"
                  value={beneficiaries2025}
                  onChange={(e) => {
                    const b = parseInt(e.target.value) || 0;
                    setBeneficiaries2025(b);
                    calculateAllAverages(insuranceQuota, villagePopulation, beneficiaries2023, beneficiaries2024, b);
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 num-enlarged text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  متوسط 2025 (الأرغفة ÷ مستفيدي 25)
                </label>
                <input
                  type="text"
                  value={avg2025}
                  onChange={(e) => setAvg2025(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 num-enlarged text-center"
                />
              </div>

              <div className="md:col-span-4 bg-amber-100/60 p-3 rounded-lg flex items-center justify-between border border-amber-200">
                <span className="text-xs font-black text-amber-950">
                  الفرق التراكمي بين متوسط 2025 ومتوسط 2023:
                </span>
                <input
                  type="text"
                  value={avgDiff}
                  onChange={(e) => setAvgDiff(e.target.value)}
                  className="px-3 py-1 bg-white border-2 border-amber-500 rounded-lg text-xs font-black text-amber-900 num-enlarged text-center w-36"
                />
              </div>
            </div>
          </div>

          {/* Section 6: Licenses, Contracts, Expiration Dates */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <h4 className="text-xs font-black text-slate-800 pb-2 mb-3 border-b border-slate-200 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-amber-600" />
              6. التراخيص والعقود وتواريخ السريان (محرك التنبيه التلقائي قبل 15 يوماً)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  تاريخ السجل التجاري
                </label>
                <input
                  type="date"
                  value={commercialRegDate}
                  onChange={(e) => setCommercialRegDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 num-enlarged"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  تاريخ رخصة المخبز
                </label>
                <input
                  type="date"
                  value={bakeryLicenseDate}
                  onChange={(e) => setBakeryLicenseDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 num-enlarged"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  تاريخ عقد الإيجار
                </label>
                <input
                  type="date"
                  value={leaseAgreementDate}
                  onChange={(e) => setLeaseAgreementDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 num-enlarged"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  تاريخ البطاقة الضريبية
                </label>
                <input
                  type="date"
                  value={taxCardDate}
                  onChange={(e) => setTaxCardDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 num-enlarged"
                />
              </div>
            </div>
          </div>

          {/* Section 7: Notes */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-1">
              ملاحظات إضافية وقيد التفتيش
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي ملاحظات حول المخبز أو التراخيص أو محاضر الضبط"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 text-right"
            />
          </div>

          {/* Footer Actions */}
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
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-700 to-amber-900 hover:from-amber-800 hover:to-amber-950 text-white rounded-lg text-xs font-black shadow-lg shadow-amber-800/30 transition cursor-pointer"
            >
              <Save className="w-4 h-4 text-amber-200" />
              {bakeryToEdit ? 'حفظ وتحديث بيانات المخبز' : 'تسجيل المخبز الجديد'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
