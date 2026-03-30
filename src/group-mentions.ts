import type { ChannelGroupContext } from "./sdk.js";
import { resolveZulipAccount } from "./zulip/accounts.js";

export function resolveZulipGroupRequireMention(params: ChannelGroupContext): boolean | undefined {
  const account = resolveZulipAccount({
    cfg: params.cfg,
    accountId: params.accountId,
  });
  if (typeof account.requireMention === "boolean") {
    return account.requireMention;
  }
  return true;
}
