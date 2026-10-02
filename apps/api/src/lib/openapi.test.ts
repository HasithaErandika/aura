import { describe, expect, it } from "vitest";
import { checkOpenApi } from "./openapi.js";

const GOOD = `openapi: 3.1.0
info: { title: Tickets, version: 1.0.0 }
paths:
  /tickets:
    get:
      operationId: listTickets
      responses:
        "200":
          description: The tickets
          content:
            application/json:
              schema: { type: array, items: { $ref: "#/components/schemas/Ticket" } }
    post:
      operationId: createTicket
      responses: { "201": { description: Created } }
components:
  schemas:
    Ticket: { type: object, properties: { id: { type: string } } }
`;

describe("OpenAPI contract check", () => {
  it("accepts a 3.1 contract and lists its operations", () => {
    expect(checkOpenApi(GOOD)).toEqual({
      problems: [],
      operations: [
        { operationId: "listTickets", method: "get", path: "/tickets" },
        { operationId: "createTicket", method: "post", path: "/tickets" },
      ],
    });
  });

  it("accepts the same contract as JSON", () => {
    expect(checkOpenApi(JSON.stringify({ openapi: "3.1.1", info: { title: "x", version: "1" }, paths: { "/a": { get: { operationId: "a", responses: { "200": { description: "ok" } } } } } })).problems).toEqual([]);
  });

  it("names each problem a coder or QA would trip on", () => {
    const bad = GOOD.replace("openapi: 3.1.0", "openapi: 3.0.3").replace("operationId: createTicket", "operationId: listTickets").replace("#/components/schemas/Ticket", "#/components/schemas/Missing");
    expect(checkOpenApi(bad).problems).toEqual(['openapi must be "3.1.x"', "operationId listTickets is used twice", "$ref #/components/schemas/Missing does not resolve"]);
    expect(checkOpenApi("openapi: 3.1.0\ninfo: {title: x, version: '1'}\npaths:\n  tickets:\n    get: {}\n").problems).toEqual(["path tickets must start with /", "GET tickets needs an operationId (letters, digits, _)", "GET tickets needs responses"]);
  });

  it("refuses text that is not a contract", () => {
    expect(checkOpenApi("just: [unclosed").problems[0]).toMatch(/^not valid YAML or JSON/);
    expect(checkOpenApi("- a\n- b").problems).toEqual(["the contract must be a YAML or JSON object"]);
    expect(checkOpenApi("openapi: 3.1.0\ninfo: {title: x, version: '1'}\npaths: {}").problems).toEqual(["paths must list at least one endpoint"]);
  });
});
