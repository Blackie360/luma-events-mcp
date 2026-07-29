import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";

import {
  credentialsPath,
  detectClients,
  installClient,
  parseClientSelection,
  readStoredApiKey,
  runInteractiveSetup,
  setupBanner,
  storeApiKey,
  verifyLumaApiKey,
  type DetectedClient,
  type InstallResult
} from "./setup.js";

function outputCapture(): { stream: PassThrough; text: () => string } {
  const stream = new PassThrough();
  let content = "";
  stream.on("data", (chunk) => {
    content += chunk.toString();
  });
  return { stream, text: () => content };
}

function fakePrompter(answers: string[]) {
  const calls: Array<{ question: string; secret: boolean }> = [];
  return {
    calls,
    prompter: {
      async ask(question: string, secret = false) {
        calls.push({ question, secret });
        const answer = answers.shift();
        if (answer === undefined) throw new Error("Missing test answer.");
        return answer;
      },
      close() {}
    }
  };
}

test("credentials are stored once with owner-only permissions and can be read by the server", async () => {
  const directory = await mkdtemp(join(tmpdir(), "luma-events-credentials-"));
  const path = join(directory, "nested", "credentials.json");
  await storeApiKey("secret-calendar-key", path);

  assert.equal(
    readStoredApiKey({ LUMA_API_KEY_FILE: path }, directory, process.platform),
    "secret-calendar-key"
  );
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
    apiKey: "secret-calendar-key"
  });
  if (process.platform !== "win32") {
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal((await stat(join(directory, "nested"))).mode & 0o777, 0o700);
  }
});

test("credentialsPath supports explicit, XDG, and Windows locations", () => {
  assert.equal(
    credentialsPath({ LUMA_API_KEY_FILE: "/secure/luma.json" }, "/home/test", "linux"),
    "/secure/luma.json"
  );
  assert.equal(
    credentialsPath({ XDG_CONFIG_HOME: "/xdg" }, "/home/test", "linux"),
    join("/xdg", "luma-events-mcp", "credentials.json")
  );
  assert.equal(
    credentialsPath({ APPDATA: "C:\\Users\\test\\AppData\\Roaming" }, "C:\\Users\\test", "win32"),
    join("C:\\Users\\test\\AppData\\Roaming", "luma-events-mcp", "credentials.json")
  );
});

test("client detection uses PATH and Cursor's known configuration directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "luma-events-detection-"));
  const binaries = join(directory, "bin");
  const home = join(directory, "home");
  await mkdir(binaries, { recursive: true });
  await mkdir(join(home, ".cursor"), { recursive: true });
  for (const name of ["codex", "gemini"]) {
    const path = join(binaries, name);
    await writeFile(path, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(path, 0o755);
  }

  const detected = await detectClients({ PATH: binaries }, home, "linux");
  assert.deepEqual(detected.map((client) => client.id), ["codex", "cursor", "gemini"]);
  assert.match(detected[1]?.detection ?? "", /mcp\.json/);
});

test("selection accepts numbers, client names, all, and removes duplicates", () => {
  const detected: DetectedClient[] = [
    { id: "codex", label: "OpenAI Codex", executable: "/bin/codex", detection: "test" },
    { id: "cursor", label: "Cursor", detection: "test" },
    { id: "gemini", label: "Gemini CLI", executable: "/bin/gemini", detection: "test" }
  ];

  assert.deepEqual(parseClientSelection("", detected), detected);
  assert.deepEqual(
    parseClientSelection("1, gemini, 1", detected).map((client) => client.id),
    ["codex", "gemini"]
  );
  assert.throws(() => parseClientSelection("claude", detected), /Unknown selection/);
});

