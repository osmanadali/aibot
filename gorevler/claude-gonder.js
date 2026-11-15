// Görselleri proje klasörüne kopyalar ve o klasörde bir Claude Code sohbetine
// görsellerin yollarını içeren bir mesaj gönderir.
//
// Bir akışın içinde "gorsel-uret"ten sonra çalışırsa yalnızca o çalıştırmada
// üretilen görselleri gönderir; tek başına çalıştırılırsa çıktı klasöründeki
// tüm görselleri gönderir.
//
// ayarlar.json > claude:
//   projeKlasoru    Claude Code'un çalışacağı klasör (oyun projen)
//   hedefAltKlasor  Görsellerin proje içinde kopyalanacağı yer ("" ise kopyalanmaz)
//   mod             "sohbet": bu pencerede etkileşimli sohbet açar
//                   "arkaplan": mesajı gönderir, yanıtı yazdırır ve çıkar
//   devamEt         true ise o klasördeki son sohbete devam eder
//   mesaj           Görsel listesinin önüne eklenecek talimat
//
// Seçenekler:  --proje <klasör>   --mesaj "<metin>"

const path = require('path');
const { spawn } = require('child_process');
const { gonderilecekGorseller, projeKlasorunuBul, projeyeKopyala } = require('../lib/gorseller');

function claudeCalistir({ komut, bayraklar, mesaj, mod, proje }) {
  return new Promise((coz, reddet) => {
    const baslangic = Date.now();
    let surec;
    if (mod === 'arkaplan') {
      // Mesaj standart girdiden verilir; komut satırı alıntılama derdi olmaz.
      const satir = [komut, '-p', ...bayraklar].join(' ');
      surec = spawn(satir, { cwd: proje, shell: true, stdio: ['pipe', 'inherit', 'inherit'] });
      surec.stdin.end(mesaj);
    } else if (process.platform === 'win32') {
      // Windows'ta "claude" çoğu kurulumda bir .cmd dosyasıdır ve kabuk ister.
      // Mesaj tek satıra indirilir; cmd'nin özel saydığı " ve % çıkarılır.
      const guvenli = mesaj.replace(/\s+/g, ' ').replace(/["%]/g, '');
      surec = spawn(`${komut} ${bayraklar.join(' ')} "${guvenli}"`, { cwd: proje, shell: true, stdio: 'inherit' });
    } else {
      surec = spawn(komut, [...bayraklar, mesaj], { cwd: proje, stdio: 'inherit' });
    }
    surec.on('error', reddet);
    surec.on('close', (kod) => coz({ kod, sureMs: Date.now() - baslangic }));
  });
}

async function calistir(baglam) {
  const { ayarlar, secenekler, gunluk } = baglam;
  const ayar = ayarlar.claude || {};
  const proje = projeKlasorunuBul(baglam, ayar.projeKlasoru);

  const kaynaklar = gonderilecekGorseller(baglam);
  if (!kaynaklar.length) {
    gunluk('Gönderilecek yeni görsel yok; Claude Code adımı atlandı.');
    return;
  }

  // Görselleri projeye kopyala ki sohbet onları proje içi yollarla görebilsin.
  let yollar = kaynaklar;
  if (ayar.hedefAltKlasor) {
    yollar = projeyeKopyala(kaynaklar, proje, ayar.hedefAltKlasor);
    gunluk(`${yollar.length} görsel kopyalandı -> ${path.join(proje, ayar.hedefAltKlasor)}`);
  }

  // Çok uzun listeler komut satırına sığmaz; o durumda yalnızca klasör söylenir.
  const liste = yollar.join(', ');
  const kisaListe =
    liste.length <= 4000
      ? `Görseller: ${liste}`
      : `Görseller (${yollar.length} adet) şu klasörde: ${path.dirname(yollar[0])}`;
  const mesaj = `${secenekler.mesaj || ayar.mesaj || 'Robot şu görselleri üretti.'}\n\n${kisaListe}`;

  const mod = ayar.mod === 'arkaplan' ? 'arkaplan' : 'sohbet';
  const komut = ayar.komut || 'claude';
  const dene = (devam) => claudeCalistir({ komut, bayraklar: devam ? ['--continue'] : [], mesaj, mod, proje });

  gunluk(`Claude Code başlatılıyor (${mod}${ayar.devamEt ? ', son sohbete devam' : ''}): ${proje}`);
  let sonuc;
  try {
    sonuc = await dene(Boolean(ayar.devamEt));
    // Devam edilecek sohbet yoksa Claude Code hemen hatayla çıkar; yeni sohbetle tekrar dene.
    if (ayar.devamEt && sonuc.kod !== 0 && sonuc.sureMs < 8000) {
      gunluk('Devam edilecek sohbet bulunamadı gibi görünüyor; yeni sohbet açılıyor.');
      sonuc = await dene(false);
    }
  } catch (hata) {
    throw new Error(`Claude Code başlatılamadı (${hata.message}). "claude" komutu bu bilgisayarda kurulu mu?`);
  }
  if (sonuc.kod !== 0) {
    throw new Error(`Claude Code ${sonuc.kod} koduyla kapandı. "claude" komutu kurulu ve giriş yapılmış mı? (Görseller yerinde duruyor.)`);
  }
}

module.exports = {
  ad: 'claude-gonder',
  aciklama: 'Görselleri proje klasörüne kopyalar ve bir Claude Code sohbetine iletir',
  calistir,
};
