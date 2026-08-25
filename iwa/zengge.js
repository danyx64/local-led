const PORT = 5577;

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

export class ZenggeDevice {
  constructor(ip) {
    this.ip = ip;
    this.port = PORT;
  }

  async exchange(bytes, { read = false, timeout = 1100 } = {}) {
    if (!globalThis.TCPSocket) throw new Error('Direct Sockets non disponibile: avvia Local LED come IWA.');
    const socket = new TCPSocket(this.ip, this.port, { noDelay: true });
    let opened;
    const timer = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout TCP')), timeout));
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
    // Common LEDENET/ZENGGE state query: payload 81 8A 8B + checksum 96.
    const response = await this.exchange(new Uint8Array([0x81, 0x8a, 0x8b, 0x96]), { read: true, timeout: 850 });
    if (!response || response.length < 4) throw new Error('Nessuna risposta ZENGGE');
    const head = response[0];
    if (![0x81, 0x66, 0xea, 0xb0, 0xb1, 0xb2, 0xb3].includes(head)) throw new Error('Risposta TCP non riconosciuta');
    return { ip: this.ip, model: response[1] ?? null, raw: [...response] };
  }

  async power(on) {
    // Common LEDENET power packet: 71 23/24 0F + checksum.
    return this.exchange(packet([0x71, on ? 0x23 : 0x24, 0x0f]));
  }

  async rgb(hex, brightness = 100) {
    const value = parseInt(hex.replace('#', ''), 16);
    const r = scale((value >> 16) & 255, brightness);
    const g = scale((value >> 8) & 255, brightness);
    const b = scale(value & 255, brightness);
    // 9-byte LEDENET: 31 R G B W W2 writeMode persist checksum.
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
