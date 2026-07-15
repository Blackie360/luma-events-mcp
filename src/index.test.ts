import assert from "node:assert/strict";
import test from "node:test";

import { luma, requireConfirmation, summarizeRegistrations, type LumaRequest } from "./index.js";

test("requireConfirmation blocks unconfirmed writes", () => {
  assert.throws(
    () => requireConfirmation(false, "creating an event"),
    /Confirmation required before creating an event/
  );
  assert.doesNotThrow(() => requireConfirmation(true, "creating an event"));
});

test("luma includes API errors in a useful exception", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(
    JSON.stringify({ message: "invalid request" }),
    { status: 400, headers: { "content-type": "application/json" } }
  ));
  process.env.LUMA_API_KEY = "test-key";

  await assert.rejects(
    luma("/v1/events/get", { query: { event_id: "evt-test" } }),
    /Luma API 400:.*invalid request/
  );
});

test("registration summary paginates and avoids returning identities", async () => {
  const cursors: Array<unknown> = [];
  const request = async (_path: string, options: { query?: Record<string, unknown> } = {}) => {
    cursors.push(options.query?.pagination_cursor);
    if (!options.query?.pagination_cursor) {
      return {
        entries: [
          { name: "Private Person", approval_status: "approved", event_tickets: [{ checked_in_at: "2026-07-15T08:00:00Z" }] },
          { email: "private@example.com", approval_status: "waitlist", event_tickets: [] }
        ],
        has_more: true,
        next_cursor: "page-2"
      };
    }
    return {
      entries: [{ approval_status: "invited", event_tickets: [] }],
      has_more: false
    };
  };

  const summary = await summarizeRegistrations("evt-test", request as LumaRequest);

  assert.deepEqual(cursors, [undefined, "page-2"]);
  assert.deepEqual(summary, {
    event_id: "evt-test",
    total: 3,
    checked_in: 1,
    approved: 1,
    waitlist: 1,
    invited: 1
  });
  assert.doesNotMatch(JSON.stringify(summary), /Private Person|private@example.com/);
});

test("registration summary rejects broken pagination", async () => {
  const request = async () => ({ entries: [], has_more: true });
  await assert.rejects(
    summarizeRegistrations("evt-test", request as LumaRequest),
    /has_more=true without a next_cursor/
  );
});
