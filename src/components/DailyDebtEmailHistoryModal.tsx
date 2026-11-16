import React, { useMemo, useRef, useState } from 'react';
import { AppUser, DailyDebtEmailLogEntry, SystemConfig } from '../types';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FileSpreadsheet,
  History,
  Mail,
  Printer,
  Search,
  Settings,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { printHtmlElementA4 } from '../utils/pdfHelper';

interface DailyDebtEmailHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: DailyDebtEmailLogEntry[];
  currentUser: AppUser | null;
  systemConfig: SystemConfig;
  onOpenSettings?: () => void;
  onClearHistory?: () => void;
}

function formatAttemptDateTime(sentAtIso: string, fallbackDate: string): {
  dateLabel: string;
  timeLabel: string;
} {
  if (!sentAtIso) {
    return { dateLabel: fallbackDate || '—', timeLabel: '—' };
  }
  const parsed = new Date(sentAtIso);
  if (Number.isNaN(parsed.getTime())) {
    return { dateLabel: fallbackDate || '—', timeLabel: '—' };
  }
  return {
    dateLabel: parsed.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }),
    timeLabel: parsed.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  };
}

export const DailyDebtEmailHistoryModal: React.FC<DailyDebtEmailHistoryModalProps> = ({
  isOpen,
  onClose,
  history,
  currentUser,
  systemConfig,
  onOpenSettings,
  onClearHistory,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'sent' | 'needs_auth' | 'failed'>('ALL');
  const [modeFilter, setModeFilter] = useState<'ALL' | 'auto' | 'manual'>('ALL');
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const printAreaRef = useRef<HTMLDivElement | null>(null);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';

  const normalizedHistory = useMemo(() => {
    return [...(history || [])].sort((a, b) =>
      String(b.sentAtIso || b.sentDate || '').localeCompare(String(a.sentAtIso || a.sentDate || ''))
    );
  }, [history]);

  const stats = useMemo(() => {
    let sentCount = 0;
    let failedCount = 0;
    let needsAuthCount = 0;
    let totalAlertsSent = 0;

    normalizedHistory.forEach((entry) => {
      if (entry.status === 'sent') {
        sentCount += 1;
        totalAlertsSent += entry.criticalBakeriesCount || 0;
      } else if (entry.status === 'needs_auth') {
        needsAuthCount += 1;
      } else {
        failedCount += 1;
      }
    });

    return {
      total: normalizedHistory.length,
      sentCount,
      failedCount,
      needsAuthCount,
      unsuccessfulCount: failedCount + needsAuthCount,
      totalAlertsSent,
    };
  }, [normalizedHistory]);

  const filteredHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return normalizedHistory.filter((entry) => {
      if (statusFilter !== 'ALL' && entry.status !== statusFilter) return false;
      if (modeFilter !== 'ALL' && entry.mode !== modeFilter) return false;
      if (q) {
        const snapshotText = (entry.bakeriesSnapshot || [])
          .map((s) => `${s.bakeryOwnerName} ${s.machineNumber} ${s.village}`)
          .join(' ');
        const haystack = [
          entry.sentDate,
          entry.alertTime || '',
          entry.subject || '',
          entry.messageId || '',
          entry.errorMessage || '',
          (entry.recipients || []).join(' '),
          snapshotText,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [normalizedHistory, statusFilter, modeFilter, searchQuery]);

  const selectedEntry = useMemo(() => {
    if (!selectedEntryId) return null;
    return normalizedHistory.find((e) => e.id === selectedEntryId) || null;
  }, [normalizedHistory, selectedEntryId]);

  if (!isOpen) return null;

  const handleExportCSV = () => {
    const headers = [
      'م',
      'التاريخ',
      'الوقت',
      'نوع التشغيل',
      'حالة الإرسال',
      'الحد الحرج (ج.م)',
      'عدد المخابز الحرجة',
      'إجمالي المديونية الحرجة (ج.م)',
      'المستلمون',
      'معرف الرسالة / سبب الخطأ',
    ];

    const rows = filteredHistory.map((entry, idx) => {
      const dt = formatAttemptDateTime(entry.sentAtIso, entry.sentDate);
      const statusAr =
        entry.status === 'sent'
          ? 'تم بنجاح'
          : entry.status === 'needs_auth'
          ? 'يحتاج تجديد صلاحية الدخول'
          : 'فشل';
      return [
        idx + 1,
        `"${entry.sentDate || dt.dateLabel}"`,
        `"${dt.timeLabel}"`,
        `"${entry.mode === 'auto' ? 'تلقائي يومي' : 'يدوي فوري'}"`,
        `"${statusAr}"`,
        entry.thresholdUsed,
        entry.criticalBakeriesCount,
        entry.totalCriticalDebt,
        `"${(entry.recipients || []).join(' | ').replace(/"/g, '""')}"`,
        `"${(entry.messageId || entry.errorMessage || '—').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `سجل_التنبيهات_البريدية_للديون_الحرجة_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    printHtmlElementA4(
      printAreaRef.current,
      `سجل_التقارير_البريدية_للديون_${new Date().toISOString().split('T')[0]}`,
      'report-font-standard',
      { paperSize: 'a4', orientation: 'landscape' }
    );
  };

  return (
    <div
      dir="rtl"
      data-testid="debt-email-history-modal"
      className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm overflow-y-auto cursor-pointer"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-slate-950 text-slate-100 rounded-2xl shadow-2xl border-2 border-rose-500/60 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Header */}
        <div className="bg-gradient-to-l from-[#0F2342] via-slate-950 to-rose-950/60 p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0 no-print">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-600/20 rounded-xl border border-rose-400/50 text-rose-300">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">
                سجل إرسال التنبيهات البريدية اليومية للديون الحرجة
              </h3>
              <p className="text-[11px] text-amber-200 font-bold mt-0.5">
                {systemConfig.directorateTitle} — مراجعة التقارير التاريخية وحالة تسليم الإشعارات للمشرفين
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenSettings && (
              <button
                type="button"
                data-testid="history-open-email-settings-btn"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-black cursor-pointer transition"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>إعدادات الربط والجدولة</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filteredHistory.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-45 text-white rounded-lg text-xs font-black cursor-pointer transition"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>تصدير CSV</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={filteredHistory.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-45 text-white rounded-lg text-xs font-black cursor-pointer transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة A4</span>
            </button>

            <button
              type="button"
              data-testid="close-debt-email-history-btn"
              onClick={onClose}
              className="p-1.5 bg-slate-900 hover:bg-rose-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition cursor-pointer"
              title="إغلاق النافذة"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4" ref={printAreaRef}>
          {/* Print Only Header */}
          <div className="hidden print:block border-b-2 border-slate-900 pb-3 mb-3 text-slate-900">
            <h2 className="text-base font-black text-center">
              {systemConfig.directorateTitle} — {systemConfig.administrationTitle}
            </h2>
            <p className="text-xs font-bold text-center mt-1">
              السجل التاريخي لمحاولات إرسال التنبيهات البريدية للديون الحرجة للمشرفين
            </p>
          </div>

          {/* 4 KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-400 block">إجمالي المحاولات المسجلة</span>
                <span className="text-xl font-black font-mono tabular-nums text-white">{stats.total}</span>
              </div>
              <Mail className="w-6 h-6 text-blue-400" />
            </div>

            <div className="bg-emerald-950/35 border border-emerald-700/50 rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-emerald-300 block">تم الإرسال بنجاح</span>
                <span className="text-xl font-black font-mono tabular-nums text-emerald-400">
                  {stats.sentCount}
                </span>
              </div>
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>

            <div className="bg-rose-950/35 border border-rose-700/50 rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-rose-200 block">
                  فشل / يحتاج تجديد صلاحية
                </span>
                <span className="text-xl font-black font-mono tabular-nums text-rose-400">
                  {stats.unsuccessfulCount}
                </span>
              </div>
              <AlertTriangle className="w-6 h-6 text-amber-400" />
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-400 block">
                  إجمالي المخابز المبلغة بنجاح
                </span>
                <span className="text-xl font-black font-mono tabular-nums text-amber-300">
                  {stats.totalAlertsSent}
                </span>
              </div>
              <Calendar className="w-6 h-6 text-amber-400" />
            </div>
          </div>

          {/* Filters & Search Toolbar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5 no-print">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                data-testid="debt-email-history-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالتاريخ، بريد المشرف، اسم المخبز، أو رسالة الخطأ..."
                className="w-full pr-9 pl-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-bold text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div
              data-testid="debt-email-history-status-filter"
              className="flex flex-wrap items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800"
            >
              {(
                [
                  { id: 'ALL', label: `الكل (${stats.total})` },
                  { id: 'sent', label: `تم بنجاح (${stats.sentCount})` },
                  { id: 'needs_auth', label: `تجديد صلاحية (${stats.needsAuthCount})` },
                  { id: 'failed', label: `فشل (${stats.failedCount})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-black cursor-pointer transition ${
                    statusFilter === tab.id
                      ? 'bg-rose-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <select
              aria-label="تصفية حسب نوع الإرسال"
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value as 'ALL' | 'auto' | 'manual')}
              className="px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-bold text-slate-200"
            >
              <option value="ALL">كل الأنواع (تلقائي ويدوي)</option>
              <option value="auto">الإرسال التلقائي اليومي فقط</option>
              <option value="manual">الإرسال اليدوي الفوري فقط</option>
            </select>

            {isAdmin && onClearHistory && normalizedHistory.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmClearOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-700/60 text-rose-200 text-[11px] font-black cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>مسح السجل</span>
              </button>
            )}
          </div>

          {/* Historical Attempts Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[380px]">
              <table className="w-full text-right text-xs border-collapse">
                <thead className="bg-[#0F2342] text-amber-300 font-black sticky top-0 z-10 border-b border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-10">م</th>
                    <th className="py-2.5 px-3">تاريخ ووقت المحاولة</th>
                    <th className="py-2.5 px-3 text-center">النوع</th>
                    <th className="py-2.5 px-3 text-center">حالة الإرسال</th>
                    <th className="py-2.5 px-3 text-center">الحد الحرج</th>
                    <th className="py-2.5 px-3 text-center">المخابز الحرجة</th>
                    <th className="py-2.5 px-3 text-center">إجمالي الديون الحرجة</th>
                    <th className="py-2.5 px-3">المشرفون المستلمون</th>
                    <th className="py-2.5 px-3">التفاصيل / المرجع</th>
                    <th className="py-2.5 px-3 text-center no-print">معاينة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-bold">
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                          <History className="w-8 h-8 text-slate-600" />
                          <span>
                            {normalizedHistory.length === 0
                              ? 'لا توجد محاولات مسجلة لإرسال تنبيهات الديون الحرجة بالبريد حتى الآن.'
                              : 'لا توجد نتائج مطابقة لمعايير البحث والتصفية الحالية.'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((entry, idx) => {
                      const dt = formatAttemptDateTime(entry.sentAtIso, entry.sentDate);
                      const isSelected = selectedEntryId === entry.id;
                      return (
                        <tr
                          key={entry.id}
                          data-testid="debt-email-history-row"
                          className={`transition ${
                            isSelected
                              ? 'bg-blue-950/75'
                              : 'odd:bg-slate-900 even:bg-slate-950/70 hover:bg-slate-800/80'
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center font-mono text-slate-400 tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="font-mono tabular-nums text-white">{entry.sentDate || dt.dateLabel}</div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <Clock className="w-3 h-3 text-amber-400" />
                              <span className="font-mono tabular-nums">{dt.timeLabel}</span>
                              {entry.alertTime && (
                                <span className="text-slate-500">(مجدول {entry.alertTime})</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${
                                entry.mode === 'auto'
                                  ? 'bg-cyan-950/70 text-cyan-300 border-cyan-700/60'
                                  : 'bg-purple-950/70 text-purple-300 border-purple-700/60'
                              }`}
                            >
                              {entry.mode === 'auto' ? 'تلقائي يومي' : 'يدوي فوري'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            {entry.status === 'sent' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-950 text-emerald-300 border border-emerald-600">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>تم بنجاح</span>
                              </span>
                            ) : entry.status === 'needs_auth' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-950 text-amber-300 border border-amber-600">
                                <AlertTriangle className="w-3 h-3" />
                                <span>يحتاج تجديد صلاحية</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-950 text-rose-300 border border-rose-600">
                                <XCircle className="w-3 h-3" />
                                <span>فشل</span>
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono tabular-nums text-amber-300 whitespace-nowrap">
                            {(entry.thresholdUsed || 0).toLocaleString('en-US')} ج.م
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono tabular-nums text-white">
                            {entry.criticalBakeriesCount} مخبز
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono tabular-nums text-rose-300 whitespace-nowrap">
                            {(entry.totalCriticalDebt || 0).toLocaleString('en-US')} ج.م
                          </td>
                          <td className="py-2.5 px-3 max-w-[220px]">
                            <div className="flex flex-wrap gap-1">
                              {(entry.recipients || []).map((rec) => (
                                <span
                                  key={rec}
                                  className="px-1.5 py-0.5 bg-slate-950 border border-slate-700 rounded text-[10px] font-mono text-slate-200"
                                >
                                  {rec}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 max-w-[240px] text-[11px]">
                            {entry.status === 'sent' ? (
                              <span className="font-mono text-emerald-300 break-all">
                                ID: {entry.messageId || 'تم التسليم'}
                              </span>
                            ) : (
                              <span className="text-rose-300 leading-snug block">
                                {entry.errorMessage || 'تعذر الإرسال'}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center no-print">
                            <button
                              type="button"
                              onClick={() => setSelectedEntryId(isSelected ? null : entry.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-blue-700 text-slate-200 hover:text-white rounded-lg text-[10px] font-black cursor-pointer transition"
                            >
                              <Eye className="w-3 h-3" />
                              <span>{isSelected ? 'إخفاء' : 'التفاصيل'}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Selected Historical Snapshot Inspector */}
          {selectedEntry && (
            <div
              data-testid="debt-email-history-snapshot"
              className="bg-slate-900 border-2 border-blue-500/50 rounded-xl p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div>
                  <h4 className="text-xs font-black text-amber-300">
                    تفاصيل التقرير المرسل بتاريخ {selectedEntry.sentDate}
                  </h4>
                  {selectedEntry.subject && (
                    <p className="text-[11px] text-slate-300 mt-0.5">{selectedEntry.subject}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEntryId(null)}
                  className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 cursor-pointer"
                >
                  إغلاق التفاصيل
                </button>
              </div>

              {selectedEntry.bakeriesSnapshot && selectedEntry.bakeriesSnapshot.length > 0 ? (
                <div className="overflow-x-auto max-h-56">
                  <table className="w-full text-right text-[11px] border-collapse">
                    <thead className="bg-slate-950 text-slate-300 font-black">
                      <tr>
                        <th className="py-2 px-2.5 border border-slate-800">م</th>
                        <th className="py-2 px-2.5 border border-slate-800">صاحب المخبز</th>
                        <th className="py-2 px-2.5 border border-slate-800 text-center">رقم الماكينة</th>
                        <th className="py-2 px-2.5 border border-slate-800">القرية</th>
                        <th className="py-2 px-2.5 border border-slate-800">الوحدة المحلية</th>
                        <th className="py-2 px-2.5 border border-slate-800 text-center">المديونية وقت التنبيه</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {selectedEntry.bakeriesSnapshot.map((bak, idx) => (
                        <tr key={`${bak.bakeryId}-${idx}`} className="bg-slate-950/60">
                          <td className="py-1.5 px-2.5 border border-slate-800 font-mono text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-1.5 px-2.5 border border-slate-800 font-bold text-white">
                            {bak.bakeryOwnerName}
                          </td>
                          <td className="py-1.5 px-2.5 border border-slate-800 text-center font-mono text-amber-300">
                            {bak.machineNumber}
                          </td>
                          <td className="py-1.5 px-2.5 border border-slate-800 text-slate-300">
                            {bak.village}
                          </td>
                          <td className="py-1.5 px-2.5 border border-slate-800 text-slate-300">
                            {bak.localUnit}
                          </td>
                          <td className="py-1.5 px-2.5 border border-slate-800 text-center font-mono tabular-nums font-black text-rose-300">
                            {(bak.totalRemainingDebt || 0).toLocaleString('en-US')} ج.م
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-400 font-bold">
                  سجل قديم تم حفظه قبل تفعيل اللقطة التفصيلية للمخابز — العدد الإجمالي وقتها:{' '}
                  {selectedEntry.criticalBakeriesCount} مخبز بإجمالي{' '}
                  {(selectedEntry.totalCriticalDebt || 0).toLocaleString('en-US')} ج.م.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs no-print shrink-0">
          <span className="text-slate-400 font-bold">
            يتم الاحتفاظ بسجل آخر 100 محاولة إرسال لتقارير المديونيات الحرجة لمتابعة المشرفين.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black cursor-pointer transition"
          >
            إغلاق السجل
          </button>
        </div>
      </div>

      {/* Clear Confirmation Dialog */}
      {confirmClearOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/75 flex items-center justify-center p-4"
          onClick={() => setConfirmClearOpen(false)}
        >
          <div
            className="bg-slate-900 border-2 border-rose-500 rounded-2xl max-w-sm w-full p-5 space-y-4 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-sm font-black text-rose-300">تأكيد مسح سجل التنبيهات البريدية</h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              هل تريد مسح كافة السجلات التاريخية لمحاولات إرسال تقارير الديون الحرجة؟ لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmClearOpen(false)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearHistory?.();
                  setSelectedEntryId(null);
                  setConfirmClearOpen(false);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-black cursor-pointer"
              >
                تأكيد المسح
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
