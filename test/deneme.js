// Robotu baştan sona sahte bir ChatGPT sitesi ve sahte bir "claude" komutuyla
// dener. Gerçek hesaplara dokunmaz.   Çalıştırma:  npm test   (ya da deneme.bat)
//
// Sınadıkları: tarayıcıyı açıp bağlanma, istemi yazıp gönderme, görseli bekleyip
// indirme (aynı ve farklı kaynaktan), yazılı yanıtta hata verme, kaldığı yerden
// devam etme, görselleri projeye kopyalayıp Claude Code'a iletme, görselleri
// commit'leyip uzak depoya gönderme, arayüzden referans görselli iş çalıştırma,
// yeni sürümü indirip kurma, uygulama penceresiyle açılıp kapanma.

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright-core');
const { sahteChatgptBaslat, pngUret } = require('./sahte-chatgpt');

const KOK = path.join(__dirname, '..');
const PORT = 9339;
const ARAYUZ_PORTU = 4399;

function kontrol(kosul, aciklama) {
  if (!kosul) throw new Error(`BAŞARISIZ: ${aciklama}`);
  console.log(`  ✓ ${aciklama}`);
}

function sahteClaudeYaz(klasor, kayit) {
  const betik = path.join(klasor, 'sahte-claude.js');
  fs.writeFileSync(
    betik,
    `const fs = require('fs');
let girdi = '';
if (process.argv.includes('-p')) girdi = fs.readFileSync(0, 'utf8');
fs.appendFileSync(${JSON.stringify(kayit)}, JSON.stringify({ argumanlar: process.argv.slice(2), klasor: process.cwd(), girdi }) + '\\n');
`
  );
  if (process.platform === 'win32') {
    const cmd = path.join(klasor, 'sahte-claude.cmd');
    fs.writeFileSync(cmd, `@node "%~dp0sahte-claude.js" %*\r\n`);
    return `"${cmd}"`;
  }
  const sh = path.join(klasor, 'sahte-claude');
  fs.writeFileSync(sh, `#!/bin/sh\nexec node "${betik}" "$@"\n`, { mode: 0o755 });
  return sh;
}

// Sahte site bu süreçte çalıştığı için robot eşzamansız başlatılır (süreç bloklanmamalı).
function robotCalistir(argumanlar, kok = KOK) {
  return new Promise((coz) => {
    const surec = spawn(process.execPath, [path.join(kok, 'robot.js'), ...argumanlar]);
    const sonuc = { stdout: '', stderr: '', status: null };
    surec.stdout.on('data', (veri) => {
      sonuc.stdout += veri;
      process.stdout.write(String(veri).replace(/^(?=.)/gm, '    | '));
    });
    surec.stderr.on('data', (veri) => {
      sonuc.stderr += veri;
      process.stdout.write(String(veri).replace(/^(?=.)/gm, '    ! '));
    });
    surec.on('close', (kod) => coz({ ...sonuc, status: kod }));
  });
}

async function tarayiciyiKapat() {
  try {
    const tarayici = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
    const oturum = await tarayici.newBrowserCDPSession();
    await oturum.send('Browser.close').catch(() => {});
  } catch {
    /* zaten kapalı */
  }
}

