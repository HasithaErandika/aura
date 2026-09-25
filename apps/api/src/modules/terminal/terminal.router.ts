import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { HttpError, forbidden } from "../../lib/http/errors.js";
import { parseOrThrow } from "../../lib/http/validate.js";
import { currentUser } from "../../middleware/auth.js";
import { canEditDevWorkspace } from "../policy/policy.js";
import { writeAudit } from "../audit/audit.service.js";
import { createToken } from "../identity/tokens.service.js";
import { encryptForRuntime, signTerminalTicket } from "./ticket.js";

// The web terminal under Scaffolded Project Files (docs/plans/aura-code-cli-council.md section
// 4.8). The shell itself runs in apps/agent-runtime (terminal/server.ts); this API decides who
// may open one and records that they did, by minting a short-lived, single-use ticket signed
// with TERMINAL_TICKET_SECRET. The browser presents it when it opens the WebSocket.

export const terminalRouter = Router();

const TICKET_TTL_MS = 60_000;
// Lifetime of the access token handed to the `aura` CLI inside a terminal session - long enough
// for a working day, short enough that a forgotten one expires on its own.
const TERMINAL_TOKEN_TTL_MS = 8 * 3_600_000;

const key = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const ticketSchema = z
  .object({
    epicKey: key,
    discipline: z.enum(["Frontend", "Backend", "Data", "AI", "Integration"]),
    taskKey: key.optional(),
  })
  .strict();

// POST /terminal/tickets - Developer role only: a terminal can change the Task's code, the same
// power as the file editor it sits under. Every session start is audited.
terminalRouter.post(
  "/tickets",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    if (!canEditDevWorkspace(user.role)) throw forbidden("Your role cannot open a terminal on project files");
    if (!env.terminalTicketSecret) throw new HttpError(503, "runtime_unavailable", "The web terminal is not enabled - set TERMINAL_TICKET_SECRET in apps/api and apps/agent-runtime");
    const body = parseOrThrow(ticketSchema, req.body);

    // A short-lived token of kind "terminal" so `aura` works in the shell without `aura login` -
    // the web session already proved who this is. Hidden from the Profile page's token list.
    const { token: cliToken } = await createToken(user.id, "Web terminal session", TERMINAL_TOKEN_TTL_MS, "terminal");

    const expiresAt = Date.now() + TICKET_TTL_MS;
    const ticket = signTerminalTicket(
      {
        userId: user.id,
        role: user.role,
        epicKey: body.epicKey.toUpperCase(),
        discipline: body.discipline,
        taskKey: body.taskKey?.toUpperCase() ?? null,
        exp: expiresAt,
        cli: { apiUrl: env.terminalCliApiUrl, token: encryptForRuntime(cliToken, env.terminalTicketSecret) },
      },
      env.terminalTicketSecret,
    );

    await writeAudit({
      actorId: user.id,
      actorRole: user.role,
      action: "terminal.session.start",
      entityType: "dev_workspace",
      entityId: `${body.epicKey}/${body.discipline}/${body.taskKey ?? "base"}`,
      requestId: req.requestId,
      metadata: { ...body, via: user.via },
    });
    res.status(201).json({ url: env.terminalWsUrl, ticket, expiresAt: new Date(expiresAt).toISOString() });
  }),
);
