export function documentMoney(currencyCode: string): (minor: number) => string {
    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode });
    return minor => formatter.format(minor / 100);
}

export function documentDate(iso: string): string {
    return new Date(iso).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}
