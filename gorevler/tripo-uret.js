// Konsept görsellerden Tripo Studio'da 3D model üretir (gerekirse otomatik iskelet ekler),
// GLB olarak indirir ve hepsini tek bir zip'te toplar. Ardından git-gonder çalışırsa zip,
// listede yazan depoya/dala/klasöre gönderilir:  node robot.js tripo-uret git-gonder --liste x.json
//
// Liste (JSON):
//   {
//     "hedef": { "depo": "https://github.com/kisi/oyun", "dal": "dal-adi", "klasor": "kut/gelen_model", "mesaj": "..." },
//     "zip": "modeller.zip",
//     "modeller": [
//       { "ad": "kirpi", "gorsel": "C:/.../canavar_kirpi_a.png", "iskelet": "quadruped", "poligon": 25000 },
//       { "ad": "cakil", "glb": "C:/.../cakil.glb" }        <- daha önce indirilmiş; yalnızca zip'e eklenir
//     ]
//   }
// iskelet: biped (İnsansı) | quadruped (Diğer) | yok
//
// Kredi: Tripo hesabındaki kredi baştan okunur; listedeki sırayla, kredisi yeten modeller üretilir,
// yetmeyenler atlanır (kalite ayarı düşürülmez). Aynı anda en fazla tripo.esZamanli model üretilir.
//
// Seçenekler:  --liste <json>   --es-zamanli <sayı>   --cikti <klasör>

const fs = require('fs');
const path = require('path');
const { tarayiciyaBaglan } = require('../lib/tarayici');
const tripo = require('../lib/tripo');
const { zipYaz } = require('../lib/zip');

