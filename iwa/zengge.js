const PORT = 5577;
const DISCOVERY_PORT = 48899;

function checksum(bytes) {
  return bytes.reduce((sum, value) => (sum + value) & 0xff, 0);
}

function packet(body) {
  const out = [...body];
  out.push(checksum(out));
  return new Uint8Array(out);
}

function scale(value, brightness) {
  return Math.round(Math.max(0, Math.min(255, value)) * Math.max(1, Math.min(100, brightness)) / 100);
}

function timeoutPromise(ms, message = 'Timeout') {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
}

export class ZenggeDevice {
  constructor(ip, port = PORT) {
    this.ip = ip;
    this.port = port;
  }

  async exchange(bytes, { read = false, timeout = 1100 } = {}) {
    if (!globalThis.TCPSocket) throw new Error('Direct Sockets non disponibile: avvia Local LED come IWA.');
    const socket = new TCPSocket(this.ip, this.port, { noDelay: true });
    let opened;
    const timer = timeoutPromise(timeout, `Timeout TCP ${this.port}`);
    try {
      opened = await Promise.race([socket.opened, timer]);
      const writer = opened.writable.getWriter();
      await writer.write(bytes);
      writer.releaseLock();
      if (!read) return null;
      const reader = opened.readable.getReader();
      const result = await Promise.race([reader.read(), timer]);
      reader.releaseLock();
      return result?.value ? new Uint8Array(result.value) : null;
    } finally {
      try { await socket.close(); } catch {}
    }
  }

  async identify() {
    const response = await this.exchange(new Uint8Array([0x81, 0x8a, 0x8b, 0x96]), { read: true, timeout: 900 });
    if (!response || response.length < 4) throw new Error('Nessuna risposta ZENGGE');
    const head = response[0];
    if (![0x81, 0x66, 0xea, 0xb0, 0xb1, 0xb2, 0xb3].includes(head)) throw new Error('Risposta TCP non riconosciuta');
    return { ip: this.ip, port: this.port, model: response[1] ?? null, raw: [...response] };
  }

  async power(on) {
    return this.exchange(packet([0x71, on ? 0x23 : 0x24, 0x0f]));
  }

  async rgb(hex, brightness = 100) {
    const value = parseInt(hex.replace('#', ''), 16);
    const r = scale((value >> 16) & 255, brightness);
    const g = scale((value >> 8) & 255, brightness);
    const b = scale(value & 255, brightness);
    return this.exchange(packet([0x31, r, g, b, 0x00, 0x00, 0xf0, 0x0f]));
  }

  async white(kelvin, brightness = 100) {
    const t = Math.max(2700, Math.min(6500, kelvin));
    const mix = (t - 2700) / (6500 - 2700);
    const max = Math.round(255 * Math.max(1, Math.min(100, brightness)) / 100);
    const warm = Math.round(max * (1 - mix));
    const cold = Math.round(max * mix);
    return this.exchange(packet([0x31, 0x00, 0x00, 0x00, warm, cold, 0x0f, 0x0f]));
  }
}

export async function probeZengge(ip) {
  const device = new ZenggeDevice(ip);
  return device.identify();
}

async function udpRequest(ip, text, timeout = 1300) {
  if (!globalThis.UDPSocket) throw new Error('UDPSocket non disponibile');
  const socket = new UDPSocket({ remoteAddress: ip, remotePort: DISCOVERY_PORT });
  let opened;
  try {
    opened = await Promise.race([socket.opened, timeoutPromise(timeout, 'Timeout apertura UDP')]);
    const writer = opened.writable.getWriter();
    await writer.write(new TextEncoder().encode(text));
    writer.releaseLock();
    const reader = opened.readable.getReader();
    const result = await Promise.race([reader.read(), timeoutPromise(timeout, 'Timeout UDP 48899')]);
    reader.releaseLock();
    if (!result?.value) return null;
    const data = result.value.data || result.value;
    return new TextDecoder().decode(data).replace(/\0/g, '').trim();
  } finally {
    try { await socket.close(); } catch {}
  }
}

export async function diagnoseZengge(ip) {
  const result = {
    ip,
    udp48899: false,
    discovery: null,
    version: null,
    remoteAccess: null,
    tcp5577: false,
    tcpError: null
  };

  const queries = [
    ['discovery', 'HF-A11ASSISTHREAD'],
    ['version', 'AT+LVER\r'],
    ['remoteAccess', 'AT+SOCKB\r']
  ];

  for (const [key, query] of queries) {
    try {
      const reply = await udpRequest(ip, query);
      if (reply) {
        result.udp48899 = true;
        result[key] = reply;
      }
    } catch {}
  }

  try {
    const meta = await probeZengge(ip);
    result.tcp5577 = true;
    result.tcp = meta;
  } catch (error) {
    result.tcpError = error?.message || String(error);
  }

  return result;
}
