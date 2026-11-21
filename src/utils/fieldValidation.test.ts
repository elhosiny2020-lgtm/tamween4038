import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectStrictFieldKind,
  normalizeToAsciiDigits,
  sanitizeNationalIdInput,
  sanitizePhoneInput,
  validateExactNationalId,
  validateExactPhone,
} from './fieldValidation';

test('normalizeToAsciiDigits converts Arabic-Indic numerals and strips non-digits', () => {
  assert.equal(normalizeToAsciiDigits('٠١٠١٢٣٤٥٦٧٨'), '01012345678');
  assert.equal(normalizeToAsciiDigits('290-05-14 1601119'), '29005141601119');
  assert.equal(normalizeToAsciiDigits('abc123def'), '123');
});

test('sanitizeNationalIdInput clamps strictly to 14 digits', () => {
  assert.equal(sanitizeNationalIdInput('290051416011199999'), '29005141601119');
  assert.equal(sanitizeNationalIdInput('٢٩٠٠٥١٤١٦٠١١١٩٨٨'), '29005141601119');
  assert.equal(sanitizeNationalIdInput('29005abc14160'), '2900514160');
});

test('sanitizePhoneInput clamps strictly to 11 digits', () => {
  assert.equal(sanitizePhoneInput('01012345678999'), '01012345678');
  assert.equal(sanitizePhoneInput('٠١٢٣٤٥٦٧٨٩٠١٢'), '01234567890');
});

test('validateExactNationalId strictly requires exactly 14 digits (no fewer, no more)', () => {
  assert.equal(validateExactNationalId('29005141601119').valid, true);
  assert.equal(validateExactNationalId('٢٩٠٠٥١٤١٦٠١١١٩').valid, true);
  assert.equal(validateExactNationalId('2900514160111').valid, false); // 13 digits
  assert.equal(validateExactNationalId('290051416011199').valid, false); // 15 digits
  assert.equal(validateExactNationalId('2900514160111a').valid, false); // non-digit
  assert.equal(validateExactNationalId('', { required: true }).valid, false);
  assert.equal(validateExactNationalId('', { required: false }).valid, true);
  assert.equal(validateExactNationalId('12345', { required: false }).valid, false);
});

test('validateExactPhone strictly requires exactly 11 digits (no fewer, no more)', () => {
  assert.equal(validateExactPhone('01012345678').valid, true);
  assert.equal(validateExactPhone('٠١١٩٩٨٨٧٧٦٦').valid, true);
  assert.equal(validateExactPhone('0101234567').valid, false); // 10 digits
  assert.equal(validateExactPhone('010123456789').valid, false); // 12 digits
  assert.equal(validateExactPhone('0101234567x').valid, false); // non-digit
  assert.equal(validateExactPhone('', { required: true }).valid, false);
  assert.equal(validateExactPhone('', { required: false }).valid, true);
  assert.equal(validateExactPhone('010123', { required: false }).valid, false);
});

test('detectStrictFieldKind automatically recognizes National ID and Phone fields across modules', () => {
  assert.equal(detectStrictFieldKind('nationalId', 'الرقم القومي'), 'nationalId');
  assert.equal(detectStrictFieldKind('headNationalId', 'الرقم القومي لرب الأسرة'), 'nationalId');
  assert.equal(detectStrictFieldKind('ownerId', 'الرقم القومى للمالك'), 'nationalId');
  assert.equal(detectStrictFieldKind('phone', 'رقم التليفون'), 'phone');
  assert.equal(detectStrictFieldKind('contactPhone', 'رقم الهاتف المحمول'), 'phone');
  assert.equal(detectStrictFieldKind('mobileNumber', 'الموبايل'), 'phone');
  assert.equal(detectStrictFieldKind('merchantName', 'اسم التاجر'), null);
  assert.equal(detectStrictFieldKind('posMachineNumber', 'رقم الماكينة'), null);
});
