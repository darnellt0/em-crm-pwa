// Quick debug — simulate what the service does for the 3 failing cases

// Case 1: Tag merge — does the service merge existing + incoming tags?
function parseTags(raw) {
  if (!raw) return [];
  return raw.split(/[,;]+/).map(t => t.trim()).filter(Boolean);
}

const existingTags = ["existing-tag"];
const incomingRaw = "new-tag,another-tag";
const incomingTags = parseTags(incomingRaw);
// simulate context tags — all fields empty
const preferredName = "";
const preferredChannel = "";
const contactType = "";
const relationshipType = "";
const canonicalId = "";
const sourceMemberships = "";
if (preferredName) incomingTags.push(`preferred:${preferredName}`);
if (preferredChannel) incomingTags.push(`channel:${preferredChannel}`);
if (contactType) incomingTags.push(`type:${contactType}`);
if (relationshipType) incomingTags.push(`rel:${relationshipType}`);
if (canonicalId) incomingTags.push(`cid:${canonicalId}`);
if (sourceMemberships) incomingTags.push(`src:${sourceMemberships}`);

const mergedTags = Array.from(new Set([...existingTags, ...incomingTags]));
console.log("Tag merge result:", mergedTags);
// Expected: ["existing-tag", "new-tag", "another-tag"]

// Case 2: Needs Review — does the service add the tag?
const reviewStatus = "Needs Review";
const tagsForReview = [];
if (reviewStatus?.toLowerCase().includes("review") && !tagsForReview.includes("Needs Review")) {
  tagsForReview.push("Needs Review");
}
console.log("Needs Review tags:", tagsForReview);
// Expected: ["Needs Review"]

// Case 3: Phone dedup — when emailNorm is null, does phone lookup fire?
const emailNorm = null;
const phoneNorm = "+15551234567";
let emailLookupFired = false;
let phoneLookupFired = false;
if (emailNorm) { emailLookupFired = true; }
if (!null && phoneNorm) { phoneLookupFired = true; }
console.log("Email lookup fired:", emailLookupFired); // should be false
console.log("Phone lookup fired:", phoneLookupFired); // should be true
