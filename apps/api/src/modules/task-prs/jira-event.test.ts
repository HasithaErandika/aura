import { describe, expect, it } from "vitest";
import { readyTask } from "./jira-event.js";

const event = (items: Record<string, string>[], fields: Record<string, unknown> = {}) => ({
  webhookEvent: "jira:issue_updated",
  issue: { key: "KAN-45", fields: { summary: "List tickets", issuetype: { name: "Task" }, parent: { key: "KAN-36" }, assignee: { emailAddress: "dev@acme.test" }, ...fields } },
  changelog: { items },
});
const triggers = { status: "Selected for Development", label: "aura" };

describe("Jira events that offer a Task", () => {
  it("offers a Task when the label is added", () => {
    expect(readyTask(event([{ field: "labels", fromString: "backend", toString: "backend aura" }]), triggers)).toEqual({
      taskKey: "KAN-45",
      epicKey: "KAN-36",
      summary: "List tickets",
      assigneeEmail: "dev@acme.test",
      reason: "label",
    });
  });

  it("offers a Task when it moves into the configured status", () => {
    expect(readyTask(event([{ field: "status", fromString: "To Do", toString: "selected for development" }]), triggers)?.reason).toBe("status");
  });

  it("does not offer again for an edit that leaves the label or status as it was", () => {
    expect(readyTask(event([{ field: "labels", fromString: "aura", toString: "aura backend" }]), triggers)).toBeNull();
    expect(readyTask(event([{ field: "summary", fromString: "a", toString: "b" }]), triggers)).toBeNull();
    expect(readyTask(event([{ field: "labels", fromString: "", toString: "aurora" }]), triggers)).toBeNull();
  });

  it("only offers work items, and only for triggers that are on", () => {
    expect(readyTask(event([{ field: "labels", fromString: "", toString: "aura" }], { issuetype: { name: "Epic" } }), triggers)).toBeNull();
    expect(readyTask(event([{ field: "labels", fromString: "", toString: "aura" }]), { status: null, label: null })).toBeNull();
    expect(readyTask(event([{ field: "labels", fromString: "", toString: "aura" }], { issuetype: { name: "Bug" }, assignee: null, parent: null }), triggers)).toMatchObject({ assigneeEmail: null, epicKey: null });
  });

  it("ignores payloads without a valid issue key", () => {
    expect(readyTask({ issue: { key: "../x", fields: { issuetype: { name: "Task" } } }, changelog: { items: [{ field: "labels", toString: "aura" }] } }, triggers)).toBeNull();
    expect(readyTask({}, triggers)).toBeNull();
  });
});
