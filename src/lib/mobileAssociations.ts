const APP_ID = "com.elevatedmovements.crm";
const TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/;
const SHA256_PATTERN = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function buildAppleAppSiteAssociation(teamIdValue?: string) {
  const teamId = teamIdValue?.trim().toUpperCase() ?? "";
  const details = TEAM_ID_PATTERN.test(teamId)
    ? [{ appID: `${teamId}.${APP_ID}`, paths: ["*"] }]
    : [];

  return { applinks: { apps: [], details } };
}

export function buildAndroidAssetLinks(fingerprintValue?: string) {
  const fingerprints = (fingerprintValue ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value, index, values) =>
      SHA256_PATTERN.test(value) && values.indexOf(value) === index
    );

  if (fingerprints.length === 0) return [];

  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: APP_ID,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}
