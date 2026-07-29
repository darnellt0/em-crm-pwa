import { describe, expect, it } from "vitest";
import { isLocalSmtpHost, readEmailFrom, readSmtpConfig } from "./smtp";

describe("SMTP configuration", () => {
  it("defaults to unauthenticated local MailHog", () => {
    expect(readSmtpConfig({})).toEqual({
      host: "127.0.0.1",
      port: 1025,
      secure: false,
      auth: undefined,
    });
  });

  it("builds an authenticated Gmail SSL configuration", () => {
    expect(
      readSmtpConfig({
        SMTP_HOST: "smtp.gmail.com",
        SMTP_PORT: "465",
        SMTP_SECURE: "true",
        SMTP_USER: "sender@example.com",
        SMTP_PASSWORD: "app-password",
      })
    ).toEqual({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "sender@example.com", pass: "app-password" },
    });
  });

  it("rejects partial or unauthenticated remote configuration", () => {
    expect(() =>
      readSmtpConfig({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "sender@example.com" })
    ).toThrow("configured together");
    expect(() => readSmtpConfig({ SMTP_HOST: "smtp.gmail.com" })).toThrow(
      "Authenticated SMTP credentials"
    );
  });

  it("validates ports and local host aliases", () => {
    expect(() => readSmtpConfig({ SMTP_PORT: "invalid" })).toThrow("SMTP_PORT");
    expect(isLocalSmtpHost("localhost")).toBe(true);
    expect(isLocalSmtpHost("smtp.gmail.com")).toBe(false);
  });

  it("provides a safe local sender fallback", () => {
    expect(readEmailFrom({})).toBe("Elevated Movements <no-reply@localhost>");
  });
});
