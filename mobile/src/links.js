export const CRM_ORIGIN = "https://crm.elevatedmovements.com";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeInternalPath(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  try {
    const target = new URL(value, CRM_ORIGIN);
    return target.origin === CRM_ORIGIN ? target.href : null;
  } catch {
    return null;
  }
}

export function resolveAppUrl(rawUrl) {
  if (!rawUrl) return `${CRM_ORIGIN}/`;

  let incoming;
  try {
    incoming = new URL(rawUrl);
  } catch {
    return null;
  }

  if (incoming.protocol === "https:" && incoming.origin === CRM_ORIGIN) {
    return incoming.href;
  }

  if (incoming.protocol !== "emcrm:") return null;

  const action = incoming.hostname.toLowerCase();
  if (action !== "open") return `${CRM_ORIGIN}/`;

  const contactId = incoming.searchParams.get("contactId")?.trim();
  if (contactId && UUID_PATTERN.test(contactId)) {
    return `${CRM_ORIGIN}/contacts/${encodeURIComponent(contactId)}`;
  }

  const contact = incoming.searchParams.get("contact")?.trim();
  if (contact) {
    const target = new URL("/contacts", CRM_ORIGIN);
    target.searchParams.set("q", contact);
    return target.href;
  }

  const path = safeInternalPath(incoming.searchParams.get("path"));
  return path ?? `${CRM_ORIGIN}/`;
}
