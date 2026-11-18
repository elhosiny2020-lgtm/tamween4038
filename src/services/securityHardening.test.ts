import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createSessionToken,
  verifySessionToken,
  revokeSessionToken,
  revokeAllUserTokens,
  hashPasswordScrypt,
  verifyPasswordScrypt,
  validatePasswordComplexity,
  normalizeDigits,
  sanitizeSystemConfigForClient,
  sanitizeUsersForClient,
  parseCookieHeader,
} from '../utils/serverAuth';
import {
  isAllowedOrigin,
  sanitizeFrameAncestorToken,
  getFrameAncestors,
} from './securityConfig';
import { buildSafeExportPayload, serializeSafeEmbeddedJson } from '../utils/htmlExporter';
import {
  fallbackVerifyVaultCredentials,
  fallbackUpdateVaultCredentials,
  fallbackAuthenticateUser,
  fallbackSyncFullBranchState,
  fallbackGetBootstrap,
} from '../db/fallbackStore';

const FALLBACK_STORE_PATH = '/tmp/tamween_pg_fallback_store.json';

test('Session token signing rejects tampering, expiration, JTI revocation, and user-wide revocation', () => {
  const token = createSessionToken({
    userId: 'usr-sec-1',
    branchId: 'branch-mahalla',
    username: 'inspector1',
    role: 'inspector',
    isSuperAdmin: false,
    ttlMs: 60_000,
  });

  const valid = verifySessionToken(token);
  assert.ok(valid);
  assert.strictEqual(valid.userId, 'usr-sec-1');
  assert.ok(valid.jti.length > 10);

  // Tamper payload character
  const parts = token.split('.');
  const tamperedPayload = Buffer.from(
    JSON.stringify({ ...valid, isSuperAdmin: true }),
    'utf8'
  ).toString('base64url');
  assert.strictEqual(verifySessionToken(`${tamperedPayload}.${parts[1]}`), null);

  // Expired token rejected
  const expired = createSessionToken({
    userId: 'usr-sec-1',
    branchId: 'branch-mahalla',
    username: 'inspector1',
    role: 'inspector',
    isSuperAdmin: false,
    ttlMs: -5000,
  });
  assert.strictEqual(verifySessionToken(expired), null);

  // JTI revocation immediately invalidates token
  assert.strictEqual(revokeSessionToken(token), true);
  assert.strictEqual(verifySessionToken(token), null);

  // Per-user token revocation invalidates previously issued tokens for user
  const freshToken = createSessionToken({
    userId: 'usr-sec-2',
    branchId: 'branch-mahalla',
    username: 'admin2',
    role: 'admin',
    isSuperAdmin: true,
    ttlMs: 60_000,
  });
  assert.ok(verifySessionToken(freshToken));
  revokeAllUserTokens('usr-sec-2');
  assert.strictEqual(verifySessionToken(freshToken), null);
});

test('Password scrypt hashing, verification, digit normalization, and complexity policy work strictly', () => {
  assert.strictEqual(normalizeDigits('١٢٣٤٥٦٧٨'), '12345678');

  assert.strictEqual(validatePasswordComplexity('123').valid, false);
  assert.strictEqual(validatePasswordComplexity('abcdefgh').valid, false);
  assert.strictEqual(validatePasswordComplexity('12345678').valid, false);
  assert.strictEqual(validatePasswordComplexity('Tamween2026').valid, true);
  assert.strictEqual(validatePasswordComplexity('تموين٢٠٢٦ABC').valid, true);

  const saltedHash = hashPasswordScrypt('Pass١٢٣٤Test');
  assert.ok(saltedHash.startsWith('scrypt$'));
  assert.strictEqual(verifyPasswordScrypt('Pass1234Test', saltedHash), true);
  assert.strictEqual(verifyPasswordScrypt('WrongPassword', saltedHash), false);
});

