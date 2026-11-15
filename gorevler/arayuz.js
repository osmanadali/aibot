// Tarayıcıda açılan arayüzü sunar: istem ve referans görsel ekleme, sırayı
// başlatma/durdurma, sonuçları görme. Yalnızca bu bilgisayardan erişilebilir.
//
// Arayüz işleri veri/isler.json içinde, referans görselleri veri/referanslar/
// altında tutar. "Başlat" denince bekleyen işler için robotu ayrı bir süreç
// olarak çalıştırır (gorsel-uret ve istenirse claude-gonder / git-gonder).
//
// Seçenekler:  --port <numara>   --acma (tarayıcıyı kendiliğinden açma)
//              --uygulama (arayüzü kendi penceresinde aç; pencere kapanınca robot da kapanır)

const fs = require('fs');
const http = require('http');
const path = require('path');
const { fork, spawn } = require('child_process');
const { dosyaAdinaCevir } = require('../lib/gorseller');
const { jsonOku, ayarlariYukle, yerelAyarYaz } = require('../lib/ayarlar');
const { kuruluSurum, sonSurum } = require('../lib/guncelle');
const { tarayiciYolunuBul } = require('../lib/tarayici');

const GORSEL_TURLERI = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const SONRAKI_ADIM = { yok: [], claude: ['claude-gonder'], github: ['git-gonder'] };
const EN_FAZLA_GOVDE = 60 * 1024 * 1024;

