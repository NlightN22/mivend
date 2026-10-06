import { PluginCommonModule, VendurePlugin } from '@vendure/core';

@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/product-photos/index.ts',
    compatibility: '^3.0.0',
})
export class ProductPhotosDashboardPlugin {}
