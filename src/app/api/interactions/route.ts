import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";
import { CreateInteractionSchema } from "@/lib/validations/interaction";
import { extractMemoryProposals } from "@/lib/ai/ollama";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = CreateInteractionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;

    const interaction = await prisma.interaction.create({
      data: {
        contactId: data.contactId,
        type: data.type,
        summary: data.summary,
        outcome: data.outcome,
        occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
        createdByUserId: userId,
      },
    });

    // Update contact lastTouchAt
    await prisma.contact.update({
      where: { id: data.contactId },
      data: { lastTouchAt: new Date() },
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
                proposedBy: "ai:qwen2.5:7b-instruct",
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
