// ChatGPT web sayfasını süren parça: istemi yazar, (varsa) referans görselleri
// ekler, görselin bitmesini bekler ve baytlarını döndürür.
//
// ChatGPT arayüzünü sık değiştirdiği için sayfadaki öğeler sabit adlarla değil,
// ne olduklarına bakılarak bulunur:
//   - istem kutusu: görünen en büyük yazı alanı
//   - gönder / durdur düğmeleri: etiketinde "gönder"/"send", "durdur"/"stop" geçenler
//   - üretilen görsel: gönderimden sonra sayfada beliren yeni ve büyük resimler
// ayarlar.json > chatgpt.seciciler altındaki adresler varsa önce onlar denenir.

const fs = require('fs');
const { bekle } = require('./tarayici');

const VARSAYILAN_SECICILER = {
  istemKutusu: "#prompt-textarea, #mobile-composer-prompt, textarea[name='prompt']",
  gonderDugmesi: "[data-testid='send-button'], #composer-submit-button",
  durdurDugmesi: "[data-testid='stop-button']",
  girisDugmesi: "[data-testid='login-button']",
  kullaniciMesaji: "[data-message-author-role='user']",
  dosyaGirdisi: "input[type='file']",
};

// Sayfanın o anki hâlini okur ve bulduğu istem kutusu ile gönder düğmesini
// (data-robot-kutu / data-robot-gonder) işaretler.
async function sayfaDurumu(sayfa, s) {
  return sayfa.evaluate((seciciler) => {
    const gorunur = (e) => {
      const kutu = e.getBoundingClientRect();
      const stil = getComputedStyle(e);
      return kutu.width > 1 && kutu.height > 1 && stil.visibility !== 'hidden' && stil.display !== 'none';
    };
    const sec = (secici) => {
      try {
        return secici ? [...document.querySelectorAll(secici)] : [];
      } catch {
        return [];
      }
    };
    const alan = (e) => e.getBoundingClientRect().width * e.getBoundingClientRect().height;
    const isaretle = (ad, oge) => {
      for (const eski of document.querySelectorAll(`[${ad}]`)) eski.removeAttribute(ad);
      if (oge) oge.setAttribute(ad, '1');
    };
    const etiket = (e) => (e.getAttribute('aria-label') || e.getAttribute('title') || e.innerText || '').replace(/\s+/g, ' ').trim();
    const kapaliMi = (e) => e.disabled || e.getAttribute('aria-disabled') === 'true';

    // İstem kutusu
    let adaylar = sec(seciciler.istemKutusu).filter(gorunur);
    if (!adaylar.length) adaylar = sec('textarea, [contenteditable="true"]').filter((e) => gorunur(e) && !e.readOnly && !e.disabled);
    const kutu = adaylar.sort((a, b) => alan(b) - alan(a))[0] || null;
    isaretle('data-robot-kutu', kutu);

    const dugmeler = sec('button, [role="button"], a').filter(gorunur);
    const girisGerek =
      sec(seciciler.girisDugmesi).some(gorunur) ||
      dugmeler.some((e) => /^(oturum aç|giriş yap|log in|sign in)$/i.test(etiket(e)));
    const uretiliyor =
      sec(seciciler.durdurDugmesi).some(gorunur) ||
      dugmeler.some((e) => /durdur|stop/i.test(e.getAttribute('aria-label') || ''));

    const gonder =
      sec(seciciler.gonderDugmesi).filter(gorunur)[0] ||
      dugmeler.find((e) => /gönder|send|submit/i.test(e.getAttribute('aria-label') || '') && !/geri bildirim|feedback/i.test(etiket(e))) ||
      null;
    isaretle('data-robot-gonder', gonder);

    const kisa = (e) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${etiket(e) ? ` "${etiket(e).slice(0, 30)}"` : ''}`;
    return {
      kutuVar: Boolean(kutu),
      kutuMetni: kutu ? String(kutu.value !== undefined ? kutu.value : kutu.innerText).trim() : '',
      girisGerek,
      uretiliyor,
      gonderVar: Boolean(gonder),
      gonderEtkin: Boolean(gonder) && !kapaliMi(gonder),
      adres: location.href,
      // Bir şey bulunamadığında günlükte gösterilecek kısa özet.
      tani: {
        alanlar: sec('textarea, [contenteditable="true"]').filter(gorunur).map(kisa).slice(0, 5),
        dugmeler: dugmeler.filter((e) => e.tagName === 'BUTTON').map(kisa).slice(0, 14),
      },
    };
  }, s);
}

const taniMetni = (durum) => `alanlar=[${durum.tani.alanlar.join(', ')}] düğmeler=[${durum.tani.dugmeler.join(', ')}]`;

// Sayfadaki yeterince büyük ve yüklenmesi bitmiş resimlerin adresleri.
// Ayarlardaki kullanıcı mesajı adresi sayfada varsa, son kullanıcı mesajının
// içindeki ya da ondan önce gelen resimler (eklenen referanslar) sayılmaz.
async function buyukGorseller(sayfa, enKucukPx, kullaniciSecici) {
  return sayfa.evaluate(
    ({ px, secici }) => {
      let sonKullanici = null;
      try {
        const mesajlar = secici ? document.querySelectorAll(secici) : [];
        sonKullanici = mesajlar.length ? mesajlar[mesajlar.length - 1] : null;
      } catch {
        sonKullanici = null;
      }
      const adresler = [];
      for (const resim of document.querySelectorAll('img')) {
        const adres = resim.currentSrc || resim.src;
        if (!adres || !resim.complete) continue;
        if (resim.naturalWidth < px || resim.naturalHeight < px) continue;
        if (sonKullanici) {
          if (sonKullanici.contains(resim)) continue;
          if (sonKullanici.compareDocumentPosition(resim) & Node.DOCUMENT_POSITION_PRECEDING) continue;
        }
        if (!adresler.includes(adres)) adresler.push(adres);
      }
      return adresler;
    },
    { px: enKucukPx, secici: kullaniciSecici }
  );
}

// Sayfadaki yazıda istemden sonra gelen kısım: görsel gelmediğinde ChatGPT'nin ne dediği.
async function istemdenSonrakiMetin(sayfa, istem) {
  try {
    return await sayfa.evaluate((metin) => {
      const tumu = document.body.innerText;
      const bas = tumu.lastIndexOf(metin.slice(0, 40));
      if (bas < 0) return '';
      return tumu.slice(bas + metin.length).replace(/\s+/g, ' ').trim().slice(0, 300);
    }, istem);
  } catch {
    return '';
  }
}

// İstem kutusu kullanılabilir olana kadar bekler. Giriş yapılmamışsa ya da bir
// doğrulama ekranı varsa kullanıcının tarayıcı penceresinde halletmesini bekler.
async function sohbetiHazirla(sayfa, ayar, gunluk) {
  const s = ayar.seciciler;
  await sayfa.goto(ayar.adres, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const baslangic = Date.now();
  const sonZaman = baslangic + 10 * 60 * 1000;
  let uyari = '';
  let taniYazildi = false;
  let durum = null;
  while (Date.now() < sonZaman) {
    durum = await sayfaDurumu(sayfa, s).catch(() => null); // sayfa yenilenirken okunamayabilir
    if (durum && durum.kutuVar && !durum.girisGerek) {
      // Giriş bu bekleme sırasında yapıldıysa temiz bir sohbetle başla.
      if (uyari) {
        await sayfa.goto(ayar.adres, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await bekle(1500);
        durum = await sayfaDurumu(sayfa, s).catch(() => null);
        if (!durum || !durum.kutuVar) continue;
      }
      return;
    }
    // Sayfa ilk yüklenirken kutu birkaç saniye görünmeyebilir; hemen uyarma.
    if (Date.now() - baslangic > 6000 && durum) {
      const yeniUyari = durum.girisGerek
        ? 'ChatGPT\'ye giriş yapılmamış görünüyor. Robotun tarayıcı penceresinde giriş yap; robot bekliyor…'
        : 'ChatGPT\'nin istem kutusu bulunamadı. Tarayıcı penceresinde bir doğrulama ya da uyarı varsa geç; robot bekliyor…';
      if (yeniUyari !== uyari) {
        gunluk(yeniUyari);
        uyari = yeniUyari;
      }
      if (!durum.girisGerek && !taniYazildi && Date.now() - baslangic > 20000) {
        gunluk(`  Tanı: ${taniMetni(durum)}`);
        taniYazildi = true;
      }
    }
    await bekle(1500);
  }
  throw new Error(`ChatGPT istem kutusu 10 dakika içinde hazır olmadı.${durum ? ` Tanı: ${taniMetni(durum)}` : ''}`);
}

// Referans görselleri sayfadaki dosya yükleme alanına verir ve yüklenmelerini bekler.
async function referanslariEkle(sayfa, s, referanslar) {
  const bulundu = await sayfa.evaluate((secici) => {
    let adaylar = [];
    try {
      adaylar = [...document.querySelectorAll(secici)];
    } catch {
      adaylar = [];
    }
    if (!adaylar.length) adaylar = [...document.querySelectorAll('input[type="file"]')];
    const kimlik = (e) => `${e.id} ${e.name} ${e.accept || ''}`;
    // Kamera alanı değil, görsel (yoksa dosya) alanı tercih edilir.
    const puan = (e) => (/camera|kamera/i.test(kimlik(e)) ? -1 : /photo|image|gorsel/i.test(kimlik(e)) ? 2 : /file|upload/i.test(kimlik(e)) ? 1 : 0);
    const secilen = adaylar.sort((a, b) => puan(b) - puan(a))[0];
    for (const eski of document.querySelectorAll('[data-robot-dosya]')) eski.removeAttribute('data-robot-dosya');
    if (!secilen) return false;
    secilen.setAttribute('data-robot-dosya', '1');
    return true;
  }, s.dosyaGirdisi);
  if (!bulundu) throw new Error('Referans görsel eklenecek alan sayfada bulunamadı.');

  try {
    await sayfa.locator('[data-robot-dosya]').setInputFiles(referanslar, { timeout: 15000 });
  } catch (hata) {
    throw new Error(`Referans görsel eklenemedi (${String(hata.message).split('\n')[0]}).`);
  }

  // Yükleme bitene kadar gönder düğmesi kapalı kalır; düğme tanınamıyorsa sabit süre beklenir.
  await bekle(2500);
  const sonZaman = Date.now() + 120000;
  let durum = await sayfaDurumu(sayfa, s);
  if (!durum.gonderVar) {
    await bekle(6000);
    return;
  }
  while (Date.now() < sonZaman && !durum.gonderEtkin) {
    await bekle(700);
    durum = await sayfaDurumu(sayfa, s);
  }
  if (!durum.gonderEtkin) throw new Error('Referans görselin yüklenmesi bitmedi.');
}

async function istemiGonder(sayfa, istem, s, referanslar) {
  const kutu = sayfa.locator('[data-robot-kutu]');
  await kutu.click();
  await kutu.fill(istem);
  if (referanslar.length) await referanslariEkle(sayfa, s, referanslar);
  await bekle(600); // gönder düğmesi yazı girilince belirir

  const oncekiAdres = sayfa.url();
  const gonderildiMi = async () => {
    for (let i = 0; i < 6; i++) {
      await bekle(500);
      const durum = await sayfaDurumu(sayfa, s).catch(() => null);
      if (durum && (!durum.kutuMetni || durum.adres !== oncekiAdres)) return true;
    }
    return false;
  };

  // Hangisinin çalıştığı arayüze göre değişir; istem kutusu boşalana kadar sırayla denenir.
  const yontemler = [
    async () => {
      const durum = await sayfaDurumu(sayfa, s);
      if (!durum.gonderEtkin) return false;
      await sayfa.locator('[data-robot-gonder]').click({ timeout: 3000 });
      return true;
    },
    async () => (await kutu.press('Enter'), true),
    async () => (await kutu.press('Control+Enter'), true),
    // Son çare: istem kutusunun bulunduğu çubuktaki en sağdaki düğme.
    async () => {
      const bulundu = await sayfa.evaluate(() => {
        const gorunur = (e) => e.getBoundingClientRect().width > 1 && getComputedStyle(e).visibility !== 'hidden';
        let kap = document.querySelector('[data-robot-kutu]');
        for (let i = 0; kap && i < 6; i++) {
          kap = kap.parentElement;
          const dugmeler = kap ? [...kap.querySelectorAll('button')].filter((d) => gorunur(d) && !d.disabled) : [];
          if (dugmeler.length >= 2) {
            const enSag = dugmeler.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
            for (const eski of document.querySelectorAll('[data-robot-gonder]')) eski.removeAttribute('data-robot-gonder');
            enSag.setAttribute('data-robot-gonder', '1');
            return true;
          }
        }
        return false;
      });
      if (!bulundu) return false;
      await sayfa.locator('[data-robot-gonder]').click({ timeout: 3000 });
      return true;
    },
  ];
  for (const yontem of yontemler) {
    const denendi = await yontem().catch(() => false);
    if (denendi && (await gonderildiMi())) return;
  }
  const durum = await sayfaDurumu(sayfa, s);
  throw new Error(`İstem gönderilemedi (gönder düğmesi bulunamadı). Tanı: ${taniMetni(durum)}`);
}

// Gönderimden sonra beliren görsel(ler)in adreslerini döndürür.
async function gorseliBekle(sayfa, oncekiler, istem, ayar) {
  const s = ayar.seciciler;
  const baslangic = Date.now();
  const sonZaman = baslangic + ayar.gorselBeklemeDakika * 60 * 1000;
  const metinSonrasiMs = ayar.metinSonrasiSaniye * 1000;
  // Gönderimin hemen ardından beliren büyük resimler üretilen görsel olamaz;
  // bunlar kullanıcının mesajındaki referanslardır ve sayılmaz.
  const ekSuresiMs = (ayar.ekBeklemeSaniye === undefined ? 5 : ayar.ekBeklemeSaniye) * 1000;
  const gorulenler = new Set(oncekiler);
  for (const adres of await buyukGorseller(sayfa, ayar.enKucukGorselPx, s.kullaniciMesaji)) gorulenler.add(adres);

  let sonDurum = '';
  let sonDegisim = Date.now();
  let uretimGoruldu = false;
  let uretimBitti = null;

  while (Date.now() < sonZaman) {
    const ekAsamasi = Date.now() - baslangic < ekSuresiMs;
    await bekle(ekAsamasi ? 250 : 1500);
    const durum = await sayfaDurumu(sayfa, s).catch(() => null);
    if (!durum) continue;
    const simdiki = await buyukGorseller(sayfa, ayar.enKucukGorselPx, s.kullaniciMesaji);
    if (ekAsamasi) {
      for (const adres of simdiki) gorulenler.add(adres);
      if (durum.uretiliyor) uretimGoruldu = true;
      continue;
    }
    const yeniler = simdiki.filter((adres) => !gorulenler.has(adres));

    const imza = yeniler.join('\n');
    if (imza !== sonDurum) {
      sonDurum = imza;
      sonDegisim = Date.now();
    }

    if (durum.uretiliyor) {
      uretimGoruldu = true;
      uretimBitti = null;
      // "Üretiliyor" işareti yanlış tanınıp hiç sönmese bile uzun süredir değişmeyen görsel kabul edilir.
      if (yeniler.length && Date.now() - sonDegisim >= (ayar.uzunKararliSaniye || 60) * 1000) return yeniler;
      continue;
    }
    if (uretimGoruldu && uretimBitti === null) uretimBitti = Date.now();

    // "Üretiliyor" işareti hiç görülemediyse görselin tamamlandığından emin olmak için daha uzun beklenir.
    const kararliMs = (uretimGoruldu ? ayar.kararliSaniye : Math.max(ayar.kararliSaniye, ayar.isaretsizKararliSaniye || 25)) * 1000;
    if (yeniler.length && Date.now() - sonDegisim >= kararliMs) return yeniler;

    // Yanıt bitti ama görsel yok: ChatGPT yalnızca yazıyla yanıt vermiş olabilir.
    if (!yeniler.length && uretimBitti !== null && Date.now() - uretimBitti >= metinSonrasiMs) break;
  }

  const metin = await istemdenSonrakiMetin(sayfa, istem);
  // Yanıtın bittiği hiç anlaşılamadıysa sayfadaki düğmeler de yazılır; arayüz değişmiş olabilir.
  const sonDurumu = uretimGoruldu ? null : await sayfaDurumu(sayfa, s).catch(() => null);
  throw new Error(`Görsel gelmedi.${metin ? ` ChatGPT'nin yanıtı: "${metin}"` : ''}${sonDurumu ? ` Tanı: ${taniMetni(sonDurumu)}` : ''}`);
}

function uzantiBul(bayt) {
  if (bayt.length >= 4 && bayt[0] === 0x89 && bayt[1] === 0x50 && bayt[2] === 0x4e && bayt[3] === 0x47) return 'png';
  if (bayt.length >= 3 && bayt[0] === 0xff && bayt[1] === 0xd8 && bayt[2] === 0xff) return 'jpg';
  if (bayt.length >= 12 && bayt.toString('latin1', 0, 4) === 'RIFF' && bayt.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (bayt.length >= 4 && bayt.toString('latin1', 0, 4) === 'GIF8') return 'gif';
  return null;
}

// Görselin baytlarını üç yoldan sırayla dener:
//   1) sayfanın içinden indir, 2) tarayıcının çerezleriyle indir,
//   3) olmazsa ekrandaki görselin fotoğrafını çek (çözünürlük düşük olabilir).
async function gorseliIndir(sayfa, adres, gunluk) {
  try {
    const b64 = await sayfa.evaluate(async (a) => {
      const yanit = await fetch(a);
      if (!yanit.ok) throw new Error(String(yanit.status));
      const veri = new Uint8Array(await yanit.arrayBuffer());
      let ikili = '';
      for (let i = 0; i < veri.length; i += 0x8000) ikili += String.fromCharCode(...veri.subarray(i, i + 0x8000));
      return btoa(ikili);
    }, adres);
    const bayt = Buffer.from(b64, 'base64');
    const uzanti = uzantiBul(bayt);
    if (uzanti) return { bayt, uzanti };
  } catch {
    /* sıradaki yola geç */
  }

  if (/^https?:/.test(adres)) {
    try {
      const yanit = await sayfa.context().request.get(adres, { timeout: 60000 });
      if (yanit.ok()) {
        const bayt = await yanit.body();
        const uzanti = uzantiBul(bayt);
        if (uzanti) return { bayt, uzanti };
      }
    } catch {
      /* sıradaki yola geç */
    }
  }

  gunluk('  Görsel dosyası indirilemedi, ekran görüntüsü alınıyor (çözünürlük düşük olabilir).');
  const sirasi = await sayfa.evaluate((a) => {
    const resimler = [...document.querySelectorAll('img')];
    return resimler.findIndex((r) => (r.currentSrc || r.src) === a);
  }, adres);
  if (sirasi < 0) throw new Error('Görsel sayfadan kayboldu, kaydedilemedi.');
  const bayt = await sayfa.locator('img').nth(sirasi).screenshot({ type: 'png' });
  return { bayt, uzanti: 'png' };
}

// Tek bir istem için yeni sohbet açar, (varsa) referans görselleri ekler,
// görseli üretir ve baytlarını döndürür.
async function gorselUret(sayfa, istem, ayarlar, gunluk, referanslar = []) {
  const ayar = { ...ayarlar, seciciler: { ...VARSAYILAN_SECICILER, ...ayarlar.seciciler } };
  for (const dosya of referanslar) {
    if (!fs.existsSync(dosya)) throw new Error(`Referans görsel bulunamadı: ${dosya}`);
  }
  await sohbetiHazirla(sayfa, ayar, gunluk);
  const oncekiler = await buyukGorseller(sayfa, ayar.enKucukGorselPx, null);
  await istemiGonder(sayfa, istem, ayar.seciciler, referanslar);
  gunluk('  İstem gönderildi, görsel bekleniyor…');
  const adresler = await gorseliBekle(sayfa, oncekiler, istem, ayar);
  const gorseller = [];
  for (const adres of adresler) gorseller.push(await gorseliIndir(sayfa, adres, gunluk));
  return gorseller;
}

module.exports = { gorselUret };
