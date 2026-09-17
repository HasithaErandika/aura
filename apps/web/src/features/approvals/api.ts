import { api } from "../../shared/api/client.ts";
import type { Approval, ApprovalStatus } from "../../types/api.ts";

export const approvalsApi = {
  list: (status?: ApprovalStatus[]) =>
    api.get<{ approvals: Approval[] }>(`/approvals${status?.length ? `?status=${status.join(",")}` : ""}`).then((r) => r.approvals),
  get: (id: string) => api.get<{ approval: Approval; run: { id: string; title: string | null; status: string; threadId: string } | null }>(`/approvals/${id}`),
};
