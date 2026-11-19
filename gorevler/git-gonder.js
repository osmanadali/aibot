// Görselleri proje klasörüne kopyalar, yalnızca o dosyaları commit'ler ve
// GitHub'a (uzak depoya) gönderir. Böylece buluttaki Claude Code sohbetleri
// görselleri depodan görebilir.
//
// İki şekilde çalışır:
//   - git.depoAdresi yazılıysa robot depoyu kendi veri klasörüne indirir, her
//     seferinde günceller ve oraya gönderir. Adres deponun kendisi olabilir
//     (https://github.com/kullanici/oyun) ya da depodaki bir klasörün sayfası
//     (https://github.com/kullanici/oyun/tree/dal-adi/gorseller); ikincisinde dal
//     ve klasör adresten okunur.
//   - Yazılı değilse bilgisayarındaki proje klasörünü kullanır; o an açık olan
//     dala gönderir, dal değiştirmez, projedeki başka değişikliklere dokunmaz.
//
// ayarlar.json > git:
//   depoAdresi      GitHub deposunun ya da içindeki bir klasörün adresi (ya da "kullanici/depo")
//   dal             Gönderilecek dal; boşsa adresteki dal, o da yoksa deponun ana dalı
//   projeKlasoru    Depo adresi yoksa kullanılır; o da boşsa claude.projeKlasoru
//   hedefAltKlasor  Boşsa claude.hedefAltKlasor kullanılır
//   uzak            Gönderilecek uzak depo adı (varsayılan "origin")
//   commitMesaji    {adet} yerine görsel sayısı yazılır
//
// Seçenekler:  --proje <klasör>   --mesaj "<commit mesajı>"

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { dosyaAdinaCevir, gonderilecekGorseller, projeKlasorunuBul, projeyeKopyala, veriKlasoru } = require('../lib/gorseller');

