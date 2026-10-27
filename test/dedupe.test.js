'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { isDuplicate } = require('../src/dedupe');

test('treats a new id as not a duplicate and records it', () => {
  const store = {};
  assert.strictEqual(isDuplicate(store, 'lead-1'), false);
  assert.deepStrictEqual(store.processedIds, ['lead-1']);
});

test('treats a repeated id as a duplicate', () => {
  const store = {};
  isDuplicate(store, 'lead-1');
  assert.strictEqual(isDuplicate(store, 'lead-1'), true);
});

test('keeps distinct ids separate', () => {
  const store = {};
  assert.strictEqual(isDuplicate(store, 'lead-1'), false);
  assert.strictEqual(isDuplicate(store, 'lead-2'), false);
  assert.deepStrictEqual(store.processedIds, ['lead-1', 'lead-2']);
});

test('throws when the id is missing', () => {
  assert.throws(() => isDuplicate({}, ''), { message: 'Missing lead id for dedupe' });
});
