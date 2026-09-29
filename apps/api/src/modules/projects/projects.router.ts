import { Router } from "express";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { parseOrThrow, uuidParam } from "../../lib/http/validate.js";
import { currentUser, requireRole } from "../../middleware/auth.js";
import { writeAudit } from "../audit/audit.service.js";
import { createProjectSchema, repositorySchema } from "./projects.schemas.js";
import { createProject, deleteProject, listProjects, removeRepository, setRepository } from "./projects.service.js";

// Projects and their Git repository (docs/plans/aura-git-control-plane.md Phase 1.1). Every
// signed-in user can list them (agents and pages need to know where a Task's code lives); only
// admins register or remove them, and every change is audited.

export const projectsRouter = Router();

projectsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ projects: await listProjects() });
  }),
);

projectsRouter.post(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const admin = currentUser(req);
    const input = parseOrThrow(createProjectSchema, req.body);
    const project = await createProject(input, admin.id);
    await writeAudit({
      actorId: admin.id,
      actorRole: admin.role,
      action: "project.created",
      entityType: "project",
      entityId: project.id,
      requestId: req.requestId,
      metadata: { key: project.key, jiraProjectKey: project.jiraProjectKey },
    });
    res.status(201).json(project);
  }),
);

projectsRouter.delete(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const admin = currentUser(req);
    const project = await deleteProject(uuidParam(req.params.id, "Project"));
    await writeAudit({
      actorId: admin.id,
      actorRole: admin.role,
      action: "project.deleted",
      entityType: "project",
      entityId: project.id,
      requestId: req.requestId,
      metadata: { key: project.key, repository: project.repository?.fullName ?? null },
    });
    res.status(204).send();
  }),
);

projectsRouter.put(
  "/:id/repository",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const admin = currentUser(req);
    const projectId = uuidParam(req.params.id, "Project");
    const input = parseOrThrow(repositorySchema, req.body);
    const repository = await setRepository(projectId, input, admin.id);
    await writeAudit({
      actorId: admin.id,
      actorRole: admin.role,
      action: "repository.registered",
      entityType: "project",
      entityId: projectId,
      requestId: req.requestId,
      metadata: { provider: repository.provider, repository: repository.fullName, defaultBranch: repository.defaultBranch },
    });
    res.status(201).json(repository);
  }),
);

projectsRouter.delete(
  "/:id/repository",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const admin = currentUser(req);
    const projectId = uuidParam(req.params.id, "Project");
    const repository = await removeRepository(projectId);
    await writeAudit({
      actorId: admin.id,
      actorRole: admin.role,
      action: "repository.removed",
      entityType: "project",
      entityId: projectId,
      requestId: req.requestId,
      metadata: { provider: repository.provider, repository: repository.fullName },
    });
    res.status(204).send();
  }),
);
