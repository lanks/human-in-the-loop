import { randomBytes } from "node:crypto";

export type InputType = "text" | "textarea" | "password" | "email";

export interface Field {
  name: string;
  label: string;
  type: InputType;
}

export interface TokenEntry {
  token: string;
  prompt: string;
  fields: Field[];
  createdAt: number;
  expiresAt: number;
  used: boolean;
  response: Record<string, string> | null;
  read: boolean;
  renewedTo: string | null;
}

export type TokenStatus =
  | { status: "pending" }
  | { status: "received"; values: Record<string, string> }
  | { status: "expired"; renewedTo?: string };

export class TokenStore {
  private store = new Map<string, TokenEntry>();

  create(prompt: string, expirySec: number, fields: Field[]): TokenEntry {
    const token = randomBytes(32).toString("base64url");
    const now = Date.now() / 1000;
    const entry: TokenEntry = {
      token,
      prompt,
      fields,
      createdAt: now,
      expiresAt: now + expirySec,
      used: false,
      response: null,
      read: false,
      renewedTo: null,
    };
    this.store.set(token, entry);
    return entry;
  }

  get(token: string): TokenEntry | undefined {
    return this.store.get(token);
  }

  submit(token: string, values: Record<string, string>): boolean {
    const entry = this.store.get(token);
    if (!entry) return false;
    if (entry.used) return false;
    if (Date.now() / 1000 > entry.expiresAt) return false;

    entry.used = true;
    entry.response = values;
    return true;
  }

  check(token: string): TokenStatus {
    const entry = this.store.get(token);
    if (!entry) return { status: "expired" };

    const now = Date.now() / 1000;

    if (entry.used && entry.response !== null) {
      const values = entry.response;
      entry.read = true;
      entry.response = null;
      return { status: "received", values };
    }

    if (entry.used && entry.read) {
      return { status: "expired" };
    }

    if (now > entry.expiresAt) {
      if (entry.renewedTo) {
        return { status: "expired", renewedTo: entry.renewedTo };
      }
      return { status: "expired" };
    }

    return { status: "pending" };
  }

  renew(oldToken: string, expirySec: number): TokenEntry | null {
    const oldEntry = this.store.get(oldToken);
    if (!oldEntry) return null;

    const newEntry = this.create(oldEntry.prompt, expirySec, oldEntry.fields);
    oldEntry.renewedTo = newEntry.token;
    return newEntry;
  }

  cleanup(): void {
    const now = Date.now() / 1000;
    const maxAge = 600;
    for (const [token, entry] of this.store) {
      if (entry.read || now > entry.expiresAt + maxAge) {
        this.store.delete(token);
      }
    }
  }
}
