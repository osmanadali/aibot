// Masaüstü kısayolunun çalıştırdığı görev: önce güncellemeyi denetler, sonra
// arayüzü kendi penceresinde (adres çubuğu olmayan uygulama penceresi) açar.
// Pencere kapatılınca robot da kapanır.
//
// Seçenekler:  --guncellemeden (güncelleme denetimini atla)

const path = require('path');
const { spawnSync } = require('child_process');
const { guncelle } = require('../lib/guncelle');

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

  await require('./arayuz').calistir({ ...baglam, secenekler: { ...secenekler, uygulama: true } });
}

module.exports = {
  ad: 'uygulama',
  aciklama: 'Güncellemeyi denetler ve arayüzü kendi penceresinde açar (masaüstü kısayolu bunu çalıştırır)',
  calistir,
};
