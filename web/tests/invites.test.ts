import { describe, expect, test } from "bun:test";
import {
  INVITE_ALPHABET,
  WAITLIST_NOTE_MAX,
  generateInviteCode,
  normalizeInviteCode,
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
