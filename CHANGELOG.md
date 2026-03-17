# Changelog

## 2026.3.17

### Bug Fixes
- **Topic parser**: Preserve topics containing colons and slashes in stream target parser (`stream:name/topic` patterns now route correctly)
- **Poll correctness**: Fix event polling with proper event ID guard and queue expiry handling
- **streamOverrides**: Remove broken streamOverrides feature that caused config issues
- **HEIC conversion**: Add file validation before HEIC-to-JPEG conversion

### Features
- **requireMention wire-up**: Account-level and per-stream requireMention now correctly resolved via SDK helper
- **Environment loader**: Load Zulip credentials from `~/.openclaw/secrets/zulip.env` at startup
- **Media cleanup**: TTL-based cleanup for inbound media temp directories

## 2026.2.1

### Features
- **HEIC/HEIF support**: Auto-convert inbound HEIC/HEIF media to JPEG
- **OpenClaw SDK patterns**: Adopt latest sendPayload, reaction fallback, and defaultAccount patterns
- **Plugin metadata**: Add uiHints to plugin.json

## 1.0.0

- Initial release: Zulip channel plugin for OpenClaw
