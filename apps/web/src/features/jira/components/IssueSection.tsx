import { SectionTitle } from "@/shared/ui/SectionTitle.tsx";
import type { JiraIssueSummary } from "../types.ts";
import { IssueRow, type IssueIcon } from "./IssueRow.tsx";

export function IssueSection({ title, issues, icon, onChanged }: { title: string; issues: JiraIssueSummary[]; icon: IssueIcon; onChanged: () => void }) {
  return (
    <section className="border-b border-line px-4 py-4 last:border-b-0 sm:px-5">
      <SectionTitle count={issues.length}>{title}</SectionTitle>
      {issues.length === 0 ? (
        <p className="text-xs text-ink-400">No {title.toLowerCase()} filed under this Epic yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {issues.map((issue) => (
            <IssueRow key={issue.key} issue={issue} icon={icon} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </section>
  );
}
