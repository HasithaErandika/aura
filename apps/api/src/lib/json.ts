export function safeJson(text: string, maxChars = 500): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, maxChars);
  }
}
