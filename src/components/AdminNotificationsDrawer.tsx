import React, { useState, useEffect } from 'react';
import { HighDebtAlertNotification } from '../types';
import {
  Bell,
  AlertTriangle,
  X,
  CheckCircle2,
  Trash2,
  ShieldCheck,
  User,
  Clock,
  ChevronLeft,
  SlidersHorizontal,
  Save
} from 'lucide-react';

interface AdminNotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: HighDebtAlertNotification[];
  debtAlertThreshold?: number;
  onUpdateThreshold?: (threshold: number) => void;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  onSelectBakeryDebt: (bakeryId: string) => void;
}

export const AdminNotificationsDrawer: React.FC<AdminNotificationsDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  debtAlertThreshold = 50000,
  onUpdateThreshold,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  onSelectBakeryDebt,
}) => {
  const [thresholdInput, setThresholdInput] = useState<string>(String(debtAlertThreshold));
  const [filterMode, setFilterMode] = useState<'ALL' | 'UNREAD'>('ALL');

  useEffect(() => {
    setThresholdInput(String(debtAlertThreshold));
  }, [debtAlertThreshold, isOpen]);

  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const displayedNotifications =
    filterMode === 'UNREAD' ? notifications.filter((n) => !n.isRead) : notifications;

  const handleSaveThreshold = () => {
    const parsed = Math.max(1000, Math.round(Number(thresholdInput) || 50000));
    setThresholdInput(String(parsed));
    onUpdateThreshold?.(parsed);
  };

  return (
    <div
      dir="rtl"
      data-testid="alerts-drawer-backdrop"
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs cursor-pointer"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        data-testid="alerts-drawer-panel"
        aria-label="سجل تنبيهات المديونيات"
        className="w-full max-w-md bg-slate-950 text-slate-100 h-full shadow-2xl border-r border-slate-700 flex flex-col cursor-default"
      >
        {/* Drawer Header */}
        <div className="bg-[#0F2342] p-4 border-b border-slate-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-red-600/20 rounded-xl border border-red-500/40">
              <Bell className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <span>سجل تنبيهات المديونيات</span>
                {unreadCount > 0 && (
                  <span className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full font-mono tabular-nums">
                    {unreadCount} جديد
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-amber-200 font-bold mt-0.5">
                تنبيهات فورية ومزامنة عند تجاوز المديونية ({debtAlertThreshold.toLocaleString('en-US')} ج.م)
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="إغلاق سجل التنبيهات"
            data-testid="close-alerts-drawer-btn"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Configurable Alert Threshold Panel */}
        {onUpdateThreshold && (
          <div className="bg-slate-900/95 px-4 py-3 border-b border-slate-800 space-y-2 shrink-0">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
              <span className="flex items-center gap-1.5 text-amber-300">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>حد التنبيه التلقائي للمديونية (ج.م):</span>
              </span>
              <span className="font-mono tabular-nums text-slate-400">
                الحالي: {debtAlertThreshold.toLocaleString('en-US')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1000}
                step={1000}
                aria-label="قيمة حد تنبيه المديونية بالجنيه"
                data-testid="alert-threshold-input"
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono tabular-nums font-bold text-white focus:outline-none focus:border-amber-400"
              />
              <button
                type="button"
                data-testid="save-alert-threshold-btn"
                onClick={handleSaveThreshold}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-black flex items-center gap-1 cursor-pointer transition"
              >
                <Save className="w-3.5 h-3.5" />
                <span>حفظ الحد</span>
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              {[20000, 50000, 100000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setThresholdInput(String(preset));
                    onUpdateThreshold(preset);
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold border cursor-pointer transition ${
                    debtAlertThreshold === preset
                      ? 'bg-amber-500/20 text-amber-300 border-amber-400/60'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {preset.toLocaleString('en-US')} ج.م
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Drawer Toolbar & Filter Tabs */}
        <div className="bg-slate-900 p-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-bold shrink-0">
          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setFilterMode('ALL')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition ${
                filterMode === 'ALL' ? 'bg-[#1E40AF] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              الكل ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('UNREAD')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition ${
                filterMode === 'UNREAD'
                  ? 'bg-red-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              غير مقروءة ({unreadCount})
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllAsRead}
                className="text-emerald-400 hover:text-emerald-300 text-[11px] flex items-center gap-1 cursor-pointer bg-emerald-950/60 px-2 py-1 rounded border border-emerald-500/30"
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>قراءة الكل</span>
              </button>
            )}
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                className="text-red-400 hover:text-red-300 text-[11px] flex items-center gap-1 cursor-pointer bg-red-950/60 px-2 py-1 rounded border border-red-500/30"
              >
                <Trash2 className="w-3 h-3" />
                <span>مسح السجل</span>
              </button>
            )}
          </div>
        </div>

        {/* Drawer List Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {displayedNotifications.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-3">
              <ShieldCheck className="w-12 h-12 text-slate-700" />
              <p className="text-xs font-black text-slate-300">
                {filterMode === 'UNREAD'
                  ? 'لا توجد تنبيهات غير مقروءة حالياً.'
                  : 'لا توجد أي تنبيهات مديونيات مسجلة حالياً.'}
              </p>
              <p className="text-[11px] text-slate-500">
                يتم إرسال وتسجيل تنبيه فوري تلقائياً عند إضافة أو تعديل أي مديونية مخبز تبلغ أو تتجاوز{' '}
                <strong className="text-amber-300 font-mono tabular-nums">
                  {debtAlertThreshold.toLocaleString('en-US')} ج.م
                </strong>
                .
              </p>
            </div>
          ) : (
            displayedNotifications.map((item) => {
              const usedThreshold = item.thresholdUsed || debtAlertThreshold;
              return (
                <div
                  key={item.id}
                  data-testid="alert-drawer-item"
                  onClick={() => {
                    onMarkAsRead(item.id);
                    onSelectBakeryDebt(item.bakeryId);
                    onClose();
                  }}
                  className={`p-3.5 rounded-xl border transition-all duration-200 cursor-pointer relative overflow-hidden group ${
                    !item.isRead
                      ? 'bg-red-950/70 border-red-500/70 shadow-md'
                      : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h4 className="text-xs font-black text-white flex items-center gap-1.5 flex-wrap">
                        <span>{item.bakeryOwnerName}</span>
                        <span className="text-[10px] text-amber-300 font-mono bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-600/40">
                          ماكينة: {item.machineNumber}
                        </span>
                      </h4>
                      <span className="text-[10px] text-slate-400 font-bold block mt-0.5">
                        قرية {item.village}
                      </span>
                    </div>

                    <span className="text-xs font-black text-red-300 font-mono tabular-nums bg-red-950 px-2.5 py-1 rounded-lg border border-red-600/50 shrink-0">
                      {Number(item.debtAmount).toLocaleString('en-US')} ج.م
                    </span>
                  </div>

                  {/* Event Tag */}
                  <div className="p-2 bg-black/40 rounded-lg border border-slate-800 text-[11px] font-bold text-amber-200 mb-2.5 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <span>
                      {item.actionType === 'ADD_DEBT'
                        ? `تسجيل مديونية جديدة تجاوزت ${usedThreshold.toLocaleString('en-US')} ج.م`
                        : item.actionType === 'EDIT_DEBT'
                        ? `تعديل قيد مديونية تتجاوز ${usedThreshold.toLocaleString('en-US')} ج.م`
                        : `ارتفاع المديونية المتبقية لأكثر من ${usedThreshold.toLocaleString('en-US')} ج.م`}
                    </span>
                  </div>

                  {/* Editor & Timestamp Info */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-800/80 pt-2 font-mono">
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3 text-amber-400" />
                      <span>
                        بواسطة: <strong className="text-slate-200">{item.editedBy}</strong> ({item.editorRole})
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{item.timestamp}</span>
                    </div>
                  </div>

                  {/* Hover CTA */}
                  <div className="mt-2 text-[10px] text-cyan-400 font-black flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition">
                    <span>انقر لعرض مديونيات المخبز</span>
                    <ChevronLeft className="w-3 h-3" />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 text-[11px] font-bold text-slate-400 text-center shrink-0">
          منظومة الرقابة التموينية والإنذار المبكر &bull; مزامنة فورية على Cloud Firebase
        </div>
      </aside>
    </div>
  );
};

