import { useState } from "react";
import { useAuth } from "../../shared/auth/useAuth.ts";
import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { Card } from "../../shared/ui/Card.tsx";
import { vscode } from "../../shared/lib/vscodeTheme.ts";
import { TaskModal } from "../jira/TaskModal.tsx";
import { designDocsApi } from "./api.ts";
import { projectFilesAccess } from "./access.ts";
import { useOpenFile, useProjectLists, useStartConversation, useWorkspaceLocation } from "./hooks.ts";
import { WorkspaceBar } from "./WorkspaceBar.tsx";
import { Explorer } from "./Explorer.tsx";
import { EditorPane } from "./EditorPane.tsx";
import { BottomPanel } from "./BottomPanel.tsx";
import { StatusBar } from "./StatusBar.tsx";
import { RunCiModal } from "./RunCiModal.tsx";

// Project Files - everything an Epic has produced, in one VS Code-style workspace:
// design documents (Gate 3), the test plan and Playwright specs (Gate 6) with their test runs
// (Gate 7), and a Task's code (Gate 4/5) with a terminal and the Runners view. It replaced the
// separate Design Documents, Scaffolded Files and QA Files & Test Runs pages.
//
// This file only composes; each concern lives in its own piece:
//   access.ts      who sees / edits what, and each role's defaults
//   sources.ts     one adapter per source (design / qa / code)
//   hooks.ts       URL-synced location, file lists, the open file (edit/save), agent requests
//   WorkspaceBar   Epic / discipline / Task + role actions
//   Explorer       per-source sections, filter
//   EditorPane     viewer/editor, Markdown preview, design comments
//   BottomPanel    Terminal · Test runs · Runners
//   StatusBar      where you are, what is open, editable or not

export function ProjectFilesPage() {
  const { profile } = useAuth();
  const access = projectFilesAccess(profile);
  const { location, selection, update } = useWorkspaceLocation();
  const { lists, tasks, epics } = useProjectLists(location, access);
  const open = useOpenFile(location, selection, access);
  const startConversation = useStartConversation();

  const [showPanel, setShowPanel] = useState(true);
  const [showCi, setShowCi] = useState(false);
  const [viewingTask, setViewingTask] = useState<string | null>(null);
  const panelVisible = showPanel && access.panelTabs.length > 0;
  const roleKey = profile?.role ?? "none";

  async function sendDesignFeedback(text: string) {
    if (!location) return;
    // Continue the conversation that produced this Epic's design (it still has the draftId to
    // revise); start a new one only if none is found.
    const { threadId } = await designDocsApi.thread(location.epicKey);
    await startConversation(
      threadId ? `Revise. Feedback: ${text}` : `Design the architecture for ${location.epicKey} (its Stories are already approved). Feedback to incorporate: ${text}`,
      threadId,
    );
  }

  return (
    <>
      <PageHeader title="Project Files" description="Everything an Epic produced - design, tests and code - in one workspace. What you see and can edit follows your role." />

      <WorkspaceBar
        location={location}
        access={access}
        epicSuggestions={epics.data ?? []}
        tasks={tasks.data ?? []}
        tasksLoading={tasks.loading}
        onOpenEpic={(epicKey) => update({ epicKey })}
        onDiscipline={(discipline) => update({ discipline })}
        onTask={(taskKey) => update({ taskKey })}
        onViewTask={setViewingTask}
        onRunCi={() => setShowCi(true)}
        onRunTests={() => location?.taskKey && void startConversation(`Run the tests for Task ${location.taskKey} under Epic ${location.epicKey}.`)}
        onCodeTask={() =>
          location?.taskKey &&
          void startConversation(
            `Draft the coding plan for Task ${location.taskKey} in Epic ${location.epicKey}: call delegate_to_code with mode "draft", epicKey "${location.epicKey}", taskKey "${location.taskKey}", provider "council". Show me the plan, then ask me to approve it before executing.`,
          )
        }
      />

      <Card className="flex flex-col overflow-hidden p-0">
        <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[300px_1fr]" style={{ height: panelVisible ? "82vh" : "70vh" }}>
          <Explorer
            key={roleKey}
            location={location}
            access={access}
            lists={lists}
            selection={selection}
            onSelect={(s) => update({ open: s })}
            headerAction={
              access.panelTabs.length ? (
                <button type="button" onClick={() => setShowPanel((v) => !v)} className="rounded px-1.5 py-0.5 text-[11px] hover:bg-white/10" style={{ color: vscode.text }} title="Show or hide the bottom panel">
                  {showPanel ? "Hide panel" : "Show panel"}
                </button>
              ) : null
            }
          />
          <div className="flex min-h-0 min-w-0 flex-col" style={{ backgroundColor: vscode.editorBg }}>
            <div className="flex min-h-0 flex-1 flex-col">
              <EditorPane hasLocation={Boolean(location)} selection={selection} open={open} canComment={access.commentOnDesign} onSendFeedback={sendDesignFeedback} />
            </div>
            {panelVisible ? (
              <div className="shrink-0" style={{ height: "38%" }}>
                <BottomPanel
                  key={roleKey}
                  access={access}
                  location={location}
                  onTerminalOutput={() => {
                    // Edits made from the terminal show up in the Explorer and the open file.
                    void lists.code.reload();
                    if (selection?.source === "code" && !open.editing) void open.file.reload();
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
        <StatusBar location={location} selection={selection} editable={open.canEdit} editing={open.editing} roleLabel={profile?.roleLabel ?? ""} />
      </Card>

      {showCi && location && (location.discipline === "Frontend" || location.discipline === "Backend") ? (
        <RunCiModal epicKey={location.epicKey} discipline={location.discipline} taskKey={location.taskKey} onClose={() => setShowCi(false)} />
      ) : null}
      {viewingTask ? <TaskModal issueKey={viewingTask} onClose={() => setViewingTask(null)} /> : null}
    </>
  );
}
