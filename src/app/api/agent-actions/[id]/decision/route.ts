import { NextRequest, NextResponse } from "next/server";
import {
  AgentActionError,
  approveAndExecuteAgentAction,
  rejectAgentAction,
} from "@/lib/agentActions";
import { handleAuthError, requireRole } from "@/lib/auth/requireRole";
import { AgentActionDecisionSchema } from "@/lib/validations/agentAction";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireRole("partner_admin");
    const parsed = AgentActionDecisionSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const id = (await params).id;
    if (parsed.data.decision === "reject") {
      await rejectAgentAction(id, userId, parsed.data.reason);
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    const action = await approveAndExecuteAgentAction(id, userId);
    return NextResponse.json({ ok: true, status: action.status, action });
  } catch (error) {
    if (error instanceof AgentActionError) {
      return NextResponse.json(
        { ok: false, code: error.code, error: error.message },
        { status: error.status }
      );
    }
    return handleAuthError(error);
  }
}
