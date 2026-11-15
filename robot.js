#!/usr/bin/env node
// Robotun giriş noktası.
//   node robot.js                 -> görevleri ve akışları listeler
//   node robot.js <görev|akış>    -> çalıştırır
//   node robot.js <ad> --anahtar değer   -> o çalıştırma için seçenek verir
//
// Yeni bir yetenek eklemek için gorevler/ klasörüne bir dosya koymak yeterli
// (bkz. README.md, "Yeni görev ekleme").

const fs = require('fs');
const path = require('path');

const KOK = __dirname;

function gunluk(...parcalar) {
  const saat = new Date().toLocaleTimeString('tr-TR', { hour12: false });
  console.log(`[${saat}]`, ...parcalar);
}

function ayarlariOku(dosya) {
  const yol = path.resolve(KOK, dosya || 'ayarlar.json');
  try {
    return JSON.parse(fs.readFileSync(yol, 'utf8').replace(/^﻿/, ''));
  } catch (hata) {
    throw new Error(`${yol} okunamadı: ${hata.message}`);
  }
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
  const ayarlar = ayarlariOku(secenekler.ayarlar);
  const gorevler = gorevleriYukle();
  const ad = adlar[0];

  if (!ad) {
    yardim(gorevler, ayarlar);
    return;
  }

  const adimlar = (ayarlar.akislar && ayarlar.akislar[ad]) || (gorevler[ad] ? [ad] : null);
  if (!adimlar) {
    yardim(gorevler, ayarlar);
    throw new Error(`"${ad}" adında bir görev ya da akış yok.`);
  }

  // Adımlar birbirine "veri" üzerinden sonuç aktarır (ör. üretilen görsellerin yolları).
  const baglam = { kok: KOK, ayarlar, secenekler, veri: {}, gunluk };
  for (const adim of adimlar) {
    const gorev = gorevler[adim];
    if (!gorev) throw new Error(`"${ad}" akışındaki "${adim}" görevi bulunamadı.`);
    gunluk(`▶ ${adim} başladı`);
    await gorev.calistir(baglam);
    gunluk(`✔ ${adim} bitti`);
  }
}

ana().then(
  () => process.exit(0),
  (hata) => {
    console.error(`\nHATA: ${hata.message}`);
    process.exit(1);
  }
);
