# Reglas del proyecto Neon Poker

Estas reglas son obligatorias para cualquier cambio en este repositorio.

## Arquitectura

- Usar monorepo con `apps/` y `packages/`.
- Mantener el backend como monolito modular al inicio.
- No crear microservicios todavia.
- El servidor es siempre autoritativo.
- El cliente solo renderiza, anima y envia intenciones.
- PostgreSQL es la fuente de verdad.
- Redis solo puede usarse para presencia, cache, rate limiting, coordinacion o estado efimero.

## Motor de poker

- El motor vive en `packages/poker-engine`.
- Debe ser TypeScript puro.
- No puede importar NestJS, DB, Redis, WebSocket ni UI.
- No puede usar `Math.random()`.
- No puede usar `Date.now()`.
- Debe recibir RNG, reloj, ids y configuracion como dependencias inyectadas.
- Debe seguir el flujo `command -> domain events -> reducer/applyEvent`.
- Cada cambio de estado debe ser reproducible desde eventos.

## Privacidad y seguridad

- No implementar dinero real.
- No implementar pagos, depositos, retiradas, rake ni premios convertibles.
- No aceptar stacks, cartas, pots ni acciones legales calculadas por el cliente.
- Validar payloads no confiables con Zod.
- No filtrar cartas privadas en snapshots, eventos publicos, replayer ni logs.
- Las vistas deben estar filtradas por rol: publica, jugador, espectador e interna/debug.

## Eventos y sincronizacion

- Las manos se persisten como eventos append-only.
- Cada `hand_event` debe tener `handId`, `seq`, `eventType`, `payload`, `schemaVersion` y `stateHashAfter`.
- Las acciones de juego deben usar `idempotencyKey`.
- Las acciones de juego deben usar `expectedSeq`.
- En reconexion, enviar snapshot completo filtrado para el usuario.
- El TableActor debe ser single-writer por mesa.

## Tests minimos

- Unit tests del motor: deck unico, shuffle determinista, blinds heads-up, turn order, acciones legales, fold, check/call/bet/raise/all-in, showdown, pots, conservacion de fichas, vistas filtradas y rebuild desde eventos.
- Tests backend: join table, sit down, start hand, player action, rechazo fuera de turno, idempotencia, `expectedSeq`, persistencia y privacidad.
- Tests frontend: lobby, mesa desde snapshot, botones legales, sincronizacion y replayer.
- E2E: dos usuarios entran, se sientan, juegan una mano, abren hand history y reproducen la mano.

## Fuera de alcance inicial

- 6-max completo.
- Solver GTO.
- Torneos.
- Sit & Go.
- Chat complejo.
- Leaderboards con premios.
- Kubernetes.
- Multi-region.

## Cierre de cada tarea

Al terminar una tarea, reportar:

- Que cambio.
- Que comprobaciones se ejecutaron.
- Que queda pendiente.
- Si hay tests que no se pudieron ejecutar, explicar la causa.

