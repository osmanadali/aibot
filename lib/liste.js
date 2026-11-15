// Yapıştırılan bir görsel listesini tek tek işlere böler.
//
// Örnek girdi:
//   Oyun: evcil hayvan bakım oyunu, sıcak ve çizgi film tarzı.
//   1. Ana menü ve yükleme ekranları
//   menu_bg.png — Ana menü arka planı, gün batımında bir bahçe
//   logo.png — Oyunun logosu
//   2. İlanlar
//   - ilan_1.png: Sahiplendirme ilanı kartı
//
// Çıktı: her dosya için { ad: 'menu_bg', istem: '...' }. İsteme dosyanın
// açıklaması, bulunduğu bölümün başlığı ve listenin başındaki genel bilgiler eklenir.

const DOSYA = /([A-Za-z0-9][\w-]*)\.(png|jpe?g|webp|gif)\b/gi;
const dosyaVarMi = (satir) => new RegExp(DOSYA.source, 'i').test(satir);
const isaretleriSil = (metin) => metin.replace(/^[\s>]*(?:[-*•–]|\d+[.)])?\s*/, '').replace(/[*`#]/g, '').trim();
const kenarlariTemizle = (metin) =>
  metin
    .replace(/\|/g, ', ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/^[\s—–\-:;,.()]+|[\s—–\-:;,(]+$/g, '')
    .replace(/\s+,/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
    // Kenarı kırpılınca tek kalan parantezleri at.
    .replace(/^([^()]*)\)$/, '$1')
    .replace(/^\(([^()]*)$/, '$1')
    .trim();

// Metinde ayrı ayrı üretilecek kaç görsel dosyası geçtiğini sayar.
function dosyaSayisi(metin) {
  return new Set((String(metin).match(DOSYA) || []).map((d) => d.toLowerCase())).size;
}

function listeyiAyir(metin) {
  const satirlar = String(metin).replace(/\r/g, '').split('\n');
  const isler = [];
  const onsoz = [];
  let baslik = '';
  let sonGrup = null; // aynı satırdan çıkan ve devam satırlarını paylaşan işler

  for (let i = 0; i < satirlar.length; i++) {
    const ham = satirlar[i];
    if (!ham.trim()) {
      sonGrup = null;
      continue;
    }

    if (dosyaVarMi(ham)) {
      const satir = isaretleriSil(ham);
      const adlar = [...satir.matchAll(DOSYA)].map((e) => e[1]);
      const aciklama = kenarlariTemizle(satir.replace(DOSYA, ' ').replace(/\s+(?:,|ve|and)\s+(?=[\s—–\-:,]|$)/gi, ' '));
      sonGrup = adlar.map((ad) => ({ ad, aciklama, baslik }));
      isler.push(...sonGrup);
      continue;
    }

    // Dosya adı olmayan satır: başlık mı, önceki dosyanın devamı mı, genel bilgi mi?
    const sonraki = satirlar.slice(i + 1).find((s) => s.trim());
    const baslikGibi = /^\s*(#+|\d+[.)])\s+\S/.test(ham) || /:\s*$/.test(ham) || (sonraki !== undefined && dosyaVarMi(sonraki) && !sonGrup);
    if (baslikGibi) {
      baslik = kenarlariTemizle(isaretleriSil(ham));
      sonGrup = null;
    } else if (sonGrup) {
      const ek = kenarlariTemizle(isaretleriSil(ham));
      for (const is of sonGrup) is.aciklama = [is.aciklama, ek].filter(Boolean).join('. ');
    } else if (!isler.length) {
      onsoz.push(kenarlariTemizle(isaretleriSil(ham)));
    }
  }

  const genel = onsoz.filter(Boolean).join(' ').slice(0, 700);
  return isler.map(({ ad, aciklama, baslik: bolum }) => ({
    ad,
    istem: [
      aciklama || ad.replace(/[_-]+/g, ' '),
      bolum ? `Bölüm: ${bolum}` : '',
      genel ? `Genel bilgi: ${genel}` : '',
    ]
      .filter(Boolean)
      .join('. ')
      .replace(/\.\./g, '.'),
  }));
}

module.exports = { listeyiAyir, dosyaSayisi };
