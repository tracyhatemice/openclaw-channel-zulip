import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const createCore = () => ({
    config: {
      channels: {
        zulip: {},
      },
      commands: {},
      session: {},
    },
    logging: {
      getChildLogger: () => ({ debug: vi.fn() }),
      shouldLogVerbose: () => false,
    },
    system: {
      enqueueSystemEvent: vi.fn(),
    },
    channel: {
      media: {
        saveMediaBuffer: vi.fn(),
      },
      mentions: {
        buildMentionRegexes: vi.fn(() => []),
        matchesMentionPatterns: vi.fn(() => false),
      },
      commands: {
        shouldHandleTextCommands: vi.fn(() => false),
      },
      text: {
        hasControlCommand: vi.fn(() => false),
        resolveTextChunkLimit: vi.fn(() => 4000),
        resolveMarkdownTableMode: vi.fn(() => "preserve"),
        resolveChunkMode: vi.fn(() => "none"),
        chunkMarkdownTextWithMode: vi.fn((text: string) => [text]),
        convertMarkdownTables: vi.fn((text: string) => text),
      },
      groups: {
        resolveRequireMention: vi.fn(() => false),
      },
      activity: {
        record: vi.fn(),
      },
      routing: {
        resolveAgentRoute: vi.fn(() => ({
          agentId: "debbie",
          accountId: "default",
          sessionKey: "agent:debbie:zulip:channel:4",
          mainSessionKey: "agent:debbie:main",
        })),
      },
      reply: {
        formatInboundEnvelope: vi.fn(({ body }: { body: string }) => body),
        finalizeInboundContext: vi.fn((payload: Record<string, unknown>) => payload),
        resolveHumanDelayConfig: vi.fn(() => undefined),
        createReplyDispatcherWithTyping: vi.fn(() => ({
          dispatcher: {},
          replyOptions: {},
          markDispatchIdle: vi.fn(),
        })),
        dispatchReplyFromConfig: vi.fn(async () => {}),
      },
      session: {
        resolveStorePath: vi.fn(() => "/tmp/openclaw-session-store.json"),
        updateLastRoute: vi.fn(async () => {}),
      },
      pairing: {
        buildPairingReply: vi.fn(() => "pairing reply"),
      },
    },
  });

  return {
    abortController: undefined as AbortController | undefined,
    pollResponses: [] as Array<Record<string, unknown>>,
    client: { authHeader: "Basic fake" },
    botUser: {
      id: 999,
      email: "debbie-bot@zlp.pubnerd.app",
      full_name: "Debbie",
    },
    account: {
      accountId: "default",
      apiKey: "test-key",
      email: "debbie-bot@zlp.pubnerd.app",
      baseUrl: "https://zlp.pubnerd.app",
      streams: ["debbie"],
      requireMention: false,
      chatmode: "normal",
      config: {
        dmPolicy: "open",
        groupPolicy: "open",
        reactions: { enabled: false },
      },
    },
    core: createCore(),
    createCore,
  };
});

vi.mock("../runtime.js", () => ({
  getZulipRuntime: () => state.core,
}));

const registerZulipQueueMock = vi.fn(async () => ({ queueId: "queue-1", lastEventId: 0 }));
const getZulipEventsWithRetryMock = vi.fn(async () => {
  const next = state.pollResponses.shift() ?? { result: "success", events: [] };
  if (state.abortController && state.pollResponses.length === 0) {
    state.abortController.abort();
  }
  return next;
});
const deleteZulipQueueMock = vi.fn(async () => {});

vi.mock("./client.js", () => ({
  createZulipClient: vi.fn(() => state.client),
  fetchZulipMe: vi.fn(async () => state.botUser),
  fetchZulipStream: vi.fn(),
  normalizeZulipBaseUrl: vi.fn((url?: string) => url ?? ""),
  registerZulipQueue: registerZulipQueueMock,
  getZulipEventsWithRetry: getZulipEventsWithRetryMock,
  deleteZulipQueue: deleteZulipQueueMock,
  sendZulipTyping: vi.fn(async () => {}),
  addZulipReaction: vi.fn(async () => {}),
  removeZulipReaction: vi.fn(async () => {}),
}));

vi.mock("./accounts.js", () => ({
  resolveZulipAccount: vi.fn(() => state.account),
}));

vi.mock("./send.js", () => ({
  sendMessageZulip: vi.fn(async () => {}),
}));

vi.mock("./uploads.js", () => ({
  downloadZulipUpload: vi.fn(async () => {
    throw new Error("unexpected upload download in test");
  }),
  extractZulipUploadUrls: vi.fn(() => []),
  normalizeZulipEmojiName: vi.fn((name: string) => name),
}));

