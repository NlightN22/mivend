export interface SelectableContract {
    erpId: string;
    counterpartyId: string;
    organizationId: string;
    isActive: boolean;
    priceTypeId?: string;
    createdAt?: Date;
}

export function isSelectableContract(
    contract: SelectableContract | null | undefined,
    counterpartyId: string,
): contract is SelectableContract {
    return (
        !!contract &&
        contract.isActive &&
        contract.counterpartyId === counterpartyId &&
        contract.organizationId.length > 0
    );
}

// Order: the stored selection if still valid, else the main contract, else another active contract
// of the counterparty (same price type first, then newest, then lowest erpId), else null (block).
export function chooseOrderContract<T extends SelectableContract>(
    counterpartyId: string,
    selected: T | null | undefined,
    main: T | null | undefined,
    candidates: readonly T[] = [],
    preferredPriceTypeId?: string | null,
): T | null {
    if (isSelectableContract(selected, counterpartyId)) return selected;
    if (isSelectableContract(main, counterpartyId)) return main;
    const matches = (c: T): boolean =>
        !!preferredPriceTypeId && c.priceTypeId === preferredPriceTypeId;
    const ranked = candidates
        .filter(c => isSelectableContract(c, counterpartyId))
        .sort(
            (a, b) =>
                Number(matches(b)) - Number(matches(a)) ||
                (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) ||
                a.erpId.localeCompare(b.erpId),
        );
    return ranked[0] ?? null;
}
