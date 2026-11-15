// ChatGPT web sayfasını süren parça: istemi yazar, görselin bitmesini bekler,
// görselin baytlarını döndürür.
//
// Sayfadaki öğelerin adresleri (seçiciler) ayarlar.json > chatgpt.seciciler
// altındadır; ChatGPT arayüzünü değiştirirse yalnızca orayı güncellemek yeter.
// Görseli bulma işi seçicilere bağlı değildir: gönderimden sonra sayfada
// beliren yeni ve büyük resimlere bakılır.

const { bekle } = require('./tarayici');

async function gorunuyorMu(sayfa, secici) {
  if (!secici) return false;
  try {
    return await sayfa.locator(secici).first().isVisible();
  } catch {
    return false;
  }
}

// Sayfadaki yeterince büyük ve yüklenmesi bitmiş resimlerin adresleri.
async function buyukGorseller(sayfa, enKucukPx) {
  return sayfa.evaluate((px) => {
    const adresler = [];
    for (const resim of document.querySelectorAll('img')) {
      const adres = resim.currentSrc || resim.src;
      if (!adres || !resim.complete) continue;
      if (resim.naturalWidth < px || resim.naturalHeight < px) continue;
      if (!adresler.includes(adres)) adresler.push(adres);
    }
    return adresler;
  }, enKucukPx);
}

async function sonAsistanMetni(sayfa, secici) {
  if (!secici) return '';
  try {
    const mesajlar = sayfa.locator(secici);
    const adet = await mesajlar.count();
    if (!adet) return '';
    const metin = await mesajlar.nth(adet - 1).innerText({ timeout: 2000 });
    return metin.replace(/\s+/g, ' ').trim().slice(0, 300);
  } catch {
    return '';
  }
}

// İstem kutusu görünene kadar bekler. Giriş yapılmamışsa ya da bir doğrulama
// ekranı varsa kullanıcının tarayıcı penceresinde halletmesini bekler.
async function sohbetiHazirla(sayfa, ayar, gunluk) {
  const s = ayar.seciciler;
  await sayfa.goto(ayar.adres, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const sonZaman = Date.now() + 10 * 60 * 1000;
  let uyarildi = false;
  while (Date.now() < sonZaman) {
    const kutuVar = await gorunuyorMu(sayfa, s.istemKutusu);
    const girisGerek = await gorunuyorMu(sayfa, s.girisDugmesi);
    if (kutuVar && !girisGerek) {
      // Giriş bu bekleme sırasında yapıldıysa temiz bir sohbetle başla.
      if (uyarildi) await sayfa.goto(ayar.adres, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sayfa.locator(s.istemKutusu).first().waitFor({ state: 'visible', timeout: 60000 });
      return;
    }
    if (!uyarildi) {
      gunluk('Tarayıcı penceresinde ChatGPT\'ye giriş yap (ya da çıkan doğrulamayı geç). Robot bekliyor…');
      uyarildi = true;
    }
    await bekle(2000);
  }
  throw new Error('ChatGPT istem kutusu 10 dakika içinde hazır olmadı (giriş yapılmamış olabilir).');
}

async function istemiGonder(sayfa, istem, s) {
  const kutu = sayfa.locator(s.istemKutusu).first();
  await kutu.click();
  await kutu.fill(istem);
  const dugme = sayfa.locator(s.gonderDugmesi).first();
  try {
    await dugme.click({ timeout: 4000 });
  } catch {
    await kutu.press('Enter');
  }
}

// Gönderimden sonra beliren görsel(ler)in adreslerini döndürür.
async function gorseliBekle(sayfa, oncekiler, ayar) {
  const s = ayar.seciciler;
  const baslangic = Date.now();
  const sonZaman = baslangic + ayar.gorselBeklemeDakika * 60 * 1000;
  const kararliMs = ayar.kararliSaniye * 1000;
  const metinSonrasiMs = ayar.metinSonrasiSaniye * 1000;

  let sonDurum = '';
  let sonDegisim = Date.now();
  let uretimGoruldu = false;
  let uretimBitti = null;

  while (Date.now() < sonZaman) {
    await bekle(1500);
    const uretiliyor = await gorunuyorMu(sayfa, s.durdurDugmesi);
    const yeniler = (await buyukGorseller(sayfa, ayar.enKucukGorselPx)).filter((a) => !oncekiler.includes(a));

    const durum = yeniler.join('\n');
    if (durum !== sonDurum) {
      sonDurum = durum;
      sonDegisim = Date.now();
    }

    if (uretiliyor) {
      uretimGoruldu = true;
      uretimBitti = null;
      continue;
    }
    if (uretimGoruldu && uretimBitti === null) uretimBitti = Date.now();

    if (yeniler.length && Date.now() - sonDegisim >= kararliMs) return yeniler;

    // Yanıt bitti ama görsel yok: ChatGPT yalnızca yazıyla yanıt vermiş olabilir.
    if (!yeniler.length && uretimBitti !== null && Date.now() - uretimBitti >= metinSonrasiMs) break;
  }

  const metin = await sonAsistanMetni(sayfa, s.asistanMesaji);
  throw new Error(`Görsel gelmedi.${metin ? ` ChatGPT'nin yanıtı: "${metin}"` : ''}`);
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

// Tek bir istem için yeni sohbet açar, görseli üretir ve baytlarını döndürür.
async function gorselUret(sayfa, istem, ayar, gunluk) {
  await sohbetiHazirla(sayfa, ayar, gunluk);
  const oncekiler = await buyukGorseller(sayfa, ayar.enKucukGorselPx);
  await istemiGonder(sayfa, istem, ayar.seciciler);
  const adresler = await gorseliBekle(sayfa, oncekiler, ayar);
  const gorseller = [];
  for (const adres of adresler) gorseller.push(await gorseliIndir(sayfa, adres, gunluk));
  return gorseller;
}

module.exports = { gorselUret };
