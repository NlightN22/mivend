// Re-declares ProductVariant.customFields.organizationId (owned/registered by
// apps/server/src/vendure-config.ts) for read-only use here — TS module augmentation merges
// cleanly across plugins, see AGENTS.md's "A ProductVariant/Order customField owned by one
// plugin can be safely re-declared..." note.
declare module '@vendure/core' {
    interface CustomProductVariantFields {
        organizationId?: number | null;
    }
}

export {};
