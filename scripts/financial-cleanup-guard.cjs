const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function blockerDirectory(runId, root = process.cwd()) {
  // The run ID is a cleanup capability. Do not expose it in artifact paths.
  const key = createHash('sha256').update(runId).digest('hex');
  return path.join(root, 'test-results', 'financial-cleanup-blockers', key);
}

function retainFinancialCleanupRun(runId, eventId, root) {
  if (!/^[a-f0-9]{24}$/i.test(eventId)) throw new Error('Invalid cleanup event ID');
  const directory = blockerDirectory(runId, root);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${eventId}.json`), JSON.stringify({ eventId }));
}

function confirmFinancialCleanup(runId, eventId, root) {
  if (!/^[a-f0-9]{24}$/i.test(eventId)) throw new Error('Invalid cleanup event ID');
  fs.rmSync(path.join(blockerDirectory(runId, root), `${eventId}.json`), { force: true });
}

function assertFinancialCleanupComplete(runId, root) {
  const directory = blockerDirectory(runId, root);
  if (!fs.existsSync(directory)) return;
  const records = fs.readdirSync(directory);
  if (records.length) {
    throw new Error(`Resource deletion blocked: financial cleanup needs review for events ${records.map(name => path.parse(name).name).join(', ')}. This run's records were preserved.`);
  }
}

module.exports = { retainFinancialCleanupRun, confirmFinancialCleanup, assertFinancialCleanupComplete };
