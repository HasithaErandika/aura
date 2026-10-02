import { api } from "@/shared/api/client.ts";
import type { Approval, ApprovalStatus } from "@/shared/api/types.ts";
import type { ApprovalDetail } from "./types.ts";

export const approvalsApi = {
  list: (status?: ApprovalStatus[]) => api.get<{ approvals: Approval[] }>(`/approvals${status?.length ? `?status=${status.join(",")}` : ""}`).then((r) => r.approvals),
  get: (id: string) => api.get<ApprovalDetail>(`/approvals/${id}`),
};
