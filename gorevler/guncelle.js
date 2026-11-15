// Robotun yeni sürümü varsa indirip kurar. Uygulama her açılışta bunu
// kendiliğinden yapar; elle denemek için:  node robot.js guncelle

const { guncelle } = require('../lib/guncelle');

async function calistir(baglam) {
  const sonuc = await guncelle(baglam);
  const kisa = sonuc.surum ? sonuc.surum.slice(0, 7) : 'bilinmiyor';
  if (sonuc.durum === 'guncel') baglam.gunluk(`Robot güncel (sürüm ${kisa}).`);
  if (sonuc.durum === 'atlandi') baglam.gunluk(`Güncelleme yapılmadı: ${sonuc.neden}.`);
  baglam.veri.guncelleme = sonuc;
}

module.exports = {
  ad: 'guncelle',
  aciklama: 'Robotun yeni sürümü varsa GitHub\'dan indirip kurar',
  calistir,
};
