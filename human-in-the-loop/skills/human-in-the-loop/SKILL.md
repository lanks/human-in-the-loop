---
name: human-in-the-loop
description: >
  Securely collect sensitive information from humans via single-use links.
  Use when the agent needs a person to provide a secret, credential, 2FA code,
  API key, password, or any sensitive data that should not be typed into chat.
  Generates a time-limited URL that the person opens in a browser to submit
  information securely.
---

# Human in the Loop

Securely collect sensitive information from people by generating single-use, time-limited browser links.

## When to Use

Use this skill whenever you need a person to provide:
- 2FA / MFA codes
- API keys or tokens
- Passwords or credentials
- Any sensitive data that should not appear in chat history

## Workflow

### Step 1: Create a link

Call the `hitl_create` tool with a clear prompt explaining what you need:

```
hitl_create(prompt: "Please enter your 2FA code from your authenticator app")
```

Parameters:
- `prompt` (required) — message shown to the person
- `expiry` — link lifetime in seconds (default: 300)
- `input_type` — `"text"` (default), `"textarea"`, or `"password"`

### Step 2: Send the link

Send the returned URL to the person via your messaging channel. The link is relative to the gateway base URL.

Example message: "I need your 2FA code. Please enter it securely here: [link]"

### Step 3: Check for a response

Call `hitl_check` with the token to see if they've responded:

```
hitl_check(token: "the-token-from-step-1")
```

Possible responses:
- `{"status": "pending"}` — not yet submitted, try again shortly
- `{"status": "received", "value": "..."}` — the person submitted their response
- `{"status": "expired"}` — link expired without a submission
- `{"status": "expired", "renewedTo": "new-token"}` — person requested a new link, check the new token

If status is `pending`, wait a few seconds and check again. If the token was renewed, follow the `renewedTo` chain.

## Examples

### Collecting a 2FA code

```
hitl_create(prompt: "Please enter the 6-digit code from your authenticator app", expiry: 120, input_type: "text")
# → Send the URL to the person
# → Poll with hitl_check until received
```

### Collecting an API key

```
hitl_create(prompt: "Please paste your API key", expiry: 300, input_type: "password")
```

### Collecting multi-line content

```
hitl_create(prompt: "Please paste the SSH public key", input_type: "textarea")
```

## Security Properties

- Links are single-use — they cannot be resubmitted after first use
- Links expire after the configured time (default 5 minutes)
- Submitted values are held in memory only and cleared after you read them
- The link URL contains a 256-bit cryptographic random token
- No sensitive data is written to disk
