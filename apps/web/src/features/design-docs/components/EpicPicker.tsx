import { Select } from "@/shared/ui/Select.tsx";
import type { DocEpic } from "../types.ts";

export function EpicPicker({ epics, value, onChange }: { epics: DocEpic[]; value: string | null; onChange: (epicKey: string) => void }) {
  return (
    <Select aria-label="Epic" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      {epics.map((e) => (
        <option key={e.epicKey} value={e.epicKey}>
          {e.documents ? `${e.epicKey} (${e.documents})` : e.epicKey}
        </option>
      ))}
    </Select>
  );
}
