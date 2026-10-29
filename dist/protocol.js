// Datos recibidos, nunca mediciones generadas por el navegador.
const finite = (value) => (typeof value === 'number' && Number.isFinite(value)) ||
  (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
const numeric = (value) => finite(value) ? Number(value) : undefined;

export function parseLine(line) {
  const text = line.trim();
  if (!text || text.length > 2048) return null;
  let record;
  try {
    if (text.startsWith('{')) {
      const value = JSON.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      record = {
        signal: numeric(value.signal),
        bpm: numeric(value.bpm),
        ibi: numeric(value.ibi),
        beat: value.beat === true || value.beat === 1,
      };
    } else {
      const playground = /^([SBQ])\s*(-?\d+(?:\.\d+)?)$/i.exec(text);
      if (playground) {
        const key = { S: 'signal', B: 'bpm', Q: 'ibi' }[playground[1].toUpperCase()];
        record = { [key]: Number(playground[2]), beat: key === 'bpm' };
      } else if (/^-?\d+(?:\.\d+)?$/.test(text)) {
        record = { signal: Number(text) };
      } else {
        const csv = text.split(',').map((part) => part.trim());
        if (csv.length < 2 || csv.length > 4 || !finite(csv[0])) return null;
        record = { signal: numeric(csv[0]), bpm: numeric(csv[1]), ibi: numeric(csv[2]), beat: csv[3] === '1' };
      }
    }
  } catch { return null; }
  // Cero en BPM/IBI significa que aún no hay una estimación disponible.
  if (!(record.bpm > 0 && record.bpm <= 1000)) delete record.bpm;
  if (!(record.ibi > 0 && record.ibi <= 60000)) delete record.ibi;
  if (!Number.isFinite(record.signal)) delete record.signal;
  return record.signal !== undefined || record.bpm !== undefined || record.ibi !== undefined ? record : null;
}

// El USB entrega fragmentos: una lectura no equivale a una línea completa.
export class LineBuffer {
  constructor() { this.pending = ''; }
  push(chunk) {
    this.pending += chunk;
    const parts = this.pending.split(/\r\n|\n|\r/);
    this.pending = parts.pop();
    if (this.pending.length > 4096) this.pending = '';
    return parts.filter(Boolean);
  }
}
