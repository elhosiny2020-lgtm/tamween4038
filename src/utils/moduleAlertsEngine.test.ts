import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCommoditiesDepartmentAlerts,
  buildInternalTradeDepartmentAlerts,
  canDeleteDepartmentAlert,
  canViewDepartmentAlerts,
  countUnreadDepartmentAlerts,
  filterDepartmentAlerts,
} from './moduleAlertsEngine.ts';
import type { AppUser } from '../types.ts';
import type { InternalTradeState, RationModuleState } from '../types/modules.ts';

describe('moduleAlertsEngine — Department Alerts & RBAC', () => {
  it('generates commodities alerts from expired merchant licenses/tax/commercial regs and open complaints', () => {
    const rationState: Partial<RationModuleState> = {
      merchants: [
        {
          id: 'm1',
          merchantName: 'منفذ بشبيش',
          localUnit: 'بشبيش',
          village: 'بشبيش',
          licenseNumber: 'L-1',
          licenseExpiryDate: '2026-01-01',
          taxCardNumber: 'T-1',
          taxCardExpiryDate: '2026-11-25',
          commercialRegNumber: 'C-1',
          commercialRegExpiryDate: '2028-01-01',
          cashInsuranceAmount: 0,
          posMachineNumber: '',
        } as any,
      ],
      commodities: [],
      warehouses: [],
      complaints: [
        {
          id: 'cmp-1',
          ticketNumber: 'T-10',
          citizenName: 'مواطن',
          details: 'نقص سلع',
          village: 'بشبيش',
          merchantId: 'm1',
          category: 'نقص سلعة',
          date: '2026-11-10',
          status: 'جديدة',
        } as any,
      ],
      inspections: [],
      requisitions: [],
    };

    const alerts = buildCommoditiesDepartmentAlerts(rationState as RationModuleState, '2026-11-17');
    assert.ok(alerts.some((a) => a.type === 'انتهاء تراخيص' && a.severity === 'critical'));
    assert.ok(alerts.some((a) => a.type === 'انتهاء تراخيص' && a.severity === 'warning'));
    assert.ok(alerts.some((a) => a.type === 'نقص بيانات أو تأمين'));
    assert.ok(alerts.some((a) => a.type === 'شكاوى وبلاغات'));
  });

  it('generates internal trade alerts and supports filtering, unread count, and RBAC guards', () => {
    const itState: Partial<InternalTradeState> = {
      establishments: [
        {
          id: 'e1',
          establishmentCode: 'IT-1',
          establishmentName: 'سوبر ماركت النور',
          localUnit: 'دمرو',
          village: 'دمرو',
          licenseNumber: 'LIC-9',
          licenseExpiryDate: '2026-10-01',
          commercialRegNumber: 'CR-9',
          commercialRegExpiryDate: '2028-01-01',
          activityStatus: 'مغلق',
          closureReason: 'مخالفة تموينية',
          activityStartDate: '2020-01-01',
        } as any,
      ],
      campaigns: [
        {
          id: 'camp1',
          campaignNumber: 'CMP-99',
          campaignDate: '2026-11-15',
          localUnit: 'بشبيش',
          village: 'بشبيش',
          geographicScope: 'مركز المحلة',
          campaignHead: 'مفتش',
          violatingCount: 3,
          finalReportSubmitted: false,
        } as any,
      ],
      violations: [],
      seizures: [],
      complaints: [],
      fuelStations: [],
      lpgDepots: [],
    };

    const alerts = buildInternalTradeDepartmentAlerts(itState as InternalTradeState, '2026-11-17');
    assert.equal(alerts.length, 3);
    assert.equal(countUnreadDepartmentAlerts(alerts, [alerts[0].id]), 2);

    const filteredByUnit = filterDepartmentAlerts(alerts, { localUnit: 'دمرو' });
    assert.equal(filteredByUnit.length, 2);

    const adminUser: AppUser = { id: '1', username: 'admin', fullName: 'مدير', role: 'admin', isSuperAdmin: true };
    const tradeUser: AppUser = {
      id: '2',
      username: 'trade_u',
      fullName: 'موظف تجارة',
      role: 'inspector',
      departmentPermissions: {
        internal_trade: { view: true, insert: true, update: true, delete: false, print: true, export: true },
      },
    };

    assert.equal(canViewDepartmentAlerts(adminUser, 'commodities'), true);
    assert.equal(canViewDepartmentAlerts(tradeUser, 'internal_trade'), true);
    assert.equal(canViewDepartmentAlerts(tradeUser, 'commodities'), false);
    assert.equal(canDeleteDepartmentAlert(adminUser), true);
    assert.equal(canDeleteDepartmentAlert(tradeUser), false);
  });
});
