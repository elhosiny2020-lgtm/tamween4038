import React from 'react';
import {
  FileSpreadsheet,
  FileText,
  History,
  Plus,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import { Button } from './Button';

export interface ReportToolbarProps {
  title: string;
  subtitle?: string;
  count?: number;
  countLabel?: string;
  onExportPdf?: () => void;
  onPrint?: () => void;
  onExportExcel?: () => void;
  onAdd?: () => void;
  addLabel?: string;
  onOpenHistory?: () => void;
  historyLabel?: string;
  extraActions?: React.ReactNode;
  accentClassName?: string;
  testIdPrefix?: string;
}

/**
 * Unified RTL ReportToolbar positioned above every operational data table across
 * Internal Trade, Ration Commodities, Grain Maintenance, HR, and Bakeries.
 */
export const ReportToolbar: React.FC<ReportToolbarProps> = ({
  title,
  subtitle,
  count,
  countLabel = 'سجل',
  onExportPdf,
  onPrint,
  onExportExcel,
  onAdd,
  addLabel = 'إضافة سجل جديد',
  onOpenHistory,
  historyLabel = 'سجل التغييرات التاريخي',
  extraActions,
  accentClassName = 'from-[#0A1628] via-[#13294B] to-[#0F2342]',
  testIdPrefix = 'report-toolbar',
}) => {
  return (
    <div
      dir="rtl"
      data-testid={`${testIdPrefix}-bar`}
      className={`bg-gradient-to-l ${accentClassName} text-white px-4 py-3 rounded-xl border border-[#D4AF37]/35 flex flex-wrap items-center justify-between gap-3 shadow-xs`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {typeof count === 'number' && (
          <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-[#D4AF37] text-[#0A1628] text-xs font-black font-mono tabular-nums shrink-0">
            {count.toLocaleString('en-US')} {countLabel}
          </span>
        )}
        <div className="min-w-0 text-start">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-black text-white truncate">{title}</h3>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 border border-white/15 text-[10px] font-bold text-amber-200 whitespace-nowrap">
              <ShieldCheck className="w-3 h-3 text-[#D4AF37]" />
              <span>تقارير معتمدة بشعار الوزارة</span>
            </span>
          </div>
          {subtitle && (
            <p className="text-[11px] text-slate-300 font-bold mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {extraActions}

        {onOpenHistory && (
          <Button
            variant="amber"
            size="sm"
            onClick={onOpenHistory}
            data-testid={`${testIdPrefix}-history-btn`}
            icon={<History className="w-3.5 h-3.5" />}
            title="فتح اللوحة الجانبية للبحث في سجل التغييرات التاريخي"
          >
            <span>{historyLabel}</span>
          </Button>
        )}

        {onExportExcel && (
          <Button
            variant="excel"
            size="sm"
            onClick={onExportExcel}
            data-testid={`${testIdPrefix}-excel-btn`}
            icon={<FileSpreadsheet className="w-3.5 h-3.5" />}
            title="تصدير البيانات إلى ملف Excel"
          >
            <span>تصدير Excel</span>
          </Button>
        )}

        {onExportPdf && (
          <Button
            variant="pdf"
            size="sm"
            onClick={onExportPdf}
            data-testid={`${testIdPrefix}-pdf-btn`}
            icon={<FileText className="w-3.5 h-3.5" />}
            title="تصدير التقرير كملف PDF بشعار الوزارة"
          >
            <span>تصدير PDF</span>
          </Button>
        )}

        {onPrint && (
          <Button
            variant="print"
            size="sm"
            onClick={onPrint}
            data-testid={`${testIdPrefix}-print-btn`}
            icon={<Printer className="w-3.5 h-3.5" />}
            title="طباعة التقرير الرسمي A4 بشعار الوزارة"
          >
            <span>طباعة A4</span>
          </Button>
        )}

        {onAdd && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onAdd}
            data-testid={`${testIdPrefix}-add-btn`}
            icon={<Plus className="w-4 h-4 text-[#0D9488]" />}
            className="!border-[#D4AF37] !text-[#0A1628]"
          >
            <span>{addLabel}</span>
          </Button>
        )}
      </div>
    </div>
  );
};

export default ReportToolbar;
