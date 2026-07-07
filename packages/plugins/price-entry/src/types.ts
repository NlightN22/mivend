import '@vendure/core';

declare module '@vendure/core' {
    interface CustomProductVariantFields {
        weight?: number | null;
    }
}
