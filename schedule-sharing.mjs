import qrcode from './vendor/qrcode-generator/core/qrcode.mjs';
import './vendor/qrcode-generator/encodings/utf8.mjs';
import './vendor/qrcode-generator/renderers/svg.mjs';

export function scheduleQrSvg(text, { title = 'Power outage schedule', alt = 'Scan to get the schedule text.' } = {}) {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte', { encoding: 'UTF-8', eci: true });
  return qr.render({ renderer: 'svg', cellSize: 4, margin: 16,
    title, alt });
}
