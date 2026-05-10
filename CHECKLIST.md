# Checklist del proyecto Neon Poker

Ultima actualizacion: 2026-05-11

Este documento resume el contexto operativo del proyecto para no perder el hilo entre sesiones.

## Ubicacion del proyecto

Carpeta principal:

```text
C:\Users\Kingo\OneDrive\Escritorio\arquitectura-software-codex
```

Documento de arquitectura base:

```text
arquitectura-software-codex.pdf
```

## Principios que ya quedan fijados

- [x] El proyecto es Neon Poker, app educativa/play-money de Texas Hold'em.
- [x] No hay dinero real.
- [x] No hay pagos, depositos, retiradas, rake ni premios convertibles.
- [x] El servidor sera autoritativo.
- [x] El cliente no debe decidir cartas, stacks, pots, turnos ni acciones legales reales.
- [x] El motor de poker debe vivir separado en `packages/poker-engine`.
- [x] El motor debe ser puro: sin NestJS, DB, Redis, WebSocket, UI, `Math.random()` ni `Date.now()`.
- [x] PostgreSQL sera fuente de verdad.
- [x] Redis solo se usara para presencia, cache, rate limiting, coordinacion o estado efimero.
- [x] Las manos se persistiran como eventos append-only.
- [x] Las vistas deben filtrar informacion privada para no exponer cartas de otros jugadores.

## Fase 0 - Fundacion del repositorio

- [x] Crear carpeta del proyecto en OneDrive.
- [x] Copiar el PDF original de arquitectura al proyecto.
- [x] Crear `README.md` inicial.
- [x] Crear `AGENTS.md` con reglas obligatorias para Codex.
- [x] Inicializar Git en la carpeta de OneDrive.
- [x] Crear estructura base:
  - [x] `apps/web`
  - [x] `apps/api`
  - [x] `packages/poker-engine`
  - [x] `packages/contracts`
  - [x] `packages/db`
  - [x] `packages/ui`
  - [x] `packages/config`
  - [x] `packages/test-utils`
  - [x] `docs/architecture`
- [x] Configurar `pnpm-workspace.yaml`.
- [x] Configurar `package.json` raiz.
- [x] Configurar `turbo.json`.
- [x] Configurar `tsconfig.base.json`.
- [x] Configurar ESLint.
- [x] Configurar Vitest.
- [x] Crear `.env.example`.
- [x] Crear `docker-compose.yml` para PostgreSQL y Redis.
- [x] Crear workflow CI en `.github/workflows/ci.yml`.
- [x] Instalar dependencias con pnpm.
- [x] Generar `pnpm-lock.yaml`.

## Paquetes base creados

- [x] `@neon-poker/contracts`
  - [x] Contratos iniciales con Zod.
  - [x] Mensajes cliente: `lobby.subscribe`, `table.join`, `game.action`.
  - [x] `game.action` exige `expectedSeq` e `idempotencyKey`.
  - [x] `HandEventSchema` exige `handId`, `seq`, `eventType`, `payload`, `schemaVersion` y `stateHashAfter`.
  - [x] Test que rechaza estado autoritativo enviado por el cliente.
- [x] `@neon-poker/poker-engine`
  - [x] Deck de 52 cartas.
  - [x] Cartas unicas.
  - [x] Shuffle determinista con RNG inyectado.
  - [x] Config heads-up inicial con `maxSeats: 2`.
  - [x] Modelo de dominio inicial de mesa, asientos, mano, calles, acciones legales y ganadores.
  - [x] Comandos iniciales: `SeatPlayer`, `StandUp`, `StartHand`, `PlayerAction`.
  - [x] Eventos de dominio iniciales: seat, hand start, private cards, blinds, action requested, player acted, board dealt, street advanced, showdown y hand ended.
  - [x] Reducer `applyEvent()`.
  - [x] Decision function `decide()`.
  - [x] Rebuild determinista desde eventos.
  - [x] `stateHash`.
  - [x] Materializacion de eventos persistibles con `stateHashAfter`.
  - [x] Vistas filtradas: publica, jugador, espectador e interna/debug.
  - [x] Evaluador Texas Hold'em inicial.
  - [x] Flujo heads-up con blinds, preflop/flop/turn/river, fold, check, call, bet, all-in y showdown.
- [x] `@neon-poker/db`
  - [x] Lista inicial de tablas MVP requeridas.
  - [x] Incluye `hand_events`.
- [x] `@neon-poker/ui`
  - [x] Utilidad base `cx`.
- [x] `@neon-poker/config`
  - [x] Nombre del proyecto y puertos previstos.
- [x] `@neon-poker/test-utils`
  - [x] Helper de RNG determinista.
- [x] `apps/api`
  - [x] Placeholder compilable.
  - [x] Validacion de mensajes entrantes usando contratos compartidos.
  - [x] Test de servidor autoritativo.
- [x] `apps/web`
  - [x] Placeholder compilable.
  - [x] Crea intencion tipada de suscripcion al lobby.
  - [x] Test de cliente no autoritativo.

## Comprobaciones ya ejecutadas

- [x] `pnpm test`
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm build`
- [ ] `docker compose config`

Nota: `docker compose config` no se pudo ejecutar porque Docker no esta instalado o no esta disponible en el PATH de esta maquina.

## Fase 1 - Motor NLHE heads-up

- [x] Empezar Fase 1: motor NLHE heads-up real.
- [x] Definir modelo de dominio inicial: `GameState`, `Seat`, `Street`, stacks, pot, board, commitments y ganadores.
- [x] Definir comandos del motor.
- [x] Definir eventos de dominio.
- [x] Implementar `decide()`.
- [x] Implementar `applyEvent()`.
- [x] Anadir reconstruccion determinista desde eventos.
- [x] Anadir `stateHash`.
- [x] Anadir vistas filtradas: publica, jugador, espectador e interna/debug.
- [x] Anadir evaluador de manos Texas Hold'em.
- [x] Cubrir con tests: deck unico, shuffle determinista, evaluador, blinds heads-up, orden preflop, fold, check/check, bet/call, all-in, showdown, conservacion de fichas, privacidad y rebuild.
- [x] Confirmar que `packages/poker-engine/src` no usa `Math.random()`, `Date.now()`, NestJS, DB, Redis ni WebSocket.
- [x] Completar tests de split pot.
- [x] Completar tests de raises invalidos y min-raise.
- [x] Completar estructura base de side pots heads-up.
- [x] Exigir `expectedSeq` e `idempotencyKey` en comandos de accion del motor.
- [x] Reiniciar `seq` por mano y rechazar eventos de otro `handId`.
- [x] Modelar burn cards como eventos internos reproducibles.

## Pendiente inmediato

- [ ] Hacer el primer commit del estado base y Fase 1 inicial.
- [ ] Preparar el siguiente bloque: schemas DB/Drizzle cuando cerremos Fase 1.

## Fuera de alcance por ahora

- [ ] 6-max completo.
- [ ] Solver GTO.
- [ ] Torneos.
- [ ] Sit & Go.
- [ ] Chat complejo.
- [ ] Leaderboards con premios.
- [ ] Microservicios.
- [ ] Kubernetes.
- [ ] Multi-region.

## Regla para seguir trabajando

Antes de avanzar a UI o backend complejo, el motor debe quedar probado. La prioridad de la siguiente fase es correccion, privacidad y reproducibilidad del estado de juego.
