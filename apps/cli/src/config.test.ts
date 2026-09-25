import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configPath, loadConfig, requireConfig, saveConfig, updateTaskState } from './config.js';

let home: string;
beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), 'aura-cli-'));
  vi.stubEnv('XDG_CONFIG_HOME', home);
  vi.stubEnv('AURA_TOKEN', '');
  vi.stubEnv('AURA_API_URL', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(home, { recursive: true, force: true });
});

describe('CLI config', () => {
  it('saves the login with owner-only permissions', async () => {
    await saveConfig({ apiUrl: 'http://api', token: 'aura_pat_x', tasks: {} });
    expect(statSync(configPath()).mode & 0o777).toBe(0o600);
    expect(await loadConfig()).toEqual({ apiUrl: 'http://api', token: 'aura_pat_x', tasks: {} });
  });

  it('asks for a login when there is none', async () => {
    await expect(requireConfig()).rejects.toThrow(/aura login/);
  });

  it('prefers AURA_TOKEN / AURA_API_URL (web terminal, CI) over the stored login', async () => {
    await saveConfig({ apiUrl: 'http://stored', token: 'aura_pat_stored', tasks: {} });
    vi.stubEnv('AURA_TOKEN', 'aura_pat_env');
    vi.stubEnv('AURA_API_URL', 'http://env');
    expect(await requireConfig()).toMatchObject({ apiUrl: 'http://env', token: 'aura_pat_env' });
  });

  it('remembers Task state without ever writing an env token to disk', async () => {
    vi.stubEnv('AURA_TOKEN', 'aura_pat_env_secret');
    const config = await requireConfig();
    await updateTaskState(config, 'KAN-1', { threadId: 't1', lastDraftId: 'CODE-1' });
    const onDisk = readFileSync(configPath(), 'utf8');
    expect(onDisk).not.toContain('aura_pat_env_secret');
    expect(JSON.parse(onDisk).tasks['KAN-1']).toEqual({ threadId: 't1', lastDraftId: 'CODE-1' });
  });

  it('merges Task state into an existing login', async () => {
    await saveConfig({ apiUrl: 'http://api', token: 'aura_pat_x', tasks: { 'KAN-1': { threadId: 't1' } } });
    const config = await requireConfig();
    await updateTaskState(config, 'KAN-2', { threadId: 't2' });
    const saved = await loadConfig();
    expect(saved?.token).toBe('aura_pat_x');
    expect(Object.keys(saved?.tasks ?? {})).toEqual(['KAN-1', 'KAN-2']);
  });
});
