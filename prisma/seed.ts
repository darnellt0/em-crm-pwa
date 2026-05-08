/**
 * Deterministic seed for Elevated Movements CRM.
 * Creates Darnell and Shria as admin users if they do not already exist.
 * Safe to run multiple times (idempotent).
 *
 * Usage:
 *   pnpm db:seed
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_USERS: Array<{ email: string; name: string; role: "admin" | "partner_admin" | "staff" | "read_only" }> = [
  {
    email: process.env.SEED_DARNELL_EMAIL || "darnell@elevatedmovements.com",
    name: "Darnell",
    role: "admin",
  },
  {
    email: process.env.SEED_SHRIA_EMAIL || "shria@elevatedmovements.com",
    name: "Shria",
    role: "admin",
  },
];

async function main() {
  console.log("🌱 Seeding Elevated Movements CRM...\n");

  for (const user of SEED_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: user.email } });

    if (existing) {
      // Ensure role is correct even if user already exists
      if (existing.role !== user.role) {
        await prisma.user.update({
          where: { email: user.email },
          data: { role: user.role, name: user.name },
        });
        console.log(`  ✅ Updated role for ${user.name} (${user.email}) → ${user.role}`);
      } else {
        console.log(`  ✔  ${user.name} (${user.email}) already exists with role ${user.role}`);
      }
    } else {
      await prisma.user.create({
        data: {
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
      console.log(`  ✅ Created ${user.name} (${user.email}) as ${user.role}`);
    }
  }

  console.log("\n✅ Seed complete. Both users can now sign in via magic link.\n");
  console.log("   Tip: If running locally, open http://localhost:8025 (MailHog) to get the sign-in link.\n");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
