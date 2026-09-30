declare module '@vendure/core' {
    interface CustomProductVariantFields {
        multiplicity?: number | null;
        // Owned by @mivend/plugin-erp-integration — redeclared per tsc -b project boundaries.
        unitRatioToBase?: number | null;
    }
    interface CustomOrderFields {
        // Owned by @mivend/plugin-erp-order/plugin-reservation — redeclared per project boundaries.
        branchId?: string | null;
    }
}

export {};
