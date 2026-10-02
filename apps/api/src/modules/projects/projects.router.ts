import { Router } from "express";
import { currentUser, requireRole } from "../../lib/auth/user.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { parseOrThrow, uuidParam } from "../../lib/http/validate.js";
import { auditActor, writeAudit } from "../audit/index.js";
import { createProjectSchema, memberSchema, repositorySchema } from "./projects.schemas.js";
import { addMember, createProject, deleteProject, listMembers, listProjects, removeMember, removeRepository, setRepository } from "./projects.service.js";

export const projectsRouter = Router();

projectsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ projects: await listProjects(currentUser(req)) });
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

projectsRouter.get(
  "/:id/members",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    res.json({ members: await listMembers(uuidParam(req.params.id, "Project")) });
  }),
);

projectsRouter.post(
  "/:id/members",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const projectId = uuidParam(req.params.id, "Project");
    const { userId } = parseOrThrow(memberSchema, req.body);
    const added = await addMember(projectId, userId, currentUser(req).id);
    if (added) await writeAudit({ ...auditActor(req), action: "project.member_added", entityType: "project", entityId: projectId, metadata: { userId } });
    res.status(added ? 201 : 200).json({ added });
  }),
);

projectsRouter.delete(
  "/:id/members/:userId",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const projectId = uuidParam(req.params.id, "Project");
    const userId = uuidParam(req.params.userId, "User");
    await removeMember(projectId, userId);
    await writeAudit({ ...auditActor(req), action: "project.member_removed", entityType: "project", entityId: projectId, metadata: { userId } });
    res.status(204).send();
  }),
);
