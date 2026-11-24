// Deneme için ChatGPT'yi taklit eden küçük bir yerel site.
// Gerçek ChatGPT'ye dokunmadan (ve limit harcamadan) robotun akışını sınar.
//
// - İstemde "YAZI" geçerse yalnızca yazıyla yanıt verir (başarısızlık yolu).
// - Dosya eklenirse ekler kullanıcı mesajının üstünde büyük resim olarak görünür
//   ve yanıt olarak farklı bir görsel (ekliGorsel) döner.
// - İstemde "ayni-kaynak" geçerse görseli aynı adresten, yoksa başka bir
//   porttan sunar (gerçek ChatGPT'deki gibi farklı alan adından indirme).

const http = require('http');
const zlib = require('zlib');

// Tek renkli bir PNG üretir.
function pngUret(en, boy, [r, g, b]) {
  const crcTablosu = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (veri) => {
    let c = 0xffffffff;
    for (const bayt of veri) c = crcTablosu[(c ^ bayt) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const parca = (tur, veri) => {
    const govde = Buffer.concat([Buffer.from(tur, 'latin1'), veri]);
    const uzunluk = Buffer.alloc(4);
    uzunluk.writeUInt32BE(veri.length);
    const toplam = Buffer.alloc(4);
    toplam.writeUInt32BE(crc(govde));
    return Buffer.concat([uzunluk, govde, toplam]);
  };
  const baslik = Buffer.alloc(13);
  baslik.writeUInt32BE(en, 0);
  baslik.writeUInt32BE(boy, 4);
  baslik.set([8, 2, 0, 0, 0], 8);
  const satir = Buffer.alloc(1 + en * 3);
  for (let x = 0; x < en; x++) satir.set([r, g, b], 1 + x * 3);
  const ham = Buffer.concat(Array.from({ length: boy }, () => satir));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    parca('IHDR', baslik),
    parca('IDAT', zlib.deflateSync(ham)),
    parca('IEND', Buffer.alloc(0)),
  ]);
}

const SAYFA = (gorselKoku) => `<!doctype html>
<meta charset="utf-8">
<title>Sahte ChatGPT</title>
<main>
  <div id="mesajlar"></div>
  <div id="prompt-textarea" contenteditable="true" style="border:1px solid #888;min-height:2em"></div>
  <div id="onizlemeler"></div>
  <input type="file" id="dosya" multiple>
  <button data-testid="send-button">Gönder</button>
  <button data-testid="stop-button" style="display:none">Durdur</button>
</main>
<script>
  const kutu = document.getElementById('prompt-textarea');
  const mesajlar = document.getElementById('mesajlar');
  const gonder = document.querySelector('[data-testid="send-button"]');
  const durdur = document.querySelector('[data-testid="stop-button"]');
  const dosya = document.getElementById('dosya');
  const onizlemeler = document.getElementById('onizlemeler');
  let sayac = 0;
  // Dosya seçilince istem kutusunun yanında önizlemesi belirir; "yükleme" bitene kadar gönder düğmesi kapalı kalır.
  dosya.onchange = () => {
    onizlemeler.replaceChildren(...[...dosya.files].map((f) => { const r = document.createElement('img'); r.src = URL.createObjectURL(f); r.width = 40; return r; }));
    gonder.disabled = true;
    setTimeout(() => { gonder.disabled = false; }, 800);
  };
  gonder.onclick = () => {
    const istem = kutu.innerText.trim();
    if (!istem) return;
    kutu.innerText = '';
    const ekler = [...dosya.files];
    dosya.value = '';
    onizlemeler.replaceChildren();
    if (ekler.length) {
      const ekKutusu = document.createElement('div');
      for (const ek of ekler) {
        const resim = document.createElement('img');
        resim.src = URL.createObjectURL(ek);
        ekKutusu.append(resim);
      }
      mesajlar.append(ekKutusu);
    }
    const kullanici = document.createElement('div');
    kullanici.dataset.messageAuthorRole = 'user';
    kullanici.textContent = istem;
    mesajlar.append(kullanici);
    gonder.style.display = 'none';
    durdur.style.display = '';
    setTimeout(() => {
      const asistan = document.createElement('div');
      asistan.dataset.messageAuthorRole = 'assistant';
      if (istem.includes('YAZI')) {
        asistan.textContent = 'Bu görseli üretemiyorum.';
      } else {
        const kok = istem.includes('ayni-kaynak') ? '' : ${JSON.stringify(gorselKoku)};
        const resim = document.createElement('img');
        resim.alt = 'Generated image';
        resim.src = kok + '/gorsel/' + (++sayac) + '-' + Date.now() + '.png' + (ekler.length ? '?ek=' + ekler.length : '');
        asistan.append(resim);
      }
      mesajlar.append(asistan);
      setTimeout(() => { durdur.style.display = 'none'; gonder.style.display = ''; }, 700);
    }, 1200);
  };
</script>`;

