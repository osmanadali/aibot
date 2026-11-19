// Tripo Studio web sayfasını süren parça: konsept görselden 3D model üretir, istenirse
// otomatik iskelet (rig) ekler ve GLB olarak indirir. ChatGPT'de olduğu gibi robotun
// tarayıcısındaki (giriş yapılmış) Tripo hesabını kullanır; krediler o hesaptan düşer.
//
// Akış (2026-11 Tripo Studio arayüzü):
//   1) /workspace/generate: "Model Üret > HD Model", görsel yükle, Geometri ve doku ayarları,
//      AI Model, "Oluştur <kredi>". Bitince adres /workspace/generate/<görev> olur, sağ üstte
//      "Yüzeyler N / N" yazar.
//   2) Sol menü "Rig": "İnsansı" (iki ayaklı, Mixamo) ya da "Diğer" (dört ayaklı vb.),
//      "Otomatik Rig <kredi>". Bitince düğme "Yeniden Dene" olur.
//   3) Alt çubuk "Dışa Aktar": dosya adı, Format GLB, doku çözünürlüğü, "İskeleti Dışa Aktar".

const fs = require('fs');
const path = require('path');
const { bekle } = require('./tarayici');

const VARSAYILAN = {
  adres: 'https://studio.tripo3d.ai/tr/workspace/generate',
  model: 'H3.1',
  dokuKalitesi: 'detailed', // standard = 2K, detailed = 4K, extreme = 8K (abonelik)
  ultraAg: true,
  pbr: true,
  uretimBeklemeDakika: 12,
  rigBeklemeDakika: 6,
};

const krediOku = (metin) => {
  const e = String(metin || '').match(/(\d+)\s*$/);
  return e ? Number(e[1]) : null;
};

async function dugmeYazisi(sayfa, desen) {
  return sayfa.evaluate(
    (kaynak) => {
      const d = new RegExp(kaynak);
      return [...document.querySelectorAll('button')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()).find((x) => d.test(x)) || '';
    },
    desen.source
  );
}

// Hesaptaki kredi (üst şeritte "Yükselt"in solundaki sayı).
async function hesapKredisi(sayfa) {
  return sayfa.evaluate(() => {
    const e = document.body.innerText.match(/(\d[\d.,]*)\s*\n\s*Yükselt/);
    return e ? Number(e[1].replace(/[.,]/g, '')) : null;
  });
}

// Sayfadaki anahtarları (switch) yanlarındaki yazıyla bulup istenen konuma getirir.
async function anahtarAyarla(sayfa, desen, istenen) {
  const liste = await sayfa.evaluate(() => {
    const ad = (e) => {
      let s = e;
      for (let i = 0; i < 4 && s; i++) {
        s = s.parentElement;
        const tx = s && s.innerText.replace(/\s+/g, ' ').trim();
        if (tx && tx.length > 2 && tx.length < 60) return tx;
      }
      return '';
    };
    return [...document.querySelectorAll('[role=switch]')].map((e, i) => ({ i, ad: ad(e), acik: e.getAttribute('aria-checked') === 'true' }));
  });
  const hedef = liste.find((a) => desen.test(a.ad));
  if (!hedef) return false;
  if (hedef.acik !== istenen) await sayfa.locator('[role=switch]').nth(hedef.i).click();
  return true;
}

// Geometri ve doku panelini açar; kalite ayarlarını ve poligon sayısını uygular.
async function ayarlariUygula(sayfa, ayar, poligon) {
  const panelAcik = async () => (await sayfa.locator('button[value=detailed]').count()) > 0;
  if (!(await panelAcik())) {
    await sayfa.getByText('Geometri ve doku', { exact: false }).first().click();
    await bekle(1200);
  }
  if (!(await panelAcik())) throw new Error('Tripo "Geometri ve doku" paneli açılamadı.');
  await anahtarAyarla(sayfa, /^Ultra/, ayar.ultraAg);
  await sayfa.locator(`button[value=${ayar.dokuKalitesi}]`).click();
  await anahtarAyarla(sayfa, /^PBR/, ayar.pbr);
  await sayfa.locator('button[value=triangle]').click().catch(() => {});
  if (poligon) {
    const kutu = sayfa.locator('input[type=text]').last();
    await kutu.fill(String(poligon));
    await kutu.press('Enter');
  }
  // AI Model
  const secici = sayfa.getByRole('combobox').filter({ hasText: /H\d\.\d/ });
  if (!new RegExp(ayar.model.replace('.', '\\.')).test(await secici.innerText())) {
    await secici.click();
    await bekle(600);
    await sayfa.getByRole('option', { name: new RegExp(`^${ayar.model.replace('.', '\\.')}`) }).first().click();
  }
  await bekle(800);
}

