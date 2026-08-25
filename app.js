const STORAGE_KEY = 'localLedDevicesV1';
const SETTINGS_KEY = 'localLedSettingsV1';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const defaultSettings = { power: true, brightness: 75, temperature: 4200, color: '#7c5cff', mode: 'color' };
const state = { device: null, ...defaultSettings };
let sendTimer = null;

function loadDevices() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } }
function loadAllSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; } }
function saveCurrentSettings() {
  if (!state.device) return;
  const all = loadAllSettings();
  all[state.device.id] = { power: state.power, brightness: state.brightness, temperature: state.temperature, color: state.color, mode: state.mode };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(all));
}
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1900);
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

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
      if (command === 'temperature') payload.seg = [{ cct: Math.round(1000000 / value) }];
      const response = await fetch(`http://${state.device.ip}/json/state`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('WLED non raggiungibile');
      return;
    }

    if (state.device.protocol === 'zengge') {
      throw new Error('Zengge rilevata: il browser non espone il socket TCP 5577 necessario al comando diretto');
    }

    if (state.device.protocol === 'http') {
      throw new Error('Dispositivo HTTP trovato, ma non conosco ancora la sua API di controllo');
    }

    throw new Error('Protocollo Wi-Fi non ancora supportato');
  }
};

function queueSend(command, value, delay = 80) {
  clearTimeout(sendTimer);
  sendTimer = setTimeout(() => driver.send(command, value).catch(err => toast(err.message)), delay);
}

function renderDeviceList() {
  const devices = loadDevices();
  const wrap = $('#deviceList');
  if (!devices.length) {
    wrap.innerHTML = '<div class="mini-empty">Nessuna lampada salvata.</div>';
    return;
  }
  wrap.innerHTML = devices.map(device => `<button class="device-item selectable ${state.device?.id === device.id ? 'active' : ''}" data-id="${device.id}" type="button"><span class="bulb">💡</span><span class="device-meta"><strong>${device.name}</strong><span>${device.ip} · ${device.protocol}</span></span></button>`).join('');
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
  $('#connectionBadge').textContent = device.protocol.toUpperCase();
  $('#connectionBadge').classList.toggle('connected', device.protocol === 'wled');

  if (device.protocol === 'wled') $('#connectionText').textContent = `${device.ip} · controllo Wi-Fi diretto disponibile.`;
  else if (device.protocol === 'zengge') $('#connectionText').textContent = `${device.ip} · Zengge salvata. Test Wi-Fi browser-only: il protocollo TCP 5577 non è accessibile da una normale pagina web.`;
  else if (device.protocol === 'http') $('#connectionText').textContent = `${device.ip} · dispositivo HTTP raggiungibile, API da identificare.`;
  else $('#connectionText').textContent = `${device.ip} · protocollo Wi-Fi da identificare.`;

  $('#footerStatus').textContent = `${device.name} · ${device.ip}`;
  localStorage.setItem('localLedSelectedDevice', device.id);
  applyStateToUi();
  renderDeviceList();
}

function setAccent(hex, transmit = true) {
  state.color = hex.toLowerCase();
  state.mode = 'color';
  document.documentElement.style.setProperty('--accent', state.color);
  document.documentElement.style.setProperty('--glow', `${state.color}55`);
  $('#colorDot').style.background = state.color;
  $('#hexValue').textContent = state.color.toUpperCase();
  $('#colorPicker').value = state.color;
  saveCurrentSettings();
  if (transmit) queueSend('color', state.color);
}

$('#powerBtn').addEventListener('click', () => {
  state.power = !state.power;
  applyStateToUi();
  saveCurrentSettings();
  queueSend('power', state.power, 0);
});
$('#brightness').addEventListener('input', event => {
  state.brightness = Number(event.target.value);
  $('#brightnessValue').textContent = `${state.brightness}%`;
  saveCurrentSettings();
  queueSend('brightness', state.brightness, 120);
});
$('#temperature').addEventListener('input', event => {
  state.temperature = Number(event.target.value);
  state.mode = 'white';
  $('#temperatureValue').textContent = `${state.temperature}K`;
  saveCurrentSettings();
  queueSend('temperature', state.temperature, 120);
});
$$('.preset').forEach(button => button.addEventListener('click', () => setAccent(button.dataset.color)));
$('#openPickerBtn').addEventListener('click', () => $('#colorPicker').click());
$('#colorPicker').addEventListener('input', event => setAccent(event.target.value));
$$('.scene-btn').forEach(button => button.addEventListener('click', () => {
  const values = { warm: 2700, neutral: 4200, cold: 6500 };
  state.temperature = values[button.dataset.scene];
  state.mode = 'white';
  $('#temperature').value = state.temperature;
  $('#temperatureValue').textContent = `${state.temperature}K`;
  saveCurrentSettings();
  queueSend('temperature', state.temperature, 0);
}));

const devices = loadDevices();
const requestedId = new URLSearchParams(location.search).get('device');
const selectedId = requestedId || localStorage.getItem('localLedSelectedDevice') || devices[0]?.id;
renderDeviceList();
if (selectedId) selectDevice(selectedId);
else applyStateToUi();
