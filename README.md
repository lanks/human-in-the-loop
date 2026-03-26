# Human in the Loop

An [OpenClaw](https://openclaw.ai) plugin that lets AI agents securely collect sensitive information from humans via single-use, time-limited browser links.

When an agent needs a 2FA code, API key, password, or any secret, it generates a one-time link. The person opens it in their browser, fills in the form, and submits. The agent retrieves the value — which is held only in memory and cleared after reading.

## Why

Chat messages persist and may be logged. Typing secrets into chat is insecure. This plugin gives agents a secure side-channel: a disposable browser form with cryptographic tokens, automatic expiry, and read-once semantics.

## Install

```bash
openclaw plugins install human-in-the-loop
```

Then enable it in your `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "human-in-the-loop": {
        "enabled": true
      }
    }
  }
}
```

Restart the gateway after enabling.

## How It Works

The plugin registers two agent tools and a set of HTTP routes on the OpenClaw gateway (port 18789). No separate server needed.

### Agent Workflow

**1. Create a link** — the agent calls `hitl_create` with a prompt and field definitions:

```
hitl_create(
  prompt: "Please enter your login credentials",
  fields: [
    { name: "email", label: "Email address", type: "email" },
    { name: "password", label: "Password", type: "password" }
  ]
)
```

**2. Send the link** — the agent sends the returned URL to the person.

**3. Check for a response** — the agent polls with `hitl_check`:

```
hitl_check(token: "the-token-from-step-1")
// → { status: "received", values: { email: "...", password: "..." } }
```

### Field Types

Each field supports a `type`:

| Type | Renders as |
|------|-----------|
| `text` | Standard text input (default) |
| `email` | Email input with validation |
| `password` | Masked password input |
| `textarea` | Multi-line text area |

### What the Person Sees

A clean, mobile-friendly form with labeled fields, a countdown timer, and a submit button. After submission, the link cannot be reused. If the link expires before submission, they can request a new one.

## Security

- **256-bit crypto-random tokens** — links are unguessable
- **Single-use** — each link can only be submitted once
- **Time-limited** — configurable expiry (default 5 minutes), enforced server-side
- **In-memory only** — no data written to disk
- **Read-once** — values are cleared from memory after the agent reads them
- **Security headers** — CSP, no-cache, nosniff on all responses

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `defaultExpiry` | `300` | Default link expiry in seconds |

```json
{
  "plugins": {
    "entries": {
      "human-in-the-loop": {
        "enabled": true,
        "config": {
          "defaultExpiry": 600
        }
      }
    }
  }
}
```

Network access (binding, Tailscale Serve/Funnel) is configured through the [OpenClaw gateway settings](https://docs.openclaw.ai/web), not this plugin.

## License

MIT
