import { NextRequest, NextResponse } from "next/server";
import { handleAuthError, requireUser } from "@/lib/auth/requireRole";
import { prisma } from "@/lib/db/prisma";
import {
  applyCleanedMasterImport,
  previewCleanedMasterImport
} from "@/lib/import/crm-import-service";

export async function POST(request: NextRequest) {
  try {
    const phase5UserId = await getPhase5TokenUserId(request);
    const authResult = phase5UserId ? { userId: phase5UserId } : await requireUser();
    const body = await request.json();
    const dryRun = body.dryRun === true;
    const csvText = String(body.csvText ?? "");

    if (!csvText.trim()) {
      return NextResponse.json({ ok: false, error: "csvText is required" }, { status: 400 });
    }

    if (dryRun) {
      const preview = await previewCleanedMasterImport({ prisma, csvText });
      return NextResponse.json({ ok: true, ...preview });
    }

    const result = await applyCleanedMasterImport({
      prisma,
      csvText,
      userId: authResult.userId
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleAuthError(error);
  }
}

async function getPhase5TokenUserId(request: NextRequest) {
  const configuredToken = process.env.PHASE5_IMPORT_TOKEN?.trim();
  if (
    !configuredToken ||
    process.env.NODE_ENV === "production" ||
    request.headers.get("x-phase5-import-token") !== configuredToken
  ) {
    return null;
  }

  const user = await prisma.user.findFirst({
    where: {
      role: {
        in: ["admin", "partner_admin", "staff"]
      }
    },
    select: { id: true },
    orderBy: { email: "asc" }
  });

  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }

  return user.id;
}
