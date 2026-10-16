import * as fs from 'fs';
import * as path from 'path';
import { formatDocumentNumber } from '../../ui-kit/src/utils/documentNumber';

export { formatDocumentNumber };

// Written by global-setup.ts — the one deterministic order every manager-portal Orders/Order
// Detail spec reads, instead of depending on whatever orders already exist in the dev DB.
export function readE2eOrder(): { id: string; code: string; displayCode: string } {
    const filePath = path.join(__dirname, '..', '.auth', 'e2e-order.json');
    const order = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { id: string; code: string };
    return { ...order, displayCode: formatDocumentNumber(order.code) };
}
