import { createHash } from "node:crypto";

// Stable content hash used to bind an approval decision to the exact payload the human saw
// (FR-APPR-3). If the snapshot changes after the decision, the hashes no longer match.
export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
