export const CHARACTERISTIC_FACET_PREFIX = 'characteristic:';

export function characteristicFacetCode(key: string): string {
    return `${CHARACTERISTIC_FACET_PREFIX}${key}`;
}

export function characteristicKeyFromFacetCode(code: string): string | undefined {
    return code.startsWith(CHARACTERISTIC_FACET_PREFIX)
        ? code.slice(CHARACTERISTIC_FACET_PREFIX.length)
        : undefined;
}
