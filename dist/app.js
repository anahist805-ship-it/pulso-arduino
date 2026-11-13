import { parseLine, LineBuffer } from './protocol.js';
import { PulseTrace, SampleClock } from './signal.js';

const $ = (id) => document.getElementById(id);
const state = {
  mode: 'idle', points: [], beats: [], records: [], count: 0,
  bpm: null, ibi: null, lastBpm: -Infinity, lastIbi: -Infinity,
  lastData: -Infinity, lastBeat: -Infinity, started: performance.now(),
  history: 5, paused: null, demoTimer: null, demoCycle: 0,
  port: null, reader: null, serialTask: null, busy: false, capped: false,
  trace: new PulseTrace(),
};
let toastTimer;
const canvas = $('waveform-canvas');
const context = canvas.getContext('2d');
const clock = () => performance.now() - state.started;
const fmt = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 });

function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6500);
}

function resetSession(mode) {
  clearInterval(state.demoTimer);
  state.demoTimer = null;
  Object.assign(state, {
    mode, points: [], beats: [], records: [], count: 0,
    bpm: null, ibi: null, lastBpm: -Infinity, lastIbi: -Infinity,
    lastData: -Infinity, lastBeat: -Infinity, started: performance.now(),
    paused: null, demoCycle: -1, capped: false, trace: new PulseTrace(),
  });
  updatePauseButton();
  updateMode();
  updateMetrics();
}

function beat(time) {
  if (time - state.lastBeat < 180) return;
  state.lastBeat = time;
  state.beats.push(time);
  state.count++;
  const heart = $('anatomical-heart');
  heart.classList.remove('is-beating');
  void heart.getBoundingClientRect();
  heart.classList.add('is-beating');
}

function ingest(data, time = clock()) {
  state.lastData = time;
  const demo = state.mode === 'demo';
  if (demo) {
    state.points.push({ t: time, v: data.signal, raw: data.signal });
  } else {
    const point = state.trace.push(data, time);
    if (point) state.points.push(point);
  }
  const clipped = !demo && state.trace.isClipped(time);
  if (clipped) {
    state.bpm = state.ibi = null;
    state.lastBpm = state.lastIbi = -Infinity;
  } else {
    if (data.bpm !== undefined) { state.bpm = data.bpm; state.lastBpm = time; }
    if (data.ibi !== undefined) {
      state.ibi = data.ibi;
      state.lastIbi = time;
      if (data.bpm === undefined) { state.bpm = 60000 / data.ibi; state.lastBpm = time; }
    }
    if (data.beat) beat(time);
  }
  state.records.push({ t: time, ...data, clipped, source: demo ? 'demo_simulada' : 'arduino_usb' });
  if (state.records.length > 90000) {
    state.records.splice(0, 1000);
    if (!state.capped) toast('La sesión es larga: el CSV conservará las muestras más recientes (hasta 90 000 registros).');
    state.capped = true;
  }
  // Solo el historial visual necesita los últimos 20 segundos.
  const cutoff = time - 20000;
  const first = state.points.findIndex((point) => point.t >= cutoff);
  if (first > 0) state.points.splice(0, first);
  if (state.points.length > 20000) state.points.splice(0, state.points.length - 20000);
  while (state.beats.length && state.beats[0] < cutoff) state.beats.shift();
}

const demoInterval = 60000 / 72;
function demoSignal(time) {
  const phase = ((time / demoInterval) % 1 + 1) % 1;
  const width = phase < .19 ? .087 : .21;
  return 512 + 48 * Math.exp(-(((phase - .19) / width) ** 2))
    - 7 * Math.exp(-(((phase - .43) / .028) ** 2))
    + 12 * Math.exp(-(((phase - .52) / .088) ** 2));
}

async function startDemo() {
  if (state.busy) return;
  if (state.port) await disconnect();
  resetSession('demo');
  // La precarga es solo visual y está identificada como demostración.
  for (let time = -15000; time < 0; time += 20) {
    const signal = demoSignal(time);
    state.points.push({ t: time, v: signal, raw: signal });
  }
  for (let time = (.19 - 18) * demoInterval; time < 0; time += demoInterval) state.beats.push(time);
  state.bpm = 72;
  state.ibi = demoInterval;
  state.lastBpm = state.lastIbi = state.lastData = 0;
  state.demoTimer = setInterval(() => {
    const time = clock();
    const cycle = Math.floor(time / demoInterval - .19);
    const isBeat = cycle > state.demoCycle;
    state.demoCycle = cycle;
    ingest({ signal: demoSignal(time), bpm: 72, ibi: demoInterval, beat: isBeat }, time);
  }, 20);
  updateMetrics();
}

