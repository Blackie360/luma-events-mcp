import { spawn } from "node:child_process";
import { constants, readFileSync } from "node:fs";
import { access, chmod, copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { createInterface, emitKeypressEvents, type Interface } from "node:readline";
import type { Readable, Writable } from "node:stream";

const SERVER_NAME = "luma-events";
const PACKAGE_SPEC = "luma-events@latest";
const SERVER_COMMAND = ["-y", "--package", PACKAGE_SPEC, "luma-events"];
const DEFAULT_API_BASE = "https://public-api.luma.com";

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

const SETUP_LOGO = [
  " _     _   _ __  __    _",
  "| |   | | | |  \\/  |  / \\",
  "| |   | | | | |\\/| | / _ \\",
  "| |___| |_| | |  | |/ ___ \\",
  "|_____|\\___/|_|  |_/_/   \\_\\"
].join("\n");

const CLIENT_SPECS: ReadonlyArray<{
  id: ClientId;
  label: string;
  executables: string[];
}> = [
  { id: "codex", label: "OpenAI Codex", executables: ["codex"] },
  { id: "cursor", label: "Cursor", executables: ["cursor-agent", "cursor"] },
  { id: "claude", label: "Claude Code", executables: ["claude"] },
  { id: "gemini", label: "Gemini CLI", executables: ["gemini"] },
  { id: "grok", label: "Grok CLI", executables: ["grok"] }
];

export function credentialsPath(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
  platform = process.platform
): string {
  if (env.LUMA_API_KEY_FILE?.trim()) return env.LUMA_API_KEY_FILE.trim();
  if (env.LUMA_EVENTS_CONFIG_DIR?.trim()) {
    return join(env.LUMA_EVENTS_CONFIG_DIR.trim(), "credentials.json");
  }
  const base = platform === "win32"
    ? env.APPDATA?.trim() || join(home, "AppData", "Roaming")
    : env.XDG_CONFIG_HOME?.trim() || join(home, ".config");
  return join(base, "luma-events-mcp", "credentials.json");
}

export function readStoredApiKey(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
  platform = process.platform
): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(credentialsPath(env, home, platform), "utf8")) as {
      apiKey?: unknown;
    };
    return typeof parsed.apiKey === "string" && parsed.apiKey.trim()
      ? parsed.apiKey.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

