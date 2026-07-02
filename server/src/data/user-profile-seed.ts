/**
 * Default profile seed for Zay — loaded on first setup if profile is empty.
 * Edit via dashboard "About you" or chat: "Remember about me: ..."
 */

export const USER_PROFILE_SEED = {
  name: "Zay",
  summary: `University student in Germany studying Computer Science + Psychology. Over several years changed paths through philosophy, economics, design, media informatics, and communication design before realizing he enjoys solving real problems with technology. Degree matters for foundation, credibility, and opportunities — but most practical learning happens outside lectures through work, projects, documentation, and experimentation.

Four connected pillars: university, AI part-time job, personal projects, and self-directed learning. Long-term goal: understand technology well enough to build valuable AI products and eventually start an own company. More interested in creating useful systems than writing code for its own sake — thinks in workflows, business problems, and product value.

Currently in a transition from learner to builder. Wants to close gaps in backend engineering, databases, cloud, system design, testing, and business skills (customer discovery, pricing, GTM, validation). Financial independence and entrepreneurship matter long-term.`,
  personal_work_context: `Operates between product thinking, AI implementation, and process optimization at an AI-related part-time job. Enjoys understanding customer problems, designing AI workflows, testing systems, configuring agents, business logic, documentation, and improving operational processes.

Technical familiarity (not expert engineer, but understands how pieces fit): LLMs, APIs, REST, webhooks, MCP servers, backends, auth, deployments, CRM/ERP, prompt engineering, software architecture.

Projects include Marie/Leaping AI, MCP Server, QA Call Analysis, Life Planner Agent, Project Planner. Builds to learn specific concepts — projects exist to fill understanding gaps, not always as business opportunities.

Product thinking habits: Who would use this? What business problem does it solve? Would someone pay? Workflow integration? Time saved? Smallest version that proves the idea?

Wants to grow in: backend engineering, databases, networking, cloud infrastructure, deployment, system design, testing, debugging, maintainable production code.`,
  university_context: `Studying Computer Science + Psychology in Germany. Academic path changed multiple times before settling on technology for solving real problems. University is important but not the primary education source — lectures provide structure; real learning is work, projects, docs, and experimentation.

Keep university tasks, deadlines, and context separate from personal work projects.`,
  personal_life_context: `Based in Germany. Values curiosity, autonomy, ownership, continuous improvement, and practical learning.

Learning style: almost never stops at a simple answer — wants full system intuition (why something exists, how auth works, data flow, failure modes). Prefers mental models over memorizing facts. Can research for hours once interested.

Strengths: highly self-directed, curious, systems-oriented thinking, product intuition.
Weaknesses: tends to over-research before acting; sometimes underestimates own progress compared to experienced engineers/founders.`,
  preferences: `Keep university and personal work separate. Explanations: use intuition, mental models, real examples, architecture, business context — not just definitions. Prefer structured, honest, detailed answers over motivational fluff. Remind about execution balance when over-researching. Proactive but not naggy.`,
};

export const USER_KNOWLEDGE_SEED = [
  {
    domain: "general" as const,
    title: "Learning style",
    content:
      "Never stops at simple answers — wants full system understanding (why, auth, data flow, failure modes, why companies designed it that way). Builds mental models. Projects exist to learn specific technical concepts.",
  },
  {
    domain: "general" as const,
    title: "Strengths and weaknesses",
    content:
      "Highly self-directed and curious — can research for hours without losing motivation. Weakness: over-research before acting. Sometimes underestimates own abilities despite substantial recent growth (deployments, MCP, backends, architecture were unfamiliar months ago).",
  },
  {
    domain: "personal_work" as const,
    title: "Technical stack familiarity",
    content:
      "LLMs, APIs, REST, webhooks, MCP, backends, auth, deployments, CRM/ERP, prompt engineering, software architecture. Not expert engineer but understands how pieces fit in real systems.",
  },
  {
    domain: "personal_work" as const,
    title: "Product thinking questions",
    content:
      "Who uses this? What business problem? Would someone pay? Workflow integration? Time saved? Smallest version to prove the idea? Thinks in workflows, not isolated features.",
  },
  {
    domain: "personal_work" as const,
    title: "Career direction",
    content:
      "Goal is not to be the world's best programmer but to combine technical understanding with product intuition and business thinking. Eventually build an AI-focused company.",
  },
  {
    domain: "university" as const,
    title: "Academic mindset",
    content:
      "Degree matters for credibility and opportunities. Lectures are not the main learning source — work, projects, docs, and experimentation are. CS + Psychology dual study in Germany.",
  },
  {
    domain: "personal_life" as const,
    title: "Long-term direction",
    content:
      "Transition from learner to builder. Close engineering and business gaps while building increasingly ambitious AI products. Financial independence and sustainable business building matter.",
  },
];
