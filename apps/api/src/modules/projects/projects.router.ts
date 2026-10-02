import { Router } from "express";
import { currentUser, requireRole } from "../../lib/auth/user.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { parseOrThrow, uuidParam } from "../../lib/http/validate.js";
import { auditActor, writeAudit } from "../audit/index.js";
import { createProjectSchema, repositorySchema } from "./projects.schemas.js";
import { createProject, deleteProject, listProjects, removeRepository, setRepository } from "./projects.service.js";

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
    const project = await createProject(parseOrThrow(createProjectSchema, req.body), currentUser(req).id);
    await writeAudit({ ...auditActor(req), action: "project.created", entityType: "project", entityId: project.id, metadata: { key: project.key, jiraProjectKey: project.jiraProjectKey } });
    res.status(201).json(project);
  }),
);

projectsRouter.delete(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const project = await deleteProject(uuidParam(req.params.id, "Project"));
    await writeAudit({ ...auditActor(req), action: "project.deleted", entityType: "project", entityId: project.id, metadata: { key: project.key, repository: project.repository?.fullName ?? null } });
    res.status(204).send();
  }),
);

projectsRouter.put(
  "/:id/repository",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const projectId = uuidParam(req.params.id, "Project");
    const repository = await setRepository(projectId, parseOrThrow(repositorySchema, req.body), currentUser(req).id);
    await writeAudit({ ...auditActor(req), action: "repository.registered", entityType: "project", entityId: projectId, metadata: { provider: repository.provider, repository: repository.fullName, defaultBranch: repository.defaultBranch } });
    res.status(201).json(repository);
  }),
);

projectsRouter.delete(
  "/:id/repository",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const projectId = uuidParam(req.params.id, "Project");
    const repository = await removeRepository(projectId);
    await writeAudit({ ...auditActor(req), action: "repository.removed", entityType: "project", entityId: projectId, metadata: { provider: repository.provider, repository: repository.fullName } });
    res.status(204).send();
  }),
);
