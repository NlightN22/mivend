export interface OrderRegistrationResultInput {
    // mivend's own order uuid echoed back by the ERP (mivend#207); preferred correlation key.
    orderUuid: string | null;
    // ERP-side order id, absent on a rejected result; last-resort correlation key.
    orderEntityId: string | null;
    // Original order.confirmed request id, kept for error/log context.
    requestEntityId: string | null;
    // Local Order id resolved from requestEntityId via integration_outbox (#204); preferred over orderEntityId.
    localOrderId: string | null;
    rejected: boolean;
    // Already resolved from the ERP productId to a ProductVariant id by the caller.
    reservedLines: Array<{ productVariantId: string; reservedQuantity: number }>;
    // True when an event line was dropped before resolution; the stored reserve set is then only upserted.
    linesDiscarded?: boolean;
    // ERP productIds the caller could not resolve; reported as a reconciliation issue.
    unresolvedProductIds: string[];
    // Informational for staff, never used in a release decision; status '' means absent.
    documentNumber: string | null;
    status: string;
    // BusinessRejectionReason (#204), non-null only when `rejected`.
    rejectionReasonCode: string | null;
    rejectionReasonText: string | null;
}

// erp.order.events.v1 `changed`: the order document's own data (#110/#72). Reserve, derived status and
// paid amount come from erp.order-state.events.v1 (OrderStateInput).
export interface OrderChangedInput {
    // Absent for orders not registered through our integration; preferred over orderEntityId.
    orderUuid: string | null;
    orderEntityId: string;
    // Plain proto3 string: '' means absent.
    status: string;
    contractId: string | null;
    // Sent on every emission; null or '' never clears a known number.
    documentNumber?: string | null;
    // The order document's accounting flags as received; an absent one never clears a stored value.
    erpFacts?: Partial<Record<'erpAccounting', string>>;
    // Null when not sent, never clears a known value.
    reserveUntil?: Date | null;
}

// erp.order-state.events.v1 `changed`: values derived from the order's linked documents and register sets.
export interface OrderStateInput {
    orderEntityId: string;
    reservedLines: Array<{ productVariantId: string; reservedQuantity: number }>;
    // True when an event line was dropped before resolution; the stored reserve set is then only upserted.
    linesDiscarded?: boolean;
    // mivend's own status derived from the stream's facts; null when none could be derived.
    derivedStatus: string | null;
    // ERP time of the status change; null falls back to now.
    derivedStatusAt?: Date | null;
    // Minor units; null or absent never overwrites.
    paidAmountMinor?: number | null;
    // Accounting flags and shipped-in-settlements as received; an absent one never clears a stored value.
    erpFacts?: Partial<
        Record<'erpAccounting' | 'erpLinkedDocuments' | 'erpShippedInSettlements', string>
    >;
}
