import { vi } from 'vitest';

// Stand-ins for the state and heal services: every compared mismatch reads as a stalled gap.
export function stalledStateFake(): { record: ReturnType<typeof vi.fn> } {
    return {
        record: vi.fn(
            async (
                _ctx: unknown,
                input: { aggregateType: string; ourCount: number; theirCount: number },
            ) => ({
                aggregateType: input.aggregateType,
                state: input.ourCount === input.theirCount ? 'in-sync' : 'stalled',
                seedingAlarm: false,
            }),
        ),
    };
}

export function idleHealFake(): { healIfDue: ReturnType<typeof vi.fn> } {
    return {
        healIfDue: vi.fn(async () => ({ outcome: 'skipped', detail: 'too-soon', alarm: false })),
    };
}
