import test from "node:test";
import assert from "node:assert/strict";
import { CRM_ORIGIN, resolveAppUrl } from "../src/links.js";

test("preserves approved HTTPS CRM links, including auth callbacks", () => {
  const link = `${CRM_ORIGIN}/api/auth/callback/email?token=abc&email=a%40b.com`;
  assert.equal(resolveAppUrl(link), link);
});

test("maps the legacy contact-name custom link to current contact search", () => {
  assert.equal(
    resolveAppUrl("emcrm://open?contact=Angela%20Davis"),
    `${CRM_ORIGIN}/contacts?q=Angela+Davis`
  );
});

test("maps a valid contact id directly to its current route", () => {
  const id = "d2891351-95e3-4c87-a734-49f857260b7e";
  assert.equal(
    resolveAppUrl(`emcrm://open?contactId=${id}`),
    `${CRM_ORIGIN}/contacts/${id}`
  );
});

test("allows an internal path but blocks external and cleartext targets", () => {
  assert.equal(
    resolveAppUrl("emcrm://open?path=%2Ftasks%3Fview%3Dtoday"),
    `${CRM_ORIGIN}/tasks?view=today`
  );
  assert.equal(resolveAppUrl("https://example.com/contacts"), null);
  assert.equal(resolveAppUrl("http://crm.elevatedmovements.com"), null);
  assert.equal(resolveAppUrl("emcrm://open?path=%2F%2Fevil.example"), `${CRM_ORIGIN}/`);
});
