// Masaüstü kısayolunun çalıştırdığı görev: önce güncellemeyi denetler, sonra
// arayüzü kendi penceresinde (adres çubuğu olmayan uygulama penceresi) açar.
// Pencere kapatılınca robot da kapanır.
//
// Seçenekler:  --guncellemeden (güncelleme denetimini atla)

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { guncelle } = require('../lib/guncelle');
const { veriKlasoru } = require('../lib/gorseller');

// Kısayolun görünümü (simge dosyası vb.) değiştiğinde bu sayı artırılır; robot bir
// sonraki açılışta masaüstü kısayolunu kendiliğinden yeniler.
const KISAYOL_SURUMU = '2';

function kisayoluYenile(baglam) {
  if (process.platform !== 'win32') return;
  try {
    const isaret = path.join(veriKlasoru(baglam), 'kisayol-surumu.txt');
    if (fs.existsSync(isaret) && fs.readFileSync(isaret, 'utf8').trim() === KISAYOL_SURUMU) return;
    const sonuc = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(baglam.kok, 'kisayol.ps1')],
      { stdio: 'ignore', timeout: 30000 }
    );
    if (sonuc.error || sonuc.status !== 0) return;
    fs.mkdirSync(path.dirname(isaret), { recursive: true });
    fs.writeFileSync(isaret, KISAYOL_SURUMU);
    baglam.gunluk('Masaüstü kısayolu yenilendi.');
  } catch {
    /* kısayol yenilenemese de robot açılır */
  }
}

async function calistir(baglam) {
  const { secenekler, gunluk } = baglam;

  if (!secenekler.guncellemeden) {
    // Güncelleme sırasındaki hiçbir hata robotun açılmasını engellememeli.
    const sonuc = await guncelle(baglam).catch((hata) => ({ durum: 'atlandi', neden: String(hata.message).split('\n')[0] }));
    if (sonuc.durum === 'atlandi') gunluk(`Güncelleme denetlenemedi: ${sonuc.neden}.`);
    baglam.veri.guncelleme = sonuc;
    if (sonuc.durum === 'guncellendi') {
      // Bellekteki kod eski sürüm; yeni sürümle baştan başla.
      gunluk('Yeni sürümle yeniden başlatılıyor…');
      const yeni = spawnSync(
        process.execPath,
        [path.join(baglam.kok, 'robot.js'), ...process.argv.slice(2), '--guncellemeden', '--guncellendi'],
        { cwd: baglam.kok, stdio: 'inherit' }
      );
      process.exit(yeni.status === null ? 1 : yeni.status);
    }
  }

  kisayoluYenile(baglam);
  await require('./arayuz').calistir({ ...baglam, secenekler: { ...secenekler, uygulama: true } });
}

module.exports = {
  ad: 'uygulama',
  aciklama: 'Güncellemeyi denetler ve arayüzü kendi penceresinde açar (masaüstü kısayolu bunu çalıştırır)',
  calistir,
};
