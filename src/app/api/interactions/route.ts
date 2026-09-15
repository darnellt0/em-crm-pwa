import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { handleAuthError, requireRole } from "@/lib/auth/requireRole";
import { CreateInteractionSchema } from "@/lib/validations/interaction";
import { extractMemoryProposals } from "@/lib/ai/ollama";
import { advanceLastTouch } from "@/lib/interactions";

export async function POST(req: NextRequest) {
  try {
    // Session-only: agents log interactions via the approval queue's
    // log_interaction action, never by writing here directly.
    const { userId } = await requireRole("staff");
    const body = await req.json().catch(() => ({}));
    const parsed = CreateInteractionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;

    const occurredAt = data.occurredAt ? new Date(data.occurredAt) : new Date();
    if (occurredAt > new Date()) {
      return NextResponse.json({ ok: false, error: "Log completed activity only; use a task for future activity." }, { status: 400 });
    }
    const interaction = await prisma.$transaction(async (tx) => {
      const created = await tx.interaction.create({
      data: {
        contactId: data.contactId,
        type: data.type,
        summary: data.summary,
        outcome: data.outcome,
        occurredAt,
        createdByUserId: userId,
      },
      });
      await advanceLastTouch(tx, data.contactId, data.type, occurredAt);
      return created;
    });

    // Trigger AI memory extraction in background (non-blocking)
    if (data.summary) {
      extractMemoryProposals(data.summary)
        .then(async (proposals) => {
          if (proposals.length > 0) {
            await prisma.aiMemoryItem.createMany({
              data: proposals.map((p) => ({
                contactId: data.contactId,
                content: p.content,
                status: "proposed",
                isPinned: p.pin || false,
                proposedBy: `ai:${process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct"}`,
              })),
            });
          }
        })
        .catch((err) => {
          console.error("Memory extraction failed:", err);
        });
    }

    return NextResponse.json({ ok: true, interaction }, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}
