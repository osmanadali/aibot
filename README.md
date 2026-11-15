# Robot

Bilgisayarında tekrarlayan işleri senin yerine yapan kişisel robot. Tamamen kendi
bilgisayarında çalışır. Bir arayüzü ve üç yeteneği var:

| Görev | Ne yapar |
| --- | --- |
| `gorsel-uret` | `istemler.txt` içindeki her satırı ChatGPT'ye (tarayıcıda) yazar, görseli bekler, `cikti/` klasörüne kaydeder. |
| `claude-gonder` | Görselleri oyun projenin klasörüne kopyalar ve o klasörde bir Claude Code sohbetine iletir. |
| `arayuz` | Tarayıcıda açılan arayüzü başlatır: istem yaz ya da söyle, referans görsel ekle, sırayı başlat. |
| `git-gonder` | Görselleri oyun projenin klasörüne kopyalar, commit'ler ve GitHub'a gönderir. |

İki hazır akış var: `oyun-gorselleri` görselleri üretip bilgisayarındaki Claude Code
sohbetine iletir; `oyun-gorselleri-github` görselleri üretip GitHub'a gönderir.

## Kurulum (bir kez)

1. [Node.js](https://nodejs.org) LTS sürümünü kur.
2. `kur.bat` dosyasına çift tıkla.
3. `deneme.bat` dosyasına çift tıkla. Bu, robotu sahte bir ChatGPT sayfasıyla dener;
   gerçek hesabına dokunmaz. Sonunda "Tüm denemeler geçti" yazmalı.
4. `ayarlar.json` içinde `claude.projeKlasoru` alanına oyun projenin klasörünü yaz.
   Ters eğik çizgiler çift yazılır: `"C:\\Oyunlar\\benim-oyunum"`.

`git-gonder` için Git, `claude-gonder` için bilgisayarında Claude Code komut satırı (`claude` komutu) kurulu
ve giriş yapılmış olmalı.

## Arayüzle kullanım

`arayuz.bat` dosyasına çift tıkla. Tarayıcında `http://127.0.0.1:4317` adresinde
robotun arayüzü açılır; siyah pencere açık kaldıkça çalışır.

- **İstem:** Kutuya yaz ya da mikrofon düğmesine basıp söyle (Chrome ve Edge'de
  çalışır; ses, tarayıcının kendi ses tanıma hizmetiyle yazıya çevrilir).
- **Referans görsel:** Görsel düğmesiyle seç, kutuya sürükleyip bırak ya da
  Ctrl+V ile yapıştır. Referanslar istemle birlikte ChatGPT'ye yüklenir.
- **Sıraya ekle**, sonra **Başlat.** Robot bekleyen işleri sırayla üretir; her
  kartta durumu ve bitince görseli görürsün. İlk seferde açılan robot
  tarayıcısında ChatGPT'ye giriş yapman gerekir.
- **Bitince:** Görselleri Claude Code sohbetine ya da GitHub'a göndermeyi
  seçebilirsin. Claude Code sohbeti robotun siyah penceresinde açılır.
- Beğenmediğin görselde ↻ düğmesi görseli silip işi yeniden sıraya alır.
- **Ayarlar** bölümünden ortak stili ve oyun projesi klasörünü değiştirebilirsin.

Arayüzün işleri `veri/` klasöründe, görseller `cikti/` klasöründe durur.

## Dosyayla kullanım

1. `istemler.txt` dosyasına istemlerini yaz (her satır bir görsel).
2. `calistir.bat` dosyasına çift tıkla.
3. İlk seferde açılan tarayıcı penceresinde ChatGPT'ye giriş yap. Robot girişi
   bekler, sonra kendiliğinden devam eder. Giriş `tarayici-profili/` klasöründe
   saklanır; sonraki çalıştırmalarda tekrar sormaz.
4. Görseller bitince aynı pencerede Claude Code sohbeti açılır ve görsellerin
   yolları sohbete yazılmış olur.

Komut satırından:

```bash
node robot.js
```

Görevleri ve akışları listeler.

```bash
node robot.js gorsel-uret --istemler dusmanlar.txt
```

```bash
node robot.js claude-gonder --mesaj "Bu görselleri düşman sprite'ı olarak oyuna ekle"
```

### Görselleri GitHub'a gönderme

Claude Code'u bulutta (claude.ai/code ya da uygulama) kullanıyorsan sohbet
bilgisayarındaki dosyaları göremez; görseller depoda olmalı. Bunun için:

```bash
calistir.bat oyun-gorselleri-github
```

Robot görselleri üretir, projendeki `assets/uretilen/` klasörüne kopyalar, yalnızca
o dosyaları commit'ler ve projede o an açık olan dala gönderir. Dal değiştirmez,
projedeki diğer değişikliklere dokunmaz. Proje klasörü bir git deposu olmalı ve
bilgisayarında `git push` çalışıyor olmalı. Sonra bulut sohbetinde o dalı açıp
"`assets/uretilen` altındaki yeni görsellere bak" demen yeterli.

Daha önce üretilmiş görselleri sonradan göndermek için:

```bash
node robot.js git-gonder
```

### istemler.txt

```
# ile başlayan satırlar atlanır
kahraman | Pixel-art tarzında kılıçlı bir şövalye, şeffaf arka plan
Pixel-art tarzında yeşil bir slime
```

`ad | istem` yazarsan dosya `ad.png` olur; yazmazsan ad istemden türetilir
(`002-pixel-art-tarzinda-yesil-bir-slime.png`).

### Yarıda kalırsa

Biten istemler `cikti/durum.json` içinde tutulur. Aynı komutu tekrar çalıştırınca
robot bitenleri atlar. Üst üste iki istem başarısız olursa (genellikle ChatGPT
görsel limiti dolmuştur) robot durur; daha sonra tekrar çalıştırman yeterli.
Bir görseli baştan ürettirmek için dosyasını sil ya da `--yeniden` ekle.
Başarısız her istem için `cikti/hata-<ad>.png` ekran görüntüsü kaydedilir.

## Ayarlar (`ayarlar.json`)

| Alan | Anlamı |
| --- | --- |
| `tarayici.yol` | Boşsa Chrome, yoksa Edge kullanılır. Başka tarayıcı için tam yol. |
| `chatgpt.adres` | Her istem için açılan sayfa. Bir ChatGPT projesinin ya da özel GPT'nin adresini yazabilirsin. |
| `chatgpt.onEk` / `sonEk` | Her istemin başına / sonuna eklenen metin (ortak stil cümlesi için `sonEk`). |
| `chatgpt.gorselBeklemeDakika` | Bir görsel için en fazla bekleme süresi. |
| `chatgpt.istemArasiSaniye` | İki istem arasındaki bekleme. |
| `chatgpt.denemeSayisi` / `denemeArasiDakika` | Olmayan istem kaç kez, ne kadar arayla denenir. |
| `chatgpt.seciciler` | ChatGPT sayfasındaki öğelerin adresleri (aşağıya bak). |
| `claude.projeKlasoru` | Claude Code'un çalışacağı klasör. |
| `claude.hedefAltKlasor` | Görsellerin proje içinde kopyalanacağı yer. Boş bırakılırsa kopyalanmaz. |
| `claude.komut` | Varsayılan `claude`. Komut bulunamıyorsa tam yolunu yaz. |
| `claude.mod` | `sohbet`: etkileşimli sohbet açar. `arkaplan`: mesajı gönderir, yanıtı yazdırıp çıkar. |
| `claude.devamEt` | `true` ise o klasördeki son sohbete devam eder, yoksa yeni sohbet açar. |
| `claude.mesaj` | Görsel listesinin önüne yazılan talimat. |
| `git.projeKlasoru` / `git.hedefAltKlasor` | Boş bırakılırsa `claude` altındaki değerler kullanılır. |
| `git.uzak` | Gönderilecek uzak depo adı (varsayılan `origin`). |
| `git.commitMesaji` | Commit mesajı; `{adet}` yerine görsel sayısı yazılır. |
| `arayuz.port` | Arayüzün açıldığı port (varsayılan 4317). |
| `akislar` | Art arda çalışacak görev listeleri. |

### ChatGPT arayüzü değişirse

Robot sayfadaki istem kutusunu, gönder ve durdur düğmelerini
`chatgpt.seciciler` altındaki adreslerle bulur. ChatGPT arayüzünü değiştirirse
robot "istem kutusu hazır olmadı" gibi bir hatayla durur; o zaman yalnızca bu
adresleri güncellemek gerekir. Görselin kendisini bulmak bu adreslere bağlı
değildir: robot, gönderimden sonra sayfada beliren yeni ve büyük resimleri alır.

## Yeni görev ekleme

`gorevler/` klasörüne bir dosya koy; robot onu kendiliğinden tanır.

```js
// gorevler/ornek.js
module.exports = {
  ad: 'ornek',
  aciklama: 'Ne yaptığını tek cümleyle yaz',
  async calistir(baglam) {
    // baglam.ayarlar    -> ayarlar.json içeriği
    // baglam.secenekler -> komut satırındaki --anahtar değer çiftleri
    // baglam.veri       -> akıştaki adımlar arasında taşınan sonuçlar
    //                      (gorsel-uret buraya "gorseller" listesini koyar)
    // baglam.gunluk     -> saat damgalı çıktı
    baglam.gunluk('Merhaba!');
  },
};
```

Çalıştırma: `node robot.js ornek`. Bir akışa eklemek için `ayarlar.json > akislar`
altındaki listeye adını yaz. Tarayıcı gerektiren görevler `lib/tarayici.js`
içindeki `tarayiciyaBaglan` ile aynı (giriş yapılmış) tarayıcıyı kullanabilir.

## Bilmen gerekenler

- Robot ChatGPT planındaki görsel limitini aşamaz; limit dolunca durur.
- OpenAI'nin kullanım şartları çıktının otomatik yollarla alınmasını kısıtlar.
  Robot bu yüzden yavaş ve tek tek çalışır; kullanım kararı ve sorumluluğu sende.
- Arayüz yalnızca bu bilgisayardan açılabilir; başka cihazlar ve başka siteler
  ona erişemez.
- Robot çalışırken tarayıcı, yalnızca bu bilgisayardan erişilebilen bir denetim
  kapısı (varsayılan 9222) açar. Robotun tarayıcı penceresini işin bitince
  kapatabilirsin.
