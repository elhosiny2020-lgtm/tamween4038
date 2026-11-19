import React, { useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  ChevronDown,
  ChevronUp,
  Eye,
  Settings,
  Wheat,
  X,
} from 'lucide-react';
import type { LowFlourQuotaBakeryAlert } from '../utils/bakeryAlertsAndHistory';
import { Button } from './common/Button';

interface LowFlourQuotaPushBannerProps {
  alerts: LowFlourQuotaBakeryAlert[];
  minThresholdSacks: number;
  isManager: boolean;
  enabled: boolean;
  onInspectBakery: (bakeryId: string) => void;
  onOpenSettings: () => void;
}

/**
 * Immediate in-app PUSH notification banner for managers (admin / supervisor / super_admin)
 * when one or more active bakeries drop below the configured daily flour quota threshold (in sacks / شكائر).
 */
export const LowFlourQuotaPushBanner: React.FC<LowFlourQuotaPushBannerProps> = ({
  alerts,
  minThresholdSacks,
  isManager,
  enabled,
  onInspectBakery,
  onOpenSettings,
}) => {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!isManager || !enabled || dismissed || alerts.length === 0) {
    return null;
  }

  return (
    <div
      dir="rtl"
      role="alert"
      data-testid="low-flour-quota-push-banner"
      className="mb-3 rounded-xl border-2 border-rose-500/80 bg-gradient-to-l from-rose-950 via-rose-900 to-amber-950 text-white shadow-lg overflow-hidden"
    >
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-rose-500/25 border border-rose-400/50 text-amber-300 shrink-0 animate-pulse">
            <BellRing className="w-5 h-5" />
          </div>
          <div className="min-w-0 text-start">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-rose-500 text-white text-[10px] font-black">
                إشعار PUSH فوري للمدراء
              </span>
              <h4 className="text-xs sm:text-sm font-black text-white">
                تنبيه انخفاض رصيد حصة الدقيق اليومي لأقل من{' '}
                <span className="font-mono tabular-nums text-amber-300">
                  {minThresholdSacks}
                </span>{' '}
                شيكارة
              </h4>
            </div>
            <p className="text-[11px] text-rose-100/90 font-bold mt-0.5">
              يوجد{' '}
              <span className="font-mono tabular-nums font-black text-amber-300">
                {alerts.length.toLocaleString('en-US')}
              </span>{' '}
              مخبز نشط تقل حصته اليومية الفعلية عن الحد الأدنى المقرر بالشكائر.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="amber"
            size="xs"
            onClick={() => setExpanded((prev) => !prev)}
            data-testid="toggle-low-flour-quota-details-btn"
            icon={expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          >
            <span>{expanded ? 'إخفاء القائمة' : `عرض المخابز (${alerts.length})`}</span>
          </Button>
          <Button
            variant="secondary"
            size="xs"
            onClick={onOpenSettings}
            className="!bg-white/10 !text-white !border-white/25 hover:!bg-white/20"
            icon={<Settings className="w-3.5 h-3.5" />}
            title="تعديل الحد الأدنى بالشكائر من إعدادات التنبيه اليومي"
          >
            <span>الإعدادات</span>
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setDismissed(true)}
            className="!text-rose-200 hover:!bg-rose-800/60"
            title="إغلاق التنبيه مؤقتاً"
            icon={<X className="w-4 h-4" />}
          />
        </div>
      </div>

      {expanded && (
        <div className="bg-slate-950/85 border-t border-rose-500/40 px-4 py-3">
          <div className="max-h-60 overflow-y-auto overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="border-b border-rose-500/30 text-amber-300 font-black">
                  <th className="py-1.5 px-2 text-start">صاحب المخبز</th>
                  <th className="py-1.5 px-2 text-center">رقم الماكينة</th>
                  <th className="py-1.5 px-2 text-start">الوحدة المحلية / القرية</th>
                  <th className="py-1.5 px-2 text-center">الحصة الفعلية</th>
                  <th className="py-1.5 px-2 text-center">العجز عن الحد</th>
                  <th className="py-1.5 px-2 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {alerts.slice(0, 25).map((item) => (
                  <tr key={item.bakeryId} className="hover:bg-rose-950/40">
                    <td className="py-1.5 px-2 font-black text-white flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span>{item.bakeryOwnerName}</span>
                    </td>
                    <td className="py-1.5 px-2 text-center font-mono tabular-nums text-slate-300">
                      {item.machineNumber}
                    </td>
                    <td className="py-1.5 px-2 text-slate-200 font-bold">
                      {item.localUnit} — {item.village}
                    </td>
                    <td className="py-1.5 px-2 text-center font-mono tabular-nums font-black text-rose-300">
                      <span className="inline-flex items-center gap-1">
                        <Wheat className="w-3 h-3 text-amber-400" />
                        {item.actualQuota} شيكارة
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-center font-mono tabular-nums font-black text-amber-300">
                      -{item.deficitSacks} شيكارة
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      <Button
                        variant="view"
                        size="xs"
                        onClick={() => onInspectBakery(item.bakeryId)}
                        icon={<Eye className="w-3 h-3" />}
                      >
                        <span>معاينة</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default LowFlourQuotaPushBanner;
