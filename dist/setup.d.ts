import type { Readable, Writable } from "node:stream";
export type ClientId = "codex" | "cursor" | "claude" | "gemini" | "grok";
export type DetectedClient = {
    id: ClientId;
    label: string;
    executable?: string;
    detection: string;
};
export type CommandResult = {
    code: number | null;
    stdout: string;
    stderr: string;
};
export type InstallResult = {
    client: ClientId;
    status: "installed" | "already_configured" | "failed";
    detail: string;
};
type InteractiveInput = Readable & {
    isTTY?: boolean;
    isRaw?: boolean;
    setRawMode?: (enabled: boolean) => void;
};
type InteractiveOutput = Writable & {
    isTTY?: boolean;
};
type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;
export declare function credentialsPath(env?: NodeJS.ProcessEnv, home?: string, platform?: NodeJS.Platform): string;
export declare function readStoredApiKey(env?: NodeJS.ProcessEnv, home?: string, platform?: NodeJS.Platform): string | undefined;
export declare function storeApiKey(apiKey: string, path?: string): Promise<void>;
export declare function cursorConfigPath(env?: NodeJS.ProcessEnv, home?: string): string;
export declare function detectClients(env?: NodeJS.ProcessEnv, home?: string, platform?: NodeJS.Platform): Promise<DetectedClient[]>;
export declare function parseClientSelection(value: string, detected: DetectedClient[]): DetectedClient[];
export declare function verifyLumaApiKey(apiKey: string, apiBase?: string, fetcher?: typeof fetch): Promise<void>;
export declare function runCommand(command: string, args: string[], timeoutMs?: number): Promise<CommandResult>;
export declare function installClient(client: DetectedClient, runner?: CommandRunner, cursorPath?: string): Promise<InstallResult>;
export declare class InteractivePrompter {
    private readonly input;
    private readonly output;
    private readonly lineReader?;
    private readonly lineIterator?;
    constructor(input?: InteractiveInput, output?: InteractiveOutput);
    ask(question: string, secret?: boolean): Promise<string>;
    close(): void;
    private askSecret;
}
export type SetupDependencies = {
    detect?: () => Promise<DetectedClient[]>;
    verify?: (apiKey: string) => Promise<void>;
    store?: (apiKey: string, path: string) => Promise<void>;
    install?: (client: DetectedClient) => Promise<InstallResult>;
    prompter?: Pick<InteractivePrompter, "ask" | "close">;
    output?: InteractiveOutput;
    credentialsFile?: string;
};
export declare function setupBanner(color?: boolean): string;
export declare function runInteractiveSetup(args?: string[], dependencies?: SetupDependencies): Promise<number>;
export declare function setupHelp(): string;
export {};
