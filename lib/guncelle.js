// Robotun yeni sürümünü GitHub'daki depodan indirip kurar.
//
// Kurulu sürüm surum.txt içindeki commit kimliğidir. Depodaki son commit
// farklıysa paket indirilir ve dosyalar üzerine yazılır. Sana ait olanlara
// (aşağıdaki KORUNANLAR) dokunulmaz. Depodan silinen dosyalar da silinir.
//
// İnternet yoksa ya da bir şey ters giderse robot eski sürümle açılmaya devam eder.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const KORUNANLAR = new Set(['.git', 'node_modules', 'veri', 'cikti', 'tarayici-profili', 'ayarlar.yerel.json', 'istemler.txt']);

function kuruluSurum(kok) {
  const dosya = path.join(kok, 'surum.txt');
  if (!fs.existsSync(dosya)) return '';
  const surum = fs.readFileSync(dosya, 'utf8').trim();
  return /^[0-9a-f]{40}$/.test(surum) ? surum : '';
}

function dosyalariListele(klasor, on = '') {
  const liste = [];
  for (const girdi of fs.readdirSync(klasor, { withFileTypes: true })) {
    const goreli = on ? `${on}/${girdi.name}` : girdi.name;
    if (girdi.isDirectory()) liste.push(...dosyalariListele(path.join(klasor, girdi.name), goreli));
    else if (girdi.isFile()) liste.push(goreli);
  }
  return liste;
}

const korunuyorMu = (goreli) => KORUNANLAR.has(goreli.split('/')[0]);

function tarKomutu() {
  // Windows'un kendi tar'ı; PATH'teki başka bir tar "C:" yollarını yanlış anlayabilir.
  if (process.platform === 'win32') {
    const sistem = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    if (fs.existsSync(sistem)) return sistem;
  }
  return 'tar';
}

async function indir(adres, zamanAsimi) {
  const yanit = await fetch(adres, {
    headers: { 'user-agent': 'robot-guncelleyici' },
    signal: AbortSignal.timeout(zamanAsimi),
    redirect: 'follow',
  });
  if (!yanit.ok) throw new Error(`${new URL(adres).host} ${yanit.status} yanıtı verdi`);
  return Buffer.from(await yanit.arrayBuffer());
}

// Depodaki son sürümün (dalın son commit'inin) kimliğini döndürür.
async function sonSurum(ayar = {}) {
  const depo = ayar.depo || 'osmanadali/aibot';
  const dal = ayar.dal || 'main';
  // Dalın son commit'i git'in herkese açık uç noktasından okunur (GitHub API'sinin saatlik sınırına takılmaz).
  const adres = ayar.surumAdresi || `https://github.com/${depo}.git/info/refs?service=git-upload-pack`;
  const yanit = (await indir(adres, 8000)).toString('latin1');
  const dalSatiri = yanit.match(new RegExp(`([0-9a-f]{40}) refs/heads/${dal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`));
  const surum = dalSatiri ? dalSatiri[1] : yanit.trim();
  if (!/^[0-9a-f]{40}$/.test(surum)) throw new Error('sürüm bilgisi okunamadı');
  return surum;
}

// Sonuç: { durum: 'guncel' | 'guncellendi' | 'atlandi', surum, neden }
async function guncelle(baglam) {
  const { kok, gunluk } = baglam;
  const ayar = baglam.ayarlar.guncelleme || {};
  const mevcut = kuruluSurum(kok);

  if (ayar.kapali) return { durum: 'atlandi', surum: mevcut, neden: 'güncelleme ayarlardan kapatılmış' };
  if (fs.existsSync(path.join(kok, '.git'))) return { durum: 'atlandi', surum: mevcut, neden: 'bu klasör bir git kopyası (git pull ile güncellenir)' };

  const depo = ayar.depo || 'osmanadali/aibot';
  const paketKalibi = ayar.paketAdresi || `https://codeload.github.com/${depo}/tar.gz/{surum}`;
  const gecici = path.join(kok, 'veri', 'guncelleme');

  try {
    const yeni = await sonSurum(ayar);
    if (yeni === mevcut) return { durum: 'guncel', surum: mevcut };

    gunluk(`Yeni sürüm bulundu (${yeni.slice(0, 7)}), indiriliyor…`);
    fs.rmSync(gecici, { recursive: true, force: true });
    fs.mkdirSync(path.join(gecici, 'yeni'), { recursive: true });
    fs.writeFileSync(path.join(gecici, 'paket.tar.gz'), await indir(paketKalibi.replace('{surum}', yeni), 120000));

    const acma = spawnSync(tarKomutu(), ['-xzf', 'paket.tar.gz', '-C', 'yeni'], { cwd: gecici, encoding: 'utf8' });
    if (acma.error || acma.status !== 0) throw new Error(`paket açılamadı: ${acma.error ? acma.error.message : acma.stderr}`);

    const ustKlasorler = fs.readdirSync(path.join(gecici, 'yeni'));
    const kaynak = path.join(gecici, 'yeni', ustKlasorler[0] || '');
    if (ustKlasorler.length !== 1 || !fs.existsSync(path.join(kaynak, 'robot.js')) || !fs.existsSync(path.join(kaynak, 'package.json'))) {
      throw new Error('indirilen paket beklenen biçimde değil');
    }

    const oku = (dosya) => (fs.existsSync(dosya) ? fs.readFileSync(dosya, 'utf8') : '');
    const paketlerDegisti = oku(path.join(kaynak, 'package-lock.json')) !== oku(path.join(kok, 'package-lock.json'));

    const yeniDosyalar = dosyalariListele(kaynak).filter((goreli) => !korunuyorMu(goreli));
    for (const goreli of yeniDosyalar) {
      const hedef = path.join(kok, goreli);
      fs.mkdirSync(path.dirname(hedef), { recursive: true });
      fs.copyFileSync(path.join(kaynak, goreli), hedef);
    }

    // Önceki güncellemenin kurduğu ama artık depoda olmayan dosyaları kaldır.
    const listeDosyasi = path.join(kok, 'veri', 'kurulu-dosyalar.json');
    const eskiDosyalar = fs.existsSync(listeDosyasi) ? JSON.parse(fs.readFileSync(listeDosyasi, 'utf8')) : [];
    for (const goreli of eskiDosyalar) {
      if (!yeniDosyalar.includes(goreli) && !korunuyorMu(goreli)) fs.rmSync(path.join(kok, goreli), { force: true });
    }
    fs.writeFileSync(listeDosyasi, JSON.stringify(yeniDosyalar));
    fs.writeFileSync(path.join(kok, 'surum.txt'), `${yeni}\n`);

    if (paketlerDegisti) {
      gunluk('Gerekli parçalar güncelleniyor (npm install)…');
      const npm = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: kok, shell: process.platform === 'win32', stdio: 'inherit' });
      if (npm.error || npm.status !== 0) gunluk('npm install başarısız oldu; kur.bat dosyasını bir kez çalıştır.');
    }

    gunluk(`Güncellendi: ${mevcut ? mevcut.slice(0, 7) : 'bilinmeyen sürüm'} -> ${yeni.slice(0, 7)}`);
    return { durum: 'guncellendi', surum: yeni };
  } catch (hata) {
    return { durum: 'atlandi', surum: mevcut, neden: String(hata.message).split('\n')[0] };
  } finally {
    fs.rmSync(gecici, { recursive: true, force: true });
  }
}

module.exports = { guncelle, kuruluSurum, sonSurum };
