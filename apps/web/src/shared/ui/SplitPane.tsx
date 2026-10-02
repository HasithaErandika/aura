import type { ReactNode } from "react";
import { Card } from "./Card.tsx";

export function SplitPane({ list, detail, listWidth = "lg:grid-cols-[300px_minmax(0,1fr)]" }: { list: ReactNode; detail: ReactNode; listWidth?: string }) {
  return (
    <Card className="overflow-hidden">
      <div className={`grid grid-cols-1 lg:h-[75vh] lg:min-h-[480px] ${listWidth}`}>
        <aside className="flex max-h-[50vh] min-h-0 flex-col border-b border-line lg:max-h-none lg:border-r lg:border-b-0">{list}</aside>
        <section className="flex min-h-0 min-w-0 flex-col">{detail}</section>
      </div>
    </Card>
  );
}
