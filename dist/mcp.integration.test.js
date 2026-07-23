import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./index.js";
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
            approved: 2,
            failed: 0
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
//# sourceMappingURL=mcp.integration.test.js.map