export async function storeApiKey(
  apiKey: string,
  path = credentialsPath()
): Promise<void> {
  const directory = dirname(path);
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await chmod(directory, 0o700);
  await writeFile(temporary, `${JSON.stringify({ apiKey }, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  if (process.platform !== "win32") await chmod(temporary, 0o600);
  await rename(temporary, path);
  if (process.platform !== "win32") await chmod(path, 0o600);
}

async function executablePath(
  names: string[],
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform
): Promise<string | undefined> {
  const directories = (env.PATH ?? "").split(delimiter).filter(Boolean);
  const extensions = platform === "win32"
    ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];

  for (const directory of directories) {
    for (const name of names) {
      for (const extension of extensions) {
        const candidate = join(directory, platform === "win32" ? `${name}${extension}` : name);
        try {
          await access(candidate, platform === "win32" ? constants.F_OK : constants.X_OK);
          return candidate;
        } catch {
          // Continue searching the PATH.
        }
      }
    }
  }
  return undefined;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function cursorConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir()
): string {
  return env.CURSOR_MCP_CONFIG?.trim() || join(home, ".cursor", "mcp.json");
}

export async function detectClients(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
  platform = process.platform
): Promise<DetectedClient[]> {
  const detected: DetectedClient[] = [];
  for (const spec of CLIENT_SPECS) {
    const executable = await executablePath(spec.executables, env, platform);
    if (executable) {
      detected.push({
        id: spec.id,
        label: spec.label,
        executable,
        detection: `command: ${executable}`
      });
      continue;
    }
    if (spec.id === "cursor" && await pathExists(dirname(cursorConfigPath(env, home)))) {
      detected.push({
        id: spec.id,
        label: spec.label,
        detection: `configuration: ${cursorConfigPath(env, home)}`
      });
    }
  }
  return detected;
}

export function parseClientSelection(
  value: string,
  detected: DetectedClient[]
): DetectedClient[] {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "all") return [...detected];

  const selected = new Map<ClientId, DetectedClient>();
  for (const token of normalized.split(",").map((item) => item.trim()).filter(Boolean)) {
    const numeric = Number(token);
    const match = Number.isInteger(numeric) && numeric >= 1
      ? detected[numeric - 1]
      : detected.find((client) => client.id === token);
    if (!match) {
      throw new Error(`Unknown selection "${token}". Enter numbers, client names, or "all".`);
    }
    selected.set(match.id, match);
  }
  if (selected.size === 0) throw new Error("Select at least one client.");
  return [...selected.values()];
}

export async function verifyLumaApiKey(
  apiKey: string,
  apiBase = process.env.LUMA_API_BASE?.trim() || DEFAULT_API_BASE,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const response = await fetcher(new URL("/v1/users/get-self", apiBase), {
    headers: { "x-luma-api-key": apiKey },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) {
    throw new Error(`Luma rejected the API key with HTTP ${response.status}.`);
  }
}

export async function runCommand(
  command: string,
  args: string[],
  timeoutMs = 45_000
): Promise<CommandResult> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish({
        code: null,
        stdout,
        stderr: `${stderr}\nTimed out after ${timeoutMs}ms.`.trim()
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      if (stdout.length < 64_000) stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 64_000) stderr += chunk.toString();
    });
    child.once("error", (error) => {
      finish({ code: null, stdout, stderr: error.message });
    });
    child.once("close", (code) => {
      finish({ code, stdout, stderr });
    });
  });
}

function commandForClient(client: DetectedClient): { command: string; args: string[] } {
  if (!client.executable) {
    throw new Error(`${client.label} was detected without a CLI executable.`);
  }
  switch (client.id) {
    case "codex":
      return {
        command: client.executable,
        args: ["mcp", "add", SERVER_NAME, "--", "npx", ...SERVER_COMMAND]
      };
    case "claude":
      return {
        command: client.executable,
        args: ["mcp", "add", "--scope", "user", SERVER_NAME, "--", "npx", ...SERVER_COMMAND]
      };
    case "gemini":
      return {
        command: client.executable,
        args: ["mcp", "add", "--scope", "user", SERVER_NAME, "npx", ...SERVER_COMMAND]
      };
    case "grok":
      return {
        command: client.executable,
        args: ["mcp", "add", SERVER_NAME, "--", "npx", ...SERVER_COMMAND]
      };
    case "cursor":
      throw new Error("Cursor is configured through mcp.json.");
  }
}

function conciseCommandError(result: CommandResult): string {
  const combined = `${result.stderr}\n${result.stdout}`.trim();
  const lastLine = combined.split(/\r?\n/).filter(Boolean).at(-1);
  return lastLine || `command exited with code ${String(result.code)}`;
}

async function installCursor(
  path = cursorConfigPath()
): Promise<InstallResult> {
  let existing: Record<string, unknown> = {};
  let backup: string | undefined;
  if (await pathExists(path)) {
    const raw = await readFile(path, "utf8");
    try {
      existing = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {
        client: "cursor",
        status: "failed",
        detail: `Refused to overwrite invalid JSON at ${path}.`
      };
    }
    backup = `${path}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    await copyFile(path, backup);
  }

  const currentServers = existing.mcpServers;
  const mcpServers = currentServers && typeof currentServers === "object" && !Array.isArray(currentServers)
    ? { ...currentServers as Record<string, unknown> }
    : {};
  const alreadyConfigured = Object.hasOwn(mcpServers, SERVER_NAME);
  mcpServers[SERVER_NAME] = {
    type: "stdio",
    command: "npx",
    args: SERVER_COMMAND
  };

  const directory = dirname(path);
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(directory, { recursive: true });
  await writeFile(temporary, `${JSON.stringify({ ...existing, mcpServers }, null, 2)}\n`, "utf8");
  await rename(temporary, path);

  return {
    client: "cursor",
    status: alreadyConfigured ? "already_configured" : "installed",
    detail: backup
      ? `Configured ${path}; backup saved to ${backup}.`
      : `Configured ${path}.`
  };
}