function updateMode() {
  const demo = state.mode === 'demo';
  const serial = state.mode === 'serial';
  $('demo-notice').hidden = !demo;
  $('source-label').textContent = demo ? 'Demostración' : serial ? 'Arduino conectado' : state.mode === 'connecting' ? 'Conectando…' : 'Sin conexión';
  $('source-pill').classList.toggle('connected', serial);
  $('connect-button').querySelector('span').textContent = serial ? 'Desconectar' : 'Conectar Arduino';
  $('connect-button').disabled = state.busy;
  $('live-label').lastChild.textContent = demo ? 'DEMO' : serial ? 'USB' : 'EN ESPERA';
  $('live-label').classList.toggle('connected', serial);
  $('chart-source').textContent = demo ? 'Demostración' : serial ? 'Arduino por USB' : 'Sin conexión';
  $('session-source').textContent = demo ? 'Demostración' : serial ? 'Arduino · USB' : 'Sin conexión';
  $('demo-button').innerHTML = demo ? 'Reiniciar demo <span aria-hidden="true">↗</span>' : 'Ver demostración <span aria-hidden="true">↗</span>';
}

function updateMetrics() {
  const time = clock();
  const demo = state.mode === 'demo';
  const serial = state.mode === 'serial';
  const active = demo || serial;
  const fresh = active && time - state.lastData < 5000;
  const clipped = serial && state.trace.isClipped(time);
  const recent = active ? state.points.filter((point) => point.t >= time - 2000) : [];
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const { raw } of recent) {
    minimum = Math.min(minimum, raw);
    maximum = Math.max(maximum, raw);
  }
  const amplitude = maximum - minimum;
  const flat = serial && recent.length >= 2 && recent.at(-1).t - recent[0].t >= 700 && amplitude < 4;
  const usable = fresh && !clipped && !flat;
  const hasBpm = usable && time - state.lastBpm < 5000 && state.bpm !== null;
  $('bpm-value').textContent = hasBpm ? Math.round(state.bpm) : '—';
  $('ibi-value').textContent = usable && time - state.lastIbi < 5000 && state.ibi !== null ? Math.round(state.ibi) : '—';
  $('amplitude-value').textContent = !clipped && recent.length >= 2 ? fmt.format(amplitude) : '—';

  const status = $('reading-status');
  status.classList.toggle('real', serial && hasBpm);
  status.classList.toggle('warning', clipped);
  status.querySelector('span').textContent = demo ? 'Datos de demostración'
    : state.mode === 'connecting' ? 'Abriendo el puerto USB…'
    : !serial ? 'Esperando tu Arduino'
    : clipped ? 'Señal saturada · revisa el sensor'
    : flat ? 'Señal casi plana · ajusta el dedo'
    : hasBpm ? 'Pulso detectado'
    : fresh ? 'Buscando pulsos en la señal'
    : 'Esperando datos del Arduino';
  $('acquisition-label').textContent = demo ? 'Onda simulada'
    : serial && fresh ? 'Señal óptica del dedo · filtrado suave'
    : 'Esperando la señal del sensor';
  const seconds = active ? Math.floor(time / 1000) : 0;
  const minutes = Math.floor(seconds / 60);
  $('session-duration').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  $('beat-count').textContent = state.count;
  $('export-button').disabled = state.records.length === 0;
  const noSignal = !active || !state.points.length || time - state.points.at(-1).t > state.history * 1000;
  $('chart-empty').hidden = Boolean(state.paused) || (!noSignal && !clipped);
  $('chart-message').textContent = clipped ? 'Señal saturada' : serial ? 'Esperando la onda de pulso' : 'Conecta el Arduino';
  $('chart-hint').textContent = clipped ? 'Revisa los cables del sensor y apoya el dedo suavemente.'
    : serial ? 'Mantén la mano quieta unos segundos.' : 'También puedes explorar una señal de demostración.';
  $('empty-demo').hidden = serial || state.mode === 'connecting';
}

