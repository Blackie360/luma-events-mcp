import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const DEFAULT_API_BASE = "https://public-api.luma.com";
const MAX_BULK_APPROVALS = 150;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function apiKey(): string {
  const value = process.env.LUMA_API_KEY?.trim();
  if (!value) {
    throw new Error("LUMA_API_KEY is not configured. Generate a calendar API key in Luma and expose it to the plugin environment.");
  }
  return value;
}

export async function luma(path: string, options: { method?: "GET" | "POST"; query?: Record<string, unknown>; body?: unknown } = {}): Promise<Json> {
  const url = new URL(path, process.env.LUMA_API_BASE?.trim() || DEFAULT_API_BASE);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "x-luma-api-key": apiKey(),
      ...(options.body === undefined ? {} : { "content-type": "application/json" })
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(30_000)
  });

  const text = await response.text();
  let payload: Json;
  try {
    payload = text ? JSON.parse(text) as Json : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new Error(`Luma API ${response.status}: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`);
  }
  return payload;
}

function result(data: Json) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: { result: data }
  };
}

export function requireConfirmation(confirmed: boolean, action: string): void {
  if (!confirmed) throw new Error(`Confirmation required before ${action}. Review the proposed values, ask the user to confirm, then retry with confirmed=true.`);
}

export function createServer(): McpServer {
const server = new McpServer({ name: "luma-events", version: "0.2.0" });

server.registerTool("verify_connection", {
  title: "Verify Luma connection",
  description: "Verify the configured Luma API key and return the authenticated user.",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: true }
}, async () => result(await luma("/v1/users/get-self")));

server.registerTool("list_events", {
  title: "List Luma events",
  description: "List events from the calendar attached to the configured API key.",
  inputSchema: {
    after: z.string().datetime().optional().describe("Only events after this ISO 8601 datetime."),
    before: z.string().datetime().optional().describe("Only events before this ISO 8601 datetime."),
    status: z.enum(["approved", "pending"]).optional().describe("Filter by calendar submission status. Defaults to approved."),
    pagination_limit: z.number().int().min(1).max(100).default(25),
    pagination_cursor: z.string().optional()
  },
  annotations: { readOnlyHint: true, openWorldHint: true }
}, async (input) => result(await luma("/v1/calendars/events/list", { query: input })));

server.registerTool("get_event", {
  title: "Get Luma event",
  description: "Get complete details for one Luma event.",
  inputSchema: { event_id: z.string().min(1) },
  annotations: { readOnlyHint: true, openWorldHint: true }
}, async ({ event_id }) => result(await luma("/v1/events/get", { query: { event_id } })));

const eventFields = {
  name: z.string().min(1),
  start_at: z.string().datetime(),
  end_at: z.string().datetime().optional(),
  timezone: z.string().default("Africa/Nairobi"),
  description_md: z.string().optional(),
  slug: z.string().optional(),
  max_capacity: z.number().int().positive().nullable().optional(),
  meeting_url: z.string().url().optional(),
  geo_address_json: z.object({ type: z.literal("manual"), address: z.string().min(1) }).optional(),
  location_visibility: z.enum(["public", "guests-only"]).optional(),
  visibility: z.enum(["public", "members-only", "private"]).optional(),
  registration_open: z.boolean().optional(),
  waitlist_status: z.enum(["enabled", "disabled"]).optional(),
  show_guest_list: z.boolean().optional()
};

server.registerTool("create_event", {
  title: "Create Luma event",
  description: "Create a Luma event. Call only after the user has explicitly confirmed the event name, date/time, timezone, and supplied details.",
  inputSchema: { ...eventFields, confirmed: z.boolean().describe("Must be true only after explicit user confirmation.") },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
}, async ({ confirmed, ...body }) => {
  requireConfirmation(confirmed, "creating the Luma event");
  return result(await luma("/v1/events/create", { method: "POST", body }));
});

