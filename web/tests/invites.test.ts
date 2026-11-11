import { describe, expect, test } from "bun:test";
import { decryptInviteCodeWith, encryptInviteCodeWith } from "@/lib/invite-crypto";
import {
  INVITE_ALPHABET,
  INVITE_MESSAGE_MAX,
  WAITLIST_NOTE_MAX,
  generateInviteCode,
  normalizeInviteCode,
  parseInviteMessage,
  parseWaitlistNote,
} from "../src/lib/invites";

describe("invite codes", () => {
  test("generates XXXXX-XXXXX from an unambiguous alphabet", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateInviteCode();
      expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/u);
      for (const char of code.replace("-", "")) expect(INVITE_ALPHABET).toContain(char);
      expect(code).not.toMatch(/[01OIL]/u);
    }
  });

  test("normalizes case, spaces and dashes", () => {
    expect(normalizeInviteCode("abcde-fghjk")).toBe("ABCDEFGHJK");
    expect(normalizeInviteCode("  abcde fghjk ")).toBe("ABCDEFGHJK");
    expect(normalizeInviteCode(generateInviteCode())).toHaveLength(10);
  });

  test("equivalent spellings hash identically", async () => {
    process.env.FOLIO_SESSION_SECRET = "test-secret";
    const { createHmac } = await import("node:crypto");
    const hash = (value: string) => createHmac("sha256", "test-secret").update(normalizeInviteCode(value)).digest("hex");
    expect(hash("abcde-fghjk")).toBe(hash("ABCDE FGHJK"));
    expect(hash("abcde-fghjk")).not.toBe(hash("abcde-fghjm"));
  });
});

describe("waitlist note", () => {
  test("trims, caps and nulls empty notes", () => {
    expect(parseWaitlistNote("  hi  ")).toBe("hi");
    expect(parseWaitlistNote("   ")).toBeNull();
    expect(parseWaitlistNote(42)).toBeNull();
    expect(parseWaitlistNote("x".repeat(500))).toHaveLength(WAITLIST_NOTE_MAX);
  });
});

import { inviteKind, inviteStatus } from "../src/lib/invites";

describe("invite status", () => {
  const now = new Date("2026-01-10T00:00:00Z");
  test("derives unused / used / expired", () => {
    expect(inviteStatus({ usedAt: null, expiresAt: "2026-01-11T00:00:00Z" }, now)).toBe("unused");
    expect(inviteStatus({ usedAt: null, expiresAt: "2026-01-09T00:00:00Z" }, now)).toBe("expired");
    expect(inviteStatus({ usedAt: "2026-01-05T00:00:00Z", expiresAt: "2026-01-09T00:00:00Z" }, now)).toBe("used");
  });
  test("null kind is an email invite", () => {
    expect(inviteKind(null)).toBe("email");
    expect(inviteKind("generic")).toBe("generic");
  });
});

describe("invite code display encryption", () => {
  test("round-trips with the same secret", () => {
    const payload = encryptInviteCodeWith("K7M2Q-X9PWT", "secret-a");
    expect(payload).not.toContain("K7M2Q");
    expect(decryptInviteCodeWith(payload, "secret-a")).toBe("K7M2Q-X9PWT");
  });
  test("fails closed with another secret, tampering, or no payload", () => {
    const payload = encryptInviteCodeWith("K7M2Q-X9PWT", "secret-a");
    expect(decryptInviteCodeWith(payload, "secret-b")).toBeNull();
    const bytes = Buffer.from(payload, "base64");
    bytes[bytes.length - 1] ^= 1;
    expect(decryptInviteCodeWith(bytes.toString("base64"), "secret-a")).toBeNull();
    expect(decryptInviteCodeWith(null, "secret-a")).toBeNull();
  });
});

describe("parseInviteMessage", () => {
  test("trims, normalizes newlines, and caps length", () => {
    expect(parseInviteMessage("  你好\r\n\r\n谢谢  ")).toBe("你好\n\n谢谢");
    expect(parseInviteMessage("x".repeat(INVITE_MESSAGE_MAX + 50))!.length).toBe(INVITE_MESSAGE_MAX);
  });
  test("treats empty or non-string input as no message", () => {
    expect(parseInviteMessage("   ")).toBeNull();
    expect(parseInviteMessage(42)).toBeNull();
    expect(parseInviteMessage(undefined)).toBeNull();
  });
});
