// Markdown list for draft renderers; an empty list reads "- none".
export function bullets(items: string[]): string {
  return items.length ? items.map((i) => `- ${i}`).join('\n') : '- none';
}
