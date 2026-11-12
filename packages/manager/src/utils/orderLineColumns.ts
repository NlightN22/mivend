import type { DocColumn } from '@mivend/ui-kit';
import { tr } from './lazyLabels';

export function orderLineColumns(retroShown: boolean): DocColumn[] {
    return [
        { key: 'product', label: tr('orderLines.lines.product') },
        { key: 'qty', label: tr('orderLines.lines.qty'), inputWhenEditing: true },
        { key: 'available', label: tr('orderLines.lines.available') },
        { key: 'reserve', label: tr('orderLines.lines.reserve') },
        { key: 'price', label: tr('orderLines.lines.price'), inputWhenEditing: true },
        { key: 'discount', label: tr('orderLines.lines.discount'), inputWhenEditing: true },
        { key: 'retro', label: tr('orderLines.lines.retro'), hidden: !retroShown },
        { key: 'total', label: tr('orderLines.lines.total') },
    ];
}