test("Luma key verification sends the secret only in the API header", async () => {
  let requestedUrl = "";
  let requestedHeader = "";
  await verifyLumaApiKey(
    "private-key",
    "https://luma.test",
    async (input, init) => {
      requestedUrl = String(input);
      requestedHeader = new Headers(init?.headers).get("x-luma-api-key") ?? "";
      return Response.json({ id: "user-test" });
    }
  );
  assert.equal(requestedUrl, "https://luma.test/v1/users/get-self");
  assert.equal(requestedHeader, "private-key");

  await assert.rejects(
    verifyLumaApiKey("bad-key", "https://luma.test", async () => new Response("", { status: 401 })),
    /HTTP 401/
  );
});

test("CLI client adapters never include the Luma API key in process arguments", async () => {
  const invocations: Array<{ command: string; args: string[] }> = [];
  const runner = async (command: string, args: string[]) => {
    invocations.push({ command, args });
    return { code: 0, stdout: "", stderr: "" };
  };
  const clients: DetectedClient[] = [
    { id: "codex", label: "OpenAI Codex", executable: "/tools/codex", detection: "test" },
    { id: "claude", label: "Claude Code", executable: "/tools/claude", detection: "test" },
    { id: "gemini", label: "Gemini CLI", executable: "/tools/gemini", detection: "test" },
    { id: "grok", label: "Grok CLI", executable: "/tools/grok", detection: "test" }
  ];

  for (const client of clients) {
    const installed = await installClient(client, runner);
    assert.equal(installed.status, "installed");
  }

  assert.deepEqual(invocations, [
    {
      command: "/tools/codex",
      args: ["mcp", "add", "luma-events", "--", "npx", "-y", "--package", "@blackie360/luma-events-mcp@latest", "luma-events-mcp"]
    },
    {
      command: "/tools/claude",
      args: ["mcp", "add", "--scope", "user", "luma-events", "--", "npx", "-y", "--package", "@blackie360/luma-events-mcp@latest", "luma-events-mcp"]
    },
    {
      command: "/tools/gemini",
      args: ["mcp", "add", "--scope", "user", "luma-events", "npx", "-y", "--package", "@blackie360/luma-events-mcp@latest", "luma-events-mcp"]
    },
    {
      command: "/tools/grok",
      args: ["mcp", "add", "luma-events", "--", "npx", "-y", "--package", "@blackie360/luma-events-mcp@latest", "luma-events-mcp"]
    }
  ]);
  assert.doesNotMatch(JSON.stringify(invocations), /private-key|LUMA_API_KEY/);
});

test("Cursor installation preserves other settings and creates a backup", async () => {
  const directory = await mkdtemp(join(tmpdir(), "luma-events-cursor-"));
  const path = join(directory, "mcp.json");
  await writeFile(path, JSON.stringify({
    theme: "dark",
    mcpServers: {
      github: { command: "github-mcp-server" }
    }
  }), "utf8");

  const result = await installClient(
    { id: "cursor", label: "Cursor", detection: "test" },
    async () => ({ code: 0, stdout: "", stderr: "" }),
    path
  );
  assert.equal(result.status, "installed");
  assert.match(result.detail, /backup saved/);

  const configured = JSON.parse(await readFile(path, "utf8")) as {
    theme: string;
    mcpServers: Record<string, { command: string; args?: string[] }>;
  };
  assert.equal(configured.theme, "dark");
  assert.equal(configured.mcpServers.github?.command, "github-mcp-server");
  assert.deepEqual(configured.mcpServers["luma-events"], {
    type: "stdio",
    command: "npx",
    args: ["-y", "--package", "@blackie360/luma-events-mcp@latest", "luma-events-mcp"]
  });
});

