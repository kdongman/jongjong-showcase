import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  boothStageConnectionCopy,
  resolveBoothStageConnectionUx,
} from './boothStageConnection';

describe('boothStageConnection', () => {
  it('marks preparing until local media is ready', () => {
    assert.equal(
      resolveBoothStageConnectionUx({
        sessionStatus: 'accepted',
        mediaState: 'requesting-permission',
        livekitConnection: 'disconnected',
        remoteConnected: false,
      }),
      'preparing',
    );
  });

  it('waits for partner when local is ready and remote is absent', () => {
    assert.equal(
      resolveBoothStageConnectionUx({
        sessionStatus: 'invited',
        mediaState: 'permission-intro',
        livekitConnection: 'disconnected',
        remoteConnected: false,
        localPreviewReady: true,
      }),
      'waiting_partner',
    );
    assert.equal(
      resolveBoothStageConnectionUx({
        sessionStatus: 'accepted',
        mediaState: 'connected',
        livekitConnection: 'connected',
        remoteConnected: false,
      }),
      'waiting_partner',
    );
  });

  it('becomes connected only when both sides are live', () => {
    assert.equal(
      resolveBoothStageConnectionUx({
        sessionStatus: 'ready',
        mediaState: 'connected',
        livekitConnection: 'connected',
        remoteConnected: true,
      }),
      'connected',
    );
  });

  it('surfaces reconnecting and error states', () => {
    assert.equal(
      resolveBoothStageConnectionUx({
        sessionStatus: 'ready',
        mediaState: 'connected',
        livekitConnection: 'reconnecting',
        remoteConnected: true,
      }),
      'reconnecting',
    );
    assert.equal(
      resolveBoothStageConnectionUx({
        sessionStatus: 'accepted',
        mediaState: 'permission-denied',
        livekitConnection: 'disconnected',
        remoteConnected: false,
      }),
      'error',
    );
  });

  it('uses waiting copy without a refresh CTA', () => {
    const copy = boothStageConnectionCopy('waiting_partner');
    assert.match(copy.title, /기다리고/);
    assert.match(String(copy.detail), /들어오면/);
  });
});
