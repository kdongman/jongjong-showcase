import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  approvalsAfterSelectionChange,
  canSelectMore,
  isExactSelection,
  moveSelectedShotDown,
  moveSelectedShotUp,
  selectionOrderLabel,
  toggleShotSelection,
} from './selection';

describe('couple booth selection', () => {
  it('assigns order 1-4 and blocks a 5th selection', () => {
    let selected: number[] = [];
    selected = toggleShotSelection(selected, 1);
    selected = toggleShotSelection(selected, 3);
    selected = toggleShotSelection(selected, 5);
    selected = toggleShotSelection(selected, 8);
    assert.deepEqual(selected, [1, 3, 5, 8]);
    assert.equal(selectionOrderLabel(selected, 5), 3);
    assert.equal(canSelectMore(selected), false);
    assert.deepEqual(toggleShotSelection(selected, 2), [1, 3, 5, 8]);
    assert.equal(isExactSelection(selected), true);
  });

  it('reorders labels after deselect', () => {
    let selected = [1, 3, 5, 8];
    selected = toggleShotSelection(selected, 3);
    assert.deepEqual(selected, [1, 5, 8]);
    assert.equal(selectionOrderLabel(selected, 5), 2);
    assert.equal(selectionOrderLabel(selected, 8), 3);
  });

  it('moves selection order up and down', () => {
    assert.deepEqual(moveSelectedShotUp([1, 3, 5, 8], 5), [1, 5, 3, 8]);
    assert.deepEqual(moveSelectedShotDown([1, 3, 5, 8], 3), [1, 5, 3, 8]);
  });

  it('resets approvals when selection changes', () => {
    assert.deepEqual(approvalsAfterSelectionChange(), { hostApproved: false, guestApproved: false });
  });
});
