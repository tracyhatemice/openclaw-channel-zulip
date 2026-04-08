import { describe, expect, it } from "vitest";
import {
  createDedupeCache,
  formatInboundFromLabel,
  resolveThreadSessionKeys,
} from "./monitor-helpers.js";

// ---------------------------------------------------------------------------
// createDedupeCache
// ---------------------------------------------------------------------------
describe("createDedupeCache", () => {
  it("returns false for the first occurrence of a key", () => {
    const cache = createDedupeCache({ ttlMs: 60_000, maxSize: 100 });
    expect(cache.check("msg:1")).toBe(false);
  });

  it("returns true on a duplicate within the TTL window", () => {
    const cache = createDedupeCache({ ttlMs: 60_000, maxSize: 100 });
    const now = Date.now();
    cache.check("msg:1", now);
    expect(cache.check("msg:1", now + 1_000)).toBe(true);
  });

  it("returns false after the TTL has expired", () => {
    const cache = createDedupeCache({ ttlMs: 500, maxSize: 100 });
    const t0 = 1_000_000;
    cache.check("msg:2", t0);
    expect(cache.check("msg:2", t0 + 1_000)).toBe(false);
  });

  it("treats null/undefined key as non-duplicate (always false)", () => {
    const cache = createDedupeCache({ ttlMs: 60_000, maxSize: 100 });
    expect(cache.check(null)).toBe(false);
    expect(cache.check(undefined)).toBe(false);
  });

  it("different keys are tracked independently", () => {
    const cache = createDedupeCache({ ttlMs: 60_000, maxSize: 100 });
    const now = Date.now();
    cache.check("msg:A", now);
    // A is a dup, B is new
    expect(cache.check("msg:A", now + 100)).toBe(true);
    expect(cache.check("msg:B", now + 100)).toBe(false);
  });

  it("evicts oldest entries when maxSize is exceeded", () => {
    const cache = createDedupeCache({ ttlMs: 60_000, maxSize: 2 });
    const now = Date.now();
    cache.check("msg:1", now);
    cache.check("msg:2", now + 1);
    // Adding a third entry evicts msg:1 (oldest)
    cache.check("msg:3", now + 2);
    // msg:2 and msg:3 still in cache
    expect(cache.check("msg:2", now + 3)).toBe(true);
    expect(cache.check("msg:3", now + 3)).toBe(true);
    // msg:1 was evicted — re-inserting it is a fresh entry (false)
    // Note: we check msg:1 last so it doesn't trigger another eviction of msg:2/3
    const cache2 = createDedupeCache({ ttlMs: 60_000, maxSize: 2 });
    cache2.check("msg:1", now);
    cache2.check("msg:2", now + 1);
    cache2.check("msg:3", now + 2);
    expect(cache2.check("msg:1", now + 3)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveThreadSessionKeys
// ---------------------------------------------------------------------------
describe("resolveThreadSessionKeys", () => {
  it("returns baseSessionKey unchanged when no threadId", () => {
    const result = resolveThreadSessionKeys({ baseSessionKey: "zulip:default:123" });
    expect(result.sessionKey).toBe("zulip:default:123");
    expect(result.parentSessionKey).toBeUndefined();
    expect(result.sanitizedThreadId).toBeUndefined();
  });

  it("returns baseSessionKey unchanged for empty-string threadId", () => {
    const result = resolveThreadSessionKeys({ baseSessionKey: "zulip:default:123", threadId: "" });
    expect(result.sessionKey).toBe("zulip:default:123");
    expect(result.sanitizedThreadId).toBeUndefined();
  });

  it("appends sanitized thread suffix for normal topic", () => {
    const result = resolveThreadSessionKeys({
      baseSessionKey: "zulip:default:456",
      threadId: "General Chat",
    });
    expect(result.sessionKey).toBe("zulip:default:456:thread:general-chat");
    expect(result.sanitizedThreadId).toBe("general-chat");
  });

  it("sanitizes path-unsafe characters in topic", () => {
    const result = resolveThreadSessionKeys({
      baseSessionKey: "zulip:acct:789",
      threadId: "bugs/feature: Q&A?",
    });
    // / and : and ? should become hyphens, then collapsed
    expect(result.sessionKey).toMatch(/^zulip:acct:789:thread:/);
    expect(result.sanitizedThreadId).not.toMatch(/[/:?]/);
  });

  it("collapses multiple spaces and hyphens in topic", () => {
    const result = resolveThreadSessionKeys({
      baseSessionKey: "base",
      threadId: "  hello   world  ",
    });
    expect(result.sanitizedThreadId).toBe("hello-world");
  });

  it("handles parentSessionKey passthrough", () => {
    const result = resolveThreadSessionKeys({
      baseSessionKey: "zulip:default:789",
      threadId: "topic",
      parentSessionKey: "zulip:default:789",
    });
    expect(result.parentSessionKey).toBe("zulip:default:789");
  });

  it("uses SHA hash prefix for very long topics (>200 chars)", () => {
    const longTopic = "a".repeat(201);
    const result = resolveThreadSessionKeys({
      baseSessionKey: "base",
      threadId: longTopic,
    });
    // sanitizedThreadId should be a 16-char hex hash, not the raw string
    expect(result.sanitizedThreadId).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ---------------------------------------------------------------------------
// formatInboundFromLabel
// ---------------------------------------------------------------------------
describe("formatInboundFromLabel", () => {
  it("returns group label with id for channel messages", () => {
    const label = formatInboundFromLabel({
      isGroup: true,
      groupLabel: "#general",
      groupId: "42",
      directLabel: "Alice",
    });
    expect(label).toBe("#general id:42");
  });

  it("returns plain group label when no groupId", () => {
    const label = formatInboundFromLabel({
      isGroup: true,
      groupLabel: "#general",
      directLabel: "Alice",
    });
    expect(label).toBe("#general");
  });

  it("uses groupFallback when groupLabel is empty", () => {
    const label = formatInboundFromLabel({
      isGroup: true,
      groupLabel: "",
      groupId: "99",
      directLabel: "Alice",
      groupFallback: "Stream",
    });
    expect(label).toBe("Stream id:99");
  });

  it("returns plain directLabel for DMs when id matches label", () => {
    const label = formatInboundFromLabel({
      isGroup: false,
      directLabel: "alice@example.com",
      directId: "alice@example.com",
    });
    expect(label).toBe("alice@example.com");
  });

  it("appends id for DMs when directId differs from label", () => {
    const label = formatInboundFromLabel({
      isGroup: false,
      directLabel: "Alice",
      directId: "alice@example.com",
    });
    expect(label).toBe("Alice id:alice@example.com");
  });

  it("returns plain directLabel when no directId for DM", () => {
    const label = formatInboundFromLabel({
      isGroup: false,
      directLabel: "Alice",
    });
    expect(label).toBe("Alice");
  });
});
