export interface SseFrame {
  event: string;
  data: unknown;
  id: number | null;
}

export function parseSseFrame(frame: string): SseFrame | null {
  let event = "message";
  let id: number | null = null;
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    else if (line.startsWith("id:")) id = Number(line.slice(3).trim()) || null;
  }
  if (dataLines.length === 0) return null;
  const raw = dataLines.join("\n");
  try {
    return { event, data: JSON.parse(raw), id };
  } catch {
    return { event, data: raw, id };
  }
}

export function splitSseBuffer(buffer: string): { frames: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";
  return { frames: parts.filter((p) => p.trim().length > 0), rest };
}