function git(proje, argumanlar, girdi, zamanAsimi = 120000) {
  // Parola komut penceresinden sorulmaz (pencere görünmüyor olabilir); Git'in giriş penceresi yine açılır.
  const sonuc = spawnSync('git', argumanlar, {
    cwd: proje,
    encoding: 'utf8',
    input: girdi,
    timeout: zamanAsimi,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (sonuc.error && sonuc.error.code === 'ENOENT') throw new Error('Git kurulu değil. https://git-scm.com/download/win adresinden kur, sonra tekrar dene.');
  if (sonuc.error) throw new Error(`git çalıştırılamadı (${sonuc.error.message}).`);
  return { kod: sonuc.status, cikti: `${sonuc.stdout || ''}${sonuc.stderr || ''}`.trim() };
}

function gitZorunlu(proje, argumanlar, girdi, neOldu, zamanAsimi) {
  const sonuc = git(proje, argumanlar, girdi, zamanAsimi);
  if (sonuc.kod !== 0) throw new Error(`${neOldu}\n${sonuc.cikti}`);
  return sonuc.cikti;
}

// Yazılan adresi deponun adresine ve (varsa) depo içindeki yola ayırır.
//   https://github.com/kullanici/oyun/tree/dal/klasor -> { adres: '.../kullanici/oyun', yol: 'dal/klasor' }
function depoAdresiniAyir(girdi) {
  const metin = String(girdi).trim();
  if (/^[\w.-]+\/[\w.-]+$/.test(metin) && !fs.existsSync(metin)) return { adres: `https://github.com/${metin}`, yol: '' };
  const github = metin.match(/^https:\/\/github\.com\/([^/]+)\/([^/?#]+?)(?:\.git)?(?:\/(?:tree|upload|blob)\/([^?#]+?))?\/?(?:[?#].*)?$/);
  if (!github) return { adres: metin, yol: '' };
  return { adres: `https://github.com/${github[1]}/${github[2]}`, yol: github[3] ? decodeURIComponent(github[3]) : '' };
}

// Dal adlarında da "/" olabildiği için yol, depodaki dallarla karşılaştırılarak bölünür.
function dalVeKlasorAyir(yol, dallar) {
  const dal = dallar
    .filter((aday) => yol === aday || yol.startsWith(`${aday}/`))
    .sort((a, b) => b.length - a.length)[0];
  return dal ? { dal, klasor: yol.slice(dal.length + 1) } : { dal: '', klasor: '' };
}

// Depoyu robotun veri klasörüne indirir (zaten inmişse günceller) ve istenen dala geçer.
// Sonuç: { klasor: deponun bilgisayardaki yeri, altKlasor: adresten okunan hedef klasör }
function depoyuHazirla(baglam, { adres, yol }, istenenDal, zorunluDal) {
  const { gunluk } = baglam;
  const depolar = path.join(veriKlasoru(baglam), 'depolar');
  const ad = dosyaAdinaCevir(adres.replace(/\.git$/, '').split(/[\\/:]/).filter(Boolean).pop() || 'depo');
  const klasor = path.join(depolar, ad);
  fs.mkdirSync(depolar, { recursive: true });

  if (!fs.existsSync(path.join(klasor, '.git'))) {
    gunluk(`Depo indiriliyor: ${adres}`);
    gitZorunlu(depolar, ['clone', adres, ad], undefined, 'Depo indirilemedi. Adres doğru mu, depoya erişimin var mı?', 600000);
  } else if (git(klasor, ['fetch', 'origin', '--prune']).kod !== 0) {
    gunluk('Depo güncellenemedi; eldeki hâliyle devam ediliyor.');
  }

  let dal = istenenDal || '';
  let altKlasor = '';
  if (yol) {
    const dallar = git(klasor, ['for-each-ref', '--format=%(refname:lstrip=3)', 'refs/remotes/origin']).cikti.split('\n').filter((d) => d && d !== 'HEAD');
    ({ dal, klasor: altKlasor } = dalVeKlasorAyir(yol, dallar));
    if (!dal) throw new Error(`Adresteki dal depoda bulunamadı: ${yol}. Dal silinmiş ya da adı değişmiş olabilir; adresi güncelle.`);
  }
  if (zorunluDal) dal = zorunluDal;
  if (dal) gitZorunlu(klasor, ['checkout', dal], undefined, `"${dal}" dalına geçilemedi. Dal depoda var mı?`);
  git(klasor, ['pull', '--ff-only']);

  // Git'te ad ve e-posta tanımlı değilse commit oluşturulamaz.
  if (!git(klasor, ['config', 'user.email']).cikti) {
    git(klasor, ['config', 'user.name', 'Robot']);
    git(klasor, ['config', 'user.email', 'robot@localhost']);
  }
  return { klasor, altKlasor };
}

// Bir grup görseli tek bir hedefe (depo, dal, klasör) commit'leyip gönderir.
// hedef null ise ayarlardaki adres kullanılır; doluysa işin metninde yazan hedef önce gelir.
function grubuGonder(baglam, kaynaklar, hedef) {
  const { ayarlar, secenekler, gunluk } = baglam;
  const ayar = ayarlar.git || {};
  const claude = ayarlar.claude || {};
  const ayardakiDepo = !secenekler.proje && !ayar.projeKlasoru && ayar.depoAdresi ? depoAdresiniAyir(ayar.depoAdresi) : null;

  let hazir;
  if (hedef && hedef.depo) {
    // Metinde depo yazıyor: o depo; dal metinden, yoksa adresteki /tree/ yolundan, o da yoksa ana dal.
    const depo = depoAdresiniAyir(hedef.depo);
    hazir = depoyuHazirla(baglam, { adres: depo.adres, yol: hedef.dal ? '' : hedef.agacYolu || '' }, '', hedef.dal);
  } else if (ayardakiDepo) {
    // Metinde depo yok: ayardaki depo; metinde dal yazıyorsa o dal.
    hazir = depoyuHazirla(baglam, ayardakiDepo, ayar.dal, hedef && hedef.dal);
  } else if (secenekler.proje || ayar.projeKlasoru || claude.projeKlasoru) {
    hazir = { klasor: projeKlasorunuBul(baglam, ayar.projeKlasoru, claude.projeKlasoru), altKlasor: '' };
  } else {
    throw new Error('GitHub deposu belirtilmemiş. Ayarlar bölümünde "GitHub deposu" alanını doldur ya da istemde depo adresini yaz.');
  }

  const proje = hazir.klasor;
  if (git(proje, ['rev-parse', '--is-inside-work-tree']).kod !== 0) {
    throw new Error(`${proje} bir git deposu değil.`);
  }
  const acikDal = gitZorunlu(proje, ['symbolic-ref', '--short', 'HEAD'], undefined, 'Projede açık bir dal yok. Bir dala geçip tekrar çalıştır.');
  // Yerel proje klasöründe dal değiştirilmez; istemdeki dal açık daldan farklıysa yanlış dala gitmesin diye durulur.
  if (hedef && hedef.dal && acikDal !== hedef.dal) {
    throw new Error(`İstemde "${hedef.dal}" dalı yazıyor ama ${proje} şu an "${acikDal}" dalında. Yanlış dala gitmesin diye gönderilmedi.`);
  }
  // Klasör: istemde yazan, yoksa adresteki, yoksa ayardaki.
  const altKlasor = (hedef && hedef.klasor) || hazir.altKlasor || ayar.hedefAltKlasor || claude.hedefAltKlasor;
  if (!altKlasor) throw new Error('Görsellerin depoda nereye konacağı belli değil. ayarlar.yerel.json > git.hedefAltKlasor alanını doldur ya da istemde yolu yaz.');

  const yollar = projeyeKopyala(kaynaklar, proje, altKlasor);
  // Yollar git'e standart girdiden, NUL ile ayrılmış verilir: adet ve özel karakter sınırı olmaz.
  const yolGirdisi = yollar.join('\0');
  const yolSecimi = ['--pathspec-from-file=-', '--pathspec-file-nul'];

  gitZorunlu(proje, ['add', ...yolSecimi], yolGirdisi, 'Görseller git\'e eklenemedi.');
  // "git diff" yol dosyası kabul etmez; hazırlanan tüm dosyalar okunup bizimkiler ayıklanır.
  const hazirlananlar = gitZorunlu(proje, ['diff', '--cached', '--name-only', '-z'], undefined, 'Değişiklikler okunamadı.').split('\0');
  const degisenler = yollar.filter((yol) => hazirlananlar.includes(yol));

  if (degisenler.length) {
    const mesaj = ((hedef && hedef.mesaj) || secenekler.mesaj || ayar.commitMesaji || 'Robot: {adet} görsel eklendi').replace('{adet}', degisenler.length);
    gitZorunlu(proje, ['commit', '-m', mesaj, ...yolSecimi], yolGirdisi, 'Commit oluşturulamadı.');
    gunluk(`${degisenler.length} görsel commit'lendi: "${mesaj}"`);
  } else {
    gunluk('Görseller depoda zaten güncel; yeni commit gerekmedi.');
  }

  const uzak = ayar.uzak || 'origin';
  gunluk(`${uzak}/${acikDal} dalına gönderiliyor…`);
  gitZorunlu(
    proje,
    ['push', uzak, `HEAD:refs/heads/${acikDal}`],
    undefined,
    `GitHub'a gönderilemedi. Commit bilgisayarında duruyor; sorunu giderip "node robot.js git-gonder" ile tekrar dene.`
  );
  gunluk(`Gönderildi: ${acikDal} dalında ${altKlasor}/ altında ${yollar.length} görsel.`);
  return yollar;
}

async function calistir(baglam) {
  const { gunluk } = baglam;
  const kaynaklar = gonderilecekGorseller(baglam);
  if (!kaynaklar.length) {
    gunluk('Gönderilecek yeni görsel yok; GitHub adımı atlandı.');
    return;
  }

  // Görseller hedeflerine göre gruplanır: metninde depo/dal/klasör yazanlar oraya,
  // yazmayanlar ayarlardaki GitHub adresine gider.
  const hedefler = baglam.veri.hedefler || {};
  const gruplar = new Map();
  for (const kaynak of kaynaklar) {
    const h = hedefler[kaynak];
    const hedef = h && (h.depo || h.dal || h.klasor || h.agacYolu) ? h : null;
    const anahtar = hedef ? JSON.stringify([hedef.depo, hedef.agacYolu, hedef.dal, hedef.klasor, hedef.mesaj]) : '';
    if (!gruplar.has(anahtar)) gruplar.set(anahtar, { hedef, kaynaklar: [] });
    gruplar.get(anahtar).kaynaklar.push(kaynak);
  }

  const gonderilenler = [];
  for (const { hedef, kaynaklar: grup } of gruplar.values()) gonderilenler.push(...grubuGonder(baglam, grup, hedef));
  baglam.veri.gonderilenYollar = gonderilenler;
}

module.exports = {
  depoAdresiniAyir,
  depoyuHazirla,
  dalVeKlasorAyir,
  ad: 'git-gonder',
  aciklama: 'Görselleri proje klasörüne kopyalar, commit\'ler ve GitHub\'a gönderir',
  calistir,
};