async function readPort(port) {
  const decoder = new TextDecoder();
  const lines = new LineBuffer();
  const sampleClock = new SampleClock();
  try {
    while (port.readable && state.mode === 'serial' && state.port === port) {
      const reader = port.readable.getReader();
      state.reader = reader;
      try {
        while (state.mode === 'serial') {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          const records = lines.push(decoder.decode(value, { stream: true })).map(parseLine).filter(Boolean);
          for (const [record, time] of sampleClock.stamp(records, clock())) {
            if (state.mode === 'serial') ingest(record, time);
          }
        }
      } finally {
        reader.releaseLock();
        if (state.reader === reader) state.reader = null;
      }
    }
  } catch (error) {
    if (state.mode === 'serial') toast('Se interrumpió la conexión USB. Revisa el cable y vuelve a conectar el Arduino.');
  } finally {
    try { await port.close(); } catch { /* Puede haberse retirado físicamente. */ }
    if (state.port === port) {
      state.port = null;
      state.mode = 'idle';
      state.bpm = state.ibi = null;
      updateMode();
      updateMetrics();
    }
  }
}

async function connect() {
  if (state.busy) return;
  if (state.port) { await disconnect(); return; }
  if (!('serial' in navigator) || !window.isSecureContext) {
    toast('Para conectar el Arduino, abre http://localhost:3010 en Chrome o Edge de escritorio. La demo también funciona sin USB.');
    return;
  }
  let selectedPort;
  state.busy = true;
  updateMode();
  try {
    selectedPort = await navigator.serial.requestPort();
    resetSession('connecting');
    await selectedPort.open({ baudRate: Number($('baud-select').value) });
    state.port = selectedPort;
    state.mode = 'serial';
    state.serialTask = readPort(selectedPort);
    toast('Arduino conectado. Esperando las líneas enviadas por tu programa.');
  } catch (error) {
    if (state.mode === 'connecting') resetSession('idle');
    if (error.name !== 'NotFoundError' || selectedPort) {
      toast('No se pudo abrir el puerto. Cierra el Monitor Serie de Arduino IDE, revisa el cable y comprueba la velocidad en «Cómo funciona».');
    }
  } finally {
    state.busy = false;
    updateMode();
    updateMetrics();
  }
}

async function disconnect() {
  if (!state.port) return;
  state.busy = true;
  state.mode = 'idle';
  updateMode();
  try {
    if (state.reader) await state.reader.cancel().catch(() => {});
    if (state.serialTask) await state.serialTask;
  } finally {
    state.busy = false;
    state.serialTask = null;
    state.bpm = state.ibi = null;
    updateMode();
    updateMetrics();
  }
}

function updatePauseButton() {
  const paused = Boolean(state.paused);
  $('pause-button').setAttribute('aria-pressed', String(paused));
  $('pause-button').querySelector('span').textContent = paused ? 'Reanudar gráfica' : 'Pausar gráfica';
  $('pause-button').querySelector('use').setAttribute('href', paused ? '#icon-play' : '#icon-pause');
  $('paused-badge').hidden = !paused;
}

