export function formatMoney(cents: number, currency: string): string {
    const whole = cents % 100 === 0;
    const options: Intl.NumberFormatOptions = whole
        ? { maximumFractionDigits: 0 }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    return (
        new Intl.NumberFormat('ru-RU', options).format(cents / 100) +
        ' ' +
        (currency === 'RUB' ? '₽' : currency)
    );
}
