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
test("MCP client discovers and safely calls the v0.5 guest, ticket, and host tools", async (t) => {
    process.env.LUMA_API_KEY = "test-key";
    const requests = [];
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = input instanceof URL
            ? input
            : new URL(typeof input === "string" ? input : input.url);
        const method = init?.method ?? "GET";
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
        requests.push({ path: url.pathname, method, body, query: url.search });
        if (url.pathname === "/v1/events/get") {
            return Response.json({
                id: "evt-test",
                name: "v0.5 Event",
                hosts: [{ id: "usr-host", email: "host@example.com", name: "Test Host" }]
            });
        }
        if (url.pathname === "/v1/events/guests/get") {
            return Response.json({
                id: "gst-one",
                user_email: "guest@example.com",
                user_name: "Test Guest",
                approval_status: "waitlist",
                event_tickets: [
                    { id: "tkt-one", name: "General", event_ticket_type_id: "ttype-general", amount: 0, is_captured: true }
                ]
            });
        }
        if (url.pathname === "/v1/events/ticket-types/list") {
            return Response.json({
                entries: [
                    { id: "ttype-general", name: "General", type: "free", is_hidden: false },
                    { id: "ttype-extra", name: "Extra", type: "free", is_hidden: true }
                ]
            });
        }
        if (url.pathname === "/v1/events/ticket-types/get") {
            return Response.json({ id: "ttype-extra", name: "Extra", type: "free", is_hidden: true });
        }
        if (url.pathname === "/v1/events/ticket-types/create") {
            return Response.json({ id: "ttype-created", ...body });
        }
        if (url.pathname === "/v1/events/ticket-types/update") {
            return Response.json({ id: "ttype-extra", name: "Updated", type: "free" });
        }
        return Response.json({});
    });
    const server = createServer();
    const client = new Client({ name: "luma-events-v05-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    t.after(async () => {
        await client.close();
        await server.close();
    });
    const listed = await client.listTools();
    const tools = new Map(listed.tools.map((tool) => [tool.name, tool]));
    const expected = [
        "update_guest_status",
        "update_guest_tickets",
        "list_ticket_types",
        "get_ticket_type",
        "create_ticket_type",
        "update_ticket_type",
        "delete_ticket_type",
        "add_host",
        "update_host",
        "remove_host"
    ];
    for (const name of expected) {
        assert.ok(tools.has(name), "missing tool " + name);
    }
    assert.equal(tools.get("list_ticket_types")?.annotations?.readOnlyHint, true);
    assert.equal(tools.get("get_ticket_type")?.annotations?.readOnlyHint, true);
    assert.equal(tools.get("update_guest_tickets")?.annotations?.destructiveHint, true);
    assert.equal(tools.get("update_guest_tickets")?.annotations?.idempotentHint, false);
    assert.equal(tools.get("delete_ticket_type")?.annotations?.destructiveHint, true);
    assert.equal(tools.get("remove_host")?.annotations?.destructiveHint, true);
    await client.callTool({
        name: "list_ticket_types",
        arguments: { event_id: "evt-test", include_hidden: true }
    });
    await client.callTool({
        name: "get_ticket_type",
        arguments: { event_ticket_type_id: "ttype-extra" }
    });
    const statusPreview = await client.callTool({
        name: "update_guest_status",
        arguments: {
            event_id: "evt-test",
            guest_id: "gst-one",
            status: "approved",
            send_email: false,
            confirmed: false
        }
    });
    assert.equal(statusPreview.structuredContent.result.preview_only, true);
    await client.callTool({
        name: "update_guest_status",
        arguments: {
            event_id: "evt-test",
            guest_id: "gst-one",
            status: "approved",
            send_email: false,
            confirmed: true
        }
    });
    const ticketsPreview = await client.callTool({
        name: "update_guest_tickets",
        arguments: {
            event_id: "evt-test",
            guest_id: "gst-one",
            tickets_to_add: [{ event_ticket_type_id: "ttype-extra" }],
            send_email: false,
            confirmed: false
        }
    });
    assert.equal(ticketsPreview.structuredContent.result.preview_only, true);
    await client.callTool({
        name: "update_guest_tickets",
        arguments: {
            event_id: "evt-test",
            guest_id: "gst-one",
            tickets_to_add: [{ event_ticket_type_id: "ttype-extra" }],
            send_email: false,
            confirmed: true
        }
    });
    for (const blockedWrite of [
        {
            name: "create_ticket_type",
            arguments: { event_id: "evt-test", name: "Created", type: "free", confirmed: false }
        },
        {
            name: "update_ticket_type",
            arguments: { event_ticket_type_id: "ttype-extra", name: "Updated", confirmed: false }
        },
        {
            name: "add_host",
            arguments: { event_id: "evt-test", email: "new-host@example.com", confirmed: false }
        },
        {
            name: "update_host",
            arguments: { event_id: "evt-test", email: "host@example.com", access_level: "check-in", confirmed: false }
        }
    ]) {
        const requestCount = requests.length;
        const blocked = await client.callTool(blockedWrite);
        assert.equal(blocked.isError, true);
        assert.equal(requests.length, requestCount);
    }
    await client.callTool({
        name: "create_ticket_type",
        arguments: {
            event_id: "evt-test",
            name: "Created",
            type: "paid",
            cents: 1000,
            currency: "kes",
            valid_start_at: "2026-08-01",
            confirmed: true
        }
    });
    await client.callTool({
        name: "update_ticket_type",
        arguments: {
            event_ticket_type_id: "ttype-extra",
            name: "Updated",
            description: null,
            max_capacity: null,
            confirmed: true
        }
    });
    const deletePreview = await client.callTool({
        name: "delete_ticket_type",
        arguments: {
            event_id: "evt-test",
            event_ticket_type_id: "ttype-extra",
            confirmed: false
        }
    });
    assert.equal(deletePreview.structuredContent.result.preview_only, true);
    await client.callTool({
        name: "delete_ticket_type",
        arguments: {
            event_id: "evt-test",
            event_ticket_type_id: "ttype-extra",
            confirmed: true
        }
    });
    await client.callTool({
        name: "add_host",
        arguments: {
            event_id: "evt-test",
            email: "new-host@example.com",
            name: "New Host",
            access_level: "manager",
            is_visible: false,
            confirmed: true
        }
    });
    await client.callTool({
        name: "update_host",
        arguments: {
            event_id: "evt-test",
            email: "host@example.com",
            access_level: "check-in",
            is_visible: false,
            confirmed: true
        }
    });
    const removePreview = await client.callTool({
        name: "remove_host",
        arguments: { event_id: "evt-test", email: "host@example.com", confirmed: false }
    });
    assert.equal(removePreview.structuredContent.result.preview_only, true);
    await client.callTool({
        name: "remove_host",
        arguments: { event_id: "evt-test", email: "host@example.com", confirmed: true }
    });
    const paths = requests.map((request) => request.path);
    for (const path of [
        "/v1/events/guests/update-status",
        "/v1/events/guests/update-tickets",
        "/v1/events/ticket-types/list",
        "/v1/events/ticket-types/get",
        "/v1/events/ticket-types/create",
        "/v1/events/ticket-types/update",
        "/v1/events/ticket-types/delete",
        "/v1/events/hosts/add",
        "/v1/events/hosts/update",
        "/v1/events/hosts/remove"
    ]) {
        assert.ok(paths.includes(path), "missing request to " + path);
    }
    assert.ok(requests.some((request) => (request.path === "/v1/events/ticket-types/list"
        && request.query.includes("include_hidden=true"))));
    assert.ok(requests.some((request) => (request.path === "/v1/events/ticket-types/update"
        && request.body.description === null
        && request.body.max_capacity === null)));
});
//# sourceMappingURL=mcp.integration.test.js.map