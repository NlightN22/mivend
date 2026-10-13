export function formatAmount(cents: number, currency: string): string {
    return (
        new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(cents / 100) +
        ' ' +
        (currency === 'RUB' ? '₽' : currency)
    );
}

export function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
