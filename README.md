# Lead response workflow (n8n demo)

n8n is an open-source workflow automation tool. This is a small portfolio
sample showing a reliable n8n workflow: a new lead arrives, an AI reply is
generated, an SMS is sent, and the result is logged. It includes a separate
error handling workflow.

This is a demo built with dummy data. It is not a production system.

## What you will see

```
npm test
```

Run that with Node 18 or newer (no dependencies to install) and you will see
19 passing tests. They prove the validation and dedupe logic behaves, and that
both workflow files are wired up correctly.

## What it is

Two n8n workflows plus the validation and dedupe logic extracted as plain
CommonJS functions so they can be unit tested.

- `workflows/lead-response.json` - the main workflow:
  Webhook (POST `/lead`) to Validate payload to Dedupe to AI reply to Send SMS
  to Log result.
- `workflows/error-handler.json` - an Error Trigger that formats a plain message
  (workflow name, failing node, error message, execution URL) and posts it to a
  placeholder alert endpoint standing in for Slack or email.
- `src/validate.js` and `src/dedupe.js` - the same logic as the Code nodes,
  importable and testable.
- `samples/lead.json` - an example payload with fake data.

## How to run the tests

Node 18 or newer is required (uses the built-in `node:test` runner). No
dependencies to install.

```
npm test
```

This runs `node --test`, which covers:

- a valid payload is accepted;
- each missing required field is rejected with a clear error;
- a duplicate lead id is skipped;
- both workflow JSON files load, every connection target refers to a real node,
  the HTTP Request nodes have `retryOnFail` enabled, and the main workflow has
  `settings.errorWorkflow` set.

## How to import into n8n

1. Open your n8n instance.
2. For each file in `workflows/`, use **Import from File** (or paste the JSON
   via the workflow menu) and select the file.
3. Import `error-handler.json` first, then open its settings to read its
   workflow id.
4. Open `lead-response.json` settings and set the **Error Workflow** to the
   imported error handler. The JSON ships with the placeholder id
   `ERROR_WORKFLOW_ID`, which you must replace with the real id.
5. The HTTP Request nodes point at `https://example.invalid/...` placeholders.
   Replace them with your real AI, SMS, and alert endpoints before use.

## Reliability notes

- **Validation** - the payload is checked for `id`, `name`, `phone`, and
  `message` before anything else runs. A missing field throws a clear error.
- **Dedupe** - processed lead ids are kept in workflow static data, so a lead id
  seen before is skipped rather than answered twice.
- **Retries** - the AI reply and Send SMS HTTP requests use `retryOnFail` with
  up to 3 tries and a 2000 ms wait between tries, so a transient failure does
  not drop the lead.
- **Error workflow** - the main workflow points at a dedicated error handler
  that reports failures to an alert endpoint.

## Honest note

- The endpoint URLs are placeholders (`https://example.invalid/...`) and the
  credentials are not included.
- This project has not been run against live AI, SMS, or alerting services. It
  is a structural and logic demo only.
- The workflow JSON has not been imported into a live n8n instance yet, so
  expect to tidy node settings on first import.
- Workflow static data only persists for active (production) executions, not
  manual test runs.
