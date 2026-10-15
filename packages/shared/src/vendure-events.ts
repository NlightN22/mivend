import { EventBus, Logger } from '@vendure/core';
import type { VendureEvent } from '@vendure/core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventCtor<E extends VendureEvent> = new (...args: any[]) => E;

// Backend-only: imports @vendure/core, so Vite frontend code must never import this file.
// EventBus.publish() doesn't await non-blocking subscribers, so a rejected handler is silent.
export function subscribeAndLog<E extends VendureEvent>(
    eventBus: EventBus,
    EventClass: EventCtor<E>,
    handler: (event: E) => Promise<void>,
    loggerCtx: string,
): void {
    // Returned so tests capturing the subscribe callback can await the completed work.
    // RxJS ignores the return value, so runtime stays fire-and-forget.
    eventBus.ofType(EventClass).subscribe(event =>
        handler(event).catch((err: unknown) => {
            Logger.error(
                `${EventClass.name} handler failed: ${String(err)}`,
                loggerCtx,
                err instanceof Error ? err.stack : undefined,
            );
        }),
    );
}
