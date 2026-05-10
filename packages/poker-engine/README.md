# packages/poker-engine

Motor puro de Texas Hold'em heads-up.

Restricciones:

- Sin NestJS.
- Sin DB.
- Sin Redis.
- Sin WebSocket.
- Sin UI.
- Sin `Math.random()`.
- Sin `Date.now()`.

Debe funcionar con comandos, eventos de dominio y reducer determinista.

## Estado actual

- Modelo de dominio heads-up inicial.
- `decide()` para convertir comandos en eventos.
- `applyEvent()` para reconstruir estado.
- Deck unico de 52 cartas.
- Shuffle determinista con RNG inyectado.
- Blinds heads-up.
- Acciones: fold, check, call, bet, raise y all-in.
- Avance preflop/flop/turn/river.
- Showdown con evaluador Texas Hold'em.
- Rebuild desde eventos.
- `stateHash`.
- Vistas filtradas para publico, jugador, espectador e interna/debug.

Pendiente antes de cerrar Fase 1 completa:

- Tests de split pot.
- Tests de raises invalidos y min-raise.
- Side pots estructurales.
- Decidir si se modelan burn cards desde el inicio.
