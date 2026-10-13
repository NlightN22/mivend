export interface SettlementVisibility {
    contractKinds: string[];
    typeCategories: Map<string, string>;
}

const CATEGORY_OTHER = 'other';

function splitList(raw: unknown): string[] {
    return typeof raw === 'string'
        ? raw
              .split(/[,\n]/)
              .map(s => s.trim())
              .filter(Boolean)
        : [];
}

// Setting "documentType=category" pairs; an empty setting means no restriction (every type is
// shown under the "other" category), a non-empty one is a whitelist.
export function parseTypeCategories(raw: unknown): Map<string, string> {
    const map = new Map<string, string>();
    for (const pair of splitList(raw)) {
        const [type, category] = pair.split('=').map(s => s.trim());
        if (type) map.set(type, category || CATEGORY_OTHER);
    }
    return map;
}

export function parseVisibility(settings: {
    settlementCustomerContractKinds?: unknown;
    settlementTypeCategories?: unknown;
}): SettlementVisibility {
    return {
        contractKinds: splitList(settings.settlementCustomerContractKinds),
        typeCategories: parseTypeCategories(settings.settlementTypeCategories),
    };
}

export function categoryOf(visibility: SettlementVisibility, documentType: string): string {
    return visibility.typeCategories.get(documentType) ?? CATEGORY_OTHER;
}
