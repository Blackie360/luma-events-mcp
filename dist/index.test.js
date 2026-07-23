import assert from "node:assert/strict";
import test from "node:test";
import { approveWaitlistedGuests, luma, requireConfirmation, summarizeRegistrations } from "./index.js";
test("requireConfirmation blocks unconfirmed writes", () => {
    assert.throws(() => requireConfirmation(false, "creating an event"), /Confirmation required before creating an event/);
    assert.doesNotThrow(() => requireConfirmation(true, "creating an event"));
});
test("luma includes API errors in a useful exception", async (t) => {
    t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ message: "invalid request" }), { status: 400, headers: { "content-type": "application/json" } }));
    process.env.LUMA_API_KEY = "test-key";
    await assert.rejects(luma("/v1/events/get", { query: { event_id: "evt-test" } }), /Luma API 400:.*invalid request/);
});
test("registration summary paginates and avoids returning identities", async () => {
    const cursors = [];
    const request = async (_path, options = {}) => {
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
    const summary = await summarizeRegistrations("evt-test", request);
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
    await assert.rejects(summarizeRegistrations("evt-test", request), /has_more=true without a next_cursor/);
});
test("waitlist approval paginates, approves every guest, and avoids returning identities", async () => {
    const updates = [];
    const request = async (path, options = {}) => {
        if (path === "/v1/events/guests/list") {
            assert.equal(options.query?.approval_status, "waitlist");
            if (!options.query?.pagination_cursor) {
                return {
                    entries: [{ id: "gst-one", user_name: "Private Person", user_email: "private@example.com" }],
                    has_more: true,
                    next_cursor: "page-2"
                };
            }
            return {
                entries: [{ id: "gst-two", user_name: "Another Person", user_email: "another@example.com" }],
                has_more: false
            };
        }
        assert.equal(path, "/v1/events/guests/update-status");
        updates.push(options.body);
        return {};
    };
    const summary = await approveWaitlistedGuests("evt-test", { send_email: true, message: "See you there!" }, request);
    assert.deepEqual(updates, [
        {
            event_id: "evt-test",
            guest_id: "gst-one",
            status: "approved",
            send_email: true,
            message: "See you there!"
        },
        {
            event_id: "evt-test",
            guest_id: "gst-two",
            status: "approved",
            send_email: true,
            message: "See you there!"
        }
    ]);
    assert.deepEqual(summary, {
        event_id: "evt-test",
        found_waitlisted: 2,
        approved: 2,
        failed: 0
    });
    assert.doesNotMatch(JSON.stringify(summary), /Private Person|private@example.com/);
});
test("waitlist approval reports partial failures for safe retries", async () => {
    const request = async (path, options = {}) => {
        if (path === "/v1/events/guests/list") {
            return {
                entries: [{ id: "gst-one" }, { id: "gst-two" }],
                has_more: false
            };
        }
        const body = options.body;
        if (body.guest_id === "gst-two")
            throw new Error("capacity reached");
        return {};
    };
    const summary = await approveWaitlistedGuests("evt-test", {}, request);
    assert.deepEqual(summary, {
        event_id: "evt-test",
        found_waitlisted: 2,
        approved: 1,
        failed: 1,
        failures: [{ guest_id: "gst-two", error: "capacity reached" }]
    });
});
test("waitlist approval rejects messages when email is disabled before calling Luma", async () => {
    let called = false;
    const request = async () => {
        called = true;
        return {};
    };
    await assert.rejects(approveWaitlistedGuests("evt-test", { send_email: false, message: "This cannot be delivered." }, request), /cannot be sent when send_email is false/);
    assert.equal(called, false);
});
//# sourceMappingURL=index.test.js.map