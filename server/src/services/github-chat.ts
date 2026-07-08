import { config } from "../config.js";
import {
  buildGitHubContextText,
  ensureGitHubConnected,
  refreshGitHubContext,
} from "./github-context.js";
import { chatCompletion } from "./openai.js";

export async function answerGitHubQuestion(
  message: string,
  options: { short?: boolean } = {}
): Promise<string> {
  const status = await ensureGitHubConnected();
  if (!status.ok) {
    return options.short
      ? `GitHub not connected. Fix GITHUB_TOKEN in .env — run npm run test:github`
      : `GitHub isn't connected: ${status.error}\n\nFix: create a token at GitHub → Settings → Developer settings → Tokens (scope: repo). Add to .env as GITHUB_TOKEN=... then run npm run setup`;
  }

  const context = await refreshGitHubContext();
  if (!context.repos.length) {
    return options.short
      ? "No repos watched. Add GITHUB_TOKEN and run npm run setup"
      : "No GitHub repos are being watched yet. Add GITHUB_TOKEN to .env and run `npm run setup`, or say: watch https://github.com/you/repo";
  }

  const reply = await chatCompletion(
    [
      {
        role: "system",
        content: options.short
          ? `Answer about the user's GitHub repos using ONLY the data below. Be specific (repo names, commits, PRs). 2-4 sentences max.`
          : `Answer about the user's GitHub repos using ONLY the data below. Be specific — cite repo names, recent commits, open PRs/issues. Actionable and concise.`,
      },
      {
        role: "user",
        content: `GitHub data:\n${context.text}\n\nQuestion: ${message}`,
      },
    ],
    { tier: "planning", temperature: 0.3 }
  );

  return reply;
}

export async function getGitHubContextForBuildContext(): Promise<string> {
  const status = await ensureGitHubConnected();
  if (!status.ok) {
    return `### GitHub\nNot connected — ${status.error}. Set GITHUB_TOKEN in .env and run npm run setup`;
  }
  const ctx = await buildGitHubContextText();
  return ctx || "### GitHub\nNo repos watched yet.";
}
