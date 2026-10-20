export interface NoPriceAction {
    labelKey: 'buyPanel.requestPrice';
    to: string;
}

export function noPriceAction(demoAllowed: boolean): NoPriceAction | null {
    return demoAllowed ? { labelKey: 'buyPanel.requestPrice', to: '/requests' } : null;
}
