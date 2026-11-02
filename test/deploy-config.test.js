import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import YAML from 'yaml';

test('Render ma jednego workera bota, publiczny panel i wspólną bazę', async () => {
  const config = YAML.parse(await fs.readFile(new URL('../render.yaml', import.meta.url), 'utf8'));
  assert.equal(config.databases[0].name, 'strefa-bot-db');
  const bot = config.services.find(service => service.type === 'worker');
  const panel = config.services.find(service => service.type === 'web');
  assert.ok(bot);
  assert.ok(panel);
  assert.equal(bot.numInstances, 1);
  assert.equal(bot.autoDeployTrigger, 'checksPass');
  assert.equal(panel.autoDeployTrigger, 'checksPass');
  assert.equal(panel.healthCheckPath, '/health');
  assert.ok(bot.envVars.some(item => item.key === 'DATABASE_URL' && item.fromDatabase?.name === 'strefa-bot-db'));
  assert.ok(panel.envVars.some(item => item.key === 'DATABASE_URL' && item.fromDatabase?.name === 'strefa-bot-db'));
});

test('workflow CI uruchamia npm run check dla main', async () => {
  const workflow = YAML.parse(await fs.readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'));
  assert.ok(workflow.on.push.branches.includes('main'));
  assert.ok(workflow.on.pull_request.branches.includes('main'));
  assert.ok(workflow.jobs.check.steps.some(step => step.run === 'npm run check'));
});
