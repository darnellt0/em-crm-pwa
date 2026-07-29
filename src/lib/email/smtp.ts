import nodemailer from "nodemailer";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
}

const LOCAL_SMTP_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function isLocalSmtpHost(host: string) {
  return LOCAL_SMTP_HOSTS.has(host.trim().toLowerCase());
}

export function readSmtpConfig(env: NodeJS.ProcessEnv = process.env): SmtpConfig {
  const host = env.SMTP_HOST?.trim() || "127.0.0.1";
  const port = Number(env.SMTP_PORT || "1025");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535.");
  }

  const user = env.SMTP_USER?.trim() || "";
  const password = env.SMTP_PASSWORD || "";
  if (Boolean(user) !== Boolean(password)) {
    throw new Error("SMTP_USER and SMTP_PASSWORD must be configured together.");
  }
  if (!isLocalSmtpHost(host) && (!user || !password)) {
    throw new Error("Authenticated SMTP credentials are required for a non-local server.");
  }

  return {
    host,
    port,
    secure: env.SMTP_SECURE?.trim().toLowerCase() === "true" || port === 465,
    auth: user && password ? { user, pass: password } : undefined,
  };
}

export function createSmtpTransport(config: SmtpConfig = readSmtpConfig()) {
  const local = isLocalSmtpHost(config.host);
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    requireTLS: !local && !config.secure,
    tls: local
      ? undefined
      : {
          minVersion: "TLSv1.2",
          servername: config.host,
        },
  });
}

export function readEmailFrom(env: NodeJS.ProcessEnv = process.env) {
  return env.EMAIL_FROM?.trim() || "Elevated Movements <no-reply@localhost>";
}
