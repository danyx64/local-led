#!/usr/bin/env python3
"""Local LED bridge for Surplife / Magic Home / Zengge devices.

Run on a computer connected to the same LAN as the bulbs:
    pip install -r requirements.txt
    python bridge.py

The public GitHub Pages frontend talks only to http://127.0.0.1:8765.
No account or cloud service is used.
"""

from __future__ import annotations

import ipaddress
import json
import re
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from flux_led.device import WifiLedBulb

HOST = "127.0.0.1"
PORT = 8765
IP_RE = re.compile(r"(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)")


def valid_private_ip(value: str) -> str:
    ip = ipaddress.ip_address(value)
    if not ip.is_private:
        raise ValueError("Only private LAN addresses are allowed")
    return str(ip)


def discover() -> list[dict]:
    proc = subprocess.run(
        [sys.executable, "-m", "flux_led", "-s"],
        capture_output=True,
        text=True,
        timeout=18,
        check=False,
    )
    text = f"{proc.stdout}\n{proc.stderr}"
    devices = []
    seen = set()
    for candidate in IP_RE.findall(text):
        try:
            ip = valid_private_ip(candidate)
        except ValueError:
            continue
        if ip in seen:
            continue
        seen.add(ip)
        devices.append({
            "ip": ip,
            "name": f"Surplife {ip.split('.')[-1]}",
            "protocol": "surplife",
        })
    return devices


def command_device(ip: str, payload: dict) -> None:
    ip = valid_private_ip(ip)
    bulb = WifiLedBulb(ip, timeout=3)
    try:
        command = payload.get("command")
        value = payload.get("value")
        brightness = max(1, min(100, int(payload.get("brightness", 100))))

        if command == "power":
            bulb.turnOn() if bool(value) else bulb.turnOff()
        elif command == "color":
            color = str(value).lstrip("#")
            if len(color) != 6:
                raise ValueError("Invalid RGB color")
            r, g, b = int(color[0:2], 16), int(color[2:4], 16), int(color[4:6], 16)
            bulb.setRgb(r, g, b, brightness=brightness)
        elif command == "brightness":
            # Re-apply the current mode with the requested brightness.
            mode = payload.get("mode", "color")
            if mode == "white":
                bulb.setWhiteTemperature(int(payload.get("temperature", 4200)), brightness)
            else:
                color = str(payload.get("color", "#ffffff")).lstrip("#")
                r, g, b = int(color[0:2], 16), int(color[2:4], 16), int(color[4:6], 16)
                bulb.setRgb(r, g, b, brightness=brightness)
        elif command == "temperature":
            temperature = max(2200, min(7000, int(value)))
            bulb.setWhiteTemperature(temperature, brightness)
        else:
            raise ValueError("Unknown command")
    finally:
        bulb.close()


class Handler(BaseHTTPRequestHandler):
    server_version = "LocalLEDBridge/1.0"

    def _cors(self) -> None:
        origin = self.headers.get("Origin", "*")
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")

    def _json(self, status: int, data: dict | list) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            return self._json(200, {"ok": True, "service": "local-led-bridge", "version": 1})
        if path == "/discover":
            try:
                return self._json(200, {"devices": discover()})
            except Exception as exc:
                return self._json(500, {"error": str(exc)})
        self._json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        match = re.fullmatch(r"/device/([^/]+)/command", path)
        if not match:
            return self._json(404, {"error": "Not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            command_device(match.group(1), payload)
            return self._json(200, {"ok": True})
        except Exception as exc:
            return self._json(400, {"ok": False, "error": str(exc)})

    def log_message(self, fmt: str, *args) -> None:
        print(f"[Local LED] {self.address_string()} - {fmt % args}")


if __name__ == "__main__":
    print(f"Local LED bridge: http://{HOST}:{PORT}")
    print("Keep this window open while using the web app.")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
