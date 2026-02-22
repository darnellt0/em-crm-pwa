import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/requireRole";
import { generateEmbedding } from "@/lib/ai/ollama";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const q = req.nextUrl.searchParams.get("q");
    const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 20));

    if (!q || q.trim().length === 0) {
      return NextResponse.json({ ok: false, error: "Query parameter 'q' is required" }, { status: 400 });
    }

    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(q);

    // Use pgvector cosine distance operator for semantic search
    const results: any[] = await prisma.$queryRaw`
      SELECT
        e.id AS "embeddingId",
        e."memoryItemId",
        m.content,
        m."isPinned",
        m."contactId",
        c."firstName",
        c."lastName",
        c.email AS "contactEmail",
        1 - (e.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) AS similarity
      FROM "AiMemoryEmbedding" e
      JOIN "AiMemoryItem" m ON m.id = e."memoryItemId"
      JOIN "Contact" c ON c.id = m."contactId"
      WHERE e."embeddingStatus" = 'ready'
        AND m.status = 'approved'
        AND e.embedding IS NOT NULL
      ORDER BY e.embedding <=> ${JSON.stringify(queryEmbedding)}::vector ASC
      LIMIT ${limit}
    `;

    return NextResponse.json({
      ok: true,
      results: results.map((r) => ({
        memoryItemId: r.memoryItemId,
        content: r.content,
        isPinned: r.isPinned,
        contactId: r.contactId,
        contactName: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.contactEmail || "Unknown",
        contactEmail: r.contactEmail,
        similarity: Number(r.similarity),
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Ollama")) {
      return NextResponse.json(
        { ok: false, error: "Embedding service unavailable. Ensure Ollama is running." },
        { status: 503 }
      );
    }
    return handleAuthError(error);
  }
}
