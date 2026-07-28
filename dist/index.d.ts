import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
type Json = null | boolean | number | string | Json[] | {
    [key: string]: Json;
};
type GuestContact = {
    email: string;
    name?: string;
};
type ApprovalStatus = "approved" | "session" | "pending_approval" | "invited" | "declined" | "waitlist";
type WritableGuestStatus = "approved" | "declined" | "pending_approval" | "waitlist";
export declare function luma(path: string, options?: {
    method?: "GET" | "POST";
    query?: Record<string, unknown>;
    body?: unknown;
}): Promise<Json>;
export declare function requireConfirmation(confirmed: boolean, action: string): void;
export declare function createServer(): McpServer;
export type LumaRequest = (path: string, options?: {
    method?: "GET" | "POST";
    query?: Record<string, unknown>;
    body?: unknown;
}) => Promise<unknown>;
export declare function updateGuestStatus(input: {
    event_id: string;
    guest_id: string;
    status: WritableGuestStatus;
    should_refund?: boolean;
    send_email?: boolean;
    message?: string;
    confirmed?: boolean;
}, request?: LumaRequest): Promise<Json>;
export declare function updateGuestTickets(input: {
    event_id: string;
    guest_id: string;
    ticket_ids_to_remove?: string[];
    tickets_to_add?: Array<{
        event_ticket_type_id: string;
    }>;
    send_email?: boolean;
    confirmed?: boolean;
}, request?: LumaRequest): Promise<Json>;
export declare function deleteTicketType(input: {
    event_id: string;
    event_ticket_type_id: string;
    confirmed?: boolean;
}, request?: LumaRequest): Promise<Json>;
export declare function removeHost(input: {
    event_id: string;
    email: string;
    confirmed?: boolean;
}, request?: LumaRequest): Promise<Json>;
export declare function deleteEvent(input: {
    event_id: string;
    should_refund?: boolean;
    confirmed?: boolean;
}, request?: LumaRequest): Promise<Json>;
export declare function approveWaitlistedGuests(event_id: string, options?: {
    max_approvals?: number;
    send_email?: boolean;
    message?: string;
}, request?: LumaRequest): Promise<Json>;
export declare function sendInvites(event_id: string, guests: GuestContact[], message?: string, request?: LumaRequest): Promise<Json>;
export declare function inviteGuestsFromEvent(input: {
    source_event_id: string;
    target_event_id: string;
    source_statuses?: ApprovalStatus[];
    message?: string;
    confirmed?: boolean;
}, request?: LumaRequest): Promise<Json>;
export declare function summarizeRegistrations(event_id: string, request?: LumaRequest): Promise<Json>;
export {};
