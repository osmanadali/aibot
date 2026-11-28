// Google Flow (flow.google.com) web sayfasını süren parça: istemden görsel (Nano Banana) ya da video
// (Omni / Veo) üretir, sonucu indirir. ChatGPT ve Tripo'da olduğu gibi robotun tarayıcısındaki
// (giriş yapılmış) Google hesabını kullanır; video kredisi o hesaptan düşer, görsel 0 kredidir.
//
// Akış (2026-11 Flow arayüzü):
//   - Proje sayfası /project/<kimlik>. Altta istem kutusu: "+" (İçerik öğelerini istem kutusuna ekle),
//     metin kutusu, "Ayarlar tetikleyicisi", "Flow ajanı" anahtarı, "Oluşturmaya başla".
//   - "Flow ajanı" açıkken istem sohbet ajanına gider; robot doğrudan üretim için onu kapatır
//     (iş bitince eski hâline getirir).
//   - Ayarlar paneli (flow-prompt-box-settings): Resim | Video; Video'da Kareler | İçerik öğeleri;
//     oran; "Model ailesi seçin"; görselde düşünme düzeyi; videoda 360p | 720p ve Süre kaydırıcısı;
//     x1..x4 adet; altta "Üretme işlemi için N kredi kullanılır".
//   - Referans: "+" > "Medya yükle" (dosya seçici) > yüklenen öğeyi seç > "İsteme ekle".
//     Video "Kareler" modunda istem kutusundaki "Başlat" / "Bitir" yuvaları aynı seçiciyi açar.
//   - Sonuç ızgarada yeni bir kutucuk olarak (en başta) belirir. Kutucuk > "Diğer seçenekler" >
//     "İndir" > boyut (görselde "1K Orijinal boyut", "2K Yükseltilmiş").

const fs = require('fs');
const path = require('path');
const { bekle } = require('./tarayici');

const VARSAYILAN = {
  adres: 'https://flow.google.com/',
  projeAdresi: '', // boşsa robot bir proje açar ve çıktı klasöründeki flow-proje.txt'ye yazar
  gorsel: { model: 'Nano Banana 2.1', oran: '9:16', adet: 1, dusunme: '', indirme: '1K' },
  video: { model: 'Omni 1.2 Flash', oran: '9:16', adet: 1, cozunurluk: '720p', sure: 8, indirme: 'Orijinal' },
  gorselBeklemeDakika: 6,
  videoBeklemeDakika: 15,
  enFazlaKredi: 100, // bir çalıştırmada harcanabilecek en fazla video kredisi
  denemeSayisi: 2,
  denemeArasiDakika: 1,
  istemArasiSaniye: 5,
};

const HATA_DESENI = /başarısız|başarılamadı|oluşturulamadı|politika|ihlal|izin verilm|failed|couldn.t|unable to|violat|policy/i;

// Flow'un araya giren "yenilikler" ve tanıtım pencerelerini kapatır (koşul kabulü değildir; yalnızca bilgi pencereleri).
async function pencereleriKapat(sayfa) {
  for (let i = 0; i < 4; i++) {
    const d = sayfa.locator('[role=dialog] button, .cdk-overlay-pane button').filter({ hasText: /^(Başlayın|Get started|Anladım|Got it)$/ });
    if ((await d.count()) && (await d.first().isVisible().catch(() => false))) {
      await d.first().click().catch(() => {});
      await bekle(700);
    } else break;
  }
}

async function projeyiAc(sayfa, adres) {
  if (!sayfa.url().startsWith(adres)) {
    await sayfa.goto(adres, { waitUntil: 'domcontentloaded', timeout: 90000 });
  }
  await sayfa.locator('flow-rich-text-editor [role=textbox]').first().waitFor({ timeout: 60000 });
  await bekle(2000);
  await pencereleriKapat(sayfa);
}

