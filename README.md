# Luma Events MCP Server

An open-source [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
server for managing Luma events from MCP-compatible AI clients.

The server connects to the calendar associated with your Luma API key. It can
create, update, and safely delete events, inspect registrations, look up and add
guests, manage guest statuses and tickets, configure ticket types and event
hosts, send soft invitations, safely invite audiences from past events, and
approve waitlists without exceeding a conservative per-run write budget.

## Features

- Verify the configured Luma API connection.
- List approved or pending calendar events.
- Retrieve complete details for an event or one guest.
- Create and update events after explicit user confirmation.
- Preview and permanently delete events through Luma's two-step cancellation
  flow after explicit confirmation.
- Add guests directly with optional ticket and registration-answer data.
- Preview and update individual guest statuses with explicit paid-ticket refund choices.
- Preview complimentary ticket additions and non-refunding ticket removals.
- List, inspect, create, update, and safely delete event ticket types.
- Add and update event hosts or check-in staff, and preview host removal.
- Send soft event invitations by email and, for linked accounts, SMS.
- Preview and invite deduplicated audiences from earlier events without exposing identities.
- Approve waitlists in resumable 90-guest runs with partial-failure reporting.
- List guests for event operations.
- Count registration states and check-ins without returning guest identities.
- Paginate automatically when producing registration summaries and audience previews.

Write operations are guarded by a required `confirmed` value. Higher-impact
guest, ticket, host-removal, and deletion tools return a structured preview when
`confirmed=false`. MCP clients should show the preview or proposed arguments to
the user and obtain explicit approval before retrying with `confirmed=true`.

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

### `get_guest`

Returns one guest by guest ID, ticket key, guest key, or email, including
ticket-order details. This response contains personal information.

### `update_guest_status`

Previews and updates one guest to `approved`, `declined`, `pending_approval`, or
`waitlist`. The preview returns only the identity and status information needed
for confirmation. Moving an approved guest with captured paid tickets to a
non-approved state requires an explicit refund choice.

### `update_guest_tickets`

Previews and changes one guest's tickets. Added tickets are complimentary
administrative tickets even when the ticket type is normally paid, may exceed
capacity, and are not idempotent. Removed tickets are invalidated without a
refund, and at least one valid ticket must remain.

### `list_ticket_types`

Lists an event's ticket types and can optionally include hidden ticket types.

### `get_ticket_type`

Returns one ticket type by ticket-type ID.

### `create_ticket_type`

Creates a free, paid, or flexible-price ticket type after explicit confirmation.
Supports approval and visibility settings, descriptions, sale dates, capacity,
currency, fixed price, and minimum flexible price.

### `update_ticket_type`

Updates selected ticket-type settings after explicit confirmation. Nullable
fields can be used to clear descriptions, dates, capacity, or pricing values.

### `delete_ticket_type`

Verifies that a ticket type belongs to the selected event and returns an exact
preview before deletion. Luma refuses deletion when tickets have been sold or
when the ticket type is the event's last visible option.

### `add_host`

Adds a visible or hidden event host with `manager`, `check-in`, or `none` access
after explicit confirmation.

### `update_host`

Updates an event host's access level or public visibility after explicit
confirmation. Luma does not allow changing the event creator's access.

### `remove_host`

Resolves the event and host email case-insensitively and returns a preview before
removing the host. Visible hosts include their returned Luma identity. Luma may
omit hidden hosts from the event response, so those previews clearly identify
the requested email as unverified. A removed host can be added again later.

### `create_event`

Creates an event after explicit confirmation. Supports event names, dates,
timezones, descriptions, capacity, online meeting URLs, physical locations,
visibility, registration, waitlist, and guest-list settings.

### `update_event`

Updates selected event fields after explicit confirmation.

### `delete_event`

Previews and permanently deletes an event through Luma's two-step cancellation
flow. The preview reports the exact event, approved guest count, and whether the
event is paid. Confirmed deletion is irreversible, notifies all guests, and
requires an explicit refund choice for paid events.

### `add_guests`

Registers guests directly with an approved, pending-approval, or waitlist
status. Supports names, registration answers, ticket types, and optional Luma
email notifications. Requires explicit confirmation.

### `send_invites`

Sends soft invitations in batches of 100. Luma emails each recipient and may
also send SMS when a phone number is linked to the recipient's Luma account.
Requires explicit confirmation and returns only aggregate delivery counts.

### `invite_guests_from_event`

Builds an audience from selected source-event statuses, normalizes and
deduplicates email addresses, removes guests already associated with the target
event, and sends soft invitations in batches. Call with `confirmed=false` first
to receive an identity-free preview, then with `confirmed=true` after approval.

### `approve_waitlisted_guests`

Approves up to 90 currently waitlisted guests after explicit confirmation. It
can send Luma's approval email with an optional message, reports partial
failures without returning guest names or email addresses, and returns
`resume_required=true` when another safe run is needed.

### `list_guests`

Lists event guests, optionally filtered by approval status. This tool may return
personal information and should only be used for legitimate event operations.

### `registration_summary`

Returns totals by registration state and the number of checked-in guests without
exposing names or email addresses.

## Requirements

- Node.js 20 or newer
- A Luma calendar with API access
- A Luma API key
- An MCP-compatible client such as Cursor or Codex

[pnpm](https://pnpm.io/) is required only when building from source.

## Getting a Luma API key

Generate a calendar API key by following the
[Luma API documentation](https://docs.luma.com/reference/getting-started-with-your-api).
The key determines which calendar the server can access.

Treat the key as a secret. Never commit it, include it in screenshots, or place
it directly in a tracked MCP configuration file.

## Installation

### Run the npm package

After the package is published, an MCP client can launch it directly with
`npx`; cloning and building are not required:

```json
{
  "mcpServers": {
    "luma-events": {
      "command": "npx",
      "args": [
        "-y",
        "--package",
        "@blackie360/luma-events-mcp@0.5.2",
        "luma-events-mcp"
      ],
      "env": {
        "LUMA_API_KEY": "your-luma-api-key"
      }
    }
  }
}
```

Prefer your client's secret or environment-variable support instead of placing
the API key directly in a tracked configuration file.

You can also install the executable globally:

```bash
npm install --global @blackie360/luma-events-mcp
luma-events-mcp
```

The command is a stdio MCP server, so it normally appears idle when run outside
an MCP client.

### Build from source

Clone the repository and enter the project directory:

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

The recommended npm configuration is shown in
[Installation](#run-the-npm-package). To use a local source build instead,
configure your client to run the built server with Node.js. Use an absolute
path unless the client supports a working-directory option.

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

### Cursor

The included `.cursor/mcp.json` lets Cursor start the server automatically from
this workspace. Copy `.env.example` to `.env`, add your Luma API key, build the
server once, and restart Cursor:

```bash
cp .env.example .env
pnpm install
pnpm build
```

You do not need to run `pnpm start`. Cursor launches `dist/index.js` when it
connects to the MCP server. Rebuild only after changing the source code.

Open **Cursor Settings → Tools & MCP**, enable `luma-events`, then ask Cursor to
verify the Luma connection.

For installation as a Cursor plugin, this repository also includes
`.cursor-plugin/plugin.json` and the root `mcp.json`. Cursor requests the
`LUMA_API_KEY` plugin variable during configuration and reuses it on subsequent
starts.

## Example prompts

- "Verify my Luma connection."
- "Show my upcoming Luma events."
- "Show the details for the next event."
- "Summarize registrations for my next event."
- "Show how many guests are waitlisted, then approve a safe batch after I confirm."
- "Preview the waitlisted guests from the last event who are not already on my next event."
- "Invite that previewed audience to the next event after I confirm."
- "Add these guests to the event as pending approval after I confirm."
- "Preview approving this guest and show whether a refund choice is involved."
- "Preview replacing this guest's workshop ticket without sending email."
- "List every ticket type for this event, including hidden tickets."
- "Create a hidden free speaker ticket after I confirm."
- "Add this person as hidden check-in staff after I confirm."
- "Preview removing this host from the event."
- "Prepare an event for Friday at 5 PM, but do not create it until I confirm."
- "Close registration for this event after showing me the proposed change."
- "Preview deleting this event, including the guest and refund impact."

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

Create the same tarball that would be uploaded to npm:

```bash
pnpm pack
```

The `prepack` check runs the compiler and full test suite before creating the
archive. The published package contains the executable bundle, declaration
file, documentation, license, and Codex/Cursor plugin manifests; development
source, tests, source maps, screenshots, and local secrets are excluded.

To publish a release after reviewing the tarball, update every synchronized
version, commit and push the change, then push a matching version tag:

```bash
git tag v0.5.3
git push origin v0.5.3
```

The GitHub Actions release workflow verifies that the tag matches
`package.json`, publishes the public npm package through npm trusted publishing,
and creates a GitHub Release with generated release notes. Never reuse an npm
version or move a published version tag.

The test suite covers write confirmation, two-step event deletion, API error
reporting, pagination, resumable waitlist approvals, invite batching, audience
deduplication, guest status refunds, guest-ticket invariants, ticket-type
ownership and deletion, host matching, privacy-conscious previews, and MCP tool
discovery and execution.

## Project structure

```text
.
├── .codex-plugin/plugin.json  # Codex plugin metadata
├── .cursor/mcp.json           # Project-local Cursor MCP configuration
├── .cursor-plugin/plugin.json # Cursor plugin metadata and secret variables
├── .env.example               # Local environment template
├── .mcp.json                  # Plugin MCP server configuration
├── mcp.json                   # Cursor plugin MCP configuration
├── src/index.ts               # MCP server and Luma API integration
├── src/index.test.ts          # Node.js tests
├── src/mcp.integration.test.ts # MCP integration tests
├── package.json               # Scripts and dependencies
└── tsconfig.json              # TypeScript configuration
```

## Security and privacy

- Never commit `LUMA_API_KEY` or any `.env` file.
- Always preview `delete_event` and confirm the exact event and refund choice;
  deletion is irreversible and Luma notifies every guest.
- Review requested changes before confirming write operations.
- Review event, recipient count, status, ticket, message, and notification
  choices before confirming guest writes.
- Preview `update_guest_status` and explicitly choose whether to refund a
  captured paid ticket before moving that guest out of approved status.
- Preview `update_guest_tickets`; additions are complimentary and may bypass
  capacity, removals do not refund, and disabling email does not suppress
  Luma's in-app notification.
- Preview ticket-type and host removals and confirm the exact event and target.
- Preview `invite_guests_from_event` before confirming it; previews return counts,
  not guest identities.
- Use `list_guests` and `get_guest` only when guest-level data is necessary.
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

The server uses Luma's official API at `https://public-api.luma.com`. Request
shapes are based on Luma's [OpenAPI specification](https://public-api.luma.com/openapi.json).
API keys are scoped to the calendar and permissions configured in Luma.

## License

This project is available under the [MIT License](LICENSE).
