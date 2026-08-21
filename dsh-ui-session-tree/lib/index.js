/**
 * dsh-ui-session-tree host half: intentionally empty.
 *
 * The whole plugin lives in the browser half (lib/client.js): session lineage
 * and per-turn history are already reachable there through the wire API
 * (`session.list` summaries carry parentSessionId; `session.history` returns
 * the raw event log whose trailing `session/end-seed` marks the fork
 * boundary; `session.fork({sessionId, atSeq})` cuts at a completed turn).
 * This entry exists only so the profile's loader entry has a loadable host
 * module.
 */
export function apply(_ctx) {}
