# Luma Events Codex Plugin

Private Codex plugin for managing the Luma calendar associated with one Luma API key.

## Tools

- Verify the API connection
- List and inspect events
- Create events after explicit confirmation
- Update events after explicit confirmation
- List guests
- Return privacy-conscious registration totals

## Requirements

- Node.js 20 or newer
- pnpm
- A Luma Plus calendar API key

## Build

```bash
pnpm install
pnpm build
pnpm test
```

Set the API key in the environment that starts Codex:

```bash
export LUMA_API_KEY="your-key"
```

Never commit the API key or place it in `.mcp.json`.

The build bundles runtime dependencies into `dist/index.js`, so an installed
plugin does not need `node_modules`. Commit the generated `dist/` files when
publishing the plugin.

## API

This plugin uses Luma's official API at `https://public-api.luma.com`. API keys are scoped to one calendar.
