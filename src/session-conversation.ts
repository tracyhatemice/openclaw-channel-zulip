import { sanitizeThreadId } from "./zulip/monitor-helpers.js";

const TOPIC_MARKER = ":topic:";

export function buildZulipStreamConversation(params: {
  streamId: string;
  topic?: string | null;
}): { conversationId: string; threadId?: string } {
  const streamId = params.streamId.trim();
  if (!streamId) {
    return { conversationId: "" };
  }
  const topic = (params.topic ?? "").trim();
  if (!topic) {
    return { conversationId: streamId };
  }
  const threadId = sanitizeThreadId(topic);
  if (!threadId) {
    return { conversationId: streamId };
  }
  return {
    conversationId: `${streamId}${TOPIC_MARKER}${threadId}`,
    threadId,
  };
}

export function resolveZulipSessionConversation(params: {
  kind: "group" | "channel";
  rawId: string;
}) {
  const rawId = params.rawId.trim();
  if (!rawId) {
    return null;
  }

  const markerIndex = rawId.indexOf(TOPIC_MARKER);
  if (markerIndex === -1) {
    return null;
  }

  const id = rawId.slice(0, markerIndex).trim();
  const threadId = rawId.slice(markerIndex + TOPIC_MARKER.length).trim();
  if (!id || !threadId) {
    return null;
  }

  return {
    id,
    threadId,
    baseConversationId: id,
    parentConversationCandidates: [id],
  };
}