// Ana sayfadan yeni bir proje açar; dönen: proje adresi.
async function projeOlustur(sayfa, ayar) {
  await sayfa.goto(ayar.adres, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await bekle(4000);
  await pencereleriKapat(sayfa);
  const dugme = sayfa.getByRole('button', { name: /Yeni proje|New project/ });
  if (!(await dugme.count())) {
    throw new Error('Flow ana sayfasında "Yeni proje" bulunamadı. Robotun tarayıcısında Google\'a giriş yapılmış mı?');
  }
  await dugme.first().click();
  await sayfa.waitForURL(/\/project\//, { timeout: 60000 });
  await bekle(4000);
  await pencereleriKapat(sayfa);
  return sayfa.url().split('?')[0];
}

const ajanDugmesi = (sayfa) => sayfa.locator('flow-agent-mode-switch button').first();

// Dönen: anahtarın önceki durumu (true = açıktı). Robot üretimden önce kapatır.
async function ajaniKapat(sayfa) {
  const d = ajanDugmesi(sayfa);
  if (!(await d.count())) return null;
  const acikti = (await d.getAttribute('aria-pressed')) === 'true';
  if (acikti) {
    await d.click();
    await bekle(1000);
  }
  return acikti;
}

async function ajaniGeriAl(sayfa, acikti) {
  if (acikti !== true) return;
  const d = ajanDugmesi(sayfa);
  if ((await d.count()) && (await d.getAttribute('aria-pressed')) !== 'true') await d.click().catch(() => {});
}

const panel = (sayfa) => sayfa.locator('flow-prompt-box-settings').first();
const radyo = (sayfa, desen) => panel(sayfa).locator('button[role=radio]').filter({ hasText: desen });

async function paneliAc(sayfa) {
  if ((await panel(sayfa).count()) && (await panel(sayfa).isVisible().catch(() => false))) return;
  await sayfa.getByRole('button', { name: 'Ayarlar tetikleyicisi' }).click();
  await panel(sayfa).waitFor({ timeout: 15000 });
  await bekle(600);
}

async function paneliKapat(sayfa) {
  for (let i = 0; i < 2 && (await panel(sayfa).isVisible().catch(() => false)); i++) {
    await sayfa.keyboard.press('Escape');
    await bekle(500);
  }
}

async function radyoSec(sayfa, desen, ad) {
  const r = radyo(sayfa, desen);
  if (!(await r.count())) throw new Error(`Flow ayarlarında "${ad}" seçeneği yok.`);
  if ((await r.first().getAttribute('aria-checked')) !== 'true') {
    await r.first().click();
    await bekle(500);
  }
}

const kacis = (m) => String(m).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function modelSec(sayfa, model) {
  const dugme = panel(sayfa).locator('button[aria-label="Model ailesi seçin"]');
  if (new RegExp(kacis(model), 'i').test(await dugme.innerText())) return;
  await dugme.click();
  await bekle(900);
  const oge = sayfa.locator('.cdk-overlay-pane [role=menuitem]').filter({ hasText: new RegExp(kacis(model), 'i') });
  if (!(await oge.count())) {
    const mevcut = await sayfa.locator('.cdk-overlay-pane [role=menuitem]').allInnerTexts();
    await sayfa.keyboard.press('Escape');
    throw new Error(`Flow'da "${model}" modeli yok. Olanlar: ${mevcut.map((m) => m.replace(/\s+/g, ' ').trim()).join(', ')}`);
  }
  await oge.first().click();
  await bekle(800);
}

// Süre kaydırıcısını, paneldeki "Süre N sn." yazısı istenen saniyeyi gösterene kadar kaydırır.
async function sureAyarla(sayfa, saniye) {
  const kaydirici = panel(sayfa).locator('input[type=range]').first();
  if (!(await kaydirici.count())) return;
  const okunan = async () => Number(((await panel(sayfa).innerText()).match(/Süre\s*\n?\s*(\d+)\s*sn/) || [])[1]);
  let simdiki = await okunan();
  for (let i = 0; i < 15 && simdiki !== saniye; i++) {
    await kaydirici.focus();
    await sayfa.keyboard.press(simdiki < saniye ? 'ArrowRight' : 'ArrowLeft');
    await bekle(250);
    const yeni = await okunan();
    if (yeni === simdiki) break; // sınıra dayandı
    simdiki = yeni;
  }
  if (simdiki !== saniye) throw new Error(`Flow video süresi ${saniye} sn. yapılamadı (kaydırıcı ${simdiki} sn.).`);
}

// İşin ayarlarını panele uygular; dönen: bu üretimin kredi maliyeti.
async function ayarlariUygula(sayfa, is) {
  await paneliAc(sayfa);
  if (is.tur === 'video') {
    await radyoSec(sayfa, /Video/, 'Video');
    await radyoSec(sayfa, is.baslangic || is.bitis ? /Kareler/ : /İçerik öğeleri/, is.baslangic || is.bitis ? 'Kareler' : 'İçerik öğeleri');
  } else {
    await radyoSec(sayfa, /Resim/, 'Resim');
  }
  await radyoSec(sayfa, new RegExp(`^\\S*\\s*${kacis(is.oran)}$`), `oran ${is.oran}`);
  await modelSec(sayfa, is.model);
  if (is.tur === 'video') {
    await radyoSec(sayfa, new RegExp(kacis(is.cozunurluk)), is.cozunurluk);
    await sureAyarla(sayfa, Number(is.sure));
  } else if (is.dusunme) {
    await radyoSec(sayfa, new RegExp(`^${kacis(is.dusunme)}$`), `düşünme ${is.dusunme}`);
  }
  await radyoSec(sayfa, new RegExp(`^x${is.adet}$`), `x${is.adet}`);
  const kredi = Number(((await panel(sayfa).innerText()).match(/(\d+)\s*kredi/) || [])[1]);
  await paneliKapat(sayfa);
  return Number.isFinite(kredi) ? kredi : null;
}

// İstem kutusundaki eski metni ve eklenmiş öğeleri temizler.
async function kutuyuTemizle(sayfa) {
  for (let i = 0; i < 10; i++) {
    const cip = sayfa.locator('flow-ingredient-chip button');
    if (!(await cip.count())) break;
    await cip.first().click().catch(() => {});
    await bekle(400);
  }
  const kutu = sayfa.locator('flow-rich-text-editor [role=textbox]').first();
  await kutu.click();
  await sayfa.keyboard.press('Control+A');
  await sayfa.keyboard.press('Delete');
}

const seciciAcik = (sayfa) => sayfa.locator('.cdk-overlay-pane button').filter({ hasText: 'Medya yükle' });

// Açık seçiciye dosyayı yükler, yüklenince seçip "İsteme ekle"ye basar.
async function seciciyeYukle(sayfa, dosya) {
  const [secim] = await Promise.all([sayfa.waitForEvent('filechooser', { timeout: 15000 }), seciciAcik(sayfa).first().click()]);
  await secim.setFiles(dosya);
  const ad = path.basename(dosya);
  const oge = sayfa.locator('.cdk-overlay-pane [role=option]').filter({ hasText: ad });
  const sonZaman = Date.now() + 120000;
  while (Date.now() < sonZaman) {
    await bekle(1500);
    const metin = (await oge.count()) ? await oge.first().innerText() : '';
    if (metin && !/Yükleniyor|Uploading/i.test(metin)) break;
    if (await sayfa.evaluate((d) => d.test(document.body.innerText), HATA_DESENI).catch(() => false)) {
      const yazi = await sayfa.evaluate(() => document.body.innerText);
      const satir = (yazi.match(new RegExp(`.{0,60}(${HATA_DESENI.source}).{0,60}`, 'i')) || [''])[0];
      if (/yükle|upload/i.test(satir)) throw new Error(`Flow referansı yükleyemedi: ${satir.trim()}`);
    }
  }
  if (!(await oge.count()) || /Yükleniyor|Uploading/i.test(await oge.first().innerText())) throw new Error(`Flow'a yükleme 2 dakikada bitmedi: ${ad}`);
  await oge.first().click();
  await bekle(600);
  const ekle = sayfa.locator('.cdk-overlay-pane button').filter({ hasText: /İsteme ekle|Add to prompt/ });
  if ((await ekle.count()) && (await ekle.first().isVisible())) await ekle.first().click();
  await bekle(1200);
  if (await seciciAcik(sayfa).first().isVisible().catch(() => false)) await sayfa.keyboard.press('Escape');
}

async function referanslariEkle(sayfa, dosyalar) {
  for (const dosya of dosyalar) {
    const once = await sayfa.locator('flow-ingredient-chip').count();
    await sayfa.locator('flow-add-menu button').first().click();
    await seciciAcik(sayfa).first().waitFor({ timeout: 15000 });
    await seciciyeYukle(sayfa, dosya);
    const sonra = await sayfa.locator('flow-ingredient-chip').count();
    if (sonra <= once) throw new Error(`Referans istem kutusuna eklenmedi: ${path.basename(dosya)}`);
  }
}

// Video "Kareler" modunda Başlat / Bitir yuvasına görsel koyar.
async function kareEkle(sayfa, yuva, dosya) {
  await sayfa.getByText(yuva, { exact: true }).first().click();
  await seciciAcik(sayfa).first().waitFor({ timeout: 15000 });
  await seciciyeYukle(sayfa, dosya);
}

// Izgaradaki kutucukların özetini döndürür (sırasıyla, en yeni en başta).
async function kutucuklar(sayfa) {
  return sayfa.evaluate((hataKaynak) => {
    const hata = new RegExp(hataKaynak, 'i');
    return [...document.querySelectorAll('flow-tile-container')].map((k) => {
      const m = k.querySelector('video, img');
      const src = m ? m.currentSrc || m.src || m.poster || '' : '';
      const yuklendi = !!m && ((m.tagName === 'IMG' && m.naturalWidth > 0) || (m.tagName === 'VIDEO' && (m.readyState > 0 || !!m.poster || !!m.src)));
      const metin = (k.innerText || '').replace(/\s+/g, ' ').trim();
      return { src, yuklendi, video: !!k.querySelector('video') || !!k.querySelector('flow-video-tile'), suruyor: /\d{1,3}\s?%|Oluşturuluyor|Generating|Sırada|Queued/i.test(metin), hata: hata.test(metin) ? metin.slice(0, 160) : '' };
    });
  }, HATA_DESENI.source);
}

// Üretimi başlatır ve yeni kutucuklar hazır olana kadar bekler; dönen: yeni kutucukların sırası (0 = en yeni).
async function uretVeBekle(sayfa, is, ayar) {
  const once = await kutucuklar(sayfa);
  const onceSrc = new Set(once.map((k) => k.src).filter(Boolean));
  const dugme = sayfa.locator('flow-generate-icon-button button').first();
  if (await dugme.isDisabled()) throw new Error('Flow "Oluşturmaya başla" düğmesi kapalı (istem boş ya da ayar eksik).');
  await dugme.click();
  const dakika = is.tur === 'video' ? ayar.videoBeklemeDakika : ayar.gorselBeklemeDakika;
  const sonZaman = Date.now() + dakika * 60000;
  let son = [];
  while (Date.now() < sonZaman) {
    await bekle(4000);
    son = await kutucuklar(sayfa);
    const yeniSayisi = Math.max(0, son.length - once.length);
    const yeniler = son.slice(0, yeniSayisi);
    const hatali = yeniler.find((k) => k.hata);
    if (hatali) throw new Error(`Flow üretimi olmadı: ${hatali.hata}`);
    const hazir = yeniler.filter((k) => k.yuklendi && !k.suruyor && k.src && !onceSrc.has(k.src));
    if (yeniSayisi >= is.adet && hazir.length >= is.adet) return yeniler.map((_, i) => i).slice(0, is.adet);
    // Üretim reddedilirse Flow bunu kutucuk yerine bir bildirimle de söyleyebiliyor.
    const bildirim = await sayfa.evaluate((kaynak) => {
      const d = new RegExp(kaynak, 'i');
      const e = [...document.querySelectorAll('[role=alert], [role=status], .mat-mdc-snack-bar-container, simple-snack-bar')].find((x) => d.test(x.innerText || ''));
      return e ? e.innerText.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    }, HATA_DESENI.source);
    if (bildirim) throw new Error(`Flow üretimi olmadı: ${bildirim}`);
  }
  throw new Error(`Flow ${dakika} dakikada sonucu vermedi.`);
}

// Kutucuğu "Diğer seçenekler > İndir > <boyut>" ile indirir; dönen: kaydedilen dosyanın yolu.
async function kutucukIndir(sayfa, sira, boyutDeseni, klasor, ad) {
  const kutu = sayfa.locator('flow-tile-container').nth(sira);
  await kutu.scrollIntoViewIfNeeded();
  await kutu.hover();
  await bekle(700);
  await kutu.locator('button[aria-label="Diğer seçenekler"]').first().click();
  const indir = sayfa.locator('.cdk-overlay-pane [role=menuitem]').filter({ hasText: /İndir|Download/ }).first();
  await indir.waitFor({ timeout: 10000 });
  await indir.hover();
  await bekle(1000);
  const secenekler = sayfa.locator('.cdk-overlay-pane [role=menuitem], .cdk-overlay-pane button').filter({ hasNotText: /İndir|Download|Favori|İstemi|Animasyon|İsteme|Kopyala|adlandır|Paylaş|kapağını|işaretle|Çöp/ });
  const metinler = (await secenekler.allInnerTexts()).map((m) => m.replace(/\s+/g, ' ').trim());
  let n = metinler.findIndex((m) => new RegExp(kacis(boyutDeseni), 'i').test(m));
  if (n < 0) n = metinler.findIndex((m) => /Orijinal|Original/i.test(m));
  if (n < 0) {
    await sayfa.keyboard.press('Escape');
    throw new Error(`İndirme seçeneği bulunamadı ("${boyutDeseni}"). Olanlar: ${metinler.join(', ')}`);
  }
  const [indirme] = await Promise.all([sayfa.waitForEvent('download', { timeout: 180000 }), secenekler.nth(n).click()]);
  const uzanti = path.extname(indirme.suggestedFilename()) || '.bin';
  fs.mkdirSync(klasor, { recursive: true });
  const hedef = path.join(klasor, `${ad}${uzanti}`);
  await indirme.saveAs(hedef);
  return hedef;
}

module.exports = {
  VARSAYILAN,
  pencereleriKapat,
  projeyiAc,
  projeOlustur,
  ajaniKapat,
  ajaniGeriAl,
  ayarlariUygula,
  kutuyuTemizle,
  referanslariEkle,
  kareEkle,
  uretVeBekle,
  kutucukIndir,
};
