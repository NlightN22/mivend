import type { AdvancedDataTableColumn } from '@mivend/ui-kit';

export function buildContractColumns(
    col: (field: string) => string,
    searchPlaceholder: string,
): AdvancedDataTableColumn[] {
    const none = { type: 'none' } as const;
    return [
        {
            field: 'name',
            header: col('name'),
            width: 260,
            required: true,
            filterConfig: { type: 'text', placeholder: searchPlaceholder },
            mobile: { primary: true },
        },
        { field: 'status', header: col('status'), width: 130, filterConfig: none },
        {
            field: 'scan',
            header: col('scan'),
            width: 240,
            filterConfig: none,
            mobile: { badge: true },
        },
        { field: 'files', header: col('files'), width: 100, filterConfig: none },
        { field: 'actions', header: col('actions'), width: 150, filterConfig: none },
    ];
}
