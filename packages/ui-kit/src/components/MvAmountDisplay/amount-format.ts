import type { InjectionKey } from 'vue';

export type AmountFormatter = (amount: number, currency: string, decimals: number) => string;

// Lets a portal format every amount with its own locale without ui-kit depending on i18n.
export const AMOUNT_FORMATTER: InjectionKey<AmountFormatter> = Symbol('mvAmountFormatter');
