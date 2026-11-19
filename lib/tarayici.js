// Robotun kullandığı tarayıcıyı açar (ya da açıksa ona bağlanır).
//
// Tarayıcı normal bir Chrome/Edge penceresidir; robota ait ayrı bir profil
// klasörü kullanır. ChatGPT'ye bu pencerede bir kez giriş yapman yeterli,
// oturum profil klasöründe saklanır.

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');

function tarayiciYolunuBul(ayarYolu) {
  if (ayarYolu) {
    if (!fs.existsSync(ayarYolu)) throw new Error(`Tarayıcı bulunamadı: ${ayarYolu} (ayarlar.json > tarayici.yol)`);
    return ayarYolu;
  }
  const env = process.env;
  const adaylar = [
    [env.PROGRAMFILES, 'Google\\Chrome\\Application\\chrome.exe'],
    [env['PROGRAMFILES(X86)'], 'Google\\Chrome\\Application\\chrome.exe'],
    [env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe'],
    [env['PROGRAMFILES(X86)'], 'Microsoft\\Edge\\Application\\msedge.exe'],
    [env.PROGRAMFILES, 'Microsoft\\Edge\\Application\\msedge.exe'],
  ]
    .filter(([kok]) => kok)
    .map(([kok, alt]) => path.join(kok, alt));
  const bulunan = adaylar.find((aday) => fs.existsSync(aday));
  if (!bulunan) {
    throw new Error('Chrome ya da Edge bulunamadı. ayarlar.json > tarayici.yol alanına tarayıcının tam yolunu yaz.');
  }
  return bulunan;
}

function hataAyiklamaUcu(port) {
  return new Promise((coz) => {
    const istek = http.get({ host: '127.0.0.1', port, path: '/json/version', timeout: 1500 }, (yanit) => {
      yanit.resume();
      coz(yanit.statusCode === 200);
    });
    istek.on('error', () => coz(false));
    istek.on('timeout', () => {
      istek.destroy();
      coz(false);
    });
  });
}

const bekle = (ms) => new Promise((coz) => setTimeout(coz, ms));

async function tarayiciyaBaglan(baglam) {
  const ayar = baglam.ayarlar.tarayici || {};
  const port = ayar.port || 9222;

  if (!(await hataAyiklamaUcu(port))) {
    const yol = tarayiciYolunuBul(ayar.yol);
    const profil = path.resolve(baglam.kok, ayar.profilKlasoru || 'tarayici-profili');
    fs.mkdirSync(profil, { recursive: true });
    baglam.gunluk(`Tarayıcı açılıyor: ${yol}`);
    const surec = spawn(
      yol,
      [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profil}`,
        '--no-first-run',
        '--no-default-browser-check',
        // Pencere arkada kalınca ya da küçültülünce sayfa yavaşlamasın; ChatGPT o zaman yarım yüklenip kalıyor.
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-background-timer-throttling',
        ...(ayar.ekArgumanlar || []),
        'about:blank',
      ],
      { detached: true, stdio: 'ignore' }
    );
    surec.unref();

    let hazir = false;
    for (let i = 0; i < 40 && !hazir; i++) {
      await bekle(500);
      hazir = await hataAyiklamaUcu(port);
    }
    if (!hazir) throw new Error(`Tarayıcı ${port} portunda yanıt vermedi.`);
  } else {
    baglam.gunluk('Açık olan robot tarayıcısına bağlanılıyor.');
  }

  const tarayici = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const icerik = tarayici.contexts()[0];
  if (!icerik) throw new Error('Tarayıcı penceresi bulunamadı.');
  return { tarayici, icerik };
}

module.exports = { tarayiciyaBaglan, tarayiciYolunuBul, bekle };
