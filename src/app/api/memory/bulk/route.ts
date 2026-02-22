import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";
import { MemoryBulkActionSchema } from "@/lib/validations/bulk";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const parsed = MemoryBulkActionSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const { ids, action, reason, enqueueEmbedding, embeddingModel } = parsed.data;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      let updatedCount = 0;

      for (const id of ids) {
        const item = await tx.aiMemoryItem.findUnique({
          where: { id },
          select: { status: true },
        });
        if (!item) continue;

        if (action === "reject" && item.status !== "rejected") {
          await tx.aiMemoryItem.update({
            where: { id },
            data: {
              status: "rejected",
              reviewedByUserId: userId,
              reviewedAt: now,
              rejectionReason: reason ?? null,
              isPinned: false,
            },
          });
          updatedCount++;
          continue;
        }

        if (action === "approve" || action === "approve_pin") {
          if (item.status === "approved") continue;
          await tx.aiMemoryItem.update({
            where: { id },
            data: {
              status: "approved",
              reviewedByUserId: userId,
              reviewedAt: now,
              rejectionReason: null,
              isPinned: action === "approve_pin" ? true : undefined,
            },
          });

          if (enqueueEmbedding) {
            await tx.aiMemoryEmbedding.upsert({
              where: { memoryItemId: id },
              create: {
                memoryItemId: id,
                model: embeddingModel || "nomic-embed-text",
                embeddingStatus: "pending",
              },
              update: {
                model: embeddingModel || "nomic-embed-text",
                embeddingStatus: "pending",
                error: null,
              },
            });
          }
          updatedCount++;
        }
      }

      return { updatedCount };
    });

    return NextResponse.json({
      ok: true,
      ...result,
      skippedCount: ids.length - result.updatedCount,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
