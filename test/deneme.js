// Robotu baştan sona sahte bir ChatGPT sitesi ve sahte bir "claude" komutuyla
// dener. Gerçek hesaplara dokunmaz.   Çalıştırma:  npm test   (ya da deneme.bat)
//
// Sınadıkları: tarayıcıyı açıp bağlanma, istemi yazıp gönderme, görseli bekleyip
// indirme (aynı ve farklı kaynaktan), yazılı yanıtta hata verme, kaldığı yerden
// devam etme, görselleri projeye kopyalayıp Claude Code'a iletme, görselleri
// commit'leyip uzak depoya gönderme.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright-core');
const { sahteChatgptBaslat } = require('./sahte-chatgpt');

const KOK = path.join(__dirname, '..');
const PORT = 9339;

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
function robotCalistir(argumanlar) {
  return new Promise((coz) => {
    const surec = spawn(process.execPath, [path.join(KOK, 'robot.js'), ...argumanlar]);
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
