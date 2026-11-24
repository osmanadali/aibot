// Görsel üreten sohbet sayfasını (ChatGPT ya da Gemini) süren parça: istemi yazar, (varsa)
// referans görselleri ekler, görselin bitmesini bekler ve baytlarını döndürür.
//
// Bu siteler arayüzlerini sık değiştirdiği için sayfadaki öğeler sabit adlarla değil,
// ne olduklarına bakılarak bulunur:
//   - istem kutusu: görünen en büyük yazı alanı
//   - gönder / durdur düğmeleri: etiketinde "gönder"/"send", "durdur"/"stop" geçenler
//   - dosya alanı: sayfada yoksa istem kutusunun yanındaki yükleme menüsü açılarak ortaya çıkarılır
//   - üretilen görsel: gönderimden sonra sayfada beliren yeni ve büyük resimler
//     (eklenen referanslar, kullanıcı mesajının içinde olduklarından ya da "Kullanıcı eki"
//     gibi adlarından tanınıp sayılmaz)
// ayarlar.json > chatgpt.seciciler (Gemini için gemini.seciciler) altındaki adresler varsa
// önce onlar denenir. Günlükteki site adı ayar.ad'dan gelir.

const fs = require('fs');
const { bekle } = require('./tarayici');

const VARSAYILAN_SECICILER = {
  istemKutusu: "#prompt-textarea, #mobile-composer-prompt, textarea[name='prompt']",
  gonderDugmesi: "[data-testid='send-button'], #composer-submit-button",
  durdurDugmesi: "[data-testid='stop-button']",
  girisDugmesi: "[data-testid='login-button']",
  kullaniciMesaji: "[data-message-author-role='user']",
  // Kullanıcının eklediği görseller; yeni arayüzde kullanıcı mesajı işaretsiz olduğu için adlarından tanınır.
  ekGorseli: "img[alt^='Kullanıcı eki' i], img[alt^='User attachment' i], img[alt^='Uploaded image' i]",
  dosyaGirdisi: "input[type='file']",
  // Dosya alanları sayfada yoksa onları ortaya çıkaran düğme (Gemini'de "+" menüsü).
  yuklemeMenusu: '',
};

// Not: sayfa içinde çalışan kodlarda "kap", istem kutusunun içinde durduğu besteci kutusudur:
// form, fieldset ya da en az iki düğme içeren ilk üst öğe (Gemini'de form yok, fieldset var).

