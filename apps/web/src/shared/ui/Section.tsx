import type { ReactNode } from "react";
import { Card } from "./Card.tsx";
import { CardHeader } from "./CardHeader.tsx";

export function Section({ title, description, actions, className, children }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <Card className={className}>
      <CardHeader title={title} description={description} actions={actions} />
      {children}
    </Card>
  );
}
