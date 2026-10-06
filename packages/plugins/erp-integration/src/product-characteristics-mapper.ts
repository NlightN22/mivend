// Pure mapping of ProductChanged's three CharacteristicValue maps (attributes, specifications,
// technicalRequirements) into flat rows for the ProductCharacteristic entity — issue #116.
//
// proto3's canonical JSON mapping omits an empty map field entirely (same zero-value-omission
// discipline as isActive/Tier-1 fields elsewhere in this plugin) — an absent key means "no rows
// for that group," never an explicit empty object. Field names below (raw/normalized/
// structuredJson) are confirmed against the actual installed @nlightn22/event-contracts@0.14.0's
// real toJson() output, not assumed from the .d.ts alone.
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
