import type { CoderId, Route } from './contracts';

// Picks the coder for a Task in code, never in a prompt (plan §7 "Router: chosen by code"): a Bug
// goes to the issue-solver, test work to the test-writer, otherwise the Task's discipline (from
// the Architect's Task description) and the Epic's backend framework decide.

export interface RouteInput {
  issueType: string;
  discipline: string | null;
  labels: string[];
  backend?: string | null;
}

const TEST_LABELS = /^(tests?|testing|qa|e2e)$/i;

export function routeTask(input: RouteInput): Route {
  if (/^bug$/i.test(input.issueType.trim())) return { coder: 'issue-solver', reason: 'the issue is a Bug' };
  const testLabel = input.labels.find((l) => TEST_LABELS.test(l.trim()));
  if (testLabel) return { coder: 'test-writer', reason: `labelled "${testLabel}"` };
  const backend: CoderId = /spring/i.test(input.backend ?? '') ? 'backend-spring' : 'backend-nestjs';
  switch (input.discipline) {
    case 'Frontend':
      return { coder: 'frontend-react', reason: 'Frontend Task' };
    case 'Backend':
    case 'Data':
    case 'AI':
    case 'Integration':
      return { coder: backend, reason: `${input.discipline} Task${input.backend ? ` on ${input.backend}` : ''}` };
    default:
      return { coder: 'issue-solver', reason: input.discipline ? `${input.discipline} Task (no specialist)` : 'no discipline on the Task' };
  }
}

// Which coder owns a file, for work split by file scope (V5 sub-tasks).
export function coderForFiles(files: string[], fallback: CoderId): CoderId {
  if (!files.length) return fallback;
  if (files.every((f) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(f) || /(^|\/)(e2e|tests?)\//.test(f))) return 'test-writer';
  if (files.every((f) => /\.(tsx|jsx|css|scss|html)$/.test(f) || /(^|\/)(web|frontend|client|ui)\//.test(f))) return 'frontend-react';
  if (files.every((f) => /\.java$|\.gradle$|pom\.xml$/.test(f))) return 'backend-spring';
  return fallback;
}
