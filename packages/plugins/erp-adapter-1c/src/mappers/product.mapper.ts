import type { ErpChangeSet } from '@mivend/plugin-sync';
import type { OnecProduct } from '../types';

export function mapProducts(products: OnecProduct[]): ErpChangeSet['events'] {
    return products.map(p => ({
        type: 'product.updated',
        payload: {
            productId: p.Ref_Key,
            name: p.Description,
            enabled: !p.ПометкаУдаления,
        },
    }));
}
