import type { IncomingMessage, ServerResponse } from "node:http";
import type { TokenStore } from "./store.js";
import {
  renderForm,
  renderSubmitted,
  renderExpired,
  renderAlreadyUsed,
} from "./html.js";

const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; connect-src 'self'",
};

function sendHtml(res: ServerResponse, status: number, html: string): void {
  const body = Buffer.from(html, "utf-8");
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": body.length,
    ...SECURITY_HEADERS,
  });
  res.end(body);
}

function sendJson(
  res: ServerResponse,
  status: number,
  data: Record<string, unknown>,
): void {
  const body = Buffer.from(JSON.stringify(data), "utf-8");
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": body.length,
    ...SECURITY_HEADERS,
  });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const maxSize = 64 * 1024;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) {
        req.destroy();
        reject(new Error("Body too large"));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function parseFormValues(
  body: string,
  fieldNames: string[],
): Record<string, string> {
  const params = new URLSearchParams(body);
  const values: Record<string, string> = {};
  for (const name of fieldNames) {
    values[name] = params.get(name) ?? "";
  }
  return values;
}

export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  store: TokenStore,
  defaultExpiry: number,
): Promise<boolean> {
  const url = req.url ?? "";
  const method = req.method ?? "GET";

  // GET /hitl/s/<token> — serve form
  const formMatch = url.match(/^\/hitl\/s\/([A-Za-z0-9_-]+)$/);
  if (formMatch && method === "GET") {
    const token = formMatch[1];
    serveForm(res, store, token);
    return true;
  }

  // POST /hitl/s/<token> — handle submission
  if (formMatch && method === "POST") {
    const token = formMatch[1];
    await handleSubmission(req, res, store, token);
    return true;
  }

  // POST /hitl/request-new/<token> — renew expired link
  const renewMatch = url.match(/^\/hitl\/request-new\/([A-Za-z0-9_-]+)$/);
  if (renewMatch && method === "POST") {
    const token = renewMatch[1];
    handleRenew(res, store, token, req, defaultExpiry);
    return true;
  }

  return false;
}

function serveForm(
  res: ServerResponse,
  store: TokenStore,
  token: string,
): void {
  const entry = store.get(token);

  if (!entry) {
    sendHtml(res, 404, renderExpired(token));
    return;
  }

  if (entry.used) {
    sendHtml(res, 410, renderAlreadyUsed());
    return;
  }

  const now = Date.now() / 1000;
  if (now > entry.expiresAt) {
    sendHtml(res, 410, renderExpired(token));
    return;
  }

  sendHtml(
    res,
    200,
    renderForm(token, entry.prompt, entry.fields, entry.expiresAt),
  );
}

async function handleSubmission(
  req: IncomingMessage,
  res: ServerResponse,
  store: TokenStore,
  token: string,
): Promise<void> {
  try {
    const entry = store.get(token);
    if (!entry) {
      sendHtml(res, 410, renderExpired(token));
      return;
    }

    const body = await readBody(req);
    const fieldNames = entry.fields.map((f) => f.name);
    const values = parseFormValues(body, fieldNames);

    if (store.submit(token, values)) {
      sendHtml(res, 200, renderSubmitted());
    } else {
      if (entry.used) {
        sendHtml(res, 410, renderAlreadyUsed());
      } else {
        sendHtml(res, 410, renderExpired(token));
      }
    }
  } catch {
    sendHtml(res, 400, renderExpired(token));
  }
}

function handleRenew(
  res: ServerResponse,
  store: TokenStore,
  token: string,
  req: IncomingMessage,
  defaultExpiry: number,
): void {
  const newEntry = store.renew(token, defaultExpiry);

  if (!newEntry) {
    sendJson(res, 404, { error: "Token not found" });
    return;
  }

  const host = req.headers.host ?? "localhost";
  const protocol = req.headers["x-forwarded-proto"] ?? "http";
  const url = `${protocol}://${host}/hitl/s/${newEntry.token}`;

  sendJson(res, 200, { url, token: newEntry.token });
}
