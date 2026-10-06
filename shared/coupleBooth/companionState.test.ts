import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createBoothCompanionStateEvent, isNewerBoothCompanionStateEvent, normalizeBoothCompanionPlacements } from './companionState';
import { encodeBoothEvent, parseBoothEvent } from './protocol';

const placement = { petId: 'pet-a', x: 0.2, y: 0.94, scale: 0.17, flipX: false, zIndex: 0 };
const makeEvent = (version = 1, sessionId = 'session-a') => createBoothCompanionStateEvent({ sessionId, companions: [placement], eventId: `event-${version}`, selectedBy: 'user-a', selectedAt: version, version });

describe('Couple Booth companion session state', () => {
  it('normalizes coordinates and deduplicates stable pet ids', () => {
    const result = normalizeBoothCompanionPlacements([{ ...placement, x: -2, scale: 2 }, { ...placement, x: 0.8 }]);
    assert.equal(result.length, 1); assert.equal(result[0]?.x, 0.04); assert.equal(result[0]?.scale, 0.35);
  });
  it('round-trips its independent reliable protocol contract', () => {
    const parsed = parseBoothEvent(encodeBoothEvent(makeEvent()));
    assert.equal(parsed?.type, 'companion_state_changed');
    if (parsed?.type === 'companion_state_changed') assert.deepEqual(parsed.companions, [placement]);
  });
  it('accepts newer and ignores stale, duplicate, and wrong-session events', () => {
    const current = makeEvent(2);
    assert.equal(isNewerBoothCompanionStateEvent(makeEvent(3), current), true);
    assert.equal(isNewerBoothCompanionStateEvent(makeEvent(1), current), false);
    assert.equal(isNewerBoothCompanionStateEvent(current, current), false);
    assert.equal(isNewerBoothCompanionStateEvent(makeEvent(3, 'session-b'), current), false);
  });
});
