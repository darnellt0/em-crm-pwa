import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { advanceLastTouch } from "../src/lib/interactions";
import { updateLead } from "../src/lib/updateLead";
import { UpdateLeadSchema } from "../src/lib/leads";
import { completeTask } from "../src/lib/completeTask";

// Real database integration check, always rolled back. No messages, agent
// proposals, extraction, or production contact mutations are performed.
loadEnvConfig(process.cwd());
const db = new PrismaClient();
const rollback = new Error("EXPECTED_VERIFICATION_ROLLBACK");
let verifiedId: string | undefined;
async function main() {
  try {
    await db.$transaction(async tx => {
      const user = await tx.user.findFirstOrThrow({ select: { id: true } });
      const contact = await tx.contact.create({ data: { firstName: "Temporary verification (rolled back)", lifecycleStage: "subscriber", tags: ["Do Not Market"] } });
      verifiedId = contact.id;
      const historic = new Date("2026-08-10T18:30:00Z");
      await advanceLastTouch(tx, contact.id, "meeting", historic);
      await advanceLastTouch(tx, contact.id, "meeting", new Date("2026-07-01T00:00:00Z"));
      await advanceLastTouch(tx, contact.id, "note", new Date());
      const current = await tx.contact.findUniqueOrThrow({ where: { id: contact.id } });
      assert.equal(current.lastTouchAt?.toISOString(), historic.toISOString());
      const input = UpdateLeadSchema.parse({ expectedUpdatedAt: current.updatedAt.toISOString(), leadStatus: "active", ownerUserId: user.id, nextFollowUpAt: "2026-09-18T07:00:00Z", leadNextAction: "Verify workflow", reviewNote: "Temporary integration verification", createTask: true });
      await updateLead(tx, contact.id, input, user.id);
      const saved = await tx.contact.findUniqueOrThrow({ where: { id: contact.id }, include: { tasks: true, interactions: true } });
      assert.equal(saved.leadStatus, "active");
      assert.equal(saved.lifecycleStage, "subscriber");
      assert.deepEqual(saved.tags, ["Do Not Market"]);
      assert.equal(saved.lastTouchAt?.toISOString(), historic.toISOString());
      assert.equal(saved.tasks.length, 1);
      assert.equal(saved.tasks[0].ownerUserId, user.id);
      assert.equal(saved.interactions[0].type, "note");
      await assert.rejects(updateLead(tx, contact.id, input, user.id), /LEAD_CONFLICT/);
      await updateLead(tx, contact.id, { ...input, expectedUpdatedAt: saved.updatedAt.toISOString(), leadNextAction: "Verify updated workflow" }, user.id);
      assert.equal(await tx.task.count({ where: { contactId: contact.id } }), 1);
      const refreshed = await tx.contact.findUniqueOrThrow({ where: { id: contact.id } });
      const task = await tx.task.findFirstOrThrow({ where: { contactId: contact.id } });
      await completeTask(tx, task.id, { status: "done", followThrough: { choice: "schedule", expectedContactUpdatedAt: refreshed.updatedAt.toISOString(), note: "Temporary completion verification", nextAction: "Verify next owned step", nextFollowUpAt: "2026-09-21T07:00:00Z" } }, user.id);
      assert.equal(await tx.task.count({ where: { contactId: contact.id, status: "done" } }), 1);
      assert.equal(await tx.task.count({ where: { contactId: contact.id, status: "todo" } }), 1);
      const afterCompletion = await tx.contact.findUniqueOrThrow({ where: { id: contact.id } });
      assert.equal(afterCompletion.leadNextAction, "Verify next owned step");
      assert.equal(afterCompletion.lastTouchAt?.toISOString(), historic.toISOString());
      assert.deepEqual(afterCompletion.tags, ["Do Not Market"]);
      assert.equal(afterCompletion.lifecycleStage, "subscriber");
      throw rollback;
    }, { timeout: 15000 });
  } catch (error) { if (error !== rollback) throw error; }
  assert.ok(verifiedId);
  assert.equal(await db.contact.count({ where: { id: verifiedId } }), 0);
  console.log("PASS: real database chronology, lead review, consent preservation, linked task, stale-write protection and rollback. No verification records retained.");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
