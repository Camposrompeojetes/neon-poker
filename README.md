# Neon Poker

Proyecto base para construir el MVP de Neon Poker: una app educativa y play-money de Texas Hold'em online. No hay dinero real, depositos, retiradas, rake ni premios convertibles.

El documento fuente de arquitectura es `arquitectura-software-codex.pdf`.

## Objetivo MVP

Construir una base funcional heads-up con:

- Registro/login basico.
- Lobby con mesas heads-up.
- Mesa en tiempo real.
- Motor de poker puro, determinista y testeable.
- Hand history basada en eventos.
- Replayer basico.
- Perfil con estadisticas minimas.

## Stack previsto

- Monorepo con pnpm workspaces y Turborepo.
- Frontend: Next.js App Router, React, TypeScript, Tailwind CSS, Framer Motion.
- Backend: NestJS, TypeScript, Socket.IO Gateway.
- Base de datos: PostgreSQL con Drizzle.
- Redis: presencia, cache de lobby, rate limiting y estado efimero.
- Contratos: Zod.
- Tests: Vitest y Playwright.
- Infra local: Docker Compose.

## Estructura

```text
apps/
  web/
  api/
packages/
  poker-engine/
  contracts/
  db/
  ui/
  config/
  test-utils/
docs/
  architecture/
```

## Fases

1. Fundar el repositorio: tooling, reglas, Docker y contratos.
2. Construir el motor puro NLHE heads-up.
3. Implementar backend, TableActor, DB y tiempo real.
4. Implementar frontend MVP.
5. Cerrar con E2E, hardening y revision final.

## Comandos previstos

Instalar dependencias:

```bash
corepack pnpm install
```

Comandos principales:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm typecheck
pnpm e2e
pnpm run ci
```

## Estado actual

Fase 0 iniciada:

- Workspace pnpm configurado.
- Turborepo configurado.
- TypeScript estricto configurado.
- ESLint y Vitest configurados.
- Paquetes base creados.
- Contratos iniciales con Zod.
- Motor base con deck de 52 cartas y shuffle determinista por RNG inyectado.
- Motor heads-up con eventos reproducibles, burn cards, split pot y side pots base.
- Schemas Drizzle iniciales para las tablas MVP de PostgreSQL.
- Docker Compose preparado para PostgreSQL y Redis.
- CI de GitHub preparado.

Comprobaciones ejecutadas correctamente:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

`docker compose config` no se pudo ejecutar porque Docker no esta instalado o no esta disponible en el PATH de esta maquina.
