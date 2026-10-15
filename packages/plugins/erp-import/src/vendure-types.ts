// Type-only redeclaration; TS module augmentation merges it with the owner's declaration
// Registration stays in vendure-config.ts; this declaration is read-only.
declare module '@vendure/core' {
    interface CustomGlobalSettingsFields {
        organizationSplitEnabled?: boolean;
    }
}

export {};
