import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
const execute = promisify(execFile);

export function vaultRepository(value) {
  assert.match(value ?? '', /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/, 'A private source-state repository is required');
  return value;
}
const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`;
function configPath(value) {
  assert.ok(!/[\r\n"]/.test(value), 'Invalid SSH configuration path');
  return value.replaceAll('\\', '/');
}
export async function requirePrivateVault(repository, { fetchImpl = fetch, token } = {}) {
  vaultRepository(repository);
  const headers = { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  // A public-repo GITHUB_TOKEN cannot read the private vault via REST. A public
  // vault is visible and must stop the job; SSH subsequently proves access to
  // the private destination using its repository-specific deploy key.
  const response = await fetchImpl(`https://api.github.com/repos/${repository}`, { headers, signal: AbortSignal.timeout(20000) });
  if (response.status === 200) assert.equal((await response.json()).private, true, 'Refusing to store source state in a public repository');
  else assert.equal(response.status, 404, 'Cannot verify source-state privacy');
  const meta = await fetchImpl('https://api.github.com/meta', { headers, signal: AbortSignal.timeout(20000) });
  assert.ok(meta.ok, 'Cannot retrieve authenticated GitHub SSH host keys');
  const keys = (await meta.json()).ssh_keys;
  assert.ok(Array.isArray(keys) && keys.length && keys.every(key => /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256) [A-Za-z0-9+/=]+$/.test(key)));
  return keys.map(key => `github.com ${key}`).join('\n') + '\n';
}

export async function openPrivateVault(root, { repository, privateKey, directory, token, fetchImpl = fetch, git = execute } = {}) {
  vaultRepository(repository);
  assert.ok(typeof privateKey === 'string' && privateKey.includes('BEGIN OPENSSH PRIVATE KEY'), 'Private-vault deploy key is missing');
  const location = resolve(root, directory);
  assert.ok(location.startsWith(resolve(root, 'work') + (process.platform === 'win32' ? '\\' : '/')));
  const ssh = resolve(root, 'work/source-state/ssh');
  await mkdir(ssh, { recursive: true });
  const keyFile = resolve(ssh, 'id_ed25519');
  const hostsFile = resolve(ssh, 'known_hosts');
  const configFile = resolve(ssh, 'config');
  await writeFile(keyFile, privateKey.replaceAll('\r\n', '\n').trim() + '\n', { mode: 0o600 });
  await chmod(keyFile, 0o600);
  await writeFile(hostsFile, await requirePrivateVault(repository, { fetchImpl, token }), { mode: 0o600 });
  await writeFile(configFile, `Host github.com\n  HostName github.com\n  User git\n  IdentityFile "${configPath(keyFile)}"\n  UserKnownHostsFile "${configPath(hostsFile)}"\n  StrictHostKeyChecking yes\n  IdentitiesOnly yes\n  BatchMode yes\n`, { mode: 0o600 });
  const env = { ...process.env, GIT_SSH_COMMAND: `ssh -F ${shellQuote(configPath(configFile))}`, GIT_TERMINAL_PROMPT: '0' };
  await git('git', ['clone', '--quiet', '--depth', '1', '--branch', 'main', '--single-branch', `git@github.com:${repository}.git`, location], { cwd: root, env });
  const gitRun = args => git('git', args, { cwd: location, env });
  await gitRun(['config', 'user.name', 'TampaBayBot source automation']);
  await gitRun(['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
  return { location, gitRun };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { phase: { type: 'string' } } });
  const root = resolve(import.meta.dirname, '..');
  const directory = 'work/source-state/private-vault';
  if (positionals[0] === 'checkout') {
    const vault = await openPrivateVault(root, { repository: process.env.SOURCE_STATE_REPOSITORY,
      privateKey: process.env.SOURCE_STATE_SSH_KEY, directory, token: process.env.GITHUB_TOKEN });
    await mkdir(resolve(root, 'work/source-state/input'), { recursive: true });
    await cp(resolve(vault.location, 'source-state.enc'), resolve(root, 'work/source-state/input/source-state.enc'));
    console.log('Private encrypted baseline checked out.');
  } else if (positionals[0] === 'push') {
    assert.ok(['checkpoint', 'final'].includes(values.phase));
    const location = resolve(root, directory);
    const configFile = resolve(root, 'work/source-state/ssh/config');
    const env = { ...process.env, GIT_SSH_COMMAND: `ssh -F ${shellQuote(configPath(configFile))}`, GIT_TERMINAL_PROMPT: '0' };
    // Re-check visibility before every write, including a final failed-run save.
    await requirePrivateVault(process.env.SOURCE_STATE_REPOSITORY, { token: process.env.GITHUB_TOKEN });
    const encrypted = await readFile(resolve(root, `work/source-state/${values.phase}/source-state.enc`));
    assert.equal(encrypted.subarray(0, 9).toString(), 'TBBSTATE1', 'Only authenticated encrypted state can enter the private vault');
    await writeFile(resolve(location, 'source-state.enc'), encrypted);
    await writeFile(resolve(location, 'state.json'), JSON.stringify({ schema_version: 1, phase: values.phase, saved_at: new Date().toISOString(), run_id: process.env.GITHUB_RUN_ID }, null, 2) + '\n');
    const options = { cwd: location, env };
    await execute('git', ['add', '--', 'source-state.enc', 'state.json'], options);
    await execute('git', ['commit', '--quiet', '-m', `Save encrypted ${values.phase} state`], options);
    await execute('git', ['push', '--quiet', 'origin', 'HEAD:main'], options);
    console.log(`Encrypted ${values.phase} state persisted to the private vault.`);
  } else throw new Error('Usage: private-source-vault.mjs checkout|push --phase checkpoint|final');
}
