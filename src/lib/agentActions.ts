import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  AgentActionPayload,
  AgentActionPayloadSchema,
  AgentActionProposalSchema,
} from "@/lib/validations/agentAction";

const DEFAULT_EXPIRY_HOURS = 48;
const MAX_EXPIRY_DAYS = 7;
const MAX_PROPOSALS_PER_MINUTE = 20;

export class AgentActionError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

function contactIdFor(action: AgentActionPayload) {
  return "contactId" in action ? action.contactId ?? null : null;
}

function defaultExpiry(now: Date) {
  return new Date(now.getTime() + DEFAULT_EXPIRY_HOURS * 60 * 60 * 1000);
}

async function verifyReferences(action: AgentActionPayload) {
  const contactId = contactIdFor(action);
  if (!contactId) return;

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true },
  });
  if (!contact) {
    throw new AgentActionError("CONTACT_NOT_FOUND", "Contact not found", 400);
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * A reused idempotency key must carry the same payload as the stored
 * proposal — silently returning the old proposal would make the agent
 * believe its new, different proposal was queued.
 */
function assertSamePayload(stored: Prisma.JsonValue, incoming: unknown) {
  if (stableStringify(stored) !== stableStringify(incoming)) {
    throw new AgentActionError(
      "IDEMPOTENCY_CONFLICT",
      "Idempotency key was already used with a different payload; use a new key",
      409
    );
  }
}

export async function createAgentActionProposal(input: unknown) {
  const parsed = AgentActionProposalSchema.safeParse(input);
  if (!parsed.success) {
    throw new AgentActionError(
      "INVALID_PROPOSAL",
      JSON.stringify(parsed.error.flatten()),
      400
    );
  }

  const proposal = parsed.data;
  const existing = await prisma.agentActionRequest.findUnique({
    where: {
      agentId_idempotencyKey: {
        agentId: proposal.agentId,
        idempotencyKey: proposal.idempotencyKey,
      },
    },
    include: { contact: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
  if (existing) {
    assertSamePayload(existing.payload, proposal.action);
    return { action: existing, created: false };
  }

  const now = new Date();
  const recentCount = await prisma.agentActionRequest.count({
    where: {
      agentId: proposal.agentId,
      createdAt: { gte: new Date(now.getTime() - 60_000) },
    },
  });
  if (recentCount >= MAX_PROPOSALS_PER_MINUTE) {
    throw new AgentActionError(
      "RATE_LIMITED",
      "Too many proposals; retry in one minute",
      429
    );
  }

  const expiresAt = proposal.expiresAt ? new Date(proposal.expiresAt) : defaultExpiry(now);
  if (
    expiresAt <= now ||
    expiresAt.getTime() > now.getTime() + MAX_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  ) {
    throw new AgentActionError(
      "INVALID_EXPIRY",
      "Expiry must be in the future and no more than seven days away",
      400
    );
  }

  await verifyReferences(proposal.action);

  try {
    const action = await prisma.agentActionRequest.create({
      data: {
        agentId: proposal.agentId,
        actionType: proposal.action.actionType,
        payload: proposal.action as Prisma.InputJsonValue,
        rationale: proposal.rationale,
        idempotencyKey: proposal.idempotencyKey,
        contactId: contactIdFor(proposal.action),
        expiresAt,
      },
      include: { contact: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    return { action, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const action = await prisma.agentActionRequest.findUniqueOrThrow({
        where: {
          agentId_idempotencyKey: {
            agentId: proposal.agentId,
            idempotencyKey: proposal.idempotencyKey,
          },
        },
        include: { contact: { select: { id: true, firstName: true, lastName: true, email: true } } },
      });
      assertSamePayload(action.payload, proposal.action);
      return { action, created: false };
    }
    throw error;
  }
}

export async function expirePendingAgentActions() {
  return prisma.agentActionRequest.updateMany({
    where: { status: "pending", expiresAt: { lte: new Date() } },
    data: { status: "expired" },
  });
}

export async function executeAgentAction(
  tx: Prisma.TransactionClient,
  rawPayload: Prisma.JsonValue,
  reviewerUserId: string
): Promise<Prisma.InputJsonValue> {
  const parsed = AgentActionPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    throw new Error("Stored action payload is invalid");
  }

  const action = parsed.data;
  switch (action.actionType) {
    case "create_task": {
      const task = await tx.task.create({
        data: {
          contactId: action.contactId,
          ownerUserId: reviewerUserId,
          title: action.title,
          description: action.description,
          priority: action.priority,
          dueAt: action.dueAt ? new Date(action.dueAt) : undefined,
          source: "openclaw:nia",
        },
        select: { id: true, title: true },
      });
      return { entityType: "task", entityId: task.id, title: task.title };
    }
    case "log_interaction": {
      const occurredAt = action.occurredAt ? new Date(action.occurredAt) : new Date();
      const interaction = await tx.interaction.create({
        data: {
          contactId: action.contactId,
          type: action.type,
          summary: action.summary,
          outcome: action.outcome,
          occurredAt,
          createdByUserId: reviewerUserId,
        },
        select: { id: true, type: true },
      });
      await tx.contact.update({
        where: { id: action.contactId },
        data: { lastTouchAt: new Date() },
      });
      return { entityType: "interaction", entityId: interaction.id, type: interaction.type };
    }
    case "set_follow_up": {
      const contact = await tx.contact.update({
        where: { id: action.contactId },
        data: { nextFollowUpAt: new Date(action.nextFollowUpAt) },
        select: { id: true, nextFollowUpAt: true },
      });
      return {
        entityType: "contact",
        entityId: contact.id,
        nextFollowUpAt: contact.nextFollowUpAt?.toISOString() ?? null,
      };
    }
    case "update_lifecycle_stage": {
      const contact = await tx.contact.update({
        where: { id: action.contactId },
        data: { lifecycleStage: action.lifecycleStage },
        select: { id: true, lifecycleStage: true },
      });
      return {
        entityType: "contact",
        entityId: contact.id,
        lifecycleStage: contact.lifecycleStage,
      };
    }
    case "add_tags": {
      const existing = await tx.contact.findUniqueOrThrow({
        where: { id: action.contactId },
        select: { tags: true },
      });
      const tags = [...new Set([...existing.tags, ...action.tags])];
      const contact = await tx.contact.update({
        where: { id: action.contactId },
        data: { tags },
        select: { id: true, tags: true },
      });
      return { entityType: "contact", entityId: contact.id, tags: contact.tags };
    }
  }
}

export async function rejectAgentAction(id: string, reviewerUserId: string, reason: string) {
  const result = await prisma.agentActionRequest.updateMany({
    where: { id, status: "pending", expiresAt: { gt: new Date() } },
    data: {
      status: "rejected",
      reviewedByUserId: reviewerUserId,
      reviewedAt: new Date(),
      error: reason,
    },
  });
  if (result.count === 0) {
    throw new AgentActionError("NOT_PENDING", "Action is no longer pending", 409);
  }
}

export async function approveAndExecuteAgentAction(id: string, reviewerUserId: string) {
  const reviewedAt = new Date();
  try {
    return await prisma.$transaction(async (tx) => {
      const claimed = await tx.agentActionRequest.updateMany({
        where: { id, status: "pending", expiresAt: { gt: reviewedAt } },
        data: {
          status: "approved",
          reviewedByUserId: reviewerUserId,
          reviewedAt,
          error: null,
        },
      });
      if (claimed.count === 0) {
        throw new AgentActionError("NOT_PENDING", "Action is no longer pending", 409);
      }

      const action = await tx.agentActionRequest.findUniqueOrThrow({ where: { id } });
      const result = await executeAgentAction(tx, action.payload, reviewerUserId);
      return tx.agentActionRequest.update({
        where: { id },
        data: { status: "executed", result, executedAt: new Date() },
        include: {
          contact: { select: { id: true, firstName: true, lastName: true, email: true } },
          reviewer: { select: { id: true, name: true, email: true } },
        },
      });
    });
  } catch (error) {
    if (error instanceof AgentActionError) throw error;

    const message = error instanceof Error ? error.message : "Execution failed";
    await prisma.agentActionRequest.updateMany({
      where: { id, status: "pending" },
      data: {
        status: "failed",
        reviewedByUserId: reviewerUserId,
        reviewedAt,
        error: message.slice(0, 2000),
      },
    });
    throw new AgentActionError(
      "EXECUTION_FAILED",
      "The action could not be executed; no CRM change was applied",
      409
    );
  }
}

export function summarizeAgentAction(rawPayload: Prisma.JsonValue) {
  const parsed = AgentActionPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) return "Invalid action payload";
  const action = parsed.data;

  switch (action.actionType) {
    case "create_task":
      return `Create ${action.priority} priority task: ${action.title}`;
    case "log_interaction":
      return `Log ${action.type} interaction: ${action.summary}`;
    case "set_follow_up":
      return `Set follow-up for ${new Date(action.nextFollowUpAt).toLocaleString("en-US")}`;
    case "update_lifecycle_stage":
      return `Change lifecycle stage to ${action.lifecycleStage}`;
    case "add_tags":
      return `Add tags: ${action.tags.join(", ")}`;
  }
}
