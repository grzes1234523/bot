import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

test('błąd logowania Discorda zamyka HTTP i kończy proces z kodem 1', async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'strefa-startup-'));
  try {
    const script = `
      import { Client } from 'discord.js';
      Client.prototype.login = async function () {
        const error = new Error('kontrolowany błąd logowania');
        error.name = 'DiscordLoginTestFailure';
        error.code = 'LOGIN_REGRESSION';
        throw error;
      };
      globalThis.fetch = async () => { throw new Error('Test nie może łączyć się z Discordem'); };
      await import('./src/bot.js');
    `;
    const child = spawn(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: root,
      shell: false,
      env: {
        ...process.env,
        DISCORD_TOKEN: 'test-token-never-sent',
        CLIENT_ID: '123456789012345678',
        GUILD_ID: '123456789012345679',
        APPLICATION_CHANNEL_ID: '123456789012345680',
        ACCEPTED_ROLE_ID: '123456789012345681',
        STAFF_ROLE_ID: '',
        LOG_CHANNEL_ID: '',
        CLIENT_SECRET: '',
        PANEL_SESSION_SECRET: '',
        DATABASE_URL: '',
        REQUIRE_DATABASE: 'false',
        STREFA_BOT_DATA_DIR: dataDirectory,
        PORT: '0',
        PANEL_HOST: '127.0.0.1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.setEncoding('utf8').on('data', text => { output += text; });
    child.stderr.setEncoding('utf8').on('data', text => { output += text; });
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Proces nie zakończył się po błędzie logowania:\n${output}`));
      }, 8000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
    });
    assert.equal(result.code, 1, output);
    assert.equal(result.signal, null, output);
    assert.match(output, /Błąd logowania bota:/);
    assert.match(output, /DiscordLoginTestFailure/);
    assert.match(output, /LOGIN_REGRESSION/);
    assert.match(output, /kontrolowany błąd logowania/);
    assert.doesNotMatch(output, /Test nie może łączyć się z Discordem/);
    assert.doesNotMatch(output, /test-token-never-sent/);
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
