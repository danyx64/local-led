const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  power: true,
  brightness: 75,
  temperature: 4200,
  color: '#7c5cff',
  device: null,
  demo: true
};

// Hardware drivers live behind this tiny interface. A protocol-specific driver can
// replace these methods without touching the UI.
const driver = {
  async connect(ip) {
    if (!/^((25[0-5]|2[0-4]\d|1?\d?\d)(\.|$)){4}$/.test(ip)) {
      throw new Error('Inserisci un indirizzo IP valido');
    }
    // Placeholder until the exact LAN protocol of the bulb is known.
    return { name: `Lampada ${ip}`, ip };
  },
  async setPower() {},
  async setBrightness() {},
  async setTemperature() {},
  async setColor() {}
};

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1800);
}

function renderDevice() {
  $('#deviceList').innerHTML = `
    <div class="device-item">
      <span class="bulb">💡</span>
      <span class="device-meta">
        <strong>${state.device?.name ?? 'Lampada demo'}</strong>
        <span>${state.device?.ip ?? 'Controlli simulati nel browser'}</span>
      </span>
    </div>`;
}

function setAccent(hex) {
  state.color = hex.toLowerCase();
  document.documentElement.style.setProperty('--accent', state.color);
  document.documentElement.style.setProperty('--glow', `${state.color}55`);
  $('#colorDot').style.background = state.color;
  $('#hexValue').textContent = state.color.toUpperCase();
  $('#colorPicker').value = state.color;
  driver.setColor(state.color);
}

$('#powerBtn').addEventListener('click', () => {
  state.power = !state.power;
  $('#powerBtn').classList.toggle('is-on', state.power);
  $('#powerBtn').setAttribute('aria-pressed', String(state.power));
  $('#powerText').textContent = state.power ? 'Accesa' : 'Spenta';
  driver.setPower(state.power);
});

$('#brightness').addEventListener('input', (event) => {
  state.brightness = Number(event.target.value);
  $('#brightnessValue').textContent = `${state.brightness}%`;
  driver.setBrightness(state.brightness);
});

$('#temperature').addEventListener('input', (event) => {
  state.temperature = Number(event.target.value);
  $('#temperatureValue').textContent = `${state.temperature}K`;
  driver.setTemperature(state.temperature);
});

$$('.preset').forEach((button) => button.addEventListener('click', () => setAccent(button.dataset.color)));
$('#openPickerBtn').addEventListener('click', () => $('#colorPicker').click());
$('#colorPicker').addEventListener('input', (event) => setAccent(event.target.value));

$$('.scene-btn').forEach((button) => button.addEventListener('click', () => {
  const values = { warm: 2700, neutral: 4200, cold: 6500 };
  state.temperature = values[button.dataset.scene];
  $('#temperature').value = state.temperature;
  $('#temperatureValue').textContent = `${state.temperature}K`;
  driver.setTemperature(state.temperature);
  toast(`${button.textContent.trim()} selezionato`);
}));

$('#connectBtn').addEventListener('click', async () => {
  const ip = $('#deviceIp').value.trim();
  try {
    const device = await driver.connect(ip);
    state.device = device;
    state.demo = false;
    $('#deviceName').textContent = device.name;
    $('#connectionBadge').textContent = 'PRONTA';
    $('#connectionBadge').classList.remove('demo');
    $('#connectionBadge').classList.add('connected');
    $('#connectionText').textContent = 'IP salvato. Serve ora il driver del protocollo per inviare i comandi reali.';
    $('#footerStatus').textContent = `Lampada impostata · ${device.ip}`;
    renderDevice();
    localStorage.setItem('localLedIp', ip);
    toast('Lampada impostata');
  } catch (error) {
    toast(error.message);
  }
});

$('#scanBtn').addEventListener('click', () => {
  toast('Discovery LAN verrà attivato con i driver compatibili');
});

const savedIp = localStorage.getItem('localLedIp');
if (savedIp) $('#deviceIp').value = savedIp;
renderDevice();
setAccent(state.color);
