# Local n8n import and run evidence

**Date:** 2026-10-27

Both workflows were imported into a local self-hosted n8n and run with dummy
data via the n8n CLI. This file records the exact commands, trimmed real
outputs and the five executions that ran, so the claims in the README can be
reproduced.

**n8n version:** 2.44.7. The version string comes from the installed package:
`node_modules/n8n/package.json` reports `"version": "2.44.7"`.

To avoid touching an n8n instance that was already running, a throwaway
instance was used on its own ports and user folder. No real service was
contacted, no credentials were read, and the repo files were never edited (all
edits were made on copies).

## Environment overrides used

```bash
# wrapper
source env.sh
export N8N_USER_FOLDER=.../data-demo-import   # throwaway folder
export N8N_PORT=5690
export N8N_HOST=127.0.0.1
export N8N_RUNNERS_BROKER_PORT=5691           # see note below
```

**Note - one extra override was required.** With only the first overrides, the
throwaway instance started the HTTP server but then died immediately:

```
n8n ready on ::, port 5690
n8n Task Broker's port 5679 is already in use. Do you have another instance of n8n running already?
```

`env.sh` sets `N8N_RUNNERS_ENABLED=true`. The task runner broker defaults to
port 5679, which the existing instance already held, so a second instance could
not start without a free broker port. Setting `N8N_RUNNERS_BROKER_PORT=5691`
was the only addition. This is a collision between two instances, not a problem
with the workflows.

## Commands run (exact) and real outputs (trimmed)

### 1. Setup

```bash
mkdir -p .../data-demo-import
cp .../workflows/error-handler.json  /tmp/error-handler.json
cp .../workflows/lead-response.json  /tmp/lead-response.json
cp .../samples/lead.json             /tmp/lead.json
```

### 2. Import the error handler first, read its id

```bash
source /tmp/demoenv.sh
n8n import:workflow --input=/tmp/error-handler.json
#   Importing 1 workflows...
#   Successfully imported 1 workflow.

n8n list:workflow
#   9SqsqKl2LsukLDVk|Error Handler
```

### 3. Put that id in place of `ERROR_WORKFLOW_ID` in the lead-response copy, import it

```bash
# /tmp/lead-response.json edited only (repo file untouched):
#   settings.errorWorkflow:  "ERROR_WORKFLOW_ID"  ->  "9SqsqKl2LsukLDVk"
n8n import:workflow --input=/tmp/lead-response.json
#   Successfully imported 1 workflow.

n8n list:workflow
#   9SqsqKl2LsukLDVk|Error Handler
#   QM69QbTAYvDLQsVf|Lead Response
```

### 4. Activate

```bash
n8n update:workflow --active=true --id=QM69QbTAYvDLQsVf
n8n list:workflow --active=true
#   QM69QbTAYvDLQsVf|Lead Response
```

(The CLI prints a `publish:workflow` suggestion and "restart n8n for changes to
take effect"; activation was done before starting the instance, so it took
effect on boot.)

### 5. Start throwaway n8n (background) and POST the dummy payloads

```bash
nohup n8n start >> /tmp/n8n-demo.log 2>&1 &
#   Registered runner "JS Task Runner" ...
#   Editor is now accessible via: http://127.0.0.1:5690
#   Finished building workflow dependency index. Processed 0 draft, 1 published workflows.

# POST #1 - valid lead (samples/lead.json, id=lead-1001)
curl -X POST http://127.0.0.1:5690/webhook/lead -H 'Content-Type: application/json' -d @/tmp/lead.json
#   {"message":"Workflow was started"}  HTTP 200

# POST #2 - same payload again (dedupe check)
curl -X POST http://127.0.0.1:5690/webhook/lead ... -d @/tmp/lead.json
#   {"message":"Workflow was started"}  HTTP 200

# POST #3 - invalid payload (missing "phone")
curl -X POST http://127.0.0.1:5690/webhook/lead ... \
     -d '{"id":"lead-2002","name":"No Phone","message":"missing phone field"}'
#   {"message":"Workflow was started"}  HTTP 200
```

All three webhook calls returned HTTP 200 `{"message":"Workflow was started"}`
(`responseMode:onReceived`, so the webhook acks immediately and the workflow
runs async).

## Executions that ran

Read from the throwaway instance database (`data-demo-import/.n8n/database.sqlite`)
via python3.

First round (only Lead Response active, as the task's steps produce):

| Exec | Workflow      | Status  | Failing / last node | Meaning |
|------|---------------|---------|---------------------|---------|
| 1    | Lead Response | error   | AI reply            | POST #1: Webhook, Validate and Dedupe all ran; failed at the HTTP node to `https://example.invalid/ai` after its 3 retries. |
| 2    | Lead Response | success | Dedupe              | POST #2: duplicate `lead-1001` detected; Dedupe returned `[]` and the run stopped cleanly (never reached AI reply). Dedupe works. |
| 3    | Lead Response | error   | Validate payload    | POST #3: Code node threw `Missing required field: phone [line 15]` as designed. |

HTTP-node error text captured for exec 1 (and later exec 4):
`NodeApiError: The connection to the server was closed unexpectedly, perhaps it is offline...`
- i.e. `https://example.invalid` does not resolve, exactly as expected.

The error workflow did not fire in this first round. The n8n log showed, twice
(once per failed execution):

```
Calling Error Workflow for "QM69QbTAYvDLQsVf". Workflow "9SqsqKl2LsukLDVk" is not active and cannot be executed
```

So n8n tried to invoke the error workflow on each failure, but refused because
the Error Handler workflow was not active. The target of `settings.errorWorkflow`
must be an active workflow. `error-handler.json` ships with `"active": false`,
and the demo's activation step only activates Lead Response, so as shipped the
error alerting never runs.

To confirm this was the only blocker, the throwaway instance was stopped, the
Error Handler was also activated
(`update:workflow --active=true --id=9SqsqKl2LsukLDVk`), the instance was
restarted, and a fresh valid lead was POSTed (`id=lead-3003`, a new id to pass
dedupe):

| Exec | Workflow      | Status  | Mode   | Last node  | Meaning |
|------|---------------|---------|--------|------------|---------|
| 4    | Lead Response | error   | webhook| AI reply   | Same failure at `example.invalid/ai` after retries. |
| 5    | Error Handler | error   | error  | Send alert | Error workflow fired. Error Trigger -> Format message (Code node, produced `"Workflow failed: Lead Response"`) -> Send alert, which then failed on its own `https://example.invalid/alert`. |

So once the Error Handler is active the error path works end-to-end: the Error
Trigger receives the failure, the Code node formats the alert, and only the
final HTTP POST fails (because it too targets `example.invalid`, which is
expected with no real service).

## Cleanup

The throwaway instance was stopped (ports 5690/5691 closed). The pre-existing
instance remained running and untouched throughout. No repo file was modified.

**Result:** both workflows import and execute; Webhook, Validate, Dedupe and the
Code nodes all work (dedupe and validation behave correctly), the HTTP nodes
fail as expected against the unresolvable `example.invalid`, and the error
workflow does fire, but only after the Error Handler workflow is activated.
