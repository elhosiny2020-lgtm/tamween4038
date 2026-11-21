import React from 'react';

export interface ReportColumnDef {
  key: string;
  label: string;
  align?: 'right' | 'center' | 'left';
  isCurrency?: boolean;
  isNumber?: boolean;
  isSensitive?: boolean;
}

export interface ReportSummaryMetric {
  label: string;
  value: string | number;
  unit?: string;
}

export interface ReportTemplateProps {
  title: string;
  subtitle?: string;
  departmentName: string;
  departmentKey?: 'commodities' | 'internal_trade' | 'grain_maintenance' | 'hr' | 'bakeries' | 'debts';
  issuedBy?: string;
  issuedAt?: string;
  filterSummaryText?: string;
  columns: ReportColumnDef[];
  rows: Record<string, any>[];
  summaryMetrics?: ReportSummaryMetric[];
  canViewSensitiveHr?: boolean;
}

const SENSITIVE_FIELD_PATTERNS = /password|passcode|token|secret|hash|apiKey|privateKey|vault/i;
const HR_NATIONAL_ID_PATTERN = /nationalId|الرقم القومي/i;
const HR_SALARY_PATTERN = /salary|wage|allowance|deduction|netPay|الراتب|المرتب|الأجر|صافي المستحق/i;

