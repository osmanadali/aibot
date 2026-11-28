// Google Flow'da (flow.google.com) iş listesindeki her iş için görsel (Nano Banana) ya da video
// (Omni / Veo) üretir ve çıktı klasörüne indirir. Robotun tarayıcısında bir kez Google'a giriş
// yapılmış olmalı. Görsel üretimi 0 kredidir; video kredisi Google AI aboneliğinden düşer ve bir
// çalıştırmada en fazla flow.enFazlaKredi (ya da --en-fazla-kredi) kadar harcanır.
//
// Liste (JSON): ya iş dizisi ya da { "proje": "<flow proje adresi>", "isler": [...] }
//   { "ad": "kaktus", "istem": "…", "tur": "gorsel", "referanslar": ["C:/…/ref.png"], "oran": "9:16" }
//   { "ad": "sahne01", "istem": "…", "tur": "video", "baslangic": "C:/…/01.png", "sure": 8, "cozunurluk": "720p" }
// Alanlar (yazılmayanlar ayarlar.json > flow > gorsel / video'dan gelir):
//   tur: gorsel | video          oran: 16:9 | 4:3 | 1:1 | 3:4 | 9:16 (video: 16:9 | 9:16)
//   model: "Nano Banana 2.1", "Nano Banana Pro", "Omni 1.2 Flash", "Veo 3.1 - Lite" …
//   adet: 1-4   dusunme: Düşük | Orta | Yüksek (görsel)   cozunurluk: 360p | 720p   sure: saniye (video)
//   referanslar: görsel ya da video için "içerik öğesi" dosyaları
//   baslangic / bitis: videonun ilk / son karesi (verilirse video "Kareler" modunda üretilir)
//   indirme: görselde "1K" ya da "2K"; videoda "Orijinal" ya da menüdeki başka bir seçeneğin adı
//
// Seçenekler:  --istemler <json>  --cikti <klasör>  --proje <flow proje adresi>
//              --en-fazla-kredi <sayı>  --yeniden (bitenleri de baştan üret)

const fs = require('fs');
const path = require('path');
const { tarayiciyaBaglan, bekle } = require('../lib/tarayici');
const flow = require('../lib/flow');
const { guvenliAd } = require('../lib/gorseller');

function isleriOku(dosya, ayar) {
  if (!fs.existsSync(dosya)) throw new Error(`İş listesi bulunamadı: ${dosya}`);
  const ham = JSON.parse(fs.readFileSync(dosya, 'utf8').replace(/^\uFEFF/, ''));
  const liste = Array.isArray(ham) ? ham : ham.isler || [];
  const kullanilan = new Set();
  const isler = liste.map((is, n) => {
    const tur = is.tur === 'video' ? 'video' : 'gorsel';
    const temel = ayar[tur];
    const istem = String(is.istem || '').replace(/\s+/g, ' ').trim();
    if (!istem) throw new Error(`${n + 1}. işte istem yok.`);
    let ad = guvenliAd(is.ad || istem);
    for (let k = 2; kullanilan.has(ad); k++) ad = `${guvenliAd(is.ad || istem)}-${k}`;
    kullanilan.add(ad);
    const sonuc = { ...temel, ...is, ad, istem, tur, referanslar: is.referanslar || [] };
    sonuc.adet = Math.min(4, Math.max(1, Number(sonuc.adet) || 1));
    for (const dosya of [...sonuc.referanslar, sonuc.baslangic, sonuc.bitis].filter(Boolean)) {
      if (!fs.existsSync(dosya)) throw new Error(`${ad}: dosya bulunamadı: ${dosya}`);
    }
    if (tur === 'gorsel' && (sonuc.baslangic || sonuc.bitis)) throw new Error(`${ad}: "baslangic"/"bitis" yalnızca videoda kullanılır.`);
    if (tur === 'video' && (sonuc.baslangic || sonuc.bitis) && sonuc.referanslar.length) {
      throw new Error(`${ad}: Flow'da kareli video ile içerik öğeleri birlikte kullanılamaz; ya baslangic/bitis ya referanslar.`);
    }
    return sonuc;
  });
  return { isler, proje: Array.isArray(ham) ? '' : ham.proje || '' };
}

