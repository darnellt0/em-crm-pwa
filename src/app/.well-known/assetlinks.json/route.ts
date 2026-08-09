import { buildAndroidAssetLinks } from "@/lib/mobileAssociations";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    buildAndroidAssetLinks(
      process.env.ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS
    ),
    {
      headers: {
        "Cache-Control": "public, max-age=300",
      },
    }
  );
}
