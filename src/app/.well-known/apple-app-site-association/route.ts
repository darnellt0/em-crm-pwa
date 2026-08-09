import { buildAppleAppSiteAssociation } from "@/lib/mobileAssociations";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(buildAppleAppSiteAssociation(process.env.APPLE_TEAM_ID), {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "application/json",
    },
  });
}
