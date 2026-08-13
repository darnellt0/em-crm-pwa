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

// Structured-output schema passed to Ollama's `format` option. An object
// root with a "memories" array is the most reliably honored shape across
// model families (some refuse bare top-level arrays).
const MEMORY_FORMAT_SCHEMA = {
  type: "object",
  properties: {
    memories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          content: { type: "string" },
          memoryType: { type: "string" },
          confidence: { type: "number" },
          pin: { type: "boolean" },
        },
        required: ["content"],
      },
    },
  },
  required: ["memories"],
};

function isProposal(item: unknown): item is MemoryProposal {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as MemoryProposal).content === "string" &&
    (item as MemoryProposal).content.length > 0
  );
}

/**
 * Tolerant parser for model output. Models return the proposals in several
 * shapes depending on family and mood: a bare array, an object wrapping an
 * array (e.g. {"memories": [...]}), or — for a single fact — one bare
 * object. All are accepted; anything else yields an empty list.
 */
export function parseMemoryProposals(text: string): MemoryProposal[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  if (Array.isArray(parsed)) {
    return parsed.filter(isProposal);
  }

  if (parsed && typeof parsed === "object") {
    for (const value of Object.values(parsed)) {
      if (Array.isArray(value)) {
        return value.filter(isProposal);
      }
    }
    // A single proposal returned as a bare object.
    if (isProposal(parsed)) {
      return [parsed];
    }
  }

  return [];
}

async function requestGeneration(body: Record<string, unknown>) {
  return fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function extractMemoryProposals(
  interactionText: string
): Promise<MemoryProposal[]> {
  const systemPrompt = `You are an AI assistant for Elevated Movements, a coaching and leadership development company for women leaders.
Your job is to read interaction notes and extract factual, long-term memory points about the contact.
Focus on: coaching program interest, enrollment signals, leadership challenges, personal details (family, location), and relationships to the founders.
Do NOT hallucinate. Extract distinct, single-sentence facts.
Respond with a JSON object of the form {"memories": [...]} where each entry has:
- "content" (string, required): the memory fact
- "memoryType" (string, optional): category like "personal", "professional", "interest", "relationship"
- "confidence" (number 0-1, optional): how confident you are
- "pin" (boolean, optional): true if this is especially important
If the note contains no memorable facts, return {"memories": []}.`;

  const baseRequest = {
    model: OLLAMA_MODEL,
    system: systemPrompt,
    prompt: interactionText,
    stream: false,
    format: MEMORY_FORMAT_SCHEMA,
  };

  try {
    // Thinking-capable models (Qwen3+, some others) put their output in a
    // separate `thinking` field and leave `response` empty unless thinking
    // is disabled. Older models can reject the `think` parameter entirely,
    // so fall back to a request without it.
    let response = await requestGeneration({ ...baseRequest, think: false });
    if (!response.ok) {
      response = await requestGeneration(baseRequest);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(`Ollama extraction failed (${response.status}): ${errText}`);
      return [];
    }

    const data = await response.json();
    const proposals = parseMemoryProposals(data.response ?? "");
    if (proposals.length === 0 && !data.response) {
      console.error(
        "Ollama returned an empty response field — if this model is a 'thinking' model, ensure your Ollama version supports the think:false option"
      );
    }
    return proposals;
  } catch (error) {
    console.error("Ollama extraction request failed:", error);
    return [];
  }
}