export async function installClient(
  client: DetectedClient,
  runner: CommandRunner = runCommand,
  cursorPath = cursorConfigPath()
): Promise<InstallResult> {
  if (client.id === "cursor") return await installCursor(cursorPath);

  const invocation = commandForClient(client);
  const result = await runner(invocation.command, invocation.args);
  if (result.code === 0) {
    return {
      client: client.id,
      status: "installed",
      detail: `${client.label} accepted the MCP configuration.`
    };
  }

  if (/already (exists|configured)|duplicate|already added/i.test(`${result.stdout}\n${result.stderr}`)) {
    return {
      client: client.id,
      status: "already_configured",
      detail: `${client.label} already has a "${SERVER_NAME}" server.`
    };
  }

  return {
    client: client.id,
    status: "failed",
    detail: conciseCommandError(result)
  };
}

export class InteractivePrompter {
  private readonly input: InteractiveInput;
  private readonly output: InteractiveOutput;
  private readonly lineReader?: Interface;
  private readonly lineIterator?: AsyncIterator<string>;

  constructor(input: InteractiveInput = process.stdin, output: InteractiveOutput = process.stdout) {
    this.input = input;
    this.output = output;
    if (!input.isTTY) {
      this.lineReader = createInterface({ input, crlfDelay: Infinity });
      this.lineIterator = this.lineReader[Symbol.asyncIterator]();
    }
  }

  async ask(question: string, secret = false): Promise<string> {
    if (this.lineIterator) {
      this.output.write(question);
      const next = await this.lineIterator.next();
      if (next.done) throw new Error("Input ended before setup was complete.");
      if (secret) this.output.write("\n");
      return next.value.trim();
    }
    if (secret && this.input.setRawMode) return await this.askSecret(question);

    return await new Promise<string>((resolve) => {
      const reader = createInterface({ input: this.input, output: this.output, terminal: true });
      reader.question(question, (answer) => {
        reader.close();
        resolve(answer.trim());
      });
    });
  }

  async selectClients(detected: DetectedClient[]): Promise<DetectedClient[]> {
    if (!this.input.isTTY || !this.input.setRawMode || !this.output.isTTY) {
      while (true) {
        const answer = await this.ask("Choose clients by number or name, separated by commas [all]\n> ");
        try {
          return parseClientSelection(answer, detected);
        } catch (error) {
          this.output.write(`${error instanceof Error ? error.message : String(error)}\n`);
        }
      }
    }

    const color = process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";
    const selected = new Set(detected.map((client) => client.id));
    const wasRaw = Boolean(this.input.isRaw);
    let focused = 0;
    let validationMessage = "";
    let firstRender = true;

    const style = (code: string, value: string) => color
      ? `\u001b[${code}m${value}\u001b[0m`
      : value;
    const lines = () => [
      `${style("1", "Choose AI clients")} ${style("2", "(all selected by default)")}`,
      style("2", "Use ↑/↓ to move, space to toggle, a to toggle all, enter to continue."),
      "",
      ...detected.flatMap((client, index) => {
        const active = index === focused;
        const marker = selected.has(client.id) ? "[x]" : "[ ]";
        const pointer = active ? ">" : " ";
        const label = active ? style("1;35", client.label) : client.label;
        return [
          `${pointer} ${style(selected.has(client.id) ? "35" : "2", marker)} ${label}`,
          `      ${style("2", client.detection)}`
        ];
      }),
      "",
      validationMessage
        ? style("31", validationMessage)
        : style("2", `Selected ${selected.size} of ${detected.length}`)
    ];

    const render = () => {
      const rendered = lines();
      if (!firstRender) this.output.write(`\u001b[${rendered.length}F\u001b[J`);
      this.output.write(`${rendered.join("\n")}\n`);
      firstRender = false;
    };

    emitKeypressEvents(this.input);
    this.input.setRawMode(true);
    this.input.resume();
    render();

    return await new Promise<DetectedClient[]>((resolve, reject) => {
      const cleanup = () => {
        this.input.off("keypress", onKeypress);
        this.input.setRawMode?.(wasRaw);
        this.input.pause();
      };
      const onKeypress = (sequence: string, key: { ctrl?: boolean; name?: string }) => {
        validationMessage = "";
        if (key.ctrl && key.name === "c") {
          cleanup();
          this.output.write("\n");
          reject(new Error("Setup cancelled."));
          return;
        }
        if (key.name === "up") {
          focused = (focused - 1 + detected.length) % detected.length;
        } else if (key.name === "down") {
          focused = (focused + 1) % detected.length;
        } else if (key.name === "space" || sequence === " ") {
          const id = detected[focused].id;
          if (selected.has(id)) selected.delete(id);
          else selected.add(id);
        } else if (sequence.toLowerCase() === "a") {
          if (selected.size === detected.length) selected.clear();
          else detected.forEach((client) => selected.add(client.id));
        } else if (key.name === "return" || key.name === "enter") {
          if (selected.size === 0) {
            validationMessage = "Select at least one client before continuing.";
          } else {
            cleanup();
            this.output.write("\n");
            resolve(detected.filter((client) => selected.has(client.id)));
            return;
          }
        } else {
          return;
        }
        render();
      };
      this.input.on("keypress", onKeypress);
    });
  }

