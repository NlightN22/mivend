// A type alias, not an interface: it must stay assignable to JSON finding facts.
export type OrganizationRef = { id: string; name: string | null };
export type OrganizationBreakdown = OrganizationRef & { stock: number; hasContract: boolean };

// Everything a provider needs about one order, resolved by ERP ids so the rules stay pure.
export interface OrderCheckData {
    // product ERP id -> organizations of its storage locations at the order warehouse
    storageOrganizations: Map<string, string[]>;
    // organizations of the buyer's own active customer contracts
    contractOrganizations: Set<string>;
    // product ERP id -> organization ERP id -> summed stock (negatives included)
    stockByProduct: Map<string, Map<string, number>>;
    organizationNames: Map<string, string>;
}

export function organizationRef(id: string, data: OrderCheckData): OrganizationRef {
    return { id, name: data.organizationNames.get(id) ?? null };
}

export function stockOf(
    data: OrderCheckData,
    productErpId: string,
    organizationId: string,
): number {
    return data.stockByProduct.get(productErpId)?.get(organizationId) ?? 0;
}

export function organizationBreakdown(
    productErpId: string,
    storage: string[],
    data: OrderCheckData,
): OrganizationBreakdown[] {
    return [...storage].sort().map(id => ({
        ...organizationRef(id, data),
        stock: stockOf(data, productErpId, id),
        hasContract: data.contractOrganizations.has(id),
    }));
}

export interface LineOrganization {
    productErpId: string;
    organizationId: string;
    storage: string[];
}

// Null is "unknown, not flagged": no product, no line organization, no storage place at the warehouse,
// or the line organization is not among the storage organizations (a data inconsistency).
export function lineOrganization(
    line: { productErpId: string | null; organizationErpId: string | null },
    data: OrderCheckData,
): LineOrganization | null {
    const { productErpId, organizationErpId } = line;
    if (!productErpId || !organizationErpId) return null;
    const storage = data.storageOrganizations.get(productErpId);
    if (!storage || !storage.includes(organizationErpId)) return null;
    return { productErpId, organizationId: organizationErpId, storage };
}
