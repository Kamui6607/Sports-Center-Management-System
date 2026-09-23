/** Supports the current many-to-many response and older cached responses. */
export function classSports(value: unknown): { id: string; name: string }[] {
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  const entries = Array.isArray(row.sports)
    ? row.sports
    : row.sport
      ? [row.sport]
      : [];
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const sport = entry.sport || entry;
    return typeof sport.name === "string"
      ? [{ id: String(sport.id || entry.sportId || ""), name: sport.name }]
      : [];
  });
}
export const sportNames = (value: unknown) =>
  classSports(value)
    .map((s) => s.name)
    .join(" · ") || "Chưa phân loại";
