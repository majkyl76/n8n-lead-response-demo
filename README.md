# Lead response workflow (n8n demo)

n8n is an open-source workflow automation tool, and this is a small demo of how
a new lead can be handled from start to finish: validated, checked for
duplicates, answered with an AI reply, sent an SMS, and logged. A separate
workflow catches a failed step and posts an alert, and it runs on dummy data
with no credentials.

## What you will see

![Workflow structure](docs/workflow-diagram.png)

The tests (picture generated from a real `npm test` run):

![npm test output](docs/tests.png)

To reproduce it:

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

These workflows were imported and run locally on 27 October 2026 on a
self-hosted n8n 2.44.7 instance on the same machine, using the n8n CLI. The
steps that worked:

1. Import `error-handler.json` first and read its id:
   ```
   n8n import:workflow --input=workflows/error-handler.json
   n8n list:workflow
   ```
2. In `lead-response.json`, replace the placeholder `ERROR_WORKFLOW_ID` in
   `settings.errorWorkflow` with that id, then import it:
   ```
   n8n import:workflow --input=workflows/lead-response.json
   ```
3. Activate **both** workflows. If the error handler is left inactive, n8n logs
   that the workflow is not active and cannot be executed when a lead-response
   run fails, and the alert path stays silent:
   ```
   n8n update:workflow --active=true --id=<lead-response id>
   n8n update:workflow --active=true --id=<error-handler id>
   ```
4. The HTTP Request nodes point at `https://example.invalid/...` placeholders.
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

- The endpoint URLs are placeholders (`https://example.invalid/...`) and no
  credentials are included.
- It was imported and run locally on 27 October 2026 on a self-hosted n8n
  2.44.7 instance on the same machine, using the n8n CLI, with dummy data posted
  to the webhook. In that run the HTTP Request nodes failed after their retries
  against `example.invalid`, as expected; a duplicate lead was skipped; a lead
  with a missing `phone` failed validation; and the error workflow fired once it
  had been activated.
- It has never been run against live AI, SMS, or alert services.