server.registerTool("update_event", {
  title: "Update Luma event",
  description: "Update selected fields on a Luma event. Call only after showing the changes and receiving explicit confirmation.",
  inputSchema: {
    event_id: z.string().min(1),
    confirmed: z.boolean(),
    name: z.string().min(1).optional(),
    start_at: z.string().datetime().optional(),
    end_at: z.string().datetime().optional(),
    timezone: z.string().optional(),
    description_md: z.string().optional(),
    slug: z.string().optional(),
    max_capacity: z.number().int().positive().nullable().optional(),
    meeting_url: z.string().url().optional(),
    geo_address_json: z.object({ type: z.literal("manual"), address: z.string().min(1) }).optional(),
    location_visibility: z.enum(["public", "guests-only"]).optional(),
    visibility: z.enum(["public", "members-only", "private"]).optional(),
    registration_open: z.boolean().optional(),
    waitlist_status: z.enum(["enabled", "disabled"]).optional(),
    show_guest_list: z.boolean().optional(),
    suppress_notifications: z.boolean().default(false)
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
}, async ({ confirmed, ...body }) => {
  requireConfirmation(confirmed, "updating the Luma event");
  return result(await luma("/v1/events/update", { method: "POST", body }));
});

server.registerTool("approve_waitlisted_guests", {
  title: "Approve waitlisted Luma guests",
  description: "Approve every guest who is currently waitlisted for an event. Call only after showing the event, waitlisted guest count, and email notification choice, then receiving explicit confirmation.",
  inputSchema: {
    event_id: z.string().min(1),
    send_email: z.boolean().default(true).describe("Whether Luma should email each guest about the approval."),
    message: z.string().max(200).optional().describe("Optional personal message included in Luma's approval email. Cannot be used when send_email is false."),
    confirmed: z.boolean().describe("Must be true only after explicit user confirmation.")
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
}, async ({ event_id, send_email, message, confirmed }) => {
  requireConfirmation(confirmed, "approving all waitlisted Luma guests");
  return result(await approveWaitlistedGuests(event_id, { send_email, message }));
});

server.registerTool("list_guests", {
  title: "List Luma guests",
  description: "List guests for an event. Guest data may include personal information; use only for event operations requested by the user.",
  inputSchema: {
    event_id: z.string().min(1),
    approval_status: z.enum(["approved", "session", "pending_approval", "invited", "declined", "waitlist"]).optional(),
    pagination_limit: z.number().int().min(1).max(100).default(50),
    pagination_cursor: z.string().optional()
  },
  annotations: { readOnlyHint: true, openWorldHint: true }
}, async (input) => result(await luma("/v1/events/guests/list", { query: input })));

server.registerTool("registration_summary", {
  title: "Summarize Luma registrations",
  description: "Count guest approval states and check-ins for an event across all guest pages without returning guest identities.",
  inputSchema: { event_id: z.string().min(1) },
  annotations: { readOnlyHint: true, openWorldHint: true }
}, async ({ event_id }) => {
  return result(await summarizeRegistrations(event_id));
});

return server;
}

export type LumaRequest = (
  path: string,
  options?: { method?: "GET" | "POST"; query?: Record<string, unknown>; body?: unknown }
) => Promise<unknown>;

export async function approveWaitlistedGuests(
  event_id: string,
  options: { send_email?: boolean; message?: string } = {},
  request: LumaRequest = luma
): Promise<Json> {
  const send_email = options.send_email ?? true;
  if (!send_email && options.message) {
    throw new Error("An approval message cannot be sent when send_email is false.");
  }

  const guestIds: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await request("/v1/events/guests/list", {
      query: {
        event_id,
        approval_status: "waitlist",
        pagination_limit: 100,
        pagination_cursor: cursor
      }
    }) as {
      entries?: Array<Record<string, unknown>>;
      has_more?: boolean;
      next_cursor?: string;
    };

    for (const guest of page.entries ?? []) {
      if (typeof guest.id !== "string" || !guest.id) {
        throw new Error("Luma returned a waitlisted guest without an id; no guests were approved.");
      }
      guestIds.push(guest.id);
    }

    cursor = page.has_more ? page.next_cursor : undefined;
    if (page.has_more && !cursor) {
      throw new Error("Luma returned has_more=true without a next_cursor; no guests were approved.");
    }
  } while (cursor);

  const uniqueGuestIds = [...new Set(guestIds)];
  if (uniqueGuestIds.length > MAX_BULK_APPROVALS) {
    throw new Error(
      `Found ${uniqueGuestIds.length} waitlisted guests, exceeding the safe per-call limit of ${MAX_BULK_APPROVALS}; no guests were approved.`
    );
  }

  let approved = 0;
  const failures: Array<{ guest_id: string; error: string }> = [];
  for (const guest_id of uniqueGuestIds) {
    try {
      await request("/v1/events/guests/update-status", {
        method: "POST",
        body: {
          event_id,
          guest_id,
          status: "approved",
          send_email,
          ...(options.message === undefined ? {} : { message: options.message })
        }
      });
      approved += 1;
    } catch (error) {
      failures.push({
        guest_id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    event_id,
    found_waitlisted: uniqueGuestIds.length,
    approved,
    failed: failures.length,
    ...(failures.length === 0 ? {} : { failures })
  };
}

export async function summarizeRegistrations(event_id: string, request: LumaRequest = luma): Promise<Json> {
  const counts: Record<string, number> = { total: 0, checked_in: 0 };
  let cursor: string | undefined;
  do {
    const page = await request("/v1/events/guests/list", { query: { event_id, pagination_limit: 100, pagination_cursor: cursor } }) as { entries?: Array<Record<string, unknown>>; has_more?: boolean; next_cursor?: string };
    for (const guest of page.entries ?? []) {
      counts.total += 1;
      const status = typeof guest.approval_status === "string" ? guest.approval_status : "unknown";
      counts[status] = (counts[status] ?? 0) + 1;
      const tickets = Array.isArray(guest.event_tickets) ? guest.event_tickets as Array<Record<string, unknown>> : [];
      if (tickets.some((ticket) => Boolean(ticket.checked_in_at))) counts.checked_in += 1;
    }
    cursor = page.has_more ? page.next_cursor : undefined;
    if (page.has_more && !cursor) {
      throw new Error("Luma returned has_more=true without a next_cursor.");
    }
  } while (cursor);
  return { event_id, ...counts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const transport = new StdioServerTransport();
  await createServer().connect(transport);
}
