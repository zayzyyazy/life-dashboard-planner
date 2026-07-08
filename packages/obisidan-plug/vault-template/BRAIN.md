# Brain Vault

This vault is the long-term memory for your AI second brain.

## Folders

- `00-Inbox/` — new captures and AI drafts (review and file regularly)
- `01-Daily/` — daily notes (`YYYY-MM-DD.md`)
- `02-Areas/` — ongoing life areas (Uni, Job, Personal, Research, Building, Learning)
  - `Personal/About-Me.md` — agent's long-term memory about you (auto-synced from chat)
  - `Personal/Knowledge/` — individual facts (likes, dislikes, preferences)
- `03-Projects/` — time-bound projects
- `04-Resources/` — reference material
- `05-Archive/` — inactive notes

## How to use

1. Capture messy thoughts via Cursor MCP (`create_note_preview` → `create_note_commit`)
2. Ask questions via `ask_brain`
3. Organize inbox notes via `organize_note_preview` → `organize_note_commit`
4. Read and edit notes here in Obsidian

## Frontmatter conventions

- `source: ai` — created by the agent
- `status: inbox | filed | archive`
- `category` — Uni, Job, Personal, Research, Building, Learning
