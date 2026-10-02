import { CardBody } from "@/shared/ui/CardBody.tsx";
import { Markdown } from "@/shared/ui/Markdown.tsx";
import { Section } from "@/shared/ui/Section.tsx";

export function SnapshotCard({ snapshot }: { snapshot: string }) {
  return (
    <Section title="What you are deciding on" description="The agent's output when it paused. Your decision is bound to this exact content.">
      <CardBody>
        <Markdown source={snapshot} className="text-sm text-ink-800" />
      </CardBody>
    </Section>
  );
}
