import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar,
  Clock,
  Eye,
  Filter,
  History,
  RotateCcw,
  Search,
  User,
  X,
} from 'lucide-react';
import type { Bakery } from '../types';
import {
  extractAllBakeryChangeHistory,
  filterBakeryChangeHistory,
  type SearchableBakeryChangeEntry,
} from '../utils/bakeryAlertsAndHistory';
import { Button } from './common/Button';

interface BakeryChangeHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  bakeries: Bakery[];
  extraHistoryEntries?: SearchableBakeryChangeEntry[];
  initialOwnerQuery?: string;
  onSelectBakery?: (bakery: Bakery) => void;
}

/**
 * RTL slide-over drawer (rendered via Portal directly into document.body)
 * allowing managers to search bakery historical modifications by owner name
 * and modification date from any bakery table or the Edits & Display section.
 */
export const BakeryChangeHistoryDrawer: React.FC<BakeryChangeHistoryDrawerProps> = ({
  isOpen,
  onClose,
  bakeries,
  extraHistoryEntries = [],
  initialOwnerQuery = '',
  onSelectBakery,
}) => {
  const [instantQuery, setInstantQuery] = useState('');
  const [ownerQuery, setOwnerQuery] = useState(initialOwnerQuery);
  const [exactDate, setExactDate] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [actionQuery, setActionQuery] = useState('');

  useEffect(() => {
    if (isOpen && initialOwnerQuery) {
      setOwnerQuery(initialOwnerQuery);
    }
  }, [isOpen, initialOwnerQuery]);

  const allEntries = useMemo(
    () => extractAllBakeryChangeHistory(bakeries, extraHistoryEntries),
    [bakeries, extraHistoryEntries]
  );

  const filteredEntries = useMemo(
    () =>
      filterBakeryChangeHistory(allEntries, {
        instantQuery,
        ownerQuery,
        exactDate,
        fromDate,
        toDate,
        actionQuery,
      }),
    [allEntries, instantQuery, ownerQuery, exactDate, fromDate, toDate, actionQuery]
  );

  const bakeryByIdMap = useMemo(() => {
    const map = new Map<string, Bakery>();
    for (const b of bakeries || []) {
      map.set(b.id, b);
    }
    return map;
  }, [bakeries]);

  const handleResetFilters = () => {
    setInstantQuery('');
    setOwnerQuery('');
    setExactDate('');
    setFromDate('');
    setToDate('');
    setActionQuery('');
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label="سجل التغييرات التاريخي للمخابز"
      data-testid="bakery-change-history-drawer"
      className="fixed inset-0 z-[9990] flex justify-start bg-slate-950/65 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl h-full bg-white shadow-2xl border-e-2 border-[#D4AF37] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-l from-[#0A1628] via-[#13294B] to-[#0F2342] text-white px-5 py-4 border-b border-[#D4AF37]/40 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-[#D4AF37]/20 border border-[#D4AF37]/50 text-[#FDE68A] shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div className="min-w-0 text-start">
              <h2 className="text-base font-black text-white truncate">
                سجل التغييرات التاريخي للمخابز
              </h2>
              <p className="text-xs text-slate-300 font-bold mt-0.5">
                بحث فوري باسم صاحب المخبز أو تاريخ التعديل ({filteredEntries.length.toLocaleString('en-US')} من {allEntries.length.toLocaleString('en-US')} حركة)
              </p>
            </div>
          </div>

          <Button
            variant="delete"
            size="sm"
            onClick={onClose}
            data-testid="close-bakery-history-drawer-btn"
            className="!bg-rose-600/90 !hover:bg-rose-600 !text-white !border-rose-400/50"
            title="إغلاق اللوحة الجانبية"
            icon={<X className="w-4 h-4" />}
          >
            <span>إغلاق</span>
          </Button>
        </div>

        {/* Search & Filter Panel */}
        <div className="bg-slate-50 border-b border-slate-200 p-4 space-y-3 shrink-0">
          {/* Unified Real-Time Instant Search Box */}
          <div className="space-y-1 text-start">
            <label className="text-xs font-black text-[#0A1628] flex items-center gap-1.5">
              <Search className="w-4 h-4 text-[#0D9488]" />
              <span>بحث فوري شامل (اسم صاحب المخبز، نوع التعديل، التاريخ، أو الماكينة):</span>
            </label>
            <input
              type="text"
              value={instantQuery}
              onChange={(e) => setInstantQuery(e.target.value)}
              data-testid="history-instant-search-input"
              placeholder="بحث فوري باسم صاحب المخبز أو نوع التعديل أو التاريخ..."
              className="w-full px-3.5 py-2.5 bg-white border-2 border-[#0D9488]/60 rounded-xl text-xs font-black text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0D9488] shadow-2xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Search by Bakery Owner Name */}
            <div className="space-y-1 text-start">
              <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-[#0D9488]" />
                <span>البحث باسم صاحب المخبز (أو رقم الماكينة / القرية):</span>
              </label>
              <input
                type="text"
                value={ownerQuery}
                onChange={(e) => setOwnerQuery(e.target.value)}
                data-testid="history-search-owner-input"
                placeholder="اكتب اسم صاحب المخبز..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-[#0D9488]"
              />
            </div>

            {/* Search by Exact Modification Date */}
            <div className="space-y-1 text-start">
              <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-600" />
                <span>تاريخ التعديل المحدد:</span>
              </label>
              <input
                type="date"
                value={exactDate}
                onChange={(e) => setExactDate(e.target.value)}
                data-testid="history-search-date-input"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono tabular-nums font-bold text-slate-900 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Advanced Date Range + Action Filter */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
            <div className="space-y-1 text-start">
              <label className="text-[11px] font-bold text-slate-600">من تاريخ:</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono tabular-nums text-slate-800"
              />
            </div>
            <div className="space-y-1 text-start">
              <label className="text-[11px] font-bold text-slate-600">إلى تاريخ:</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono tabular-nums text-slate-800"
              />
            </div>
            <div className="space-y-1 text-start">
              <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                <Filter className="w-3 h-3 text-slate-500" />
                <span>نوع التعديل أو المستخدم:</span>
              </label>
              <input
                type="text"
                value={actionQuery}
                onChange={(e) => setActionQuery(e.target.value)}
                placeholder="حصة، رخصة، مدير..."
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800"
              />
            </div>
          </div>

          {(instantQuery || ownerQuery || exactDate || fromDate || toDate || actionQuery) && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] font-bold text-teal-800">
                تمت التصفية: {filteredEntries.length.toLocaleString('en-US')} سجل مطابق
              </span>
              <Button
                variant="secondary"
                size="xs"
                onClick={handleResetFilters}
                icon={<RotateCcw className="w-3 h-3" />}
              >
                <span>إعادة تعيين البحث</span>
              </Button>
            </div>
          )}
        </div>

        {/* History Timeline List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-slate-50/50">
          {filteredEntries.length === 0 ? (
            <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center space-y-2">
              <History className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-black text-slate-700">
                {allEntries.length === 0
                  ? 'لا توجد تعديلات تاريخية مسجلة للمخابز حتى الآن'
                  : 'لا توجد نتائج مطابقة لمعايير البحث الحالية'}
              </p>
              <p className="text-xs font-bold text-slate-500">
                {allEntries.length === 0
                  ? 'سيتم توثيق كل إضافة أو تعديل أو تحديث حصة لأي مخبز هنا تلقائياً مع اسم المستخدم والتوقيت.'
                  : 'جرّب تعديل اسم صاحب المخبز أو مسح فلتر التاريخ لعرض جميع التغييرات.'}
              </p>
            </div>
          ) : (
            filteredEntries.slice(0, 200).map((entry) => {
              const matchedBakery = bakeryByIdMap.get(entry.bakeryId);
              return (
                <div
                  key={entry.id}
                  data-testid="bakery-history-entry-card"
                  className="bg-white border border-slate-200 hover:border-[#0D9488]/60 rounded-xl p-3.5 transition space-y-2 text-start"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-[#0A1628]">
                          {entry.bakeryOwnerName}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-mono tabular-nums font-bold text-slate-700">
                          ماكينة: {entry.machineNumber}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-[10px] font-bold text-teal-800">
                          {entry.localUnit} — {entry.village}
                        </span>
                      </div>
                      <div className="text-xs font-black text-amber-800">{entry.action}</div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-mono tabular-nums font-bold">
                        <Clock className="w-3 h-3 text-[#0D9488]" />
                        <span>{entry.timestamp || entry.isoDate || '—'}</span>
                      </span>
                      {matchedBakery && onSelectBakery && (
                        <Button
                          variant="view"
                          size="xs"
                          onClick={() => {
                            onSelectBakery(matchedBakery);
                            onClose();
                          }}
                          icon={<Eye className="w-3 h-3" />}
                        >
                          <span>عرض المخبز</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  {entry.details && (
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs font-bold text-slate-700 leading-relaxed">
                      {entry.details}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-bold pt-1 border-t border-slate-100">
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" />
                      <span>بواسطة: {entry.userFullName}</span>
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {entry.isoDate || '—'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default BakeryChangeHistoryDrawer;
