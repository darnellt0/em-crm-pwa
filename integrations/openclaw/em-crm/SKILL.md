---
name: em-crm
description: Read Elevated Movements CRM priorities and propose controlled CRM changes for human approval.
metadata: {"openclaw":{"requires":{"bins":["curl","jq"],"env":["EM_CRM_TOKEN"]},"primaryEnv":"EM_CRM_TOKEN"}}
---

# Elevated Movements CRM

Use this skill when the user asks about CRM health, leads, pipeline, follow-ups, tasks, priorities, or a daily business briefing.

Run:

```bash
{baseDir}/scripts/ops-summary.sh
```

Interpret the returned JSON as a current operational snapshot.

- Lead with overdue tasks and follow-ups, then tasks and follow-ups due today.
- Report stale opportunities and pipeline totals when relevant.
- Distinguish zero values from unavailable data.
- Mention the snapshot timestamp when freshness matters.
- Do not claim access to full contact records, notes, or memory bodies.
- Do not call undocumented CRM endpoints or attempt direct database access.
- Never print, log, or reveal `EM_CRM_TOKEN`.

## Find a contact

Before proposing a contact-specific action, resolve the correct contact ID:

```bash
{baseDir}/scripts/contact-search.sh 'name, email, or phone'
```

If the result is missing or ambiguous, ask the user which contact they mean. Never guess.

## Propose a change

The proposal API never applies a change. Darnell or Shria must approve it in the CRM's Agent Approvals queue.

Pipe exactly one allowed action object to the helper. Supply a stable, unique idempotency key and a concise rationale:

```bash
printf '%s' '{"actionType":"create_task","contactId":"CONTACT_UUID","title":"Follow up","priority":"high","dueAt":"2026-07-27T17:00:00.000Z"}' \
  | {baseDir}/scripts/propose-action.sh 'nia:task:stable-unique-key' 'The user asked Nia to schedule this follow-up.'
```

Allowed action shapes:

```json
{"actionType":"create_task","contactId":"optional UUID","title":"required","description":"optional","priority":"low|medium|high|urgent","dueAt":"optional ISO timestamp"}
{"actionType":"log_interaction","contactId":"UUID","type":"call|email|meeting|note|sms|other","summary":"required","outcome":"optional","occurredAt":"optional ISO timestamp"}
{"actionType":"set_follow_up","contactId":"UUID","nextFollowUpAt":"future ISO timestamp"}
{"actionType":"update_lifecycle_stage","contactId":"UUID","lifecycleStage":"lead|prospect|opportunity|customer|subscriber|evangelist|other"}
{"actionType":"add_tags","contactId":"UUID","tags":["one or more tags"]}
```

After submission, say that the proposal is awaiting approval and report its action ID. Do not say that the CRM changed.

Check a proposal later with:

```bash
{baseDir}/scripts/action-status.sh 'ACTION_UUID'
```

Only status `executed` means the change was applied. Never propose deletion, merges, imports, invoice or opportunity changes, user/role changes, bulk changes, or arbitrary API/database operations. Never print, log, or reveal the write token.
