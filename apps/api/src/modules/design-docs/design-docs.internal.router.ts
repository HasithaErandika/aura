import { Router } from "express";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { parseOrThrow, uuidParam } from "../../lib/http/validate.js";
import { webUrl } from "../../lib/web-url.js";
import { writeAudit } from "../audit/index.js";
import { agentWriteSchema, listQuerySchema, versionQuerySchema } from "./design-docs.schemas.js";
import { getVersion, listDocuments, writeFromAgent } from "./design-docs.service.js";

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
    res.json({ ...saved, url: webUrl(`/app/design-docs?epic=${encodeURIComponent(input.epicKey)}&doc=${saved.document.id}`) });
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
    const { version } = parseOrThrow(versionQuerySchema, req.query);
    res.json(await getVersion(uuidParam(req.params.id, "Document"), version));
  }),
);
