#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const DEFAULT_API_BASE = "https://public-api.luma.com";
const MAX_APPROVALS_PER_RUN = 90;
const INVITE_BATCH_SIZE = 100;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type GuestRecord = Record<string, unknown>;
type GuestContact = { email: string; name?: string };
type ApprovalStatus = "approved" | "session" | "pending_approval" | "invited" | "declined" | "waitlist";
type WritableGuestStatus = "approved" | "declined" | "pending_approval" | "waitlist";
type LumaRecord = Record<string, unknown>;

const approvalStatusSchema = z.enum(["approved", "session", "pending_approval", "invited", "declined", "waitlist"]);
const writableGuestStatusSchema = z.enum(["approved", "declined", "pending_approval", "waitlist"]);
const hostAccessLevelSchema = z.enum(["none", "check-in", "manager"]);
const guestContactSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional()
});
const registrationAnswerValueSchema = z.union([
  z.string(),
  z.boolean(),
  z.array(z.string()),
  z.object({
    company: z.string().nullable().optional(),
    job_title: z.string().nullable().optional()
  })
]);
const guestToAddSchema = guestContactSchema.extend({
  registration_answers: z.array(z.object({
    question_id: z.string().min(1),
    value: registrationAnswerValueSchema
  })).optional()
});
const ticketSchema = z.object({ event_ticket_type_id: z.string().min(1) });
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO 8601 date in YYYY-MM-DD format.");
const ticketTypeMutableFields = {
  name: z.string().min(1).optional(),
  require_approval: z.boolean().optional(),
  is_hidden: z.boolean().optional(),
  description: z.string().nullable().optional(),
  valid_start_at: isoDateSchema.nullable().optional(),
  valid_end_at: isoDateSchema.nullable().optional(),
  max_capacity: z.number().int().nonnegative().nullable().optional(),
  type: z.enum(["free", "paid"]).optional(),
  cents: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().min(3).max(20).nullable().optional(),
  is_flexible: z.boolean().optional(),
  min_cents: z.number().int().nonnegative().nullable().optional()
};

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
  const server = new McpServer({ name: "luma-events", version: "0.5.1" });

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

server.registerTool("get_guest", {
  title: "Get Luma guest",
  description: "Get complete details for one event guest by guest ID, ticket key, guest key, or email. The response contains personal information and ticket-order details.",
  inputSchema: {
    event_id: z.string().min(1),
    id: z.string().min(1).describe("Guest ID, ticket key, guest key, or email.")
  },
  annotations: { readOnlyHint: true, openWorldHint: true }
}, async (input) => result(await luma("/v1/events/guests/get", { query: input })));

