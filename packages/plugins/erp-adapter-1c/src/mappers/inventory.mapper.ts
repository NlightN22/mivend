import type { InventoryDelta } from '@mivend/plugin-sync';

export function mapInventoryDelta(delta: InventoryDelta): Record<string, unknown> {
    return {
        Номенклатура_Key: delta.variantId,
        Склад_Key: delta.branchId,
        КоличествоИзменение: delta.delta,
    };
}