test('Client payload sanitizers strip credentials, vault passcodes, and secret fields', () => {
  const dirtyCfg = {
    governorateTitle: 'محافظة الغربية',
    vaultUsername: 'محمود',
    vaultPasscode: '987654',
    branchVaultCredentials: {
      'branch-mahalla': { username: 'محمود', password: 'secret-vault-password' },
    },
    dailyAlertConfig: {
      enabled: true,
      vaultPasscode: 'nested-secret',
      vaultUsername: 'nested-user',
      branchVaultCredentials: { a: { username: 'u', password: 'p' } },
    },
  };

  const cleanCfg = sanitizeSystemConfigForClient(dirtyCfg);
  assert.strictEqual((cleanCfg as any).vaultPasscode, undefined);
  assert.strictEqual((cleanCfg as any).vaultUsername, undefined);
  assert.strictEqual((cleanCfg as any).branchVaultCredentials, undefined);
  assert.strictEqual((cleanCfg.dailyAlertConfig as any).vaultPasscode, undefined);
  assert.strictEqual((cleanCfg.dailyAlertConfig as any).branchVaultCredentials, undefined);
  assert.strictEqual(cleanCfg.governorateTitle, 'محافظة الغربية');

  const safeUsers = sanitizeUsersForClient([
    {
      id: 'u1',
      username: 'admin',
      password: 'plaintext-password',
      passwordHash: 'scrypt$salt$hash',
      gmailPassword: 'app-password-xyz',
    } as any,
  ]);
  assert.strictEqual((safeUsers[0] as any).password, undefined);
  assert.strictEqual((safeUsers[0] as any).passwordHash, undefined);
  assert.strictEqual((safeUsers[0] as any).gmailPassword, undefined);
  assert.strictEqual((safeUsers[0] as any).hasPassword, true);
});

test('CORS origin validation blocks untrusted external & suffix-spoofed origins while permitting exact host', () => {
  assert.strictEqual(isAllowedOrigin('https://evil.example', 'app.tamween.gov.eg'), false);
  assert.strictEqual(isAllowedOrigin('https://attacker-run.app', 'app.tamween.gov.eg'), false);
  assert.strictEqual(isAllowedOrigin('https://app.tamween.gov.eg', 'app.tamween.gov.eg'), true);
  assert.strictEqual(isAllowedOrigin('http://localhost:3000', 'localhost:3000'), true);
  assert.strictEqual(isAllowedOrigin('http://not-allowed.local:3000', 'app.tamween.gov.eg'), false);
});

test('Standalone HTML exporter strips secrets and neutralizes script breakout sequences', () => {
  const mockState: any = {
    bakeries: [{ id: 'b1', bakeryOwnerName: '</script><script>alert(1)</script>' }],
    debts: [],
    villages: [],
    issuingEntities: [],
    violationTypes: [],
    activityStatuses: [],
    columnTitles: {},
    systemConfig: {
      governorateTitle: 'الغربية',
      vaultUsername: 'mahmoud',
      vaultPasscode: 'super-secret',
      branchVaultCredentials: { 'branch-mahalla': { username: 'mahmoud', password: 'secret' } },
    },
    users: [
      {
        id: 'u1',
        username: 'admin',
        fullName: 'مدير',
        password: '123',
        passwordHash: 'scrypt$a$b',
        gmailPassword: 'gmail-app-password',
      },
    ],
  };

  const payload = buildSafeExportPayload(mockState);
  assert.strictEqual((payload.systemConfig as any).vaultPasscode, undefined);
  assert.strictEqual((payload.systemConfig as any).vaultUsername, undefined);
  assert.strictEqual((payload.systemConfig as any).branchVaultCredentials, undefined);
  assert.strictEqual((payload.users[0] as any).password, undefined);
  assert.strictEqual((payload.users[0] as any).passwordHash, undefined);
  assert.strictEqual((payload.users[0] as any).gmailPassword, undefined);

  const serialized = serializeSafeEmbeddedJson(payload);
  assert.strictEqual(serialized.includes('</script>'), false);
  assert.ok(serialized.includes('\\u003c/script\\u003e'));
});

test('Cookie header parser extracts HttpOnly session token reliably', () => {
  const parsed = parseCookieHeader('foo=bar; tamween_session=abc.def%3D%3D; other=1');
  assert.strictEqual(parsed.tamween_session, 'abc.def==');
  assert.strictEqual(parsed.foo, 'bar');
});

