import { i18n } from '../i18n';

export function te(key: string): boolean {
    return i18n.global.te(key);
}

export function tr(key: string, named?: Record<string, unknown>, plural?: number): string {
    if (plural !== undefined) return i18n.global.t(key, named ?? {}, plural);
    return named ? i18n.global.t(key, named) : i18n.global.t(key);
}

// Reads resolve the label on access, so module-level maps follow a language switch.
export function lazyLabels(prefix: string, keys: readonly string[]): Record<string, string> {
    const labels: Record<string, string> = {};
    for (const key of keys) {
        Object.defineProperty(labels, key, { enumerable: true, get: () => tr(`${prefix}.${key}`) });
    }
    return labels;
}

export function lazyOptions<V extends string>(
    prefix: string,
    values: readonly V[],
): { value: V; readonly label: string }[] {
    return values.map(value => ({
        value,
        get label(): string {
            return value ? tr(`${prefix}.${value}`) : tr(`${prefix}.any`);
        },
    }));
}
