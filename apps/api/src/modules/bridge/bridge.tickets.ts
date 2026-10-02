import { randomBytes } from "node:crypto";

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
