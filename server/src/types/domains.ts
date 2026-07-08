export type LifeDomain = "personal_work" | "university" | "personal_life" | "general";

export const LIFE_DOMAINS: { id: LifeDomain; label: string; description: string }[] = [
  {
    id: "personal_work",
    label: "Personal work",
    description: "Startups, Marie/Leaping AI, MCP, QA app, client projects, coding work",
  },
  {
    id: "university",
    label: "University",
    description: "Courses, lectures, assignments, exams, professors, campus life",
  },
  {
    id: "personal_life",
    label: "Personal life",
    description: "Health, family, errands, hobbies — not work or school",
  },
  {
    id: "general",
    label: "General",
    description: "Cross-cutting facts about you that apply everywhere",
  },
];

export function domainLabel(domain: string): string {
  return LIFE_DOMAINS.find((d) => d.id === domain)?.label ?? domain;
}

export function isLifeDomain(value: string): value is LifeDomain {
  return LIFE_DOMAINS.some((d) => d.id === value);
}
