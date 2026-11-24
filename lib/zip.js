// Ek paket gerektirmeyen küçük ZIP yazıcı (deflate). Model dosyalarını tek pakette göndermek için.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLOSU = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bayt) {
  let c = 0xffffffff;
  for (let i = 0; i < bayt.length; i++) c = CRC_TABLOSU[(c ^ bayt[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTarihi(tarih) {
  return {
    saat: (tarih.getHours() << 11) | (tarih.getMinutes() << 5) | Math.floor(tarih.getSeconds() / 2),
    gun: ((tarih.getFullYear() - 1980) << 9) | ((tarih.getMonth() + 1) << 5) | tarih.getDate(),
  };
}

// dosyalar: [yol, ...] (zip içinde yalnızca dosya adlarıyla durur). Sonuç: zip yolu.
function zipYaz(hedef, dosyalar) {
  const parcalar = [];
  const merkez = [];
  let konum = 0;
  for (const dosya of dosyalar) {
    const ad = Buffer.from(path.basename(dosya), 'utf8');
    const ham = fs.readFileSync(dosya);
    const sikisik = zlib.deflateRawSync(ham, { level: 9 });
    const crc = crc32(ham);
    const { saat, gun } = dosTarihi(fs.statSync(dosya).mtime);
    const yerel = Buffer.alloc(30);
    yerel.writeUInt32LE(0x04034b50, 0);
    yerel.writeUInt16LE(20, 4);
    yerel.writeUInt16LE(0x0800, 6); // UTF-8 ad
    yerel.writeUInt16LE(8, 8); // deflate
    yerel.writeUInt16LE(saat, 10);
    yerel.writeUInt16LE(gun, 12);
    yerel.writeUInt32LE(crc, 14);
    yerel.writeUInt32LE(sikisik.length, 18);
    yerel.writeUInt32LE(ham.length, 22);
    yerel.writeUInt16LE(ad.length, 26);
    parcalar.push(yerel, ad, sikisik);

    const m = Buffer.alloc(46);
    m.writeUInt32LE(0x02014b50, 0);
    m.writeUInt16LE(20, 4);
    m.writeUInt16LE(20, 6);
    m.writeUInt16LE(0x0800, 8);
    m.writeUInt16LE(8, 10);
    m.writeUInt16LE(saat, 12);
    m.writeUInt16LE(gun, 14);
    m.writeUInt32LE(crc, 16);
    m.writeUInt32LE(sikisik.length, 20);
    m.writeUInt32LE(ham.length, 24);
    m.writeUInt16LE(ad.length, 28);
    m.writeUInt32LE(konum, 42);
    merkez.push(m, ad);
    konum += yerel.length + ad.length + sikisik.length;
  }
  const merkezBayt = Buffer.concat(merkez);
  const son = Buffer.alloc(22);
  son.writeUInt32LE(0x06054b50, 0);
  son.writeUInt16LE(dosyalar.length, 8);
  son.writeUInt16LE(dosyalar.length, 10);
  son.writeUInt32LE(merkezBayt.length, 12);
  son.writeUInt32LE(konum, 16);
  fs.mkdirSync(path.dirname(hedef), { recursive: true });
  fs.writeFileSync(hedef, Buffer.concat([...parcalar, merkezBayt, son]));
  return hedef;
}

module.exports = { zipYaz, crc32 };