test('Fallback store verifies & rotates scrypt vault credentials without exposing hashes via bootstrap', () => {
  const prevExisted = fs.existsSync(FALLBACK_STORE_PATH);
  const prevRaw = prevExisted ? fs.readFileSync(FALLBACK_STORE_PATH, 'utf8') : null;
  const branchId = `branch-sec-test-${Date.now()}`;

  try {
    fallbackSyncFullBranchState(branchId, {
      bakeries: [],
      debts: [],
      villages: [],
      issuingEntities: [],
      violationTypes: [],
      activityStatuses: [],
      columnTitles: {},
      systemConfig: {
        governorateTitle: 'الغربية',
        directorateTitle: 'المديرية',
        administrationTitle: 'إدارة الاختبار',
        englishSubtitle: 'TEST',
        debtAlertThreshold: 50000,
        vaultUsername: 'testvault',
        vaultPasscode: 'InitPass123',
      },
      users: [
        {
          id: 'u-sec-test',
          username: 'tester',
          fullName: 'مختبر الأمان',
          password: hashPasswordScrypt('TesterPass99'),
          role: 'admin',
          isSuperAdmin: true,
          isActive: true,
          createdAt: new Date().toISOString(),
        } as any,
      ],
    });

    const loginFail = fallbackAuthenticateUser(branchId, 'tester', 'WrongPass1');
    assert.strictEqual(loginFail.ok, false);
    const loginOk = fallbackAuthenticateUser(branchId, 'tester', 'TesterPass99');
    assert.strictEqual(loginOk.ok, true);
    assert.strictEqual(loginOk.user?.username, 'tester');

    const badVault = fallbackVerifyVaultCredentials({
      branchId,
      enteredUsername: 'testvault',
      enteredPassword: 'wrong-code',
    });
    assert.strictEqual(badVault, false);
    const okVault = fallbackVerifyVaultCredentials({
      branchId,
      enteredUsername: 'testvault',
      enteredPassword: 'InitPass123',
    });
    assert.strictEqual(okVault, true);

    fallbackUpdateVaultCredentials({
      targetScope: branchId,
      newUsername: 'rotatedvault',
      newPassword: 'RotatedPass2026',
    });
    assert.strictEqual(
      fallbackVerifyVaultCredentials({
        branchId,
        enteredUsername: 'testvault',
        enteredPassword: 'InitPass123',
      }),
      false
    );
    assert.strictEqual(
      fallbackVerifyVaultCredentials({
        branchId,
        enteredUsername: 'rotatedvault',
        enteredPassword: 'RotatedPass2026',
      }),
      true
    );

    const bootstrap = fallbackGetBootstrap(branchId);
    assert.strictEqual((bootstrap.systemConfig as any)?.vaultPasscode, undefined);
    assert.strictEqual((bootstrap.systemConfig as any)?.vaultUsername, undefined);
    assert.strictEqual((bootstrap.systemConfig as any)?.branchVaultCredentials, undefined);
    assert.strictEqual((bootstrap.users[0] as any)?.password, undefined);
  } finally {
    if (prevExisted && prevRaw !== null) {
      fs.writeFileSync(FALLBACK_STORE_PATH, prevRaw, { encoding: 'utf8', mode: 0o600 });
    } else if (!prevExisted && fs.existsSync(FALLBACK_STORE_PATH)) {
      fs.unlinkSync(FALLBACK_STORE_PATH);
    }
  }
});

test('CSP frame-ancestors sanitizer normalizes unquoted keywords and malformed delimiters safely', () => {
  assert.strictEqual(sanitizeFrameAncestorToken('self'), "'self'");
  assert.strictEqual(sanitizeFrameAncestorToken('none;'), "'none'");
  assert.strictEqual(sanitizeFrameAncestorToken("'self'"), "'self'");
  assert.strictEqual(
    sanitizeFrameAncestorToken('https://aistudio.google.com;'),
    'https://aistudio.google.com'
  );
  assert.strictEqual(sanitizeFrameAncestorToken('   '), null);

  const prev = process.env.ALLOWED_FRAME_ANCESTORS;
  try {
    process.env.ALLOWED_FRAME_ANCESTORS = 'self, https://preview.example.com; none';
    const ancestors = getFrameAncestors();
    assert.ok(ancestors.includes("'self'"));
    assert.ok(ancestors.includes("'none'"));
    assert.ok(ancestors.includes('https://preview.example.com'));
    assert.strictEqual(ancestors.includes('self'), false);
  } finally {
    if (prev === undefined) {
      delete process.env.ALLOWED_FRAME_ANCESTORS;
    } else {
      process.env.ALLOWED_FRAME_ANCESTORS = prev;
    }
  }
});
