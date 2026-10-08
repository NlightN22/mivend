import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

import noDirectOutbound from '../no-direct-outbound.js';
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

tester.run('no-direct-outbound', noDirectOutbound, {
    valid: [
        "import { OutboundGateway } from './outbound-gateway';",
        "import { EventBus } from '@vendure/core';",
        "import { ErpIntegrationPlugin } from '@mivend/plugin-erp-integration';",
        "q('SELECT * FROM integration_outbox');",
        "q('UPDATE other_table SET a = 1');",
    ],
    invalid: [
        {
            code: "import { IntegrationOutboxService } from './integration-outbox.service';",
            errors: 1,
        },
        { code: "import { KafkaProducerService } from './kafka-producer.service';", errors: 1 },
        {
            code: "import { IntegrationOutboxService as S } from '@mivend/plugin-erp-integration';",
            errors: 1,
        },
        {
            code: "import { IntegrationOutboxEntry } from '@mivend/plugin-erp-integration';",
            errors: 1,
        },
        { code: "import * as outbox from './integration-outbox.service';", errors: 1 },
        { code: "import * as erp from '@mivend/plugin-erp-integration';", errors: 1 },
        { code: "import Entry from './entities/integration-outbox-entry.entity';", errors: 1 },
        {
            code: "export { IntegrationOutboxService } from './integration-outbox.service';",
            errors: 1,
        },
        { code: "export * from './kafka-producer.service';", errors: 1 },
        { code: "const m = await import('./integration-outbox.service');", errors: 1 },
        { code: "const m = require('./kafka-producer.service');", errors: 1 },
        { code: "q('INSERT INTO integration_outbox (event_id) VALUES ($1)');", errors: 1 },
        { code: 'q(`UPDATE "integration_outbox" SET status = $1`);', errors: 1 },
        { code: "q('delete from integration_outbox');", errors: 1 },
    ],
});
