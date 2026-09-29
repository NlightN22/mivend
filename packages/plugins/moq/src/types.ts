declare module '@vendure/core' {
    interface CustomProductVariantFields {
        multiplicity?: number | null;
        // Owned by @mivend/plugin-erp-integration (see its types.ts) — declared again here since
        // this is a separate TypeScript project (tsc -b project references); the interceptor only
        // reads it, never writes it.
        unitRatioToBase?: number | null;
    }
    interface CustomOrderFields {
        // Owned by @mivend/plugin-erp-order/plugin-reservation (see their types.ts) — declared
        // again here for the same project-boundary reason; the interceptor only reads it.
        branchId?: string | null;
    }
}

export {};
