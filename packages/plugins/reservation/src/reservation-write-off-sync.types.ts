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
    // ERP productIds the caller could not resolve; reported as a reconciliation issue.
    unresolvedProductIds: string[];
    // Informational for staff, never used in a release decision; status '' means absent.
    documentNumber: string | null;
    status: string;
    // BusinessRejectionReason (#204), non-null only when `rejected`.
    rejectionReasonCode: string | null;
    rejectionReasonText: string | null;
}

// erp.order.events.v1 `changed`: the order's repeated current-state view (#110/#72). It reuses the
// idempotent release matching of the registration result; there is no `rejected` on this stream.
export interface OrderChangedInput {
    // Absent for orders not registered through our integration; preferred over orderEntityId.
    orderUuid: string | null;
    orderEntityId: string;
    // Plain proto3 string: '' means absent.
    status: string;
    reservedLines: Array<{ productVariantId: string; reservedQuantity: number }>;
    contractId: string | null;
    // Sent on every emission; null or '' never clears a known number.
    documentNumber?: string | null;
    // mivend's own status derived from the stream's facts; null when none could be derived.
    derivedStatus: string | null;
    // ERP time of the status change; null falls back to now.
    derivedStatusAt?: Date | null;
    // Minor units; null or absent never overwrites.
    paidAmountMinor?: number | null;
    // Null when not sent, never clears a known value.
    reserveUntil?: Date | null;
}
