import { describe, expect, it } from "vitest";
import {
  AgentActionDecisionSchema,
  AgentActionPayloadSchema,
  AgentActionProposalSchema,
} from "./agentAction";

const contactId = "d2891351-95e3-4c87-a734-49f857260b7e";

describe("AgentActionPayloadSchema", () => {
  it.each([
    {
      actionType: "create_task",
      contactId,
      title: "Call Jane",
      priority: "high",
    },
    {
      actionType: "log_interaction",
      contactId,
      type: "call",
      summary: "Discussed the next cohort.",
    },
    {
      actionType: "set_follow_up",
      contactId,
      nextFollowUpAt: "2099-01-01T12:00:00.000Z",
    },
    {
      actionType: "update_lifecycle_stage",
      contactId,
      lifecycleStage: "prospect",
    },
    { actionType: "add_tags", contactId, tags: ["VIP", "vip", "Cohort-2"] },
  ])("accepts allowed action $actionType", (action) => {
    expect(AgentActionPayloadSchema.safeParse(action).success).toBe(true);
  });

  it("rejects action types outside the allowlist", () => {
    expect(
      AgentActionPayloadSchema.safeParse({ actionType: "delete_contact", contactId }).success
    ).toBe(false);
  });

  it("rejects extra fields that could smuggle an unreviewed change", () => {
    expect(
      AgentActionPayloadSchema.safeParse({
        actionType: "add_tags",
        contactId,
        tags: ["vip"],
        lifecycleStage: "customer",
      }).success
    ).toBe(false);
  });

  it("still parses stored follow-up payloads whose date has since passed", () => {
    // Stored payloads are re-parsed at summary/execution time; a proposal that
    // was valid when submitted must not become unexecutable once the date passes.
    expect(
      AgentActionPayloadSchema.safeParse({
        actionType: "set_follow_up",
        contactId,
        nextFollowUpAt: "2020-01-01T12:00:00.000Z",
      }).success
    ).toBe(true);
  });

  it("rejects new follow-up proposals dated in the past", () => {
    expect(
      AgentActionProposalSchema.safeParse({
        idempotencyKey: "nia-followup-1",
        rationale: "Contact asked for a check-in call.",
        action: {
          actionType: "set_follow_up",
          contactId,
          nextFollowUpAt: "2020-01-01T12:00:00.000Z",
        },
      }).success
    ).toBe(false);
  });

  it("normalizes and deduplicates tags", () => {
    const result = AgentActionPayloadSchema.parse({
      actionType: "add_tags",
      contactId,
      tags: ["VIP", "vip", " Cohort-2 "],
    });
    expect(result).toMatchObject({ tags: ["vip", "cohort-2"] });
  });
});

describe("agent proposal and decision validation", () => {
  it("requires a stable idempotency key and rationale", () => {
    expect(
      AgentActionProposalSchema.safeParse({
        idempotencyKey: "nia:task:20260725:1",
        rationale: "The user explicitly requested this task.",
        action: { actionType: "create_task", title: "Follow up" },
      }).success
    ).toBe(true);
    expect(
      AgentActionProposalSchema.safeParse({
        idempotencyKey: "short",
        rationale: "No",
        action: { actionType: "create_task", title: "Follow up" },
      }).success
    ).toBe(false);
  });

  it("requires a rejection reason", () => {
    expect(AgentActionDecisionSchema.safeParse({ decision: "approve" }).success).toBe(true);
    expect(AgentActionDecisionSchema.safeParse({ decision: "reject" }).success).toBe(false);
    expect(
      AgentActionDecisionSchema.safeParse({ decision: "reject", reason: "Wrong contact" }).success
    ).toBe(true);
  });
});