// Görseli yükleyip üretimi başlatır. Dönen: { gorev, kredi } (gorev = Tripo görev kimliği).
async function uretimiBaslat(sayfa, ayar, { gorsel, poligon }, krediyiOnayla) {
  await sayfa.goto(ayar.adres, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sayfa.getByText('HD Model', { exact: true }).first().waitFor({ timeout: 60000 });
  await sayfa.getByText('HD Model', { exact: true }).first().click();
  const alan = sayfa.locator('input[type=file][accept*="image"]').first();
  await alan.setInputFiles(gorsel, { timeout: 30000 });
  // Yüklenen görselin önizlemesi belirene kadar bekle.
  await sayfa.waitForFunction(() => [...document.querySelectorAll('img')].some((i) => /blob:|tripo/.test(i.src) && i.getBoundingClientRect().left < 420 && i.naturalWidth > 100), null, { timeout: 60000 });
  await ayarlariUygula(sayfa, ayar, poligon);
  const kredi = krediOku(await dugmeYazisi(sayfa, /^Oluştur/));
  if (kredi === null) throw new Error('Tripo "Oluştur" düğmesi bulunamadı.');
  if (!(await krediyiOnayla(kredi))) return { gorev: null, kredi, atlandi: true };
  const onceki = sayfa.url();
  await sayfa.getByRole('button', { name: /^Oluştur/ }).click();
  await sayfa.waitForURL((u) => u.toString() !== onceki && /workspace\/generate\/[\w-]{8,}/.test(u.toString()), { timeout: 60000 });
  return { gorev: sayfa.url().split('/').pop(), kredi };
}

async function uretimiBekle(sayfa, ayar) {
  const sonZaman = Date.now() + ayar.uretimBeklemeDakika * 60000;
  while (Date.now() < sonZaman) {
    await bekle(5000);
    const d = await sayfa.evaluate(() => {
      const y = document.body.innerText;
      return { suruyor: /Üretiliyor|Sırada|Kuyrukta/i.test(y), yuzey: (y.match(/Yüzeyler\s*(\d+)/) || [])[1], hata: /(Üretim|Görev)\s+başarısız|Bir hata oluştu/i.test(y) };
    });
    if (d.hata) throw new Error('Tripo üretimi başarısız oldu.');
    if (!d.suruyor && d.yuzey) return Number(d.yuzey);
  }
  throw new Error(`Tripo üretimi ${ayar.uretimBeklemeDakika} dakikada bitmedi.`);
}

// iskelet: 'biped' -> İnsansı, 'quadruped' -> Diğer
async function rigEkle(sayfa, ayar, iskelet, krediyiOnayla) {
  await sayfa.locator('div, a, button').filter({ hasText: /^Rig$/ }).last().click();
  await sayfa.waitForURL(/workspace\/rigging\//, { timeout: 30000 });
  await sayfa.getByText(iskelet === 'biped' ? /^İnsansı$/ : /^Diğer$/).first().click();
  await bekle(1500);
  const kredi = krediOku(await dugmeYazisi(sayfa, /Otomatik Rig/));
  if (kredi === null) throw new Error('Tripo "Otomatik Rig" düğmesi bulunamadı (model zaten riglenmiş olabilir).');
  if (!(await krediyiOnayla(kredi))) return { kredi, atlandi: true };
  await sayfa.getByRole('button', { name: /Otomatik Rig/ }).click();
  const sonZaman = Date.now() + ayar.rigBeklemeDakika * 60000;
  while (Date.now() < sonZaman) {
    await bekle(4000);
    if (/Yeniden Dene/.test(await dugmeYazisi(sayfa, /Yeniden Dene|Otomatik Rig/))) return { kredi };
    if (await sayfa.evaluate(() => /Rig(leme)?\s+başarısız/i.test(document.body.innerText))) throw new Error('Tripo rig başarısız oldu.');
  }
  throw new Error(`Tripo rig ${ayar.rigBeklemeDakika} dakikada bitmedi.`);
}

async function glbIndir(sayfa, ad, klasor, iskeletli) {
  await sayfa.getByRole('button', { name: /Dışa Aktar/ }).first().click();
  const pencere = sayfa.locator('[role=dialog]').filter({ hasText: 'Dışa Aktar' }).last();
  await pencere.waitFor({ timeout: 20000 });
  await pencere.locator('input').first().fill(ad);
  const bicim = pencere.getByRole('combobox').nth(0);
  if (!/GLB/.test(await bicim.innerText())) {
    await bicim.click();
    await sayfa.getByRole('option', { name: /^GLB/ }).first().click();
  }
  const iskeletAnahtari = pencere.getByRole('switch');
  if ((await iskeletAnahtari.count()) && (await iskeletAnahtari.first().getAttribute('aria-checked')) !== String(iskeletli)) {
    await iskeletAnahtari.first().click();
  }
  const [indirme] = await Promise.all([
    sayfa.waitForEvent('download', { timeout: 300000 }),
    pencere.getByRole('button', { name: /^Dışa Aktar$/ }).click(),
  ]);
  fs.mkdirSync(klasor, { recursive: true });
  const hedef = path.join(klasor, `${ad}.glb`);
  await indirme.saveAs(hedef);
  const bas = fs.readFileSync(hedef).subarray(0, 4).toString('latin1');
  if (bas !== 'glTF') throw new Error(`İnen dosya GLB değil: ${hedef}`);
  return hedef;
}

module.exports = { VARSAYILAN, hesapKredisi, uretimiBaslat, uretimiBekle, rigEkle, glbIndir };
