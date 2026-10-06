import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyMediaError } from './mediaConnectionState';

test('classifies browser media permission failures without treating them as room failures', () => {
  assert.equal(classifyMediaError({ name: 'NotAllowedError' }), 'permission-denied');
  assert.equal(classifyMediaError({ name: 'PermissionDeniedError' }), 'permission-denied');
  assert.equal(classifyMediaError({ name: 'NotFoundError' }), 'device-not-found');
  assert.equal(classifyMediaError({ name: 'NotReadableError' }), 'device-in-use');
});

test('keeps unknown media failures distinct from permission denial', () => {
  assert.equal(classifyMediaError({ name: 'AbortError' }), 'connection-error');
  assert.equal(classifyMediaError(new Error('network unavailable')), 'connection-error');
});

test('labels a publisher transport failure without calling it a network failure', () => {
  assert.equal(
    classifyMediaError(new Error('could not establish Publisher connection, state: closed')),
    'publisher-connection-error',
  );
});

test('metadata update failure is not misclassified as camera publish or network failure', () => {
  const error = new Error('does not have permission to update own metadata');
  assert.equal(classifyMediaError(error, 'participant-metadata-update'), 'participant-state-error');
});
