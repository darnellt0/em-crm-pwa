import { NextResponse } from "next/server";

import { handleAuthError, requireRole } from "@/lib/auth/requireRole";
import { getPriorityActions } from "@/lib/actionQueue";

export async function GET() {
  try {
    await requireRole("read_only");

    const actions = await getPriorityActions(10);
    return NextResponse.json({ ok: true, actions });
  } catch (error) {
    return handleAuthError(error);
  }
}
