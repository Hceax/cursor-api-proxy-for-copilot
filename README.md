# cursor-api-proxy-for-copilot

Use Cursor's AI models inside VSCode via GitHub Copilot Chat. This proxy bridges [OAI Compatible Provider for Copilot](https://marketplace.visualstudio.com/items?itemName=johnny-zhao.oai-compatible-copilot) to Cursor CLI, letting you leverage your Cursor subscription directly in VSCode's Copilot Chat panel.

> Forked from [anyrobert/cursor-api-proxy](https://github.com/anyrobert/cursor-api-proxy) with enhancements for Copilot integration, session management, and Windows portability.

## What's Different from Upstream

| Feature | Upstream | This Fork |
|---------|----------|-----------|
| Session management | Stateless — full context every request | Persistent sessions with `--resume chatId` |
| Checkpoint restore | Not supported | Detects Copilot rollbacks, creates new session |
| Streaming output | Duplicate final message | Stateful deduplication parser |
| Copilot system prompts | Passed to CLI (wastes tokens) | Stripped for new sessions |
| Windows long prompts | Fails when >8KB (cmd.exe limit) | Bypasses cmd.exe via direct node.exe invocation |
| Execution mode | Hardcoded `ask` | Auto-detect from Copilot's `tools` field |
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
2. **Proxy** extracts messages, detects mode & workspace, manages session state
3. **CLI** processes the prompt using your Cursor subscription models (with `--resume` for existing sessions)
4. **Proxy** converts the CLI's `stream-json` output back to SSE and returns it

## Quick Start

### Prerequisites

- **Node.js** 18+
- **Cursor CLI** (`agent`) — install and authenticate:

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

Edit `start.cmd` to point `CURSOR_AGENT_NODE` and `CURSOR_AGENT_SCRIPT` to your Cursor CLI's `node.exe` and `index.js`, then:

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
      "id": "opus-4.6-thinking",
      "configId": "cursor-opus-thinking",
      "owned_by": "cursor-proxy"
    }
  ]
}
```

Use `agent --list-models` to see all models available in your Cursor subscription.

## Key Features

### Session Management

The proxy tracks conversation state to avoid resending full context on every message:

- **New session**: First message creates a CLI chat via `create-chat`, sends condensed prompt (Copilot system prompts stripped, history limited to `maxHistoryTurns`)
- **Resume**: Subsequent messages in the same conversation use `--resume chatId`, sending only the latest user message — the CLI preserves server-side context
- **Checkpoint restore**: When Copilot rolls back to an earlier point, the proxy detects the divergence and creates a fresh session, ensuring the model "forgets" rolled-back messages
- **Retry**: Resending the same message reuses the existing session
- **Cleanup**: Idle sessions are automatically evicted after `sessionTtlMs` (default: 30 min)

### Auto Mode Detection

When Copilot sends `tools` or `functions` in the request body, the proxy automatically switches to **agent** mode (allowing file creation/editing). Without tools, it defaults to the configured mode.

### Auto Workspace Detection

The proxy scans Copilot's system/user messages for absolute file paths and infers your project root. No manual `X-Cursor-Workspace` header needed.

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
| GET | `/v1/models` | List available Cursor models (+ Anthropic aliases) |
| POST | `/v1/chat/completions` | Chat completion (OpenAI format, supports `stream: true`) |
| POST | `/v1/messages` | Anthropic Messages API (supports `stream: true`) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| **CLI** | | |
| `CURSOR_AGENT_BIN` | `agent` | Path to Cursor CLI binary or wrapper script |
| `CURSOR_AGENT_NODE` | — | Path to node.exe (Windows: bypasses cmd.exe length limit) |
| `CURSOR_AGENT_SCRIPT` | — | Path to CLI's index.js (used with `CURSOR_AGENT_NODE`) |
| **Server** | | |
| `CURSOR_BRIDGE_HOST` | `127.0.0.1` | Bind address |
| `CURSOR_BRIDGE_PORT` | `8765` | Port |
| `CURSOR_BRIDGE_API_KEY` | — | Require `Authorization: Bearer <key>` on requests |
| `CURSOR_BRIDGE_TLS_CERT` | — | TLS certificate file path (for HTTPS) |
| `CURSOR_BRIDGE_TLS_KEY` | — | TLS private key file path (for HTTPS) |
| **Execution** | | |
| `CURSOR_BRIDGE_MODE` | `ask` | Default execution mode: `ask`, `agent`, or `plan` |
| `CURSOR_BRIDGE_DEFAULT_MODEL` | `auto` | Default model when request omits one |
| `CURSOR_BRIDGE_FORCE` | `false` | Pass `--force` to Cursor CLI |
| `CURSOR_BRIDGE_APPROVE_MCPS` | `false` | Pass `--approve-mcps` to Cursor CLI |
| `CURSOR_BRIDGE_TIMEOUT_MS` | `300000` | Timeout per completion (ms) |
| **Workspace** | | |
| `CURSOR_BRIDGE_WORKSPACE` | cwd | Fallback workspace directory |
| `CURSOR_BRIDGE_CHAT_ONLY_WORKSPACE` | `true` | When `true`, CLI runs in temp dir. Set `false` for Copilot. |
| **Sessions** | | |
| `CURSOR_BRIDGE_SESSION_TTL_MS` | `1800000` | Session idle timeout in ms (default: 30 min) |
| `CURSOR_BRIDGE_MAX_HISTORY_TURNS` | `10` | Max conversation turns in first message of new session |
| **Logging** | | |
| `CURSOR_BRIDGE_VERBOSE` | `false` | Print full request/response content to stdout |
| `CURSOR_BRIDGE_SESSIONS_LOG` | `~/.cursor-api-proxy/sessions.log` | Request log path |

### Recommended Copilot Settings

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
Fixed in this fork. Rebuild with `npm run build` and restart.

**Model sees proxy internal paths**
The child process environment is sanitized. Rebuild and restart if you see proxy-related paths in model output.

**Checkpoint restore doesn't "forget" rolled-back messages**
The proxy detects checkpoint restores via message prefix matching and creates a new CLI session. If issues persist, enable `CURSOR_BRIDGE_VERBOSE=true` and check the session logs.

## Acknowledgments

This project is built upon [cursor-api-proxy](https://github.com/anyrobert/cursor-api-proxy) by [@anyrobert](https://github.com/anyrobert). Thanks to the original author for creating the OpenAI-compatible proxy for Cursor CLI, which made this Copilot integration possible.

## License

MIT — same as the upstream project.
