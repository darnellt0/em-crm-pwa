/**
 * Applies database objects that live outside schema.prisma and would
 * otherwise be silently dropped or skipped by `prisma db push`:
 *   - the pgvector extension (also declared in the schema, kept as a guard)
 *   - the HNSW cosine index on AiMemoryEmbedding used by semantic search
 *
 * Runs automatically after `pnpm db:push`. Idempotent.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS vector");
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_ai_memory_embedding_cosine
       ON "AiMemoryEmbedding"
       USING hnsw (embedding vector_cosine_ops)`
  );
  console.log("✅ pgvector extension and HNSW index are in place");
}

main()
  .catch((error) => {
    console.error("ensure-db-extras failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
