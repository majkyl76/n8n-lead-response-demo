# Import and run record

**Date:** 27 October 2026.
**n8n version:** 2.44.7 (from the installed package).

I imported both workflows into a local n8n instance and ran them with dummy
data, to check the wiring, validation, dedupe, retries and error path do what
the README says. No live reply, SMS or alert service was contacted, and no
credentials were used.

Two things changed after this run. The reply node was called something else
at the time, and I have since renamed it Draft reply. Its placeholder URL was
also renamed, so it now reads `https://example.invalid/reply`. The run used
the old path. Both are dummies that never resolve. Nothing else in the workflows was
touched, and the tables below use the new node name.

## Import

Import the error handler first and note its id:

```
n8n import:workflow --input=workflows/error-handler.json
n8n list:workflow
#   9SqsqKl2LsukLDVk|Error Handler
```

Put that id in place of the `ERROR_WORKFLOW_ID` placeholder in
`lead-response.json`'s `settings.errorWorkflow`, then import that:

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

With only Lead Response active, I posted three dummy payloads to the
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

All three calls returned HTTP 200 straight away (`responseMode: onReceived`).
The workflow itself ran in the background.

## What the executions showed

| Exec | Workflow      | Status  | Last node         | Meaning |
|------|---------------|---------|-------------------|---------|
| 1    | Lead Response | error   | Draft reply       | Valid lead: Webhook, Validate and Dedupe all ran; Draft reply failed after its 3 tries against the placeholder URL, as expected. |
| 2    | Lead Response | success | Dedupe            | Same lead id posted again: Dedupe detected the duplicate and returned no items, so the run stopped cleanly before Draft reply. |
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
| 4    | Lead Response | error  | Draft reply | Same expected failure against the placeholder URL. |
| 5    | Error Handler | error  | Send alert | Error Trigger received the failure, Format message built the alert text, and Send alert then failed on its own `example.invalid/alert` endpoint. |

## Result

Both workflows imported and ran. Webhook, Validate payload, Dedupe and the
error handler's Code node behaved as expected. The HTTP Request nodes failed
as expected, because `example.invalid` never resolves. The error workflow
fired end to end once it was activated alongside the main one.

The HTTP calls never reached a real endpoint, so nothing after them (Send
SMS, Log result) ran here. That part is covered by `test/workflows.test.js`
instead.
