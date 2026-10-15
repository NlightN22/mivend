// Type-only augmentation: the field is registered in vendure-config.ts, do not register it here.
declare module '@vendure/core' {
    interface CustomProductVariantFields {
        organizationId?: number | null;
    }
}

export {};
