/** Generic words that must NOT become 03-Projects/{slug} folders. */
const GENERIC_SLUGS = new Set([
  "university",
  "uni",
  "work",
  "personal",
  "job",
  "learning",
  "research",
  "building",
  "project",
  "general",
  "note",
  "update",
  "progress",
  "reflection",
  "lectures",
  "planning",
  "starting",
  "ideas",
  "area",
  "life",
  "school",
  "college",
]);

export function slugifyProjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function isGenericProjectSlug(slug: string): boolean {
  const s = slug.toLowerCase().replace(/^-|-$/g, "");
  if (!s || s.length < 2) return true;
  if (GENERIC_SLUGS.has(s)) return true;
  return GENERIC_SLUGS.has(s.split("-")[0]!);
}

export function isGenericProjectName(name: string | null | undefined): boolean {
  if (!name?.trim()) return true;
  return isGenericProjectSlug(slugifyProjectName(name.trim()));
}
