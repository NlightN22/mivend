import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

import noRawAdvisoryLock from '../no-raw-advisory-lock.js';
import noSwallowedHandlerError from '../no-swallowed-handler-error.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

tester.run('no-swallowed-handler-error', noSwallowedHandlerError, {
    valid: [
        'try { a(); } catch (e) { log(e); }',
        'p.catch(err => log(err));',
        'p.catch(() => fallback());',
        'try { a(); }\n// best-effort: cache warmup\ncatch { }',
        'try { a(); } catch {\n// concurrency-reviewed: idempotent retry\n}',
        'p\n// best-effort: telemetry\n.catch(() => undefined);',
    ],
    invalid: [
        { code: 'try { a(); } catch {}', errors: 1 },
        { code: 'try { a(); } catch (e) {}', errors: 1 },
        { code: 'p.catch(() => undefined);', errors: 1 },
        { code: 'p.catch(() => {});', errors: 1 },
        { code: 'p.catch(() => void 0);', errors: 1 },
        { code: 'try { a(); } catch {\n// ignore\n}', errors: 1 },
        { code: '// best-effort:\ntry { a(); } catch {}', errors: 1 },
    ],
});

tester.run('no-raw-advisory-lock', noRawAdvisoryLock, {
    valid: ["q('select 1');", 'withAggregateLock(c, ctx, k, w);'],
    invalid: [
        { code: "q('select pg_advisory_xact_lock(1)');", errors: 1 },
        { code: 'q(`select pg_advisory_lock(${id})`);', errors: 1 },
        { code: "q('select pg_try_advisory_xact_lock(1)');", errors: 1 },
    ],
});
