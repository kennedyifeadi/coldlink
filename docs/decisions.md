# Decisions

Decisions that settle open questions in `docs/prd.md` or override it. Newest at the bottom. Add a row whenever you resolve an ambiguity or fall back to a PRD default.

| # | Date | Decision | Reason |
|---|---|---|---|
| 1 | 2026-10-15 | Design system is a blend: keep the existing screens' layouts and components, replace their colours and font with the PRD 9.3 palette and type (Fraunces headings, Nunito UI). New screens must match the existing ones. | The current screens were approved by the team; the PRD palette is the agreed brand. |
| 2 | 2026-10-15 | Remove UI that looks auto-generated: decorative gradients and sparks, stock photos, fake card-brand logos, filler copy. | Keep the product plain, local and trustworthy. |
| 3 | 2026-10-15 | The WhatsApp bot (PRD 7.12) is deferred from this sprint. It lives outside this repo and is not audited or re-pointed. | Not available to the team in this repo; will be picked up later. |
| 4 | 2026-10-15 | Commit messages follow `CLAUDE.md` (plain imperative summary, ≤ 50 chars), not Conventional Commits. | One convention across the repo. |
| 5 | 2026-10-15 | Archive `ColdLink_Product_MVP_Specification.md` to `docs/archive/` with a superseded banner, after copying its UX writing rules, error and loading copy, and the "status never by colour alone" rule into `docs/ux-writing.md`. Done in #4. | Resolves OQ-10 in `docs/discrepancies.md`; stops anyone building from the old spec. |
| 6 | 2026-10-15 | Keep oxlint and add ESLint only for type-aware typescript-eslint rules, with overlapping rules turned off (`eslint-plugin-oxlint`). Prettier for formatting. Done in #6. | Resolves OQ-8; keeps lint fast while meeting PRD 9.1. |
| 7 | 2026-10-15 | Remove the "Insured" badge from the facility screen. Done in #8. | Resolves OQ-7; no facility is known to be insured and there is no attribute behind it. |
| 8 | 2026-10-15 | #9 also owns a not-found page for unknown routes, labelled inputs and semantic controls, and replacing `import * as Icons from 'lucide-react'` with named imports. | Resolves OQ-12; these had no issue. |
