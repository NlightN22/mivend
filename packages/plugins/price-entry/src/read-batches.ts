export interface ReadLimits {
    batchSize?: number;
    ceiling?: number;
}

export const DEFAULT_LIST_TAKE = 50;
export const MAX_LIST_TAKE = 200;

export interface ListOptions {
    take?: number | null;
    skip?: number | null;
}

export function pageArgs(options?: ListOptions): { take: number; skip: number } {
    return {
        take: Math.min(Math.max(options?.take ?? DEFAULT_LIST_TAKE, 1), MAX_LIST_TAKE),
        skip: Math.max(options?.skip ?? 0, 0),
    };
}
