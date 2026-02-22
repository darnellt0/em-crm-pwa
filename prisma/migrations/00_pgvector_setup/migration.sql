-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create ivfflat index on AiMemoryEmbedding for cosine similarity search
-- Note: This index requires at least some rows to exist. If the table is empty,
-- you may need to re-run this after inserting initial embeddings, or use HNSW instead.
-- We use HNSW which works on empty tables:
CREATE INDEX IF NOT EXISTS idx_ai_memory_embedding_cosine
  ON "AiMemoryEmbedding"
  USING hnsw (embedding vector_cosine_ops);
