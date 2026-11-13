import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLine } from '../dist/protocol.js';
import { PulseTrace, SampleClock } from '../dist/signal.js';

test('conserva la separación temporal de muestras agrupadas por USB', () => {
  const clock = new SampleClock();
  const first = [1000, 1020, 1040].map((ms) => ({ signal: 512, ms }));
  const next = [1060, 1080].map((ms) => ({ signal: 513, ms }));
  assert.deepEqual(clock.stamp(first, 80).map(([, time]) => time), [40, 60, 80]);
  assert.deepEqual(clock.stamp(next, 119).map(([, time]) => time), [100, 120]);
});

test('admite el sketch anterior y el desbordamiento de millis', () => {
  const clock = new SampleClock();
  const legacy = [{ signal: 512 }, { signal: 513 }, { signal: 514 }];
  assert.deepEqual(clock.stamp(legacy, 100).map(([, time]) => time), [60, 80, 100]);
  const wrappingClock = new SampleClock();
  wrappingClock.stamp([{ signal: 512, ms: 0xfffffff0 }], 80);
  assert.equal(wrappingClock.stamp([{ signal: 513, ms: 4 }], 103)[0][1], 100);
});

test('deja un hueco ante los extremos del ADC y reinicia el suavizado', () => {
  const trace = new PulseTrace();
  assert.equal(trace.push({ signal: 500 }, 0).v, 500);
  const smoothed = trace.push({ signal: 520 }, 20);
  assert.equal(smoothed.v, 513);
  assert.equal(smoothed.raw, 520);
  assert.equal(trace.push({ signal: 1023 }, 40), null);
  assert.equal(trace.push({ signal: 0 }, 60), null);
  assert.equal(trace.push({ signal: 512 }, 1659), null);
  assert.equal(trace.isClipped(1659), true);
  assert.deepEqual(trace.push({ signal: 512 }, 1660), { t: 1660, v: 512, raw: 512, start: true });
  assert.equal(trace.isClipped(1660), false);
  assert.equal(trace.push({ signal: 516 }, 1900).start, true);
});

test('acepta marcas de saturación del sketch y el tiempo de muestreo', () => {
  const trace = new PulseTrace();
  const clipped = parseLine('{"signal":512,"clipped":true,"ms":400}');
  assert.deepEqual(clipped, { signal: 512, beat: false, clipped: true, ms: 400 });
  assert.equal(trace.push(clipped, 400), null);
  assert.equal(trace.isClipped(620), true);
  assert.equal(trace.isClipped(650), false);
  assert.equal(parseLine('{"signal":512,"ms":-1}').ms, undefined);
});
