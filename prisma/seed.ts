import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "darnell@example.com,shria@example.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  const users = [];

  for (const email of adminEmails) {
    const user = await prisma.user.upsert({
      where: { email },
      update: { role: "admin" },
      create: {
        email,
        name: email.split("@")[0],
        role: "admin"
      }
    });
    users.push(user);
  }

  const owner = users[0];
  if (owner) {
    const views = [
      { name: "Today's Follow-Ups", filters: { nextFollowUpAt: "today" } },
      { name: "Needs Review", filters: { tags: ["Needs Review"] } },
      { name: "Phone Only", filters: { phoneOnly: true } },
      { name: "Email Bounce / Do Not Market", filters: { tags: ["Email Bounce", "Do Not Market"] } },
      { name: "Shria-Owned", filters: { ownerEmail: "shria@example.com" } },
      { name: "High Priority", filters: { tags: ["High Priority"], priority: "high" } }
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
  }

  console.log(`Seeded CRM admin users: ${adminEmails.join(", ")}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
