# LoadTruth Frontend

Next.js 16 (App Router, React Server Components) operator console. Mobile-first, dark operator-console aesthetic. See [../PLAN.md](../PLAN.md) §3, §9 and [../.kiro/steering/agent-protocol.md](../.kiro/steering/agent-protocol.md).

## Requirements

- Node.js 20.17+ (Node 26 is installed on this machine) and npm.

## Setup & run

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000  (proxies /api/* to the backend at :8000)
```

## Quality gates

```bash
npm run lint
npm run typecheck
npm run format:check
npm run test       # vitest + coverage
```

(All are also wired into the repo-root `./scripts/eval.sh`.)

## Layout

```
frontend/
  src/
    app/
      layout.tsx     # root layout, viewport (mobile), global theme
      page.tsx       # landing/status screen (responsive)
      globals.css    # Tailwind v4 + operator-console theme tokens
    components/
      health-badge.tsx   # Server Component reading backend /health
    lib/
      api.ts             # typed backend client
      api.test.ts        # vitest unit tests
  next.config.ts   # /api/* -> backend rewrite
  tsconfig.json    # strict + noUncheckedIndexedAccess
  eslint.config.mjs · .prettierrc.json · vitest.config.ts
```

Next screens (per PLAN.md §3): auth + tenant switcher, upload/queue, review console, dashboard/reports, analyst chat, admin.
