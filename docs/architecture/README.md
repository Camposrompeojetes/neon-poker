# Arquitectura

El PDF `arquitectura-software-codex.pdf` es la referencia inicial de arquitectura para Neon Poker.

Principios que deben sobrevivir a cualquier implementacion:

- Motor puro separado del backend y del frontend.
- Backend autoritativo.
- Cliente sin reglas reales de poker.
- Hand history append-only y reconstruible.
- Vistas filtradas para no exponer cartas privadas.
- PostgreSQL como fuente de verdad.
- Redis solo para estado temporal o coordinacion.
- MVP heads-up antes de 6-max, solver, torneos o microservicios.

