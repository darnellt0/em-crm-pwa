import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAgentWriteToken } from "@/lib/auth/requireAgentWriteToken";
import {
  AgentActionError,
  createAgentActionProposal,
  expirePendingAgentActions,
} from "@/lib/agentActions";

export async function GET(req: NextRequest) {
  const authError = requireAgentWriteToken(req);
  if (authError) return authError;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  }

  await expirePendingAgentActions();
  const action = await prisma.agentActionRequest.findUnique({
    where: { id },
    select: {
      id: true,
      actionType: true,
      status: true,
      rationale: true,
      error: true,
      result: true,
      expiresAt: true,
      reviewedAt: true,
      executedAt: true,
      createdAt: true,
    },
  });
  if (!action) {
    return NextResponse.json({ ok: false, error: "Action not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, action });
}

export async function POST(req: NextRequest) {
  const authError = requireAgentWriteToken(req);
  if (authError) return authError;

  try {
    const result = await createAgentActionProposal(await req.json().catch(() => ({})));
    return NextResponse.json(
      {
        ok: true,
        created: result.created,
        action: {
          id: result.action.id,
          actionType: result.action.actionType,
          status: result.action.status,
          contact: result.action.contact,
          expiresAt: result.action.expiresAt,
          createdAt: result.action.createdAt,
        },
      },
      { status: result.created ? 201 : 200 }
    );
  } catch (error) {
    if (error instanceof AgentActionError) {
      return NextResponse.json(
        { ok: false, code: error.code, error: error.message },
        {
          status: error.status,
          headers: error.status === 429 ? { "Retry-After": "60" } : undefined,
        }
      );
    }
    console.error("Agent proposal failed", error);
    return NextResponse.json({ ok: false, error: "Internal Server Error" }, { status: 500 });
  }
}
