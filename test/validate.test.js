'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../src/validate');

const base = {
  id: 'lead-1001',
  name: 'Jane Example',
  phone: '+15550100123',
  message: 'Hello'
};

test('accepts a valid payload', () => {
  assert.deepStrictEqual(validate({ ...base }), base);
});

for (const field of ['id', 'name', 'phone', 'message']) {
  test('rejects a payload missing ' + field, () => {
    const payload = { ...base };
    delete payload[field];
    assert.throws(() => validate(payload), {
      message: 'Missing required field: ' + field
    });
  });

  test('rejects a payload with empty ' + field, () => {
    const payload = { ...base, [field]: '' };
    assert.throws(() => validate(payload), {
      message: 'Missing required field: ' + field
    });
  });
}

test('rejects a non-object payload', () => {
  assert.throws(() => validate(null), { message: 'Invalid payload: expected an object' });
});
