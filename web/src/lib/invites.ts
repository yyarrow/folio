// Pure helpers for one-time invite codes and waitlist input. No database access.
import { randomInt } from "node:crypto";

export const INVITE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0 O 1 I L
export const INVITE_LENGTH = 10;
export const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const WAITLIST_NOTE_MAX = 280;

export function formatInviteCode(raw: string): string {
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export function generateInviteCode(): string {
  let raw = "";
  for (let i = 0; i < INVITE_LENGTH; i += 1) raw += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return formatInviteCode(raw);
}

/** Uppercase and strip everything that is not a letter or digit (spaces, dashes). */
export function normalizeInviteCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/gu, "");
}

export function parseWaitlistNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, WAITLIST_NOTE_MAX);
  return trimmed || null;
}
