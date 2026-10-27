# Import and run record

**Date:** 27 October 2026.
**n8n version:** 2.44.7 (from the installed package).

Both workflows were imported into a local n8n instance and run with dummy
data to confirm the wiring, validation, dedupe, retries and error path all
behave as documented. No live AI, SMS or alert service was contacted, and no
credentials were used.

## Import

Import the error handler first and read its id:

```
n8n import:workflow --input=workflows/error-handler.json
n8n list:workflow
#   9SqsqKl2LsukLDVk|Error Handler
```

Put that id in place of the `ERROR_WORKFLOW_ID` placeholder in
`lead-response.json`'s `settings.errorWorkflow`, then import it:

```
n8n import:workflow --input=workflows/lead-response.json
n8n list:workflow
#   9SqsqKl2LsukLDVk|Error Handler
#   QM69QbTAYvDLQsVf|Lead Response
```

## Activate and run

```
n8n update:workflow --active=true --id=QM69QbTAYvDLQsVf
n8n start
```

With only Lead Response active, three dummy payloads were posted to the
webhook:

```
curl -X POST http://localhost:5678/webhook/lead -H 'Content-Type: application/json' -d @samples/lead.json
#   {"message":"Workflow was started"}

# same payload again, to exercise dedupe
curl -X POST http://localhost:5678/webhook/lead -H 'Content-Type: application/json' -d @samples/lead.json
#   {"message":"Workflow was started"}

# a payload missing "phone"
curl -X POST http://localhost:5678/webhook/lead -H 'Content-Type: application/json' -d '{"id":"lead-2002","name":"No Phone","message":"missing phone field"}'
#   {"message":"Workflow was started"}
```

All three calls returned HTTP 200 straight away
(`responseMode: onReceived`), with the workflow itself running
asynchronously.

## What the executions showed

| Exec | Workflow      | Status  | Last node         | Meaning |
|------|---------------|---------|-------------------|---------|
| 1    | Lead Response | error   | AI reply          | Valid lead: Webhook, Validate and Dedupe all ran; the HTTP node failed after 3 retries against `https://example.invalid/ai`, as expected. |
| 2    | Lead Response | success | Dedupe            | Same lead id posted again: Dedupe detected the duplicate and returned no items, so the run stopped cleanly before reaching AI reply. |
| 3    | Lead Response | error   | Validate payload  | Lead missing `phone`: the Code node threw `Missing required field: phone`, as designed. |

At this point the error workflow had not fired. The n8n log showed:

```
Calling Error Workflow for "QM69QbTAYvDLQsVf". Workflow "9SqsqKl2LsukLDVk" is not active and cannot be executed
```

n8n only calls the configured error workflow if that workflow is itself
active. `error-handler.json` ships with `"active": false`, so it needs to be
activated explicitly alongside the main workflow.

With the Error Handler also activated and a fresh lead id posted:

```
n8n update:workflow --active=true --id=9SqsqKl2LsukLDVk
```

| Exec | Workflow      | Status | Last node  | Meaning |
|------|---------------|--------|------------|---------|
| 4    | Lead Response | error  | AI reply   | Same expected failure against `example.invalid/ai`. |
| 5    | Error Handler | error  | Send alert | Error Trigger received the failure, Format message built the alert text, and Send alert then failed on its own `example.invalid/alert` endpoint. |

## Result

Both workflows import and run correctly. Webhook, Validate payload, Dedupe
and the error handler's Code node all behave as expected; the HTTP Request
nodes fail as expected against the unresolvable `example.invalid`
placeholders; and the error workflow fires end to end once it is activated
alongside the main workflow.

Because the HTTP calls never reach a real endpoint here, the data flow after
those nodes (Send SMS, Log result) is covered by `test/workflows.test.js`
rather than by this live run.
