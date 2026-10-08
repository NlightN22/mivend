export interface SelectableContract {
    erpId: string;
    counterpartyId: string;
    organizationId: string;
    isActive: boolean;
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

// The contract an order is registered under: the one already chosen if it is still valid, else the
// counterparty's main contract. null means the order cannot be registered in the ERP.
export function chooseOrderContract<T extends SelectableContract>(
    counterpartyId: string,
    selected: T | null | undefined,
    main: T | null | undefined,
): T | null {
    if (isSelectableContract(selected, counterpartyId)) return selected;
    if (isSelectableContract(main, counterpartyId)) return main;
    return null;
}
