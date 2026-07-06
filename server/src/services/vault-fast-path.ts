import {
  askBrain,
  createNotePreview,
  formatSearchResults,
  searchVault,
} from "./obsidian-brain.js";
import { setPendingObsidianSave } from "./obsidian-save.js";

export interface VaultFastPathResult {
  reply: string;
  handled: boolean;
}

export async function tryVaultFastPath(message: string): Promise<VaultFastPathResult | null> {
  const trimmed = message.trim();

  const searchMatch = trimmed.match(
    /^(?:search vault for|find in notes|\/search)\s+(.+)/i
  );
  if (searchMatch) {
    const query = searchMatch[1].trim();
    try {
      const hits = await searchVault(query, 8);
      return {
        handled: true,
        reply: formatSearchResults(hits),
      };
    } catch (err) {
      return {
        handled: true,
        reply: `Vault search failed: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  }

  const saveMatch = trimmed.match(/^(?:save to obsidian:|save:)\s+(.+)/is);
  if (saveMatch) {
    const raw = saveMatch[1].trim();
    try {
      const preview = await createNotePreview(raw);
      setPendingObsidianSave({
        previewId: preview.id,
        summary: preview.previewText.slice(0, 200),
        sourceText: raw,
        createdAt: new Date().toISOString(),
      });
      const body = preview.previewText.slice(0, 700);
      return {
        handled: true,
        reply: `${body}\n\n💾 Save to Obsidian? Reply yes / no / edit: …`,
      };
    } catch (err) {
      return {
        handled: true,
        reply: `Couldn't create preview: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  }

  const askMatch = trimmed.match(
    /^(?:what did i write about|ask vault:|\/ask)\s+(.+)/i
  );
  if (askMatch) {
    const question = askMatch[1].trim();
    try {
      const answer = await askBrain(question);
      return { handled: true, reply: answer };
    } catch (err) {
      return {
        handled: true,
        reply: `Vault Q&A failed: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  }

  return null;
}
