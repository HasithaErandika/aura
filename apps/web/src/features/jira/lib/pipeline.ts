import { stagesFor, type PipelineStage } from "@/shared/lib/pipeline.ts";
import type { JiraComment } from "../types.ts";

export type StageState = "done" | "pending" | "vscode";

export interface StageProgress extends PipelineStage {
  state: StageState;
}

export function stageState(stage: PipelineStage, comments: JiraComment[]): StageState {
  const stamp = `created by: aura · ${stage.agentLabel.toLowerCase()}`;
  if (comments.some((c) => c.body.toLowerCase().includes(stamp))) return "done";
  return stage.surface === "vscode" ? "vscode" : "pending";
}

export function pipelineProgress(issueType: string, comments: JiraComment[]): StageProgress[] {
  return stagesFor(issueType).map((stage) => ({ ...stage, state: stageState(stage, comments) }));
}
