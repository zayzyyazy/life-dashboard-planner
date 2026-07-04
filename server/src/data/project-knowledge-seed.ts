/**
 * Structured project knowledge — seeded into project_updates so the agent
 * has real context about Marie/Leaping, MCP, etc. even before chat updates.
 */

export const PROJECT_KNOWLEDGE_SEED = [
  {
    project_name: "Marie / Leaping AI",
    title: "What Leaping / Marie is",
    content: `Leaping AI — voice AI platform for businesses (phone agents, verification flows, CRM integrations). Marie is the product/agent side Zay works on part-time. Work spans product thinking, AI implementation, QA, and operational process improvement — not pure backend engineering.

Key people: Christopher (technical lead / constraints on MCP architecture — wants control over what MCP can execute). Marc and others on CRM/phone paths.`,
  },
  {
    project_name: "Marie / Leaping AI",
    title: "Current Marie priorities",
    content: `Deploy verification flows to live bot. Three "verification brains" need to run reliably before production deploy. Customer identification via phone number, birth date, and repeat/fallback paths. Balance between robust fallbacks and shipping a working v1.`,
  },
  {
    project_name: "MCP Server",
    title: "MCP architecture context",
    content: `Model Context Protocol server for Marie/Leaping — logic layer between LLM and backend functions. Christopher's constraint: MCP often cannot call functions directly; acts as decision/routing layer with state machine behavior. Zay has been debugging birthday parsing edge cases (customer typos, repeats, wrong formats).

Active tension: extensive fallback logic vs simplified route; modular state machine vs monolithic verification prompt; whether MCP should execute safe predefined actions vs pure routing.`,
  },
  {
    project_name: "MCP Server",
    title: "Technical blockers (from recent work)",
    content: `Birthday parsing failures when customers make mistakes or need to repeat input. Verification prompt may be too long/complex — candidate fix: modular prompts + prioritization inside MCP state machine. Goal: get 3 verification brains running for live deploy.`,
  },
  {
    project_name: "QA Call Analysis App",
    title: "Overview",
    content: `Call QA and analysis tooling for Leaping — reviewing agent call quality, patterns, failures. Connected to Marie product quality loop.`,
  },
  {
    project_name: "Life Planner Agent",
    title: "This repo",
    content: `Personal second brain — Telegram + SQLite + GitHub watcher + proactive briefs. Repo: zayzyyazy/life-dashboard-planner. Zay's own agent infrastructure experiment.`,
  },
];

/** Extra user_knowledge entries with project-specific detail */
export const PROJECT_USER_KNOWLEDGE_SEED = [
  {
    domain: "personal_work" as const,
    title: "Marie / Leaping AI — repos & scope",
    content:
      "Voice AI for businesses. Zay works on Marie agent, MCP integration, verification flows, CRM/phone paths. Christopher sets architecture constraints. Repos on GitHub under zayzyyazy and Leaping org — agent should use watched_repos list for live commit/PR data.",
  },
  {
    domain: "personal_work" as const,
    title: "MCP Server — what Zay is building",
    content:
      "MCP routes LLM decisions to verification steps. State machine for identification (phone, DOB, fallbacks). Cannot always call functions directly per Christopher. Current focus: birthday parsing bugs, shortening verification prompt, shipping 3 verification brains to production bot.",
  },
  {
    domain: "personal_work" as const,
    title: "Key people at work",
    content:
      "Christopher — technical lead, MCP architecture decisions, wants control over execution vs routing. Marc — CRM/phone path fixes. Zay sits between product and implementation.",
  },
];
