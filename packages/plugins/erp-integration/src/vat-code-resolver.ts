// Tax classification must never block product import: a wrong TaxCategory only skews internal
// tax reporting, since ERP prices are tax-inclusive. Unknown codes are auto-created by erpVatCode.

export type VatFlagReason = 'unset' | 'legacy';

export interface VatCodeFlag {
    reason: VatFlagReason;
    detail: string;
}

export interface VatCodeResolved {
    kind: 'resolved';
    taxCategoryId: string;
    flag?: VatCodeFlag;
}

// Shared key: VatRateStreamHandler upserts the TaxRate under this same erpVatCode,
// so it must always be populated, falling back to the raw ERP code for unknown members.
export interface VatCodeAutoCreate {
    kind: 'auto-create';
    erpVatCode: string;
    rawCode: string;
}

// `unset`/`legacy` need the default TaxCategory; a fresh contour may not have one yet (#144).
export interface VatCodeMissingDefault {
    kind: 'missing-default';
    reason: VatFlagReason;
}

export type VatCodeResolution = VatCodeResolved | VatCodeAutoCreate | VatCodeMissingDefault;

// The ERP's raw enum values (Cyrillic) mapped to this project's stable `TaxCategory.customFields.erpVatCode`
// values (Latin) — kept separate so the ERP's own enum spelling never leaks into stored config.
const RAW_CODE_TO_ERP_VAT_CODE: Readonly<Record<string, string>> = {
    НДС20: 'NDS20',
    НДС10: 'NDS10',
    БезНДС: 'BezNDS',
};

// Legacy НДС18 predates the 2019 VAT change: it means stale ERP data, not a rate to support.
// Flagged separately from unknown codes so it routes to 'review in ERP', not 'review mapping'.
const LEGACY_RAW_CODE = 'НДС18';

// Both streams must derive the same TaxCategory.customFields.erpVatCode key, so this is shared.
// Unknown enum members fall back to the raw code and are auto-registered, never dropped.
export function toErpVatCode(rawCode: string): string {
    return RAW_CODE_TO_ERP_VAT_CODE[rawCode] ?? rawCode;
}

export function resolveVatCode(
    rawCode: string,
    taxCategoryIdByErpVatCode: ReadonlyMap<string, string>,
    defaultTaxCategoryId: string | undefined,
): VatCodeResolution {
    if (rawCode === '') {
        if (!defaultTaxCategoryId) return { kind: 'missing-default', reason: 'unset' };
        return {
            kind: 'resolved',
            taxCategoryId: defaultTaxCategoryId,
            flag: { reason: 'unset', detail: 'VAT rate unset on product, review' },
        };
    }

    if (rawCode === LEGACY_RAW_CODE) {
        if (!defaultTaxCategoryId) return { kind: 'missing-default', reason: 'legacy' };
        return {
            kind: 'resolved',
            taxCategoryId: defaultTaxCategoryId,
            flag: {
                reason: 'legacy',
                detail: `Legacy VAT rate '${rawCode}' on product — data likely stale (deleted/superseded/not resynced), review in the ERP`,
            },
        };
    }

    const erpVatCode = toErpVatCode(rawCode);

    const taxCategoryId = taxCategoryIdByErpVatCode.get(erpVatCode);
    if (taxCategoryId) {
        return { kind: 'resolved', taxCategoryId };
    }

    return { kind: 'auto-create', erpVatCode, rawCode };
}
