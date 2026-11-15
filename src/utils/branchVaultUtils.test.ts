import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBranchNameKey,
  deduplicateSupplyBranches,
  verifyVaultPasscode,
  validateNewVaultPasscode,
  DEFAULT_VAULT_PASSCODE,
} from './branchVaultUtils';
import type { SupplyBranch } from '../types';

test('normalizeBranchNameKey unifies Arabic spelling variations and hamzas', () => {
  const k1 = normalizeBranchNameKey('إدارة تموين مركز المحلة الكبرى');
  const k2 = normalizeBranchNameKey('اداره تموين مركز المحله الكبري');
  const k3 = normalizeBranchNameKey('  إدارة   تموين المحلة الكبرى ');
  assert.equal(k1, k2);
  assert.equal(k1, k3);

  const s1 = normalizeBranchNameKey('إدارة تموين سمنود');
  const s2 = normalizeBranchNameKey('ادارة تموين مركز ومدينة سمنود');
  const s3 = normalizeBranchNameKey('إدارة تموين (branch-samanoud)');
  assert.equal(s1, s2);
  assert.equal(s1, s3);
});

test('deduplicateSupplyBranches eliminates duplicate branches with different IDs or Arabic spellings', () => {
  const noisyBranches: SupplyBranch[] = [
    {
      id: 'branch-mahalla',
      name: 'إدارة تموين مركز المحلة الكبرى',
      governorateTitle: 'محافظة الغربية',
      directorateTitle: 'مديرية التموين',
      createdAt: '2025-01-01',
      isDefault: true,
    },
    {
      id: 'branch-1740000111-abcd',
      name: 'ادارة تموين مركز المحله الكبري',
      governorateTitle: 'محافظة الغربية',
      directorateTitle: 'مديرية التموين',
      createdAt: '2025-02-01',
    },
    {
      id: 'branch-samanoud',
      name: 'إدارة تموين (branch-samanoud)',
      governorateTitle: 'محافظة الغربية',
      directorateTitle: 'مديرية التموين',
      createdAt: '2025-01-01',
    },
    {
      id: 'branch-1740000222-efgh',
      name: 'إدارة تموين سمنود',
      governorateTitle: 'محافظة الغربية',
      directorateTitle: 'مديرية التموين',
      createdAt: '2025-02-02',
    },
    {
      id: 'branch-1740000333-ijkl',
      name: 'إدارة تموين (branch-1740000333-ijkl)',
      governorateTitle: 'محافظة الغربية',
      directorateTitle: 'مديرية التموين',
      createdAt: '2025-02-03',
    },
    {
      id: 'branch-zefta',
      name: 'إدارة تموين زفتى',
      governorateTitle: 'محافظة الغربية',
      directorateTitle: 'مديرية التموين',
      createdAt: '2025-02-04',
    },
    {
      id: 'branch-zefta-dup',
      name: 'اداره تموين زفتي',
      governorateTitle: 'محافظة الغربية',
      directorateTitle: 'مديرية التموين',
      createdAt: '2025-02-05',
    },
  ];

  const deduped = deduplicateSupplyBranches(noisyBranches);
  assert.equal(deduped.length, 3);
  assert.equal(deduped[0].id, 'branch-mahalla');
  assert.equal(deduped[0].name, 'إدارة تموين مركز المحلة الكبرى');
  assert.equal(deduped[1].id, 'branch-samanoud');
  assert.equal(deduped[1].name, 'إدارة تموين سمنود');
  assert.equal(deduped[2].id, 'branch-zefta');
  assert.equal(deduped[2].name, 'إدارة تموين زفتى');
});

test('verifyVaultPasscode supports standard and Arabic-Indic digits and blocks wrong codes', () => {
  assert.equal(verifyVaultPasscode('2025', DEFAULT_VAULT_PASSCODE), true);
  assert.equal(verifyVaultPasscode('٢٠٢٥', DEFAULT_VAULT_PASSCODE), true);
  assert.equal(verifyVaultPasscode('9999', DEFAULT_VAULT_PASSCODE), false);
  assert.equal(verifyVaultPasscode('', DEFAULT_VAULT_PASSCODE), false);
});

test('validateNewVaultPasscode validates current code, minimum length, and confirmation match', () => {
  const wrongCurrent = validateNewVaultPasscode('0000', '5588', '5588', '2025');
  assert.equal(wrongCurrent.valid, false);

  const tooShort = validateNewVaultPasscode('2025', '12', '12', '2025');
  assert.equal(tooShort.valid, false);

  const mismatch = validateNewVaultPasscode('2025', '5588', '5599', '2025');
  assert.equal(mismatch.valid, false);

  const success = validateNewVaultPasscode('٢٠٢٥', '٨٨٩٩', '8899', '2025');
  assert.equal(success.valid, true);
  assert.equal(success.normalizedNew, '8899');
});
