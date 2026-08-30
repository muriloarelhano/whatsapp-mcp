export const readOnlyTool = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function bounded(value: number | undefined, fallback: number, maximum: number): number {
  return Math.min(Math.max(value ?? fallback, 1), maximum);
}
