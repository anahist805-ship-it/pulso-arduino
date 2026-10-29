import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, LineBuffer } from '../dist/protocol.js';

test('recupera muestras JSON sin inventar las métricas ausentes', () => {
  assert.deepEqual(parseLine('{"signal":512,"bpm":72,"ibi":833,"beat":true}'), { signal:512, bpm:72, ibi:833, beat:true });
  assert.deepEqual(parseLine('{"signal":510}'), { signal:510, beat:false });
  assert.equal(parseLine('{"bpm":0,"ibi":0}'), null);
});
test('interpreta mensajes reales S/B/Q y señal numérica', () => {
  assert.deepEqual(parseLine('S512\r'), { signal:512, beat:false });
  assert.deepEqual(parseLine('B72'), { bpm:72, beat:true });
  assert.deepEqual(parseLine('Q833'), { ibi:833, beat:false });
  assert.deepEqual(parseLine('519'), { signal:519 });
  assert.deepEqual(parseLine('512,72,833,1'), { signal:512, bpm:72, ibi:833, beat:true });
});
test('descarta encabezados, texto, JSON inválido y datos no numéricos', () => {
  for (const text of ['', 'signal,bpm,ibi', 'Inicializando OLED...', '{bad}', '{"bpm":null}', '{"signal":true}', '{"signal":""}', '{"signal":"NaN"}', 'Infinity', 'B-72']) assert.equal(parseLine(text), null, text);
});
test('recompone líneas fragmentadas por USB y múltiples mensajes en un bloque', () => {
  const buffer = new LineBuffer();
  assert.deepEqual(buffer.push('{"sig'), []);
  assert.deepEqual(buffer.push('nal":512}\r\nB72\nQ8'), ['{"signal":512}', 'B72']);
  assert.deepEqual(buffer.push('33\nS514\n'), ['Q833', 'S514']);
  assert.deepEqual(buffer.push('S5\r'), ['S5']);
  assert.deepEqual(buffer.push('\n'), []);
});
test('limita fragmentos corruptos sin impedir la siguiente lectura válida', () => {
  const buffer = new LineBuffer();
  buffer.push('x'.repeat(5000));
  assert.deepEqual(buffer.push('S512\n'), ['S512']);
});
