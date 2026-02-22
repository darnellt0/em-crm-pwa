import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireInternalToken } from "@/lib/auth/requireInternalToken";
import { generateEmbedding } from "@/lib/ai/ollama";

export async function POST(req: NextRequest) {
  // Require internal service token
  const authError = requireInternalToken(req);
  if (authError) return authError;

  try {
    // Find up to 50 pending embeddings where memory is approved
    const pendingEmbeddings = await prisma.aiMemoryEmbedding.findMany({
      where: {
        embeddingStatus: "pending",
        memoryItem: { status: "approved" },
      },
      include: {
        memoryItem: { select: { id: true, content: true } },
      },
      take: 50,
    });

    if (pendingEmbeddings.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, message: "No pending embeddings" });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const emb of pendingEmbeddings) {
      try {
        const vector = await generateEmbedding(emb.memoryItem.content, emb.model);

        // Write vector using raw SQL with ::vector cast
        await prisma.$executeRaw`
          UPDATE "AiMemoryEmbedding"
          SET embedding = ${JSON.stringify(vector)}::vector,
              "embeddingStatus" = 'ready',
              "updatedAt" = NOW()
          WHERE id = ${emb.id}
        `;

        successCount++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        await prisma.aiMemoryEmbedding.update({
          where: { id: emb.id },
          data: { embeddingStatus: "error", error: errorMsg },
        });
        errorCount++;
        errors.push({ id: emb.id, error: errorMsg });
      }
    }

    return NextResponse.json({
      ok: true,
      processed: pendingEmbeddings.length,
      success: successCount,
      errors: errorCount,
      errorDetails: errors,
    });
  } catch (error) {
    console.error("Embedding worker error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
