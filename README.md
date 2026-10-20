# pi-jetbrains-junie-bridge

A [Pi](https://pi.dev/) extension and [OpenCode](https://opencode.ai/) plugin that lets you use [JetBrains Junie](https://junie.jetbrains.com/) as the AI backend — using your existing Junie subscription.

## Install (Pi)

```bash
pi install npm:pi-jetbrains-junie-bridge
```

Then inside `pi` run the `/login` command.  Select `Use a subscription` and then `JetBrains Junie` to authenticate.

Once authenticated, run `/model` to select a model provided by the junie bridge.

## Install (OpenCode 2)

The plugin targets the OpenCode 2 plugin API (`opencode2`). Add it to your global configuration:

```bash
opencode2 plugin add pi-jetbrains-junie-bridge
```

or reference a local checkout in `opencode.json`:

```json
{
  "plugins": ["/absolute/path/to/pi-jetbrains-junie-bridge/opencode.mjs"]
}
```

Then log in — this opens the JetBrains login in your browser:

```bash
opencode2 auth login junie
```

The models appear under the `junie` provider, e.g. `junie/claude-opus-5` or
`junie/openai-gpt-5-5`. Reasoning effort is exposed as model variants
(`junie/claude-opus-5#high`, `junie/openai-gpt-5-5#xhigh`, `junie/gemini-3.5-flash#low`).
OpenCode stores the credential and refreshes the token automatically.

Not available in OpenCode (yet): the balance status line and the `/junie` command — both rely on Pi's TUI APIs.

## Features

- **OAuth login** — browser-based JetBrains authentication with automatic token refresh
- **Balance tracking** — session cost and remaining balance shown in Pi's status line (see footer) while a Junie model is selected
  ![Screnshot showcasing balance tracking](./docs/balance_tracking.png)
- **`/junie` command** — check proxy status, balance, and available models from within Pi
  ![Screnshot showcasing the `junie` command](./docs/junie_command.png)
- **Automatic context compaction** — when a conversation outgrows the model's context
  window, Pi compacts it and retries instead of failing. This works out of the box for
  all four model families: the bridge passes the backend's original overflow error
  through unchanged, so Pi's built-in detection recognises it (verified live against
  Claude, OpenAI, Grok and Gemini).

## Available Models

Anthropic (Claude), OpenAI, xAI (Grok) and Google (Gemini) models are supported. The reasoning effort is adjustable in Pi.

The list below is mostly in sync with the models Junie itself offers, as published at <https://llm24.net/llm/junie.txt>.

**Anthropic:**
- `claude-sonnet-4-6`
- `claude-sonnet-5`
- `claude-opus-4-6`
- `claude-opus-4-7`
- `claude-opus-4-8`
- `claude-opus-5`
- `claude-fable-5`
- `claude-fable-5-1`

**OpenAI:**
- `openai-gpt-5-2`
- `openai-gpt-5-4`
- `openai-gpt-5-5`
- `openai-gpt-5-6-luna`
- `openai-gpt-5-6-terra`
- `openai-gpt-5-6-sol`
- `openai-gpt-6-astra`

**xAI:**
- `grok-4-3`
- `grok-4-5`
- `grok-4-6`

**Google:**
- `gemini-3-flash-preview`
- `gemini-3.1-pro-preview`
- `gemini-3.1-flash-lite`
- `gemini-3.5-flash`
- `gemini-3.5-flash-lite`
- `gemini-3.6-flash`
- `gemini-3.7-flash`
- `gemini-3.8-flash`

Missing models:
- **`deepseek-v4-flash`** — not implemented yet. JetBrains routes DeepSeek through a different backend (AliCloud), and every path/header combination tried so far is rejected by the Grazie gateway for subscription OAuth tokens.
- **`kimi-k2.5`, `muse-spark-1.x`** — listed on llm24.net but gated to internal/EAP licences; every route tried answers 400/404.
- **`gemini-3-pro-preview`** — in the Junie JAR, but the Google publisher 404s it (not live).
- **Older OpenAI generations** (`gpt-5-2025-08-07`, `gpt-5.3-codex`) — reachable, but deliberately left out in favour of the current GPT-5 models.
- **`gpt`, `grok`, `gemini-pro`, `gemini-flash`** — stale aliases in that list; the backend answers `Model not found` for them.

## Proxy Support

The extension respects the standard `HTTPS_PROXY` / `HTTP_PROXY` environment variables. This is useful in corporate environments where internet access is only available through a proxy.

All outgoing requests to JetBrains (OAuth and Grazie backend) are routed through the configured proxy. Local traffic between Pi and the bridge stays direct.

```bash
# Example
export HTTPS_PROXY=http://proxy.corp.example.com:8080
```

You can verify the active proxy with the `/junie` command inside Pi.

## Requirements

- Node.js 20+
- A [JetBrains Junie subscription](https://junie.jetbrains.com/)


## How It Works

The extension starts a local proxy server that translates between Pi and JetBrains' Grazie backend. On first use, you'll authenticate via JetBrains OAuth (browser-based PKCE flow).

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│ Pi /     │────>│  pi-junie    │────>│ Junie/Grazie │
│ OpenCode │     │  local proxy │     │   backend    │
└──────────┘     └──────────────┘     └──────────────┘
```

- OpenAI models (`openai-gpt-*`) are forwarded via `/v1/responses` (OpenAI Responses API) so reasoning effort works together with tool calls
- Anthropic models (`claude-*`) are forwarded via `/v1/messages`
- Grok models (`grok-*`) use the same Responses API, with the routing header that Junie uses for xAI
- Gemini models (`gemini-*`) are forwarded to the Vertex-style `generateContent` endpoint
- The proxy runs on an ephemeral port and shuts down when Pi exits (or when OpenCode unloads the plugin)

## Disclaimer

This extension includes a proxy server reverse-engineered from the official [JetBrains Junie CLI](https://github.com/JetBrains/junie).
It is not officially supported by JetBrains. Use it in accordance with the [JetBrains AI Service Terms of Service](https://www.jetbrains.com/legal/docs/toolbox/ai-service-terms/).

## License

MIT
