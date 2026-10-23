import fs from 'node:fs';
import path from 'node:path';

// Explicit confirmation is separate from legacy automatic review preferences.
export function createModelSettings(data, env = process.env) {
  const filename = path.join(data, 'model-settings.json');
  const empty = { confirmed: false, mode: null, provider: '', model: env.SIGMA_MODEL || 'qwen3.5:9b' };
  function validate(value) {
    if (!['local', 'cloud'].includes(value?.mode)) throw Error('Vælg lokal model eller cloudmodel.');
    if (typeof value.model !== 'string' || !value.model.trim() || value.model.length > 150 || /[\r\n\x00-\x1f]/.test(value.model)) throw Error('Angiv et konkret modelnavn.');
    if (value.mode === 'cloud' && env.SIGMA_LOCAL_ONLY === '1') throw Error('Virksomhedspolitikken tillader kun lokal behandling.');
    if (value.mode === 'cloud' && !['openai', 'anthropic'].includes(value.provider)) throw Error('Vælg en understøttet cloududbyder.');
    if (value.auth !== undefined && !['api-key','chatgpt'].includes(value.auth)) throw Error('Ukendt forbindelsestype.');
    if (value.auth === 'chatgpt' && (value.mode !== 'cloud' || value.provider !== 'openai')) throw Error('ChatGPT-login kræver OpenAI.');
    return { confirmed: true, mode: value.mode, provider: value.mode === 'cloud' ? value.provider : '', model: value.model.trim(),
      ...(value.auth === 'chatgpt' ? {auth:'chatgpt'} : {}) };
  }
  let current = empty;
  try { const saved = JSON.parse(fs.readFileSync(filename, 'utf8')); if (saved.confirmed === true) current = validate(saved); } catch {}
  return {
    get: () => ({ ...current }),
    save(value) {
      const next = validate(value);
      fs.writeFileSync(filename + '.tmp', JSON.stringify(next, null, 2));
      fs.renameSync(filename + '.tmp', filename);
      current = next;
      return { ...current };
    },
    requireLocal() {
      if (!current.confirmed) throw Error('Vælg og gem en model i opsætningen før AI kan bruges.');
      if (current.mode !== 'local') throw Error('Cloud er valgt. Vælg data og godkend forhåndsvisningen før afsendelse.');
      return current.model;
    },
    cloudEnvironment() {
      if (!current.confirmed || current.mode !== 'cloud') throw Error('Vælg og gem en cloudmodel først.');
      if (env.SIGMA_LOCAL_ONLY === '1') throw Error('Virksomhedspolitikken tillader kun lokal behandling.');
      return { ...env, [current.provider === 'openai' ? 'SIGMA_OPENAI_MODEL' : 'SIGMA_ANTHROPIC_MODEL']: current.model };
    },
  };
}
