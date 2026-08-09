import { describe, expect, it } from "vitest";
import {
  buildAndroidAssetLinks,
  buildAppleAppSiteAssociation,
} from "@/lib/mobileAssociations";

describe("mobile association documents", () => {
  it("omits unverifiable placeholder values", () => {
    expect(buildAppleAppSiteAssociation("TEAM_ID_HERE").applinks.details).toEqual(
      []
    );
    expect(buildAndroidAssetLinks("SHA256_HERE")).toEqual([]);
  });

  it("publishes valid public signing identifiers", () => {
    expect(buildAppleAppSiteAssociation("A1B2C3D4E5")).toEqual({
      applinks: {
        apps: [],
        details: [
          {
            appID: "A1B2C3D4E5.com.elevatedmovements.crm",
            paths: ["*"],
          },
        ],
      },
    });

    const fingerprint = Array(32).fill("AB").join(":");
    const documents = buildAndroidAssetLinks(fingerprint);
    expect(documents[0].target.sha256_cert_fingerprints).toEqual([fingerprint]);
  });
});