async function calistir(baglam) {
  const { ayarlar, secenekler, gunluk, bildir } = baglam;
  const ayar = { ...tripo.VARSAYILAN, ...(ayarlar.tripo || {}) };
  if (!secenekler.liste) throw new Error('Model listesi verilmedi: --liste <json>');
  const liste = JSON.parse(fs.readFileSync(path.resolve(baglam.kok, secenekler.liste), 'utf8').replace(/^\uFEFF/, ''));
  const cikti = path.resolve(baglam.kok, secenekler.cikti || ayar.ciktiKlasoru || 'cikti/modeller');
  const esZamanli = Math.max(1, Number(secenekler['es-zamanli'] || ayar.esZamanli || 3));
  const modeller = liste.modeller || [];

  const hazir = modeller.filter((m) => m.glb).map((m) => path.resolve(m.glb));
  for (const dosya of hazir) if (!fs.existsSync(dosya)) throw new Error(`GLB bulunamadı: ${dosya}`);
  const uretilecek = modeller.filter((m) => !m.glb);
  for (const m of uretilecek) {
    if (!m.ad || !m.gorsel || !fs.existsSync(m.gorsel)) throw new Error(`Eksik ya da bulunamayan görsel: ${JSON.stringify(m)}`);
    if (!['biped', 'quadruped', 'yok', undefined].includes(m.iskelet)) throw new Error(`Geçersiz iskelet "${m.iskelet}" (${m.ad})`);
  }

  const oturum = await tarayiciyaBaglan(baglam);
  const inenler = [];
  const basarisizlar = [];
  try {
    // Krediyi oku; her model için harcanacak krediyi baştan ayır ki aynı anda çalışanlar hesabı aşmasın.
    const olcum = await oturum.icerik.newPage();
    await olcum.goto(ayar.adres, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await olcum.waitForTimeout(4000);
    let kalan = await tripo.hesapKredisi(olcum);
    await olcum.close();
    if (kalan === null) throw new Error('Tripo kredisi okunamadı. Robotun tarayıcısında Tripo\'ya giriş yapılmış mı?');
    gunluk(`Tripo kredisi: ${kalan}. ${uretilecek.length} model, aynı anda en fazla ${esZamanli}.`);

    const krediAyir = (ad, adim) => async (gereken) => {
      if (gereken > kalan) {
        gunluk(`  ${ad}: ${adim} için ${gereken} kredi gerekiyor, ${kalan} kaldı; atlanıyor.`);
        return false;
      }
      kalan -= gereken;
      return true;
    };

    const isle = async (m) => {
      const sayfa = await oturum.icerik.newPage();
      let ayrilan = 0;
      try {
        gunluk(`[${m.ad}] üretim başlatılıyor (${m.iskelet || 'yok'}, ${m.poligon || 'varsayılan'} poligon)…`);
        bildir({ tur: 'istem', ad: m.ad, durum: 'uretiliyor' });
        // İskeletli modelde iskelet kredisi de baştan ayrılır; aynı anda çalışanlar hesabı aşmasın,
        // üretilip iskeletsiz kalan model olmasın.
        const rigli = m.iskelet && m.iskelet !== 'yok';
        const rigTahmini = rigli ? Number(ayar.rigKredi || 20) : 0;
        const bas = await tripo.uretimiBaslat(sayfa, ayar, m, async (g) => {
          if (!(await krediAyir(m.ad, rigli ? 'üretim + iskelet' : 'üretim')(g + rigTahmini))) return false;
          kalan += rigTahmini; // iskelet adımında gerçek kredi yeniden ayrılır
          ayrilan = rigTahmini;
          kalan -= ayrilan;
          return true;
        });
        if (bas.atlandi) {
          basarisizlar.push({ ad: m.ad, neden: 'kredi yetmedi' });
          return;
        }
        const yuzey = await tripo.uretimiBekle(sayfa, ayar);
        gunluk(`[${m.ad}] model hazır: ${yuzey} üçgen (${bas.kredi} kredi).`);
        let iskeletli = false;
        if (m.iskelet && m.iskelet !== 'yok') {
          kalan += ayrilan; // baştan ayrılan tahmini iade et, gerçek krediyi ayır
          ayrilan = 0;
          const rig = await tripo.rigEkle(sayfa, ayar, m.iskelet, krediAyir(m.ad, 'iskelet'));
          if (rig.atlandi) gunluk(`[${m.ad}] iskeletsiz indirilecek (kredi yetmedi).`);
          else {
            iskeletli = true;
            gunluk(`[${m.ad}] iskelet eklendi (${rig.kredi} kredi).`);
          }
        }
        const dosya = await tripo.glbIndir(sayfa, m.ad, cikti, iskeletli);
        inenler.push(dosya);
        gunluk(`[${m.ad}] indirildi -> ${dosya} (${Math.round(fs.statSync(dosya).size / 1024)} KB)`);
        bildir({ tur: 'istem', ad: m.ad, durum: 'bitti' });
      } catch (hata) {
        const neden = String(hata.message).split('\n')[0];
        basarisizlar.push({ ad: m.ad, neden });
        gunluk(`[${m.ad}] OLMADI: ${neden}`);
        await sayfa.screenshot({ path: path.join(cikti, `hata-${m.ad}.png`) }).catch(() => {});
        bildir({ tur: 'istem', ad: m.ad, durum: 'hata', neden });
      } finally {
        await sayfa.close().catch(() => {});
      }
    };

    // Sırayla, en fazla esZamanli model aynı anda.
    const kuyruk = [...uretilecek];
    const iscilar = Array.from({ length: Math.min(esZamanli, kuyruk.length) }, async (_, n) => {
      await new Promise((r) => setTimeout(r, n * 8000)); // sekmeler aynı anda yüklemeye başlamasın
      while (kuyruk.length) await isle(kuyruk.shift());
    });
    await Promise.all(iscilar);
    gunluk(`Tripo: ${inenler.length} model indirildi, ${basarisizlar.length} model olmadı. Kalan kredi (tahmini): ${kalan}.`);
    for (const { ad, neden } of basarisizlar) gunluk(`  ✗ ${ad}: ${neden}`);
  } finally {
    await oturum.tarayici.close().catch(() => {});
  }

  const paket = [...hazir, ...inenler];
  if (!paket.length) throw new Error('Hiç model indirilemedi.');
  // GitHub 100 MB'tan büyük dosyayı almaz, 50 MB'ta uyarır; GLB dokuları zaten sıkışık olduğundan
  // zip küçülmez. Bu yüzden paket ~45 MB'lık parçalara bölünür: ad-1.zip, ad-2.zip, ...
  const sinir = (ayar.zipParcaMB || 45) * 1024 * 1024;
  const gruplar = [];
  for (const dosya of paket) {
    const boyut = fs.statSync(dosya).size;
    const son = gruplar[gruplar.length - 1];
    if (son && son.boyut + boyut <= sinir) {
      son.dosyalar.push(dosya);
      son.boyut += boyut;
    } else gruplar.push({ dosyalar: [dosya], boyut });
  }
  const zipKoku = (liste.zip || `modeller-${new Date().toISOString().slice(0, 10)}.zip`).replace(/\.zip$/i, '');
  const ziplar = gruplar.map((g, n) => {
    const ad = gruplar.length === 1 ? `${zipKoku}.zip` : `${zipKoku}-${n + 1}.zip`;
    const yol = zipYaz(path.join(cikti, ad), g.dosyalar);
    gunluk(`Zip: ${ad} — ${g.dosyalar.map((d) => path.basename(d)).join(', ')} (${Math.round(fs.statSync(yol).size / 1024 / 1024)} MB)`);
    return yol;
  });

  // git-gonder bu zip'leri listedeki hedefe gönderir.
  baglam.veri.gorseller = ziplar;
  baglam.veri.hedefler = liste.hedef ? Object.fromEntries(ziplar.map((z) => [z, liste.hedef])) : {};
}

module.exports = {
  ad: 'tripo-uret',
  aciklama: 'Konsept görsellerden Tripo\'da 3D model üretir, iskelet ekler, GLB indirip zip\'ler',
  calistir,
};
