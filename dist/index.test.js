import assert from "node:assert/strict";
import test from "node:test";
import { approveWaitlistedGuests, deleteEvent, inviteGuestsFromEvent, luma, requireConfirmation, sendInvites, summarizeRegistrations } from "./index.js";
test("requireConfirmation blocks unconfirmed writes", () => {
    assert.throws(() => requireConfirmation(false, "creating an event"), /Confirmation required before creating an event/);
    assert.doesNotThrow(() => requireConfirmation(true, "creating an event"));
});
test("luma includes API errors in a useful exception", async (t) => {
    t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ message: "invalid request" }), { status: 400, headers: { "content-type": "application/json" } }));
    process.env.LUMA_API_KEY = "test-key";
    await assert.rejects(luma("/v1/events/get", { query: { event_id: "evt-test" } }), /Luma API 400:.*invalid request/);
});
test("event deletion previews impact without canceling", async () => {
    const requests = [];
    const request = async (path, options = {}) => {
        requests.push({ path, body: options.body });
        if (path === "/v1/events/get") {
            return { id: "evt-test", name: "Test Event", start_at: "2026-08-14T14:00:00Z" };
        }
        if (path === "/v1/events/cancel/request") {
            return { cancellation_token: "cancel-secret", is_paid: true, guest_count: 42 };
        }
        throw new Error("cancel endpoint must not be called during preview");
    };
    const preview = await deleteEvent({ event_id: "evt-test", confirmed: false }, request);
    assert.deepEqual(preview, {
        event_id: "evt-test",
        name: "Test Event",
        start_at: "2026-08-14T14:00:00Z",
        guest_count: 42,
        is_paid: true,
        refund_choice_required: true,
        guests_will_be_notified: true,
        irreversible: true,
        preview_only: true,
        confirmation_required: true
    });
    assert.deepEqual(requests, [
        { path: "/v1/events/get", body: undefined },
        { path: "/v1/events/cancel/request", body: { event_id: "evt-test" } }
    ]);
    assert.doesNotMatch(JSON.stringify(preview), /cancel-secret/);
});
test("event deletion uses Luma's two-step cancellation flow", async () => {
    const requests = [];
    const request = async (path, options = {}) => {
        requests.push({ path, body: options.body });
        if (path === "/v1/events/get")
            return { name: "Paid Event" };
        if (path === "/v1/events/cancel/request") {
            return { cancellation_token: "cancel-secret", is_paid: true, guest_count: 7 };
        }
        assert.equal(path, "/v1/events/cancel");
        return {};
    };
    const deleted = await deleteEvent({ event_id: "evt-paid", should_refund: true, confirmed: true }, request);
    assert.deepEqual(requests, [
        { path: "/v1/events/get", body: undefined },
        { path: "/v1/events/cancel/request", body: { event_id: "evt-paid" } },
        {
            path: "/v1/events/cancel",
            body: {
                event_id: "evt-paid",
                cancellation_token: "cancel-secret",
                should_refund: true
            }
        }
    ]);
    assert.deepEqual(deleted, {
        event_id: "evt-paid",
        name: "Paid Event",
        guest_count: 7,
        is_paid: true,
        refund_choice_required: true,
        guests_will_be_notified: true,
        irreversible: true,
        preview_only: false,
        deleted: true,
        refunds_requested: true
    });
});
test("event deletion requires an explicit refund choice for paid events", async () => {
    let cancelCalls = 0;
    const request = async (path) => {
        if (path === "/v1/events/get")
            return { name: "Paid Event" };
        if (path === "/v1/events/cancel/request") {
            return { cancellation_token: "cancel-secret", is_paid: true, guest_count: 7 };
        }
        cancelCalls += 1;
        return {};
    };
    await assert.rejects(deleteEvent({ event_id: "evt-paid", confirmed: true }, request), /should_refund must be set explicitly/);
    assert.equal(cancelCalls, 0);
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
        attempted: 2,
        approved: 2,
        failed: 0,
        remaining_waitlisted: 0,
        resume_required: false
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
        attempted: 2,
        approved: 1,
        failed: 1,
        remaining_waitlisted: 1,
        resume_required: true,
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
test("waitlist approval stays below the conservative write limit and resumes safely", async () => {
    const waitlisted = new Set(Array.from({ length: 95 }, (_, index) => "gst-" + index));
    let updateCalls = 0;
    const request = async (path, options = {}) => {
        if (path === "/v1/events/guests/list") {
            return {
                entries: [...waitlisted].map((id) => ({ id })),
                has_more: false
            };
        }
        assert.equal(path, "/v1/events/guests/update-status");
        const body = options.body;
        waitlisted.delete(body.guest_id);
        updateCalls += 1;
        return {};
    };
    const first = await approveWaitlistedGuests("evt-test", { send_email: false }, request);
    assert.deepEqual(first, {
        event_id: "evt-test",
        found_waitlisted: 95,
        attempted: 90,
        approved: 90,
        failed: 0,
        remaining_waitlisted: 5,
        resume_required: true
    });
    const second = await approveWaitlistedGuests("evt-test", { send_email: false }, request);
    assert.deepEqual(second, {
        event_id: "evt-test",
        found_waitlisted: 5,
        attempted: 5,
        approved: 5,
        failed: 0,
        remaining_waitlisted: 0,
        resume_required: false
    });
    assert.equal(updateCalls, 95);
});
test("sendInvites batches recipients and returns no identities", async () => {
    const batchSizes = [];
    const guests = Array.from({ length: 205 }, (_, index) => ({ email: "guest" + index + "@example.com" }));
    const request = async (path, options = {}) => {
        assert.equal(path, "/v1/events/guests/send-invites");
        const body = options.body;
        assert.equal(body.event_id, "evt-target");
        assert.equal(body.message, "Join us");
        batchSizes.push(body.guests.length);
        return {};
    };
    const summary = await sendInvites("evt-target", guests, "Join us", request);
    assert.deepEqual(batchSizes, [100, 100, 5]);
    assert.deepEqual(summary, {
        event_id: "evt-target",
        requested: 205,
        invited: 205,
        failed: 0,
        batches: 3,
        complete: true
    });
    assert.doesNotMatch(JSON.stringify(summary), /guest0@example.com/);
});
test("inviteGuestsFromEvent previews aggregate deduplication without writing or exposing identities", async () => {
    let writes = 0;
    const request = async (path, options = {}) => {
        assert.equal(path, "/v1/events/guests/list");
        if (options.query?.event_id === "evt-target") {
            return { entries: [{ user_email: "bob@example.com" }], has_more: false };
        }
        if (options.query?.approval_status === "approved") {
            return {
                entries: [
                    { user_email: "ALICE@example.com", user_name: "Alice Private" },
                    { user_email: "alice@example.com", user_name: "Duplicate Private" }
                ],
                has_more: false
            };
        }
        if (options.query?.approval_status === "waitlist") {
            return {
                entries: [{ user_email: "bob@example.com" }, { user_name: "Missing Email" }],
                has_more: false
            };
        }
        writes += 1;
        return {};
    };
    const preview = await inviteGuestsFromEvent({
        source_event_id: "evt-source",
        target_event_id: "evt-target",
        source_statuses: ["approved", "waitlist"],
        confirmed: false
    }, request);
    assert.deepEqual(preview, {
        source_event_id: "evt-source",
        target_event_id: "evt-target",
        source_statuses: ["approved", "waitlist"],
        source_guests_found: 4,
        source_unique_emails: 2,
        excluded_invalid_or_missing_email: 1,
        excluded_duplicate_source_email: 1,
        excluded_already_in_target: 1,
        eligible_to_invite: 1,
        batches_required: 1,
        preview_only: true,
        confirmation_required: true
    });
    assert.equal(writes, 0);
    assert.doesNotMatch(JSON.stringify(preview), /alice@example.com|Alice Private|bob@example.com/);
});
test("inviteGuestsFromEvent sends the confirmed audience in resumable batches", async () => {
    const inviteBatches = [];
    const request = async (path, options = {}) => {
        if (path === "/v1/events/guests/list") {
            if (options.query?.event_id === "evt-target")
                return { entries: [], has_more: false };
            return {
                entries: Array.from({ length: 103 }, (_, index) => ({ user_email: "person" + index + "@example.com" })),
                has_more: false
            };
        }
        assert.equal(path, "/v1/events/guests/send-invites");
        const body = options.body;
        assert.equal(body.event_id, "evt-target");
        assert.equal(body.message, "Virtual workshop");
        inviteBatches.push(body.guests);
        return {};
    };
    const sent = await inviteGuestsFromEvent({
        source_event_id: "evt-source",
        target_event_id: "evt-target",
        source_statuses: ["waitlist"],
        message: "Virtual workshop",
        confirmed: true
    }, request);
    assert.deepEqual(inviteBatches.map((batch) => batch.length), [100, 3]);
    assert.deepEqual(sent, {
        source_event_id: "evt-source",
        target_event_id: "evt-target",
        source_statuses: ["waitlist"],
        source_guests_found: 103,
        source_unique_emails: 103,
        excluded_invalid_or_missing_email: 0,
        excluded_duplicate_source_email: 0,
        excluded_already_in_target: 0,
        eligible_to_invite: 103,
        batches_required: 2,
        preview_only: false,
        event_id: "evt-target",
        requested: 103,
        invited: 103,
        failed: 0,
        batches: 2,
        complete: true
    });
    assert.doesNotMatch(JSON.stringify(sent), /person0@example.com/);
});
test("inviteGuestsFromEvent rejects a source event used as its own target", async () => {
    let called = false;
    const request = async () => {
        called = true;
        return {};
    };
    await assert.rejects(inviteGuestsFromEvent({ source_event_id: "evt-same", target_event_id: "evt-same" }, request), /must be different/);
    assert.equal(called, false);
});
//# sourceMappingURL=index.test.js.map