function drawChart() {
  const bounds = canvas.getBoundingClientRect();
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const width = bounds.width, height = bounds.height;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  if (width < 55 || height < 50) return;
  const left = 43, top = 15, bottom = height - 30, right = width - 14;
  const now = state.paused ? state.paused.time : clock();
  const allPoints = state.paused ? state.paused.points : state.points;
  const allBeats = state.paused ? state.paused.beats : state.beats;
  const windowMs = state.history * 1000;
  const start = now - windowMs;
  const points = allPoints.filter((point) => point.t >= start && point.t <= now);
  let min = Infinity, max = -Infinity;
  for (const point of points) { min = Math.min(min, point.v); max = Math.max(max, point.v); }
  if (points.length) {
    const center = (min + max) / 2;
    const halfRange = Math.max((max - min) * .68, 7);
    min = center - halfRange;
    max = center + halfRange;
  } else {
    min = 0;
    max = 1023;
  }
  const x = (time) => left + (time - start) / windowMs * (right - left);
  const y = (value) => bottom - (value - min) / (max - min) * (bottom - top);
  context.font = '11px ui-monospace, monospace';
  context.lineWidth = .7;
  for (let index = 0; index <= 4; index++) {
    const yy = top + (bottom - top) * index / 4;
    if ($('grid-toggle').checked) {
      context.beginPath();context.strokeStyle = '#a2cbb225';
      context.moveTo(left, yy);context.lineTo(right, yy);context.stroke();
    }
    context.fillStyle = '#a2b9ad';context.textAlign = 'right';
    context.fillText(String(Math.round(max - (max - min) * index / 4)), left - 11, yy + 3);
  }
  for (let index = 0; index <= 4; index++) {
    const xx = left + (right - left) * index / 4;
    if ($('grid-toggle').checked) {
      context.beginPath();context.strokeStyle = '#a2cbb225';
      context.moveTo(xx, top);context.lineTo(xx, bottom);context.stroke();
    }
    const seconds = -state.history + state.history * index / 4;
    context.fillStyle = '#a2b9ad';context.textAlign = index === 4 ? 'right' : 'center';
    context.fillText(seconds === 0 ? 'ahora' : `${Number(seconds.toFixed(2))} s`, xx, height - 8);
  }
  if (points.length > 1) {
    context.beginPath();
    let previous;
    for (const point of points) {
      if (!previous || point.start || point.t - previous.t > 160) context.moveTo(x(point.t), y(point.v));
      else context.lineTo(x(point.t), y(point.v));
      previous = point;
    }
    context.strokeStyle = '#78ecae';context.lineWidth = 2.1;context.lineCap = 'round';context.lineJoin = 'round';context.stroke();
    const last = points[points.length - 1];
    if (now - last.t < 1000) {
      context.beginPath();context.arc(x(last.t), y(last.v), 3, 0, Math.PI * 2);context.fillStyle = '#78ecae';context.fill();
    }
  }
  if ($('beats-toggle').checked) {
    for (const time of allBeats) {
      if (time < start || time > now) continue;
      const point = points.find((sample) => sample.t >= time);
      if (!point || point.t - time > 80) continue;
      context.fillStyle = '#efb481';
      context.beginPath();context.arc(x(point.t), y(point.v), 3, 0, Math.PI * 2);context.fill();
    }
  }
}

$('connect-button').addEventListener('click', connect);
$('stop-demo').addEventListener('click', () => { resetSession('idle'); });
$('demo-button').addEventListener('click', startDemo);
$('empty-demo').addEventListener('click', startDemo);
$('conduction-toggle').addEventListener('change', (event) => {
  $('conduction-path').style.opacity = event.target.checked ? '1' : '0';
});
$('history-select').addEventListener('change', (event) => { state.history = Number(event.target.value); });
$('pause-button').addEventListener('click', () => {
  state.paused = state.paused ? null : { time: clock(), points: [...state.points], beats: [...state.beats] };
  updatePauseButton();
});
$('export-button').addEventListener('click', () => {
  if (!state.records.length) { toast('Todavía no hay datos para exportar.'); return; }
  // La fuente se guarda en cada descarga: nunca se presentan datos demo como reales.
  const source = state.records[0].source;
  const rows = ['source,elapsed_ms,signal_adc,bpm,ibi_ms,beat,clipped'];
  for (const record of state.records) rows.push([
    source, record.t.toFixed(1), record.signal?.toFixed(3) ?? '',
    record.clipped ? '' : record.bpm?.toFixed(2) ?? '', record.clipped ? '' : record.ibi?.toFixed(2) ?? '',
    record.beat && !record.clipped ? 1 : 0, record.clipped ? 1 : 0,
  ].join(','));
  const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pulso_${source}_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('CSV descargado. La columna source identifica el origen de los datos.');
});
const dialog = $('help-dialog');
for (const trigger of document.querySelectorAll('.help-trigger')) trigger.addEventListener('click', () => dialog.showModal());
$('close-help').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});

let lastDraw = 0, lastUI = 0;
function animate(time) {
  if (time - lastDraw > 32) { drawChart();lastDraw = time; }
  if (time - lastUI > 250) { updateMetrics();lastUI = time; }
  requestAnimationFrame(animate);
}
startDemo();
requestAnimationFrame(animate);
