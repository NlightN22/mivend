// Must match every other declaration (apps/server, erp-import) exactly, or apps/server's tsc fails
// with TS2687/TS2717. Declared locally so this plugin builds standalone.
declare module '@vendure/core' {
    interface CustomGlobalSettingsFields {
        organizationSplitEnabled?: boolean;
    }
}

export const loggerCtx = 'OnlinePaymentPlugin';
