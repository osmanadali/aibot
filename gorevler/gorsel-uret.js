// istemler.txt içindeki her satır için ChatGPT'de bir görsel üretir ve çıktı
// klasörüne kaydeder. Yarıda kalırsa tekrar çalıştırıldığında kaldığı yerden
// devam eder (biten istemler cikti/durum.json içinde tutulur).
//
// Seçenekler:  --istemler <dosya>   --cikti <klasör>   --yeniden (bitenleri de baştan üret)

const fs = require('fs');
const path = require('path');
const { tarayiciyaBaglan, bekle } = require('../lib/tarayici');
const { gorselUret } = require('../lib/chatgpt');
const { dosyaAdinaCevir, guvenliAd } = require('../lib/gorseller');

function istemleriOku(dosya) {
  if (!fs.existsSync(dosya)) throw new Error(`İstem dosyası bulunamadı: ${dosya}`);
  const istemler = [];
  const kullanilan = new Set();
  const ekle = (ad, istem, referanslar) => {
    // Aynı ad iki kez geçerse dosyalar birbirinin üstüne yazılmasın.
    let benzersiz = ad;
    for (let n = 2; kullanilan.has(benzersiz); n++) benzersiz = `${ad}-${n}`;
    kullanilan.add(benzersiz);
    istemler.push({ ad: benzersiz, istem, referanslar });
  };

  // Arayüzün yazdığı liste: [{ ad, istem, referanslar: [dosya yolları] }]
  if (dosya.toLowerCase().endsWith('.json')) {
    for (const is of JSON.parse(fs.readFileSync(dosya, 'utf8'))) {
      const istem = String(is.istem || '').replace(/\s+/g, ' ').trim();
      if (istem) ekle(guvenliAd(is.ad || istem), istem, is.referanslar || []);
    }
    return istemler;
  }

  const satirlar = fs.readFileSync(dosya, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  for (const ham of satirlar) {
    const satir = ham.trim();
    if (!satir || satir.startsWith('#')) continue;
    const sira = istemler.length + 1;
    const cizgi = satir.indexOf('|');
    let ad;
    let istem = satir;
    if (cizgi > 0 && satir.slice(cizgi + 1).trim()) {
      ad = dosyaAdinaCevir(satir.slice(0, cizgi));
      istem = satir.slice(cizgi + 1).trim();
    } else {
      ad = `${String(sira).padStart(3, '0')}-${dosyaAdinaCevir(satir)}`;
    }
    ekle(ad, istem, []);
  }
  return istemler;
}

async function calistir(baglam) {
  const { ayarlar, secenekler, gunluk, bildir } = baglam;
  const ayar = ayarlar.chatgpt;
  const istemDosyasi = path.resolve(baglam.kok, secenekler.istemler || ayarlar.gorselUret.istemDosyasi);
  // istemler.txt sana aittir ve güncellemelerle değişmez; ilk çalıştırmada örnekten oluşturulur.
  const ornek = path.join(baglam.kok, 'istemler.ornek.txt');
  if (!fs.existsSync(istemDosyasi) && !secenekler.istemler && fs.existsSync(ornek)) fs.copyFileSync(ornek, istemDosyasi);
  const cikti = path.resolve(baglam.kok, secenekler.cikti || ayarlar.gorselUret.ciktiKlasoru);
  fs.mkdirSync(cikti, { recursive: true });

  const durumDosyasi = path.join(cikti, 'durum.json');
  const durum = fs.existsSync(durumDosyasi) ? JSON.parse(fs.readFileSync(durumDosyasi, 'utf8')) : {};
  const istemler = istemleriOku(istemDosyasi);
  gunluk(`${istemler.length} istem okundu: ${istemDosyasi}`);

  const uretilenler = [];
  const basarisizlar = [];
  let ustUsteHata = 0;
  let oturum = null;
  let sayfa = null;

  try {
    for (let i = 0; i < istemler.length; i++) {
      const { ad, istem, referanslar } = istemler[i];
      const etiket = `[${i + 1}/${istemler.length}] ${ad}`;
      const anahtar = `${ad}|${istem}`;

      const onceki = (durum[anahtar] || []).filter((dosya) => fs.existsSync(path.join(cikti, dosya)));
      if (onceki.length && !secenekler.yeniden) {
        gunluk(`${etiket}: daha önce üretilmiş, atlanıyor.`);
        bildir({ tur: 'istem', ad, durum: 'bitti' });
        continue;
      }

      if (!sayfa) {
        oturum = await tarayiciyaBaglan(baglam);
        sayfa = await oturum.icerik.newPage();
      } else {
        await bekle(ayar.istemArasiSaniye * 1000);
      }

      const tamIstem = `${ayar.onEk || ''}${istem}${ayar.sonEk ? ` ${ayar.sonEk}` : ''}`;
      let gorseller = null;
      let sonHata = null;
      for (let deneme = 1; deneme <= ayar.denemeSayisi && !gorseller; deneme++) {
        try {
          gunluk(`${etiket}: üretiliyor…${deneme > 1 ? ` (deneme ${deneme})` : ''}`);
          bildir({ tur: 'istem', ad, durum: 'uretiliyor' });
          gorseller = await gorselUret(sayfa, tamIstem, ayar, gunluk, referanslar);
        } catch (hata) {
          // Playwright hatalarının çok satırlı çağrı dökümünü at, ilk satır yeter.
          sonHata = new Error(String(hata.message).split('\n')[0]);
          gunluk(`${etiket}: olmadı. ${sonHata.message}`);
          if (deneme < ayar.denemeSayisi) {
            gunluk(`  ${ayar.denemeArasiDakika} dakika beklenip tekrar denenecek.`);
            await bekle(ayar.denemeArasiDakika * 60 * 1000);
          }
        }
      }

      if (!gorseller) {
        const kanit = path.join(cikti, `hata-${ad}.png`);
        await sayfa.screenshot({ path: kanit }).catch(() => {});
        basarisizlar.push({ ad, neden: sonHata.message });
        bildir({ tur: 'istem', ad, durum: 'hata', neden: sonHata.message });
        gunluk(`${etiket}: BAŞARISIZ. Ekran görüntüsü: ${kanit}`);
        if (++ustUsteHata >= 2) {
          gunluk('Üst üste 2 istem başarısız oldu; görsel limiti dolmuş olabilir. Robot duruyor.');
          gunluk('Daha sonra aynı komutu tekrar çalıştır; kaldığı yerden devam eder.');
          break;
        }
        continue;
      }
      ustUsteHata = 0;

      const dosyalar = gorseller.map(({ bayt, uzanti }, n) => {
        const dosya = `${ad}${n ? `-${n + 1}` : ''}.${uzanti}`;
        fs.writeFileSync(path.join(cikti, dosya), bayt);
        return dosya;
      });
      durum[anahtar] = dosyalar;
      fs.writeFileSync(durumDosyasi, JSON.stringify(durum, null, 2));
      uretilenler.push(...dosyalar.map((dosya) => path.join(cikti, dosya)));
      gunluk(`${etiket}: kaydedildi -> ${dosyalar.join(', ')}`);
      bildir({ tur: 'istem', ad, durum: 'bitti' });
    }
  } finally {
    if (sayfa) await sayfa.close().catch(() => {});
    // Yalnızca bağlantı kesilir; tarayıcı penceresi (ve giriş) açık kalır.
    if (oturum) await oturum.tarayici.close().catch(() => {});
  }

  baglam.veri.gorseller = uretilenler;
  gunluk(`Özet: ${uretilenler.length} yeni görsel, ${basarisizlar.length} başarısız istem. Klasör: ${cikti}`);
  for (const { ad, neden } of basarisizlar) gunluk(`  ✗ ${ad}: ${neden}`);
  if (basarisizlar.length && !uretilenler.length) throw new Error('Hiç görsel üretilemedi.');
}

module.exports = {
  ad: 'gorsel-uret',
  aciklama: 'istemler.txt içindeki istemleri ChatGPT\'de sırayla üretir, görselleri klasöre kaydeder',
  calistir,
};
