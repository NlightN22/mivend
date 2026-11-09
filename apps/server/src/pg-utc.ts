import { defaults, types } from 'pg';

const TIMESTAMP_WITHOUT_TIME_ZONE = 1114;

export const UTC_SESSION_OPTIONS = '-c timezone=UTC';

// Columns hold UTC wall time: reads, writes and now() defaults must not follow the process or server zone.
export function useUtcTimestamps(): void {
    defaults.parseInputDatesAsUTC = true;
    types.setTypeParser(
        TIMESTAMP_WITHOUT_TIME_ZONE,
        (value: string) => new Date(`${value.replace(' ', 'T')}Z`),
    );
}
