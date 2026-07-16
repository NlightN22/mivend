// Declares GlobalSettings.customFields.organizationSplitEnabled, registered by this app's own
// vendure-config.ts (customFields.GlobalSettings) — the type declaration lives alongside it
// since no plugin owns this customField. See docs/payments.md "Organizations".
declare module '@vendure/core' {
    interface CustomGlobalSettingsFields {
        organizationSplitEnabled?: boolean;
    }
}

export {};
