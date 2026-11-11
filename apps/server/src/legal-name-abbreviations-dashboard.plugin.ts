import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Logic-free: exists only so @vendure/dashboard loads src/dashboard/legal-name-abbreviations/index.ts.
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/legal-name-abbreviations/index.ts',
    compatibility: '^3.0.0',
})
export class LegalNameAbbreviationsDashboardPlugin {}