server.registerTool("update_guest_status", {
  title: "Update Luma guest status",
  description: "Preview or update one guest's status. The preview shows the exact event, minimal guest identity, current and target status, captured paid-ticket count, refund choice, and notification settings. Moving an approved paid guest to a non-approved status requires an explicit refund choice.",
  inputSchema: {
    event_id: z.string().min(1),
    guest_id: z.string().min(1).describe("Guest ID, ticket key, guest key, or email."),
    status: writableGuestStatusSchema,
    should_refund: z.boolean().optional(),
    send_email: z.boolean().default(true),
    message: z.string().max(200).optional(),
    confirmed: z.boolean().default(false).describe("False returns a non-mutating preview. True applies the status change after explicit confirmation.")
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
}, async (input) => result(await updateGuestStatus(input)));

server.registerTool("update_guest_tickets", {
  title: "Update Luma guest tickets",
  description: "Preview or add and remove tickets for one guest. Added tickets are complimentary administrative tickets and may exceed capacity. Removed tickets are invalidated without a refund. Luma still sends an in-app notification even when email is disabled.",
  inputSchema: {
    event_id: z.string().min(1),
    guest_id: z.string().min(1).describe("Guest ID, ticket key, guest key, or email."),
    ticket_ids_to_remove: z.array(z.string().min(1)).max(100).default([]),
    tickets_to_add: z.array(ticketSchema).max(100).default([]),
    send_email: z.boolean().default(true),
    confirmed: z.boolean().default(false).describe("False returns a non-mutating preview. True applies the ticket changes after explicit confirmation.")
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
}, async (input) => result(await updateGuestTickets(input)));

server.registerTool("list_ticket_types", {
  title: "List Luma ticket types",
  description: "List all ticket types for an event, optionally including hidden ticket types.",
  inputSchema: {
    event_id: z.string().min(1),
    include_hidden: z.boolean().default(false)
  },
  annotations: { readOnlyHint: true, openWorldHint: true }
}, async ({ event_id, include_hidden }) => result(await luma("/v1/events/ticket-types/list", {
  query: {
    event_id,
    ...(include_hidden ? { include_hidden: "true" } : {})
  }
})));

server.registerTool("get_ticket_type", {
  title: "Get Luma ticket type",
  description: "Get one ticket type by its ticket-type ID.",
  inputSchema: {
    event_ticket_type_id: z.string().min(1)
  },
  annotations: { readOnlyHint: true, openWorldHint: true }
}, async (input) => result(await luma("/v1/events/ticket-types/get", { query: input })));

server.registerTool("create_ticket_type", {
  title: "Create Luma ticket type",
  description: "Create a free, paid, or flexible-price ticket type after explicit confirmation. Review the event, price, currency, visibility, approval, sale dates, and capacity before confirming.",
  inputSchema: {
    event_id: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(["free", "paid"]),
    require_approval: z.boolean().optional(),
    is_hidden: z.boolean().optional(),
    description: z.string().nullable().optional(),
    valid_start_at: isoDateSchema.nullable().optional(),
    valid_end_at: isoDateSchema.nullable().optional(),
    max_capacity: z.number().int().nonnegative().nullable().optional(),
    cents: z.number().int().nonnegative().nullable().optional(),
    currency: z.string().min(3).max(20).nullable().optional(),
    is_flexible: z.boolean().optional(),
    min_cents: z.number().int().nonnegative().nullable().optional(),
    confirmed: z.boolean().describe("Must be true only after explicit user confirmation.")
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
}, async ({ confirmed, ...body }) => {
  requireConfirmation(confirmed, "creating the Luma ticket type");
  return result(await luma("/v1/events/ticket-types/create", { method: "POST", body }));
});

server.registerTool("update_ticket_type", {
  title: "Update Luma ticket type",
  description: "Update selected fields on a ticket type after explicit confirmation. Nullable fields clear their current value.",
  inputSchema: {
    event_ticket_type_id: z.string().min(1),
    ...ticketTypeMutableFields,
    confirmed: z.boolean().describe("Must be true only after explicit user confirmation.")
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
}, async ({ confirmed, event_ticket_type_id, ...changes }) => {
  requireConfirmation(confirmed, "updating the Luma ticket type");
  requireAtLeastOneChange(changes, "update_ticket_type");
  return result(await luma("/v1/events/ticket-types/update", {
    method: "POST",
    body: { event_ticket_type_id, ...changes }
  }));
});

server.registerTool("delete_ticket_type", {
  title: "Delete Luma ticket type",
  description: "Preview or delete one ticket type. The preview verifies that the ticket type belongs to the event and shows its exact settings. Luma may refuse deletion when tickets have been sold or when this is the last visible ticket type.",
  inputSchema: {
    event_id: z.string().min(1),
    event_ticket_type_id: z.string().min(1),
    confirmed: z.boolean().default(false).describe("False returns a non-mutating preview. True deletes the ticket type after explicit confirmation.")
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
}, async (input) => result(await deleteTicketType(input)));

server.registerTool("add_host", {
  title: "Add Luma event host",
  description: "Add a host or check-in staff member to an event after explicit confirmation.",
  inputSchema: {
    event_id: z.string().min(1),
    email: z.string().email(),
    name: z.string().min(1).optional(),
    access_level: hostAccessLevelSchema.default("manager"),
    is_visible: z.boolean().default(true),
    confirmed: z.boolean().describe("Must be true only after explicit user confirmation.")
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
}, async ({ confirmed, ...body }) => {
  requireConfirmation(confirmed, "adding the Luma event host");
  await luma("/v1/events/hosts/add", { method: "POST", body });
  return result({
    event_id: body.event_id,
    email: body.email,
    access_level: body.access_level,
    is_visible: body.is_visible,
    added: true
  });
});

server.registerTool("update_host", {
  title: "Update Luma event host",
  description: "Update a host's access level or public visibility after explicit confirmation. The event creator's access level cannot be changed.",
  inputSchema: {
    event_id: z.string().min(1),
    email: z.string().email(),
    access_level: hostAccessLevelSchema.optional(),
    is_visible: z.boolean().optional(),
    confirmed: z.boolean().describe("Must be true only after explicit user confirmation.")
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
}, async ({ confirmed, event_id, email, ...changes }) => {
  requireConfirmation(confirmed, "updating the Luma event host");
  requireAtLeastOneChange(changes, "update_host");
  await luma("/v1/events/hosts/update", {
    method: "POST",
    body: { event_id, email, ...changes }
  });
  return result({
    event_id,
    email,
    ...(changes.access_level === undefined ? {} : { access_level: changes.access_level }),
    ...(changes.is_visible === undefined ? {} : { is_visible: changes.is_visible }),
    updated: true
  });
});

server.registerTool("remove_host", {
  title: "Remove Luma event host",
  description: "Preview or remove one host from an event. The preview resolves the event and exact email. Visible hosts include their returned Luma identity; hidden hosts may be omitted from the event response and are clearly marked as unverified before confirmation.",
  inputSchema: {
    event_id: z.string().min(1),
    email: z.string().email(),
    confirmed: z.boolean().default(false).describe("False returns a non-mutating preview. True removes the host after explicit confirmation.")
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
}, async (input) => result(await removeHost(input)));

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

server.registerTool("delete_event", {
  title: "Cancel and delete Luma event",
  description: "Preview or permanently cancel and delete one Luma event. Call with confirmed=false first to show the exact event, approved guest count, and whether a refund choice is required. Cancellation is irreversible: Luma deletes the event and notifies all guests. Call with confirmed=true only after the user explicitly confirms the event and, for a paid event, whether guests should be refunded.",
  inputSchema: {
    event_id: z.string().min(1),
    should_refund: z.boolean().optional().describe("Whether to refund paid guests. Required when the preview reports is_paid=true."),
    confirmed: z.boolean().default(false).describe("False returns a non-destructive preview. True permanently cancels and deletes the event after explicit user confirmation.")
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
}, async (input) => {
  return result(await deleteEvent(input));
});

server.registerTool("add_guests", {
  title: "Add Luma guests",
  description: "Add guests directly to an event with tickets and an approved, pending-approval, or waitlist status. This registers guests rather than sending a soft invite. Show the event, recipient count, status, ticket assignment, and email choice before asking for confirmation.",
  inputSchema: {
    event_id: z.string().min(1),
    guests: z.array(guestToAddSchema).min(1).max(500),
    ticket: ticketSchema.optional().describe("One ticket type assigned to every guest. Cannot be combined with tickets."),
    tickets: z.array(ticketSchema).min(1).optional().describe("Multiple tickets assigned to every guest. Cannot be combined with ticket."),
    approval_status: z.enum(["approved", "pending_approval", "waitlist"]).default("approved"),
    send_email: z.boolean().default(true),
    confirmed: z.boolean().describe("Must be true only after explicit user confirmation.")
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
}, async ({ confirmed, ticket, tickets, ...body }) => {
  requireConfirmation(confirmed, "adding guests to the Luma event");
  if (ticket && tickets) {
    throw new Error("ticket and tickets cannot be used together.");
  }
  await luma("/v1/events/guests/add", {
    method: "POST",
    body: {
      ...body,
      ...(ticket === undefined ? {} : { ticket }),
      ...(tickets === undefined ? {} : { tickets })
    }
  });
  return result({
    event_id: body.event_id,
    added: body.guests.length,
    approval_status: body.approval_status,
    send_email: body.send_email
  });
});

server.registerTool("send_invites", {
  title: "Send Luma event invites",
  description: "Send soft event invitations by email and, when linked to a Luma account, SMS. Invited people choose whether to register. Show the event, recipient count, and message before asking for confirmation.",
  inputSchema: {
    event_id: z.string().min(1),
    guests: z.array(guestContactSchema).min(1).max(500),
    message: z.string().max(200).optional(),
    confirmed: z.boolean().describe("Must be true only after explicit user confirmation.")
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
}, async ({ confirmed, ...input }) => {
  requireConfirmation(confirmed, "sending Luma event invitations");
  return result(await sendInvites(input.event_id, input.guests, input.message));
});

server.registerTool("invite_guests_from_event", {
  title: "Invite guests from another Luma event",
  description: "Build a privacy-conscious audience from selected guest statuses on a source event, remove duplicate emails and anyone already on the target event, and send soft Luma invitations in batches. Call with confirmed=false first to preview aggregate counts without exposing identities; call again with confirmed=true only after explicit approval.",
  inputSchema: {
    source_event_id: z.string().min(1),
    target_event_id: z.string().min(1),
    source_statuses: z.array(approvalStatusSchema).min(1).max(6).default(["approved", "waitlist"]),
    message: z.string().max(200).optional(),
    confirmed: z.boolean().default(false).describe("False returns an aggregate preview. True rebuilds the audience and sends the invitations.")
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
}, async (input) => {
  return result(await inviteGuestsFromEvent(input, luma));
});

server.registerTool("approve_waitlisted_guests", {
  title: "Approve waitlisted Luma guests",
  description: "Approve up to " + MAX_APPROVALS_PER_RUN + " currently waitlisted guests per run, leaving rate-limit headroom. Large waitlists are safely resumable by rerunning the tool until resume_required is false. Call only after showing the event, waitlisted guest count, and email notification choice, then receiving explicit confirmation.",
  inputSchema: {
    event_id: z.string().min(1),
    max_approvals: z.number().int().min(1).max(MAX_APPROVALS_PER_RUN).default(MAX_APPROVALS_PER_RUN),
    send_email: z.boolean().default(true).describe("Whether Luma should email each guest about the approval."),
    message: z.string().max(200).optional().describe("Optional personal message included in Luma's approval email. Cannot be used when send_email is false."),
    confirmed: z.boolean().describe("Must be true only after explicit user confirmation.")
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
}, async ({ event_id, max_approvals, send_email, message, confirmed }) => {
  requireConfirmation(confirmed, "approving all waitlisted Luma guests");
  return result(await approveWaitlistedGuests(event_id, { max_approvals, send_email, message }));
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

export async function updateGuestStatus(
  input: {
    event_id: string;
    guest_id: string;
    status: WritableGuestStatus;
    should_refund?: boolean;
    send_email?: boolean;
    message?: string;
    confirmed?: boolean;
  },
  request: LumaRequest = luma
): Promise<Json> {
  const send_email = input.send_email ?? true;
  if (!send_email && input.message) {
    throw new Error("A guest status message cannot be sent when send_email is false.");
  }

  const [eventValue, guestValue] = await Promise.all([
    request("/v1/events/get", { query: { event_id: input.event_id } }),
    request("/v1/events/guests/get", {
      query: { event_id: input.event_id, id: input.guest_id }
    })
  ]);
  const event = requireRecord(eventValue, "event");
  const guest = requireRecord(guestValue, "guest");
  const currentStatus = typeof guest.approval_status === "string"
    ? guest.approval_status
    : "unknown";
  const capturedPaidTickets = recordArray(guest.event_tickets).filter((ticket) => (
    ticket.is_captured === true
    && typeof ticket.amount === "number"
    && ticket.amount > 0
  ));
  const refundChoiceRequired = (
    currentStatus === "approved"
    && input.status !== "approved"
    && capturedPaidTickets.length > 0
  );
  const preview = {
    ...eventIdentity(input.event_id, event),
    guest: guestIdentity(input.guest_id, guest),
    current_status: currentStatus,
    target_status: input.status,
    captured_paid_ticket_count: capturedPaidTickets.length,
    refund_choice_required: refundChoiceRequired,
    ...(input.should_refund === undefined ? {} : { should_refund: input.should_refund }),
    send_email,
    ...(input.message === undefined ? {} : { message: input.message })
  };

  if (!input.confirmed) {
    return {
      ...preview,
      preview_only: true,
      confirmation_required: true
    };
  }
  if (refundChoiceRequired && input.should_refund === undefined) {
    throw new Error("should_refund must be set explicitly before moving an approved paid guest to a non-approved status.");
  }

  await request("/v1/events/guests/update-status", {
    method: "POST",
    body: {
      event_id: input.event_id,
      guest_id: input.guest_id,
      status: input.status,
      ...(input.should_refund === undefined ? {} : { should_refund: input.should_refund }),
      send_email,
      ...(input.message === undefined ? {} : { message: input.message })
    }
  });

  return {
    event_id: input.event_id,
    guest_id: typeof guest.id === "string" ? guest.id : input.guest_id,
    previous_status: currentStatus,
    status: input.status,
    refund_requested: input.should_refund === true,
    send_email,
    updated: true
  };
}

export async function updateGuestTickets(
  input: {
    event_id: string;
    guest_id: string;
    ticket_ids_to_remove?: string[];
    tickets_to_add?: Array<{ event_ticket_type_id: string }>;
    send_email?: boolean;
    confirmed?: boolean;
  },
  request: LumaRequest = luma
): Promise<Json> {
  const ticketIdsToRemove = input.ticket_ids_to_remove ?? [];
  const ticketsToAdd = input.tickets_to_add ?? [];
  const send_email = input.send_email ?? true;
  if (ticketIdsToRemove.length === 0 && ticketsToAdd.length === 0) {
    throw new Error("update_guest_tickets requires at least one ticket to add or remove.");
  }
  if (new Set(ticketIdsToRemove).size !== ticketIdsToRemove.length) {
    throw new Error("ticket_ids_to_remove cannot contain duplicate ticket IDs.");
  }

  const [eventValue, guestValue, ticketTypesValue] = await Promise.all([
    request("/v1/events/get", { query: { event_id: input.event_id } }),
    request("/v1/events/guests/get", {
      query: { event_id: input.event_id, id: input.guest_id }
    }),
    request("/v1/events/ticket-types/list", {
      query: { event_id: input.event_id, include_hidden: "true" }
    })
  ]);
  const event = requireRecord(eventValue, "event");
  const guest = requireRecord(guestValue, "guest");
  const existingTickets = recordArray(guest.event_tickets);
  const ticketTypes = recordArray(requireRecord(ticketTypesValue, "ticket type list").entries);
  const existingById = new Map(
    existingTickets
      .filter((ticket) => typeof ticket.id === "string")
      .map((ticket) => [ticket.id as string, ticket])
  );
  const ticketTypesById = new Map(
    ticketTypes
      .filter((ticketType) => typeof ticketType.id === "string")
      .map((ticketType) => [ticketType.id as string, ticketType])
  );

  for (const ticketId of ticketIdsToRemove) {
    if (!existingById.has(ticketId)) {
      throw new Error(`Ticket ${ticketId} does not belong to the selected guest.`);
    }
  }
  for (const ticket of ticketsToAdd) {
    if (!ticketTypesById.has(ticket.event_ticket_type_id)) {
      throw new Error(`Ticket type ${ticket.event_ticket_type_id} does not belong to the selected event.`);
    }
  }

  const projectedTicketCount = existingTickets.length - ticketIdsToRemove.length + ticketsToAdd.length;
  if (projectedTicketCount < 1) {
    throw new Error("At least one valid ticket must remain on the guest.");
  }
  const preview = {
    ...eventIdentity(input.event_id, event),
    guest: guestIdentity(input.guest_id, guest),
    current_ticket_count: existingTickets.length,
    projected_ticket_count: projectedTicketCount,
    tickets_to_remove: ticketIdsToRemove.map((ticketId) => ticketIdentity(existingById.get(ticketId) as LumaRecord)),
    ticket_types_to_add: ticketsToAdd.map((ticket) => ticketTypeIdentity(
      ticketTypesById.get(ticket.event_ticket_type_id) as LumaRecord
    )),
    send_email,
    warnings: [
      "Added tickets are complimentary administrative tickets even when the ticket type is normally paid.",
      "Removed tickets are invalidated without a refund.",
      "Luma still sends an in-app notification when email is disabled.",
      "Administrative ticket additions can exceed event or ticket-type capacity."
    ]
  };

  if (!input.confirmed) {
    return {
      ...preview,
      preview_only: true,
      confirmation_required: true
    };
  }

  await request("/v1/events/guests/update-tickets", {
    method: "POST",
    body: {
      event_id: input.event_id,
      guest_id: input.guest_id,
      ticket_ids_to_remove: ticketIdsToRemove,
      tickets_to_add: ticketsToAdd,
      send_email
    }
  });

  return {
    event_id: input.event_id,
    guest_id: typeof guest.id === "string" ? guest.id : input.guest_id,
    ticket_ids_removed: ticketIdsToRemove,
    ticket_type_ids_added: ticketsToAdd.map((ticket) => ticket.event_ticket_type_id),
    send_email,
    updated: true
  };
}

export async function deleteTicketType(
  input: { event_id: string; event_ticket_type_id: string; confirmed?: boolean },
  request: LumaRequest = luma
): Promise<Json> {
  const [eventValue, ticketTypesValue] = await Promise.all([
    request("/v1/events/get", { query: { event_id: input.event_id } }),
    request("/v1/events/ticket-types/list", {
      query: { event_id: input.event_id, include_hidden: "true" }
    })
  ]);
  const event = requireRecord(eventValue, "event");
  const ticketTypes = recordArray(requireRecord(ticketTypesValue, "ticket type list").entries);
  const ticketType = ticketTypes.find((entry) => entry.id === input.event_ticket_type_id);
  if (!ticketType) {
    throw new Error(`Ticket type ${input.event_ticket_type_id} does not belong to event ${input.event_id}.`);
  }

  const preview = {
    ...eventIdentity(input.event_id, event),
    ticket_type: ticketTypeIdentity(ticketType),
    deletion_constraints: [
      "Luma refuses deletion when tickets have been sold for this ticket type.",
      "Luma refuses deletion when this is the event's last visible ticket type."
    ]
  };
  if (!input.confirmed) {
    return {
      ...preview,
      preview_only: true,
      confirmation_required: true
    };
  }

  await request("/v1/events/ticket-types/delete", {
    method: "POST",
    body: { event_ticket_type_id: input.event_ticket_type_id }
  });
  return {
    event_id: input.event_id,
    event_ticket_type_id: input.event_ticket_type_id,
    ...(typeof ticketType.name === "string" ? { name: ticketType.name } : {}),
    deleted: true
  };
}

export async function removeHost(
  input: { event_id: string; email: string; confirmed?: boolean },
  request: LumaRequest = luma
): Promise<Json> {
  const event = requireRecord(await request("/v1/events/get", {
    query: { event_id: input.event_id }
  }), "event");
  const normalizedEmail = input.email.trim().toLowerCase();
  const host = recordArray(event.hosts).find((entry) => (
    typeof entry.email === "string"
    && entry.email.trim().toLowerCase() === normalizedEmail
  ));

  const preview = {
    ...eventIdentity(input.event_id, event),
    host: host ? hostIdentity(host) : { email: input.email },
    host_found_in_event_response: Boolean(host),
    ...(host ? {} : {
      visibility_warning: "Luma omits hidden hosts from the event response, so this email cannot be independently verified before removal."
    }),
    reversible_by_readding: true
  };
  if (!input.confirmed) {
    return {
      ...preview,
      preview_only: true,
      confirmation_required: true
    };
  }

  await request("/v1/events/hosts/remove", {
    method: "POST",
    body: { event_id: input.event_id, email: input.email }
  });
  return {
    event_id: input.event_id,
    email: host && typeof host.email === "string" ? host.email : input.email,
    removed: true
  };
}

export async function deleteEvent(
  input: { event_id: string; should_refund?: boolean; confirmed?: boolean },
  request: LumaRequest = luma
): Promise<Json> {
  const event = await request("/v1/events/get", {
    query: { event_id: input.event_id }
  }) as Record<string, unknown>;
  const cancellation = await request("/v1/events/cancel/request", {
    method: "POST",
    body: { event_id: input.event_id }
  }) as Record<string, unknown>;

  const cancellationToken = cancellation.cancellation_token;
  if (typeof cancellationToken !== "string" || !cancellationToken) {
    throw new Error("Luma did not return a cancellation token; the event was not deleted.");
  }
  if (typeof cancellation.is_paid !== "boolean" || typeof cancellation.guest_count !== "number") {
    throw new Error("Luma returned an invalid cancellation preview; the event was not deleted.");
  }

  const preview = {
    event_id: input.event_id,
    ...(typeof event.name === "string" ? { name: event.name } : {}),
    ...(typeof event.start_at === "string" ? { start_at: event.start_at } : {}),
    guest_count: cancellation.guest_count,
    is_paid: cancellation.is_paid,
    refund_choice_required: cancellation.is_paid,
    guests_will_be_notified: true,
    irreversible: true
  };

  if (!input.confirmed) {
    return {
      ...preview,
      preview_only: true,
      confirmation_required: true
    };
  }

  if (cancellation.is_paid && input.should_refund === undefined) {
    throw new Error("should_refund must be set explicitly before deleting a paid event.");
  }

  await request("/v1/events/cancel", {
    method: "POST",
    body: {
      event_id: input.event_id,
      cancellation_token: cancellationToken,
      ...(cancellation.is_paid ? { should_refund: input.should_refund } : {})
    }
  });

  return {
    ...preview,
    preview_only: false,
    deleted: true,
    refunds_requested: cancellation.is_paid ? input.should_refund === true : false
  };
}

export async function approveWaitlistedGuests(
  event_id: string,
  options: { max_approvals?: number; send_email?: boolean; message?: string } = {},
  request: LumaRequest = luma
): Promise<Json> {
  const send_email = options.send_email ?? true;
  const max_approvals = options.max_approvals ?? MAX_APPROVALS_PER_RUN;
  if (!Number.isInteger(max_approvals) || max_approvals < 1 || max_approvals > MAX_APPROVALS_PER_RUN) {
    throw new Error("max_approvals must be an integer from 1 to " + MAX_APPROVALS_PER_RUN + ".");
  }
  if (!send_email && options.message) {
    throw new Error("An approval message cannot be sent when send_email is false.");
  }

  const guests = await listAllGuests(event_id, request, "waitlist");
  const guestIds = guests.map((guest) => {
    if (typeof guest.id !== "string" || !guest.id) {
      throw new Error("Luma returned a waitlisted guest without an id; no guests were approved.");
    }
    return guest.id;
  });
  const uniqueGuestIds = [...new Set(guestIds)];
  const guestIdsThisRun = uniqueGuestIds.slice(0, max_approvals);

  let approved = 0;
  const failures: Array<{ guest_id: string; error: string }> = [];
  for (const guest_id of guestIdsThisRun) {
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
    attempted: guestIdsThisRun.length,
    approved,
    failed: failures.length,
    remaining_waitlisted: uniqueGuestIds.length - approved,
    resume_required: uniqueGuestIds.length - approved > 0,
    ...(failures.length === 0 ? {} : { failures })
  };
}

async function listAllGuests(
  event_id: string,
  request: LumaRequest,
  approval_status?: ApprovalStatus
): Promise<GuestRecord[]> {
  const guests: GuestRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await request("/v1/events/guests/list", {
      query: {
        event_id,
        ...(approval_status === undefined ? {} : { approval_status }),
        pagination_limit: 100,
        pagination_cursor: cursor
      }
    }) as {
      entries?: GuestRecord[];
      has_more?: boolean;
      next_cursor?: string;
    };
    guests.push(...(page.entries ?? []));
    cursor = page.has_more ? page.next_cursor : undefined;
    if (page.has_more && !cursor) {
      throw new Error("Luma returned has_more=true without a next_cursor.");
    }
  } while (cursor);
  return guests;
}

export async function sendInvites(
  event_id: string,
  guests: GuestContact[],
  message?: string,
  request: LumaRequest = luma
): Promise<Json> {
  const failures: Array<{ batch: number; guest_count: number; error: string }> = [];
  let invited = 0;
  const batches = chunk(guests, INVITE_BATCH_SIZE);
  for (const [index, batch] of batches.entries()) {
    try {
      await request("/v1/events/guests/send-invites", {
        method: "POST",
        body: {
          event_id,
          guests: batch,
          ...(message === undefined ? {} : { message })
        }
      });
      invited += batch.length;
    } catch (error) {
      failures.push({
        batch: index + 1,
        guest_count: batch.length,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return {
    event_id,
    requested: guests.length,
    invited,
    failed: guests.length - invited,
    batches: batches.length,
    complete: failures.length === 0,
    ...(failures.length === 0 ? {} : { failures })
  };
}

export async function inviteGuestsFromEvent(
  input: {
    source_event_id: string;
    target_event_id: string;
    source_statuses?: ApprovalStatus[];
    message?: string;
    confirmed?: boolean;
  },
  request: LumaRequest = luma
): Promise<Json> {
  if (input.source_event_id === input.target_event_id) {
    throw new Error("source_event_id and target_event_id must be different.");
  }
  const source_statuses: ApprovalStatus[] = [...new Set<ApprovalStatus>(input.source_statuses ?? ["approved", "waitlist"])];
  const sourceGuests = (await Promise.all(
    source_statuses.map((status) => listAllGuests(input.source_event_id, request, status))
  )).flat();
  const targetGuests = await listAllGuests(input.target_event_id, request);

  const targetEmails = new Set(
    targetGuests
      .map(guestEmail)
      .filter((email): email is string => email !== undefined)
  );
  const sourceByEmail = new Map<string, GuestContact>();
  let invalid_or_missing_email = 0;
  let duplicate_source_email = 0;
  for (const guest of sourceGuests) {
    const email = guestEmail(guest);
    if (!email) {
      invalid_or_missing_email += 1;
      continue;
    }
    if (sourceByEmail.has(email)) {
      duplicate_source_email += 1;
      continue;
    }
    const name = typeof guest.user_name === "string" && guest.user_name.trim()
      ? guest.user_name.trim()
      : undefined;
    sourceByEmail.set(email, { email, ...(name === undefined ? {} : { name }) });
  }

  const eligible = [...sourceByEmail.values()].filter((guest) => !targetEmails.has(guest.email));
  const already_in_target = sourceByEmail.size - eligible.length;
  const preview = {
    source_event_id: input.source_event_id,
    target_event_id: input.target_event_id,
    source_statuses,
    source_guests_found: sourceGuests.length,
    source_unique_emails: sourceByEmail.size,
    excluded_invalid_or_missing_email: invalid_or_missing_email,
    excluded_duplicate_source_email: duplicate_source_email,
    excluded_already_in_target: already_in_target,
    eligible_to_invite: eligible.length,
    batches_required: Math.ceil(eligible.length / INVITE_BATCH_SIZE)
  };

  if (!input.confirmed) {
    return {
      ...preview,
      preview_only: true,
      confirmation_required: eligible.length > 0
    };
  }

  const sent = await sendInvites(input.target_event_id, eligible, input.message, request) as Record<string, Json>;
  return {
    ...preview,
    preview_only: false,
    ...sent
  };
}

function requireAtLeastOneChange(changes: Record<string, unknown>, toolName: string): void {
  if (!Object.values(changes).some((value) => value !== undefined)) {
    throw new Error(`${toolName} requires at least one field to change.`);
  }
}

function requireRecord(value: unknown, label: string): LumaRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Luma returned an invalid ${label} response.`);
  }
  return value as LumaRecord;
}

function recordArray(value: unknown): LumaRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is LumaRecord => (
    Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
  ));
}

function pickPrimitiveFields(record: LumaRecord, fields: string[]): { [key: string]: Json } {
  const selected: { [key: string]: Json } = {};
  for (const field of fields) {
    const value = record[field];
    if (
      value === null
      || typeof value === "string"
      || typeof value === "number"
      || typeof value === "boolean"
    ) {
      selected[field] = value;
    }
  }
  return selected;
}

function eventIdentity(event_id: string, event: LumaRecord): { [key: string]: Json } {
  return {
    event_id,
    ...pickPrimitiveFields(event, ["name", "start_at"])
  };
}

function guestIdentity(inputId: string, guest: LumaRecord): { [key: string]: Json } {
  return {
    id: typeof guest.id === "string" ? guest.id : inputId,
    ...pickPrimitiveFields(guest, ["user_name", "user_email", "approval_status"])
  };
}

function ticketIdentity(ticket: LumaRecord): { [key: string]: Json } {
  return pickPrimitiveFields(ticket, [
    "id",
    "name",
    "event_ticket_type_id",
    "amount",
    "currency",
    "is_captured"
  ]);
}

function ticketTypeIdentity(ticketType: LumaRecord): { [key: string]: Json } {
  return pickPrimitiveFields(ticketType, [
    "id",
    "name",
    "type",
    "require_approval",
    "is_hidden",
    "description",
    "valid_start_at",
    "valid_end_at",
    "max_capacity",
    "cents",
    "currency",
    "is_flexible",
    "min_cents"
  ]);
}

function hostIdentity(host: LumaRecord): { [key: string]: Json } {
  return pickPrimitiveFields(host, [
    "id",
    "email",
    "name",
    "first_name",
    "last_name"
  ]);
}

function guestEmail(guest: GuestRecord): string | undefined {
  if (typeof guest.user_email !== "string") return undefined;
  const email = guest.user_email.trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
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

export function isMainModule(entryPath = process.argv[1], moduleUrl = import.meta.url): boolean {
  if (!entryPath) return false;
  try {
    return realpathSync(entryPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const transport = new StdioServerTransport();
  await createServer().connect(transport);
}
