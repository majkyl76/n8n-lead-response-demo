'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function loadWorkflow(name) {
  const file = path.join(__dirname, '..', 'workflows', name);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const leadResponse = loadWorkflow('lead-response.json');
const errorHandler = loadWorkflow('error-handler.json');

for (const [label, workflow] of [['lead-response', leadResponse], ['error-handler', errorHandler]]) {
  test(label + ': every connection target refers to a real node', () => {
    const nodeNames = new Set(workflow.nodes.map((n) => n.name));
    for (const [source, connection] of Object.entries(workflow.connections)) {
      assert.ok(nodeNames.has(source), 'connection source exists: ' + source);
      for (const outputs of Object.values(connection)) {
        for (const output of outputs) {
          for (const link of output) {
            assert.ok(nodeNames.has(link.node), 'connection target exists: ' + link.node);
          }
        }
      }
    }
  });

  test(label + ': HTTP Request nodes have retryOnFail true', () => {
    const httpNodes = workflow.nodes.filter((n) => n.type === 'n8n-nodes-base.httpRequest');
    assert.ok(httpNodes.length > 0, 'has at least one HTTP Request node');
    for (const node of httpNodes) {
      assert.strictEqual(node.retryOnFail, true, node.name + ' retryOnFail');
      assert.strictEqual(node.maxTries, 3, node.name + ' maxTries');
      assert.strictEqual(node.waitBetweenTries, 2000, node.name + ' waitBetweenTries');
    }
  });
}

test('lead-response: settings.errorWorkflow is set', () => {
  assert.ok(leadResponse.settings, 'has settings');
  assert.ok(
    typeof leadResponse.settings.errorWorkflow === 'string' && leadResponse.settings.errorWorkflow.length > 0,
    'errorWorkflow is a non-empty string'
  );
});
