// Re-declares GlobalSettings.customFields.organizationSplitEnabled (owned/registered by
// apps/server/src/vendure-config.ts) for read-only use here — TS module augmentation merges
// cleanly across plugins, see AGENTS.md's "A ProductVariant/Order customField owned by one
// plugin can be safely re-declared..." note (same principle applies to any customFields target).
declare module '@vendure/core' {
    interface CustomGlobalSettingsFields {
        organizationSplitEnabled?: boolean;
    }
}

export {};
