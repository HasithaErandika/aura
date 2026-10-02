import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { forbidden } from "../../lib/http/errors.js";
import { parseOrThrow, uuidParam } from "../../lib/http/validate.js";
import { currentUser } from "../../middleware/auth.js";
import { writeAudit } from "../audit/audit.service.js";
import { canEditDesignDoc, canViewDesignDocs } from "../policy/policy.js";
import { createDocument, getDocument, getVersion, listDocuments, listEpics, saveVersion } from "./design-docs.service.js";
import { DOC_KINDS, createDocSchema, listQuerySchema, owningAgent, saveVersionSchema, type DocKind } from "./design-docs.types.js";

// Design documents (docs/plans/aura-vscode-agents.md V3): read by every pipeline role, edited by
// the role that owns the kind (policy.ts canEditDesignDoc). Every save is a new version and is
// audited; nothing is ever overwritten or deleted.

export const designDocsRouter = Router();

designDocsRouter.use((req, _res, next) => {
  next(canViewDesignDocs(currentUser(req).role) ? undefined : forbidden("You cannot view design documents"));
});

// Which kinds the signed-in user may edit, so the page shows the right buttons.
function editableKinds(role: Parameters<typeof canEditDesignDoc>[0]): DocKind[] {
  return DOC_KINDS.filter((k) => canEditDesignDoc(role, owningAgent(k)));
}

designDocsRouter.get(
  "/epics",
  asyncHandler(async (req, res) => {
    const { kind } = parseOrThrow(z.object({ kind: listQuerySchema.shape.kind }).strict(), req.query);
    res.json({ epics: await listEpics(kind), editableKinds: editableKinds(currentUser(req).role) });
  }),
);

designDocsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { epicKey, kind } = parseOrThrow(listQuerySchema, req.query);
    res.json({ documents: await listDocuments({ epicKey, kinds: kind }), editableKinds: editableKinds(currentUser(req).role) });
  }),
);

designDocsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await getDocument(uuidParam(req.params.id, "Document")));
  }),
);

designDocsRouter.get(
  "/:id/versions/:version",
  asyncHandler(async (req, res) => {
    const { version } = parseOrThrow(z.object({ version: z.coerce.number().int().min(1) }), { version: req.params.version });
    res.json(await getVersion(uuidParam(req.params.id, "Document"), version));
  }),
);

designDocsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const input = parseOrThrow(createDocSchema, req.body);
    if (!canEditDesignDoc(user.role, owningAgent(input.kind))) throw forbidden(`Your role cannot create a ${input.kind} document`);
    const document = await createDocument(input, { userId: user.id });
    await writeAudit({
      actorId: user.id,
      actorRole: user.role,
      action: "design_doc.created",
      entityType: "design_document",
      entityId: document.id,
      requestId: req.requestId,
      metadata: { epicKey: document.epicKey, kind: document.kind, slug: document.slug },
    });
    res.status(201).json({ document });
  }),
);

designDocsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const id = uuidParam(req.params.id, "Document");
    const input = parseOrThrow(saveVersionSchema, req.body);
    const { document: before } = await getDocument(id);
    if (!canEditDesignDoc(user.role, owningAgent(before.kind))) throw forbidden(`Your role cannot edit a ${before.kind} document`);
    const saved = await saveVersion(id, input, { userId: user.id });
    if (saved.changed) {
      await writeAudit({
        actorId: user.id,
        actorRole: user.role,
        action: "design_doc.updated",
        entityType: "design_document",
        entityId: id,
        requestId: req.requestId,
        metadata: { epicKey: before.epicKey, kind: before.kind, slug: before.slug, version: saved.document.currentVersion },
      });
    }
    res.json(saved);
  }),
);
