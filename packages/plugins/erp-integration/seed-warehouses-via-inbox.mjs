#!/usr/bin/env node
// Dev-only tool to seed local Warehouse rows WITHOUT a live Integration Service Kafka broker
// (user request, 2026-09-05 — "we're about to work heavily with the real consumer, and it must
// consume everything per the real protobuf contract; don't touch a live broker or the
// staging-integration test contour to get there").
//
// Warehouse has no erp-import (REST batch) record type at all — it is Kafka-fed only
// (WarehouseStreamHandler, see src/handlers/warehouse.handler.ts), so there is no equivalent to
// infrastructure/scripts/seed-erp.mjs's usual REST-batch approach for it.
//
// What this script actually does — and does NOT fake:
//   1. Builds a real `company.catalog.events.v1.WarehouseChanged` protobuf message using this
//      plugin's own real dependency (@nlightn22/event-contracts's WarehouseChangedSchema).
//   2. Encodes it with `toBinary()` and decodes it back with `fromBinary()`+`toJson()` — the
//      EXACT same round-trip kafka-consumer.service.ts performs on a real Kafka message
//      (see SCHEMA_BY_STREAM / handleMessage there). This proves the wire contract, not just
//      the downstream handler logic.
//   3. Inserts the decoded record directly into `integration_inbox_event` (status='pending'),
//      matching IntegrationInboxService.enqueue()'s own insert shape exactly (same columns, same
//      (stream, entity_id, version) dedup key) — i.e. it skips ONLY the raw KafkaJS/network
//      transport step, nothing else. The already-running worker process's IntegrationInboxWorker
//      (BullMQ, 5s sweep, see INBOX_POLL_INTERVAL_DEFAULT) then picks these rows up completely
//      normally and calls the REAL WarehouseStreamHandler.apply() against the real DB — same code
//      path a genuine Kafka message would take from that point on.
// This is the same "construct a synthetic protobuf-encoded message" pattern already sanctioned by
// AGENTS.md's testing rules for exactly this situation (extend fixtures rather than touch a real
// external source) — this script is that pattern reused as a one-off dev seed tool instead of a
// test.
//
// Usage: run from this directory once the local dev stack (make dev) and its worker are up, and
// AFTER branch-central/branch-east exist (infrastructure/scripts/seed-erp.mjs — Warehouse.upsert
// looks up the branch by erpId and silently skips if it isn't found yet):
//   cd packages/plugins/erp-integration
//   node seed-warehouses-via-inbox.mjs
//
// Never run this against the staging-integration contour or any DB actually wired to the real
// broker — it exists specifically so local dev never needs to be.

import { execSync } from 'node:child_process';
import { create, toBinary, fromBinary, toJson } from '@bufbuild/protobuf';
import { WarehouseChangedSchema } from '@nlightn22/event-contracts';

const PG_CONTAINER = process.env.PG_CONTAINER ?? 'docker-postgres-central-1';
const PG_DB = process.env.PG_DB ?? 'mivend_central';

const warehouses = [
    { erpId: 'wh-central-main', name: 'Central main warehouse', branchId: 'branch-central' },
    { erpId: 'wh-central-overflow', name: 'Central overflow warehouse', branchId: 'branch-central' },
    { erpId: 'wh-east-main', name: 'East branch warehouse', branchId: 'branch-east' },
];

function buildDecodedRecord(w) {
    // Real protobuf message construction, same shape a real Integration Service producer would
    // send (see event-contracts's generated WarehouseChanged type: eventId/entityId/version are
    // the stream's own identity/idempotency fields, not warehouse business fields).
    const msg = create(WarehouseChangedSchema, {
        eventId: `seed-${w.erpId}`,
        entityId: w.erpId,
        version: '1',
        name: w.name,
        isFolder: false,
        isActive: true,
        isDeleted: false,
        branchId: w.branchId,
    });

    // Real encode + real decode round-trip — exactly what kafka-consumer.service.ts's
    // handleMessage() does with an actual Kafka message.value.
    const bytes = toBinary(WarehouseChangedSchema, msg);
    const decoded = fromBinary(WarehouseChangedSchema, bytes);
    return toJson(WarehouseChangedSchema, decoded);
}

function sqlQuote(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

function insertInboxRow(record) {
    const entityId = String(record.entityId);
    const version = String(record.version);
    const sourceEventId = String(record.eventId);
    const payloadJson = JSON.stringify(record).replace(/'/g, "''");

    // Same (stream, entity_id, version) dedup key as IntegrationInboxService.enqueue() — a rerun
    // of this script is a no-op via the same unique constraint, not a duplicate insert.
    const sql =
        `INSERT INTO integration_inbox_event (stream, entity_id, version, source_event_id, payload, status, attempts) ` +
        `VALUES ('warehouse', ${sqlQuote(entityId)}, ${sqlQuote(version)}, ${sqlQuote(sourceEventId)}, '${payloadJson}'::jsonb, 'pending', 0) ` +
        `ON CONFLICT (stream, entity_id, version) DO NOTHING;`;

    execSync(`docker exec ${PG_CONTAINER} psql -U postgres -d ${PG_DB} -c "${sql.replace(/"/g, '\\"')}"`, {
        stdio: 'inherit',
    });
}

for (const w of warehouses) {
    const record = buildDecodedRecord(w);
    console.log(`Enqueuing warehouse ${w.erpId} (branch=${w.branchId}) via inbox...`);
    insertInboxRow(record);
}

console.log(
    `\nDone. ${warehouses.length} warehouse event(s) enqueued as 'pending' — the running worker's ` +
        `IntegrationInboxWorker sweep (every 5s) will process them via the real WarehouseStreamHandler.`,
);
