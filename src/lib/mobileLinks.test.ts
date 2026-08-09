import { describe, expect, it } from "vitest";
import {
  MOBILE_CRM_ORIGIN,
  resolveMobileDeepLink,
} from "@/lib/mobileLinks";

describe("resolveMobileDeepLink", () => {
  it("preserves CRM HTTPS links used by Auth.js callbacks", () => {
    const callback = `${MOBILE_CRM_ORIGIN}/api/auth/callback/email?token=one-time`;
    expect(resolveMobileDeepLink(callback)).toBe(callback);
  });

  it("maps the custom contact link to current contact search", () => {
    expect(resolveMobileDeepLink("emcrm://open?contact=Angela%20Davis")).toBe(
      `${MOBILE_CRM_ORIGIN}/contacts?q=Angela+Davis`
    );
  });

  it("rejects unapproved origins and cleartext links", () => {
    expect(resolveMobileDeepLink("https://example.com/")).toBeNull();
    expect(resolveMobileDeepLink("http://crm.elevatedmovements.com/")).toBeNull();
  });
});
