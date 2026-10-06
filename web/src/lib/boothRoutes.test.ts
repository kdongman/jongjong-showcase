import assert from 'node:assert/strict';
import test from 'node:test';
import { safeBoothReturnPath } from './boothRoutes';

test('keeps only internal Booth auth return paths', () => {
  assert.equal(safeBoothReturnPath('/booth'), '/booth');
  assert.equal(
    safeBoothReturnPath('/booth/5cae74e5-d59d-462e-97df-27cdbaf41d37'),
    '/booth/5cae74e5-d59d-462e-97df-27cdbaf41d37',
  );
  assert.equal(safeBoothReturnPath('https://attacker.example'), '/booth');
  assert.equal(safeBoothReturnPath('//attacker.example'), '/booth');
  assert.equal(safeBoothReturnPath('/booth/../login'), '/booth');
});
