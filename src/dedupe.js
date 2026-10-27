'use strict';

// Decide whether a lead id has already been processed.
// `store` stands in for n8n workflow static data: a plain object that
// persists between executions. The processed ids live on store.processedIds.
// Returns true when the id was seen before (caller should skip it).
// Records the id as processed when it is new.
function isDuplicate(store, id) {
  if (store === null || typeof store !== 'object') {
    throw new Error('Invalid store: expected an object');
  }
  if (id === undefined || id === null || id === '') {
    throw new Error('Missing lead id for dedupe');
  }

  if (!Array.isArray(store.processedIds)) {
    store.processedIds = [];
  }

  if (store.processedIds.includes(id)) {
    return true;
  }

  store.processedIds.push(id);
  return false;
}

module.exports = { isDuplicate };
