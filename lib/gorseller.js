// Görselleri bir yere gönderen görevlerin ortak işleri: hangi görsellerin
// gönderileceğini bulmak ve onları proje klasörüne kopyalamak.

const fs = require('fs');
const path = require('path');

const GORSEL_UZANTILARI = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

// Bir akışta "gorsel-uret"ten sonra çalışılıyorsa yalnızca o çalıştırmada
// üretilenler; görev tek başına çalışıyorsa çıktı klasöründeki tüm görseller.
function gonderilecekGorseller(baglam) {
  if (baglam.veri.gorseller) return baglam.veri.gorseller;
  const cikti = path.resolve(baglam.kok, baglam.secenekler.cikti || baglam.ayarlar.gorselUret.ciktiKlasoru);
  if (!fs.existsSync(cikti)) return [];
  return fs
    .readdirSync(cikti)
    .filter((d) => GORSEL_UZANTILARI.has(path.extname(d).toLowerCase()) && !d.startsWith('hata-'))
    .sort()
    .map((d) => path.join(cikti, d));
}

function dosyaAdinaCevir(metin) {
  const harfler = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
  return (
    String(metin)
      .toLocaleLowerCase('tr-TR')
      .replace(/[çğıöşü]/g, (h) => harfler[h])
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '') || 'gorsel'
  );
}

function projeKlasorunuBul(baglam, ...adaylar) {
  const secilen = [baglam.secenekler.proje, ...adaylar].find(Boolean);
  if (!secilen) {
    throw new Error('Proje klasörü belirtilmemiş. ayarlar.json > claude.projeKlasoru alanını doldur ya da --proje <klasör> ver.');
  }
  const proje = path.resolve(baglam.kok, secilen);
  if (!fs.existsSync(proje)) throw new Error(`Proje klasörü bulunamadı: ${proje}`);
  return proje;
}

// Görselleri proje içindeki alt klasöre kopyalar; projeye göre yollarını
// (her zaman / ile) döndürür.
function projeyeKopyala(kaynaklar, proje, altKlasor) {
  const hedef = path.join(proje, altKlasor);
  fs.mkdirSync(hedef, { recursive: true });
  return kaynaklar.map((kaynak) => {
    const kopya = path.join(hedef, path.basename(kaynak));
    if (path.resolve(kaynak) !== path.resolve(kopya)) fs.copyFileSync(kaynak, kopya);
    return path.relative(proje, kopya).split(path.sep).join('/');
  });
}

module.exports = { GORSEL_UZANTILARI, dosyaAdinaCevir, gonderilecekGorseller, projeKlasorunuBul, projeyeKopyala };
