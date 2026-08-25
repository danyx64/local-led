const STORAGE_KEY = 'localLedDevicesV1';
const SETTINGS_KEY = 'localLedSettingsV1';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const defaultSettings = { power: true, brightness: 75, temperature: 4200, color: '#7c5cff' };
const state = { device: null, ...defaultSettings };

function loadDevices() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function loadAllSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
  catch { return {}; }
}

function saveCurrentSettings() {
  if (!state.device) return;
  const all = loadAllSettings();
  all[state.device.id] = {
    power: state.power,
    brightness: state.brightness,
    temperature: state.temperature,
    color: state.color
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(all));
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1800);
}

// Communication adapter. Devices start as "unknown" until a protocol adapter is added.
// The UI and per-device storage are already protocol-independent.
const driver = {
  async send(command, value) {
    if (!state.device) return;
    if (state.device.protocol === 'wled') {
      const payload = {};
      if (command === 'power') payload.on = value;
      if (command === 'brightness') payload.bri = Math.round((value / 100) * 255);
      if (command === 'color') {
        const rgb = hexToRgb(value);
        payload.seg = [{ col: [[rgb.r, rgb.g, rgb.b]] }];
      }
      if (command === 'temperature') {
        // WLED uses a color-temperature value in mireds where supported.
        payload.seg = [{ cct: Math.round(1000000 / value) }];
      }
      return fetch(`http://${state.device.ip}/json/state`, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    // Unknown lamps keep the desired state locally until their LAN protocol is identified.
  }
};

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function renderDeviceList() {
  const devices = loadDevices();
  const wrap = $('#deviceList');
  if (!devices.length) {
    wrap.innerHTML = '<div class="mini-empty">Nessuna lampada salvata.</div>';
    return;
  }
  wrap.innerHTML = devices.map(device => `
    <button class="device-item selectable ${state.device?.id === device.id ? 'active' : ''}" data-id="${device.id}" type="button">
      <span class="bulb">💡</span>
      <span class="device-meta"><strong>${device.name}</strong><span>${device.ip}</span></span>
    </button>`).join('');
  $$('.device-item.selectable').forEach(button => button.addEventListener('click', () => selectDevice(button.dataset.id)));
}

function applyStateToUi() {
  $('#powerBtn').classList.toggle('is-on', state.power);
  $('#powerBtn').setAttribute('aria-pressed', String(state.power));
  $('#powerText').textContent = state.power ? 'Accesa' : 'Spenta';
  $('#brightness').value = state.brightness;
  $('#brightnessValue').textContent = `${state.brightness}%`;
  $('#temperature').value = state.temperature;
  $('#temperatureValue').textContent = `${state.temperature}K`;
  setAccent(state.color, false);
}

function selectDevice(id) {
  const device = loadDevices().find(item => item.id === id);
  if (!device) return;
  state.device = device;
  Object.assign(state, defaultSettings, loadAllSettings()[device.id] || {});
  $('#deviceName').textContent = device.name;
  $('#connectionBadge').textContent = device.protocol === 'unknown' ? 'SALVATA' : device.protocol.toUpperCase();
  $('#connectionBadge').classList.toggle('connected', device.protocol !== 'unknown');
  $('#connectionText').textContent = device.protocol === 'unknown'
    ? `${device.ip} · impostazioni salvate. Protocollo LAN da identificare per il controllo reale.`
    : `${device.ip} · comunicazione ${device.protocol} attiva.`;
  $('#footerStatus').textContent = `${device.name} · ${device.ip}`;
  localStorage.setItem('localLedSelectedDevice', device.id);
  applyStateToUi();
  renderDeviceList();
}

function setAccent(hex, transmit = true) {
  state.color = hex.toLowerCase();
  document.documentElement.style.setProperty('--accent', state.color);
  document.documentElement.style.setProperty('--glow', `${state.color}55`);
  $('#colorDot').style.background = state.color;
  $('#hexValue').textContent = state.color.toUpperCase();
  $('#colorPicker').value = state.color;
  saveCurrentSettings();
  if (transmit) driver.send('color', state.color).catch(() => toast('Comando LAN non accettato dalla lampada'));
}

$('#powerBtn').addEventListener('click', () => {
  state.power = !state.power;
  applyStateToUi();
  saveCurrentSettings();
  driver.send('power', state.power).catch(() => toast('Comando LAN non accettato dalla lampada'));
});

$('#brightness').addEventListener('input', (event) => {
  state.brightness = Number(event.target.value);
  $('#brightnessValue').textContent = `${state.brightness}%`;
  saveCurrentSettings();
  driver.send('brightness', state.brightness).catch(() => {});
});

$('#temperature').addEventListener('input', (event) => {
  state.temperature = Number(event.target.value);
  $('#temperatureValue').textContent = `${state.temperature}K`;
  saveCurrentSettings();
  driver.send('temperature', state.temperature).catch(() => {});
});

$$('.preset').forEach(button => button.addEventListener('click', () => setAccent(button.dataset.color)));
$('#openPickerBtn').addEventListener('click', () => $('#colorPicker').click());
$('#colorPicker').addEventListener('input', (event) => setAccent(event.target.value));

$$('.scene-btn').forEach(button => button.addEventListener('click', () => {
  const values = { warm: 2700, neutral: 4200, cold: 6500 };
  state.temperature = values[button.dataset.scene];
  $('#temperature').value = state.temperature;
  $('#temperatureValue').textContent = `${state.temperature}K`;
  saveCurrentSettings();
  driver.send('temperature', state.temperature).catch(() => {});
  toast(`${button.textContent.trim()} selezionato`);
}));

const devices = loadDevices();
const requestedId = new URLSearchParams(location.search).get('device');
const selectedId = requestedId || localStorage.getItem('localLedSelectedDevice') || devices[0]?.id;
renderDeviceList();
if (selectedId) selectDevice(selectedId);
else applyStateToUi();
