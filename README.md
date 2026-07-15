# Luma Events MCP Server

An open-source [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
server for managing Luma events from MCP-compatible AI clients.

The server connects to the calendar associated with your Luma API key. It can
list and inspect events, create or update events after explicit confirmation,
inspect guest registrations, and return privacy-conscious registration
summaries.

## Features

- Verify the configured Luma API connection.
- List approved or pending calendar events.
- Retrieve complete details for an event.
- Create events after explicit user confirmation.
- Update event details and registration settings after explicit confirmation.
- List guests for event operations.
- Count registration states and check-ins without returning guest identities.
- Paginate automatically when producing registration summaries.

Write operations are guarded by a required `confirmed` value. MCP clients should
show the proposed event details to the user and obtain explicit approval before
calling a write tool.

## Screenshots

### Discover available capabilities

![The Luma Events MCP server describing its available tools and confirmation safeguards](docs/images/capabilities.png)

### List upcoming events

![The Luma Events MCP server listing upcoming calendar events](docs/images/upcoming-events.png)

### Analyze guest attendance

Guest identities have been redacted from this public example.

![Aggregate guest attendance insights with guest names redacted](docs/images/guest-insights-redacted.png)

## Available tools

### `verify_connection`

Checks the API key and returns the authenticated Luma user.

### `list_events`

Lists calendar events. Supports date ranges, approval status, pagination limits,
and pagination cursors.

### `get_event`

Returns complete details for a single event.

### `create_event`

Creates an event after explicit confirmation. Supports event names, dates,
timezones, descriptions, capacity, online meeting URLs, physical locations,
visibility, registration, waitlist, and guest-list settings.

### `update_event`

Updates selected event fields after explicit confirmation.

### `list_guests`

Lists event guests, optionally filtered by approval status. This tool may return
personal information and should only be used for legitimate event operations.

### `registration_summary`

Returns totals by registration state and the number of checked-in guests without
exposing names or email addresses.

## Requirements

- Node.js 20 or newer
- [pnpm](https://pnpm.io/)
- A Luma calendar with API access
- A Luma API key
- An MCP-compatible client such as Cursor or Codex

## Getting a Luma API key

Generate a calendar API key by following the
[Luma API documentation](https://docs.lu.ma/reference/getting-started-with-your-api).
The key determines which calendar the server can access.

Treat the key as a secret. Never commit it, include it in screenshots, or place
it directly in a tracked MCP configuration file.

## Installation

Clone the repository and enter this plugin directory:

```bash
git clone https://github.com/Blackie360/luma-events-mcp.git
cd luma-events-mcp
```

Install dependencies and build the server:

```bash
corepack enable
pnpm install
pnpm build
```

The production entry point is generated at `dist/index.js`.

## Configuration

The server requires the following environment variable:

```bash
export LUMA_API_KEY="your-luma-api-key"
```

An optional API base URL can be supplied for testing or compatible proxies:

```bash
export LUMA_API_BASE="https://public-api.luma.com"
```

The server does not load `.env` files automatically. For local development, you
can create an ignored `.env` file and load it into your shell before running the
server:

```bash
set -a
source .env
set +a
```

Example `.env`:

```dotenv
LUMA_API_KEY=your-luma-api-key
```

## Running locally

Build and start the stdio MCP server:

```bash
pnpm build
pnpm start
```

The process communicates over standard input and output, so it normally appears
idle when started directly. An MCP client is expected to launch and communicate
with it.

## Connecting an MCP client

Configure your client to run the built server with Node.js. Use absolute paths
unless the client supports a working-directory option.

```json
{
  "mcpServers": {
    "luma-events": {
      "command": "node",
      "args": ["/absolute/path/to/plugins/luma-events/dist/index.js"]
    }
  }
}
```

Make `LUMA_API_KEY` available to the environment that launches your MCP client,
or use the client's secure secret/environment-variable configuration. Restart
the client after updating its environment or MCP configuration.

This repository also includes:

- `.mcp.json` for clients that support plugin-provided MCP configuration.
- `.codex-plugin/plugin.json` with Codex plugin metadata.

After connecting, ask the client to run `verify_connection` before using the
other tools.

## Example prompts

- "Verify my Luma connection."
- "Show my upcoming Luma events."
- "Show the details for the next event."
- "Summarize registrations for my next event."
- "Prepare an event for Friday at 5 PM, but do not create it until I confirm."
- "Close registration for this event after showing me the proposed change."

## Development

Run the TypeScript compiler checks:

```bash
pnpm check
```

Build the project:

```bash
pnpm build
```

Run the test suite:

```bash
pnpm test
```

The test suite covers write confirmation, API error reporting, registration
pagination, and privacy-conscious summaries.

## Project structure

```text
.
├── .codex-plugin/plugin.json  # Codex plugin metadata
├── .mcp.json                  # Plugin MCP server configuration
├── src/index.ts               # MCP server and Luma API integration
├── src/index.test.ts          # Node.js tests
├── package.json               # Scripts and dependencies
└── tsconfig.json              # TypeScript configuration
```

## Security and privacy

- Never commit `LUMA_API_KEY` or any `.env` file.
- Review requested changes before confirming write operations.
- Use `list_guests` only when guest-level data is necessary.
- Prefer `registration_summary` when only aggregate counts are required.
- Keep dependencies updated and report vulnerabilities privately to the
  maintainers.

## Contributing

Contributions are welcome:

1. Fork the repository.
2. Create a focused branch.
3. Add or update tests for your change.
4. Run `pnpm check` and `pnpm test`.
5. Open a pull request explaining the change and its motivation.

Please avoid including API keys, guest information, or other private event data
in issues, tests, commits, or pull requests.

## API

The server uses Luma's official API at `https://public-api.luma.com`. API keys
are scoped to the calendar and permissions configured in Luma.

## License

This project is available under the [MIT License](LICENSE).
