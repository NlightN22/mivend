export type ChosenChannel = 'phone' | 'email';

const LEGACY_COLUMN: Record<ChosenChannel, string> = {
    phone: 'c.phone',
    email: 'c."officialEmail"',
};

const CHANNELS = (type: ChosenChannel, usableOnly: boolean): string =>
    `FROM counterparty_contact_point l JOIN contact_point cp ON cp.id = l."contactPointId"
     WHERE l."counterpartyId" = c.id AND cp.type = '${type}'${usableOnly ? ' AND cp."isUsable"' : ''}`;

// The legacy column counts only while the counterparty has no channel of that type at all.
export function hasChosenChannelSql(type: ChosenChannel): string {
    return `(EXISTS (SELECT 1 ${CHANNELS(type, true)})
        OR (NOT EXISTS (SELECT 1 ${CHANNELS(type, false)}) AND coalesce(${LEGACY_COLUMN[type]}, '') <> ''))`;
}

// Primary usable channel first, then the oldest link; ERP and manual channels rank equally.
export function chosenChannelValueSql(type: ChosenChannel): string {
    return `coalesce(
        (SELECT cp."normalizedValue" ${CHANNELS(type, true)} ORDER BY l."isPrimary" DESC, l.id LIMIT 1),
        CASE WHEN NOT EXISTS (SELECT 1 ${CHANNELS(type, false)}) THEN NULLIF(${LEGACY_COLUMN[type]}, '') END)`;
}
