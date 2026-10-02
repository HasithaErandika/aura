import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { parseOrThrow, uuidParam } from "../../lib/http/validate.js";
import { writeAudit } from "../audit/audit.service.js";
import { getVersion, listDocuments, writeFromAgent } from "./design-docs.service.js";
import { agentWriteSchema, listQuerySchema } from "./design-docs.types.js";

// Called by apps/agent-runtime only (mounted under /internal, runtime token): an agent saves the
// documents of a draft a human approved (Gate 3 architecture, the QA plan), and the VS Code agent
// reads them while it works on a Task. The human approval happened at the gate; this route only
// records the result.

export const designDocsInternalRouter = Router();

designDocsInternalRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(agentWriteSchema, req.body);
    const saved = await writeFromAgent(input);
    if (saved.changed) {
      await writeAudit({
        actorId: null,
        actorRole: null,
        action: saved.created ? "design_doc.created" : "design_doc.updated",
        entityType: "design_document",
        entityId: saved.document.id,
        requestId: req.requestId,
        metadata: { epicKey: input.epicKey, kind: input.kind, slug: input.slug, version: saved.document.currentVersion, agent: input.agent, draftId: input.draftId ?? null },
      });
    }
    // The web page for the document, so the agent's Jira comment can link to it.
    const web = env.webOrigin[0] ?? "http://localhost:5173";
    res.json({ ...saved, url: `${web}/app/design-docs?epic=${encodeURIComponent(input.epicKey)}&doc=${saved.document.id}` });
  }),
);

designDocsInternalRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { epicKey, kind } = parseOrThrow(listQuerySchema, req.query);
    res.json({ documents: await listDocuments({ epicKey, kinds: kind }) });
  }),
);

designDocsInternalRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { version } = parseOrThrow(z.object({ version: z.coerce.number().int().min(1).optional() }).strict(), req.query);
    res.json(await getVersion(uuidParam(req.params.id, "Document"), version));
  }),
);
