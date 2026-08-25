const STORAGE_KEY = 'localLedDevicesV1';
const SETTINGS_KEY = 'localLedSettingsV1';
const $ = (selector) => document.querySelector(selector);
let found = [];
let scanning = false;
let stopRequested = false;

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1900);
}
function isValidIp(ip) { return /^((25[0-5]|2[0-4]\d|1?\d?\d)(\.|$)){4}$/.test(ip); }
function isValidSubnet(value) { return /^(25[0-5]|2[0-4]\d|1?\d?\d)\.(25[0-5]|2[0-4]\d|1?\d?\d)\.(25[0-5]|2[0-4]\d|1?\d?\d)$/.test(value); }
function loadDevices() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } }
function saveDevices(devices) { localStorage.setItem(STORAGE_KEY, JSON.stringify(devices)); }
function loadSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; } }

function ensureDevice(ip, name = null, protocol = 'unknown') {
  const devices = loadDevices();
  let device = devices.find(item => item.ip === ip);
  if (!device) {
    device = { id: crypto.randomUUID ? crypto.randomUUID() : `led-${Date.now()}-${Math.random().toString(16).slice(2)}`, ip, name: name || `Lampada ${ip.split('.').at(-1)}`, protocol, addedAt: new Date().toISOString() };
    devices.push(device);
  } else {
    if (name) device.name = name;
    if (protocol && protocol !== 'unknown') device.protocol = protocol;
  }
  saveDevices(devices);
  const settings = loadSettings();
  if (!settings[device.id]) settings[device.id] = { power: true, brightness: 75, temperature: 4200, color: '#7c5cff', mode: 'color' };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  return device;
}

function renderSaved() {
  const devices = loadDevices();
  const wrap = $('#savedDevices');
  if (!devices.length) return wrap.innerHTML = '<div class="mini-empty">Nessuna lampada salvata.</div>';
  wrap.innerHTML = devices.map(device => `<div class="saved-device"><span class="bulb">💡</span><div class="device-meta grow"><strong>${device.name}</strong><span>${device.ip} · ${device.protocol}</span></div><a class="small-btn link-btn" href="index.html?device=${encodeURIComponent(device.id)}">Apri</a><button class="icon-btn remove-device" data-id="${device.id}" type="button">×</button></div>`).join('');
  document.querySelectorAll('.remove-device').forEach(button => button.addEventListener('click', () => {
    const settings = loadSettings();
    delete settings[button.dataset.id];
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    saveDevices(loadDevices().filter(d => d.id !== button.dataset.id));
    renderSaved();
    toast('Lampada rimossa');
  }));
}

function renderFound() {
  $('#foundCount').textContent = String(found.length);
  const wrap = $('#scanResults');
  if (!found.length) {
    wrap.className = 'scan-results empty-state';
    wrap.innerHTML = '<span class="empty-icon">⌁</span><strong>Nessun dispositivo trovato</strong><p>Se la Zengge usa solo TCP 5577 può non comparire in una scansione web. In quel caso aggiungi il suo IP manualmente per il test.</p>';
    return;
  }
  wrap.className = 'scan-results';
  wrap.innerHTML = found.map(device => `<div class="found-device"><span class="bulb">💡</span><div class="device-meta grow"><strong>${device.name}</strong><span>${device.ip} · ${device.detail}</span></div><span class="protocol-pill">${device.protocol.toUpperCase()}</span><button class="small-btn save-found" data-ip="${device.ip}" type="button">Salva</button></div>`).join('');
  document.querySelectorAll('.save-found').forEach(button => button.addEventListener('click', () => {
    const item = found.find(d => d.ip === button.dataset.ip);
    ensureDevice(item.ip, item.name, item.protocol);
    renderSaved();
    button.textContent = 'Salvata';
    button.disabled = true;
    toast('Lampada salvata');
  }));
}

async function withTimeout(url, options = {}, timeout = 850) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store', credentials: 'omit' }); }
  finally { clearTimeout(timer); }
}

async function probeDevice(ip) {
  try {
    const response = await withTimeout(`http://${ip}/json/info`, {}, 800);
    if (response.ok) {
      const info = await response.json();
      if (info && (info.ver || info.leds || info.name)) return { ip, name: info.name || `WLED ${ip.split('.').at(-1)}`, protocol: 'wled', detail: 'WLED controllabile dal browser' };
    }
  } catch {}

  try {
    await withTimeout(`http://${ip}/`, { mode: 'no-cors' }, 650);
    return { ip, name: `Dispositivo ${ip.split('.').at(-1)}`, protocol: 'http', detail: 'host HTTP locale raggiungibile' };
  } catch {}
  return null;
}

async function scanSubnet() {
  if (scanning) return;
  const subnet = $('#subnet').value.trim();
  if (!isValidSubnet(subnet)) return toast('Subnet non valida. Esempio: 192.168.1');

  scanning = true;
  stopRequested = false;
  found = [];
  renderFound();
  $('#progressWrap').hidden = false;
  $('#scanBadge').textContent = 'SCANSIONE';
  $('#scanBadge').classList.add('connected');
  $('#startScanBtn').disabled = true;

  const queue = Array.from({ length: 254 }, (_, i) => i + 1);
  let done = 0;
  async function worker() {
    while (queue.length && !stopRequested) {
      const host = queue.shift();
      const result = await probeDevice(`${subnet}.${host}`);
      if (result) { found.push(result); found.sort((a,b) => Number(a.ip.split('.').at(-1)) - Number(b.ip.split('.').at(-1))); renderFound(); }
      done += 1;
      $('#progressText').textContent = `${done} / 254`;
      $('#progressBar').style.width = `${(done / 254) * 100}%`;
    }
  }

  await Promise.all(Array.from({ length: 16 }, worker));
  scanning = false;
  $('#startScanBtn').disabled = false;
  $('#scanBadge').classList.remove('connected');
  $('#scanBadge').textContent = stopRequested ? 'FERMATA' : 'COMPLETA';
  toast(stopRequested ? 'Scansione interrotta' : `${found.length} dispositivi trovati`);
}

$('#startScanBtn').addEventListener('click', scanSubnet);
$('#stopScanBtn').addEventListener('click', () => { stopRequested = true; });
$('#manualAddBtn').addEventListener('click', () => {
  const ip = $('#manualIp').value.trim();
  if (!isValidIp(ip)) return toast('Inserisci un IP valido');
  const protocol = $('#manualProtocol').value;
  const name = protocol === 'zengge' ? `Zengge ${ip.split('.').at(-1)}` : null;
  ensureDevice(ip, name, protocol);
  renderSaved();
  toast('Lampada salvata per il test');
});
$('#clearAllBtn').addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem('localLedSelectedDevice');
  renderSaved();
  toast('Lampade cancellate');
});

renderSaved();
