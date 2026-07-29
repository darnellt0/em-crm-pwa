import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SeedRole = "admin" | "partner_admin" | "staff" | "read_only";

function parseEmails(value: string | undefined) {
  return [...new Set((value || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

const roleLists: Array<[SeedRole, string[]]> = [
  ["admin", parseEmails(process.env.ADMIN_EMAILS)],
  ["partner_admin", parseEmails(process.env.PARTNER_ADMIN_EMAILS)],
  ["staff", parseEmails(process.env.STAFF_EMAILS)],
  ["read_only", parseEmails(process.env.READ_ONLY_EMAILS)],
];

const seedDarnellEmail = (process.env.SEED_DARNELL_EMAIL || roleLists[0][1][0] || "").toLowerCase();
const seedShriaEmail = (process.env.SEED_SHRIA_EMAIL || roleLists[0][1][1] || "").toLowerCase();

async function main() {
  if (roleLists[0][1].length === 0) {
    throw new Error("ADMIN_EMAILS must contain at least one administrator");
  }

  const configuredUsers = new Map<string, SeedRole>();
  for (const [role, emails] of roleLists) {
    for (const email of emails) {
      if (!configuredUsers.has(email)) configuredUsers.set(email, role);
    }
  }

  for (const email of parseEmails(process.env.ALLOWED_EMAILS)) {
    if (!configuredUsers.has(email)) configuredUsers.set(email, "staff");
  }

  for (const [email, role] of configuredUsers) {
    const name =
      email === seedDarnellEmail
        ? "Darnell"
        : email === seedShriaEmail
          ? "Shria"
          : undefined;
    await prisma.user.upsert({
      where: { email },
      update: { ...(name ? { name } : {}), role },
      create: {
        email,
        name,
        role,
      }
    });
  }

  const ownerEmail = seedDarnellEmail || roleLists[0][1][0];
  const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (!owner) {
    throw new Error("Seed owner user was not created");
  }
  const shria = seedShriaEmail
    ? await prisma.user.findUnique({ where: { email: seedShriaEmail } })
    : null;

  const views = [
    { name: "Today's Follow-Ups", filters: { followUp: "today" } },
    { name: "Needs Review", filters: { tag: "Needs Review" } },
    { name: "Marketable Needs Review", filters: { tag: "Needs Review", marketing: "marketable" } },
    { name: "Phone Only", filters: { contactMethod: "phone_only" } },
    { name: "Email Bounce / Do Not Market", filters: { marketing: "suppressed" } },
    ...(shria ? [{ name: "Shria-Owned", filters: { owner: shria.id } }] : []),
    { name: "High Priority", filters: { tag: "High Priority" } }
  ];

  for (const view of views) {
    const existing = await prisma.savedView.findFirst({
      where: {
        ownerUserId: owner.id,
        entity: "contacts",
        name: view.name
      }
    });

    const data = {
      ownerUserId: owner.id,
      entity: "contacts",
      name: view.name,
      isShared: true,
      filters: view.filters,
      sort: [{ field: "updatedAt", direction: "desc" }],
      columns: ["name", "email", "phone", "lifecycleStage", "owner", "nextFollowUpAt", "tags"]
    };

    if (existing) {
      await prisma.savedView.update({ where: { id: existing.id }, data });
    } else {
      await prisma.savedView.create({ data });
    }
  }

  console.log(`Reconciled ${configuredUsers.size} allowlisted CRM user(s)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