async function calistir(baglam) {
  const { ayarlar, secenekler, gunluk, bildir } = baglam;
  const kullanici = ayarlar.flow || {};
  const ayar = {
    ...flow.VARSAYILAN,
    ...kullanici,
    gorsel: { ...flow.VARSAYILAN.gorsel, ...(kullanici.gorsel || {}) },
    video: { ...flow.VARSAYILAN.video, ...(kullanici.video || {}) },
  };
  if (!secenekler.istemler) throw new Error('İş listesi verilmedi: --istemler <json>');
  const { isler, proje: listeProjesi } = isleriOku(path.resolve(baglam.kok, secenekler.istemler), ayar);
  const cikti = path.resolve(baglam.kok, secenekler.cikti || ayar.ciktiKlasoru || 'cikti/flow');
  fs.mkdirSync(cikti, { recursive: true });
  const durumDosyasi = path.join(cikti, 'durum.json');
  const durum = fs.existsSync(durumDosyasi) ? JSON.parse(fs.readFileSync(durumDosyasi, 'utf8')) : {};
  const projeDosyasi = path.join(cikti, 'flow-proje.txt');
  let kalanKredi = Number(secenekler['en-fazla-kredi'] || ayar.enFazlaKredi);
  gunluk(`${isler.length} iş okundu. Bu çalıştırmada en fazla ${kalanKredi} kredi harcanır.`);

  const anahtar = (is) => `${is.ad}|${is.tur}|${is.istem}`;
  const bekleyen = isler.filter((is) => secenekler.yeniden || !(durum[anahtar(is)] || []).some((d) => fs.existsSync(path.join(cikti, d))));
  for (const is of isler) if (!bekleyen.includes(is)) {
    gunluk(`${is.ad}: daha önce üretilmiş, atlanıyor.`);
    bildir({ tur: 'istem', ad: is.ad, durum: 'bitti' });
  }

  const uretilenler = [];
  const basarisizlar = [];
  let oturum = null;
  let sayfa = null;
  let ajanAcikti = null;
  try {
    if (bekleyen.length) {
      oturum = await tarayiciyaBaglan(baglam);
      sayfa = await oturum.icerik.newPage();
      let proje = secenekler.proje || listeProjesi || ayar.projeAdresi || (fs.existsSync(projeDosyasi) ? fs.readFileSync(projeDosyasi, 'utf8').trim() : '');
      if (!proje) {
        proje = await flow.projeOlustur(sayfa, ayar);
        fs.writeFileSync(projeDosyasi, `${proje}\n`);
        gunluk(`Flow'da yeni proje açıldı: ${proje} (sonraki çalıştırmalar bunu kullanır: ${projeDosyasi})`);
      }
      await flow.projeyiAc(sayfa, proje);
      ajanAcikti = await flow.ajaniKapat(sayfa);
      gunluk(`Flow projesi: ${proje}`);
    }

    for (const [sira, is] of bekleyen.entries()) {
      const etiket = `[${sira + 1}/${bekleyen.length}] ${is.ad} (${is.tur === 'video' ? `video, ${is.model}, ${is.cozunurluk}, ${is.sure} sn.` : `görsel, ${is.model}`}, ${is.oran}, x${is.adet})`;
      let dosyalar = null;
      let sonHata = null;
      for (let deneme = 1; deneme <= ayar.denemeSayisi && !dosyalar; deneme++) {
        try {
          gunluk(`${etiket}: hazırlanıyor…${deneme > 1 ? ` (deneme ${deneme})` : ''}`);
          bildir({ tur: 'istem', ad: is.ad, durum: 'uretiliyor' });
          await flow.projeyiAc(sayfa, sayfa.url().split('?')[0]);
          await flow.kutuyuTemizle(sayfa);
          const kredi = await flow.ayarlariUygula(sayfa, is);
          if (kredi === null) throw new Error('Flow kredi bilgisi okunamadı.');
          if (kredi > kalanKredi) {
            sonHata = new Error(`${kredi} kredi gerekiyor, bu çalıştırmada ${kalanKredi} kaldı; atlandı.`);
            break;
          }
          if (is.baslangic) await flow.kareEkle(sayfa, 'Başlat', is.baslangic);
          if (is.bitis) await flow.kareEkle(sayfa, 'Bitir', is.bitis);
          if (is.referanslar.length) await flow.referanslariEkle(sayfa, is.referanslar);
          const kutu = sayfa.locator('flow-rich-text-editor [role=textbox]').first();
          await kutu.click();
          await sayfa.keyboard.insertText(is.istem);
          await bekle(800);
          gunluk(`${etiket}: üretiliyor (${kredi} kredi)…`);
          const siralar = await flow.uretVeBekle(sayfa, is, ayar);
          kalanKredi -= kredi;
          dosyalar = [];
          for (const [n, s] of siralar.entries()) {
            const ad = `${is.ad}${n ? `-${n + 1}` : ''}`;
            const hedef = await flow.kutucukIndir(sayfa, s, is.indirme, cikti, ad);
            dosyalar.push(path.basename(hedef));
          }
        } catch (hata) {
          sonHata = new Error(String(hata.message).split('\n')[0]);
          gunluk(`${etiket}: olmadı. ${sonHata.message}`);
          await sayfa.keyboard.press('Escape').catch(() => {});
          if (deneme < ayar.denemeSayisi) {
            gunluk(`  ${ayar.denemeArasiDakika} dakika beklenip tekrar denenecek.`);
            await bekle(ayar.denemeArasiDakika * 60000);
          }
        }
      }
      if (!dosyalar) {
        const kanit = path.join(cikti, `hata-${is.ad}.png`);
        await sayfa.screenshot({ path: kanit }).catch(() => {});
        basarisizlar.push({ ad: is.ad, neden: sonHata ? sonHata.message : 'bilinmiyor' });
        bildir({ tur: 'istem', ad: is.ad, durum: 'hata', neden: sonHata && sonHata.message });
        gunluk(`${etiket}: BAŞARISIZ. Ekran görüntüsü: ${kanit}`);
        continue;
      }
      durum[anahtar(is)] = dosyalar;
      fs.writeFileSync(durumDosyasi, JSON.stringify(durum, null, 2));
      uretilenler.push(...dosyalar.map((d) => path.join(cikti, d)));
      gunluk(`${etiket}: kaydedildi -> ${dosyalar.join(', ')}`);
      bildir({ tur: 'istem', ad: is.ad, durum: 'bitti' });
      if (sira < bekleyen.length - 1) await bekle(ayar.istemArasiSaniye * 1000);
    }
  } finally {
    if (sayfa) {
      await flow.ajaniGeriAl(sayfa, ajanAcikti).catch(() => {});
      await sayfa.close().catch(() => {});
    }
    // Yalnızca bağlantı kesilir; tarayıcı penceresi (ve giriş) açık kalır.
    if (oturum) await oturum.tarayici.close().catch(() => {});
  }

  baglam.veri.gorseller = uretilenler;
  gunluk(`Özet: ${uretilenler.length} yeni dosya, ${basarisizlar.length} başarısız iş. Klasör: ${cikti}`);
  for (const { ad, neden } of basarisizlar) gunluk(`  ✗ ${ad}: ${neden}`);
  if (basarisizlar.length && !uretilenler.length) throw new Error('Flow\'da hiçbir iş üretilemedi.');
}

module.exports = {
  ad: 'flow-uret',
  aciklama: 'İş listesindeki görsel ve videoları Google Flow\'da (Nano Banana / Omni / Veo) üretip indirir',
  calistir,
};
