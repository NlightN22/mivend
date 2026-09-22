// Pure resolution of the ERP's per-product `СтавкаНДС` enum string to either an existing
// TaxCategory to assign, or an instruction to auto-create one. Issue #79/#141: tax classification
// must never block product import (ERP sends gross/tax-inclusive prices, so a wrong/missing
// TaxCategory only skews internal tax reporting, not what the customer pays).
//
// `unset` (empty code) and `legacy` (НДС18, predates the 2019 rate change — stale ERP data, not a
// rate to support) are genuinely different from an unmapped-but-real code: they fall back to the
// default TaxCategory and get a non-blocking review flag, same as before issue #141. Any other
// code — recognized-but-not-yet-configured, or never seen before — is no longer "unknown", it's
// auto-created on the spot (see product.handler.ts's resolveTaxCategoryId /
// TaxCategoryAutoCreateService), keyed by the same erpVatCode both this stream and
// VatRateStreamHandler use. No I/O here; the caller does the actual TaxCategory lookup/creation.

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

// erpVatCode is always populated (mapped Latin code for a known enum member, or the raw code
// itself for a never-seen-before one — see RAW_CODE_TO_ERP_VAT_CODE's fallback below) — it's the
// stable key the caller uses to find-or-create the TaxCategory and, later, VatRateStreamHandler
// uses to upsert its TaxRate.
export interface VatCodeAutoCreate {
    kind: 'auto-create';
    erpVatCode: string;
    rawCode: string;
}

export type VatCodeResolution = VatCodeResolved | VatCodeAutoCreate;

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

// Shared with VatRateStreamHandler (vat-rate.handler.ts) so both this stream and the reference-
// data stream derive the exact same TaxCategory.customFields.erpVatCode key from the ERP's raw
// enum member name — falls back to the raw code itself when it's not one of the known
// Cyrillic->Latin members (a never-seen-before code is auto-registered under its own name, not
// dropped — see this file's own doc comment and VatRateChangedSchema's doc comment for the same
// policy on the reference-data side).
export function toErpVatCode(rawCode: string): string {
    return RAW_CODE_TO_ERP_VAT_CODE[rawCode] ?? rawCode;
}

export function resolveVatCode(
    rawCode: string,
    taxCategoryIdByErpVatCode: ReadonlyMap<string, string>,
    defaultTaxCategoryId: string,
): VatCodeResolution {
    if (rawCode === '') {
        return {
            kind: 'resolved',
            taxCategoryId: defaultTaxCategoryId,
            flag: { reason: 'unset', detail: 'VAT rate unset on product, review' },
        };
    }

    if (rawCode === LEGACY_RAW_CODE) {
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
