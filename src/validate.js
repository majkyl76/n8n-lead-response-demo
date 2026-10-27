'use strict';

// Validate an incoming lead payload.
// Required fields: id, name, phone, message.
// Throws a clear Error naming the first missing field.
// Returns the payload unchanged when valid.
function validate(payload) {
  const required = ['id', 'name', 'phone', 'message'];

  if (payload === null || typeof payload !== 'object') {
    throw new Error('Invalid payload: expected an object');
  }

  for (const field of required) {
    const value = payload[field];
    if (value === undefined || value === null || value === '') {
      throw new Error('Missing required field: ' + field);
    }
  }

  return payload;
}

module.exports = { validate };
