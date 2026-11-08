import type {
    ErpHeaderFields,
    ErpLineRow,
    OrderCorrectionContainerLineErp,
    OrderCorrectionErp,
    OrderCorrectionGoodsLineErp,
    OrderCorrectionServiceLineErp,
} from '@mivend/plugin-erp-order';

import {
    bool,
    discountCondition,
    discounts,
    flt,
    fltZero,
    lineNumber,
    money,
    moneyZero,
    records,
    ref,
    str,
    time,
    vat,
} from './erp-document-payload';
import type { Payload } from './erp-document-payload';

export function orderCorrectionFields(p: Payload): ErpHeaderFields<OrderCorrectionErp> {
    return {
        number: str(p.number) ?? '',
        date: time(p.date),
        orderId: str(p.orderId),
        counterpartyId: str(p.counterpartyId),
        organizationId: str(p.organizationId),
        responsibleId: str(p.responsibleId),
        priceTypeId: str(p.priceTypeId),
        vatAccounted: bool(p.vatAccounted),
        amountIncludesVat: bool(p.amountIncludesVat),
        exchangeRate: flt(p.exchangeRate),
        exchangeMultiplicity: flt(p.exchangeMultiplicity),
        totalAmountMinor: moneyZero(p.totalAmount),
        comment: str(p.comment),
        discountCard: ref(p.discountCard),
        salesCondition: ref(p.salesCondition),
        structuralUnit: ref(p.structuralUnit),
        plannedCostTotalMinor: money(p.plannedCostTotal),
        usePlannedCost: bool(p.usePlannedCost),
        accounting: ref(p.accounting),
    };
}

export function orderCorrectionGoodsLines(p: Payload): ErpLineRow<OrderCorrectionGoodsLineErp>[] {
    return records(p.goods).map(l => ({
        lineNumber: lineNumber(l),
        productId: str(l.productId),
        characteristicId: str(l.characteristicId),
        seriesId: str(l.seriesId),
        unitId: str(l.unitId),
        unitCoefficient: flt(l.unitCoefficient),
        quantity: fltZero(l.quantity),
        placesUnitId: str(l.placesUnitId),
        placesQuantity: flt(l.placesQuantity),
        priceMinor: moneyZero(l.price),
        amountMinor: moneyZero(l.amount),
        ...vat(l),
        ...discounts(l),
        ...discountCondition(l),
        placement: ref(l.placement),
        plannedCostMinor: money(l.plannedCost),
    }));
}

export function orderCorrectionServiceLines(
    p: Payload,
): ErpLineRow<OrderCorrectionServiceLineErp>[] {
    return records(p.services).map(l => ({
        lineNumber: lineNumber(l),
        productId: str(l.productId),
        content: str(l.content),
        quantity: fltZero(l.quantity),
        priceMinor: moneyZero(l.price),
        amountMinor: moneyZero(l.amount),
        ...vat(l),
        ...discounts(l),
        ...discountCondition(l),
    }));
}

export function orderCorrectionContainerLines(
    p: Payload,
): ErpLineRow<OrderCorrectionContainerLineErp>[] {
    return records(p.returnableContainers).map(l => ({
        lineNumber: lineNumber(l),
        productId: str(l.productId),
        quantity: fltZero(l.quantity),
        priceMinor: moneyZero(l.price),
        amountMinor: moneyZero(l.amount),
        placement: ref(l.placement),
    }));
}
