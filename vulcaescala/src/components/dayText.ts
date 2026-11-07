import { ABSENCE_LABELS, ABSENCE_TYPES, Day, Worker } from '../domain/types';

/** Texto simples da escala do dia, para colar no WhatsApp. */
export function dayAsText(label: string, day: Day, workersById: Map<string, Worker>, pending: Worker[]): string {
  const name = (id: string) => workersById.get(id)?.nome ?? '?';
  const lines = [`*ESCALA — ${label.toUpperCase()}*`, ''];
  for (const a of day.activities) {
    lines.push(`*${a.nome}*`);
    lines.push(a.workerIds.length ? a.workerIds.map(name).join(', ') : '(sem ninguém)');
    lines.push('');
  }
  for (const tipo of ABSENCE_TYPES) {
    const list = day.absences.filter((a) => a.tipo === tipo);
    if (list.length) lines.push(`${ABSENCE_LABELS[tipo].toUpperCase()}: ${list.map((a) => name(a.workerId)).join(', ')}`);
  }
  if (pending.length) lines.push('', `SEM ALOCAÇÃO: ${pending.map((w) => w.nome).join(', ')}`);
  return lines.join('\n').trim();
}
