# OpenClaw CRM Integration

This integration gives OpenClaw limited operational reads and proposal-only write
access. It is installed as the managed global `em-crm` skill so Nia and other
configured agents can use it. Every proposed change requires approval in the CRM.

## Security Model

- Summary and limited contact lookup are protected by `INTERNAL_SERVICE_TOKEN`.
- `INTERNAL_SERVICE_TOKEN` is strictly read-only: contact and interaction writes
  require a signed-in user or an approved proposal — the token cannot mutate CRM data.
- Proposals use a separate `OPENCLAW_WRITE_TOKEN` that cannot mutate CRM records directly.
- The token is stored in `~/.openclaw/secrets/em-crm-token.txt` with mode `0600`.
- The write token is stored separately in `~/.openclaw/secrets/em-crm-write-token.txt`.
- OpenClaw references that file through a file-backed SecretRef.
- The skill never prints the token and does not access PostgreSQL directly.
- Only five narrow action types can be proposed. Deletion, imports, roles, invoices,
  opportunities, bulk changes, and direct database access are unavailable.

## Install

Run from the OpenClaw host as the account that owns the gateway:

```bash
printf '%s\n%s\n' "$INTERNAL_SERVICE_TOKEN" "$OPENCLAW_WRITE_TOKEN" \
  | ./install-em-crm-skill.sh ./em-crm
```

Then restart the gateway and verify the skill:

```bash
./verify-em-crm-skill.sh
```

The installer backs up `~/.openclaw/openclaw.json` before modifying it.

## Usage

Ask Nia questions such as:

- "Give me today's CRM briefing."
- "Which follow-ups are overdue?"
- "How healthy is the opportunity pipeline?"
- "What should Shria and I prioritize today?"
- "Propose a high-priority follow-up task for Jane next Monday."

Open the CRM's **Agent Approvals** page to approve or reject proposals. A proposal
does not change CRM data until its status becomes `executed`.
