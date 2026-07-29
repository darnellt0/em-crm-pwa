import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { createSmtpTransport, readEmailFrom, readSmtpConfig } = await import(
    "../src/lib/email/smtp"
  );
  const config = readSmtpConfig();
  const transport = createSmtpTransport(config);
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  const sendTest = args.includes("--send");
  const recipientIndex = args.indexOf("--to");
  const recipient = recipientIndex >= 0 ? args[recipientIndex + 1] : config.auth?.user;

  await transport.verify();
  console.log(`SMTP connection verified: ${config.host}:${config.port} (TLS=${config.secure})`);

  if (sendTest) {
    if (!recipient) throw new Error("A test recipient is required. Use --to <email>.");
    await transport.sendMail({
      to: recipient,
      from: readEmailFrom(),
      subject: "Elevated Movements CRM email delivery test",
      text: "Email delivery from Elevated Movements CRM is working.",
      html: "<p>Email delivery from <strong>Elevated Movements CRM</strong> is working.</p>",
    });
    console.log("SMTP test message accepted for delivery.");
  }

  transport.close();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown SMTP error";
  console.error(`SMTP verification failed: ${message}`);
  process.exit(1);
});