  close(): void {
    this.lineReader?.close();
  }

  private async askSecret(question: string): Promise<string> {
    this.output.write(question);
    const wasRaw = Boolean(this.input.isRaw);
    this.input.setRawMode?.(true);
    this.input.resume();

    return await new Promise<string>((resolve, reject) => {
      let value = "";
      const cleanup = () => {
        this.input.off("data", onData);
        this.input.setRawMode?.(wasRaw);
        this.input.pause();
      };
      const onData = (chunk: Buffer | string) => {
        for (const character of chunk.toString()) {
          if (character === "\u0003") {
            cleanup();
            this.output.write("\n");
            reject(new Error("Setup cancelled."));
            return;
          }
          if (character === "\r" || character === "\n") {
            cleanup();
            this.output.write("\n");
            resolve(value.trim());
            return;
          }
          if (character === "\u007f" || character === "\b") {
            if (value) {
              value = value.slice(0, -1);
              this.output.write("\b \b");
            }
            continue;
          }
          if (character >= " " && value.length < 512) {
            value += character;
            this.output.write("*");
          }
        }
      };
      this.input.on("data", onData);
    });
  }
}

export type SetupDependencies = {
  detect?: () => Promise<DetectedClient[]>;
  verify?: (apiKey: string) => Promise<void>;
  store?: (apiKey: string, path: string) => Promise<void>;
  install?: (client: DetectedClient) => Promise<InstallResult>;
  prompter?: Pick<InteractivePrompter, "ask" | "close"> &
    Partial<Pick<InteractivePrompter, "selectClients">>;
  output?: InteractiveOutput;
  credentialsFile?: string;
};

type SetupStyle = {
  accent: (value: string) => string;
  bold: (value: string) => string;
  dim: (value: string) => string;
  error: (value: string) => string;
  success: (value: string) => string;
};

function setupStyle(
  output: InteractiveOutput,
  env: NodeJS.ProcessEnv = process.env
): SetupStyle {
  const enabled = Boolean(output.isTTY) && env.NO_COLOR === undefined && env.TERM !== "dumb";
  const paint = (code: number) => (value: string) => enabled
    ? `\u001b[${code}m${value}\u001b[0m`
    : value;
  return {
    accent: paint(35),
    bold: paint(1),
    dim: paint(2),
    error: paint(31),
    success: paint(32)
  };
}

export function setupBanner(color = false): string {
  const accent = color ? (value: string) => `\u001b[35m${value}\u001b[0m` : (value: string) => value;
  const bold = color ? (value: string) => `\u001b[1m${value}\u001b[0m` : (value: string) => value;
  return [
    "",
    accent(SETUP_LOGO),
    bold("          EVENTS MCP"),
    "  Safe setup for your AI clients",
    "",
    ""
  ].join("\n");
}

