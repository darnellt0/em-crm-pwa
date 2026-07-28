import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

// Contacts whose ONLY tag is "New Subscribers List"
const junkOnly = await p.contact.findMany({
  where: { tags: { equals: ["New Subscribers List"] } },
  select: { id: true, firstName: true, lastName: true, email: true },
  take: 10
});
const junkCount = await p.contact.count({
  where: { tags: { equals: ["New Subscribers List"] } }
});

console.log(`Contacts with ONLY "New Subscribers List" tag: ${junkCount}`);
console.log("Sample:");
junkOnly.forEach(r => console.log(`  ${r.firstName} ${r.lastName} | ${r.email}`));

await p.$disconnect();
