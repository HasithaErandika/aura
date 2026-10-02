import { randomBytes } from "node:crypto";

// Short-lived, single-use tickets for opening the bridge WebSocket. A WebSocket handshake can't
// carry the usual Authorization header from every client, so the extension first asks for a
// ticket with its access token (POST /bridge/tickets), then connects with ?ticket=. The ticket is
// redeemed by this same process, so it lives in memory.

const TTL_MS = 60_000;

interface Ticket {
  userId: string;
  expiresAt: number;
}

export class TicketStore {
  private readonly tickets = new Map<string, Ticket>();

  issue(userId: string, now = Date.now()): { ticket: string; expiresAt: string } {
    this.sweep(now);
    const ticket = randomBytes(32).toString("base64url");
    this.tickets.set(ticket, { userId, expiresAt: now + TTL_MS });
    return { ticket, expiresAt: new Date(now + TTL_MS).toISOString() };
  }

  // The ticket's user, once; null if unknown, used or expired.
  redeem(ticket: string | null | undefined, now = Date.now()): string | null {
    if (!ticket) return null;
    const entry = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    return entry && entry.expiresAt > now ? entry.userId : null;
  }

  private sweep(now: number) {
    for (const [ticket, entry] of this.tickets) if (entry.expiresAt <= now) this.tickets.delete(ticket);
  }
}

export const bridgeTickets = new TicketStore();
