import { TokenStore } from "./store.js";
import type { Field } from "./store.js";
import { handleRequest } from "./routes.js";

interface FieldParam {
  name: string;
  label: string;
  type?: "text" | "textarea" | "password" | "email";
}

interface ToolParams {
  prompt?: string;
  expiry?: number;
  fields?: FieldParam[];
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

  setInterval(() => store.cleanup(), 30_000);

  // --- Agent Tools ---

  api.registerTool({
    name: "hitl_create",
    description:
      "Create a one-time link to securely collect sensitive information from a person. " +
      "Returns a URL to send them. Supports multiple named fields per form (e.g. email + password).",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Header message shown to the person explaining what info is needed",
        },
        fields: {
          type: "array",
          description:
            "List of form fields to collect. Each field has a name (key for the response), " +
            "label (shown to the person), and optional type.",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Field key used in the response values object",
              },
              label: {
                type: "string",
                description: "Label shown above the input field",
              },
              type: {
                type: "string",
                enum: ["text", "textarea", "password", "email"],
                description: "Input field type (default: text)",
              },
            },
            required: ["name", "label"],
          },
        },
        expiry: {
          type: "number",
          description: `Link expiry in seconds (default: ${defaultExpiry})`,
        },
      },
      required: ["prompt", "fields"],
    },
    async execute(_id, params) {
      const fields: Field[] = (params.fields ?? []).map((f) => ({
        name: f.name,
        label: f.label,
        type: f.type ?? "text",
      }));

      const entry = store.create(
        params.prompt ?? "Please enter the requested information",
        params.expiry ?? defaultExpiry,
        fields,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              token: entry.token,
              path: `/hitl/s/${entry.token}`,
              expires_at: new Date(entry.expiresAt * 1000).toISOString(),
              field_names: fields.map((f) => f.name),
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
      "Returns the submitted values as a keyed object (e.g. {email: '...', password: '...'}), " +
      "or 'pending'/'expired' status. " +
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
    auth: "plugin",
    match: "prefix",
    handler: (req, res) => handleRequest(req, res, store, defaultExpiry),
  });
}
