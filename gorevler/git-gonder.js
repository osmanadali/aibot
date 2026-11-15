// Görselleri proje klasörüne kopyalar, yalnızca o dosyaları commit'ler ve
// GitHub'a (uzak depoya) gönderir. Böylece buluttaki Claude Code sohbetleri
// görselleri depodan görebilir.
//
// Projede o an açık olan dala gönderir; dal değiştirmez. Projedeki başka
// değişikliklere dokunmaz.
//
// ayarlar.json > git:
//   projeKlasoru    Boşsa claude.projeKlasoru kullanılır
//   hedefAltKlasor  Boşsa claude.hedefAltKlasor kullanılır
//   uzak            Gönderilecek uzak depo adı (varsayılan "origin")
//   commitMesaji    {adet} yerine görsel sayısı yazılır
//
// Seçenekler:  --proje <klasör>   --mesaj "<commit mesajı>"

const { spawnSync } = require('child_process');
const { gonderilecekGorseller, projeKlasorunuBul, projeyeKopyala } = require('../lib/gorseller');

function git(proje, argumanlar, girdi) {
  const sonuc = spawnSync('git', argumanlar, { cwd: proje, encoding: 'utf8', input: girdi });
  if (sonuc.error) throw new Error(`git çalıştırılamadı (${sonuc.error.message}). Git kurulu mu?`);
  return { kod: sonuc.status, cikti: `${sonuc.stdout || ''}${sonuc.stderr || ''}`.trim() };
}

function gitZorunlu(proje, argumanlar, girdi, neOldu) {
  const sonuc = git(proje, argumanlar, girdi);
  if (sonuc.kod !== 0) throw new Error(`${neOldu}\n${sonuc.cikti}`);
  return sonuc.cikti;
}

async function calistir(baglam) {
  const { ayarlar, secenekler, gunluk } = baglam;
  const ayar = ayarlar.git || {};
  const claude = ayarlar.claude || {};
  const proje = projeKlasorunuBul(baglam, ayar.projeKlasoru, claude.projeKlasoru);
  const altKlasor = ayar.hedefAltKlasor || claude.hedefAltKlasor;
  if (!altKlasor) throw new Error('Görsellerin proje içinde nereye konacağı belli değil. ayarlar.json > git.hedefAltKlasor alanını doldur.');

  if (git(proje, ['rev-parse', '--is-inside-work-tree']).kod !== 0) {
    throw new Error(`${proje} bir git deposu değil.`);
  }

  const kaynaklar = gonderilecekGorseller(baglam);
  if (!kaynaklar.length) {
    gunluk('Gönderilecek yeni görsel yok; GitHub adımı atlandı.');
    return;
  }

  const yollar = projeyeKopyala(kaynaklar, proje, altKlasor);
  // Yollar git'e standart girdiden, NUL ile ayrılmış verilir: adet ve özel karakter sınırı olmaz.
  const yolGirdisi = yollar.join('\0');
  const yolSecimi = ['--pathspec-from-file=-', '--pathspec-file-nul'];

  gitZorunlu(proje, ['add', ...yolSecimi], yolGirdisi, 'Görseller git\'e eklenemedi.');
  // "git diff" yol dosyası kabul etmez; hazırlanan tüm dosyalar okunup bizimkiler ayıklanır.
  const hazirlananlar = gitZorunlu(proje, ['diff', '--cached', '--name-only', '-z'], undefined, 'Değişiklikler okunamadı.').split('\0');
  const degisenler = yollar.filter((yol) => hazirlananlar.includes(yol));

  if (degisenler.length) {
    const mesaj = (secenekler.mesaj || ayar.commitMesaji || 'Robot: {adet} görsel eklendi').replace('{adet}', degisenler.length);
    gitZorunlu(proje, ['commit', '-m', mesaj, ...yolSecimi], yolGirdisi, 'Commit oluşturulamadı.');
    gunluk(`${degisenler.length} görsel commit'lendi: "${mesaj}"`);
  } else {
    gunluk('Görseller depoda zaten güncel; yeni commit gerekmedi.');
  }

  const dal = gitZorunlu(proje, ['rev-parse', '--abbrev-ref', 'HEAD'], undefined, 'Açık dal okunamadı.');
  if (dal === 'HEAD') throw new Error('Projede açık bir dal yok (ayrık HEAD). Bir dala geçip tekrar çalıştır.');
  const uzak = ayar.uzak || 'origin';
  gunluk(`${uzak}/${dal} dalına gönderiliyor…`);
  gitZorunlu(
    proje,
    ['push', uzak, `HEAD:refs/heads/${dal}`],
    undefined,
    `GitHub'a gönderilemedi. Commit bilgisayarında duruyor; sorunu giderip "node robot.js git-gonder" ile tekrar dene.`
  );

  baglam.veri.gonderilenYollar = yollar;
  gunluk(`Gönderildi: ${dal} dalında ${altKlasor}/ altında ${yollar.length} görsel.`);
}

module.exports = {
  ad: 'git-gonder',
  aciklama: 'Görselleri proje klasörüne kopyalar, commit\'ler ve GitHub\'a gönderir',
  calistir,
};
