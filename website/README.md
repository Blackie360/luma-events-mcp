# Luma Events website

The standalone landing page for the Luma Events MCP server. It uses Next.js App
Router, TypeScript, Tailwind CSS v4, and official shadcn/ui components.

## Local development

Use Node.js 20.9 or newer and pnpm:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

The live npm download total is fetched server-side and cached for 24 hours. If
npm is unavailable, the page shows the last verified total rather than failing.

## Validation

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Before deployment, set `NEXT_PUBLIC_SITE_URL` to the public site origin so
Open Graph and Twitter image URLs resolve correctly. Local development defaults
to `http://localhost:3000`.

## Boundaries

This directory is intentionally independent from the npm-published MCP package
in the repository root. Website dependencies, lockfiles, and build output stay
inside `website/`.
