/**
 * Default profile seed for Zay — loaded on first setup if profile is empty.
 * Edit via dashboard "About you" or chat: "Remember about me: ..."
 */

export const USER_PROFILE_SEED = {
  name: "Zay",
  summary: `University student in Germany (CS + Psychology). Thinks in systems, not isolated tasks — builds complete mental models by connecting APIs, MCPs, business models, AI, psychology, and product design until things click. Dislikes surface-level explanations; wants why, how things connect, when they break, real-world application.

Four pillars: university, AI part-time job, personal projects, self-directed learning. Long-term: sit between business and technology — design, automate, and sell intelligent systems; build leverage over short-term wins. Transitioning from learner to builder; often underestimates own progress vs experienced engineers.

Needs: realistic assessments (strengths + gaps), specific advice not generic AI answers, help prioritizing when work/uni/projects/interviews compete, structured learning paths instead of topic-hopping.`,
  personal_work_context: `AI part-time job + personal projects (Marie/Leaping AI, MCP Server, QA Call Analysis, Life Planner). Builds agents, automations, MCP servers, prototypes. Understands LLMs, APIs, REST, webhooks, backends, auth, deployments, CRM/ERP, architecture — practical familiarity from building, not textbook mastery.

Product lens: who uses it, what business problem, would someone pay, workflow integration, smallest version that proves the idea. Researching companies for interviews: how they make money, who buys, internal processes, where AI fits.

Current gaps being filled: APIs, backend architecture, databases, deployment, hosting, auth, MCPs, integrations, webhooks, cloud, production AI systems. Explain with practical examples first.`,
  university_context: `CS + Psychology in Germany. Degree matters for credibility; real learning is work + projects + docs. Time management is constant — uni, job, projects, interviews, logistics, finances all compete. Needs prioritization and structure, not motivation speeches. Keep uni context separate from work projects.`,
  personal_life_context: `Based in Germany. Financially careful — budgets, rent, work hours, strategic investment in education/tools. Self-aware: sometimes over-researches, overcomplicates, compares self to experts, feels behind despite real progress. Wants honest simplification when stuck in research mode.`,
  preferences: `Voice: thoughtful collaborator / second brain — NOT search engine, NOT babysitter, NOT cheerleader. Information-dense, conversational, honest, precise. No motivational fluff, corporate wording, repetitive bullets, or echoing messages back. Challenge assumptions; compare trade-offs; point out over-researching. Connect ideas across conversations. Proactive but not naggy. Interview prep: deep company understanding, natural answers tied to his projects. Learning: mental models, analogies, layered explanations — don't oversimplify or jump to jargon.`,
};

export const USER_KNOWLEDGE_SEED = [
  {
    domain: "general" as const,
    title: "Thinking style",
    content:
      "Rarely asks questions just for answers — building a complete mental model. Connects concepts across APIs, MCPs, business, AI, psychology until it clicks. If confused, needs new analogies/perspectives, not rephrased same explanation.",
  },
  {
    domain: "general" as const,
    title: "Communication preferences",
    content:
      "Hates generic AI answers, long obvious intros, fake confidence, command menus. Wants specific advice for his situation. Long responses OK if every paragraph adds value. Tell him directly if something is unrealistic or if he's overthinking something small.",
  },
  {
    domain: "general" as const,
    title: "Strengths and blind spots",
    content:
      "Strengths: self-directed, systems thinking, product intuition, builds real AI tools. Weaknesses: underestimates own progress, over-researches before acting, sometimes overcomplicates. Help recognize what he already knows while naming the next gap clearly.",
  },
  {
    domain: "personal_work" as const,
    title: "Career direction",
    content:
      "Between business and technology — workflow automation, AI agents, product thinking, solution consulting, integrations, UX, understanding how companies operate internally. Goal: walk into a company, find bottlenecks, build AI solutions with measurable impact.",
  },
  {
    domain: "personal_work" as const,
    title: "Technical learning priorities",
    content:
      "APIs, backend architecture, databases, deployment, hosting, auth, MCPs, servers, integrations, webhooks, cloud, CRM/ERP, software architecture, production AI. Project-driven — connects learning to what he's building.",
  },
  {
    domain: "personal_work" as const,
    title: "Current focus areas",
    content:
      "Interview prep (AI/digitalization/automation/consulting), filling engineering fundamentals without losing product perspective, shipping AI products that solve real business problems, fewer high-impact projects vs chasing every idea.",
  },
  {
    domain: "university" as const,
    title: "Academic balance",
    content:
      "Completing degree while balancing part-time work. Needs help deciding what deserves attention today vs can wait — structure and prioritization over motivation.",
  },
  {
    domain: "personal_life" as const,
    title: "Financial mindset",
    content:
      "Careful with money — rent, monthly expenses, work hours, long-term investments. Practical advice for actual circumstances; strategic spending on education and tools OK.",
  },
];
