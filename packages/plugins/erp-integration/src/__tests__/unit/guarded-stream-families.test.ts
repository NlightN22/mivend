import { describe, expect, it } from 'vitest';

import { VERSION_GUARDED_STREAMS } from '../../reconciled-streams';
import { GUARD_FAMILY } from '../guarded-stream-families';

describe('VERSION_GUARDED_STREAMS', () => {
    it('lists exactly the streams that have a replay test family', () => {
        expect([...VERSION_GUARDED_STREAMS].sort()).toEqual(Object.keys(GUARD_FAMILY).sort());
    });
});