export async function runInteractiveSetup(
  args: string[] = [],
  dependencies: SetupDependencies = {}
): Promise<number> {
  const output = dependencies.output ?? process.stdout;
  const prompter = dependencies.prompter ?? new InteractivePrompter(process.stdin, output);
  const style = setupStyle(output);
  const dryRun = args.includes("--dry-run");
  const unknownOptions = args.filter((argument) => argument !== "--dry-run");

  try {
    if (unknownOptions.length) {
      output.write(`Unknown setup option: ${unknownOptions.join(", ")}\n`);
      return 1;
    }
    output.write(setupBanner(Boolean(output.isTTY) && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb"));
    output.write(`${style.accent("[1/3]")} ${style.bold("Detect AI clients")}\n\n`);
    const detected = await (dependencies.detect ?? (() => detectClients()))();
    if (detected.length === 0) {
      output.write("No supported AI clients were detected on PATH or in known configuration locations.\n");
      output.write("Supported adapters: Codex, Cursor, Claude Code, Gemini CLI, and Grok CLI.\n");
      return 1;
    }

    let selected: DetectedClient[];
    if (prompter.selectClients) {
      selected = await prompter.selectClients(detected);
    } else {
      let parsed: DetectedClient[] | undefined;
      while (!parsed) {
        const answer = await prompter.ask("Choose clients by number or name, separated by commas [all]\n> ");
        try {
          parsed = parseClientSelection(answer, detected);
        } catch (error) {
          output.write(`${style.error(error instanceof Error ? error.message : String(error))}\n`);
        }
      }
      selected = parsed;
    }

    output.write(`\n${style.success("[ok]")} Selected: ${selected.map((client) => client.label).join(", ")}\n`);
    if (dryRun) {
      output.write("Dry run complete. No API key was requested and no configuration was changed.\n");
      return 0;
    }

    output.write(`\n${style.accent("[2/3]")} ${style.bold("Connect to Luma")}\n\n`);
    let apiKey = "";
    let verified = false;
    for (let attempt = 0; attempt < 3 && !verified; attempt += 1) {
      apiKey = await prompter.ask("Paste your Luma calendar API key (input hidden)\n> ", true);
      if (!apiKey) {
        output.write(`${style.error("The API key cannot be empty.")}\n`);
        continue;
      }
      output.write("Verifying the API key with Luma...\n");
      try {
        await (dependencies.verify ?? verifyLumaApiKey)(apiKey);
        verified = true;
        output.write(`${style.success("[ok]")} Luma API key verified.\n`);
      } catch (error) {
        output.write(`${style.error(error instanceof Error ? error.message : String(error))}\n`);
      }
    }
    if (!verified) {
      output.write("Setup stopped without changing any client configuration.\n");
      return 1;
    }

    const keyPath = dependencies.credentialsFile ?? credentialsPath();
    const credentialProtection = process.platform === "win32"
      ? "inside the current Windows user profile"
      : "with owner-only permissions";
    output.write(`\n${style.accent("[3/3]")} ${style.bold("Review and install")}\n\n`);
    output.write(`${style.bold("Installation plan")}\n`);
    selected.forEach((client) => output.write(`  - Configure ${client.label}\n`));
    output.write(`  - Store the Luma API key at ${keyPath} ${credentialProtection}\n`);
    output.write("  - Client configuration will contain no API key\n\n");

    const confirmed = await prompter.ask("Apply this installation plan? [y/N]\n> ");
    if (!/^y(es)?$/i.test(confirmed)) {
      output.write("Setup cancelled. Nothing was changed.\n");
      return 0;
    }

    await (dependencies.store ?? storeApiKey)(apiKey, keyPath);
    apiKey = "";
    output.write(`${style.success("[ok]")} Stored the Luma API key securely.\n\n`);

    const results: InstallResult[] = [];
    for (const client of selected) {
      output.write(`Configuring ${client.label}...\n`);
      try {
        results.push(await (dependencies.install ?? installClient)(client));
      } catch (error) {
        results.push({
          client: client.id,
          status: "failed",
          detail: error instanceof Error ? error.message : String(error)
        });
      }
    }

    output.write(`\n${style.bold("Setup results")}\n`);
    for (const result of results) {
      const marker = result.status === "failed"
        ? style.error("[x]")
        : style.success("[ok]");
      output.write(`  ${marker} ${result.client}: ${result.detail}\n`);
    }
    output.write("\nRestart the configured AI clients, then ask: \"Verify my Luma connection.\"\n");
    return results.some((result) => result.status === "failed") ? 1 : 0;
  } finally {
    prompter.close();
  }
}

export function setupHelp(): string {
  return [
    "Luma Events MCP",
    "",
    "Usage:",
    "  luma-events              Start the MCP stdio server",
    "  luma-events setup        Detect AI clients and run interactive setup",
    "  luma-events setup --dry-run",
    "  luma-events --help",
    "  luma-events --version",
    "",
    "Supported setup adapters: Codex, Cursor, Claude Code, Gemini CLI, and Grok CLI."
  ].join("\n");
}
