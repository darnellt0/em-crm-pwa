export const MOBILE_CRM_ORIGIN = "https://crm.elevatedmovements.com";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveInternalPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;

  try {
    const target = new URL(value, MOBILE_CRM_ORIGIN);
    return target.origin === MOBILE_CRM_ORIGIN ? target.href : null;
  } catch {
    return null;
  }
}

export function resolveMobileDeepLink(rawUrl: string): string | null {
  let incoming: URL;
  try {
    incoming = new URL(rawUrl);
  } catch {
    return null;
  }

  if (
    incoming.protocol === "https:" &&
    incoming.origin === MOBILE_CRM_ORIGIN
  ) {
    return incoming.href;
  }

  if (incoming.protocol !== "emcrm:") return null;
  if (incoming.hostname.toLowerCase() !== "open") {
    return `${MOBILE_CRM_ORIGIN}/`;
  }

  const contactId = incoming.searchParams.get("contactId")?.trim();
  if (contactId && UUID_PATTERN.test(contactId)) {
    return `${MOBILE_CRM_ORIGIN}/contacts/${encodeURIComponent(contactId)}`;
  }

  const contact = incoming.searchParams.get("contact")?.trim();
  if (contact) {
    const target = new URL("/contacts", MOBILE_CRM_ORIGIN);
    target.searchParams.set("q", contact);
    return target.href;
  }

  return (
    resolveInternalPath(incoming.searchParams.get("path")) ??
    `${MOBILE_CRM_ORIGIN}/`
  );
}
