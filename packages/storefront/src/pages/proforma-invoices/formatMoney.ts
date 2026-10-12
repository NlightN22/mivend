export function formatMoney(cents: number, currency: string): string {
    return (
        new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(cents / 100) +
        ' ' +
        (currency === 'RUB' ? '₽' : currency)
    );
}
