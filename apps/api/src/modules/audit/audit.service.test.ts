import { describe, expect, it } from "vitest";
import { auditRowsToCsv, toAuditEntry } from "./audit.service.js";
import type { AuditRow } from "./audit.types.js";

const row: AuditRow = {
  id: 7,
  actor_id: "u1",
  actor_role: "admin",
  action: "user.created",
  entity_type: "user",
  entity_id: "u2",
  metadata: { email: "a@b.c", note: 'say "hi", then go' },
  request_id: null,
  created_at: "2026-10-02T12:00:00Z",
};

describe("audit export", () => {
  it("renders RFC 4180 CSV with quoted metadata", () => {
    const [header, line] = auditRowsToCsv([row]).split("\n");
    expect(header).toBe("id,created_at,actor_id,actor_role,action,entity_type,entity_id,request_id,metadata");
    expect(line).toBe('7,2026-10-02T12:00:00Z,u1,admin,user.created,user,u2,,"{""email"":""a@b.c"",""note"":""say \\""hi\\"", then go""}"');
  });

  it("maps a row to its camelCase entry", () => {
    expect(toAuditEntry(row)).toMatchObject({ id: 7, actorId: "u1", entityType: "user", requestId: null, createdAt: "2026-10-02T12:00:00Z" });
  });
});
