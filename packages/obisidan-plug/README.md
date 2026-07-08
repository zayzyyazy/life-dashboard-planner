# Obisidan-Plug — Obsidian AI Second Brain

Local-first MCP server that reads/writes your Obsidian vault, indexes notes in SQLite, and exposes AI tools to Cursor.

## Quick start

### 1. Bootstrap vault

```bash
npm run bootstrap-vault
```

Creates `~/Documents/Brain-Vault` with folder layout and Obsidian daily-notes config.  
Open in Obsidian: **File → Open folder as vault**.

### 2. Configure API key

```bash
mkdir -p ~/.brain
cp .env.example ~/.brain/.env
# Edit ~/.brain/.env — add OPENAI_API_KEY
```

Or set env vars in Cursor MCP config (see below).

### 3. Build

```bash
npm install
npm run build
```

### 4. Register MCP in Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "brain-vault": {
      "command": "node",
      "args": ["/Users/zay/Obisidan-Plug/dist/mcp/server.js"],
      "env": {
        "VAULT_PATH": "/Users/zay/Documents/Brain-Vault",
        "OPENAI_API_KEY": "your-key-here"
      }
    }
  }
}
```

Restart Cursor. The `brain-vault` tools will appear in chat.

### 5. Terminal CLI (optional)

```bash
npm run brain
```

Commands: `status`, `search <query>`, `read <path>`, `ask <question>`, `capture <text>`, `reindex`, `exit`

## MCP tools

| Tool | Description |
|------|-------------|
| `vault_status` | Vault path, note count, index status |
| `list_notes` | List notes (optional folder filter) |
| `read_note` | Read one note by path |
| `search_notes` | Full-text search (FTS5) |
| `find_related` | Jaccard similarity related notes |
| `ask_brain` | Q&A over notes with citations |
| `create_note_preview` | Structure messy input → preview |
| `create_note_commit` | Write previewed note to vault |
| `organize_note_preview` | Propose filing an inbox note |
| `organize_note_commit` | Move/update after approval |
| `reindex_vault` | Rebuild search index |

## Vault layout

```
Brain-Vault/
  00-Inbox/       # new captures
  01-Daily/       # daily notes
  02-Areas/       # Uni, Job, Personal, Research, Building, Learning
  03-Projects/
  04-Resources/
  05-Archive/
  Templates/
```

## Data locations

| Path | Purpose |
|------|---------|
| `~/Documents/Brain-Vault` | Obsidian markdown vault |
| `~/.brain/index.db` | SQLite FTS search index |
| `~/.brain/previews/` | Pending create/organize previews |
| `~/.brain/audit.log` | Tool action audit log |
| `~/.brain/.env` | API keys (optional) |

## Typical workflows

**Capture a messy thought:**
1. `create_note_preview` with raw text
2. Review preview + duplicate warnings
3. `create_note_commit` with preview ID

**Ask a question:**
- `ask_brain`: "What did I write about my exam plan?"

**Organize inbox:**
1. `organize_note_preview` with inbox note path
2. Review proposed move/tags/wikilinks
3. `organize_note_commit` with preview ID

## Environment variables

| Variable | Default |
|----------|---------|
| `VAULT_PATH` | `~/Documents/Brain-Vault` |
| `BRAIN_DATA_DIR` | `~/.brain` |
| `OPENAI_API_KEY` | (required for AI tools) |
| `AI_PROVIDER` | `openai` |
| `OPENAI_MODEL` | `gpt-4.1-mini` |
| `EXCLUDE_PATHS` | `05-Archive/Private` |

## Development

```bash
npm run dev:mcp    # run MCP server via tsx
npm run bootstrap-vault
npm run brain      # terminal CLI
```
