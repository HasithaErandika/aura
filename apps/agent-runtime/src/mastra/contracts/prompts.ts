import { untrusted, untrustedInline } from '../gateway/untrusted';

// Draft prompts for the single-call agents, shared by the delegate tools that send them and the
// evals that score them (evals/), so an eval always measures the prompt production sends.
// Everything that comes from Jira or the requester goes through untrusted() (gateway/untrusted.ts).

export interface IssueText {
  key: string;
  summary: string;
  description?: string | null;
  status?: string | null;
}

export function poDraftPrompt(requirement: string, stakeholders?: string | null): string {
  const people = stakeholders ? `\n\nStakeholders given by the requester:\n${untrusted('requester: stakeholders', stakeholders)}` : '';
  return `Draft an Epic for this business requirement.\n\nRequirement:\n${untrusted('requester: requirement', requirement.trim())}${people}`;
}

export function baDraftPrompt(epic: IssueText): string {
  return `Break this approved Epic into Stories. Set epicKey to "${epic.key}".\n\nEpic ${epic.key}: ${untrustedInline(`jira:${epic.key} summary`, epic.summary)}\nStatus: ${epic.status || 'unknown'}\n\n${untrusted(`jira:${epic.key} description`, epic.description)}`;
}

export function deployDraftPrompt(epic: IssueText, tasks: IssueText[]): string {
  const tasksText = untrusted(`jira:${epic.key} tasks`, tasks.map((t) => `- ${t.key}: ${t.summary}\n${t.description || '(no description)'}`).join('\n\n'));
  return `Draft a release plan for Epic ${epic.key}: ${untrustedInline(`jira:${epic.key} summary`, epic.summary)}.\n\nFiled Tasks:\n${tasksText}\n\nReturn only the JSON the schema describes.`;
}
