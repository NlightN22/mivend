import * as contracts from '@nlightn22/event-contracts';
import { version } from '@nlightn22/event-contracts/package.json';

const NOT_EVENT_SCHEMAS = new Set(['OrderChangedLineSchema']);

export function streamNameFromSchemaExport(exportName: string): string | null {
    if (!exportName.endsWith('Schema') || exportName.startsWith('Proto')) return null;
    if (NOT_EVENT_SCHEMAS.has(exportName)) return null;
    let name = exportName.slice(0, -'Schema'.length);
    if (name.endsWith('Changed') && name !== 'OrderChanged') {
        name = name.slice(0, -'Changed'.length);
    }
    return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export function listContractStreams(): string[] {
    const names = Object.keys(contracts)
        .map(streamNameFromSchemaExport)
        .filter((n): n is string => n !== null);
    return [...new Set(names)].sort();
}

export const CONTRACT_VERSION: string = version;
