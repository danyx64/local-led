import { ZenggeDevice, probeZengge, diagnoseZengge } from './zengge.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const KEY = 'localLedIwaDevicesV1';
const SETTINGS = 'localLedIwaSettingsV1';
let current = null;
let scanAbort = false;
let sendTimer = null;
const state = { power: true, brightness: 75, temperature: 4200, color: '#7c5cff', mode: 'color' };

const loadDevices = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const saveDevices = d => localStorage.setItem(KEY, JSON.stringify(d));
const loadSettings = () => { try { return JSON.parse(localStorage.getItem(SETTINGS)) || {}; } catch { return {}; } };

function toast(text) {
  const el = $('#toast'); el.textContent = text; el.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}
function validIp(ip) { return /^((25[0-5]|2[0-4]\d|1?\d?\d)(\.|$)){4}$/.test(ip); }
function saveState() {
  if (!current) return;
  const all = loadSettings(); all[current.id] = { ...state }; localStorage.setItem(SETTINGS, JSON.stringify(all));
}
function setAccent(hex) {
  state.color = hex.toLowerCase(); state.mode = 'color';
  document.documentElement.style.setProperty('--accent', state.color);
  document.documentElement.style.setProperty('--glow', `${state.color}55`);
  $('#colorDot').style.background = state.color; $('#hexOut').textContent = state.color.toUpperCase(); $('#colorPicker').value = state.color;
  saveState(); queueSend('rgb');
}
function applyUi() {
  $('#powerText').textContent = state.power ? 'Accesa' : 'Spenta'; $('#powerBtn').classList.toggle('on', state.power);
  $('#brightness').value = state.brightness; $('#brightnessOut').textContent = `${state.brightness}%`;
  $('#temperature').value = state.temperature; $('#temperatureOut').textContent = `${state.temperature}K`;
  document.documentElement.style.setProperty('--accent', state.color); document.documentElement.style.setProperty('--glow', `${state.color}55`);
  $('#colorDot').style.background = state.color; $('#hexOut').textContent = state.color.toUpperCase(); $('#colorPicker').value = state.color;
}
function render() {
  const devices = loadDevices();
  $('#deviceList').innerHTML = devices.length ? devices.map(d => `<button class="device ${current?.id === d.id ? 'active' : ''}" data-id="${d.id}"><span>💡</span><span><b>${d.name}</b><small>${d.ip} · ${d.port ? `TCP ${d.port}` : 'diagnostica'}</small></span></button>`).join('') : '<div class="empty">Nessuna lampada salvata.</div>';
  $$('.device').forEach(b => b.onclick = () => select(b.dataset.id));
}
function select(id) {
  const d = loadDevices().find(x => x.id === id); if (!d) return;
  current = d; Object.assign(state, { power:true, brightness:75, temperature:4200, color:'#7c5cff', mode:'color' }, loadSettings()[id] || {});
  $('#deviceName').textContent = d.name; $('#statusBadge').textContent = d.port ? 'PRONTA' : 'RILEVATA'; $('#statusBadge').classList.add('ok'); $('#footerText').textContent = d.port ? `${d.ip}:${d.port}` : `${d.ip} · UDP rilevata`;
  localStorage.setItem('localLedIwaSelected', id); applyUi(); render();
}
function addDevice(ip, meta = {}) {
  const devices = loadDevices(); let d = devices.find(x => x.ip === ip);
  if (!d) {
    d = { id: crypto.randomUUID(), ip, name: meta.name || `ZENGGE ${ip.split('.').at(-1)}`, model: meta.model ?? null, port: meta.port ?? null, version: meta.version ?? null };
    devices.push(d);
  } else {
    if (meta.port) d.port = meta.port;
    if (meta.model != null) d.model = meta.model;
    if (meta.version) d.version = meta.version;
    if (meta.name) d.name = meta.name;
  }
  saveDevices(devices); select(d.id); return d;
}
async function command(kind) {
  if (!current) return toast('Seleziona prima una lampada');
  if (!current.port) throw new Error('Lampada rilevata ma porta di controllo non disponibile');
  const d = new ZenggeDevice(current.ip, current.port);
  if (kind === 'power') await d.power(state.power);
  if (kind === 'rgb') await d.rgb(state.color, state.brightness);
  if (kind === 'white') await d.white(state.temperature, state.brightness);
  $('#statusBadge').textContent = 'ONLINE'; $('#statusBadge').classList.add('ok');
}
function queueSend(kind, delay = 90) {
  if (!current) return;
  clearTimeout(sendTimer); sendTimer = setTimeout(() => command(kind).catch(e => { $('#statusBadge').textContent = 'ERRORE'; $('#statusBadge').classList.remove('ok'); toast(e.message); }), delay);
}

