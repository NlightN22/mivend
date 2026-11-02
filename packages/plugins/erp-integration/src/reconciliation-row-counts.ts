// Table and condition per type: the stored rows Integration Service counts as active (not deleted).
// Constants only, never user input.
export const ROW_COUNT_RULES = {
    position: { table: 'erp_position', condition: '"isActive" = true' },
    counterparty: { table: 'counterparty', condition: '"isActive" = true' },
    // Product-referenced placeholders carry no name; upstream has no inactive notion for it.
    manufacturer: { table: 'manufacturer', condition: 'name IS NOT NULL' },
    region: { table: 'region_record', condition: '"isActive" = true' },
    legalForm: { table: 'legal_form_record', condition: '"isActive" = true' },
    bank: { table: 'bank_record', condition: '"isActive" = true' },
    bankAccount: { table: 'bank_account_record', condition: '"isActive" = true' },
    // A photo whose product has not arrived is parked, so it is not stored yet.
    productPhoto: { table: 'product_photo', condition: '"isDeleted" = false' },
    // Unevaluated setups are stored inactive but still count upstream; only a cancelled one does not.
    discountSetup: {
        table: 'discount_setup',
        condition: `"inactiveReason" IS DISTINCT FROM 'cancelled'`,
    },
    grantedDiscount: { table: 'granted_discount', condition: '"isDeleted" = false' },
    // Rules with an unevaluable filter stay active=true (inactiveReason set); only a deactivated one is false.
    retroBonusSetup: { table: 'retro_bonus_rule', condition: 'active = true' },
    grantedRetroBonus: { table: 'granted_retro_bonus', condition: '"isDeleted" = false' },
    settlementBalance: { table: 'settlement_balance', condition: '"isDeleted" = false' },
    settlementDocumentType: { table: 'settlement_document_type', condition: '"isDeleted" = false' },
    // Statuses owned by mivend itself are never sent upstream.
    orderStatus: {
        table: 'order_status_reference',
        condition: `source = 'erp' AND "isDeleted" = false`,
    },
} as const;
