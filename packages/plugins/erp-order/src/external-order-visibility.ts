// Customer-facing visibility of external orders: only the owning counterparty's users.
export const EXTERNAL_ORDER_OWNER_CLAUSE =
    '("order"."customFieldsIsexternal" = true AND "order"."customFieldsCounterpartyid" = :counterpartyId)';
