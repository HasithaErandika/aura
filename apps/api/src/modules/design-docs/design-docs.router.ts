import { Router } from "express";
import { currentUser, requireAccess } from "../../lib/auth/user.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { forbidden } from "../../lib/http/errors.js";
import { parseOrThrow, positiveIntParam, uuidParam } from "../../lib/http/validate.js";
import { auditActor, writeAudit } from "../audit/index.js";
import { canEditDesignDoc, canViewDesignDocs } from "../policy/index.js";
import { createDocSchema, kindsQuerySchema, listQuerySchema, saveVersionSchema } from "./design-docs.schemas.js";
import { createDocument, editableKinds, getDocument, getVersion, listDocuments, listEpics, saveVersion } from "./design-docs.service.js";
import { owningAgent } from "./design-docs.types.js";

export const designDocsRouter = Router();

designDocsRouter.use(requireAccess(canViewDesignDocs, "You cannot view design documents"));

designDocsRouter.get(
  "/epics",
  asyncHandler(async (req, res) => {
    const { kind } = parseOrThrow(kindsQuerySchema, req.query);
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
    res.json(await getVersion(uuidParam(req.params.id, "Document"), positiveIntParam(req.params.version, "Version")));
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
      ...auditActor(req),
      action: "design_doc.created",
      entityType: "design_document",
      entityId: document.id,
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
    const { document: before } = await getVersion(id);
    if (!canEditDesignDoc(user.role, owningAgent(before.kind))) throw forbidden(`Your role cannot edit a ${before.kind} document`);
    const saved = await saveVersion(id, input, { userId: user.id });
    if (saved.changed) {
      await writeAudit({
        ...auditActor(req),
        action: "design_doc.updated",
        entityType: "design_document",
        entityId: id,
        metadata: { epicKey: before.epicKey, kind: before.kind, slug: before.slug, version: saved.document.currentVersion },
      });
    }
    res.json(saved);
  }),
);
