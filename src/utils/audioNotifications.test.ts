import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldPlayAlertSound, playGentleAlertChime } from './audioNotifications';

test('shouldPlayAlertSound respects notifySound mute configuration', () => {
  assert.equal(shouldPlayAlertSound(undefined), true);
  assert.equal(shouldPlayAlertSound(null), true);
  assert.equal(shouldPlayAlertSound({ notifySound: true }), true);
  assert.equal(shouldPlayAlertSound({ notifySound: false }), false);
});

test('playGentleAlertChime returns false when muted or outside browser audio context', () => {
  assert.equal(playGentleAlertChime({ muted: true, type: 'license' }), false);
  assert.equal(playGentleAlertChime({ muted: false, type: 'debt' }), false);
});