test("interactive setup asks for the key after selection and writes only after confirmation", async () => {
  const clients: DetectedClient[] = [
    { id: "codex", label: "OpenAI Codex", executable: "/tools/codex", detection: "test" },
    { id: "gemini", label: "Gemini CLI", executable: "/tools/gemini", detection: "test" }
  ];
  const prompts = fakePrompter(["1,gemini", "private-key", "yes"]);
  const output = outputCapture();
  const stored: Array<{ key: string; path: string }> = [];
  const installed: ClientIdForTest[] = [];

  const exitCode = await runInteractiveSetup([], {
    detect: async () => clients,
    verify: async (key) => assert.equal(key, "private-key"),
    store: async (key, path) => {
      stored.push({ key, path });
    },
    install: async (client): Promise<InstallResult> => {
      installed.push(client.id);
      return { client: client.id, status: "installed", detail: "configured" };
    },
    prompter: prompts.prompter,
    output: output.stream,
    credentialsFile: "/secure/credentials.json"
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(prompts.calls.map((call) => call.secret), [false, true, false]);
  assert.match(prompts.calls[0]?.question ?? "", /Choose clients/);
  assert.match(prompts.calls[1]?.question ?? "", /API key/);
  assert.deepEqual(stored, [{ key: "private-key", path: "/secure/credentials.json" }]);
  assert.deepEqual(installed, ["codex", "gemini"]);
  assert.match(output.text(), /EVENTS MCP/);
  assert.match(output.text(), /\[1\/3\] Detect AI clients/);
  assert.match(output.text(), /\[2\/3\] Connect to Luma/);
  assert.match(output.text(), /\[3\/3\] Review and install/);
  assert.doesNotMatch(output.text(), /private-key/);
});

test("setup banner has compact ASCII branding and an optional ANSI accent", () => {
  const plain = setupBanner();
  assert.match(plain, /_     _   _ __  __    _/);
  assert.match(plain, /EVENTS MCP/);
  assert.doesNotMatch(plain, /\u001b\[/);
  assert.match(setupBanner(true), /\u001b\[35m/);
});

type ClientIdForTest = DetectedClient["id"];

test("declining the final plan performs zero writes", async () => {
  const prompts = fakePrompter(["all", "private-key", "no"]);
  let stores = 0;
  let installs = 0;
  const exitCode = await runInteractiveSetup([], {
    detect: async () => [
      { id: "codex", label: "OpenAI Codex", executable: "/tools/codex", detection: "test" }
    ],
    verify: async () => {},
    store: async () => {
      stores += 1;
    },
    install: async (client) => {
      installs += 1;
      return { client: client.id, status: "installed", detail: "configured" };
    },
    prompter: prompts.prompter,
    output: outputCapture().stream,
    credentialsFile: "/secure/credentials.json"
  });

  assert.equal(exitCode, 0);
  assert.equal(stores, 0);
  assert.equal(installs, 0);
});

test("dry run stops before requesting or storing a key", async () => {
  const prompts = fakePrompter(["all"]);
  const output = outputCapture();
  const exitCode = await runInteractiveSetup(["--dry-run"], {
    detect: async () => [
      { id: "cursor", label: "Cursor", detection: "test" }
    ],
    prompter: prompts.prompter,
    output: output.stream
  });

  assert.equal(exitCode, 0);
  assert.equal(prompts.calls.length, 1);
  assert.match(output.text(), /No API key was requested/);
});

test("packaged entry exposes setup help without starting stdio", () => {
  const result = spawnSync(process.execPath, ["dist/index.js", "--help"], {
    encoding: "utf8"
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /luma-events-mcp setup/);
  assert.match(result.stdout, /Codex, Cursor, Claude Code, Gemini CLI, and Grok CLI/);
  assert.equal(result.stderr, "");
});

test("packaged interactive setup exits without an unsettled top-level await warning", async (t) => {
  if (process.platform === "win32") {
    t.skip("Executable fixture uses POSIX permissions.");
    return;
  }
  const directory = await mkdtemp(join(tmpdir(), "luma-events-clean-exit-"));
  const codex = join(directory, "codex");
  await writeFile(codex, "#!/bin/sh\nexit 0\n", "utf8");
  await chmod(codex, 0o755);

  const result = spawnSync(
    process.execPath,
    ["dist/index.js", "setup", "--dry-run"],
    {
      encoding: "utf8",
      input: "\n",
      env: { ...process.env, PATH: directory, NO_COLOR: "1" }
    }
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Dry run complete/);
  assert.doesNotMatch(result.stderr, /unsettled top-level await/i);
});
