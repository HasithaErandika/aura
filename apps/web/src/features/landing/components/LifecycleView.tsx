import { useEffect, useState } from "react";
import { RunIcon } from "@/shared/icons/index.tsx";
import { PIPELINE } from "@/shared/lib/pipeline.ts";
import { Button } from "@/shared/ui/Button.tsx";
import { StageDetail } from "./StageDetail.tsx";
import { StageNode } from "./StageNode.tsx";

export function LifecycleView() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % PIPELINE.length), 2000);
    return () => window.clearInterval(timer);
  }, [playing]);

  const select = (i: number) => {
    setPlaying(false);
    setIndex(i);
  };

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" icon={<RunIcon className="size-4" />} onClick={() => setPlaying((p) => !p)}>
            {playing ? "Pause" : "Play the workflow"}
          </Button>
          <Button size="sm" onClick={() => select(0)}>
            Reset
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-600">
          <span>
            Step {index + 1} of {PIPELINE.length}
          </span>
          <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => select(index - 1)}>
            Prev
          </Button>
          <Button size="sm" variant="ghost" disabled={index === PIPELINE.length - 1} onClick={() => select(index + 1)}>
            Next
          </Button>
        </div>
      </div>
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {PIPELINE.map((stage, i) => (
          <li key={stage.key}>
            <StageNode stage={stage} state={i === index ? "active" : i < index ? "passed" : "next"} onSelect={() => select(i)} />
          </li>
        ))}
      </ol>
      <StageDetail stage={PIPELINE[index]!} />
    </div>
  );
}
