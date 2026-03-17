---
name: human-in-the-loop
description: >
  Securely collect sensitive information from humans via single-use links.
  Use when the agent needs a person to provide a secret, credential, 2FA code,
  API key, password, or any sensitive data that should not be typed into chat.
  Generates a time-limited URL that the person opens in a browser to submit
  information securely. Supports multiple fields per form.
---

# Human in the Loop

Securely collect sensitive information from people by generating single-use, time-limited browser links with one or more input fields.

## When to Use

Use this skill whenever you need a person to provide:
- 2FA / MFA codes
- API keys or tokens
- Passwords or credentials
- Login details (email + password)
- Any sensitive data that should not appear in chat history

## Workflow

### Step 1: Create a link

Call the `hitl_create` tool with a prompt and a list of fields:

```
hitl_create(
  prompt: "Please enter your login credentials",
  fields: [
    { name: "email", label: "Email address", type: "email" },
    { name: "password", label: "Password", type: "password" }
  ]
)
```

Each field requires:
- `name` (required) — key used in the response object
- `label` (required) — label shown above the input
- `type` (optional) — `"text"` (default), `"textarea"`, `"password"`, or `"email"`

Optional parameters:
- `expiry` — link lifetime in seconds (default: 300)

### Step 2: Send the link

Send the returned URL to the person via your messaging channel. The path is relative to the gateway base URL.

### Step 3: Check for a response

Call `hitl_check` with the token to see if they've responded:

```
hitl_check(token: "the-token-from-step-1")
```

Possible responses:
- `{"status": "pending"}` — not yet submitted, try again shortly
- `{"status": "received", "values": {"email": "...", "password": "..."}}` — the person submitted their response
- `{"status": "expired"}` — link expired without a submission
- `{"status": "expired", "renewedTo": "new-token"}` — person requested a new link, check the new token

If status is `pending`, wait a few seconds and check again. If the token was renewed, follow the `renewedTo` chain.

## Examples

### Collecting a 2FA code

```
hitl_create(
  prompt: "Please enter the 6-digit code from your authenticator app",
  fields: [{ name: "code", label: "2FA Code", type: "text" }],
  expiry: 120
)
```

### Collecting login credentials

```
hitl_create(
  prompt: "Please enter your account credentials",
  fields: [
    { name: "email", label: "Email", type: "email" },
    { name: "password", label: "Password", type: "password" }
  ]
)
```

### Collecting an API key

```
hitl_create(
  prompt: "Please paste your API key",
  fields: [{ name: "api_key", label: "API Key", type: "password" }]
)
```

### Collecting multi-line content

```
hitl_create(
  prompt: "Please paste the SSH public key",
  fields: [{ name: "ssh_key", label: "SSH Public Key", type: "textarea" }]
)
```

## Security Properties

- Links are single-use — they cannot be resubmitted after first use
- Links expire after the configured time (default 5 minutes)
- Submitted values are held in memory only and cleared after you read them
- The link URL contains a 256-bit cryptographic random token
- No sensitive data is written to disk