// ChatGPT'nin yeni arayüzüne benzeyen sayfa: işaretli (data-testid) öğe yok, istem kutusu
// bir textarea, Enter yalnızca satır atlar, gönder düğmesi yazı girilince belirir. Dosya
// alanları istem kutusundan 3 saniye sonra eklenir; seçilen dosyaların önizlemesi ve "Dosyayı
// kaldır" düğmesi istem kutusunun yanında belirir. İlk açılışta 8 saniye "Oturum aç" düğmesi görünür.
//
// - Adreste "masaustu" yoksa telefon arayüzündeki üç alan vardır (kamera, fotoğraflar,
//   dosyalar); yalnızca fotoğraf alanına verilen dosyalar ek sayılır ve ekler kullanıcı
//   mesajının ALTINDA hemen görünür.
// - "masaustu" varsa masaüstü arayüzündeki dört alan vardır: adları anlamsız, ilki kamera
//   (capture) ve tek dosya alır. Gerçek arayüzdeki gibi alanlar önce geçici bir kabukta belirir ve
//   oraya verilen dosyalar yok sayılır; 3 saniye sonra istem kutusu bir form içinde yeniden çizilir
//   (yazı korunur, kutu yeni bir öğedir) ve işleyen alanlar gelir. Dosyalar hangi işleyen alana
//   verilirse verilsin ek sayılır. Ekler kullanıcı mesajının içinde "Kullanıcı eki" adıyla ve
//   gönderimden 1 saniye sonra belirir (gerçek arayüz sohbet adresine geçince mesajı yeniden
//   çizer); kullanıcı mesajında hiçbir işaret yoktur.
const YENI_SAYFA = (gorselKoku) => `<!doctype html>
<meta charset="utf-8">
<title>Sahte ChatGPT (yeni)</title>
<button id="giris">Oturum aç</button>
<div id="mesajlar"></div>
<div class="cubuk">
  <button aria-label="Dosya ekle">+</button>
  <textarea id="mobile-composer-prompt" name="prompt" placeholder="ChatGPT'ye sor"></textarea>
  <button aria-label="Dikte">mik</button>
  <button id="sesli" aria-label="Sesli modu kullan">ses</button>
  <button id="yolla" aria-label="İstemi gönder" style="display:none">gönder</button>
  <button id="kes" aria-label="Yanıtı durdur" style="display:none">dur</button>
</div>
<script>
  // Giriş yalnızca ilk açılışta "yapılır"; sonraki sayfa yüklemelerinde oturum açıktır.
  if (localStorage.getItem('girdi')) document.getElementById('giris').remove();
  else setTimeout(() => { localStorage.setItem('girdi', '1'); document.getElementById('giris').remove(); }, 8000);
  let kutu = document.getElementById('mobile-composer-prompt');
  let cubuk = document.querySelector('.cubuk');
  const mesajlar = document.getElementById('mesajlar');
  const yolla = document.getElementById('yolla');
  const sesli = document.getElementById('sesli');
  const kes = document.getElementById('kes');
  const masaustu = location.search.includes('masaustu');
  // Adreste "ekdusur" varsa verilen dosyalar sessizce düşer (gerçekte görülen hata).
  const ekDusur = location.search.includes('ekdusur');
  const onizlemeler = document.createElement('div');
  cubuk.prepend(onizlemeler);
  // "yanlis" işaretli alana verilen dosyalar ek sayılmaz.
  const ALANLAR = masaustu
    ? [
        { id: '_r_s_', accept: 'image/*', capture: true },
        { id: '_r_u_', accept: 'image/*,video/*', multiple: true },
        { id: '_r_t_', accept: 'image/*', multiple: true },
        { id: '_r_r_', multiple: true },
      ]
    : [
        { id: 'octane-mobile-composer-camera-input', accept: 'image/*', capture: true, yanlis: 'camera' },
        { id: 'octane-mobile-composer-photos-input', accept: 'image/*', multiple: true },
        { id: 'octane-mobile-composer-files-input', multiple: true, yanlis: 'files' },
      ];
  const dosyaAlanlari = [];
  let yukleniyor = false;
  let reddedildi = false;
  let erisimDendi = false;
  let sayac = 0;
  const dugmeleriAyarla = () => {
    const yazili = kutu.value.trim().length > 0;
    yolla.style.display = yazili ? '' : 'none';
    sesli.style.display = yazili ? 'none' : '';
    yolla.disabled = yukleniyor;
  };
  kutu.addEventListener('input', dugmeleriAyarla);
  const ekDosyalari = () => dosyaAlanlari.filter((d) => !d.yanlis).flatMap((d) => [...d.alan.files]);
  const onizlemeleriCiz = () => onizlemeler.replaceChildren(...ekDosyalari().map((f) => {
    const parca = document.createElement('span');
    const resim = document.createElement('img');
    resim.src = URL.createObjectURL(f);
    resim.width = 40;
    const kaldir = document.createElement('button');
    kaldir.type = 'button';
    kaldir.setAttribute('aria-label', 'Dosyayı kaldır');
    kaldir.textContent = 'x';
    parca.append(resim, kaldir);
    return parca;
  }));
  // "kabuk" alanlarına verilen dosyalar hiçbir yere gitmez.
  const alanlariKur = (kabuk) => {
    for (const d of dosyaAlanlari) d.alan.remove();
    dosyaAlanlari.length = 0;
    for (const a of ALANLAR) {
      const alan = document.createElement('input');
      alan.type = 'file';
      alan.id = a.id;
      alan.hidden = true;
      if (a.accept) alan.accept = a.accept;
      if (a.multiple) alan.multiple = true;
      if (a.capture) alan.setAttribute('capture', '');
      if (!kabuk) {
        alan.addEventListener('change', () => {
          // Yanlış alana dosya verilirse belli olsun.
          if (a.yanlis) { document.title = 'YANLIS ALAN: ' + a.yanlis; return; }
          onizlemeleriCiz();
          yukleniyor = true; dugmeleriAyarla(); setTimeout(() => { yukleniyor = false; dugmeleriAyarla(); }, 900);
        });
      }
      kutu.before(alan);
      dosyaAlanlari.push({ alan, yanlis: kabuk ? 'kabuk' : a.yanlis });
    }
  };
  setTimeout(() => alanlariKur(masaustu), 3000);
  if (masaustu) {
    setTimeout(() => {
      const form = document.createElement('form');
      form.className = 'cubuk';
      form.addEventListener('submit', (olay) => olay.preventDefault());
      const yeniKutu = document.createElement('textarea');
      yeniKutu.id = kutu.id;
      yeniKutu.name = kutu.name;
      yeniKutu.placeholder = kutu.placeholder;
      yeniKutu.value = kutu.value;
      yeniKutu.addEventListener('input', dugmeleriAyarla);
      kutu.replaceWith(yeniKutu);
      kutu = yeniKutu;
      form.append(...cubuk.childNodes);
      cubuk.replaceWith(form);
      cubuk = form;
      alanlariKur(ekDusur);
      onizlemeleriCiz();
    }, 6000);
  }
  yolla.onclick = () => {
    const istem = kutu.value.trim();
    if (!istem || yukleniyor) return;
    const ekler = ekDosyalari();
    for (const d of dosyaAlanlari) d.alan.value = '';
    onizlemeler.replaceChildren();
    kutu.value = '';
    dugmeleriAyarla();
    const kullanici = document.createElement('div');
    kullanici.textContent = istem;
    mesajlar.append(kullanici);
    const ekResmi = (ek) => {
      const resim = document.createElement('img');
      resim.src = URL.createObjectURL(ek);
      if (masaustu) resim.alt = 'Kullanıcı eki';
      return resim;
    };
    if (ekler.length && masaustu) {
      setTimeout(() => kullanici.prepend(...ekler.map(ekResmi)), 1000);
    } else if (ekler.length) {
      const ekKutusu = document.createElement('div');
      ekKutusu.append(...ekler.map(ekResmi));
      mesajlar.append(ekKutusu);
    }
    // Adreste "durdurmasiz" varsa üretim sırasında "durdur" düğmesi hiç görünmez.
    const durdurVar = !location.search.includes('durdurmasiz');
    if (durdurVar) kes.style.display = '';
    setTimeout(() => {
      const asistan = document.createElement('div');
      // Reddedilen bir istemden sonra aynı sohbette ısrar edilse de görsel üretilmez.
      if (istem.includes('YAZI')) reddedildi = true;
      if (reddedildi) asistan.textContent = 'Bu görseli üretemiyorum.';
      else if (istem.includes('SORU')) asistan.textContent = 'İstersen hemen Paket 1 ile başlayayım.';
      // Gerçekte görülen durum: araç eklere erişemez; ısrar edilirse referanssız bir görsel üretir.
      else if (istem.includes('ERISIM') && !erisimDendi) {
        erisimDendi = true;
        asistan.textContent = 'Görseli üretmeyi denedim ancak görsel oluşturma aracı referans görsellerine erişemedi. Önceki tasarımlardan birini yeniden yükle.';
      }
      else {
        const resim = document.createElement('img');
        resim.src = ${JSON.stringify(gorselKoku)} + '/gorsel/yeni-' + (++sayac) + '-' + Date.now() + '.png' + (ekler.length ? '?ek=' + ekler.length : '');
        asistan.append(resim);
      }
      mesajlar.append(asistan);
      setTimeout(() => {
        kes.style.display = 'none';
        // Yanıt tamamlanınca altında eylem düğmeleri belirir.
        const kopyala = document.createElement('button');
        kopyala.setAttribute('aria-label', 'Kopyala');
        kopyala.textContent = 'k';
        mesajlar.append(kopyala);
      }, 700);
    }, 2200);
  };
</script>`;

