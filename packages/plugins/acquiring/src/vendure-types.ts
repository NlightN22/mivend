// customFields.organizationId is registered in vendure-config.ts; this re-declaration is type-only.
// Do not register the field here again: only the TS augmentation merges across plugins.
declare module '@vendure/core' {
    interface CustomProductVariantFields {
        organizationId?: number | null;
    }
    interface CustomOrderLineFields {
        organizationId?: number | null;
    }
}

export {};
