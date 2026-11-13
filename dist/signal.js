// Los mensajes anteriores del sketch salen cada 20 ms. El sketch nuevo
// incluye el tiempo de la muestra para conservar su separación en el USB.
export class SampleClock {
  lastTime = -Infinity;
  lastDeviceTime;

  stamp(records, receivedAt) {
    const samples = records.filter(({ signal }) => signal !== undefined);
    if (!samples.length) return records.map((record) => [record, Math.max(this.lastTime, receivedAt)]);

    const newest = samples.at(-1).ms;
    let end = receivedAt;
    if (newest !== undefined && this.lastDeviceTime !== undefined) {
      const elapsed = (newest - this.lastDeviceTime) >>> 0;
      const expected = this.lastTime + elapsed;
      if (elapsed <= 2000 && Math.abs(receivedAt - expected) <= 250) end = Math.min(expected, receivedAt + 40);
    } else if (Number.isFinite(this.lastTime)) {
      const expected = this.lastTime + samples.length * 20;
      if (Math.abs(receivedAt - expected) <= 150) end = Math.min(expected, receivedAt + 40);
    }
    const period = Math.max(0, Math.min(20, (end - this.lastTime) / samples.length));
    let remaining = samples.length;
    const stamped = records.map((record) => {
      if (record.signal === undefined) {
        return [record, Math.max(0, this.lastTime, end - remaining * period)];
      }
      --remaining;
      const offset = newest !== undefined && record.ms !== undefined ? (newest - record.ms) >>> 0 : Infinity;
      const time = offset <= 2000 ? end - offset : end - remaining * period;
      this.lastTime = Math.max(0, this.lastTime, time);
      return [record, this.lastTime];
    });
    this.lastDeviceTime = newest;
    return stamped;
  }
}

export class PulseTrace {
  clippedUntil = -Infinity;
  previous = null;

  push({ signal, clipped }, time) {
    const atLimit = signal >= 0 && signal <= 1023 && (signal <= 2 || signal >= 1021);
    if (atLimit || clipped) {
      this.clippedUntil = Math.max(this.clippedUntil, time + (atLimit ? 1600 : 250));
      this.previous = null;
    }
    if (time < this.clippedUntil || signal === undefined) return null;

    const start = !this.previous || time - this.previous.t > 160;
    const value = start ? signal : this.previous.v + .65 * (signal - this.previous.v);
    this.previous = { t: time, v: value, raw: signal, start };
    return this.previous;
  }

  isClipped(time) {
    return time < this.clippedUntil;
  }
}
