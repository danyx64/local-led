const STORAGE_KEY = 'localLedDevicesV1';
const SETTINGS_KEY = 'localLedSettingsV1';
const BRIDGE = 'http://127.0.0.1:8765';
const $ = (selector) => document.querySelector(selector);
let bridgeOnline = false;
let found = [];

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2000);
}
function isValidIp(ip) { return /^((25[0-5]|2[0-4]\d|1?\d?\d)(\.|$)){4}$/.test(ip); }
function loadDevices() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } }
function saveDevices(devices) { localStorage.setItem(STORAGE_KEY, JSON.stringify(devices)); }
function loadSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; } }

function ensureDevice(ip, name = null, protocol = 'surplife') {
  const devices = loadDevices();
  let device = devices.find((item) => item.ip === ip);
  if (!device) {
    device = { id: crypto.randomUUID ? crypto.randomUUID() : `led-${Date.now()}-${Math.random().toString(16).slice(2)}`, ip, name: name || `Lampada ${ip.split('.').at(-1)}`, protocol, addedAt: new Date().toISOString() };
    devices.push(device);
  } else {
    device.protocol = protocol || device.protocol;
    if (name) device.name = name;
  }
  saveDevices(devices);
  const settings = loadSettings();
  if (!settings[device.id]) settings[device.id] = { power: true, brightness: 75, temperature: 4200, color: '#7c5cff', mode: 'color' };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  return device;
}

async function checkBridge() {
  $('#bridgeTitle').textContent = 'Controllo connessione…';
  $('#bridgeDot').className = 'bridge-status-dot checking';
  try {
    const response = await fetch(`${BRIDGE}/health`, { cache: 'no-store', signal: AbortSignal.timeout(1800) });
    if (!response.ok) throw new Error();
    bridgeOnline = true;
    $('#bridgeTitle').textContent = 'Bridge connesso';
    $('#bridgeText').textContent = 'Pronto a rilevare e comandare lampade Surplife / Magic Home / Zengge.';
    $('#bridgeDot').className = 'bridge-status-dot online';
    $('#startScanBtn').disabled = false;
  } catch {
    bridgeOnline = false;
    $('#bridgeTitle').textContent = 'Bridge non avviato';
    $('#bridgeText').textContent = 'Sul PC della stessa rete: pip install -r requirements.txt, poi python bridge.py.';
    $('#bridgeDot').className = 'bridge-status-dot offline';
    $('#startScanBtn').disabled = true;
  }
}

function renderSaved() {
  const devices = loadDevices();
  const wrap = $('#savedDevices');
  if (!devices.length) return wrap.innerHTML = '<div class="mini-empty">Nessuna lampada salvata.</div>';
  wrap.innerHTML = devices.map(device => `<div class="saved-device"><span class="bulb">💡</span><div class="device-meta grow"><strong>${device.name}</strong><span>${device.ip} · ${device.protocol}</span></div><a class="small-btn link-btn" href="index.html?device=${encodeURIComponent(device.id)}">Apri</a><button class="icon-btn remove-device" data-id="${device.id}" type="button">×</button></div>`).join('');
  document.querySelectorAll('.remove-device').forEach(button => button.addEventListener('click', () => {
    const settings = loadSettings(); delete settings[button.dataset.id]; localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    saveDevices(loadDevices().filter(d => d.id !== button.dataset.id)); renderSaved(); toast('Lampada rimossa');
  }));
}

function renderFound() {
  $('#foundCount').textContent = String(found.length);
  const wrap = $('#scanResults');
  if (!found.length) {
    wrap.className = 'scan-results empty-state';
    wrap.innerHTML = '<span class="empty-icon">⌁</span><strong>Nessuna lampada trovata</strong><p>Verifica che il PC con il bridge e la lampadina siano sulla stessa rete.</p>';
    return;
  }
  wrap.className = 'scan-results';
  wrap.innerHTML = found.map(device => `<div class="found-device"><span class="bulb">💡</span><div class="device-meta grow"><strong>${device.name || 'Lampada Surplife'}</strong><span>${device.ip} · Magic Home / Surplife</span></div><span class="protocol-pill">SURPLIFE</span><button class="small-btn save-found" data-ip="${device.ip}" type="button">Salva</button></div>`).join('');
  document.querySelectorAll('.save-found').forEach(button => button.addEventListener('click', () => {
    const item = found.find(d => d.ip === button.dataset.ip); ensureDevice(item.ip, item.name, 'surplife'); renderSaved(); button.textContent = 'Salvata'; button.disabled = true; toast('Lampada salvata');
  }));
}

async function scan() {
  if (!bridgeOnline) return checkBridge();
  $('#scanBadge').textContent = 'SCANSIONE'; $('#scanBadge').classList.add('connected'); $('#progressWrap').hidden = false; $('#startScanBtn').disabled = true;
  found = []; renderFound();
  try {
    const response = await fetch(`${BRIDGE}/discover`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Errore bridge');
    found = Array.isArray(data.devices) ? data.devices : [];
    renderFound(); $('#scanBadge').textContent = 'COMPLETA'; toast(`${found.length} lampade trovate`);
  } catch (error) {
    $('#scanBadge').textContent = 'ERRORE'; toast(error.message || 'Scansione non riuscita'); await checkBridge();
  } finally {
    $('#scanBadge').classList.remove('connected'); $('#progressWrap').hidden = true; $('#startScanBtn').disabled = !bridgeOnline;
  }
}

$('#retryBridgeBtn').addEventListener('click', checkBridge);
$('#startScanBtn').addEventListener('click', scan);
$('#manualAddBtn').addEventListener('click', () => {
  const ip = $('#manualIp').value.trim(); if (!isValidIp(ip)) return toast('Inserisci un IP valido');
  ensureDevice(ip, null, $('#manualProtocol').value); renderSaved(); toast('Lampada salvata');
});
$('#clearAllBtn').addEventListener('click', () => { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(SETTINGS_KEY); localStorage.removeItem('localLedSelectedDevice'); renderSaved(); toast('Lampade cancellate'); });

renderSaved();
checkBridge();
