// No plugin owns this customField, so its type is declared here rather than in a plugin.
// Registration is in vendure-config.ts (customFields.GlobalSettings).
declare module '@vendure/core' {
    interface CustomGlobalSettingsFields {
        organizationSplitEnabled?: boolean;
    }
}

export {};
