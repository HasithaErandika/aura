export type Tone = "neutral" | "success" | "warning" | "danger" | "brand" | "outline";

export type StateTone = Extract<Tone, "neutral" | "success" | "warning" | "danger">;
