// A realization stream adds its kind here and a source in order-line-changes.service; the UI renders by kind.
export const LINE_CHANGE_KINDS = ['realization', 'realization-correction', 'return'] as const;

export type LineChangeKind = (typeof LINE_CHANGE_KINDS)[number];

export type LineChangeAudience = 'customer' | 'staff';

export interface LineChangeSource {
    kind: LineChangeKind;
    productErpId: string;
    // Signed, in the order line's unit (base units).
    quantity: number;
    amountMinor: number;
    reflectedInAccounting: boolean;
    documentNumber: string;
    documentDate: Date | null;
}

export interface LineChangeEvent {
    kind: LineChangeKind;
    titleKey: string;
    subtitleKey: string;
    quantity: number;
    remainder: number;
    documentNumber: string;
    documentDate: Date | null;
}

export interface OrderLineChange {
    orderLineId: number;
    ordered: number;
    actual: number;
    events: LineChangeEvent[];
}

export interface OrderChanges {
    lines: OrderLineChange[];
    // Net money effect of the staff-visible sources, minor units; the customer never receives it.
    amountDeltaMinor: number;
}