vi.mock("../sdk.js", () => ({
  createReplyPrefixOptions: vi.fn(() => ({ onModelSelected: vi.fn() })),
  createScopedPairingAccess: vi.fn(() => ({
    upsertPairingRequest: vi.fn(async () => ({ code: "123456", created: false })),
    readStoreForDmPolicy: vi.fn(async () => []),
  })),
  createTypingCallbacks: vi.fn(() => ({
    onReplyStart: vi.fn(),
  })),
  logInboundDrop: vi.fn(),
  logTypingFailure: vi.fn(),
  buildPendingHistoryContextFromMap: vi.fn(() => undefined),
  clearHistoryEntriesIfEnabled: vi.fn(),
  DEFAULT_GROUP_HISTORY_LIMIT: 20,
  recordPendingHistoryEntryIfEnabled: vi.fn(),
  resolveControlCommandGate: vi.fn(() => ({ shouldBlock: false, commandAuthorized: true })),
  resolveChannelMediaMaxBytes: vi.fn(() => undefined),
  resolvePreferredOpenClawTmpDir: vi.fn(() => "/tmp"),
  readStoreAllowFromForDmPolicy: vi.fn(async () => []),
  resolveDmGroupAccessWithLists: vi.fn(
    ({ allowFrom, groupAllowFrom }: { allowFrom: string[]; groupAllowFrom: string[] }) => ({
      effectiveAllowFrom: allowFrom,
      effectiveGroupAllowFrom: groupAllowFrom,
    }),
  ),
}));

function makeChannelMessage(id: number) {
  return {
    id,
    sender_id: 123,
    sender_email: "user8@zlp.pubnerd.app",
    sender_full_name: "Ian F",
    type: "stream",
    stream_id: 4,
    display_recipient: "debbie",
    subject: "zulip-plugin-pr",
    content: "ping test",
    timestamp: 1_750_000_000,
  };
}

async function runMonitorOnce() {
  const { monitorZulipProvider } = await import("./monitor.js");
  state.abortController = new AbortController();
  await monitorZulipProvider({
    config: state.core.config,
    abortSignal: state.abortController.signal,
  });
}

describe("monitorZulipProvider", () => {
  beforeEach(() => {
    state.core = state.createCore();
    state.pollResponses = [];
    state.abortController = undefined;
    registerZulipQueueMock.mockClear();
    getZulipEventsWithRetryMock.mockClear();
    deleteZulipQueueMock.mockClear();
  });

  it("processes ordinary inbound messages without enqueueing a synthetic system event", async () => {
    state.pollResponses = [
      {
        result: "success",
        events: [{ id: 1, type: "message", message: makeChannelMessage(1001) }],
      },
    ];

    await runMonitorOnce();

    expect(state.core.channel.reply.finalizeInboundContext).toHaveBeenCalledTimes(1);
    expect(state.core.channel.reply.dispatchReplyFromConfig).toHaveBeenCalledTimes(1);
    expect(state.core.system.enqueueSystemEvent).not.toHaveBeenCalled();
  });

  it("ignores duplicate inbound message ids on repeat processing", async () => {
    state.pollResponses = [
      {
        result: "success",
        events: [{ id: 2, type: "message", message: makeChannelMessage(2001) }],
      },
    ];
    await runMonitorOnce();

    state.pollResponses = [
      {
        result: "success",
        events: [{ id: 3, type: "message", message: makeChannelMessage(2001) }],
      },
    ];
    await runMonitorOnce();

    expect(state.core.channel.reply.finalizeInboundContext).toHaveBeenCalledTimes(1);
    expect(state.core.channel.reply.dispatchReplyFromConfig).toHaveBeenCalledTimes(1);
  });

  it("re-registers the Zulip event queue after a BAD_EVENT_QUEUE_ID response and still processes the message", async () => {
    state.pollResponses = [
      {
        result: "error",
        code: "BAD_EVENT_QUEUE_ID",
        msg: "Bad event queue id",
      },
      {
        result: "success",
        events: [{ id: 4, type: "message", message: makeChannelMessage(3001) }],
      },
    ];

    await runMonitorOnce();

    expect(registerZulipQueueMock).toHaveBeenCalledTimes(2);
    expect(state.core.channel.reply.finalizeInboundContext).toHaveBeenCalledTimes(1);
    expect(state.core.system.enqueueSystemEvent).not.toHaveBeenCalled();
  });
});
