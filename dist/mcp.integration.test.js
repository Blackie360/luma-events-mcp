import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./index.js";
test("MCP client discovers and safely calls delete_event", async (t) => {
    process.env.LUMA_API_KEY = "test-key";
    const requests = [];
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = input instanceof URL
            ? input
            : new URL(typeof input === "string" ? input : input.url);
        const method = init?.method ?? "GET";
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
        requests.push({ path: url.pathname, method, body });
        if (url.pathname === "/v1/events/get") {
            return Response.json({ id: "evt-test", name: "Test Event", start_at: "2026-08-14T14:00:00Z" });
        }
        if (url.pathname === "/v1/events/cancel/request") {
            return Response.json({ cancellation_token: "cancel-secret", is_paid: false, guest_count: 12 });
        }
        assert.equal(url.pathname, "/v1/events/cancel");
        return Response.json({});
    });
    const server = createServer();
    const client = new Client({ name: "luma-events-delete-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    t.after(async () => {
        await client.close();
        await server.close();
    });
    const listed = await client.listTools();
    assert.ok(listed.tools.some((tool) => tool.name === "delete_event"));
    const preview = await client.callTool({
        name: "delete_event",
        arguments: {
            event_id: "evt-test",
            confirmed: false
        }
    });
    assert.deepEqual(preview.structuredContent, {
        result: {
            event_id: "evt-test",
            name: "Test Event",
            start_at: "2026-08-14T14:00:00Z",
            guest_count: 12,
            is_paid: false,
            refund_choice_required: false,
            guests_will_be_notified: true,
            irreversible: true,
            preview_only: true,
            confirmation_required: true
        }
    });
    assert.equal(requests.some((request) => request.path === "/v1/events/cancel"), false);
    const deleted = await client.callTool({
        name: "delete_event",
        arguments: {
            event_id: "evt-test",
            confirmed: true
        }
    });
    assert.deepEqual(deleted.structuredContent, {
        result: {
            event_id: "evt-test",
            name: "Test Event",
            start_at: "2026-08-14T14:00:00Z",
            guest_count: 12,
            is_paid: false,
            refund_choice_required: false,
            guests_will_be_notified: true,
            irreversible: true,
            preview_only: false,
            deleted: true,
            refunds_requested: false
        }
    });
    assert.deepEqual(requests, [
        { path: "/v1/events/get", method: "GET", body: undefined },
        { path: "/v1/events/cancel/request", method: "POST", body: { event_id: "evt-test" } },
        { path: "/v1/events/get", method: "GET", body: undefined },
        { path: "/v1/events/cancel/request", method: "POST", body: { event_id: "evt-test" } },
        {
            path: "/v1/events/cancel",
            method: "POST",
            body: {
                event_id: "evt-test",
                cancellation_token: "cancel-secret"
            }
        }
    ]);
});
test("MCP client discovers and safely calls approve_waitlisted_guests", async (t) => {
    process.env.LUMA_API_KEY = "test-key";
    const requests = [];
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = input instanceof URL
            ? input
            : new URL(typeof input === "string" ? input : input.url);
        const method = init?.method ?? "GET";
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
        requests.push({ path: url.pathname, method, body });
        if (url.pathname === "/v1/events/guests/list") {
            assert.equal(url.searchParams.get("approval_status"), "waitlist");
            return Response.json({
                entries: [{ id: "gst-one" }, { id: "gst-two" }],
                has_more: false
            });
        }
        assert.equal(url.pathname, "/v1/events/guests/update-status");
        return Response.json({});
    });
    const server = createServer();
    const client = new Client({ name: "luma-events-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    t.after(async () => {
        await client.close();
        await server.close();
    });
    const listed = await client.listTools();
    assert.ok(listed.tools.some((tool) => tool.name === "approve_waitlisted_guests"));
    const blocked = await client.callTool({
        name: "approve_waitlisted_guests",
        arguments: {
            event_id: "evt-test",
            send_email: false,
            confirmed: false
        }
    });
    assert.equal(blocked.isError, true);
    assert.match(JSON.stringify(blocked.content), /Confirmation required/);
    assert.equal(requests.length, 0);
    const result = await client.callTool({
        name: "approve_waitlisted_guests",
        arguments: {
            event_id: "evt-test",
            send_email: false,
            confirmed: true
        }
    });
    assert.deepEqual(result.structuredContent, {
        result: {
            event_id: "evt-test",
            found_waitlisted: 2,
            attempted: 2,
            approved: 2,
            failed: 0,
            remaining_waitlisted: 0,
            resume_required: false
        }
    });
    assert.deepEqual(requests, [
        {
            path: "/v1/events/guests/list",
            method: "GET",
            body: undefined
        },
        {
            path: "/v1/events/guests/update-status",
            method: "POST",
            body: {
                event_id: "evt-test",
                guest_id: "gst-one",
                status: "approved",
                send_email: false
            }
        },
        {
            path: "/v1/events/guests/update-status",
            method: "POST",
            body: {
                event_id: "evt-test",
                guest_id: "gst-two",
                status: "approved",
                send_email: false
            }
        }
    ]);
});
test("MCP client discovers and safely calls the v0.3 guest tools", async (t) => {
    process.env.LUMA_API_KEY = "test-key";
    const requests = [];
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = input instanceof URL
            ? input
            : new URL(typeof input === "string" ? input : input.url);
        const method = init?.method ?? "GET";
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
        requests.push({ path: url.pathname, method, body, query: url.search });
        if (url.pathname === "/v1/events/guests/get") {
            return Response.json({ id: "gst-one", user_email: "guest@example.com" });
        }
        return Response.json({});
    });
    const server = createServer();
    const client = new Client({ name: "luma-events-v03-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    t.after(async () => {
        await client.close();
        await server.close();
    });
    const listed = await client.listTools();
    for (const name of ["get_guest", "add_guests", "send_invites", "invite_guests_from_event"]) {
        assert.ok(listed.tools.some((tool) => tool.name === name), "missing tool " + name);
    }
    const blocked = await client.callTool({
        name: "send_invites",
        arguments: {
            event_id: "evt-target",
            guests: [{ email: "guest@example.com" }],
            confirmed: false
        }
    });
    assert.equal(blocked.isError, true);
    assert.equal(requests.length, 0);
    const guest = await client.callTool({
        name: "get_guest",
        arguments: { event_id: "evt-target", id: "guest@example.com" }
    });
    assert.deepEqual(guest.structuredContent, {
        result: { id: "gst-one", user_email: "guest@example.com" }
    });
    const added = await client.callTool({
        name: "add_guests",
        arguments: {
            event_id: "evt-target",
            guests: [{
                    email: "new@example.com",
                    name: "New Guest",
                    registration_answers: [{ question_id: "q-company", value: { company: "Acme", job_title: "Engineer" } }]
                }],
            approval_status: "waitlist",
            send_email: false,
            confirmed: true
        }
    });
    assert.deepEqual(added.structuredContent, {
        result: {
            event_id: "evt-target",
            added: 1,
            approval_status: "waitlist",
            send_email: false
        }
    });
    const invited = await client.callTool({
        name: "send_invites",
        arguments: {
            event_id: "evt-target",
            guests: [{ email: "invitee@example.com", name: "Invitee" }],
            message: "Join us",
            confirmed: true
        }
    });
    assert.deepEqual(invited.structuredContent, {
        result: {
            event_id: "evt-target",
            requested: 1,
            invited: 1,
            failed: 0,
            batches: 1,
            complete: true
        }
    });
    assert.deepEqual(requests, [
        {
            path: "/v1/events/guests/get",
            method: "GET",
            body: undefined,
            query: "?event_id=evt-target&id=guest%40example.com"
        },
        {
            path: "/v1/events/guests/add",
            method: "POST",
            body: {
                event_id: "evt-target",
                guests: [{
                        email: "new@example.com",
                        name: "New Guest",
                        registration_answers: [{ question_id: "q-company", value: { company: "Acme", job_title: "Engineer" } }]
                    }],
                approval_status: "waitlist",
                send_email: false
            },
            query: ""
        },
        {
            path: "/v1/events/guests/send-invites",
            method: "POST",
            body: {
                event_id: "evt-target",
                guests: [{ email: "invitee@example.com", name: "Invitee" }],
                message: "Join us"
            },
            query: ""
        }
    ]);
});
//# sourceMappingURL=mcp.integration.test.js.map