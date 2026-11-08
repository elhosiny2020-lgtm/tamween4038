import React, { useState, useEffect } from 'react';
import { SystemConfig } from '../types';
import { DEFAULT_SYSTEM_CONFIG, DEFAULT_OFFICIAL_LOGO } from '../defaultData';
import { Settings, Upload, RotateCcw, Check, X, Shield } from 'lucide-react';

interface HeaderCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SystemConfig;
  onSaveConfig: (newConfig: SystemConfig) => void;
}

export const HeaderCustomizerModal: React.FC<HeaderCustomizerModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
}) => {
  const [governorate, setGovernorate] = useState(config.governorateTitle);
  const [directorate, setDirectorate] = useState(config.directorateTitle);
  const [administration, setAdministration] = useState(config.administrationTitle);
  const [englishSubtitle, setEnglishSubtitle] = useState(config.englishSubtitle);
  const [logoPreview, setLogoPreview] = useState(config.logoBase64);
  const [msg, setMsg] = useState('');

  // Escape key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('يرجى اختيار ملف صورة صالح (PNG, JPG, SVG, WebP)');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoPreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetLogo = () => {
    setLogoPreview(DEFAULT_OFFICIAL_LOGO);
  };

  const handleResetAll = () => {
    setGovernorate(DEFAULT_SYSTEM_CONFIG.governorateTitle);
    setDirectorate(DEFAULT_SYSTEM_CONFIG.directorateTitle);
    setAdministration(DEFAULT_SYSTEM_CONFIG.administrationTitle);
    setEnglishSubtitle(DEFAULT_SYSTEM_CONFIG.englishSubtitle);
    setLogoPreview(DEFAULT_OFFICIAL_LOGO);
    setMsg('تمت استعادة الإعدادات والشعار الافتراضي بنجاح');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: SystemConfig = {
      governorateTitle: governorate.trim() || DEFAULT_SYSTEM_CONFIG.governorateTitle,
      directorateTitle: directorate.trim() || DEFAULT_SYSTEM_CONFIG.directorateTitle,
      administrationTitle: administration.trim() || DEFAULT_SYSTEM_CONFIG.administrationTitle,
      englishSubtitle: englishSubtitle.trim() || DEFAULT_SYSTEM_CONFIG.englishSubtitle,
      logoBase64: logoPreview || DEFAULT_OFFICIAL_LOGO,
    };
    onSaveConfig(updated);
    setMsg('تم حفظ وتطبيق الهوية الحكومية بنجاح!');
    setTimeout(() => {
      setMsg('');
      onClose();
    }, 400);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm cursor-pointer"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border-2 border-amber-600/40 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 cursor-default">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-amber-900 to-slate-900 p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-300" />
            <h3 className="text-base font-black">تخصيص الهوية الرسمية والترويسة الحكومية</h3>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="p-1.5 rounded-xl bg-red-900/60 hover:bg-red-600 text-white transition cursor-pointer border border-red-500/50 hover:scale-105 active:scale-95 shadow-md"
            title="إغلاق النافذة (Escape)"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          {msg && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-lg text-xs font-black flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>{msg}</span>
            </div>
          )}

          {/* Logo Section */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-xl bg-white border-2 border-amber-400 p-1 flex items-center justify-center shadow-inner">
                <img
                  src={logoPreview}
                  alt="شعار الترويسة"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900">شعار الجمهورية والوزارة</h4>
                <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                  يظهر في الترويسة العلوية، شاشة الدخول، وكشوف الطباعة الرسمية
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-black shadow-sm transition">
                    <Upload className="w-3.5 h-3.5" />
                    رفع شعار مخصص
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleResetLogo}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition"
                  >
                    <RotateCcw className="w-3 h-3" />
                    استعادة الشعار الأصلي
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Titles Inputs */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-1">
              اسم المحافظة
            </label>
            <input
              type="text"
              required
              value={governorate}
              onChange={(e) => setGovernorate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 text-right"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-slate-700 mb-1">
              اسم المديرية
            </label>
            <input
              type="text"
              required
              value={directorate}
              onChange={(e) => setDirectorate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 text-right"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-slate-700 mb-1">
              اسم الإدارة التموينية
            </label>
            <input
              type="text"
              required
              value={administration}
              onChange={(e) => setAdministration(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500 text-right"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-slate-700 mb-1">
              النص الإنجليزي المعتمد
            </label>
            <input
              type="text"
              required
              value={englishSubtitle}
              onChange={(e) => setEnglishSubtitle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 text-left font-mono"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={handleResetAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-black transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              استعادة كافة الافتراضيات
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-black text-slate-700 hover:bg-slate-100 transition"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-black shadow-md transition"
              >
                <Shield className="w-4 h-4" />
                حفظ وتطبيق التغييرات
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
