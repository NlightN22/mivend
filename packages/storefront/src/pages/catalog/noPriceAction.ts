export interface NoPriceAction {
    labelKey: 'buyPanel.requestPrice' | 'buyPanel.onRequest';
    to: string | null;
}

export function noPriceAction(demoAllowed: boolean): NoPriceAction {
    return demoAllowed
        ? { labelKey: 'buyPanel.requestPrice', to: '/requests' }
        : { labelKey: 'buyPanel.onRequest', to: null };
}