function gorselTuru(bayt) {
  if (bayt.length >= 4 && bayt.readUInt32BE(0) === 0x89504e47) return 'png';
  if (bayt.length >= 3 && bayt[0] === 0xff && bayt[1] === 0xd8 && bayt[2] === 0xff) return 'jpg';
  if (bayt.length >= 12 && bayt.toString('latin1', 0, 4) === 'RIFF' && bayt.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (bayt.length >= 4 && bayt.toString('latin1', 0, 4) === 'GIF8') return 'gif';
  return null;
}

function tarayicidaAc(adres) {
  const [komut, arg] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', adres]]
      : process.platform === 'darwin'
        ? ['open', [adres]]
        : ['xdg-open', [adres]];
  try {
    spawn(komut, arg, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  } catch {
    /* adres zaten ekrana yazıldı */
  }
}

class IstekHatasi extends Error {
  constructor(kod, mesaj) {
    super(mesaj);
    this.kod = kod;
  }
}

async function calistir(baglam) {
  const { kok, ayarDosyasi, secenekler, gunluk } = baglam;
  const port = Number(secenekler.port || (baglam.ayarlar.arayuz || {}).port || 4317);
  const veriKlasoru = path.resolve(kok, secenekler.veri || 'veri');
  const refKlasoru = path.join(veriKlasoru, 'referanslar');
  const islerDosyasi = path.join(veriKlasoru, 'isler.json');
  const calisanDosya = path.join(veriKlasoru, 'calisan-isler.json');
  fs.mkdirSync(refKlasoru, { recursive: true });

  const ayarOku = () => ayarlariYukle(ayarDosyasi);
  const ciktiKlasoru = () => path.resolve(kok, ayarOku().gorselUret.ciktiKlasoru);
  const durumDosyasi = () => path.join(ciktiKlasoru(), 'durum.json');
  const isleriOku = () => jsonOku(islerDosyasi, []);
  const isleriYaz = (isler) => fs.writeFileSync(islerDosyasi, JSON.stringify(isler, null, 2));

  let surec = null;
  let sonra = 'yok';
  let yeniSurum = ''; // robot açıkken depoda görülen daha yeni sürüm
  const acilisDenetimi = baglam.veri.guncelleme;
  let guncellemeNotu = acilisDenetimi && acilisDenetimi.durum === 'atlandi' ? `güncelleme denetlenemedi: ${acilisDenetimi.neden}` : '';
  let sessizAdim = 0; // arayüzden son istekten beri geçen denetim adımı
  let canli = {}; // ad -> { durum, neden }: çalışan süreçten gelen anlık bilgiler
  const gunlukSatirlari = [];
  const gunlugeYaz = (satir) => {
    gunlukSatirlari.push(satir);
    if (gunlukSatirlari.length > 400) gunlukSatirlari.splice(0, gunlukSatirlari.length - 400);
  };

  const anahtar = (is) => `${is.ad}|${is.istem}`;
  const bitenDosyalar = (is, durum, cikti) => (durum[anahtar(is)] || []).filter((d) => fs.existsSync(path.join(cikti, d)));

  function durumOzeti() {
    const cikti = ciktiKlasoru();
    const durum = jsonOku(durumDosyasi(), {});
    const ayarlar = ayarOku();
    const isler = isleriOku().map((is) => {
      const dosyalar = bitenDosyalar(is, durum, cikti);
      const anlik = canli[is.ad] || {};
      return {
        id: is.id,
        ad: is.ad,
        istem: is.istem,
        referanslar: is.referanslar.map((d) => `/referans/${encodeURIComponent(d)}`),
        durum: dosyalar.length ? 'bitti' : anlik.durum === 'uretiliyor' && !surec ? 'bekliyor' : anlik.durum || 'bekliyor',
        neden: dosyalar.length ? '' : anlik.neden || '',
        dosyalar: dosyalar.map((d) => ({
          ad: d,
          adres: `/cikti/${encodeURIComponent(d)}?t=${Math.round(fs.statSync(path.join(cikti, d)).mtimeMs)}`,
        })),
      };
    });
    return {
      calisiyor: Boolean(surec),
      sonra,
      gunluk: gunlukSatirlari,
      isler,
      surum: {
        kisa: kuruluSurum(kok).slice(0, 7),
        guncellendi: Boolean(secenekler.guncellendi),
        yeniVar: Boolean(yeniSurum && yeniSurum !== kuruluSurum(kok)),
        not: guncellemeNotu,
      },
      ayarlar: {
        sonEk: (ayarlar.chatgpt || {}).sonEk || '',
        projeKlasoru: (ayarlar.claude || {}).projeKlasoru || '',
        depoAdresi: (ayarlar.git || {}).depoAdresi || '',
        klasorSecilebilir: process.platform === 'win32',
        ciktiKlasoru: cikti,
      },
    };
  }

  function benzersizAd(istenen, isler) {
    const cikti = ciktiKlasoru();
    const durum = jsonOku(durumDosyasi(), {});
    const dolu = (ad) =>
      isler.some((is) => is.ad === ad) ||
      Object.keys(durum).some((k) => k.startsWith(`${ad}|`)) ||
      Object.keys(GORSEL_TURLERI).some((uzanti) => fs.existsSync(path.join(cikti, `${ad}.${uzanti}`)));
    let ad = istenen;
    for (let n = 2; dolu(ad); n++) ad = `${istenen}-${n}`;
    return ad;
  }

  function calismiyorOlmali() {
    if (surec) throw new IstekHatasi(409, 'Robot çalışırken bu değiştirilemez. Önce durdur ya da bitmesini bekle.');
  }

  const islemler = {
    '/api/isler': (govde) => {
      const istem = String(govde.istem || '').replace(/\s+/g, ' ').trim();
      if (!istem) throw new IstekHatasi(400, 'İstem boş olamaz.');
      const gelenler = Array.isArray(govde.referanslar) ? govde.referanslar : [];
      if (gelenler.length > 8) throw new IstekHatasi(400, 'En fazla 8 referans görsel eklenebilir.');

      const isler = isleriOku();
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const referanslar = gelenler.map((ref, n) => {
        const bayt = Buffer.from(String(ref.veri || ''), 'base64');
        const tur = gorselTuru(bayt);
        if (!tur) throw new IstekHatasi(400, `"${ref.ad || 'dosya'}" desteklenen bir görsel değil (PNG, JPG, WEBP, GIF).`);
        const dosya = `${id}-${n + 1}.${tur}`;
        fs.writeFileSync(path.join(refKlasoru, dosya), bayt);
        return dosya;
      });
      isler.push({ id, ad: benzersizAd(dosyaAdinaCevir(govde.ad || istem), isler), istem, referanslar });
      isleriYaz(isler);
    },

    '/api/isler/sil': (govde) => {
      calismiyorOlmali();
      const isler = isleriOku();
      const is = isler.find((i) => i.id === govde.id);
      if (!is) return;
      for (const dosya of is.referanslar) fs.rmSync(path.join(refKlasoru, path.basename(dosya)), { force: true });
      delete canli[is.ad];
      isleriYaz(isler.filter((i) => i !== is));
    },

    // Üretilmiş görseli siler; iş yeniden "bekliyor" olur.
    '/api/isler/yeniden': (govde) => {
      calismiyorOlmali();
      const is = isleriOku().find((i) => i.id === govde.id);
      if (!is) return;
      const cikti = ciktiKlasoru();
      const durum = jsonOku(durumDosyasi(), {});
      for (const dosya of durum[anahtar(is)] || []) fs.rmSync(path.join(cikti, path.basename(dosya)), { force: true });
      delete durum[anahtar(is)];
      if (fs.existsSync(cikti)) fs.writeFileSync(durumDosyasi(), JSON.stringify(durum, null, 2));
      delete canli[is.ad];
    },

    '/api/ayarlar': (govde) => {
      calismiyorOlmali();
      // Yalnızca yerel ayar dosyasına yazılır; güncellemeler bu dosyaya dokunmaz.
      const degisiklik = {};
      if (typeof govde.sonEk === 'string') degisiklik.chatgpt = { sonEk: govde.sonEk.trim() };
      if (typeof govde.projeKlasoru === 'string') {
        const klasor = govde.projeKlasoru.trim().replace(/^"|"$/g, '');
        if (klasor && !fs.existsSync(path.resolve(kok, klasor))) throw new IstekHatasi(400, `Klasör bulunamadı: ${klasor}`);
        degisiklik.claude = { projeKlasoru: klasor };
      }
      if (typeof govde.depoAdresi === 'string') {
        const adres = govde.depoAdresi.trim();
        if (adres && !/^(https:\/\/|git@|[\w.-]+\/[\w.-]+$)/.test(adres) && !fs.existsSync(adres)) {
          throw new IstekHatasi(400, 'Depo adresi https://github.com/kullanici/depo biçiminde olmalı.');
        }
        degisiklik.git = { depoAdresi: adres };
      }
      yerelAyarYaz(ayarDosyasi, degisiklik);
    },

    '/api/baslat': (govde) => {
      if (surec) throw new IstekHatasi(409, 'Robot zaten çalışıyor.');
      if (!(govde.sonra in SONRAKI_ADIM)) throw new IstekHatasi(400, 'Geçersiz seçim.');
      const cikti = ciktiKlasoru();
      const durum = jsonOku(durumDosyasi(), {});
      const bekleyenler = isleriOku().filter((is) => !bitenDosyalar(is, durum, cikti).length);
      if (!bekleyenler.length) throw new IstekHatasi(400, 'Sırada bekleyen iş yok.');
      const guncel = ayarOku();
      const projeVar = Boolean((guncel.claude || {}).projeKlasoru);
      if (govde.sonra === 'claude' && !projeVar) {
        throw new IstekHatasi(400, 'Claude Code için önce Ayarlar bölümünde oyun projesi klasörünü seç.');
      }
      if (govde.sonra === 'github' && !projeVar && !(guncel.git || {}).depoAdresi && !(guncel.git || {}).projeKlasoru) {
        throw new IstekHatasi(400, 'GitHub için önce Ayarlar bölümünde GitHub deposunun adresini yaz.');
      }

      sonra = govde.sonra;
      canli = {};
      fs.writeFileSync(
        calisanDosya,
        JSON.stringify(bekleyenler.map((is) => ({ ad: is.ad, istem: is.istem, referanslar: is.referanslar.map((d) => path.join(refKlasoru, d)) })))
      );
      gunlugeYaz(`—— ${bekleyenler.length} iş başlatıldı ——`);
      const argumanlar = ['gorsel-uret', ...SONRAKI_ADIM[sonra], '--ayarlar', ayarDosyasi, '--istemler', calisanDosya, '--veri', veriKlasoru];
      // Robot görünür bir komut penceresi olmadan çalışıyorsa (masaüstü kısayolu)
      // Claude Code sohbeti kendi penceresinde açılır.
      if (process.platform === 'win32' && !process.stdout.isTTY) argumanlar.push('--claude-mod', 'pencere');
      const cocuk = fork(path.join(kok, 'robot.js'), argumanlar, { cwd: kok });
      surec = cocuk;
      cocuk.on('message', (olay) => {
        if (olay.tur === 'gunluk') gunlugeYaz(olay.satir);
        if (olay.tur === 'istem') canli[olay.ad] = { durum: olay.durum, neden: olay.neden };
      });
      cocuk.on('exit', (kod, sinyal) => {
        if (surec === cocuk) surec = null;
        gunlugeYaz(sinyal ? '—— durduruldu ——' : kod === 0 ? '—— bitti ——' : '—— hatayla bitti ——');
      });
    },

    '/api/durdur': () => {
      if (surec) surec.kill();
    },

    // Windows'un klasör seçme penceresini açar ve seçilen yolu döndürür.
    '/api/klasor-sec': () => {
      if (process.platform !== 'win32') throw new IstekHatasi(400, 'Klasör seçme penceresi yalnızca Windows\'ta açılır; yolu elle yaz.');
      const betik = [
        'Add-Type -AssemblyName System.Windows.Forms',
        '$ust = New-Object System.Windows.Forms.Form',
        '$ust.TopMost = $true',
        '$pencere = New-Object System.Windows.Forms.FolderBrowserDialog',
        "$pencere.Description = 'Oyun projesi klasorunu sec'",
        'if ($pencere.ShowDialog($ust) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::Out.Write($pencere.SelectedPath) }',
      ].join('; ');
      return new Promise((coz, reddet) => {
        const ps = spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', betik], { stdio: ['ignore', 'pipe', 'ignore'] });
        let cikti = '';
        ps.stdout.on('data', (parca) => (cikti += parca));
        ps.on('error', () => reddet(new IstekHatasi(500, 'Klasör seçme penceresi açılamadı; yolu elle yaz.')));
        ps.on('close', () => coz({ klasor: cikti.trim() }));
      });
    },
  };

  function govdeyiOku(istek) {
    return new Promise((coz, reddet) => {
      const parcalar = [];
      let boyut = 0;
      istek.on('data', (parca) => {
        boyut += parca.length;
        if (boyut > EN_FAZLA_GOVDE) {
          reddet(new IstekHatasi(413, 'Gönderilen dosyalar çok büyük.'));
          istek.destroy();
          return;
        }
        parcalar.push(parca);
      });
      istek.on('end', () => {
        try {
          coz(JSON.parse(Buffer.concat(parcalar).toString('utf8') || '{}'));
        } catch {
          reddet(new IstekHatasi(400, 'Geçersiz istek.'));
        }
      });
      istek.on('error', reddet);
    });
  }

  function dosyaGonder(yanit, klasor, ad) {
    const dosya = path.join(klasor, path.basename(ad));
    const tur = GORSEL_TURLERI[path.extname(dosya).slice(1).toLowerCase().replace('jpeg', 'jpg')];
    if (!tur || !fs.existsSync(dosya)) {
      yanit.writeHead(404).end();
      return;
    }
    yanit.writeHead(200, { 'content-type': tur, 'cache-control': 'no-store' });
    fs.createReadStream(dosya).pipe(yanit);
  }

  const izinliKaynaklar = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

  const sunucu = http.createServer(async (istek, yanit) => {
    const json = (kod, veri) => {
      yanit.writeHead(kod, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      yanit.end(JSON.stringify(veri));
    };
    sessizAdim = 0;
    try {
      // Başka sitelerin bu arayüze istek atmasını engelle.
      if (!izinliKaynaklar.has(istek.headers.host)) throw new IstekHatasi(403, 'Yalnızca bu bilgisayardan erişilebilir.');
      const adres = new URL(istek.url, `http://${istek.headers.host}`);
      const yol = decodeURIComponent(adres.pathname);

      if (istek.method === 'GET') {
        if (yol === '/') {
          yanit.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          yanit.end(fs.readFileSync(path.join(kok, 'arayuz', 'index.html')));
        } else if (yol === '/simge.ico') {
          yanit.writeHead(200, { 'content-type': 'image/x-icon', 'cache-control': 'no-cache' });
          yanit.end(fs.readFileSync(path.join(kok, 'arayuz', 'simge.ico')));
        } else if (yol === '/api/durum') json(200, durumOzeti());
        else if (yol.startsWith('/cikti/')) dosyaGonder(yanit, ciktiKlasoru(), yol.slice(7));
        else if (yol.startsWith('/referans/')) dosyaGonder(yanit, refKlasoru, yol.slice(10));
        else yanit.writeHead(404).end();
        return;
      }

      if (istek.method === 'POST' && islemler[yol]) {
        const kaynak = istek.headers.origin;
        const jsonMu = String(istek.headers['content-type'] || '').startsWith('application/json');
        if (!jsonMu || (kaynak && !izinliKaynaklar.has(kaynak.replace(/^https?:\/\//, '')))) {
          throw new IstekHatasi(403, 'İstek reddedildi.');
        }
        const ek = await islemler[yol](await govdeyiOku(istek));
        json(200, { ...durumOzeti(), ...(ek || {}) });
        return;
      }
      yanit.writeHead(404).end();
    } catch (hata) {
      json(hata.kod || 500, { hata: hata.message });
    }
  });

  const adres = `http://127.0.0.1:${port}/`;

  const kapat = () => {
    if (surec) surec.kill();
    process.exit(0);
  };

  // Arayüzü adres çubuğu olmayan, kendine ait bir pencerede açar.
  // "sahip" true ise pencere kapanınca robot da kapanır.
  function pencereAc(sahip) {
    let yol;
    try {
      yol = tarayiciYolunuBul((ayarOku().tarayici || {}).yol);
    } catch {
      tarayicidaAc(adres);
      return;
    }
    const argumanlar = [
      `--app=${adres}`,
      `--user-data-dir=${path.join(veriKlasoru, 'arayuz-profili')}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1320,900',
      ...((ayarOku().arayuz || {}).pencereArgumanlari || []),
    ];
    const baslangic = Date.now();
    const pencere = spawn(yol, argumanlar, { detached: !sahip, stdio: 'ignore' });
    pencere.on('error', () => tarayicidaAc(adres));
    if (!sahip) {
      pencere.unref();
      return;
    }
    pencere.on('exit', () => {
      // Hemen kapandıysa pencereyi zaten açık olan başka bir tarayıcı süreci devralmıştır.
      if (Date.now() - baslangic > 5000) kapat();
      else gunluk(`Pencere başka bir süreçte açıldı; arayüz açık kalıyor: ${adres}`);
    });
  }

  const dinlendi = await new Promise((coz, reddet) => {
    sunucu.once('error', (hata) => (hata.code === 'EADDRINUSE' ? coz(false) : reddet(hata)));
    sunucu.listen(port, '127.0.0.1', () => coz(true));
  });
  if (!dinlendi) {
    // Robot zaten açıksa ikinci kez başlatmak yerine var olan arayüzü öne getir.
    const bizimMi = await fetch(`${adres}api/durum`, { signal: AbortSignal.timeout(3000) }).then((y) => y.ok, () => false);
    if (!bizimMi) throw new Error(`${port} portu başka bir program tarafından kullanılıyor. ayarlar.yerel.json içinde arayuz.port değerini değiştir.`);
    gunluk(`Robot zaten açık: ${adres}`);
    if (secenekler.uygulama) pencereAc(false);
    else if (!secenekler.acma) tarayicidaAc(adres);
    return;
  }

  gunluk(`Arayüz hazır: ${adres}`);
  if (secenekler.uygulama) pencereAc(true);
  else {
    gunluk('Kapatmak için bu pencereyi kapat ya da Ctrl+C\'ye bas.');
    if (!secenekler.acma) tarayicidaAc(adres);
  }

  // Robot açık kalırken çıkan yeni sürümü fark et (kurulum, bir sonraki açılışta yapılır).
  async function yeniSurumDenetle() {
    const ayar = ayarOku().guncelleme || {};
    if (ayar.kapali || !kuruluSurum(kok)) return;
    try {
      yeniSurum = await sonSurum(ayar);
      if (guncellemeNotu.startsWith('güncelleme denetlenemedi')) guncellemeNotu = '';
    } catch {
      /* internet yoksa sessizce geç */
    }
  }
  setTimeout(yeniSurumDenetle, secenekler.uygulama ? 10 * 60 * 1000 : 5000).unref();
  setInterval(yeniSurumDenetle, 20 * 60 * 1000).unref();

  // Uygulama penceresi kapandığı hâlde bu süreç bunu fark edemezse (pencereyi başka bir
  // tarayıcı süreci devraldıysa) arayüzden uzun süre istek gelmeyince kendiliğinden kapan.
  if (secenekler.uygulama) {
    const esikMs = ((ayarOku().arayuz || {}).sessizKapanmaSaniye || 180) * 1000;
    const adimMs = Math.min(15000, esikMs / 3);
    setInterval(() => {
      if (surec) sessizAdim = 0;
      else if (++sessizAdim * adimMs >= esikMs) kapat();
    }, adimMs).unref();
  }

  process.on('SIGINT', kapat);
  process.on('SIGTERM', kapat);
  await new Promise(() => {}); // pencere kapatılana kadar açık kal
}

module.exports = {
  ad: 'arayuz',
  aciklama: 'Tarayıcıda açılan arayüzü başlatır (istem, referans ve ses ile görsel sırası)',
  calistir,
};
