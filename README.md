# cursor-api-proxy-for-copilot

Use Cursor's AI models inside VSCode via GitHub Copilot Chat. This proxy bridges [OAI Compatible Provider for Copilot](https://marketplace.visualstudio.com/items?itemName=johnny-zhao.oai-compatible-copilot) to Cursor CLI, letting you leverage your Cursor subscription directly in VSCode's Copilot Chat panel.

> Forked from [anyrobert/cursor-api-proxy](https://github.com/anyrobert/cursor-api-proxy) with enhancements for Copilot integration and Windows portability.

## What's Different from Upstream

| Feature | Upstream | This Fork |
|---------|----------|-----------|
| Streaming output | Duplicate final message | Stateful deduplication parser |
| Windows long prompts | Fails when >8KB (cmd.exe limit) | Bypasses cmd.exe via direct node.exe invocation |
| Execution mode | Hardcoded `ask` | Auto-detect from Copilot's `tools` field (ask/agent) |
| Workspace detection | Manual header or config | Auto-detect from file paths in Copilot messages |
| Child process env | Inherits all proxy env vars | Sanitized — proxy internals hidden from model |
| Portable startup | Not provided | `start.cmd` + `agent-wrapper.cmd` for Windows |

## How It Works

```
┌─────────────────┐     HTTP/SSE      ┌──────────────┐    spawn     ┌────────────┐
│  VSCode Copilot  │ ───────────────▶ │  This Proxy  │ ──────────▶ │ Cursor CLI │
│  Chat Panel      │ ◀─────────────── │  :8765       │ ◀────────── │  (agent)   │
└─────────────────┘   OpenAI format   └──────────────┘  stream-json └────────────┘
```

1. **Copilot** sends an OpenAI-compatible request to `http://127.0.0.1:8765/v1`
2. **Proxy** extracts messages, detects mode & workspace, spawns Cursor CLI
3. **CLI** processes the prompt using your Cursor subscription models
4. **Proxy** converts the CLI's `stream-json` output back to SSE and returns it

## Quick Start

### Prerequisites

- **Node.js** 18+
- **Cursor CLI** (`agent`) — version **2026.02.27-e7d2ef6** or later

  ```bash
  curl https://cursor.com/install -fsS | bash
  agent login
  ```

- **VSCode** with [OAI Compatible Provider for Copilot](https://marketplace.visualstudio.com/items?itemName=johnny-zhao.oai-compatible-copilot)

### Install & Build

```bash
git clone https://github.com/Hceax/cursor-api-proxy-for-copilot.git
cd cursor-api-proxy-for-copilot
npm install
npm run build
```

### Run

```bash
npm start
# or: node dist/cli.js
```

**Windows portable mode** (recommended for CursorToolkit-style setups):

Edit `start.cmd` to point `CURSOR_AGENT_NODE` and `CURSOR_AGENT_SCRIPT` to your Cursor CLI's node.exe and index.js, then:

```cmd
start.cmd
```

### Configure VSCode

In VSCode `settings.json`:

```json
{
  "oaicopilot.baseUrl": "http://127.0.0.1:8765/v1",
  "oaicopilot.models": [
    {
      "id": "claude-4-opus",
      "configId": "cursor-opus",
      "owned_by": "cursor-proxy"
    }
  ]
}
```

The `id` can be any model available in your Cursor subscription. Use `agent --list-models` to see available models.

## Key Features

### Auto Mode Detection

When Copilot sends `tools` or `functions` in the request body, the proxy automatically switches to **agent** mode (allowing file creation/editing). Without tools, it defaults to **ask** mode (read-only).

### Auto Workspace Detection

The proxy scans Copilot's system/user messages for absolute file paths (e.g. `@file` references) and infers your project root. No manual `X-Cursor-Workspace` header needed — the model automatically operates in your VSCode project directory.

Priority order:
1. `X-Cursor-Workspace` header (explicit override)
2. Paths detected from request messages (auto)
3. `CURSOR_BRIDGE_WORKSPACE` env var (fallback)

### Stream Deduplication

Cursor CLI's `stream-json` format emits incremental deltas followed by a final full-text message. The stateful parser tracks accumulated text and only forwards new content, preventing duplicate output.

### Environment Sanitization

The proxy strips its own internal variables (`CURSOR_AGENT_*`, `CURSOR_BRIDGE_*`, etc.) from the child process environment and restores standard system paths. This prevents the AI model from seeing proxy infrastructure details.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server and config info |
| GET | `/v1/models` | List available Cursor models |
| POST | `/v1/chat/completions` | Chat completion (OpenAI format, supports `stream: true`) |
| POST | `/v1/messages` | Anthropic Messages API (supports `stream: true`) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CURSOR_AGENT_BIN` | `agent` | Path to Cursor CLI binary or wrapper script |
| `CURSOR_AGENT_NODE` | — | Path to node.exe (Windows: bypasses cmd.exe length limit) |
| `CURSOR_AGENT_SCRIPT` | — | Path to CLI's index.js (used with `CURSOR_AGENT_NODE`) |
| `CURSOR_BRIDGE_HOST` | `127.0.0.1` | Bind address |
| `CURSOR_BRIDGE_PORT` | `8765` | Port |
| `CURSOR_BRIDGE_API_KEY` | — | Require `Authorization: Bearer <key>` on requests |
| `CURSOR_BRIDGE_MODE` | `ask` | Default execution mode: `ask`, `agent`, or `plan` |
| `CURSOR_BRIDGE_WORKSPACE` | process cwd | Fallback workspace directory |
| `CURSOR_BRIDGE_DEFAULT_MODEL` | `auto` | Default model when request omits one |
| `CURSOR_BRIDGE_FORCE` | `false` | Pass `--force` to Cursor CLI |
| `CURSOR_BRIDGE_APPROVE_MCPS` | `false` | Pass `--approve-mcps` to Cursor CLI |
| `CURSOR_BRIDGE_TIMEOUT_MS` | `300000` | Timeout per completion (ms) |
| `CURSOR_BRIDGE_CHAT_ONLY_WORKSPACE` | `true` | When `true`, CLI runs in temp dir (can't touch your project). Set `false` for Copilot use. |
| `CURSOR_BRIDGE_VERBOSE` | `false` | Print full request/response content to stdout |
| `CURSOR_BRIDGE_SESSIONS_LOG` | `~/.cursor-api-proxy/sessions.log` | Request log path |
| `CURSOR_BRIDGE_TLS_CERT` | — | TLS certificate file path (for HTTPS) |
| `CURSOR_BRIDGE_TLS_KEY` | — | TLS private key file path (for HTTPS) |

### Recommended Copilot Settings

For use with Copilot, set these in your startup script or environment:

```bash
CURSOR_BRIDGE_MODE=agent
CURSOR_BRIDGE_CHAT_ONLY_WORKSPACE=false
CURSOR_BRIDGE_FORCE=true
```

## Troubleshooting

**"Command not found: agent"**
Set `CURSOR_AGENT_BIN` to the full path of your Cursor CLI binary.

**"The command line is too long" (Windows)**
Set `CURSOR_AGENT_NODE` and `CURSOR_AGENT_SCRIPT` to directly invoke node.exe, bypassing cmd.exe's 8KB argument limit.

**Duplicate responses in streaming mode**
This is fixed in this fork. Make sure you're using the built version (`npm run build`).

**Model sees proxy internal paths**
This fork sanitizes the child process environment. Rebuild and restart if you see proxy-related paths in model output.

## Acknowledgments

This project is built upon [cursor-api-proxy](https://github.com/anyrobert/cursor-api-proxy) by [@anyrobert](https://github.com/anyrobert). Thanks to the original author for creating the OpenAI-compatible proxy for Cursor CLI, which made this Copilot integration possible.

## License

MIT — same as the upstream project.
