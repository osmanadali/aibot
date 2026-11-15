// Ayarlar iki dosyadan okunur:
//   ayarlar.json        varsayılanlar; güncellemelerle birlikte yenilenir
//   ayarlar.yerel.json  senin değiştirdiklerin; güncellemeler dokunmaz
// Yerel dosyadaki değerler varsayılanların üzerine yazılır.

const fs = require('fs');

function jsonOku(dosya, yoksa) {
  if (!fs.existsSync(dosya)) return yoksa;
  try {
    return JSON.parse(fs.readFileSync(dosya, 'utf8').replace(/^\uFEFF/, ''));
  } catch (hata) {
    throw new Error(`${dosya} okunamadı: ${hata.message}`);
  }
}

const duzNesneMi = (deger) => deger !== null && typeof deger === 'object' && !Array.isArray(deger);

function birlestir(temel, ek) {
  const sonuc = { ...temel };
  for (const [anahtar, deger] of Object.entries(ek)) {
    sonuc[anahtar] = duzNesneMi(deger) && duzNesneMi(temel[anahtar]) ? birlestir(temel[anahtar], deger) : deger;
  }
  return sonuc;
}

const yerelAyarYolu = (ayarDosyasi) => ayarDosyasi.replace(/\.json$/i, '') + '.yerel.json';

function ayarlariYukle(ayarDosyasi) {
  const temel = jsonOku(ayarDosyasi);
  if (!temel) throw new Error(`${ayarDosyasi} bulunamadı.`);
  return birlestir(temel, jsonOku(yerelAyarYolu(ayarDosyasi), {}));
}

// Verilen değerleri yerel ayar dosyasına işler (varsayılan dosyaya dokunmaz).
function yerelAyarYaz(ayarDosyasi, degisiklik) {
  const yol = yerelAyarYolu(ayarDosyasi);
  fs.writeFileSync(yol, `${JSON.stringify(birlestir(jsonOku(yol, {}), degisiklik), null, 2)}\n`);
}

module.exports = { jsonOku, ayarlariYukle, yerelAyarYolu, yerelAyarYaz };
