import type { Repository } from 'typeorm';

import { TradingPointErp } from './entities/trading-point-erp.entity';
import { isUsableLocation } from './trading-point-location';

export interface MirrorFields {
    counterpartyId: string;
    isActive: boolean;
    name?: string | null;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    workingHours?: string | null;
    contactPhone?: string | null;
}

// undefined keeps the mirrored value (a tombstone or a partial event); a usable-looking location is stored as sent.
export async function writeErpMirror(
    repo: Repository<TradingPointErp>,
    erpId: string,
    fields: MirrorFields,
): Promise<void> {
    const row = (await repo.findOne({ where: { erpId } })) ?? repo.create({ erpId });
    row.counterpartyId = fields.counterpartyId;
    row.isActive = fields.isActive;
    if (fields.name) row.name = fields.name;
    if (fields.address !== undefined) row.address = fields.address;
    if (fields.workingHours !== undefined) row.workingHours = fields.workingHours;
    if (fields.contactPhone !== undefined) row.contactPhone = fields.contactPhone;
    if (fields.latitude !== undefined || fields.longitude !== undefined) {
        const usable = isUsableLocation(fields.latitude, fields.longitude);
        row.latitude = usable ? fields.latitude! : null;
        row.longitude = usable ? fields.longitude! : null;
    }
    await repo.save(row);
}
