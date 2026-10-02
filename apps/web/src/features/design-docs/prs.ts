import { api } from "../../shared/api/client.ts";
import type { TaskPr } from "./ci.ts";

export * from "./ci.ts";

export const taskPrsApi = {
  list: (epicKey: string | null) => api.get<{ taskPrs: TaskPr[] }>(`/task-prs${epicKey ? `?epicKey=${encodeURIComponent(epicKey)}` : ""}`),
};
