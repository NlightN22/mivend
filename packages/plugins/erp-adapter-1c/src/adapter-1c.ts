import type {
    ErpAdapter,
    ErpChangeSet,
    ErpOrderRef,
    InventoryDelta,
    Order,
} from '@mivend/plugin-sync';

import { Client1c } from './client-1c';
import { mapInventoryDelta } from './mappers/inventory.mapper';
import { mapOrderTo1c } from './mappers/order.mapper';
import { mapProducts } from './mappers/product.mapper';
import type { Adapter1cOptions, OnecChangeResponse, OnecProduct } from './types';

export class Adapter1c implements ErpAdapter {
    private readonly client: Client1c;

    constructor(options: Adapter1cOptions) {
        this.client = new Client1c(options);
    }

    async fetchChanges(since: Date): Promise<ErpChangeSet> {
        const filter = `Timestamp gt datetime'${since.toISOString()}'`;
        const res = await this.client.get<OnecChangeResponse<OnecProduct>>(
            'odata/standard.odata/Catalog_Номенклатура',
            { $filter: filter, $format: 'json' },
        );
        return {
            events: mapProducts(res.value),
            cursor: new Date(),
        };
    }

    async pushOrder(order: Order): Promise<ErpOrderRef> {
        const body = mapOrderTo1c(order);
        const res = await this.client.post<{ Ref_Key: string }>(
            'odata/standard.odata/Document_ЗаказКлиента',
            body,
        );
        return { erpOrderId: res.Ref_Key };
    }

    async pushInventoryDelta(delta: InventoryDelta): Promise<void> {
        const body = mapInventoryDelta(delta);
        await this.client.post('odata/standard.odata/InformationRegister_ОстаткиТоваров', body);
    }
}
