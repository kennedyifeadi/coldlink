# ColdLink

ColdLink connects farmers in Oyo State with nearby cold storage, so they can find space, book it and pay from a phone.

## Repository layout

```
apps/
  web/        React + Vite frontend
  api/        Backend (TypeScript)
packages/
  shared/     Types and constants shared by web and api
docs/         Product requirements, decisions and audits
```

## Prerequisites

- Node.js 24 (LTS), as pinned in `.nvmrc`
- pnpm 10, as pinned in `package.json` (`corepack enable` installs the right version)

## Getting started

```bash
pnpm install
pnpm --filter web dev
```

The web app runs at http://localhost:5173.

Scripts at the root run across every workspace:

| Command | What it does |
|---|---|
| `pnpm dev` | Start every workspace's dev server |
| `pnpm build` | Build every workspace |
| `pnpm lint` | Lint every workspace |
| `pnpm typecheck` | Type-check the TypeScript workspaces |
| `pnpm test` | Run every workspace's tests |

## Docs

- [Product requirements](docs/prd.md)
- [Decisions](docs/decisions.md)
- [UX writing](docs/ux-writing.md)
- [Current state of the app](docs/current-state.md)
- [Discrepancies between the app and the PRD](docs/discrepancies.md)
- [Original MVP specification (archived)](docs/archive/mvp-specification-v1.md)
