import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
type Json = null | boolean | number | string | Json[] | {
    [key: string]: Json;
};
type GuestContact = {
    email: string;
    name?: string;
};
type ApprovalStatus = "approved" | "session" | "pending_approval" | "invited" | "declined" | "waitlist";
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
