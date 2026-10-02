import type { FormEvent, ReactNode } from "react";
import { Card } from "./Card.tsx";

export function FilterBar({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }
  return (
    <Card className="p-4">
      <form role="search" onSubmit={submit} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {children}
      </form>
    </Card>
  );
}