export function formatReportCellValue(
  rawVal: unknown,
  col: ReportColumnDef,
  options?: {
    departmentKey?: string;
    canViewSensitiveHr?: boolean;
  }
): string {
  if (rawVal === null || rawVal === undefined || String(rawVal).trim() === '') {
    return '—';
  }

  // Never include passwords, tokens, or secrets in any report
  if (SENSITIVE_FIELD_PATTERNS.test(col.key) || SENSITIVE_FIELD_PATTERNS.test(col.label)) {
    return '********';
  }

  // Mask HR National ID or Salary if user lacks sensitive HR permission
  if (options?.departmentKey === 'hr' && options?.canViewSensitiveHr === false) {
    if (HR_NATIONAL_ID_PATTERN.test(col.key) || HR_NATIONAL_ID_PATTERN.test(col.label)) {
      const str = String(rawVal).trim();
      return str.length >= 6 ? `${str.slice(0, 3)}********${str.slice(-3)}` : '***********';
    }
    if (col.isSensitive || HR_SALARY_PATTERN.test(col.key) || HR_SALARY_PATTERN.test(col.label)) {
      return 'محجوب حسب الصلاحية';
    }
  }

  if (typeof rawVal === 'boolean') {
    return rawVal ? 'نعم' : 'لا';
  }

  if (col.isCurrency) {
    const num = Number(String(rawVal).replace(/[^\d.-]/g, ''));
    if (!Number.isNaN(num) && String(rawVal).trim() !== '') {
      return `${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ج.م`;
    }
  }

  if (col.isNumber || typeof rawVal === 'number') {
    const num = typeof rawVal === 'number' ? rawVal : Number(String(rawVal).replace(/,/g, ''));
    if (!Number.isNaN(num) && String(rawVal).trim() !== '') {
      return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
  }

  return String(rawVal);
}

export const ReportTemplate: React.FC<ReportTemplateProps> = ({
  title,
  subtitle,
  departmentName,
  departmentKey = 'commodities',
  issuedBy = 'مسؤول النظام المختص',
  issuedAt,
  filterSummaryText,
  columns,
  rows,
  summaryMetrics = [],
  canViewSensitiveHr = true,
}) => {
  const safeColumns = columns.filter(
    (c) => !SENSITIVE_FIELD_PATTERNS.test(c.key) && !SENSITIVE_FIELD_PATTERNS.test(c.label)
  );
  const orientation = safeColumns.length > 7 ? 'landscape' : 'portrait';
  const formattedIssueDate =
    issuedAt ||
    new Date().toLocaleString('ar-EG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

  const accentHex =
    departmentKey === 'commodities'
      ? '#047857'
      : departmentKey === 'grain_maintenance'
      ? '#B45309'
      : departmentKey === 'hr'
      ? '#0F766E'
      : '#1E3A8A';

  return (
    <div
      dir="rtl"
      lang="ar"
      data-report-orientation={orientation}
      className="print-container report-font-standard"
      style={{
        fontFamily: "'Cairo', 'Tajawal', Arial, sans-serif",
        direction: 'rtl',
        backgroundColor: '#FFFFFF',
        color: '#0F172A',
        padding: '10px',
        width: '100%',
        border: '1.5px solid #0F2342',
        borderRadius: '8px',
      }}
    >
      {/* Official Ministry & Directorate Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `2.5px solid ${accentHex}`,
          paddingBottom: '10px',
          marginBottom: '10px',
          gap: '12px',
        }}
      >
        {/* Right Block: Ministry & Directorate Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'right' }}>
          <img
            src="/assets/aistudio/images_a82c183a.jpeg"
            alt="شعار وزارة التموين والتجارة الداخلية"
            style={{
              width: '56px',
              height: '56px',
              objectFit: 'contain',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              padding: '2px',
              backgroundColor: '#FFFFFF',
            }}
          />
          <div>
            <div style={{ fontSize: '10pt', fontWeight: 900, color: '#0F2342' }}>
              جمهورية مصر العربية — وزارة التموين والتجارة الداخلية
            </div>
            <div style={{ fontSize: '9.5pt', fontWeight: 800, color: '#1E3A8A' }}>
              مديرية التموين والتجارة الداخلية بالغربية
            </div>
            <div style={{ fontSize: '9pt', fontWeight: 800, color: accentHex }}>
              إدارة تموين مركز المحلة الكبرى — {departmentName}
            </div>
          </div>
        </div>

        {/* Center Block: Report Title */}
        <div style={{ textAlign: 'center', flex: '1 1 auto' }}>
          <h1
            style={{
              fontSize: '13pt',
              fontWeight: 900,
              color: '#0F2342',
              margin: '0 0 3px 0',
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <div style={{ fontSize: '8.5pt', fontWeight: 700, color: '#475569' }}>{subtitle}</div>
          )}
          {filterSummaryText && (
            <div
              style={{
                fontSize: '8pt',
                fontWeight: 700,
                color: '#0F2342',
                backgroundColor: '#F1F5F9',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                padding: '2px 8px',
                display: 'inline-block',
                marginTop: '3px',
              }}
            >
              نطاق التصفية: {filterSummaryText}
            </div>
          )}
        </div>

        {/* Left Block: Issue Meta */}
        <div
          style={{
            textAlign: 'left',
            fontSize: '8pt',
            fontWeight: 700,
            color: '#334155',
            backgroundColor: '#F8FAFC',
            border: '1px solid #CBD5E1',
            borderRadius: '6px',
            padding: '6px 10px',
            minWidth: '175px',
          }}
        >
          <div>
            <span>تاريخ الإصدار: </span>
            <strong style={{ color: '#0F2342', fontFamily: 'Cairo, monospace' }}>
              {formattedIssueDate}
            </strong>
          </div>
          <div>
            <span>المُصدِر: </span>
            <strong style={{ color: '#0F2342' }}>{issuedBy}</strong>
          </div>
          <div>
            <span>إجمالي السجلات: </span>
            <strong style={{ color: accentHex, fontFamily: 'Cairo, monospace' }}>
              {rows.length.toLocaleString('en-US')} سجل
            </strong>
          </div>
          <div>
            <span>تنسيق الورقة: </span>
            <strong>{orientation === 'landscape' ? 'A4 أفقي' : 'A4 رأسي'}</strong>
          </div>
        </div>
      </div>

      {/* Summary KPI Metrics Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(Math.max(summaryMetrics.length + 1, 2), 5)}, minmax(0, 1fr))`,
          gap: '8px',
          marginBottom: '10px',
        }}
      >
        <div
          style={{
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: '6px',
            padding: '6px 8px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '7.5pt', fontWeight: 700, color: '#1E3A8A' }}>
            إجمالي السجلات المشمولة بالتقرير
          </div>
          <div style={{ fontSize: '10.5pt', fontWeight: 900, color: '#0F2342' }}>
            {rows.length.toLocaleString('en-US')} سجل
          </div>
        </div>
        {summaryMetrics.slice(0, 4).map((m, idx) => (
          <div
            key={`${m.label}-${idx}`}
            style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              padding: '6px 8px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '7.5pt', fontWeight: 700, color: '#475569' }}>{m.label}</div>
            <div style={{ fontSize: '10pt', fontWeight: 900, color: '#0F2342' }}>
              {typeof m.value === 'number' ? m.value.toLocaleString('en-US') : m.value}
              {m.unit ? ` ${m.unit}` : ''}
            </div>
          </div>
        ))}
      </div>

      {/* Main Data Table */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1.5px solid #0F2342',
          direction: 'rtl',
          backgroundColor: '#FFFFFF',
        }}
      >
        <thead style={{ display: 'table-header-group' }}>
          <tr style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
            <th
              style={{
                backgroundColor: '#0F2342',
                color: '#FFFFFF',
                border: '1px solid #1E3A8A',
                padding: '6px 4px',
                fontSize: '8pt',
                fontWeight: 800,
                textAlign: 'center',
                width: '34px',
              }}
            >
              م
            </th>
            {safeColumns.map((col) => (
              <th
                key={col.key}
                style={{
                  backgroundColor: '#0F2342',
                  color: '#FFFFFF',
                  border: '1px solid #1E3A8A',
                  padding: '6px 5px',
                  fontSize: '8.5pt',
                  fontWeight: 800,
                  textAlign: col.align || 'center',
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody style={{ display: 'table-row-group' }}>
          {rows.map((row, rIdx) => (
            <tr
              key={String(row.id || row.code || rIdx)}
              style={{
                breakInside: 'avoid',
                pageBreakInside: 'avoid',
                backgroundColor: rIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC',
              }}
            >
              <td
                style={{
                  border: '1px solid #94A3B8',
                  padding: '5px 4px',
                  fontSize: '8pt',
                  fontWeight: 800,
                  textAlign: 'center',
                  color: '#334155',
                }}
              >
                {rIdx + 1}
              </td>
              {safeColumns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    border: '1px solid #94A3B8',
                    padding: '5px 5px',
                    fontSize: '8.5pt',
                    fontWeight: 700,
                    textAlign: col.align || 'center',
                    color: '#0F172A',
                    wordBreak: 'break-word',
                  }}
                >
                  {formatReportCellValue(row[col.key], col, {
                    departmentKey,
                    canViewSensitiveHr,
                  })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Official Signatures & Accreditation Block */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '16px',
          marginTop: '18px',
          paddingTop: '10px',
          borderTop: '1.5px solid #0F2342',
          textAlign: 'center',
          breakInside: 'avoid',
          pageBreakInside: 'avoid',
        }}
      >
        <div>
          <div style={{ fontSize: '8.5pt', fontWeight: 900, color: '#0F2342' }}>
            محرر البيانات / المختص
          </div>
          <div style={{ fontSize: '8pt', fontWeight: 700, color: '#475569', marginTop: '2px' }}>
            الاسم: {issuedBy}
          </div>
          <div
            style={{
              marginTop: '22px',
              borderBottom: '1px dashed #64748B',
              width: '75%',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          />
        </div>
        <div>
          <div style={{ fontSize: '8.5pt', fontWeight: 900, color: '#0F2342' }}>
            رئيس {departmentName}
          </div>
          <div style={{ fontSize: '8pt', fontWeight: 700, color: '#475569', marginTop: '2px' }}>
            المراجعة والاعتماد الفني
          </div>
          <div
            style={{
              marginTop: '22px',
              borderBottom: '1px dashed #64748B',
              width: '75%',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          />
        </div>
        <div>
          <div style={{ fontSize: '8.5pt', fontWeight: 900, color: '#0F2342' }}>
            مدير إدارة تموين مركز المحلة الكبرى
          </div>
          <div style={{ fontSize: '8pt', fontWeight: 700, color: '#475569', marginTop: '2px' }}>
            خاتم شعار الجمهورية والاعتماد النهائي
          </div>
          <div
            style={{
              marginTop: '22px',
              borderBottom: '1px dashed #64748B',
              width: '75%',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          />
        </div>
      </div>

      {/* Official Footer */}
      <div
        style={{
          marginTop: '12px',
          paddingTop: '6px',
          borderTop: '1px solid #CBD5E1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '7.5pt',
          fontWeight: 700,
          color: '#475569',
        }}
      >
        <span>
          جهة الإصدار: مديرية التموين والتجارة الداخلية بالغربية — إدارة تموين مركز المحلة الكبرى
        </span>
        <span>مستند رسمي مستخرج آلياً من المنظومة الرقمية الموحدة</span>
      </div>
    </div>
  );
};
