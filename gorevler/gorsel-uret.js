// istemler.txt içindeki her satır için ChatGPT'de bir görsel üretir ve çıktı
// klasörüne kaydeder. Yarıda kalırsa tekrar çalıştırıldığında kaldığı yerden
// devam eder (biten istemler cikti/durum.json içinde tutulur).
//
// Seçenekler:  --istemler <dosya>   --cikti <klasör>   --yeniden (bitenleri de baştan üret)
//              --es-zamanli <sayı> (aynı anda kaç sohbette üretilsin; varsayılan chatgpt.esZamanli ya da 1)

const fs = require('fs');
const path = require('path');
const { tarayiciyaBaglan, bekle } = require('../lib/tarayici');
const { gorselUret } = require('../lib/chatgpt');
const { dosyaAdinaCevir, guvenliAd } = require('../lib/gorseller');

function istemleriOku(dosya) {
  if (!fs.existsSync(dosya)) throw new Error(`İstem dosyası bulunamadı: ${dosya}`);
  const istemler = [];
  const kullanilan = new Set();
  const ekle = (ad, istem, referanslar, hedef) => {
    // Aynı ad iki kez geçerse dosyalar birbirinin üstüne yazılmasın.
    let benzersiz = ad;
    for (let n = 2; kullanilan.has(benzersiz); n++) benzersiz = `${ad}-${n}`;
    kullanilan.add(benzersiz);
    istemler.push({ ad: benzersiz, istem, referanslar, hedef: hedef || null });
  };

  // Arayüzün yazdığı liste: [{ ad, istem, referanslar: [dosya yolları] }]
  if (dosya.toLowerCase().endsWith('.json')) {
    for (const is of JSON.parse(fs.readFileSync(dosya, 'utf8'))) {
      const istem = String(is.istem || '').replace(/\s+/g, ' ').trim();
      if (istem) ekle(guvenliAd(is.ad || istem), istem, is.referanslar || [], is.hedef);
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
  const hedefler = {};
  const basarisizlar = [];
  let ustUsteHata = 0;
  let dur = false;
  let oturum = null;
  const sayfalar = [];

  // Aynı anda kaç sohbette üretileceği. Yazma/gönderme adımları sıraya konur (ChatGPT yeni sohbet
  // taslağını sekmeler arasında paylaşır); görselin beklenmesi ve indirilmesi aynı anda yürür.
  const esZamanli = Math.max(1, Number(secenekler['es-zamanli'] || ayar.esZamanli || 1));
  let kilit = Promise.resolve();
  const sirayla = (is) => {
    const sonuc = kilit.then(is);
    kilit = sonuc.then(() => bekle(1500), () => bekle(1500)); // gönderilen sohbetin adresi otursun
    return sonuc;
  };

  // ChatGPT "görsel oluşturma hız sınırına ulaşıldı, yaklaşık N dakika sonra" derse o süre boyunca
  // hiçbir sekme yeni istem göndermez; hata sayılan deneme de o süre dolunca tekrarlanır.
  let sinirBitis = 0;
  const sinirSuresi = (mesaj) => {
    if (!/hız sınırı|rate limit|too many|limit(ine)? (ulaş|reach)/i.test(mesaj)) return 0;
    const e = mesaj.match(/(\d+)\s*(dakika|minute|dk)/i);
    return (e ? Number(e[1]) : 10) + 1; // bir dakika pay
  };
  const sinirBekle = async (etiket) => {
    const kalan = sinirBitis - Date.now();
    if (kalan > 0) {
      gunluk(`${etiket}: hız sınırı için ${Math.ceil(kalan / 60000)} dakika bekleniyor…`);
      await bekle(kalan);
    }
  };

  const isle = async (i, sayfa, ilkMi) => {
    const { ad, istem, referanslar, hedef } = istemler[i];
    const etiket = `[${i + 1}/${istemler.length}] ${ad}`;
    const anahtar = `${ad}|${istem}`;

    const onceki = (durum[anahtar] || []).filter((dosya) => fs.existsSync(path.join(cikti, dosya)));
    if (onceki.length && !secenekler.yeniden) {
      gunluk(`${etiket}: daha önce üretilmiş, atlanıyor.`);
      bildir({ tur: 'istem', ad, durum: 'bitti' });
      return;
    }
    if (!ilkMi && esZamanli === 1) await bekle(ayar.istemArasiSaniye * 1000);

    const tamIstem = `${ayar.onEk || ''}${istem}${ayar.sonEk ? ` ${ayar.sonEk}` : ''}`;
    let gorseller = null;
    let sonHata = null;
    let sinirSayisi = 0; // aynı iş için en fazla 4 kez hız sınırı beklenir
    for (let deneme = 1; deneme <= ayar.denemeSayisi && !gorseller && !dur; deneme++) {
      try {
        await sinirBekle(etiket);
        gunluk(`${etiket}: üretiliyor…${deneme > 1 ? ` (deneme ${deneme})` : ''}`);
        bildir({ tur: 'istem', ad, durum: 'uretiliyor' });
        gorseller = await gorselUret(sayfa, tamIstem, ayar, gunluk, referanslar, esZamanli > 1 ? sirayla : undefined);
      } catch (hata) {
        // Playwright hatalarının çok satırlı çağrı dökümünü at, ilk satır yeter.
        sonHata = new Error(String(hata.message).split('\n')[0]);
        gunluk(`${etiket}: olmadı. ${sonHata.message}`);
        const sinirDk = sinirSuresi(sonHata.message);
        if (sinirDk && ++sinirSayisi <= 4) {
          sinirBitis = Math.max(sinirBitis, Date.now() + sinirDk * 60000);
          gunluk(`  ChatGPT hız sınırı: tüm sekmeler ${sinirDk} dakika bekleyecek; bu deneme sayılmadı.`);
          deneme--; // sınır yüzünden olmayan deneme hak yemez
          continue;
        }
        if (deneme < ayar.denemeSayisi) {
          gunluk(`  ${ayar.denemeArasiDakika} dakika beklenip tekrar denenecek.`);
          await bekle(ayar.denemeArasiDakika * 60 * 1000);
        }
      }
    }

    if (!gorseller) {
      if (!sonHata) return; // robot durduruldu
      const kanit = path.join(cikti, `hata-${ad}.png`);
      await sayfa.screenshot({ path: kanit }).catch(() => {});
      basarisizlar.push({ ad, neden: sonHata.message });
      bildir({ tur: 'istem', ad, durum: 'hata', neden: sonHata.message });
      gunluk(`${etiket}: BAŞARISIZ. Ekran görüntüsü: ${kanit}`);
      if (++ustUsteHata >= 2 && !dur) {
        dur = true;
        gunluk('Üst üste 2 istem başarısız oldu; görsel limiti dolmuş olabilir. Robot duruyor.');
        gunluk('Daha sonra aynı komutu tekrar çalıştır; kaldığı yerden devam eder.');
      }
      return;
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
    // GitHub adımı her görseli, işin metninde yazan hedefe gönderir.
    if (hedef) for (const dosya of dosyalar) hedefler[path.join(cikti, dosya)] = hedef;
    gunluk(`${etiket}: kaydedildi -> ${dosyalar.join(', ')}`);
    bildir({ tur: 'istem', ad, durum: 'bitti' });
  };

  try {
    const bekleyen = istemler.map((_, i) => i);
    const bekleyenVarMi = bekleyen.some((i) => {
      const { ad, istem } = istemler[i];
      return secenekler.yeniden || !(durum[`${ad}|${istem}`] || []).some((d) => fs.existsSync(path.join(cikti, d)));
    });
    if (bekleyenVarMi) {
      oturum = await tarayiciyaBaglan(baglam);
      if (esZamanli > 1) gunluk(`Aynı anda ${esZamanli} sohbette üretiliyor.`);
    }
    const iscilar = Array.from({ length: Math.min(esZamanli, istemler.length) }, async () => {
      let sayfa = null;
      let ilk = true;
      while (bekleyen.length && !dur) {
        const i = bekleyen.shift();
        if (!sayfa && oturum) {
          sayfa = await oturum.icerik.newPage();
          sayfalar.push(sayfa);
        }
        await isle(i, sayfa, ilk);
        ilk = false;
      }
    });
    await Promise.all(iscilar);
  } finally {
    for (const sayfa of sayfalar) await sayfa.close().catch(() => {});
    // Yalnızca bağlantı kesilir; tarayıcı penceresi (ve giriş) açık kalır.
    if (oturum) await oturum.tarayici.close().catch(() => {});
  }

  baglam.veri.gorseller = uretilenler;
  baglam.veri.hedefler = hedefler;
  gunluk(`Özet: ${uretilenler.length} yeni görsel, ${basarisizlar.length} başarısız istem. Klasör: ${cikti}`);
  for (const { ad, neden } of basarisizlar) gunluk(`  ✗ ${ad}: ${neden}`);
  if (basarisizlar.length && !uretilenler.length) throw new Error('Hiç görsel üretilemedi.');
}

module.exports = {
  ad: 'gorsel-uret',
  aciklama: 'istemler.txt içindeki istemleri ChatGPT\'de sırayla üretir, görselleri klasöre kaydeder',
  calistir,
};
