import { PluginCommonModule, VendurePlugin } from '@vendure/core';

import { CrossReferenceService } from './cross-reference.service';
import { ProductCrossReference } from './entities/product-cross-reference.entity';

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [ProductCrossReference],
    providers: [CrossReferenceService],
    exports: [CrossReferenceService],
    compatibility: '>0.0.0',
})
export class CrossReferencePlugin {}