$('#apiBadge').textContent = globalThis.TCPSocket && globalThis.UDPSocket ? 'DIRECT SOCKETS OK' : globalThis.TCPSocket ? 'TCP OK · UDP OFF' : 'DIRECT SOCKETS OFF';
$('#apiBadge').classList.toggle('ok', !!globalThis.TCPSocket);
$('#scanBtn').onclick = async () => {
  if (!globalThis.TCPSocket) return toast('Questa pagina deve essere installata come IWA');
  const prefix = $('#subnet').value.trim();
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(prefix)) return toast('Subnet non valida');
  scanAbort = false; $('#scanBtn').disabled = true; $('#scanText').textContent = 'Ricerca ZENGGE sulla porta 5577…';
  const hosts = Array.from({length:254},(_,i)=>i+1); let done = 0; let hits = 0;
  async function worker() {
    while (hosts.length && !scanAbort) {
      const n = hosts.shift(); const ip = `${prefix}.${n}`;
      try { const meta = await probeZengge(ip); addDevice(ip, meta); hits++; } catch {}
      done++; $('#scanText').textContent = `Scansione ${done}/254 · trovate ${hits}`;
    }
  }
  await Promise.all(Array.from({length:18}, worker));
  $('#scanBtn').disabled = false; $('#scanText').textContent = `Completata · ${hits} lampade ZENGGE trovate.`; render();
};
$('#addBtn').onclick = async () => {
  const ip = $('#manualIp').value.trim(); if (!validIp(ip)) return toast('IP non valido');
  try { const meta = await probeZengge(ip); addDevice(ip, meta); toast('ZENGGE collegata su TCP 5577'); }
  catch (e) { toast(`TCP 5577: ${e.message}. Prova Diagnostica IP.`); }
};
$('#diagBtn').onclick = async () => {
  const ip = $('#manualIp').value.trim(); if (!validIp(ip)) return toast('IP non valido');
  $('#diagBtn').disabled = true; $('#scanText').textContent = `Diagnostica ${ip}: UDP 48899 + TCP 5577…`;
  try {
    const d = await diagnoseZengge(ip);
    const parts = [];
    if (d.discovery) parts.push(`Discovery: ${d.discovery}`);
    if (d.version) parts.push(`Versione: ${d.version}`);
    if (d.remoteAccess) parts.push(`Remote: ${d.remoteAccess}`);
    if (d.tcp5577) parts.push('TCP 5577: OK'); else parts.push(`TCP 5577: ${d.tcpError || 'nessuna risposta'}`);
    $('#scanText').textContent = parts.join(' · ') || 'Nessuna risposta ZENGGE su UDP 48899 o TCP 5577.';
    if (d.udp48899 || d.tcp5577) {
      const modelMatch = d.version?.match(/^\+ok=([^\r\n]+)/);
      addDevice(ip, { port: d.tcp5577 ? 5577 : null, version: d.version, name: modelMatch ? `ZENGGE ${modelMatch[1]}` : `ZENGGE ${ip.split('.').at(-1)}` });
      toast(d.tcp5577 ? 'ZENGGE controllabile trovata' : 'ZENGGE rilevata via UDP; TCP 5577 non disponibile');
    } else {
      toast('Nessuna risposta dal protocollo ZENGGE classico');
    }
  } catch (e) {
    $('#scanText').textContent = `Errore diagnostica: ${e.message}`; toast(e.message);
  } finally { $('#diagBtn').disabled = false; }
};
$('#powerBtn').onclick = () => { state.power = !state.power; saveState(); applyUi(); queueSend('power', 0); };
$('#brightness').oninput = e => { state.brightness = Number(e.target.value); $('#brightnessOut').textContent = `${state.brightness}%`; saveState(); queueSend(state.mode === 'white' ? 'white' : 'rgb', 120); };
$('#temperature').oninput = e => { state.temperature = Number(e.target.value); state.mode = 'white'; $('#temperatureOut').textContent = `${state.temperature}K`; saveState(); queueSend('white', 120); };
$$('.presets button').forEach(b => b.onclick = () => setAccent(b.dataset.color));
$('#pickerBtn').onclick = () => $('#colorPicker').click();
$('#colorPicker').oninput = e => setAccent(e.target.value);
$$('.quick button').forEach(b => b.onclick = () => { state.temperature = Number(b.dataset.temp); state.mode = 'white'; applyUi(); saveState(); queueSend('white', 0); });

render();
const saved = localStorage.getItem('localLedIwaSelected'); if (saved) select(saved); else applyUi();
