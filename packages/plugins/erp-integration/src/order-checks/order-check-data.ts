// A type alias, not an interface: it must stay assignable to JSON finding facts.
export type OrganizationRef = { id: string; name: string | null };

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

export function organizationRefs(ids: Iterable<string>, data: OrderCheckData): OrganizationRef[] {
    return [...ids].sort().map(id => ({ id, name: data.organizationNames.get(id) ?? null }));
}

export function sumStock(stock: Map<string, number> | undefined, organizations: string[]): number {
    return organizations.reduce((total, id) => total + (stock?.get(id) ?? 0), 0);
}
