#!/usr/bin/env node
// Robotun giriş noktası.
//   node robot.js                 -> görevleri ve akışları listeler
//   node robot.js <görev|akış>    -> çalıştırır (birden çok ad verilirse sırayla)
//   node robot.js arayuz          -> tarayıcıda açılan arayüzü başlatır
//   node robot.js <ad> --anahtar değer   -> o çalıştırma için seçenek verir
//
// Yeni bir yetenek eklemek için gorevler/ klasörüne bir dosya koymak yeterli
// (bkz. README.md, "Yeni görev ekleme").

const fs = require('fs');
const path = require('path');
const { ayarlariYukle } = require('./lib/ayarlar');

const KOK = __dirname;

// Robot arayüzden başlatıldıysa (bir üst süreç varsa) olanları ona da bildirir.
function bildir(olay, sonra) {
  if (process.send && process.connected) {
    try {
      process.send(olay, sonra);
      return;
    } catch {
      /* üst süreç kapanmış; yalnızca ekrana yazılır */
    }
  }
  if (sonra) sonra();
}

function gunluk(...parcalar) {
  const saat = new Date().toLocaleTimeString('tr-TR', { hour12: false });
  const satir = `[${saat}] ${parcalar.join(' ')}`;
  console.log(satir);
  bildir({ tur: 'gunluk', satir });
}

function gorevleriYukle() {
  const klasor = path.join(KOK, 'gorevler');
  const gorevler = {};
  for (const dosya of fs.readdirSync(klasor).filter((d) => d.endsWith('.js')).sort()) {
    const gorev = require(path.join(klasor, dosya));
    if (!gorev.ad || typeof gorev.calistir !== 'function') {
      throw new Error(`gorevler/${dosya} "ad" ve "calistir" dışa aktarmalı.`);
    }
    gorevler[gorev.ad] = gorev;
  }
  return gorevler;
}

// "--anahtar deger" ve "--anahtar=deger" biçimlerini okur; değeri olmayan bayrak true olur.
function secenekleriAyir(argumanlar) {
  const secenekler = {};
  const adlar = [];
  for (let i = 0; i < argumanlar.length; i++) {
    const arg = argumanlar[i];
    if (!arg.startsWith('--')) {
      adlar.push(arg);
      continue;
    }
    const esit = arg.indexOf('=');
    if (esit !== -1) {
      secenekler[arg.slice(2, esit)] = arg.slice(esit + 1);
    } else if (i + 1 < argumanlar.length && !argumanlar[i + 1].startsWith('--')) {
      secenekler[arg.slice(2)] = argumanlar[++i];
    } else {
      secenekler[arg.slice(2)] = true;
    }
  }
  return { adlar, secenekler };
}

function yardim(gorevler, ayarlar) {
  console.log('Kullanım: node robot.js <görev veya akış> [--seçenek değer]\n');
  console.log('Görevler:');
  for (const gorev of Object.values(gorevler)) {
    console.log(`  ${gorev.ad.padEnd(18)} ${gorev.aciklama || ''}`);
  }
  console.log('\nAkışlar (ayarlar.json > akislar):');
  for (const [ad, adimlar] of Object.entries(ayarlar.akislar || {})) {
    console.log(`  ${ad.padEnd(18)} ${adimlar.join(' -> ')}`);
  }
}

async function ana() {
  const { adlar, secenekler } = secenekleriAyir(process.argv.slice(2));
  const ayarDosyasi = path.resolve(KOK, secenekler.ayarlar || 'ayarlar.json');
  const ayarlar = ayarlariYukle(ayarDosyasi);
  const gorevler = gorevleriYukle();

  if (!adlar.length) {
    yardim(gorevler, ayarlar);
    return;
  }

  // Birden çok ad verilirse sırayla çalışır: node robot.js gorsel-uret git-gonder
  const adimlar = [];
  for (const ad of adlar) {
    if (ayarlar.akislar && ayarlar.akislar[ad]) adimlar.push(...ayarlar.akislar[ad]);
    else if (gorevler[ad]) adimlar.push(ad);
    else {
      yardim(gorevler, ayarlar);
      throw new Error(`"${ad}" adında bir görev ya da akış yok.`);
    }
  }

  // Adımlar birbirine "veri" üzerinden sonuç aktarır (ör. üretilen görsellerin yolları).
  const baglam = { kok: KOK, ayarlar, ayarDosyasi, secenekler, veri: {}, gunluk, bildir };
  for (const adim of adimlar) {
    const gorev = gorevler[adim];
    if (!gorev) throw new Error(`"${adim}" görevi bulunamadı.`);
    gunluk(`▶ ${adim} başladı`);
    await gorev.calistir(baglam);
    gunluk(`✔ ${adim} bitti`);
  }
}

ana().then(
  () => bildir({ tur: 'bitti', kod: 0 }, () => process.exit(0)),
  (hata) => {
    console.error(`\nHATA: ${hata.message}`);
    bildir({ tur: 'gunluk', satir: `HATA: ${hata.message}` });
    bildir({ tur: 'bitti', kod: 1 }, () => process.exit(1));
  }
);
