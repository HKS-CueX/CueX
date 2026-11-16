import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateAsrCapabilityStatus,
  validateClientMessage,
  validateContextPack,
  validateDualSystemCollaborationMetrics,
  validateEventEnvelope,
  validateEvidence,
  validateMemoryItem,
  validatePresentationContextPack,
  validateProviderUsageRecord,
  validateS1ObservationSnapshot,
  validateSystem2Guidance,
  validateTelemetryUsage,
  validateUsageRecord,
  validateWsAttachState,
} from '#src/index';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMAS_DIR = path.join(ROOT_DIR, 'schemas');
const EXAMPLES_DIR = path.join(ROOT_DIR, 'examples');

test('all JSON Schema files parse cleanly with draft 2020-12 metadata', () => {
  const schemaFiles = readdirSync(SCHEMAS_DIR).filter((f) => f.endsWith('.schema.json'));
  assert.ok(schemaFiles.length >= 10);
  for (const file of schemaFiles) {
    const parsed = JSON.parse(readFileSync(path.join(SCHEMAS_DIR, file), 'utf8'));
    assert.equal(parsed.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.ok(typeof parsed.$id === 'string' && parsed.$id.startsWith('https://cuex.ai/schemas/'));
    assert.ok(typeof parsed.title === 'string' && parsed.title.length > 0);
  }
});

test('all canonical JSON examples parse and pass corresponding v2 runtime validators', () => {
  const readExample = (name: string) =>
    JSON.parse(readFileSync(path.join(EXAMPLES_DIR, name), 'utf8'));

  assert.equal(validateEventEnvelope(readExample('event-envelope.example.json')).ok, true);
  assert.equal(validateEvidence(readExample('evidence.example.json')).ok, true);
  assert.equal(validateMemoryItem(readExample('memory-item.example.json')).ok, true);
  assert.equal(validateTelemetryUsage(readExample('telemetry-usage.example.json')).ok, true);
  assert.equal(validateUsageRecord(readExample('usage-record.example.json')).ok, true);
  assert.equal(validateContextPack(readExample('context-pack.example.json')).ok, true);
  assert.equal(
    validatePresentationContextPack(readExample('presentation-context-pack.example.json')).ok,
    true,
  );
  assert.equal(
    validateClientMessage(readExample('client-message-session-start.example.json')).ok,
    true,
  );

  const apiError = readExample('api-error.example.json');
  assert.equal(apiError.ok, false);
  assert.equal(apiError.error.code, 'PAYMENT_NOT_CONFIGURED');

  const srvMsg = readExample('server-message-intervention-shown.example.json');
  assert.equal(srvMsg.type, 'intervention.shown');
  assert.equal(typeof srvMsg.serverSeq, 'number');

  assert.equal(
    validateAsrCapabilityStatus(readExample('asr-capability-status.example.json')).ok,
    true,
  );
  assert.equal(
    validateProviderUsageRecord(readExample('provider-usage-record.example.json')).ok,
    true,
  );
  assert.equal(
    validateSystem2Guidance(readExample('system2-guidance.example.json')).ok,
    true,
  );
  assert.equal(
    validateS1ObservationSnapshot(readExample('s1-observation-snapshot.example.json')).ok,
    true,
  );
  assert.equal(
    validateDualSystemCollaborationMetrics(readExample('dual-system-metrics.example.json')).ok,
    true,
  );
  assert.equal(
    validateWsAttachState(readExample('ws-attach-state.example.json')).ok,
    true,
  );
});
