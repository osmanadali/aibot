// Bir isteğin ya da yapıştırılan listenin metninden görselin nereye gideceğini okur.
// Böylece her iş, metninde yazan depoya, dala ve klasöre gönderilir; ayarlardaki
// genel GitHub adresi yalnızca metinde hedef yazmayan işler için kullanılır.
//
// Tanınanlar (hepsi isteğe bağlı):
//   depo   https://github.com/kullanici/depo (ya da .../tree/dal/klasor; dal ve klasör de okunur)
//   dal    `dal-adi` dalına / dalı / dalını / dalında ya da "branch dal-adi". Yanlış dala
//          gitmemek için yalnızca ters tırnak içinde yazılmış ya da içinde / - _ geçen adlar
//          dal sayılır ("ana dal", "aynı dala" gibi sözler sayılmaz).
//   klasor kut/gelen_gorsel/kahraman_yarasa_a.png gibi yolların klasörü. Dosyanın kendi yolu
//          yazıyorsa o, yazmıyorsa metindeki yolların ortak klasörü (tek klasör geçiyorsa).
//   mesaj  Commit mesajı: `...` / "..."

const GITHUB = /(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^\s`"'<>)]+))?(?=[\s`"'<>),.;:]|$)/i;
const YOL = /((?:[\w.-]+\/)+)([\w<>{}.-]+)\.(png|jpe?g|webp|gif)\b/gi;
const SIRADAN = new Set(['ana', 'aynı', 'ayni', 'bu', 'şu', 'o', 'yeni', 'eski', 'kendi', 'main', 'master']);

function dalAdayi(ad, tirnakli) {
  if (!ad) return '';
  const temiz = ad.replace(/^[`'"]+|[`'".,;:]+$/g, '');
  if (!/^[A-Za-z0-9][\w./-]*$/.test(temiz)) return '';
  if (tirnakli) return temiz;
  if (SIRADAN.has(temiz.toLowerCase())) return '';
  return /[/_-]/.test(temiz) ? temiz : '';
}

function dalBul(metin) {
  const desenler = [
    [/`([^`\s]+)`\s+(?:dal(?:ı|ına|ını|ında|ından|a)?|branch(?:ine|ina)?)\b/gi, true],
    [/(?:branch|dal)\s*[:=]?\s*`([^`\s]+)`/gi, true],
    [/(?:^|[\s(])([A-Za-z0-9][\w./-]*)\s+dal(?:ı|ına|ını|ında|ından|a)\b/gi, false],
    [/\bbranch\s+([A-Za-z0-9][\w./-]*)/gi, false],
  ];
  for (const [desen, tirnakli] of desenler) {
    for (const e of metin.matchAll(desen)) {
      const dal = dalAdayi(e[1], tirnakli);
      if (dal) return dal;
    }
  }
  return '';
}

function hedefiBul(metin, dosyaAdi) {
  const yazi = String(metin || '');
  const hedef = {};

  const github = yazi.match(GITHUB);
  if (github) {
    hedef.depo = `https://github.com/${github[1]}/${github[2]}`;
    // /tree/ sonrası "dal/klasor" olabilir; dal adında da / olabildiği için bölme gönderirken yapılır.
    if (github[3]) hedef.agacYolu = decodeURIComponent(github[3]).replace(/\/+$/, '');
  }

  const dal = dalBul(yazi);
  if (dal) hedef.dal = dal;

  const yollar = [...yazi.matchAll(YOL)]
    .map((e) => ({ klasor: e[1].replace(/^\.?\/+|\/+$/g, ''), ad: e[2] }))
    .filter((y) => !/github\.com|https?:/i.test(y.klasor) && !/^(tree|blob)\//.test(y.klasor));
  const kendisi = dosyaAdi && yollar.find((y) => y.ad.toLowerCase() === String(dosyaAdi).toLowerCase());
  const klasorler = [...new Set(yollar.map((y) => y.klasor))];
  if (kendisi) hedef.klasor = kendisi.klasor;
  else if (klasorler.length === 1) hedef.klasor = klasorler[0];

  const mesaj =
    yazi.match(/commit\s+mesaj(?:ı|i)?\s*[:=]?\s*(?:`([^`\n]+)`|"([^"\n]+)"|“([^”\n]+)”)/i) ||
    yazi.match(/(?:`([^`\n]+)`|"([^"\n]+)"|“([^”\n]+)”)\s+mesaj(?:ıyla|iyla|ı ile|i ile)\s+commit/i);
  if (mesaj) hedef.mesaj = (mesaj[1] || mesaj[2] || mesaj[3]).trim();

  return Object.keys(hedef).length ? hedef : null;
}

// İnsanın okuyacağı kısa özet: "kullanici/depo · dal · klasor"
function hedefOzeti(hedef) {
  if (!hedef) return '';
  const depo = hedef.depo ? hedef.depo.replace(/^https:\/\/github\.com\//, '') : '';
  return [depo, hedef.dal || (hedef.agacYolu && !hedef.dal ? hedef.agacYolu : ''), hedef.klasor].filter(Boolean).join(' · ');
}

module.exports = { hedefiBul, hedefOzeti, dalBul };
