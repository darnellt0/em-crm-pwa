-- Recompute relationship recency after separating provider campaign telemetry
-- from genuine person-to-person contact. Contacts with no verifiable touch are
-- set to NULL instead of retaining an email open, click, send, or SMS receipt.
WITH "RecomputedLastTouch" AS (
  SELECT
    c."id",
    MAX(i."occurredAt") AS "lastTouchAt"
  FROM "Contact" c
  LEFT JOIN "Interaction" i
    ON i."contactId" = c."id"
   AND i."type" IN ('call', 'email', 'meeting', 'sms')
   AND i."occurredAt" <= CURRENT_TIMESTAMP
   AND (
     i."outcome" IS NULL
     OR i."outcome" NOT IN (
       'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complaint',
       'unsubscribed', 'dropped', 'sms_sent', 'sms_failed',
       'sms_opt_out', 'sms_opt_in'
     )
   )
  GROUP BY c."id"
)
UPDATE "Contact" c
SET "lastTouchAt" = r."lastTouchAt"
FROM "RecomputedLastTouch" r
WHERE c."id" = r."id"
  AND c."lastTouchAt" IS DISTINCT FROM r."lastTouchAt";
