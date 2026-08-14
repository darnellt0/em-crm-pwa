import { describe, expect, it } from "vitest";
import { planContactIdentityMatches } from "./contact-match-planner";

describe("planContactIdentityMatches", () => {
  it("splits a legacy mixed identity instead of merging household members", () => {
    const plans = planContactIdentityMatches(
      [
        {
          canonicalId: "person-a",
          firstName: "Ariel",
          lastName: "Zamora",
          email: "ariel@example.com",
          phoneNormalized: "+15105550100",
        },
        {
          canonicalId: "person-b",
          firstName: "Roberto",
          lastName: "Zamora",
          email: null,
          phoneNormalized: "+15105550100",
        },
      ],
      [
        {
          id: "mixed-contact",
          canonicalId: null,
          firstName: "Roberto",
          lastName: "Zamora",
          email: "ariel@example.com",
          phoneNormalized: "+15105550100",
        },
      ],
    );

    expect(plans[0]).toMatchObject({ contactId: "mixed-contact", matchType: "email" });
    expect(plans[1]).toMatchObject({ contactId: null, matchType: null, conflict: null });
  });

  it("matches separate contacts by email even when they share a phone", () => {
    const plans = planContactIdentityMatches(
      [
        { email: "one@example.com", phoneNormalized: "+15105550101" },
        { email: "two@example.com", phoneNormalized: "+15105550101" },
      ],
      [
        { id: "one", email: "one@example.com", phoneNormalized: "+15105550101" },
        { id: "two", email: "two@example.com", phoneNormalized: "+15105550101" },
      ],
    );

    expect(plans.map((plan) => plan.contactId)).toEqual(["one", "two"]);
    expect(plans.map((plan) => plan.matchType)).toEqual(["email", "email"]);
  });

  it("uses canonical ID before changed email and shared phone", () => {
    const plans = planContactIdentityMatches(
      [
        {
          canonicalId: "stable-id",
          email: "new@example.com",
          phoneNormalized: "+15105550102",
        },
      ],
      [
        {
          id: "existing",
          canonicalId: "STABLE-ID",
          email: "old@example.com",
          phoneNormalized: "+15105550102",
        },
      ],
    );

    expect(plans[0]).toMatchObject({ contactId: "existing", matchType: "canonicalId" });
  });

  it("matches phone alone only when it appears once in the incoming batch", () => {
    const existing = [
      {
        id: "existing",
        canonicalId: null,
        firstName: "Existing",
        phoneNormalized: "+15105550103",
      },
    ];

    expect(
      planContactIdentityMatches([{ phoneNormalized: "+15105550103" }], existing)[0],
    ).toMatchObject({ contactId: "existing", matchType: "phone" });

    expect(
      planContactIdentityMatches(
        [
          { firstName: "One", phoneNormalized: "+15105550103" },
          { firstName: "Two", phoneNormalized: "+15105550103" },
        ],
        existing,
      ).map((plan) => plan.contactId),
    ).toEqual([null, null]);
  });

  it("rejects duplicate canonical IDs in one source file", () => {
    const plans = planContactIdentityMatches(
      [{ canonicalId: "duplicate" }, { canonicalId: "DUPLICATE" }],
      [],
    );

    expect(plans[0].conflict).toBeNull();
    expect(plans[1].conflict).toContain("Canonical ID duplicates row 1");
  });
});
