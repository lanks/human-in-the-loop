import { TokenStore } from "./store.js";
import { handleRequest } from "./routes.js";

interface ToolParams {
  prompt?: string;
  expiry?: number;
  input_type?: "text" | "textarea" | "password";
  token?: string;
}

interface PluginApi {
  registerTool(tool: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute(
      id: string,
      params: ToolParams,
    ): Promise<{ content: { type: string; text: string }[] }>;
  }): void;

  registerHttpRoute(route: {
    path: string;
    auth: "gateway" | "plugin";
    match?: "exact" | "prefix";
    handler: (
      req: import("node:http").IncomingMessage,
      res: import("node:http").ServerResponse,
    ) => boolean | Promise<boolean>;
  }): void;

  getConfig?(): { defaultExpiry?: number };
}

export default function register(api: PluginApi) {
  const store = new TokenStore();
  const config = api.getConfig?.() ?? {};
  const defaultExpiry = config.defaultExpiry ?? 300;

  // Cleanup interval: remove expired/read entries every 30s
  setInterval(() => store.cleanup(), 30_000);

  // --- Agent Tools ---

  api.registerTool({
    name: "hitl_create",
    description:
      "Create a one-time link to securely collect sensitive information from a person. " +
      "Returns a URL to send them. Use for 2FA codes, API keys, passwords, or any secret.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Message shown to the person explaining what info is needed",
        },
        expiry: {
          type: "number",
          description: `Link expiry in seconds (default: ${defaultExpiry})`,
        },
        input_type: {
          type: "string",
          enum: ["text", "textarea", "password"],
          description: "Input field type (default: text)",
        },
      },
      required: ["prompt"],
    },
    async execute(_id, params) {
      const entry = store.create(
        params.prompt ?? "Please enter the requested information",
        params.expiry ?? defaultExpiry,
        params.input_type ?? "text",
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              token: entry.token,
              path: `/hitl/s/${entry.token}`,
              expires_at: new Date(entry.expiresAt * 1000).toISOString(),
              instructions:
                "Send the link to the person. The path is relative to the gateway base URL. " +
                "Use hitl_check with the token to poll for their response.",
            }),
          },
        ],
      };
    },
  });

  api.registerTool({
    name: "hitl_check",
    description:
      "Check if a person has submitted their response to a one-time link. " +
      "Returns the submitted value if available, or 'pending'/'expired' status. " +
      "If expired with a renewedTo token, the person requested a new link — check that token instead.",
    parameters: {
      type: "object",
      properties: {
        token: {
          type: "string",
          description: "Token returned by hitl_create",
        },
      },
      required: ["token"],
    },
    async execute(_id, params) {
      const result = store.check(params.token ?? "");

      // If the token was renewed, follow the chain
      if (result.status === "expired" && "renewedTo" in result && result.renewedTo) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ...result,
                instructions:
                  "The person requested a new link. Check the renewedTo token instead.",
              }),
            },
          ],
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  });

  // --- HTTP Routes (browser-facing) ---

  api.registerHttpRoute({
    path: "/hitl/",
    auth: "plugin", // No gateway auth — the crypto-random token IS the auth
    match: "prefix",
    handler: (req, res) => handleRequest(req, res, store, defaultExpiry),
  });
}