async function ana() {
  const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'robot-deneme-'));
  const proje = path.join(gecici, 'oyun projem');
  const cikti = path.join(gecici, 'cikti');
  const kayit = path.join(gecici, 'claude-kaydi.jsonl');
  fs.mkdirSync(proje);

  const site = await sahteChatgptBaslat();
  const temel = JSON.parse(fs.readFileSync(path.join(KOK, 'ayarlar.json'), 'utf8'));
  const linux = process.platform !== 'win32';
  const ayarlar = {
    ...temel,
    tarayici: {
      yol: process.env.ROBOT_TARAYICI || '',
      port: PORT,
      profilKlasoru: path.join(gecici, 'profil'),
      ekArgumanlar: process.env.ROBOT_GORUNUR ? [] : ['--headless=new', ...(linux ? ['--no-sandbox'] : [])],
    },
    chatgpt: {
      ...temel.chatgpt,
      adres: site.adres,
      gorselBeklemeDakika: 0.5,
      metinSonrasiSaniye: 3,
      kararliSaniye: 2,
      istemArasiSaniye: 0,
      denemeSayisi: 1,
    },
    gorselUret: { istemDosyasi: path.join(gecici, 'istemler.txt'), ciktiKlasoru: cikti },
    claude: { ...temel.claude, komut: sahteClaudeYaz(gecici, kayit), projeKlasoru: proje, mod: 'sohbet', devamEt: true },
  };
  const ayarDosyasi = path.join(gecici, 'ayarlar.json');
  const ayarYaz = () => fs.writeFileSync(ayarDosyasi, JSON.stringify(ayarlar, null, 2));
  ayarYaz();

  fs.writeFileSync(
    ayarlar.gorselUret.istemDosyasi,
    ['# deneme istemleri', 'şövalye | Kılıçlı bir şövalye', 'Yeşil bir slime ayni-kaynak', 'olmaz | YAZI ile yanıt ver'].join('\n')
  );

  const pngMi = (dosya) => fs.readFileSync(dosya).subarray(0, 4).toString('hex') === '89504e47';
  const kayitlar = () => fs.readFileSync(kayit, 'utf8').trim().split('\n').map((s) => JSON.parse(s));

  try {
    console.log('1) Akış: görsel üret -> Claude Code sohbetine gönder');
    let sonuc = await robotCalistir(['oyun-gorselleri', '--ayarlar', ayarDosyasi]);
    kontrol(sonuc.status === 0, 'akış hatasız bitti');
    kontrol(pngMi(path.join(cikti, 'sovalye.png')), 'farklı kaynaktaki görsel indirildi (sovalye.png)');
    kontrol(pngMi(path.join(cikti, '002-yesil-bir-slime-ayni-kaynak.png')), 'aynı kaynaktaki görsel indirildi, ad istemden türetildi');
    kontrol(!/ekran görüntüsü alınıyor/.test(sonuc.stdout), 'görseller dosya olarak indirildi (ekran görüntüsü yedeğine düşülmedi)');
    kontrol(!fs.existsSync(path.join(cikti, 'olmaz.png')) && /Bu görseli üretemiyorum/.test(sonuc.stdout), 'yazılı yanıt hata olarak bildirildi');
    kontrol(fs.existsSync(path.join(cikti, 'hata-olmaz.png')), 'başarısız istem için ekran görüntüsü alındı');
    kontrol(pngMi(path.join(proje, 'assets', 'uretilen', 'sovalye.png')), 'görseller proje klasörüne kopyalandı');
    let [ilk] = kayitlar();
    kontrol(kayitlar().length === 1 && ilk.argumanlar[0] === '--continue', 'Claude Code son sohbete devam edecek şekilde çağrıldı');
    kontrol(fs.realpathSync(ilk.klasor) === fs.realpathSync(proje), 'Claude Code proje klasöründe çalıştı');
    const mesaj = ilk.argumanlar[ilk.argumanlar.length - 1];
    kontrol(mesaj.includes('assets/uretilen/sovalye.png') && mesaj.includes('002-yesil-bir-slime-ayni-kaynak.png'), 'mesajda iki görselin yolu var');
    kontrol(!mesaj.includes('hata-olmaz'), 'hata ekran görüntüsü gönderilmedi');

    console.log('2) Tekrar çalıştırma: bitenler atlanır, yalnızca eksik olan denenir');
    sonuc = await robotCalistir(['gorsel-uret', '--ayarlar', ayarDosyasi]);
    kontrol((sonuc.stdout.match(/atlanıyor/g) || []).length === 2, 'biten 2 istem atlandı');
    kontrol(sonuc.status !== 0 && /Hiç görsel üretilemedi/.test(sonuc.stderr), 'yeni görsel çıkmayınca hata koduyla bitti');

    console.log('3) Tek başına claude-gonder, arka plan modu');
    ayarlar.claude.mod = 'arkaplan';
    ayarlar.claude.devamEt = false;
    ayarYaz();
    sonuc = await robotCalistir(['claude-gonder', '--ayarlar', ayarDosyasi, '--mesaj', 'Bunları "oyuna" ekle']);
    kontrol(sonuc.status === 0, 'görev hatasız bitti');
    const son = kayitlar().pop();
    kontrol(son.argumanlar.join(' ') === '-p', 'Claude Code -p ile çağrıldı');
    kontrol(son.girdi.startsWith('Bunları "oyuna" ekle') && son.girdi.includes('assets/uretilen/sovalye.png'), 'mesaj standart girdiden bozulmadan iletildi');

    console.log('4) git-gonder: görselleri commit edip uzak depoya gönderme');
    const uzakDepo = path.join(gecici, 'uzak.git');
    const git = (klasor, ...arg) => {
      const s = spawnSync('git', arg, { cwd: klasor, encoding: 'utf8' });
      if (s.status !== 0) throw new Error(`git ${arg.join(' ')}: ${s.stderr}`);
      return s.stdout.trim();
    };
    git(gecici, 'init', '-q', '--bare', uzakDepo);
    git(proje, 'init', '-q', '-b', 'ana');
    git(proje, 'config', 'user.name', 'Deneme');
    git(proje, 'config', 'user.email', 'deneme@example.invalid');
    git(proje, 'config', 'commit.gpgsign', 'false');
    git(proje, 'remote', 'add', 'origin', uzakDepo);
    fs.writeFileSync(path.join(proje, 'oyun.txt'), 'oyun');
    fs.writeFileSync(path.join(proje, 'yarim-is.txt'), 'commit edilmemeli');
    git(proje, 'add', 'oyun.txt');
    git(proje, 'commit', '-q', '-m', 'ilk');
    git(proje, 'add', 'yarim-is.txt');
    sonuc = await robotCalistir(['git-gonder', '--ayarlar', ayarDosyasi]);
    kontrol(sonuc.status === 0, 'görev hatasız bitti');
    const uzaktakiler = git(uzakDepo, 'ls-tree', '-r', '--name-only', 'ana').split('\n');
    kontrol(uzaktakiler.includes('assets/uretilen/sovalye.png') && uzaktakiler.includes('assets/uretilen/002-yesil-bir-slime-ayni-kaynak.png'), 'iki görsel uzak depoya ulaştı');
    kontrol(!uzaktakiler.includes('yarim-is.txt') && git(proje, 'status', '--porcelain').includes('A  yarim-is.txt'), 'projedeki başka değişikliklere dokunulmadı');
    kontrol(git(uzakDepo, 'log', '-1', '--format=%s', 'ana') === 'Robot: 2 görsel eklendi', 'commit mesajı görsel sayısını içeriyor');
    const oncekiCommit = git(uzakDepo, 'rev-parse', 'ana');
    sonuc = await robotCalistir(['git-gonder', '--ayarlar', ayarDosyasi]);
    kontrol(sonuc.status === 0 && git(uzakDepo, 'rev-parse', 'ana') === oncekiCommit, 'tekrar çalıştırınca boş commit oluşmadı');

    console.log('4b) git-gonder: depo adresiyle (robot depoyu kendisi indirir), dal ve klasör seçimi');
    const { depoAdresiniAyir, dalVeKlasorAyir } = require('../gorevler/git-gonder');
    const ayrilan = depoAdresiniAyir('https://github.com/ornek/oyun/tree/claude/yeni-ozellik/gorseller');
    kontrol(ayrilan.adres === 'https://github.com/ornek/oyun' && ayrilan.yol === 'claude/yeni-ozellik/gorseller', 'klasör sayfasının adresi depo ve yola ayrıldı');
    kontrol(depoAdresiniAyir('https://github.com/ornek/oyun/upload/main/gorseller').yol === 'main/gorseller' && depoAdresiniAyir('ornek/oyun').adres === 'https://github.com/ornek/oyun' && depoAdresiniAyir('https://github.com/ornek/oyun.git').yol === '', 'yükleme sayfası, kısa ad ve düz depo adresi de anlaşıldı');
    const bolunen = dalVeKlasorAyir('claude/yeni-ozellik/gorseller', ['main', 'claude/yeni-ozellik', 'claude']);
    kontrol(bolunen.dal === 'claude/yeni-ozellik' && bolunen.klasor === 'gorseller', 'içinde "/" olan dal adı klasörden doğru ayrıldı');

    git(uzakDepo, 'symbolic-ref', 'HEAD', 'refs/heads/ana');
    git(proje, 'checkout', '-q', '-b', 'claude/deneme-dali');
    fs.writeFileSync(path.join(proje, 'dalda.txt'), 'dal');
    git(proje, 'add', 'dalda.txt');
    git(proje, 'commit', '-q', '-m', 'dal');
    git(proje, 'push', '-q', 'origin', 'claude/deneme-dali');
    const veriGit = path.join(gecici, 'veri-git');
    ayarlar.git = { depoAdresi: uzakDepo, dal: 'claude/deneme-dali', hedefAltKlasor: 'gorseller', uzak: 'origin' };
    ayarYaz();
    sonuc = await robotCalistir(['git-gonder', '--ayarlar', ayarDosyasi, '--veri', veriGit]);
    let daldakiler = git(uzakDepo, 'ls-tree', '-r', '--name-only', 'claude/deneme-dali').split('\n');
    kontrol(sonuc.status === 0 && daldakiler.includes('gorseller/sovalye.png') && daldakiler.includes('dalda.txt'), 'depo indirildi, görseller istenen dala ve klasöre gönderildi');
    kontrol(!git(uzakDepo, 'ls-tree', '-r', '--name-only', 'ana').includes('gorseller/'), 'ana dala dokunulmadı');
    // Başka biri (ör. buluttaki sohbet) aynı dala commit atarsa robot önce onu almalı.
    git(proje, 'pull', '-q', 'origin', 'claude/deneme-dali');
    fs.writeFileSync(path.join(proje, 'buluttan.txt'), 'bulut');
    git(proje, 'add', 'buluttan.txt');
    git(proje, 'commit', '-q', '-m', 'buluttan');
    git(proje, 'push', '-q', 'origin', 'claude/deneme-dali');
    fs.copyFileSync(path.join(cikti, 'sovalye.png'), path.join(cikti, 'yeni-gorsel.png'));
    sonuc = await robotCalistir(['git-gonder', '--ayarlar', ayarDosyasi, '--veri', veriGit]);
    daldakiler = git(uzakDepo, 'ls-tree', '-r', '--name-only', 'claude/deneme-dali').split('\n');
    kontrol(sonuc.status === 0 && daldakiler.includes('gorseller/yeni-gorsel.png') && daldakiler.includes('buluttan.txt'), 'depodaki yeni değişiklikler alınıp üzerine gönderildi');
    fs.rmSync(path.join(cikti, 'yeni-gorsel.png'));
    delete ayarlar.git;
    ayarYaz();

    console.log('5) Arayüz: referans görselli iş ekleme, başlatma, sonucu görme');
    const arayuz = spawn(
      process.execPath,
      [path.join(KOK, 'robot.js'), 'arayuz', '--acma', '--port', String(ARAYUZ_PORTU), '--ayarlar', ayarDosyasi, '--veri', path.join(gecici, 'veri')],
      { stdio: 'ignore' }
    );
    try {
      const taban = `http://127.0.0.1:${ARAYUZ_PORTU}`;
      const istek = async (yol, govde, basliklar = {}) => {
        const yanit = await fetch(taban + yol, govde ? { method: 'POST', headers: { 'content-type': 'application/json', ...basliklar }, body: JSON.stringify(govde) } : {});
        return { kod: yanit.status, veri: await yanit.json().catch(() => ({})) };
      };
      let hazir = false;
      for (let i = 0; i < 40 && !hazir; i++) {
        await new Promise((coz) => setTimeout(coz, 250));
        hazir = await fetch(`${taban}/api/durum`).then((y) => y.ok, () => false);
      }
      kontrol(hazir, 'arayüz sunucusu açıldı');
      kontrol((await fetch(taban + '/').then((y) => y.text())).includes('<title>Robot</title>'), 'arayüz sayfası sunuluyor');

      const referans = pngUret(400, 400, [200, 60, 60]).toString('base64');
      let yanit = await istek('/api/isler', { ad: 'Kırmızı Ejderha', istem: 'Referanstaki ejderhayı pixel-art yap', referanslar: [{ ad: 'ref.png', veri: referans }] });
      let is = yanit.veri.isler[0];
      kontrol(yanit.kod === 200 && is.ad === 'kirmizi-ejderha' && is.durum === 'bekliyor' && is.referanslar.length === 1, 'iş referans görseliyle sıraya eklendi');
      kontrol((await istek('/api/isler', { istem: 'x' }, { origin: 'http://kotu.example' })).kod === 403, 'başka bir siteden gelen istek reddedildi');
      kontrol((await istek('/api/isler', { istem: '   ' })).kod === 400, 'boş istem reddedildi');

      yanit = await istek('/api/ayarlar', { sonEk: 'suluboya' });
      const yerelDosya = ayarDosyasi.replace(/\.json$/, '.yerel.json');
      kontrol(yanit.veri.ayarlar.sonEk === 'suluboya' && JSON.parse(fs.readFileSync(yerelDosya, 'utf8')).chatgpt.sonEk === 'suluboya', 'ayar değişikliği yerel ayar dosyasına yazıldı');
      kontrol((JSON.parse(fs.readFileSync(ayarDosyasi, 'utf8')).chatgpt.sonEk || '') === (ayarlar.chatgpt.sonEk || ''), 'varsayılan ayar dosyasına dokunulmadı');

      yanit = await istek('/api/baslat', { sonra: 'yok' });
      kontrol(yanit.kod === 200 && yanit.veri.calisiyor, 'sıra başlatıldı');
      for (let i = 0; i < 120 && yanit.veri.calisiyor; i++) {
        await new Promise((coz) => setTimeout(coz, 500));
        yanit = await istek('/api/durum');
      }
      is = yanit.veri.isler[0];
      kontrol(!yanit.veri.calisiyor && is.durum === 'bitti' && is.dosyalar.length === 1, 'iş bitti ve tek görsel kaydedildi (referans çıktı sayılmadı)');
      const sonucBayt = Buffer.from(await fetch(taban + is.dosyalar[0].adres).then((y) => y.arrayBuffer()));
      kontrol(sonucBayt.equals(site.ekliGorsel), 'referans ChatGPT\'ye eklendi ve dönen görsel arayüzden açılabiliyor');
      kontrol(yanit.veri.gunluk.some((satir) => satir.includes('kaydedildi')), 'günlük arayüze aktarıldı');

      yanit = await istek('/api/isler/yeniden', { id: is.id });
      kontrol(yanit.veri.isler[0].durum === 'bekliyor' && !fs.existsSync(path.join(cikti, is.dosyalar[0].ad)), '"yeniden üret" görseli silip işi sıraya geri aldı');
      yanit = await istek('/api/isler/sil', { id: is.id });
      kontrol(yanit.veri.isler.length === 0, 'iş sıradan kaldırıldı');
    } finally {
      arayuz.kill();
    }

    console.log('6) Güncelleme: yeni sürümü indirip kurma');
    const disarida = (ad) => ['node_modules', '.git', 'veri', 'cikti', 'tarayici-profili', 'ayarlar.yerel.json', 'istemler.txt'].includes(ad);
    const kopyala = (kaynak, hedef) => fs.cpSync(kaynak, hedef, { recursive: true, filter: (yol) => !disarida(path.basename(yol)) });
    const kurulum = path.join(gecici, 'kurulum');
    kopyala(KOK, kurulum);
    fs.symlinkSync(path.join(KOK, 'node_modules'), path.join(kurulum, 'node_modules'), 'junction');
    const eskiSurum = 'a'.repeat(40);
    const yeniSurum = 'b'.repeat(40);
    fs.writeFileSync(path.join(kurulum, 'surum.txt'), eskiSurum);
    fs.writeFileSync(path.join(kurulum, 'istemler.txt'), 'benim istemim');
    fs.writeFileSync(path.join(kurulum, 'arayuz', 'eski.txt'), 'yeni sürümde yok');
    fs.mkdirSync(path.join(kurulum, 'veri'));
    fs.writeFileSync(path.join(kurulum, 'veri', 'kurulu-dosyalar.json'), JSON.stringify(['arayuz/eski.txt', 'README.md']));
    // Yarıda kalmış eski bir güncellemenin artıkları yeni güncellemeyi bozmamalı.
    fs.mkdirSync(path.join(kurulum, 'veri', 'guncelleme', 'yeni', 'yarim-kalan'), { recursive: true });
    fs.mkdirSync(path.join(kurulum, 'veri', 'guncelleme-123', 'yeni', 'yarim-kalan'), { recursive: true });

    const paketKoku = path.join(gecici, 'paket');
    const yeniKopya = path.join(paketKoku, `aibot-${yeniSurum}`);
    fs.mkdirSync(paketKoku);
    kopyala(kurulum, yeniKopya);
    fs.rmSync(path.join(yeniKopya, 'arayuz', 'eski.txt'));
    fs.writeFileSync(path.join(yeniKopya, 'README.md'), 'YENİ SÜRÜM');
    fs.writeFileSync(path.join(yeniKopya, 'yeni-dosya.txt'), 'yeni');
    fs.writeFileSync(path.join(yeniKopya, 'istemler.txt'), 'paketten gelen');
    const tar = spawnSync('tar', ['-czf', 'paket.tar.gz', '-C', 'paket', `aibot-${yeniSurum}`], { cwd: gecici, encoding: 'utf8' });
    if (tar.status !== 0) throw new Error(`tar çalışmadı: ${tar.stderr || tar.error}`);

    const depo = http.createServer((istek, yanit) => {
      if (istek.url === '/surum') yanit.end(yeniSurum);
      else if (istek.url === `/paket/${yeniSurum}`) yanit.end(fs.readFileSync(path.join(gecici, 'paket.tar.gz')));
      else yanit.writeHead(404).end();
    });
    await new Promise((coz) => depo.listen(0, '127.0.0.1', coz));
    const depoAdresi = `http://127.0.0.1:${depo.address().port}`;
    fs.writeFileSync(
      path.join(kurulum, 'ayarlar.yerel.json'),
      JSON.stringify({ chatgpt: { sonEk: 'benim stilim' }, guncelleme: { surumAdresi: `${depoAdresi}/surum`, paketAdresi: `${depoAdresi}/paket/{surum}` } })
    );
    try {
      sonuc = await robotCalistir(['guncelle'], kurulum);
      const oku = (ad) => fs.readFileSync(path.join(kurulum, ad), 'utf8');
      kontrol(sonuc.status === 0 && /Güncellendi/.test(sonuc.stdout), 'yeni sürüm bulundu ve kuruldu');
      kontrol(oku('README.md') === 'YENİ SÜRÜM' && oku('yeni-dosya.txt') === 'yeni', 'değişen ve yeni dosyalar yerine kondu');
      kontrol(!fs.existsSync(path.join(kurulum, 'arayuz', 'eski.txt')), 'depodan silinen dosya kaldırıldı');
      kontrol(oku('istemler.txt') === 'benim istemim' && JSON.parse(oku('ayarlar.yerel.json')).chatgpt.sonEk === 'benim stilim', 'kullanıcının istemleri ve ayarları korundu');
      kontrol(oku('surum.txt').trim() === yeniSurum, 'kurulu sürüm kaydedildi');
      kontrol(!fs.readdirSync(path.join(kurulum, 'veri')).some((ad) => ad.startsWith('guncelleme')), 'geçici dosyalar ve eski artıklar temizlendi');
      sonuc = await robotCalistir(['guncelle'], kurulum);
      kontrol(sonuc.status === 0 && /Robot güncel/.test(sonuc.stdout), 'tekrar denetlenince güncel olduğu görüldü');
      depo.close();
      sonuc = await robotCalistir(['guncelle'], kurulum);
      kontrol(sonuc.status === 0 && /Güncelleme yapılmadı/.test(sonuc.stdout), 'depoya ulaşılamayınca hata vermeden eski sürümle devam etti');
    } finally {
      depo.close();
    }

    console.log('7) Uygulama: kendi penceresinde açılma, pencere kapanınca kapanma');
    const UYGULAMA_PORTU = 4398;
    const PENCERE_PORTU = 9342;
    ayarlar.arayuz = { port: UYGULAMA_PORTU, pencereArgumanlari: [...(process.env.ROBOT_GORUNUR ? [] : ['--headless=new', ...(linux ? ['--no-sandbox'] : [])]), `--remote-debugging-port=${PENCERE_PORTU}`] };
    ayarYaz();
    const uygArg = ['--guncellemeden', '--ayarlar', ayarDosyasi, '--veri', path.join(gecici, 'veri-uygulama')];
    const uygulama = spawn(process.execPath, [path.join(KOK, 'robot.js'), 'uygulama', ...uygArg], { stdio: 'ignore' });
    const kapandi = new Promise((coz) => uygulama.on('exit', coz));
    try {
      const taban = `http://127.0.0.1:${UYGULAMA_PORTU}`;
      let hazir = false;
      for (let i = 0; i < 40 && !hazir; i++) {
        await new Promise((coz) => setTimeout(coz, 250));
        hazir = await fetch(`${taban}/api/durum`).then((y) => y.ok, () => false);
      }
      kontrol(hazir, 'uygulama açıldı');
      kontrol((await fetch(`${taban}/robot.ico`)).headers.get('content-type') === 'image/x-icon', 'simge sunuluyor');
      sonuc = await robotCalistir(['arayuz', '--acma', ...uygArg]);
      kontrol(sonuc.status === 0 && /zaten açık/.test(sonuc.stdout), 'ikinci kez başlatınca yeni bir kopya açılmadı');

      await new Promise((coz) => setTimeout(coz, 5500));
      const pencere = await chromium.connectOverCDP(`http://127.0.0.1:${PENCERE_PORTU}`);
      const sayfalar = pencere.contexts().flatMap((icerik) => icerik.pages());
      kontrol(sayfalar.some((sayfa) => sayfa.url().startsWith(taban)), 'arayüz uygulama penceresinde açıldı');
      await (await pencere.newBrowserCDPSession()).send('Browser.close').catch(() => {});
      const kod = await Promise.race([kapandi, new Promise((coz) => setTimeout(() => coz('zaman aşımı'), 15000))]);
      kontrol(kod === 0, 'pencere kapanınca robot da kapandı');
    } finally {
      uygulama.kill();
    }

    // Pencere 5 saniyeden önce kapanırsa robot bunu "başka süreç devraldı" sayar ve açık kalır;
    // o durumda arayüzden istek gelmeyince kendiliğinden kapanmalı.
    ayarlar.arayuz.sessizKapanmaSaniye = 3;
    ayarYaz();
    const sessiz = spawn(process.execPath, [path.join(KOK, 'robot.js'), 'uygulama', ...uygArg], { stdio: 'ignore' });
    const sessizKapandi = new Promise((coz) => sessiz.on('exit', coz));
    try {
      let acik = false;
      for (let i = 0; i < 40 && !acik; i++) {
        await new Promise((coz) => setTimeout(coz, 200));
        acik = await chromium.connectOverCDP(`http://127.0.0.1:${PENCERE_PORTU}`).then(async (p) => { await (await p.newBrowserCDPSession()).send('Browser.close').catch(() => {}); return true; }, () => false);
      }
      const kod = await Promise.race([sessizKapandi, new Promise((coz) => setTimeout(() => coz('zaman aşımı'), 20000))]);
      kontrol(acik && kod === 0, 'pencere erken kapansa da robot arkada açık kalmadı');
    } finally {
      sessiz.kill();
    }

    console.log('\nTüm denemeler geçti.');
  } finally {
    await tarayiciyiKapat();
    site.kapat();
    // Tarayıcı kapanırken profil dosyalarını bir süre daha yazabilir.
    await new Promise((coz) => setTimeout(coz, 1500));
    try {
      fs.rmSync(gecici, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    } catch {
      console.log(`  (geçici klasör silinemedi: ${gecici})`);
    }
  }
}

ana().then(
  () => process.exit(0),
  (hata) => {
    console.error(`\n${hata.message}`);
    process.exit(1);
  }
);
