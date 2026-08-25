const path = require('path');
const fs = require('fs');
const CopyPlugin = require('copy-webpack-plugin');
const WebBundlePlugin = require('webbundle-webpack-plugin');
const { WebBundleId, parsePemKey } = require('wbn-sign');
require('dotenv').config();

const privateKeyFile = process.env.KEYFILE || 'private.pem';
let privateKey = null;
if (process.env.KEY) privateKey = process.env.KEY;
else if (fs.existsSync(privateKeyFile)) privateKey = fs.readFileSync(privateKeyFile);

let bundlePlugin;
if (privateKey) {
  const parsed = parsePemKey(privateKey);
  bundlePlugin = new WebBundlePlugin({
    baseURL: new WebBundleId(parsed).serializeWithIsolatedWebAppOrigin(),
    output: 'local-led.swbn',
    integrityBlockSign: { key: parsed }
  });
} else {
  bundlePlugin = new WebBundlePlugin({ baseURL: '/', output: 'local-led.wbn' });
}

module.exports = {
  mode: 'production',
  entry: {},
  output: { path: path.resolve(__dirname, 'dist'), clean: true },
  plugins: [
    new CopyPlugin({ patterns: [
      { from: 'index.html', to: 'index.html' },
      { from: 'app.js', to: 'app.js' },
      { from: 'zengge.js', to: 'zengge.js' },
      { from: 'style.css', to: 'style.css' },
      { from: 'icon.svg', to: 'icon.svg' },
      { from: '.well-known/manifest.webmanifest', to: '.well-known/manifest.webmanifest' }
    ]}),
    bundlePlugin
  ]
};
