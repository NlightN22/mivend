import { describe, expect, it } from 'vitest';

import { inboundApplied } from '../../handlers/inbound-stream-handler';
import type { InboundStreamHandler } from '../../handlers/inbound-stream-handler';

// Compile-time guard: a handler whose apply() has a bare `return` or a path without a return
// must not compile (issue #200). `@ts-expect-error` fails the build if that ever stops being true.
const bareReturn: InboundStreamHandler = {
    // @ts-expect-error apply() must return an InboundOutcome on every path
    async apply(): Promise<void> {
        return;
    },
};

describe('InboundStreamHandler outcome typing', () => {
    it('an applied outcome is explicit', () => {
        expect(inboundApplied()).toEqual({ kind: 'applied' });
        expect(bareReturn).toBeDefined();
    });
});
