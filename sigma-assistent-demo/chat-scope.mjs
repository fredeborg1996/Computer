import path from 'node:path';

export function wantsHistory(question) {
  return /(?:historik|historiske|tidligere\s+(?:tilbud|sager|priser|leverandør)|sammenlign\w*\s+med\s+(?:andre|tidligere)|lignende\s+(?:sager|tilbud))/i.test(question);
}

// Fail closed: legacy documents without a project binding are not case evidence.
export function caseSnapshot(snapshot) {
  if (snapshot.mode !== 'sigma') return snapshot;
  const sameFile = value => value && snapshot.projectFile && path.resolve(value).toLowerCase() === path.resolve(snapshot.projectFile).toLowerCase();
  return {...snapshot, documents: (snapshot.documents || []).filter(d =>
    d.projectId === snapshot.projectId || sameFile(d.projectFile))};
}
