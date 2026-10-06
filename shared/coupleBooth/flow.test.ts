import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canTransition } from './stateMachine';
import { isExactSelection, toggleShotSelection } from './selection';
import { approvalsAfterSelectionChange } from './selection';

describe('couple booth flow (mock)', () => {
  it('runs invite → accept → capture → review → approve → complete transitions', () => {
    const path = [
      ['invited', 'accepted'],
      ['accepted', 'connecting'],
      ['connecting', 'ready'],
      ['ready', 'capturing'],
      ['capturing', 'review'],
      ['review', 'finalizing'],
      ['finalizing', 'completed'],
    ] as const;
    for (const [from, to] of path) assert.equal(canTransition(from, to), true);
  });

  it('supports decline and reconnect-loss fallbacks', () => {
    assert.equal(canTransition('invited', 'declined'), true);
    assert.equal(canTransition('capturing', 'cancelled'), true);
    assert.equal(canTransition('review', 'finalizing'), true);
  });

  it('resets approvals when host changes selection during review', () => {
    let selected: number[] = [];
    selected = toggleShotSelection(selected, 1);
    selected = toggleShotSelection(selected, 2);
    selected = toggleShotSelection(selected, 3);
    selected = toggleShotSelection(selected, 4);
    assert.equal(isExactSelection(selected), true);
    const approvals = approvalsAfterSelectionChange();
    assert.equal(approvals.hostApproved, false);
    assert.equal(approvals.guestApproved, false);
  });
});
