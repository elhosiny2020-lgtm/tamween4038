import type { AppUser, Bakery, DailyAlertConfig, DebtRecord } from '../types.ts';

export interface CriticalDebtBakerySummary {
  bakeryId: string;
  bakeryOwnerName: string;
  machineNumber: string;
  village: string;
  localUnit: string;
  phone: string;
  totalRemainingDebt: number;
  totalPaidDebt: number;
  excessAmount: number;
  unpaidRecordsCount: number;
  totalRecordsCount: number;
  latestViolationDate: string;
}

export interface SupervisorRecipientInfo {
  email: string;
  displayName: string;
  roleLabel: string;
  source: 'user_account' | 'manual_list' | 'directorate';
}

export interface DailyDebtEmailScheduleEvaluation {
  shouldRun: boolean;
  todayStr: string;
  scheduledTime: string;
  currentTime: string;
  reason: 'ready' | 'disabled' | 'already_sent_today' | 'before_scheduled_time';
}

export interface CriticalDebtEmailPayload {
  subject: string;
  htmlBody: string;
  textBody: string;
  totalCriticalDebt: number;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmailAddress(value: string): boolean {
  const clean = String(value || '').trim();
  return clean.length > 0 && clean.length <= 254 && EMAIL_REGEX.test(clean);
}

export function formatLocalDateYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatLocalTimeHm(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function collectCriticalDebtBakeries(
  bakeries: Bakery[],
  debts: DebtRecord[],
  criticalDebtThreshold: number
): CriticalDebtBakerySummary[] {
  const threshold = Number(criticalDebtThreshold);
  if (!Number.isFinite(threshold) || threshold <= 0) {
    return [];
  }

  const bakeryById = new Map<string, Bakery>();
  for (const b of bakeries || []) {
    if (b?.id) {
      bakeryById.set(String(b.id), b);
    }
  }

  const aggMap = new Map<string, CriticalDebtBakerySummary>();

  for (const d of debts || []) {
    if (!d) continue;
    const key = String(d.bakeryId || d.id || '').trim();
    if (!key) continue;

    const remaining = Number(d.netRemainingDebt) || 0;
    const paid =
      (Number(d.paidViolationAmount) || 0) +
      (Number(d.paidAddedAmount) || 0) +
      (Number(d.paidDisposalAmount) || 0);

    const existing = aggMap.get(key);
    const matchedBakery = bakeryById.get(key);
    const vDate = String(d.violationDate || '').trim();

    if (!existing) {
      aggMap.set(key, {
        bakeryId: key,
        bakeryOwnerName: matchedBakery?.bakeryOwnerName || d.bakeryOwnerName || 'مخبز غير مسمى',
        machineNumber: matchedBakery?.machineNumber || d.machineNumber || '---',
        village: matchedBakery?.village || d.village || 'غير محددة',
        localUnit: matchedBakery?.localUnit || d.localUnit || '---',
        phone: matchedBakery?.phone || '',
        totalRemainingDebt: remaining,
        totalPaidDebt: paid,
        excessAmount: 0,
        unpaidRecordsCount: remaining > 0 ? 1 : 0,
        totalRecordsCount: 1,
        latestViolationDate: vDate,
      });
    } else {
      existing.totalRemainingDebt += remaining;
      existing.totalPaidDebt += paid;
      existing.totalRecordsCount += 1;
      if (remaining > 0) existing.unpaidRecordsCount += 1;
      if (vDate && (!existing.latestViolationDate || vDate > existing.latestViolationDate)) {
        existing.latestViolationDate = vDate;
      }
    }
  }

  const criticalList: CriticalDebtBakerySummary[] = [];
  aggMap.forEach((summary) => {
    const roundedDebt = Math.round(summary.totalRemainingDebt * 100) / 100;
    if (roundedDebt > 0 && roundedDebt >= threshold) {
      criticalList.push({
        ...summary,
        totalRemainingDebt: roundedDebt,
        totalPaidDebt: Math.round(summary.totalPaidDebt * 100) / 100,
        excessAmount: Math.round((roundedDebt - threshold) * 100) / 100,
      });
    }
  });

  criticalList.sort((a, b) => b.totalRemainingDebt - a.totalRemainingDebt);
  return criticalList;
}

export function resolveSupervisorEmailRecipients(
  users: AppUser[],
  options?: {
    extraEmails?: string[];
    includeSystemSupervisors?: boolean;
    fallbackDirectorateEmail?: string;
  }
): SupervisorRecipientInfo[] {
  const byEmailLower = new Map<string, SupervisorRecipientInfo>();
  const includeSystem = options?.includeSystemSupervisors !== false;

  if (includeSystem) {
    for (const u of users || []) {
      if (!u || u.isActive === false) continue;
      const role = String(u.role || '').trim().toLowerCase();
      if (role !== 'supervisor' && role !== 'admin') continue;
      const email = String(u.gmailEmail || '').trim();
      if (!isValidEmailAddress(email)) continue;

      const key = email.toLowerCase();
      if (!byEmailLower.has(key)) {
        byEmailLower.set(key, {
          email,
          displayName: u.fullName || u.username || email,
          roleLabel: role === 'admin' ? 'مدير النظام' : 'مشرف عام رقابة',
          source: 'user_account',
        });
      }
    }
  }

  for (const rawEmail of options?.extraEmails || []) {
    const email = String(rawEmail || '').trim();
    if (!isValidEmailAddress(email)) continue;
    const key = email.toLowerCase();
    if (!byEmailLower.has(key)) {
      byEmailLower.set(key, {
        email,
        displayName: 'بريد مشرف معتمد',
        roleLabel: 'مشرف مستلم للتنبيهات',
        source: 'manual_list',
      });
    }
  }

  const fallbackEmail = String(options?.fallbackDirectorateEmail || '').trim();
  if (byEmailLower.size === 0 && isValidEmailAddress(fallbackEmail)) {
    byEmailLower.set(fallbackEmail.toLowerCase(), {
      email: fallbackEmail,
      displayName: 'البريد الرئيسي للإدارة',
      roleLabel: 'حساب الإدارة التموينية',
      source: 'directorate',
    });
  }

  return Array.from(byEmailLower.values());
}

export function shouldTriggerDailyDebtEmailSchedule(
  now: Date,
  config: DailyAlertConfig | undefined,
  lastFiredLocally?: string | null
): DailyDebtEmailScheduleEvaluation {
  const todayStr = formatLocalDateYmd(now);
  const currentTime = formatLocalTimeHm(now);
  const scheduledTime =
    String(config?.debtEmailAlertTime || config?.alertTime || '09:00').trim() || '09:00';

  if (!config || config.debtEmailEnabled === false) {
    return {
      shouldRun: false,
      todayStr,
      scheduledTime,
      currentTime,
      reason: 'disabled',
    };
  }

  if (config.lastDebtEmailAlertDate === todayStr || lastFiredLocally === todayStr) {
    return {
      shouldRun: false,
      todayStr,
      scheduledTime,
      currentTime,
      reason: 'already_sent_today',
    };
  }

  if (currentTime < scheduledTime) {
    return {
      shouldRun: false,
      todayStr,
      scheduledTime,
      currentTime,
      reason: 'before_scheduled_time',
    };
  }

  return {
    shouldRun: true,
    todayStr,
    scheduledTime,
    currentTime,
    reason: 'ready',
  };
}

export function buildCriticalDebtEmailPayload(params: {
  directorateTitle: string;
  administrationTitle: string;
  criticalThreshold: number;
  alertTime: string;
  dateStr: string;
  criticalBakeries: CriticalDebtBakerySummary[];
  recipients: SupervisorRecipientInfo[];
}): CriticalDebtEmailPayload {
  const count = params.criticalBakeries.length;
  const totalCriticalDebt = params.criticalBakeries.reduce(
    (sum, item) => sum + item.totalRemainingDebt,
    0
  );
  const formattedThreshold = Number(params.criticalThreshold).toLocaleString('en-US');
  const formattedTotalDebt = Math.round(totalCriticalDebt).toLocaleString('en-US');

  const subject = `تنبيه يومي عاجل: (${count}) مخبز تجاوز الحد الحرج للمديونية (${formattedThreshold} ج.م) - ${params.administrationTitle} - ${params.dateStr}`;

  const rowsHtml = params.criticalBakeries
    .map(
      (b, idx) => `
      <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#fff7ed'};">
        <td style="padding:10px;border:1px solid #cbd5e1;text-align:center;font-weight:bold;">${idx + 1}</td>
        <td style="padding:10px;border:1px solid #cbd5e1;font-weight:bold;color:#0f172a;">${escapeHtml(b.bakeryOwnerName)}</td>
        <td style="padding:10px;border:1px solid #cbd5e1;font-family:monospace;text-align:center;">${escapeHtml(b.machineNumber)}</td>
        <td style="padding:10px;border:1px solid #cbd5e1;">${escapeHtml(b.village)} (${escapeHtml(b.localUnit)})</td>
        <td style="padding:10px;border:1px solid #cbd5e1;font-family:monospace;text-align:center;">${escapeHtml(b.phone || '—')}</td>
        <td style="padding:10px;border:1px solid #cbd5e1;font-family:monospace;text-align:center;">${b.unpaidRecordsCount}</td>
        <td style="padding:10px;border:1px solid #cbd5e1;font-family:monospace;font-weight:bold;color:#b91c1c;text-align:left;">${b.totalRemainingDebt.toLocaleString('en-US')} ج.م</td>
        <td style="padding:10px;border:1px solid #cbd5e1;font-family:monospace;font-weight:bold;color:#9a3412;text-align:left;">+${b.excessAmount.toLocaleString('en-US')} ج.م</td>
      </tr>`
    )
    .join('');

  const htmlBody = `
  <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
    <div style="max-width:860px;margin:0 auto;background:#ffffff;border:2px solid #b91c1c;border-radius:14px;overflow:hidden;">
      <div style="background:#0f172a;color:#ffffff;padding:20px 24px;border-bottom:4px solid #dc2626;">
        <div style="font-size:12px;color:#fbbf24;font-weight:bold;margin-bottom:4px;">${escapeHtml(params.directorateTitle)} — ${escapeHtml(params.administrationTitle)}</div>
        <h2 style="margin:0;font-size:18px;color:#ffffff;">تنبيه يومي عاجل للمشرفين: مخابز تجاوزت الحد الحرج للمديونية</h2>
        <div style="font-size:12px;color:#cbd5e1;margin-top:6px;">التاريخ: ${escapeHtml(params.dateStr)} | موعد الجدولة اليومي: ${escapeHtml(params.alertTime)}</div>
      </div>

      <div style="padding:20px 24px;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
          <tr>
            <td style="padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;width:33%;">
              <div style="font-size:11px;color:#991b1b;font-weight:bold;">عدد المخابز الحرجة</div>
              <div style="font-size:20px;font-weight:bold;color:#b91c1c;font-family:monospace;">${count} مخبز</div>
            </td>
            <td style="padding:12px;background:#fffbeb;border:1px solid #fde68a;width:33%;">
              <div style="font-size:11px;color:#92400e;font-weight:bold;">الحد الحرج المعتمد</div>
              <div style="font-size:20px;font-weight:bold;color:#b45309;font-family:monospace;">${formattedThreshold} ج.م</div>
            </td>
            <td style="padding:12px;background:#f8fafc;border:1px solid #cbd5e1;width:34%;">
              <div style="font-size:11px;color:#334155;font-weight:bold;">إجمالي المديونيات الحرجة</div>
              <div style="font-size:20px;font-weight:bold;color:#0f172a;font-family:monospace;">${formattedTotalDebt} ج.م</div>
            </td>
          </tr>
        </table>

        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#1e293b;color:#ffffff;">
              <th style="padding:10px;border:1px solid #334155;">#</th>
              <th style="padding:10px;border:1px solid #334155;">صاحب المخبز</th>
              <th style="padding:10px;border:1px solid #334155;">رقم الماكينة</th>
              <th style="padding:10px;border:1px solid #334155;">القرية / الوحدة</th>
              <th style="padding:10px;border:1px solid #334155;">الهاتف</th>
              <th style="padding:10px;border:1px solid #334155;">قيود غير مسددة</th>
              <th style="padding:10px;border:1px solid #334155;">إجمالي المتبقي</th>
              <th style="padding:10px;border:1px solid #334155;">التجاوز عن الحد</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <p style="font-size:11px;color:#475569;margin-top:16px;">
          تم إرسال هذا الإخطار الآلي إلى المشرفين المعتمدين (${params.recipients.map((r) => escapeHtml(r.email)).join(' ، ')}) لاتخاذ إجراءات التحصيل والمتابعة الإدارية.
        </p>
      </div>
    </div>
  </div>`;

  const textLines = [
    `${params.directorateTitle} - ${params.administrationTitle}`,
    `تنبيه يومي للمشرفين: (${count}) مخبز بلغ/تجاوز الحد الحرج للمديونية (${formattedThreshold} ج.م)`,
    `التاريخ: ${params.dateStr} | الإجمالي الحرج: ${formattedTotalDebt} ج.م`,
    '------------------------------------------------------------',
    ...params.criticalBakeries.map(
      (b, idx) =>
        `${idx + 1}. ${b.bakeryOwnerName} (ماكينة: ${b.machineNumber} - ${b.village}): المتبقي ${b.totalRemainingDebt.toLocaleString('en-US')} ج.م (+${b.excessAmount.toLocaleString('en-US')} عن الحد)`
    ),
  ];

  return {
    subject,
    htmlBody,
    textBody: textLines.join('\n'),
    totalCriticalDebt: Math.round(totalCriticalDebt * 100) / 100,
  };
}