// Sayfanın o anki hâlini okur ve bulduğu istem kutusu ile gönder düğmesini
// (data-robot-kutu / data-robot-gonder) işaretler.
async function sayfaDurumu(sayfa, s) {
  return sayfa.evaluate((seciciler) => {
    const gorunur = (e) => {
      const kutu = e.getBoundingClientRect();
      const stil = getComputedStyle(e);
      return kutu.width > 1 && kutu.height > 1 && stil.visibility !== 'hidden' && stil.display !== 'none';
    };
    const sec = (secici) => {
      try {
        return secici ? [...document.querySelectorAll(secici)] : [];
      } catch {
        return [];
      }
    };
    const alan = (e) => e.getBoundingClientRect().width * e.getBoundingClientRect().height;
    const isaretle = (ad, oge) => {
      for (const eski of document.querySelectorAll(`[${ad}]`)) eski.removeAttribute(ad);
      if (oge) oge.setAttribute(ad, '1');
    };
    const etiket = (e) => (e.getAttribute('aria-label') || e.getAttribute('title') || e.innerText || '').replace(/\s+/g, ' ').trim();
    const kapaliMi = (e) => e.disabled || e.getAttribute('aria-disabled') === 'true';

    // İstem kutusu
    let adaylar = sec(seciciler.istemKutusu).filter(gorunur);
    if (!adaylar.length) adaylar = sec('textarea, [contenteditable="true"]').filter((e) => gorunur(e) && !e.readOnly && !e.disabled);
    const kutu = adaylar.sort((a, b) => alan(b) - alan(a))[0] || null;
    isaretle('data-robot-kutu', kutu);

    const dugmeler = sec('button, [role="button"], a').filter(gorunur);
    const girisGerek =
      sec(seciciler.girisDugmesi).some(gorunur) ||
      dugmeler.some((e) => /^(oturum aç|giriş yap|log in|sign in)$/i.test(etiket(e)));
    const uretiliyor =
      sec(seciciler.durdurDugmesi).some(gorunur) ||
      dugmeler.some((e) => /durdur|stop/i.test(e.getAttribute('aria-label') || ''));

    // Yanıt tamamlanınca altında "Kopyala" gibi eylem düğmeleri belirir.
    const kopyalaSayisi = dugmeler.filter((e) => /kopyala|copy/i.test(e.getAttribute('aria-label') || '')).length;

    const gonder =
      sec(seciciler.gonderDugmesi).filter(gorunur)[0] ||
      dugmeler.find((e) => /gönder|send|submit/i.test(e.getAttribute('aria-label') || '') && !/geri bildirim|feedback/i.test(etiket(e))) ||
      null;
    isaretle('data-robot-gonder', gonder);
    // Ek yüklenip işlenirken gönder düğmesi yerinde durur ama etiketi "Dosya yüklemesi beklemede"
    // olur ve kapalı işaretlenmez; eklerde de "Processing..." yazar ya da (Gemini'de) bir ilerleme
    // göstergesi döner. Bu sürede düğme hazır sayılmaz.
    let kap = null;
    if (kutu) {
      kap = kutu.closest('form, fieldset');
      for (let i = 0, ust = kutu; !kap && i < 6 && ust.parentElement; i++) {
        ust = ust.parentElement;
        if (ust.querySelectorAll('button').length >= 2) kap = ust;
      }
    }
    const yuklemeSuruyor =
      dugmeler.some((e) => /yüklemesi beklemede|upload(ing| pending| in progress)/i.test(etiket(e))) ||
      /beklemede|pending|yükleniyor|uploading|processing|işleniyor/i.test(gonder ? etiket(gonder) : '') ||
      [...document.querySelectorAll('form *')].some(
        (e) => e.children.length === 0 && /^(processing|işleniyor|yükleniyor|uploading)/i.test((e.textContent || '').trim())
      ) ||
      Boolean(kap && [...kap.querySelectorAll('mat-progress-spinner, mat-spinner, mat-progress-bar')].some(gorunur));

    const kisa = (e) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${etiket(e) ? ` "${etiket(e).slice(0, 30)}"` : ''}`;
    return {
      kutuVar: Boolean(kutu),
      kutuMetni: kutu ? String(kutu.value !== undefined ? kutu.value : kutu.innerText).trim() : '',
      girisGerek,
      uretiliyor,
      kopyalaSayisi,
      gonderVar: Boolean(gonder),
      gonderEtkin: Boolean(gonder) && !kapaliMi(gonder) && !yuklemeSuruyor,
      yuklemeSuruyor,
      adres: location.href,
      // Bir şey bulunamadığında günlükte gösterilecek kısa özet.
      tani: {
        alanlar: sec('textarea, [contenteditable="true"]').filter(gorunur).map(kisa).slice(0, 5),
        dugmeler: dugmeler.filter((e) => e.tagName === 'BUTTON').map(kisa).slice(0, 14),
      },
    };
  }, s);
}

const taniMetni = (durum) => `alanlar=[${durum.tani.alanlar.join(', ')}] düğmeler=[${durum.tani.dugmeler.join(', ')}]`;

// Sayfadaki yeterince büyük ve yüklenmesi bitmiş resimlerin adresleri.
// Seçiciler verilirse eklenen referanslar sayılmaz: ek görseli olarak tanınan
// resimler ile (kullanıcı mesajı adresi sayfada varsa) son kullanıcı mesajının
// içindeki ya da ondan önce gelen resimler. "haricGorsel" seçicisine uyanlar da
// (Gemini'nin üretim sırasında gösterdiği ara taslaklar) sayılmaz. "uretilenGorsel" verilmişse
// yalnızca ona uyan resimler sayılır (Gemini'nin Resimler sayfasındaki örnek galerisi dışarıda kalır).
async function buyukGorseller(sayfa, enKucukPx, s) {
  return sayfa.evaluate(
    ({ px, kullanici, ek, haric, yalniz }) => {
      const sec = (secici) => {
        try {
          return secici ? [...document.querySelectorAll(secici)] : [];
        } catch {
          return [];
        }
      };
      const mesajlar = sec(kullanici);
      const sonKullanici = mesajlar.length ? mesajlar[mesajlar.length - 1] : null;
      const ekler = new Set([...sec(ek), ...sec(haric)]);
      const yalnizlar = yalniz ? new Set(sec(yalniz)) : null;
      const adresler = [];
      for (const resim of document.querySelectorAll('img')) {
        const adres = resim.currentSrc || resim.src;
        if (!adres || !resim.complete) continue;
        if (resim.naturalWidth < px || resim.naturalHeight < px) continue;
        if (ekler.has(resim) || (yalnizlar && !yalnizlar.has(resim))) continue;
        if (sonKullanici) {
          if (sonKullanici.contains(resim)) continue;
          if (sonKullanici.compareDocumentPosition(resim) & Node.DOCUMENT_POSITION_PRECEDING) continue;
        }
        if (!adresler.includes(adres)) adresler.push(adres);
      }
      return adresler;
    },
    { px: enKucukPx, kullanici: s ? s.kullaniciMesaji : '', ek: s ? s.ekGorseli : '', haric: s ? s.haricGorsel : '', yalniz: s ? s.uretilenGorsel : '' }
  );
}

// Sayfadaki yazıda istemden sonra gelen kısım: görsel gelmediğinde sitenin ne dediği.
async function istemdenSonrakiMetin(sayfa, istem) {
  try {
    return await sayfa.evaluate((metin) => {
      const tumu = document.body.innerText;
      const bas = tumu.lastIndexOf(metin.slice(0, 40));
      if (bas < 0) return '';
      return tumu.slice(bas + metin.length).replace(/\s+/g, ' ').trim().slice(0, 300);
    }, istem);
  } catch {
    return '';
  }
}

// İstem kutusu kullanılabilir olana kadar bekler. Giriş yapılmamışsa ya da bir
// doğrulama ekranı varsa kullanıcının tarayıcı penceresinde halletmesini bekler.
async function sohbetiHazirla(sayfa, ayar, gunluk) {
  const s = ayar.seciciler;
  const site = ayar.ad || 'ChatGPT';
  await sayfa.goto(ayar.adres, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const baslangic = Date.now();
  const sonZaman = baslangic + 10 * 60 * 1000;
  let uyari = '';
  let taniYazildi = false;
  let durum = null;
  while (Date.now() < sonZaman) {
    durum = await sayfaDurumu(sayfa, s).catch(() => null); // sayfa yenilenirken okunamayabilir
    if (durum && durum.kutuVar && !durum.girisGerek) {
      // Giriş bu bekleme sırasında yapıldıysa temiz bir sohbetle başla.
      if (uyari) {
        await sayfa.goto(ayar.adres, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await bekle(1500);
        durum = await sayfaDurumu(sayfa, s).catch(() => null);
        if (!durum || !durum.kutuVar) continue;
      }
      return;
    }
    // Sayfa ilk yüklenirken kutu birkaç saniye görünmeyebilir; hemen uyarma.
    if (Date.now() - baslangic > 6000 && durum) {
      const yeniUyari = durum.girisGerek
        ? `${site} için giriş yapılmamış görünüyor. Robotun tarayıcı penceresinde giriş yap; robot bekliyor…`
        : `${site} istem kutusu bulunamadı. Tarayıcı penceresinde bir doğrulama ya da uyarı varsa geç; robot bekliyor…`;
      if (yeniUyari !== uyari) {
        gunluk(yeniUyari);
        uyari = yeniUyari;
      }
      if (!durum.girisGerek && !taniYazildi && Date.now() - baslangic > 20000) {
        gunluk(`  Tanı: ${taniMetni(durum)}`);
        taniYazildi = true;
      }
    }
    await bekle(1500);
  }
  throw new Error(`${site} istem kutusu 10 dakika içinde hazır olmadı.${durum ? ` Tanı: ${taniMetni(durum)}` : ''}`);
}

// Sayfada dosya alanı yoksa onu ortaya çıkarır. ChatGPT'de alanlar sayfa hazır olunca kendiliğinden
// gelir; Gemini'de ise yalnızca istem kutusunun yanındaki "+" (Yükleme ve araçlar) menüsü açılınca
// eklenir ve menü kapansa da sayfada kalır. Önce ayardaki menü düğmesi, birkaç saniye içinde alan
// gelmezse istem kutusunun yanında etiketinde "yükle / upload / ekle" geçen düğme denenir.
async function dosyaAlanlariniAc(sayfa, s) {
  const alanSayisi = () => sayfa.evaluate(() => document.querySelectorAll('input[type="file"]').length).catch(() => 0);
  const baslangic = Date.now();
  let sonTiklama = 0;
  while (Date.now() - baslangic < 20000) {
    if (await alanSayisi()) return;
    const genelDene = Date.now() - baslangic > 8000;
    if (Date.now() - sonTiklama > 3000) {
      await sayfaDurumu(sayfa, s).catch(() => null);
      const bulundu = await sayfa
        .evaluate(
          ({ secici, genel }) => {
            const gorunur = (e) => e.getBoundingClientRect().width > 1 && getComputedStyle(e).visibility !== 'hidden';
            let dugme = null;
            try {
              dugme = secici ? [...document.querySelectorAll(secici)].find(gorunur) : null;
            } catch {
              dugme = null;
            }
            const kutu = document.querySelector('[data-robot-kutu]');
            if (!dugme && genel && kutu) {
              let kap = kutu.closest('form, fieldset');
              for (let i = 0, ust = kutu; !kap && i < 6 && ust.parentElement; i++) {
                ust = ust.parentElement;
                if (ust.querySelectorAll('button').length >= 2) kap = ust;
              }
              dugme = [...(kap || document).querySelectorAll('button')].find(
                (b) => gorunur(b) && /yükle|upload|dosya ekle|ekle|add (files|photos)|attach/i.test(b.getAttribute('aria-label') || '') && !/drive/i.test(b.getAttribute('aria-label') || '')
              );
            }
            for (const eski of document.querySelectorAll('[data-robot-menu]')) eski.removeAttribute('data-robot-menu');
            if (!dugme) return false;
            dugme.setAttribute('data-robot-menu', '1');
            return true;
          },
          { secici: s.yuklemeMenusu, genel: genelDene }
        )
        .catch(() => false);
      if (bulundu) {
        await sayfa.locator('[data-robot-menu]').click({ timeout: 3000 }).catch(() => null);
        sonTiklama = Date.now();
        for (let i = 0; i < 10 && !(await alanSayisi()); i++) await bekle(300);
        // Açılan menü kapatılır; alanlar sayfada kalır.
        await sayfa.keyboard.press('Escape').catch(() => null);
        await bekle(400);
        if (await alanSayisi()) return;
      }
    }
    await bekle(500);
  }
}

// İstem kutusunun ve dosya alanlarının yerine oturmasını bekler. ChatGPT sayfayı önce geçici bir
// kabukla çizer; dosya alanları bu kabukta da belirir ama oraya verilen dosyalar, birkaç saniye
// sonra asıl kutu (bir form içinde) çizilince kaybolur. Bu yüzden dosya alanları belirdikten sonra
// kutu bir süre değişmeden kalmalı: form içindeyse 1 sn, değilse 4 sn. Dosya alanı var mı döndürür.
async function kutuOturana(sayfa, s, enFazlaMs = 30000) {
  const sonZaman = Date.now() + enFazlaMs;
  let oncekiImza = '';
  let ayniSuredir = null;
  let alanVar = false;
  while (Date.now() < sonZaman) {
    await sayfaDurumu(sayfa, s).catch(() => null); // yeniden çizilen kutuyu yeniden işaretler
    const durum = await sayfa
      .evaluate(() => {
        const kutu = document.querySelector('[data-robot-kutu]');
        const alanlar = [...document.querySelectorAll('input[type="file"]')];
        if (!kutu) return { imza: 'kutu yok', alan: alanlar.length, formda: false };
        if (!kutu.hasAttribute('data-robot-kimlik')) kutu.setAttribute('data-robot-kimlik', Math.random().toString(36).slice(2));
        const formda = Boolean(kutu.closest('form'));
        return { imza: `${kutu.getAttribute('data-robot-kimlik')}|${formda}|${alanlar.map((e) => e.id).join(',')}`, alan: alanlar.length, formda };
      })
      .catch(() => ({ imza: 'okunamadı', alan: 0, formda: false }));
    alanVar = durum.alan > 0;
    if (durum.imza !== oncekiImza) {
      oncekiImza = durum.imza;
      ayniSuredir = Date.now();
    } else if (alanVar && Date.now() - ayniSuredir >= (durum.formda ? 1000 : 4000)) {
      return true;
    }
    await bekle(500);
  }
  return alanVar;
}

// İstem kutusunun çevresindeki ek izleri: önizleme resimleri, dosya kartları ve "kaldır" /
// "eki kapat" düğmeleri (Gemini ekleri resimsiz kartlar olarak gösterir).
async function ekIzleri(sayfa, s) {
  await sayfaDurumu(sayfa, s).catch(() => null); // kutu yeniden çizildiyse yeniden işaretlenir
  return sayfa
    .evaluate(() => {
      const kutu = document.querySelector('[data-robot-kutu]');
      if (!kutu) return 0;
      let kap = kutu.closest('form, fieldset');
      for (let i = 0, ust = kutu; !kap && i < 6 && ust.parentElement; i++) {
        ust = ust.parentElement;
        if (ust.querySelectorAll('button').length >= 2) kap = ust;
      }
      kap = kap || kutu.parentElement || kutu;
      const ogeler = [...kap.querySelectorAll('*')];
      return (
        kap.querySelectorAll('img').length +
        ogeler.filter((e) => /url\(/.test(getComputedStyle(e).backgroundImage)).length +
        ogeler.filter((e) => /kaldır|remove|sil\b|kapat|close/i.test(e.getAttribute('aria-label') || '')).length +
        kap.querySelectorAll('[class*="file-preview"]').length
      );
    })
    .catch(() => 0);
}

// Sayfadaki uyarı / bildirim yazıları (ör. dosya yükleme sınırı); hata iletisine eklenir.
async function sayfaUyarilari(sayfa) {
  return sayfa
    .evaluate(() =>
      [...document.querySelectorAll('[role="alert"], [role="status"], [data-testid*="toast"], [class*="toast"]')]
        .map((e) => e.innerText.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join(' | ')
        .slice(0, 300)
    )
    .catch(() => '');
}

// Referans görselleri sayfadaki dosya yükleme alanına verir, istem kutusunda göründüklerini
// doğrular ve yüklenmelerini bekler. Görünmezlerse bir kez daha dener; yine olmazsa referanssız
// göndermek yerine hata verir.
async function referanslariEkle(sayfa, s, referanslar, gorunmeMs = 20000, site = 'ChatGPT') {
  // Sitenin dosya yükleme isteği de eklerin alındığını gösterir (önizleme tanınamazsa diye).
  let yukleme = 0;
  const yanitDinle = (yanit) => {
    const istek = yanit.request();
    if (istek.method() !== 'GET' && /file|upload|attachment/i.test(istek.url()) && yanit.ok()) yukleme++;
  };
  sayfa.on('response', yanitDinle);
  try {
    for (let deneme = 1; ; deneme++) {
      const once = yukleme;
      const ekTabani = await referanslariVer(sayfa, s, referanslar);
      const sonZaman = Date.now() + gorunmeMs;
      let goruldu = false;
      while (!goruldu && Date.now() < sonZaman) {
        await bekle(500);
        goruldu = (await ekIzleri(sayfa, s)) > ekTabani || yukleme > once;
      }
      if (goruldu) break;
      if (deneme >= 2) {
        const uyari = await sayfaUyarilari(sayfa);
        throw new Error(`Referans görseller ${site} sayfasına eklenemedi (istem kutusunda görünmediler).${uyari ? ` Sayfadaki uyarı: "${uyari}"` : ''}`);
      }
    }
  } finally {
    sayfa.off('response', yanitDinle);
  }

  // Yükleme bitene kadar gönder düğmesi kapalı kalır; düğme tanınamıyorsa sabit süre beklenir.
  await bekle(2500);
  const sonZaman = Date.now() + 180000;
  let durum = await sayfaDurumu(sayfa, s);
  // Yükleme sürerken ChatGPT gönder düğmesi yerine "Dosya yüklemesi beklemede" düğmesini gösterir;
  // yavaş ya da kopup gelen bağlantıda bu dakikalar sürebilir. Gönder düğmesi belirene kadar bekle.
  while (!durum.gonderVar && Date.now() < sonZaman) {
    await bekle(1000);
    durum = await sayfaDurumu(sayfa, s);
  }
  if (!durum.gonderVar) {
    await bekle(6000);
    return;
  }
  while (Date.now() < sonZaman && !durum.gonderEtkin) {
    await bekle(700);
    durum = await sayfaDurumu(sayfa, s);
  }
  if (!durum.gonderEtkin) throw new Error('Referans görselin yüklenmesi bitmedi.');
}

// Kutu yerine oturunca uygun dosya alanını seçer ve dosyaları verir.
async function referanslariVer(sayfa, s, referanslar) {
  await dosyaAlanlariniAc(sayfa, s);
  await kutuOturana(sayfa, s);
  const bulundu = await sayfa.evaluate(({ secici, coklu }) => {
    let adaylar = [];
    try {
      adaylar = [...document.querySelectorAll(secici)];
    } catch {
      adaylar = [];
    }
    if (!adaylar.length) adaylar = [...document.querySelectorAll('input[type="file"]')];
    const kimlik = (e) => `${e.id} ${e.name} ${e.accept || ''}`;
    // Kamera alanı değil, görsel (yoksa dosya) alanı tercih edilir. Birden çok dosya
    // verilecekse yalnızca tek dosya alan alanlar elenir (aksi hâlde yükleme hata verir).
    const puan = (e) =>
      (/camera|kamera/i.test(kimlik(e)) || e.hasAttribute('capture') ? -1 : /photo|image|gorsel/i.test(kimlik(e)) ? 2 : /file|upload/i.test(kimlik(e)) ? 1 : 0) +
      (coklu && e.multiple ? 4 : 0);
    const secilen = adaylar.sort((a, b) => puan(b) - puan(a))[0];
    for (const eski of document.querySelectorAll('[data-robot-dosya]')) eski.removeAttribute('data-robot-dosya');
    if (!secilen) return false;
    secilen.setAttribute('data-robot-dosya', '1');
    return true;
  }, { secici: s.dosyaGirdisi, coklu: referanslar.length > 1 });
  if (!bulundu) throw new Error('Referans görsel eklenecek alan sayfada bulunamadı.');

  const ekTabani = await ekIzleri(sayfa, s);
  try {
    await sayfa.locator('[data-robot-dosya]').setInputFiles(referanslar, { timeout: 15000 });
  } catch (hata) {
    throw new Error(`Referans görsel eklenemedi (${String(hata.message).split('\n')[0]}).`);
  }
  return ekTabani;
}

async function istemiGonder(sayfa, istem, s, referanslar, ekGorunmeMs, site = 'ChatGPT') {
  const kutu = sayfa.locator('[data-robot-kutu]');
  // ChatGPT istem kutusunu sayfa yüklenirken yeniden çizebilir; işaretli kutu kaybolursa yeniden bulunur.
  // Tıklama, pencere arkadayken (sayfa kare çizmezken) takılabildiği için olmazsa kutuya odaklanılır.
  const kutuyuDoldur = async () => {
    for (let deneme = 1; ; deneme++) {
      try {
        await sayfaDurumu(sayfa, s);
        await kutu.click({ timeout: 3000 }).catch(() => kutu.focus({ timeout: 3000 }));
        await kutu.fill(istem, { timeout: 5000 });
        return;
      } catch (hata) {
        if (deneme >= 4) throw hata;
        await bekle(1500);
      }
    }
  };
  await kutuyuDoldur();
  if (referanslar.length) {
    await referanslariEkle(sayfa, s, referanslar, ekGorunmeMs, site);
    // Ekleme sırasında kutu yeniden çizildiyse yazı kaybolmuş olabilir.
    if (!(await sayfaDurumu(sayfa, s)).kutuMetni) await kutuyuDoldur();
  }
  await bekle(600); // gönder düğmesi yazı girilince belirir

  const oncekiAdres = sayfa.url();
  // Ekler sunucuda işlenirken basılan gönder, mesajı "Dosya yüklemesi beklemede" durumunda sıraya
  // alır; yavaş bağlantıda bu dakikalar sürebilir. Bu sürede başka yol denenmez, mesajın gitmesi beklenir.
  const gonderildiMi = async () => {
    const sonZaman = Date.now() + 180000;
    for (let i = 0; ; i++) {
      await bekle(500);
      const durum = await sayfaDurumu(sayfa, s).catch(() => null);
      if (durum && (!durum.kutuMetni || durum.adres !== oncekiAdres)) return true;
      if ((i >= 5 && !(durum && durum.yuklemeSuruyor)) || Date.now() > sonZaman) return false;
    }
  };

  // Hangisinin çalıştığı arayüze göre değişir; istem kutusu boşalana kadar sırayla denenir.
  const yontemler = [
    async () => {
      const durum = await sayfaDurumu(sayfa, s);
      if (!durum.gonderEtkin) return false;
      await sayfa.locator('[data-robot-gonder]').click({ timeout: 3000 });
      return true;
    },
    async () => (await kutu.press('Enter'), true),
    async () => (await kutu.press('Control+Enter'), true),
    // Son çare: istem kutusunun bulunduğu çubuktaki en sağdaki düğme.
    async () => {
      const bulundu = await sayfa.evaluate(() => {
        const gorunur = (e) => e.getBoundingClientRect().width > 1 && getComputedStyle(e).visibility !== 'hidden';
        let kap = document.querySelector('[data-robot-kutu]');
        for (let i = 0; kap && i < 6; i++) {
          kap = kap.parentElement;
          const dugmeler = kap ? [...kap.querySelectorAll('button')].filter((d) => gorunur(d) && !d.disabled) : [];
          if (dugmeler.length >= 2) {
            const enSag = dugmeler.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
            for (const eski of document.querySelectorAll('[data-robot-gonder]')) eski.removeAttribute('data-robot-gonder');
            enSag.setAttribute('data-robot-gonder', '1');
            return true;
          }
        }
        return false;
      });
      if (!bulundu) return false;
      await sayfa.locator('[data-robot-gonder]').click({ timeout: 3000 });
      return true;
    },
  ];
  for (const yontem of yontemler) {
    const denendi = await yontem().catch(() => false);
    if (denendi && (await gonderildiMi())) return;
  }
  const durum = await sayfaDurumu(sayfa, s);
  throw new Error(`İstem gönderilemedi (gönder düğmesi bulunamadı). Tanı: ${taniMetni(durum)}`);
}

// Sitenin (ChatGPT / Gemini) eklenen referanslara erişemediğini söylediği yanıtlar.
const REFERANS_SORUNU = /eri[şs]emedi|eri[şs]emiyor|eri[şs]ilemedi|yeniden yükle|tekrar yükle|göremiyorum|görüntüleyemiyorum|can(no|')t (access|see|view)|could(n't| not) (access|see|load|open)|unable to (access|see|load)|re-?upload|upload (it|them) again/i;

// Gönderimden sonra beliren görsel(ler)in adreslerini döndürür.
// Yanıt görselsiz biterse ve "yanitla" verilmişse sohbete bir kez yanıt yazıp beklemeyi sürdürür.
// Referanslı bir istemde ChatGPT referanslara erişemediğini söylerse ısrar edilmez (ısrar,
// referanssız bir görsel ürettirir); iş hatayla biter ve yeni bir sohbette yeniden denenir.
async function gorseliBekle(sayfa, oncekiler, istem, ayar, yanitla, referansli = false) {
  const s = ayar.seciciler;
  // Gemini yanıtında ara taslaklar da kalabilir; "tekGorsel" ayarında yalnızca en son beliren alınır.
  const sonuc = (yeniler) => (ayar.tekGorsel ? yeniler.slice(-1) : yeniler);
  const baslangic = Date.now();
  const sonZaman = baslangic + ayar.gorselBeklemeDakika * 60 * 1000;
  const metinSonrasiMs = ayar.metinSonrasiSaniye * 1000;
  // Gönderimin hemen ardından beliren büyük resimler üretilen görsel olamaz;
  // bunlar kullanıcının mesajındaki referanslardır ve sayılmaz.
  const ekSuresiMs = (ayar.ekBeklemeSaniye === undefined ? 5 : ayar.ekBeklemeSaniye) * 1000;
  const gorulenler = new Set(oncekiler);
  for (const adres of await buyukGorseller(sayfa, ayar.enKucukGorselPx, s)) gorulenler.add(adres);

  let sonMesaj = istem;
  let kalanYanit = yanitla ? (ayar.sorarsaDeneme === undefined ? 1 : ayar.sorarsaDeneme) : 0;
  let kopyalaTabani = ((await sayfaDurumu(sayfa, s).catch(() => null)) || { kopyalaSayisi: 0 }).kopyalaSayisi;
  let sonDurum = '';
  let sonDegisim = Date.now();
  let uretimGoruldu = false; // "durdur" düğmesi görüldü
  let bitisGoruldu = false; // yanıtın bittiği bir işaretten anlaşıldı
  let uretimBitti = null;

  while (Date.now() < sonZaman) {
    const ekAsamasi = Date.now() - baslangic < ekSuresiMs;
    await bekle(ekAsamasi ? 250 : 1500);
    const durum = await sayfaDurumu(sayfa, s).catch(() => null);
    if (!durum) continue;
    const simdiki = await buyukGorseller(sayfa, ayar.enKucukGorselPx, s);
    if (ekAsamasi) {
      for (const adres of simdiki) gorulenler.add(adres);
      kopyalaTabani = Math.max(kopyalaTabani, durum.kopyalaSayisi);
      if (durum.uretiliyor) uretimGoruldu = true;
      continue;
    }
    const yeniler = simdiki.filter((adres) => !gorulenler.has(adres));

    const imza = yeniler.join('\n');
    if (imza !== sonDurum) {
      sonDurum = imza;
      sonDegisim = Date.now();
    }

    if (durum.uretiliyor) {
      uretimGoruldu = true;
      uretimBitti = null;
      // "Üretiliyor" işareti yanlış tanınıp hiç sönmese bile uzun süredir değişmeyen görsel kabul edilir.
      if (yeniler.length && Date.now() - sonDegisim >= (ayar.uzunKararliSaniye || 60) * 1000) return sonuc(yeniler);
      continue;
    }
    // Yanıt bitti: ya "durdur" düğmesi söndü ya da yanıtın altında "Kopyala" düğmesi belirdi.
    if (uretimGoruldu || durum.kopyalaSayisi > kopyalaTabani) bitisGoruldu = true;
    if (bitisGoruldu && uretimBitti === null) uretimBitti = Date.now();

    // Bitiş hiç anlaşılamadıysa görselin tamamlandığından emin olmak için daha uzun beklenir.
    const kararliMs = (bitisGoruldu ? ayar.kararliSaniye : Math.max(ayar.kararliSaniye, ayar.isaretsizKararliSaniye || 25)) * 1000;
    if (yeniler.length && Date.now() - sonDegisim >= kararliMs) return sonuc(yeniler);

    // Yanıt bitti ama görsel yok: ChatGPT yalnızca yazıyla yanıt vermiş (soru sormuş olabilir).
    if (!yeniler.length && uretimBitti !== null && Date.now() - uretimBitti >= metinSonrasiMs) {
      if (referansli) {
        const metin = await istemdenSonrakiMetin(sayfa, sonMesaj);
        if (REFERANS_SORUNU.test(metin)) throw new Error(`${ayar.ad || 'ChatGPT'} referans görsellere erişemediğini söyledi: "${metin}"`);
      }
      if (kalanYanit <= 0) break;
      kalanYanit--;
      sonMesaj = await yanitla();
      const sonrasi = await sayfaDurumu(sayfa, s).catch(() => null);
      kopyalaTabani = sonrasi ? sonrasi.kopyalaSayisi : kopyalaTabani;
      uretimGoruldu = false;
      bitisGoruldu = false;
      uretimBitti = null;
      sonDegisim = Date.now();
    }
  }

  const metin = await istemdenSonrakiMetin(sayfa, sonMesaj);
  // Yanıtın bittiği hiç anlaşılamadıysa sayfadaki düğmeler de yazılır; arayüz değişmiş olabilir.
  const sonDurumu = bitisGoruldu ? null : await sayfaDurumu(sayfa, s).catch(() => null);
  throw new Error(`Görsel gelmedi.${metin ? ` ${ayar.ad || 'ChatGPT'} yanıtı: "${metin}"` : ''}${sonDurumu ? ` Tanı: ${taniMetni(sonDurumu)}` : ''}`);
}

function uzantiBul(bayt) {
  if (bayt.length >= 4 && bayt[0] === 0x89 && bayt[1] === 0x50 && bayt[2] === 0x4e && bayt[3] === 0x47) return 'png';
  if (bayt.length >= 3 && bayt[0] === 0xff && bayt[1] === 0xd8 && bayt[2] === 0xff) return 'jpg';
  if (bayt.length >= 12 && bayt.toString('latin1', 0, 4) === 'RIFF' && bayt.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (bayt.length >= 4 && bayt.toString('latin1', 0, 4) === 'GIF8') return 'gif';
  return null;
}

// Bir adresteki görselin baytlarını önce sayfanın içinden, olmazsa tarayıcının çerezleriyle indirir.
async function baytlariIndir(sayfa, adres) {
  try {
    const b64 = await sayfa.evaluate(async (a) => {
      const yanit = await fetch(a);
      if (!yanit.ok) throw new Error(String(yanit.status));
      const veri = new Uint8Array(await yanit.arrayBuffer());
      let ikili = '';
      for (let i = 0; i < veri.length; i += 0x8000) ikili += String.fromCharCode(...veri.subarray(i, i + 0x8000));
      return btoa(ikili);
    }, adres);
    const bayt = Buffer.from(b64, 'base64');
    const uzanti = uzantiBul(bayt);
    if (uzanti) return { bayt, uzanti };
  } catch {
    /* sıradaki yola geç */
  }

  if (/^https?:/.test(adres)) {
    try {
      const yanit = await sayfa.context().request.get(adres, { timeout: 60000 });
      if (yanit.ok()) {
        const bayt = await yanit.body();
        const uzanti = uzantiBul(bayt);
        if (uzanti) return { bayt, uzanti };
      }
    } catch {
      /* sıradaki yola geç */
    }
  }
  return null;
}

// Sayfadaki resmi bir tuvale çizip PNG olarak alır (özgün çözünürlükte). Gemini görselleri blob:
// adresindedir ve sitenin güvenlik kuralı (CSP) sayfa içinden okunmalarına izin vermez; tuval verir.
async function tuvaldenAl(sayfa, adres) {
  try {
    const b64 = await sayfa.evaluate((a) => {
      const resim = [...document.querySelectorAll('img')].find((r) => (r.currentSrc || r.src) === a);
      if (!resim || !resim.naturalWidth) return null;
      const tuval = document.createElement('canvas');
      tuval.width = resim.naturalWidth;
      tuval.height = resim.naturalHeight;
      tuval.getContext('2d').drawImage(resim, 0, 0);
      return tuval.toDataURL('image/png').split(',')[1];
    }, adres);
    return b64 ? { bayt: Buffer.from(b64, 'base64'), uzanti: 'png' } : null;
  } catch {
    return null; // başka kaynaktan gelen resim tuvali "kirletir"; okunamaz
  }
}

// Görselin baytlarını sırayla dener: 1) sayfanın içinden indir, 2) tarayıcının çerezleriyle
// indir, 3) tuvale çizip al, 4) olmazsa ekrandaki görselin fotoğrafını çek (çözünürlük düşük olabilir).
async function gorseliIndir(sayfa, adres, gunluk) {
  const sonuc = (await baytlariIndir(sayfa, adres)) || (await tuvaldenAl(sayfa, adres));
  if (sonuc) return sonuc;

  gunluk('  Görsel dosyası indirilemedi, ekran görüntüsü alınıyor (çözünürlük düşük olabilir).');
  const sirasi = await sayfa.evaluate((a) => {
    const resimler = [...document.querySelectorAll('img')];
    return resimler.findIndex((r) => (r.currentSrc || r.src) === a);
  }, adres);
  if (sirasi < 0) throw new Error('Görsel sayfadan kayboldu, kaydedilemedi.');
  const bayt = await sayfa.locator('img').nth(sirasi).screenshot({ type: 'png' });
  return { bayt, uzanti: 'png' };
}

// Tek bir istem için yeni sohbet açar, (varsa) referans görselleri ekler,
// görseli üretir ve baytlarını döndürür.
// sirayla: aynı anda birden çok sekmede üretilirken yazma/gönderme adımlarını sıraya koyan kilit.
// ChatGPT yeni sohbet taslağını sekmeler arasında paylaştığı için iki sekme aynı anda yazmamalı;
// görselin beklenmesi ve indirilmesi kilit dışında, aynı anda yürür.
async function gorselUret(sayfa, istem, ayarlar, gunluk, referanslar = [], sirayla = (is) => is()) {
  const ayar = { ad: 'ChatGPT', ...ayarlar, seciciler: { ...VARSAYILAN_SECICILER, ...ayarlar.seciciler } };
  for (const dosya of referanslar) {
    if (!fs.existsSync(dosya)) throw new Error(`Referans görsel bulunamadı: ${dosya}`);
  }
  let oncekiler = [];
  await sirayla(async () => {
    await sohbetiHazirla(sayfa, ayar, gunluk);
    oncekiler = await buyukGorseller(sayfa, ayar.enKucukGorselPx, null);
    await istemiGonder(sayfa, istem, ayar.seciciler, referanslar, (ayar.ekGorunmeSaniye || 20) * 1000, ayar.ad);
  });
  gunluk('  İstem gönderildi, görsel bekleniyor…');

  // ChatGPT görsel üretmek yerine soru sorar ya da onay beklerse robot bu yanıtı kendisi verir.
  const yanitMetni = ayar.sorarsaYanit === undefined ? "Evet, başla. Yukarıdaki mesajımdaki istemi ve ekli referans görselleri kullanarak o tek görseli şimdi üret; başka soru sorma. Bu sohbette yukarıda bir görsel istemi yoksa görsel üretme, yalnızca 'istem yok' yaz." : ayar.sorarsaYanit;
  const yanitla = yanitMetni
    ? async () => {
        gunluk(`  ${ayar.ad} görsel yerine yazıyla yanıt verdi; "${yanitMetni}" yanıtı gönderiliyor.`);
        await sirayla(async () => {
          await sayfaDurumu(sayfa, ayar.seciciler);
          await istemiGonder(sayfa, yanitMetni, ayar.seciciler, [], undefined, ayar.ad);
        });
        return yanitMetni;
      }
    : null;
  const adresler = await gorseliBekle(sayfa, oncekiler, istem, ayar, yanitla, referanslar.length > 0);
  const gorseller = [];
  for (const adres of adresler) gorseller.push(await gorseliIndir(sayfa, adres, gunluk));
  return gorseller;
}

module.exports = { gorselUret };
