import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { errorMessage, logger } from "../../lib/logger.js";
import { writeAudit } from "../audit/index.js";
import { bridgeHub, type BridgeHub } from "./bridge.hub.js";
import { bridgeTickets, type TicketStore } from "./bridge.tickets.js";

// The ticket from POST /bridge/tickets is the only authentication.

const MAX_MESSAGE_BYTES = 8 * 1024 * 1024;
const PING_MS = 30_000;

export function attachBridge(server: Server, hub: BridgeHub = bridgeHub, tickets: TicketStore = bridgeTickets): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/bridge") return;
    const userId = tickets.redeem(url.searchParams.get("ticket"));
    if (!userId) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => accept(ws, userId));
  });

  function accept(ws: WebSocket, userId: string) {
    const connection = hub.connect(userId, ws);
    let alive = true;
    logger.info("bridge connected", { userId, connections: hub.connectionCount });
    void writeAudit({ actorId: userId, actorRole: "developer", action: "bridge.connected", entityType: "bridge", entityId: userId }).catch(() => undefined);

    ws.on("message", (data) => hub.receive(connection, data.toString()));
    ws.on("pong", () => {
      alive = true;
    });
    const ping = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, PING_MS);
    ws.on("close", () => {
      clearInterval(ping);
      hub.disconnect(connection.id);
      logger.info("bridge disconnected", { userId });
    });
    ws.on("error", (error) => logger.warn("bridge socket error", { userId, message: errorMessage(error) }));
  }

  return wss;
}
