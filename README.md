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

1. [Node.js](https://nodejs.org) LTS sürümünü kur (sayfadaki "Windows Installer (.msi)").
2. Robotun klasöründeki `kur.bat` dosyasına çift tıkla. Gerekli parçayı indirir ve
   masaüstüne **Robot** simgesini ekler.
3. İstersen `deneme.bat` ile dene. Robotu sahte bir ChatGPT sayfasıyla sınar,
   gerçek hesabına dokunmaz; sonunda "Tüm denemeler geçti" yazmalı.

`git-gonder` için Git, `claude-gonder` için Claude Code komut satırı (`claude` komutu)
kurulu ve giriş yapılmış olmalı.

## Kullanım

Masaüstündeki **Robot** simgesine çift tıkla. Robot kendi penceresinde açılır;
pencereyi kapatınca robot da kapanır. Simge kaybolursa `kisayol-olustur.bat`
yeniden ekler.

- **İstem:** Kutuya yaz ya da mikrofon düğmesine basıp söyle (Chrome ve Edge'de
  çalışır; ses, tarayıcının kendi ses tanıma hizmetiyle yazıya çevrilir).
- **Hazır liste:** İçinde dosya adları geçen bir görsel listesi yapıştırırsan
  (ör. `menu_bg.png — Ana menü arka planı`) robot onu dosya dosya ayırır; her
  görsel kendi dosya adıyla ayrı bir iş olur. Bölüm başlıkları ve listenin
  başındaki genel bilgiler her isteme eklenir.
- **Referans görsel:** Görsel düğmesiyle seç, kutuya sürükleyip bırak ya da
  Ctrl+V ile yapıştır. Referanslar istemle birlikte ChatGPT'ye yüklenir.
- **Sıraya ekle**, sonra **Başlat.** Robot bekleyen işleri sırayla üretir; her
  kartta durumu ve bitince görseli görürsün. İlk seferde açılan robot
  tarayıcısında ChatGPT'ye giriş yapman gerekir.
- **Bitince:** Görselleri Claude Code sohbetine ya da GitHub'a göndermeyi
  seçebilirsin. Claude Code sohbeti ayrı bir komut penceresinde açılır.
- Beğenmediğin görselde ↻ düğmesi görseli silip işi yeniden sıraya alır.
- **Ayarlar** bölümünden ortak stili ve oyun projesi klasörünü değiştirebilirsin.
- Robot açılmazsa küçük bir uyarı çıkar; ayrıntı `veri\uygulama.log` dosyasındadır.

Arayüzün işleri `veri/` klasöründe, görseller `cikti/` klasöründe durur.

Arayüzü normal tarayıcında, komut penceresi görünür şekilde açmak istersen
`arayuz.bat` dosyasını kullan (`http://127.0.0.1:4317`).

## Güncellemeler

Robot her açılışta GitHub'daki depoya bakar; yeni sürüm varsa indirir, kurar ve
yeni sürümle açılır. Senin yapman gereken bir şey yok. İnternet yoksa eski
sürümle açılır. Kurulu sürüm arayüzün en altında yazar.

Güncelleme şunlara dokunmaz: `ayarlar.yerel.json` (ayarların), `istemler.txt`,
`veri/`, `cikti/`, `tarayici-profili/` (ChatGPT girişin).

Robot açıkken yeni sürüm çıkarsa sağ üstte "Yeni sürüm hazır" yazısı belirir;
kapatıp yeniden açman yeterli. Güncelleme denetlenemezse nedeni pencerenin en
altında, sürümün yanında yazar.

Güncelleme gelmiyorsa `guncelle.bat` dosyasına çift tıkla; ne olduğunu ekranda
gösterir. Kapatmak için `ayarlar.yerel.json`
içine `{ "guncelleme": { "kapali": true } }` yaz.

## Dosyayla kullanım

1. `istemler.ornek.txt` dosyasını kopyalayıp adını `istemler.txt` yap ve istemlerini
   yaz (her satır bir görsel). `ayarlar.yerel.json` içinde proje klasörünü belirt
   (aşağıda "Ayarlar").
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
bilgisayarındaki dosyaları göremez; görseller depoda olmalı.

1. Bilgisayarında [Git](https://git-scm.com/download/win) kurulu olmalı.
2. Arayüzde **Ayarlar > GitHub deposu** alanına adresi yapıştır. İki biçim de olur:
   - Depodaki bir klasörün sayfası:
     `https://github.com/kullanici/oyunum/tree/dal-adi/gorseller`
     Görseller o dala ve o klasöre gönderilir.
   - Deponun kendisi: `https://github.com/kullanici/oyunum`
     Görseller ana dalda `assets/uretilen/` klasörüne gönderilir.
3. **Bitince** bölümünde **GitHub**'ı seçip başlat.

Robot depoyu kendi `veri/depolar/` klasörüne indirir, her seferinde günceller,
yalnızca görselleri commit'ler ve gönderir. İlk gönderimde Git bir GitHub giriş
penceresi açabilir. Adresteki dal silinirse robot bunu söyler; adresi yenilemen
yeterli.

Depo yerine bilgisayarındaki bir proje klasörünü kullanmak istersen GitHub
deposu alanını boş bırak; o zaman "Oyun projesi klasörü" kullanılır (klasör bir
git deposu olmalı; robot o an açık olan dala gönderir).

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

## Ayarlar

`ayarlar.json` varsayılanları içerir ve güncellemelerle yenilenir; **onu
değiştirme.** Kendi değerlerini aynı biçimde `ayarlar.yerel.json` dosyasına yaz;
oradaki değerler varsayılanların üzerine yazılır. Arayüzdeki Ayarlar bölümü de bu
dosyaya kaydeder. Örnek:

```json
{
  "claude": { "projeKlasoru": "C:\\Oyunlar\\benim-oyunum" },
  "chatgpt": { "sonEk": "pixel-art, şeffaf arka plan" }
}
```

| Alan | Anlamı |
| --- | --- |
| `tarayici.yol` | Boşsa Chrome, yoksa Edge kullanılır. Başka tarayıcı için tam yol. |
| `chatgpt.adres` | Her istem için açılan sayfa. Bir ChatGPT projesinin ya da özel GPT'nin adresini yazabilirsin. |
| `chatgpt.onEk` / `sonEk` | Her istemin başına / sonuna eklenen metin (ortak stil cümlesi için `sonEk`). |
| `chatgpt.sorarsaYanit` | ChatGPT görsel üretmek yerine soru sorarsa robotun vereceği yanıt. Boş bırakılırsa yanıt vermez. |
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
| `git.depoAdresi` | GitHub deposunun ya da içindeki bir klasörün adresi. |
| `git.dal` | Gönderilecek dal; boşsa adresteki dal, o da yoksa ana dal. |
| `git.projeKlasoru` / `git.hedefAltKlasor` | Boş bırakılırsa `claude` altındaki değerler kullanılır. |
| `git.uzak` | Gönderilecek uzak depo adı (varsayılan `origin`). |
| `git.commitMesaji` | Commit mesajı; `{adet}` yerine görsel sayısı yazılır. |
| `arayuz.port` | Arayüzün açıldığı port (varsayılan 4317). |
| `guncelleme.kapali` | `true` ise açılışta güncelleme denetlenmez. |
| `akislar` | Art arda çalışacak görev listeleri. |

### ChatGPT arayüzü değişirse

ChatGPT arayüzünü sık değiştirir. Robot bu yüzden sayfadaki öğeleri sabit adlarla
değil, ne olduklarına bakarak bulur: istem kutusu görünen en büyük yazı alanıdır,
gönder ve durdur düğmeleri etiketlerinden tanınır, üretilen görsel gönderimden
sonra sayfada beliren yeni ve büyük resimdir.

Yine de bir şey bulunamazsa robot günlüğe "Tanı:" ile başlayan bir satır yazar;
bu satır sayfada gördüğü alanları ve düğmeleri listeler. O satır, neyin
değiştiğini anlamak için yeterlidir. Belirli bir öğenin adresini elle vermek
istersen `chatgpt.seciciler` altına yazabilirsin; orada yazanlar önce denenir.

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
- Güncellemeler `osmanadali/aibot` deposunun `main` dalından gelir; o dala
  gönderilen her şey bir sonraki açılışta bilgisayarına kurulur.
- Arayüz yalnızca bu bilgisayardan açılabilir; başka cihazlar ve başka siteler
  ona erişemez.
- Robot çalışırken tarayıcı, yalnızca bu bilgisayardan erişilebilen bir denetim
  kapısı (varsayılan 9222) açar. Robotun tarayıcı penceresini işin bitince
  kapatabilirsin.
