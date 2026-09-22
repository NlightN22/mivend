// Pure resolution of the ERP's per-product `СтавкаНДС` enum string to a TaxCategory to assign, plus an
// optional non-blocking review flag. Issue #79: tax classification must never block product
// import (ERP sends gross/tax-inclusive prices, so a wrong/missing TaxCategory only skews internal
// tax reporting, not what the customer pays) — every branch below falls back to the configured
// default TaxCategory and, where the input looks worth a human's attention, attaches a flag for
// ProductTaxCodeFlagService to persist. No I/O here; the caller resolves the raw code to
// TaxCategory ids via TaxCategoryService beforehand.

export type VatFlagReason = 'unset' | 'legacy' | 'unrecognized' | 'category-not-configured';

export interface VatCodeFlag {
    reason: VatFlagReason;
    detail: string;
}

export interface VatCodeResolution {
    taxCategoryId: string;
    flag?: VatCodeFlag;
}

// The ERP's raw enum values (Cyrillic) mapped to this project's stable `TaxCategory.customFields.erpVatCode`
// values (Latin) — kept separate so the ERP's own enum spelling never leaks into stored config.
const RAW_CODE_TO_ERP_VAT_CODE: Readonly<Record<string, string>> = {
    НДС20: 'NDS20',
    НДС10: 'NDS10',
    БезНДС: 'BezNDS',
};

// НДС18 predates the 2019 20% VAT rate change — per the developer, seeing it on a product today
// almost certainly means stale/unsynced ERP data, not a rate mivend needs to support going
// forward. Flagged distinctly from a fully unrecognized code so it routes to "review in the ERP", not
// "review the mapping".
const LEGACY_RAW_CODE = 'НДС18';

export function resolveVatCode(
    rawCode: string,
    taxCategoryIdByErpVatCode: ReadonlyMap<string, string>,
    defaultTaxCategoryId: string,
): VatCodeResolution {
    if (rawCode === '') {
        return {
            taxCategoryId: defaultTaxCategoryId,
            flag: { reason: 'unset', detail: 'VAT rate unset on product, review' },
        };
    }

    if (rawCode === LEGACY_RAW_CODE) {
        return {
            taxCategoryId: defaultTaxCategoryId,
            flag: {
                reason: 'legacy',
                detail: `Legacy VAT rate '${rawCode}' on product — data likely stale (deleted/superseded/not resynced), review in the ERP`,
            },
        };
    }

    const erpVatCode = RAW_CODE_TO_ERP_VAT_CODE[rawCode];
    if (!erpVatCode) {
        return {
            taxCategoryId: defaultTaxCategoryId,
            flag: {
                reason: 'unrecognized',
                detail: `Unrecognized VAT code '${rawCode}' on product, review mapping`,
            },
        };
    }

    const taxCategoryId = taxCategoryIdByErpVatCode.get(erpVatCode);
    if (!taxCategoryId) {
        return {
            taxCategoryId: defaultTaxCategoryId,
            flag: {
                reason: 'category-not-configured',
                detail: `TaxCategory for VAT code '${erpVatCode}' not configured yet, review setup`,
            },
        };
    }

    return { taxCategoryId };
}