// Gemini'ye benzeyen sayfa (gerçek sayfada görülen yapıyla): istem kutusu bir fieldset içindeki
// rich-textarea'da contenteditable bir .ql-editor; form yok. Dosya alanları sayfada yoktur, ancak
// "Yükleme ve araçlar" (+) menüsü açılınca eklenir ve menü kapansa da kalır. Seçilen görseller
// "eki kapat" düğmeli kartlar (uploader-file-preview) olarak görünür; kartlarda resim yoktur.
// Ekler 900 ms "yüklenir" (mat-progress-spinner döner); bu sırada gönderilirse ekler düşer.
// Kullanıcı mesajı user-query, yanıt model-response öğesidir; ekler user-query içinde 1 sn sonra
// büyük resim olarak belirir. Üretim sırasında thinking-overlay içinde bir ara taslak (320 px)
// belirir ve sayfada kalır; asıl görsel generated-image içinde, blob: adresindedir ve sayfanın
// güvenlik kuralı (CSP) blob: adresinin sayfa içinden okunmasına izin vermez (gerçek Gemini'deki gibi).
// Resimler sayfasındaki gibi, açıldıktan 1,5 sn sonra bir örnek galerisi görseli (600 px) yüklenir.
// İstemde "BOS" geçerse yanıt boş kalır (görsel de yazı da yok; gerçekte görüldü).
const GEMINI_SAYFA = () => `<!doctype html>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="connect-src 'self'">
<title>Sahte Gemini</title>
<div id="sohbet"></div>
<fieldset class="input-area-fieldset">
  <div class="text-input-field">
    <div class="ekler"></div>
    <button aria-label="Yükleme ve araçlar" id="arti">+</button>
    <rich-textarea><div class="ql-editor ql-blank" contenteditable="true" aria-label="Gemini için bir istem girin" style="min-height:2em;border:1px solid #888"></div></rich-textarea>
    <button aria-label="Dikte et">mik</button>
    <button aria-label="Mesaj gönder" id="gonder" style="display:none">gönder</button>
    <button aria-label="Yanıtı durdur" id="durdur" style="display:none">dur</button>
  </div>
</fieldset>
<div id="menu" role="menu" hidden><button>Dosya yükleyin</button><button>Drive'dan ekle</button></div>
<div class="hidden-uploader"></div>
<script>
  const kutu = document.querySelector('.ql-editor');
  const sohbet = document.getElementById('sohbet');
  const ekler = document.querySelector('.ekler');
  const gonder = document.getElementById('gonder');
  const durdur = document.getElementById('durdur');
  const menu = document.getElementById('menu');
  let bekleyenler = [];
  let yukleniyor = false;
  let sayac = 0;
  const dugmeleriAyarla = () => { gonder.style.display = kutu.innerText.trim() ? '' : 'none'; };
  kutu.addEventListener('input', dugmeleriAyarla);
  setTimeout(() => {
    const kart = document.createElement('media-gen-template-card');
    const ornek = document.createElement('img');
    ornek.src = '/gorsel/ornek.png';
    kart.append(ornek);
    document.body.append(kart);
  }, 1500);
  const kartlariCiz = () => ekler.replaceChildren(...bekleyenler.map((dosya, sira) => {
    const kart = document.createElement('uploader-file-preview');
    kart.className = 'file-preview-chip';
    kart.textContent = dosya.name;
    const kapat = document.createElement('button');
    kapat.setAttribute('aria-label', 'eki kapat');
    kapat.onclick = () => { bekleyenler.splice(sira, 1); kartlariCiz(); };
    kart.append(kapat);
    return kart;
  }));
  document.getElementById('arti').onclick = () => {
    menu.hidden = false;
    if (document.querySelector('input[type=file]')) return;
    const yer = document.querySelector('.hidden-uploader');
    for (const accept of ['.txt,.pdf,.doc,.docx', 'image/*,video/*', '.txt,.pdf,.doc,.docx']) {
      const alan = document.createElement('input');
      alan.type = 'file';
      alan.multiple = true;
      alan.accept = accept;
      alan.className = 'hidden-file-input';
      alan.hidden = true;
      if (accept.startsWith('image')) {
        alan.addEventListener('change', () => {
          bekleyenler.push(...alan.files);
          alan.value = '';
          kartlariCiz();
          yukleniyor = true;
          const donen = document.createElement('mat-progress-spinner');
          donen.textContent = '…';
          ekler.append(donen);
          setTimeout(() => { yukleniyor = false; donen.remove(); }, 900);
        });
      }
      yer.append(alan);
    }
  };
  document.addEventListener('keydown', (olay) => { if (olay.key === 'Escape') menu.hidden = true; });
  gonder.onclick = () => {
    const istem = kutu.innerText.trim();
    if (!istem) return;
    // Yükleme bitmeden gönderilirse ekler düşer.
    const gidenler = yukleniyor ? [] : bekleyenler;
    bekleyenler = [];
    kartlariCiz();
    kutu.innerText = '';
    dugmeleriAyarla();
    const kullanici = document.createElement('user-query');
    kullanici.textContent = istem;
    sohbet.append(kullanici);
    if (gidenler.length) {
      setTimeout(() => kullanici.prepend(...gidenler.map((f) => { const r = document.createElement('img'); r.src = URL.createObjectURL(f); r.alt = 'Yüklenen resim'; return r; })), 1000);
    }
    durdur.style.display = '';
    const yanit = document.createElement('model-response');
    sohbet.append(yanit);
    setTimeout(() => {
      const dusunce = document.createElement('thinking-overlay');
      const taslak = document.createElement('img');
      taslak.src = '/gorsel/taslak.png';
      dusunce.append(taslak);
      yanit.append(dusunce);
    }, 700);
    setTimeout(async () => {
      if (istem.includes('BOS')) {
        durdur.style.display = 'none';
        const kopyala = document.createElement('button');
        kopyala.setAttribute('aria-label', 'Kopyala');
        yanit.append(kopyala);
        return;
      }
      const adres = '/gorsel/gemini-' + (++sayac) + '.png' + (gidenler.length ? '?ek=' + gidenler.length : '');
      const resim = document.createElement('img');
      resim.alt = 'Oluşturulan görsel 1';
      resim.src = URL.createObjectURL(await (await fetch(adres)).blob());
      const kap = document.createElement('generated-image');
      kap.append(resim);
      yanit.append(kap);
      setTimeout(() => {
        durdur.style.display = 'none';
        const kopyala = document.createElement('button');
        kopyala.setAttribute('aria-label', 'Kopyala');
        kopyala.textContent = 'k';
        yanit.append(kopyala);
      }, 700);
    }, 2000);
  };
</script>`;

