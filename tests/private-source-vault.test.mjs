import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { requirePrivateVault, openPrivateVault, vaultRepository } from '../scripts/private-source-vault.mjs';
import { refreshFixture } from '../src/lib/ingestion/refresh-fixtures.mjs';
const hostKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFixture';
const privateFetch = async url => url.endsWith('/meta') ? Response.json({ ssh_keys: [hostKey] }) : new Response('', { status: 404 });

test('a public or unverifiable state destination is rejected, with no fallback upload', async () => {
  await assert.rejects(requirePrivateVault('fixture/public', { fetchImpl: async () => Response.json({ private: false }) }), /public repository/);
  await assert.rejects(requirePrivateVault('fixture/private', { fetchImpl: async () => new Response('', { status: 403 }) }), /verify source-state privacy/);
  assert.throws(() => vaultRepository('fixture/repo; echo unsafe'));
  assert.throws(() => vaultRepository('../private'));
});

test('private-vault SSH pins host keys from HTTPS and uses a repository-specific identity', async t => {
  const f = await refreshFixture(t);
  const commands = [];
  await openPrivateVault(f.root, { repository: 'fixture/private-state', privateKey: 'fixture BEGIN OPENSSH PRIVATE KEY fixture',
    directory: 'work/source-state/private-vault', fetchImpl: privateFetch,
    git: async (binary, args, options) => { commands.push({ binary, args, options }); return {}; } });
  assert.ok(commands[0].args.includes('git@github.com:fixture/private-state.git'));
  assert.ok(commands[0].options.env.GIT_SSH_COMMAND.includes(' -F '));
  const config = await readFile(join(f.root, 'work/source-state/ssh/config'), 'utf8');
  assert.match(config, /StrictHostKeyChecking yes/);
  assert.match(config, /IdentitiesOnly yes/);
  assert.match(config, /BatchMode yes/);
  assert.equal(await readFile(join(f.root, 'work/source-state/ssh/known_hosts'), 'utf8'), `github.com ${hostKey}\n`);
});

test('malformed host-key metadata and absent deploy credentials cannot open a vault', async t => {
  await assert.rejects(requirePrivateVault('fixture/private', { fetchImpl: async url => url.endsWith('/meta') ? Response.json({ ssh_keys: ['unsafe host key\ncommand'] }) : new Response('', { status: 404 }) }));
  const f = await refreshFixture(t);
  await assert.rejects(openPrivateVault(f.root, { repository: 'fixture/private', directory: 'work/source-state/vault' }), /deploy key is missing/);
});
