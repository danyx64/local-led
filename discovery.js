const STORAGE_KEY = 'localLedDevicesV1';
const SETTINGS_KEY = 'localLedSettingsV1';
const $ = (selector) => document.querySelector(selector);

let scanning = false;
let scanAbort = false;
let found = [];

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1800);
}

function isValidIp(ip) {
  return /^((25[0-5]|2[0-4]\d|1?\d?\d)(\.|$)){4}$/.test(ip);
}

function loadDevices() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveDevices(devices) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
}

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
  catch { return {}; }
}

function ensureDevice(ip, name = null) {
  const devices = loadDevices();
  let device = devices.find((item) => item.ip === ip);
  if (!device) {
    device = {
      id: crypto.randomUUID ? crypto.randomUUID() : `led-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ip,
      name: name || `Lampada ${ip.split('.').at(-1)}`,
      protocol: 'unknown',
      addedAt: new Date().toISOString()
    };
    devices.push(device);
    saveDevices(devices);
  }

  const settings = loadSettings();
  if (!settings[device.id]) {
    settings[device.id] = { power: true, brightness: 75, temperature: 4200, color: '#7c5cff' };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }
  return device;
}

function renderSaved() {
  const devices = loadDevices();
  const wrap = $('#savedDevices');
  if (!devices.length) {
    wrap.innerHTML = '<div class="mini-empty">Nessuna lampada salvata.</div>';
    return;
  }
  wrap.innerHTML = devices.map(device => `
    <div class="saved-device">
      <span class="bulb">💡</span>
      <div class="device-meta grow">
        <strong>${device.name}</strong>
        <span>${device.ip} · ${device.protocol === 'unknown' ? 'protocollo da identificare' : device.protocol}</span>
      </div>
      <a class="small-btn link-btn" href="index.html?device=${encodeURIComponent(device.id)}">Apri</a>
      <button class="icon-btn remove-device" data-id="${device.id}" type="button" aria-label="Rimuovi ${device.name}">×</button>
    </div>`).join('');

  document.querySelectorAll('.remove-device').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.id;
    saveDevices(loadDevices().filter(device => device.id !== id));
    const settings = loadSettings();
    delete settings[id];
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    renderSaved();
    toast('Lampada rimossa');
  }));
}

function renderFound() {
  $('#foundCount').textContent = String(found.length);
  const wrap = $('#scanResults');
  if (!found.length) {
    wrap.className = 'scan-results empty-state';
    wrap.innerHTML = '<span class="empty-icon">⌁</span><strong>Nessun host rilevato</strong><p>La lampada potrebbe usare un protocollo non HTTP oppure il browser potrebbe bloccare la richiesta.</p>';
    return;
  }
  wrap.className = 'scan-results';
  wrap.innerHTML = found.map(ip => `
    <div class="found-device">
      <span class="bulb">💡</span>
      <div class="device-meta grow"><strong>${ip}</strong><span>Host locale raggiungibile</span></div>
      <button class="small-btn save-found" data-ip="${ip}" type="button">Salva</button>
    </div>`).join('');

  document.querySelectorAll('.save-found').forEach(button => button.addEventListener('click', () => {
    ensureDevice(button.dataset.ip);
    renderSaved();
    button.textContent = 'Salvata';
    button.disabled = true;
    toast('Lampada salvata nel browser');
  }));
}

async function probe(ip, timeout = 900) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    await fetch(`http://${ip}/`, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function scanSubnet(prefix) {
  if (scanning) return;
  if (!/^(25[0-5]|2[0-4]\d|1?\d?\d)\.(25[0-5]|2[0-4]\d|1?\d?\d)\.(25[0-5]|2[0-4]\d|1?\d?\d)$/.test(prefix)) {
    toast('Subnet non valida. Esempio: 192.168.1');
    return;
  }

  scanning = true;
  scanAbort = false;
  found = [];
  renderFound();
  $('#progressWrap').hidden = false;
  $('#scanBadge').textContent = 'SCANSIONE';
  $('#scanBadge').classList.add('connected');
  $('#startScanBtn').disabled = true;

  const hosts = Array.from({ length: 254 }, (_, i) => i + 1);
  let completed = 0;
  const concurrency = 14;

  async function worker() {
    while (hosts.length && !scanAbort) {
      const host = hosts.shift();
      const ip = `${prefix}.${host}`;
      if (await probe(ip)) {
        found.push(ip);
        renderFound();
      }
      completed += 1;
      $('#progressText').textContent = `${completed} / 254`;
      $('#progressBar').style.width = `${(completed / 254) * 100}%`;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  scanning = false;
  $('#startScanBtn').disabled = false;
  $('#scanBadge').classList.remove('connected');
  $('#scanBadge').textContent = scanAbort ? 'FERMATA' : 'COMPLETA';
  toast(scanAbort ? 'Scansione interrotta' : `Scansione completata: ${found.length} host`);
}

$('#startScanBtn').addEventListener('click', () => scanSubnet($('#subnet').value.trim()));
$('#stopScanBtn').addEventListener('click', () => { scanAbort = true; });
$('#manualAddBtn').addEventListener('click', () => {
  const ip = $('#manualIp').value.trim();
  if (!isValidIp(ip)) return toast('Inserisci un IP valido');
  ensureDevice(ip);
  renderSaved();
  toast('Lampada salvata');
});
$('#clearAllBtn').addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SETTINGS_KEY);
  renderSaved();
  toast('Lampade e impostazioni cancellate');
});

renderSaved();