function dinle(sunucu) {
  return new Promise((coz) => sunucu.listen(0, '127.0.0.1', () => coz(sunucu.address().port)));
}

async function sahteChatgptBaslat() {
  const gorsel = pngUret(512, 512, [70, 160, 90]);
  const ekliGorsel = pngUret(300, 300, [60, 90, 200]);
  const taslakGorsel = pngUret(320, 320, [230, 200, 40]); // Gemini'nin üretim sırasındaki ara taslağı
  const ornekGorsel = pngUret(600, 600, [120, 120, 120]); // Gemini Resimler sayfasındaki örnek galerisi
  const ekSayilari = []; // referanslı istemlere dönen görseller indirilirken: kaç referans gelmişti
  const gorselYaniti = (istek, yanit) => {
    if (!istek.url.startsWith('/gorsel/')) return false;
    const ek = /[?&]ek=(\d+)/.exec(istek.url);
    if (ek) ekSayilari.push(Number(ek[1]));
    yanit.writeHead(200, { 'content-type': 'image/png' });
    const ozel = { '/gorsel/taslak': taslakGorsel, '/gorsel/ornek': ornekGorsel };
    const anahtar = Object.keys(ozel).find((on) => istek.url.startsWith(on));
    yanit.end(anahtar ? ozel[anahtar] : istek.url.includes('ek=') ? ekliGorsel : gorsel);
    return true;
  };

  // Görseller için ayrı bir sunucu (farklı kaynak, CORS başlığı yok).
  const gorselSunucu = http.createServer((istek, yanit) => {
    if (!gorselYaniti(istek, yanit)) yanit.writeHead(404).end();
  });
  const gorselPortu = await dinle(gorselSunucu);

  const site = http.createServer((istek, yanit) => {
    if (gorselYaniti(istek, yanit)) return;
    yanit.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    const sayfa = istek.url.startsWith('/yeni') ? YENI_SAYFA : istek.url.startsWith('/gemini') ? GEMINI_SAYFA : SAYFA;
    yanit.end(sayfa(`http://127.0.0.1:${gorselPortu}`));
  });
  const sitePortu = await dinle(site);

  return {
    adres: `http://127.0.0.1:${sitePortu}/`,
    gorsel,
    ekliGorsel,
    ekSayilari,
    kapat: () => {
      site.close();
      gorselSunucu.close();
    },
  };
}

module.exports = { sahteChatgptBaslat, pngUret };
