import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
type Json = null | boolean | number | string | Json[] | {
    [key: string]: Json;
};
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
export declare function summarizeRegistrations(event_id: string, request?: LumaRequest): Promise<Json>;
export {};
