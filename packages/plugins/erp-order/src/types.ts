declare module '@vendure/core' {
    interface CustomOrderFields {
        // Immutable identity for idempotency/exchange, assigned at insert — see
        // docs/identifiers.md and apps/server/src/order-uuid.subscriber.ts.
        uuid?: string | null;
        erpOrderId?: string | null;
        erpStatus?: string | null;
        erpStatusAt?: Date | null;
        // Denormalized at placement time from the customer's preferred TradingPoint — see
        // ErpOrderService.onOrderPlaced and docs/access-control.md's branch-scope axis.
        tradingPointId?: string | null;
        deliveryAddress?: string | null;
        branchId?: string | null;
        // Denormalized from the order's own Fulfillments — see ErpOrderService's
        // onFulfillmentStateChanged and vendure-config.ts's doc comment on this field.
        latestFulfillmentState?: string | null;
        // Denormalized at placement time — see ErpOrderService.onOrderPlaced.
        placedByAdministratorId?: string | null;
        // Staff-facing informational only; no reservation or order-state decision reads these fields.
        // proto3 optional vs plain field semantics: see vendure-config.ts customFields docs.
        erpRegistrationDocumentNumber?: string | null;
        erpRegistrationStatus?: string | null;
        // Kept separate from erpRegistrationStatus: the two event streams arrive at different times
        // with no guaranteed relationship, so their values must not be merged or inferred from each other.
        erpOrderStatus?: string | null;
        // OrderChanged.contract_id (issue #110) — a flat GUID ref to an ERP contract, real optional
        // presence. Purely informational until a Contract entity exists (#50/#105).
        erpContractId?: string | null;
        // Contract.erpId the order is registered under (#205), see vendure-config.ts.
        selectedContractId?: string | null;
        // ERP's BusinessRejectionReason.code/message (issue #204); cleared when erpStatus
        // leaves REJECTED. See ReservationWriteOffSyncService.handleOrderRegistrationResult.
        erpRejectionReasonCode?: string | null;
        erpRejectionReasonText?: string | null;
        // Set once at creation: the order came from the ERP with no mivend orderUuid (#215).
        isExternal?: boolean;
        // Denormalized Counterparty.id; the visibility key for managers and the customer's own list.
        counterpartyId?: string | null;
        // Raw ERP counterparty id of an external order whose counterparty is not imported yet.
        pendingCounterpartyErpId?: string | null;
        // Set when an external order's event had lines for products not imported yet (skipped).
        externalLinesIncomplete?: boolean;
        // OrderChanged.paid_amount in minor units: a lower bound, null when the ERP did not compute it.
        erpPaidAmount?: number | null;
    }
}

export interface ErpStatusUpdatePayload {
    orderCode: string;
    status: string;
    erpOrderId?: string;
}

export interface OrderErpStatusInfo {
    orderCode: string;
    status: string | null;
    erpOrderId: string | null;
    updatedAt: Date | null;
}
