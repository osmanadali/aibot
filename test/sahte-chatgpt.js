// Deneme için ChatGPT'yi taklit eden küçük bir yerel site.
// Gerçek ChatGPT'ye dokunmadan (ve limit harcamadan) robotun akışını sınar.
//
// - İstemde "YAZI" geçerse yalnızca yazıyla yanıt verir (başarısızlık yolu).
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
  <button data-testid="send-button">Gönder</button>
  <button data-testid="stop-button" style="display:none">Durdur</button>
</main>
<script>
  const kutu = document.getElementById('prompt-textarea');
  const mesajlar = document.getElementById('mesajlar');
  const gonder = document.querySelector('[data-testid="send-button"]');
  const durdur = document.querySelector('[data-testid="stop-button"]');
  let sayac = 0;
  gonder.onclick = () => {
    const istem = kutu.innerText.trim();
    if (!istem) return;
    kutu.innerText = '';
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
        resim.src = kok + '/gorsel/' + (++sayac) + '-' + Date.now() + '.png';
        asistan.append(resim);
      }
      mesajlar.append(asistan);
      setTimeout(() => { durdur.style.display = 'none'; gonder.style.display = ''; }, 700);
    }, 1200);
  };
</script>`;

function dinle(sunucu) {
  return new Promise((coz) => sunucu.listen(0, '127.0.0.1', () => coz(sunucu.address().port)));
}

async function sahteChatgptBaslat() {
  const png = pngUret(512, 512, [70, 160, 90]);
  const gorselYaniti = (istek, yanit) => {
    if (!istek.url.startsWith('/gorsel/')) return false;
    yanit.writeHead(200, { 'content-type': 'image/png' });
    yanit.end(png);
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
    yanit.end(SAYFA(`http://127.0.0.1:${gorselPortu}`));
  });
  const sitePortu = await dinle(site);

  return {
    adres: `http://127.0.0.1:${sitePortu}/`,
    kapat: () => {
      site.close();
      gorselSunucu.close();
    },
  };
}

module.exports = { sahteChatgptBaslat };
