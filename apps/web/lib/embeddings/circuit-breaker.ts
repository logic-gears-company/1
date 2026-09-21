/**
 * Circuit breaker mínimo para el proveedor de embeddings.
 *
 * Estados:
 *   closed    → todo normal, se permiten llamadas.
 *   open      → demasiados fallos seguidos: se rechaza SIN llamar durante
 *               `cooldownMs`. Protege la cuota y evita colgar cada petición
 *               del chat esperando timeouts de 15 s.
 *   half-open → pasado el enfriamiento, se deja pasar UNA llamada de prueba.
 *               Si funciona → closed; si falla → open otra vez.
 *
 * Es por-proceso (no compartido entre instancias): cada instancia aprende
 * por sí misma. Aceptable aquí; el tope real de gasto lo da el presupuesto
 * en Postgres, que sí es compartido.
 */

import { EmbeddingError } from "./types";

export interface CircuitBreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
  /** Inyectable para pruebas. */
  now?: () => number;
}

export type CircuitState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private probeInFlight = false;
  private readonly now: () => number;

  constructor(private readonly opts: CircuitBreakerOptions) {
    this.now = opts.now ?? Date.now;
  }

  state(): CircuitState {
    if (this.openedAt === null) return "closed";
    return this.now() - this.openedAt >= this.opts.cooldownMs ? "half-open" : "open";
  }

  /** Lanza CIRCUIT_OPEN si no se debe intentar. En half-open deja pasar una sola prueba. */
  assertClosed(): void {
    const s = this.state();
    if (s === "closed") return;

    if (s === "half-open" && !this.probeInFlight) {
      this.probeInFlight = true; // esta petición es la prueba
      return;
    }

    const remainingMs =
      this.openedAt === null ? 0 : Math.max(0, this.opts.cooldownMs - (this.now() - this.openedAt));
    throw new EmbeddingError(
      "CIRCUIT_OPEN",
      "El proveedor de embeddings está temporalmente en pausa tras fallos consecutivos.",
      { retryable: true, retryAfterSec: Math.ceil(remainingMs / 1000) }
    );
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
    this.probeInFlight = false;
  }

  recordFailure(): void {
    this.probeInFlight = false;
    this.failures++;
    if (this.failures >= this.opts.failureThreshold || this.state() === "half-open") {
      this.openedAt = this.now();
    }
  }
}
