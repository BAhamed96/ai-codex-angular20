# ai-codex

[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue.svg)](https://www.typescriptlang.org/)

Generate a compact Angular 20 + NestJS codebase index that gives AI coding assistants instant context about your application structure. Instead of spending the start of every conversation on route discovery, component scanning, and service tracing, your assistant can read a pre-built index and start working with the right mental model.

## Why

AI coding assistants spend a large amount of context budget exploring a fresh repo before they can make safe changes. In an Angular + Nest monorepo that usually means:

- reading route arrays to understand navigation
- scanning components to find inputs and outputs
- tracing Angular services and Nest providers
- walking Nest controllers to find HTTP endpoints
- opening Prisma schema files to infer data relationships

`ai-codex` precomputes that structure into a small set of Markdown files.

## Quick Start

Run it from your repo root:

```bash
npx ai-codex
```

If your frontend and backend live in separate folders, you can point the generator explicitly:

```bash
npx ai-codex --frontend-root frontend apps/web client --backend-root backend apps/api server
```

The generator will use the first candidate that exists and matches the expected Angular or Nest shape.

## Output

By default, files are written to `.ai-codex/` in your project root:

| File | What it contains |
|------|------------------|
| `routes.md` | NestJS controller routes grouped by resource, with HTTP methods and high-signal tags |
| `pages.md` | Angular route hierarchy from standalone route arrays |
| `services.md` | Angular and Nest injectable classes with public methods |
| `components.md` | Angular components with selectors, standalone markers, inputs, and outputs |
| `lib.md` | Shared utility exports outside Angular/Nest framework classes |
| `schema.md` | Prisma schema summary with key fields and relationships |

Files that do not apply are skipped.

## Configuration

### CLI Flags

```bash
npx ai-codex --output .claude/codex
npx ai-codex --frontend-root frontend apps/web client
npx ai-codex --backend-root backend apps/api server
npx ai-codex --include frontend/src/app/shared backend/src/common
npx ai-codex --exclude coverage dist .angular
npx ai-codex --schema backend/prisma/schema.prisma
```

### Config File

Create a `codex.config.json` in your project root:

```json
{
  "output": ".ai-codex",
  "frontendRoots": ["frontend", "apps/web", "client"],
  "backendRoots": ["backend", "apps/api", "server"],
  "include": ["frontend/src/app/shared", "backend/src/common"],
  "exclude": ["coverage", "dist"],
  "schema": "backend/prisma/schema.prisma"
}
```

CLI flags append explicit candidates and take precedence over config defaults. Legacy single-value config keys `frontendRoot` and `backendRoot` are still accepted.

## Output Format Examples

### routes.md

```md
## auth
POST         /api/auth/login [auth]
POST         /api/auth/refresh [auth]

## orders
GET,POST     /api/orders [auth,db]
GET          /api/orders/:id [auth,db]
POST         /api/orders/:id/refund [auth,db]

## users
GET          /api/users/me [auth,db]
PATCH        /api/users/:id [auth,db]
```

### pages.md

```md
/                                                        HomePageComponent
/products                                                ProductsPageComponent
/products/:id                                            ProductDetailPageComponent [resolve:productResolver]
/account                                                 AccountShellComponent [guard:authGuard]
/account/orders                                          OrdersPageComponent
/admin                                                   loadChildren ./admin/admin.routes#ADMIN_ROUTES [lazy,guard:adminGuard]
```

### services.md

```md
## frontend/core/auth
svc AuthService  login, logout, refreshSession

## frontend/features/products/data
svc ProductsService  list, getById, search

## backend/modules/orders
svc OrdersService  findAll, findOne, create, refund
```

### components.md

```md
## pages
(s) HomePageComponent  <app-home-page>
(s) ProductsPageComponent  <app-products-page>

## features/products/ui
(s) ProductCardComponent  <app-product-card>  in: product, compact  out: addToCart
(s) ProductFiltersComponent  <app-product-filters>  in: selectedCategory  out: categoryChange
```

### lib.md

```md
## frontend/src/app/shared/utils
price.ts
  fn formatPrice
  fn formatCurrencyCode

## backend/src/common
pagination.ts
  fn buildPageRequest
```

### schema.md

```md
## User
  id                     String    PK
  email                  String    UQ
  -> Order[], Address[]

## Order
  id                     String    PK
  userId                 String
  status                 OrderStatus
  -> User, OrderItem[]
```

## Detection Model

The current implementation is optimized for a single repo with separate Angular and Nest roots.

- Angular detection looks for `angular.json`, `@angular/core`, or Angular bootstrap files.
- Nest detection looks for `nest-cli.json`, `@nestjs/core`, or `NestFactory` bootstrap files.
- You can provide multiple root candidates, and the first matching root is selected.
- Angular routes are parsed from standalone route arrays such as `app.routes.ts`.
- Nest routes are parsed from `@Controller()` classes and HTTP method decorators.
- Prisma schema is auto-detected relative to the backend root when possible.

## Supported Stacks

| Stack | Auto-detected | What it scans |
|------|:-------------:|---------------|
| Angular 20 frontend | Yes | `src/app/**/*.routes.ts`, `src/app/**/*.component.ts`, Angular injectables |
| NestJS backend | Yes | `src/**/*.controller.ts`, Nest injectables, `src/main.ts` for global API prefix |
| Prisma schema | Yes | `prisma/schema.prisma` and backend-relative schema locations |

## Current Limits

- The first pass is centered on Angular standalone routing.
- Express and Fastify manual route registration are not indexed.
- TypeORM and Drizzle schema parsing are not implemented yet.
- Lazy `loadChildren` branches are summarized, not fully expanded.

## Integration with AI Assistants

### Claude Code

Add this to your `CLAUDE.md`:

```md
## Codebase Index
Pre-built index files are in `.ai-codex/`. Read these first before exploring the repo:
- `.ai-codex/routes.md` -- NestJS HTTP routes
- `.ai-codex/pages.md` -- Angular route hierarchy
- `.ai-codex/services.md` -- Angular and Nest services/providers
- `.ai-codex/components.md` -- Angular component index
- `.ai-codex/lib.md` -- shared utility exports
- `.ai-codex/schema.md` -- Prisma schema summary
```

### Other AI IDEs

Add the `.ai-codex/` directory to your assistant context or rules file.

## Development

```bash
npm install
npm run build
npx tsx src/generate-codex.ts --frontend-root frontend apps/web --backend-root backend apps/api
```

## License

MIT