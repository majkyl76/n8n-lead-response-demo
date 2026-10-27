'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { validate } = require('../src/validate');
const { isDuplicate } = require('../src/dedupe');

function loadWorkflow(name) {
  const file = path.join(__dirname, '..', 'workflows', name);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const leadResponse = loadWorkflow('lead-response.json');
const errorHandler = loadWorkflow('error-handler.json');

// Runs a Code node's jsCode string the way n8n would: as a function body
// with $input and $getWorkflowStaticData as its only free variables.
function runCodeNode(jsCode, inputJson, staticData) {
  const fn = new Function('$input', '$getWorkflowStaticData', jsCode);
  const input = { first: () => ({ json: inputJson }) };
  return fn(input, () => staticData);
}

function getNodeCode(workflow, nodeName) {
  const node = workflow.nodes.find((n) => n.name === nodeName);
  assert.ok(node, 'node exists: ' + nodeName);
  return node.parameters.jsCode;
}

// Stand-in for n8n's $(nodeName) accessor: looks up a fixed item.json by
// node name from a plain map, the way $('Validate payload').item.json does.
function makeDollar(nodeOutputs) {
  return function (nodeName) {
    const json = nodeOutputs[nodeName];
    assert.ok(json, 'no stand-in data provided for node: ' + nodeName);
    return { item: { json } };
  };
}

// Evaluates an n8n `={{ ... }}` expression string the way n8n would, with
// $json and $ as its only free variables.
function runExpression(expr, { $json, $ }) {
  const match = expr.match(/^=\{\{([\s\S]*)\}\}$/);
  assert.ok(match, 'expression has the ={{ }} wrapper: ' + expr);
  const fn = new Function('$json', '$', 'return (' + match[1] + ');');
  return fn($json, $);
}

// Runs a Code node's jsCode string with $, $input and $getWorkflowStaticData
// as its free variables, for nodes that reach back to an earlier node via $().
function runCodeNodeWithDollar(jsCode, inputJson, nodeOutputs) {
  const fn = new Function('$input', '$getWorkflowStaticData', '$', jsCode);
  const input = { first: () => ({ json: inputJson }) };
  return fn(input, () => ({}), makeDollar(nodeOutputs));
}

const validatePayloadCode = getNodeCode(leadResponse, 'Validate payload');
const dedupeCode = getNodeCode(leadResponse, 'Dedupe');

const basePayload = {
  id: 'lead-1001',
  name: 'Jane Example',
  phone: '+15550100123',
  message: 'Hello'
};

test('Validate payload node code: accepts a valid payload, matching src/validate.js', () => {
  const expected = validate({ ...basePayload });
  // The webhook node nests the parsed body under `.body`, which is what
  // the Code node's `$input.first().json.body || ...` line expects.
  const result = runCodeNode(validatePayloadCode, { body: { ...basePayload } });
  assert.deepStrictEqual(result, [{ json: expected }]);
});

for (const field of ['id', 'name', 'phone', 'message']) {
  test('Validate payload node code: rejects a payload missing ' + field + ', matching src/validate.js', () => {
    const payload = { ...basePayload };
    delete payload[field];

    let expectedMessage;
    try {
      validate(payload);
      assert.fail('expected validate() to throw');
    } catch (err) {
      expectedMessage = err.message;
    }

    assert.throws(() => runCodeNode(validatePayloadCode, { body: payload }), { message: expectedMessage });
  });
}

test('Dedupe node code: a new id is not a duplicate and is recorded, matching src/dedupe.js', () => {
  const srcStore = {};
  const srcResult = isDuplicate(srcStore, 'lead-1');

  const nodeStore = {};
  const nodeResult = runCodeNode(dedupeCode, { id: 'lead-1' }, nodeStore);

  assert.strictEqual(srcResult, false);
  assert.deepStrictEqual(nodeResult, [{ json: { id: 'lead-1' } }]);
  assert.deepStrictEqual(nodeStore.processedIds, srcStore.processedIds);
});

test('Dedupe node code: a repeated id is a duplicate, matching src/dedupe.js', () => {
  const srcStore = {};
  isDuplicate(srcStore, 'lead-1');
  const srcResult = isDuplicate(srcStore, 'lead-1');

  const nodeStore = {};
  runCodeNode(dedupeCode, { id: 'lead-1' }, nodeStore);
  const nodeResult = runCodeNode(dedupeCode, { id: 'lead-1' }, nodeStore);

  assert.strictEqual(srcResult, true);
  assert.deepStrictEqual(nodeResult, []);
});

test('Dedupe node code: a missing id throws, matching src/dedupe.js', () => {
  let expectedMessage;
  try {
    isDuplicate({}, '');
    assert.fail('expected isDuplicate() to throw');
  } catch (err) {
    expectedMessage = err.message;
  }

  assert.throws(() => runCodeNode(dedupeCode, { id: '' }, {}), { message: expectedMessage });
});

test('Send SMS jsonBody expression takes phone from Validate payload, not the Draft reply response', () => {
  const sendSmsNode = leadResponse.nodes.find((n) => n.name === 'Send SMS');
  assert.ok(sendSmsNode, 'node exists: Send SMS');

  const originalLead = { ...basePayload };
  // Send SMS's own input ($json) is whatever Draft reply's HTTP response was,
  // which replaces the item json and has no lead fields on it.
  const aiReplyResponse = { reply: 'Thanks for reaching out, Jane!' };

  const result = runExpression(sendSmsNode.parameters.jsonBody, {
    $json: aiReplyResponse,
    $: makeDollar({ 'Validate payload': originalLead, Dedupe: originalLead })
  });

  assert.deepStrictEqual(result, { to: originalLead.phone, body: aiReplyResponse.reply });
});

test('Log result code takes the lead id from Validate payload/Dedupe, not the Send SMS response', () => {
  const logResultCode = getNodeCode(leadResponse, 'Log result');

  const originalLead = { ...basePayload };
  // Log result's own input ($input/$json) is whatever Send SMS's HTTP
  // response was: an SMS-provider payload, not the lead.
  const smsResponse = { sid: 'SM123abc456', status: 'queued' };

  const result = runCodeNodeWithDollar(logResultCode, smsResponse, {
    'Validate payload': originalLead,
    Dedupe: originalLead
  });

  assert.strictEqual(result[0].json.id, originalLead.id);
});

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
