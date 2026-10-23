import fs from 'node:fs';
import path from 'node:path';

export function liveBridgeInfo(data, now = Date.now()) {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(data, 'sigma-live-status.json'), 'utf8'));
    const timestamp = Date.parse(saved.time);
    const stale = !Number.isFinite(timestamp) || now - timestamp > 10000 || timestamp - now > 5000;
    const status = stale ? 'disconnected' : ['connected', 'waiting'].includes(saved.status) ? saved.status : 'unavailable';
    return { status, message: stale ? 'COM-broens status er forældet. Ingen aktuel liveforbindelse.' : String(saved.message || 'COM-broen har ikke leveret en status.').slice(0, 1000), time: saved.time || null, stale, runtimeValidated: !stale && saved.runtimeValidated === true };
  } catch {
    return { status: 'unavailable', message: 'COM-livebroen har endnu ikke leveret en status. Et gemt filudtræk er ikke en liveforbindelse.', time: null, stale: true, runtimeValidated: false };
  }
}
