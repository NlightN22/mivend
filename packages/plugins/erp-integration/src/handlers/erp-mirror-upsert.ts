import type { DeepPartial, ObjectLiteral, Repository } from 'typeorm';

export function optionalText(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

// Lists are stored exactly as sent (no cleaning); an absent list is an empty one.
export function listJson(value: unknown): string {
    return JSON.stringify(Array.isArray(value) ? value : []);
}

// proto3 omits false bools, so an absent isActive means inactive.
export function activityFlags(payload: Record<string, unknown>): {
    isActive: boolean;
    isDeleted: boolean;
} {
    const isDeleted = payload.isDeleted === true;
    return { isActive: payload.isActive === true && !isDeleted, isDeleted };
}

// A tombstone (flags.isDeleted) only flips the flags of a known row; a named event is full state.
export async function upsertErpMirror<T extends ObjectLiteral & { erpId: string }>(
    repo: Repository<T>,
    erpId: string,
    fields: DeepPartial<T>,
    flags: DeepPartial<T> & { isDeleted: boolean },
): Promise<void> {
    const existing = await repo.findOne({ where: { erpId } as never });
    if (!existing) {
        await repo.save(repo.create({ erpId, ...fields, ...flags } as DeepPartial<T>));
        return;
    }
    const base = flags.isDeleted ? existing : { ...existing, ...fields };
    await repo.save({ ...base, ...flags } as DeepPartial<T>);
}
