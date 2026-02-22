const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

export async function generateEmbedding(
  text: string,
  model: string = OLLAMA_EMBED_MODEL
): Promise<number[]> {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: text }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "Unknown error");
    throw new Error(`Ollama embedding failed (${response.status}): ${errText}`);
  }

  const data = await response.json();

  if (!data.embedding || !Array.isArray(data.embedding)) {
    throw new Error("Ollama returned invalid embedding response");
  }

  return data.embedding;
}

export interface MemoryProposal {
  content: string;
  memoryType?: string;
  confidence?: number;
  pin?: boolean;
}

export async function extractMemoryProposals(
  interactionText: string
): Promise<MemoryProposal[]> {
  const systemPrompt = `You are an AI assistant for Elevated Movements, a coaching and leadership development company for women leaders.
Your job is to read interaction notes and extract factual, long-term memory points about the contact.
Focus on: coaching program interest, enrollment signals, leadership challenges, personal details (family, location), and relationships to the founders.
Do NOT hallucinate. Extract distinct, single-sentence facts.
Output strictly as a JSON array of objects with these fields:
- "content" (string, required): the memory fact
- "memoryType" (string, optional): category like "personal", "professional", "interest", "relationship"
- "confidence" (number 0-1, optional): how confident you are
- "pin" (boolean, optional): true if this is especially important`;

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        system: systemPrompt,
        prompt: interactionText,
        stream: false,
        format: "json",
      }),
    });

    if (!response.ok) {
      console.error(`Ollama extraction failed (${response.status})`);
      return [];
    }

    const data = await response.json();

    try {
      const parsed = JSON.parse(data.response);

      // Handle both array and object-with-array formats
      if (Array.isArray(parsed)) {
        return parsed.filter((item: any) => typeof item.content === "string" && item.content.length > 0);
      }

      // Sometimes the model wraps in an object like { "memories": [...] }
      const values = Object.values(parsed);
      for (const val of values) {
        if (Array.isArray(val)) {
          return (val as any[]).filter(
            (item: any) => typeof item.content === "string" && item.content.length > 0
          );
        }
      }

      return [];
    } catch {
      console.error("Failed to parse Ollama memory extraction response");
      return [];
    }
  } catch (error) {
    console.error("Ollama extraction request failed:", error);
    return [];
  }
}
