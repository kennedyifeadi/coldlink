# ColdLink

ColdLink connects farmers in Oyo State with nearby cold storage, so they can find space, book it and pay from a phone.

## Repository layout

```
apps/
  web/        React + Vite frontend
  api/        Express API (TypeScript)
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
pnpm --filter @coldlink/api dev
```

The web app runs at http://localhost:5173 and the API at http://localhost:3000/api/v1 (try `/health`). The API reads `apps/api/.env` if it exists; copy `apps/api/.env.example` to change the defaults.

`apps/api` imports `@coldlink/shared` from its built `dist`. The root `lint`, `typecheck` and `test` scripts and the API `dev` script build it first; after changing shared while the API dev server runs, run `pnpm build:shared`.

Scripts at the root run across every workspace:

| Command | What it does |
|---|---|
| `pnpm dev` | Start every workspace's dev server |
| `pnpm build` | Build every workspace |
| `pnpm lint` | Lint every workspace |
| `pnpm typecheck` | Type-check the TypeScript workspaces |
| `pnpm test` | Run every workspace's tests |
| `pnpm db:new <name>` | Create a database migration |
| `pnpm db:push` | Apply pending migrations to the dev project ([supabase/README.md](supabase/README.md)) |

## Docs

- [Product requirements](docs/prd.md)
- [Decisions](docs/decisions.md)
- [API reference](docs/api.md)
- [Database conventions and migrations](supabase/README.md)
- [UX writing](docs/ux-writing.md)
- [Current state of the app](docs/current-state.md)
- [Discrepancies between the app and the PRD](docs/discrepancies.md)
- [Original MVP specification (archived)](docs/archive/mvp-specification-v1.md)
