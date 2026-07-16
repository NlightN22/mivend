import { EventBus, Logger } from '@vendure/core';
import type { VendureEvent } from '@vendure/core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventCtor<E extends VendureEvent> = new (...args: any[]) => E;

// Backend-only (imports @vendure/core) — a Vite frontend must never import this file. Wraps
// `eventBus.ofType(EventClass).subscribe(...)` so a fire-and-forget async handler's rejection
// is always logged, never silently swallowed. `EventBus.publish()` does not await non-blocking
// subscribers (`eventStream.next(event)` is synchronous; only handlers registered through a
// separate blocking-handler mechanism, unused anywhere in this codebase, are awaited) — an
// uncaught rejection in a plain `.subscribe(event => { void handler(event); })` is otherwise
// completely invisible: no caller ever sees it, nothing fails loudly, nothing logs it.
//
// This is exactly how a real bug stayed hidden through multiple design/implementation sessions
// (see docs/ai/PROJECT_CONTEXT.md, 2026-07-15 — `ReservationService.setOrderReservationState`
// threw on every call and nothing surfaced it). Audited after that incident: `documents.plugin.ts`
// and `erp-order.plugin.ts` had the same gap (no crash risk found there, but the same silent-
// swallow exposure); `plugin-sync`'s `registerOutboxProducer` also lacked this. All four now use
// this helper — see `eslint.config.js`'s `no-restricted-syntax` rule, which flags any new
// `eventBus.ofType(...).subscribe(...)` call that isn't routed through it.
export function subscribeAndLog<E extends VendureEvent>(
    eventBus: EventBus,
    EventClass: EventCtor<E>,
    handler: (event: E) => Promise<void>,
    loggerCtx: string,
): void {
    // Returns the handler's promise (not `void`-discarded) so tests that capture the registered
    // subscribe callback can `await` it directly and assert on the completed work — RxJS itself
    // ignores the return value, so this changes nothing about runtime (fire-and-forget) behavior.
    eventBus.ofType(EventClass).subscribe(event =>
        handler(event).catch((err: unknown) => {
            Logger.error(`${EventClass.name} handler failed: ${String(err)}`, loggerCtx);
        }),
    );
}
