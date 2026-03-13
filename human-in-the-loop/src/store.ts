import { randomBytes } from "node:crypto";

export type InputType = "text" | "textarea" | "password";

export interface TokenEntry {
  token: string;
  prompt: string;
  inputType: InputType;
  createdAt: number;
  expiresAt: number;
  used: boolean;
  response: string | null;
  read: boolean;
  renewedTo: string | null;
}

export type TokenStatus =
  | { status: "pending" }
  | { status: "received"; value: string }
  | { status: "expired"; renewedTo?: string };

export class TokenStore {
  private store = new Map<string, TokenEntry>();

  create(prompt: string, expirySec: number, inputType: InputType): TokenEntry {
    const token = randomBytes(32).toString("base64url");
    const now = Date.now() / 1000;
    const entry: TokenEntry = {
      token,
      prompt,
      inputType,
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

  submit(token: string, value: string): boolean {
    const entry = this.store.get(token);
    if (!entry) return false;
    if (entry.used) return false;
    if (Date.now() / 1000 > entry.expiresAt) return false;

    entry.used = true;
    entry.response = value;
    return true;
  }

  check(token: string): TokenStatus {
    const entry = this.store.get(token);
    if (!entry) return { status: "expired" };

    const now = Date.now() / 1000;

    if (entry.used && entry.response !== null) {
      const value = entry.response;
      // Zero the value after reading (read-once)
      entry.read = true;
      entry.response = null;
      return { status: "received", value };
    }

    if (entry.used && entry.read) {
      // Already read — treat as expired to avoid confusion
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

    const newEntry = this.create(oldEntry.prompt, expirySec, oldEntry.inputType);
    oldEntry.renewedTo = newEntry.token;
    return newEntry;
  }

  cleanup(): void {
    const now = Date.now() / 1000;
    const maxAge = 600; // Remove entries 10 min past expiry
    for (const [token, entry] of this.store) {
      if (entry.read || now > entry.expiresAt + maxAge) {
        this.store.delete(token);
      }
    }
  }
}
