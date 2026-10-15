// proto3 canonical JSON omits empty map fields: an absent key means no rows for that group,
// raw/normalized/structuredJson verified against event-contracts@0.14.0 toJson(), not the .d.ts.
import type { ProductCharacteristicGroup } from './entities/product-characteristic.entity';

export interface ProductCharacteristicRow {
    group: ProductCharacteristicGroup;
    key: string;
    rawValue: string | null;
    normalizedValue: string | null;
    structuredJson: string | null;
}

interface RawCharacteristicValue {
    raw?: unknown;
    normalized?: unknown;
    structuredJson?: unknown;
}

function isCharacteristicValue(value: unknown): value is RawCharacteristicValue {
    return typeof value === 'object' && value !== null;
}

function mapGroup(group: ProductCharacteristicGroup, map: unknown): ProductCharacteristicRow[] {
    if (typeof map !== 'object' || map === null || Array.isArray(map)) {
        return [];
    }
    return Object.entries(map as Record<string, unknown>)
        .filter((entry): entry is [string, RawCharacteristicValue] =>
            isCharacteristicValue(entry[1]),
        )
        .map(([key, value]) => ({
            group,
            key,
            rawValue: typeof value.raw === 'string' && value.raw !== '' ? value.raw : null,
            normalizedValue:
                Array.isArray(value.normalized) && value.normalized.length > 0
                    ? JSON.stringify(value.normalized)
                    : null,
            structuredJson:
                typeof value.structuredJson === 'string' && value.structuredJson !== ''
                    ? value.structuredJson
                    : null,
        }));
}

export function mapProductCharacteristics(
    payload: Record<string, unknown>,
): ProductCharacteristicRow[] {
    return [
        ...mapGroup('attribute', payload.attributes),
        ...mapGroup('specification', payload.specifications),
        ...mapGroup('technicalRequirement', payload.technicalRequirements),
    ];
}

// The manufacturer's name also arrives as an attribute; it is excluded from characteristics.
export const MANUFACTURER_NAME_ATTRIBUTE_KEY = 'Производитель';
