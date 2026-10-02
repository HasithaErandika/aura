import { env } from "../config/env.js";

export function webUrl(path: string): string {
  return `${env.webOrigin[0] ?? "http://localhost:5173"}${path}`;
}
