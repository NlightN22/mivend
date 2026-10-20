import type { Contract } from './entities/contract.entity';

export interface ShopContract {
    id: string;
    name: string | null;
    currency: string | null;
    creditLimit: number | null;
    paymentDelayDays: number | null;
    debtDaysLimit: number | null;
}

function toLimit(raw: string | null): number | null {
    if (raw == null || !/^[0-9]+(\.[0-9]+)?$/.test(raw)) return null;
    return Number(raw);
}

export function toShopContract(c: Contract): ShopContract {
    return {
        id: String(c.id),
        name: c.name,
        currency: c.currency,
        creditLimit: toLimit(c.effectiveCreditLimit) ?? toLimit(c.creditLimit),
        paymentDelayDays: c.paymentDelayDays,
        debtDaysLimit: c.debtDaysLimit,
    };
}
