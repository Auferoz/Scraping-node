// scrapers/wom.js
const { chromium } = require('playwright');

function norm(t = '') { return (t || '').replace(/\s+/g, ' ').trim(); }
function digits(t = '') { return (t || '').replace(/\D/g, '') || ''; }

async function safeGoto(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    return;
  } catch (_) { }
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
}

function inferTipoCampaña(u) {
  if (/portabilidad/i.test(u) && /grupales/i.test(u)) return 'Portabilidad Grupal';
  if (/portabilidad/i.test(u)) return 'Portabilidad';
  if (/linea-nueva/i.test(u) && /grupales/i.test(u)) return 'Línea nueva Grupal';
  if (/linea-nueva/i.test(u)) return 'Línea nueva';
  return 'Movil';
}

function isHogarURL(u = '') {
  return /\/hogar\//i.test(u);
}

async function newContext() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/123.0.0.0 Safari/537.36',
    locale: 'es-CL',
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'language', { get: () => 'es-CL' });
    Object.defineProperty(navigator, 'languages', { get: () => ['es-CL', 'es'] });
  });

  return { browser, context };
}

async function commonPrep(page, url) {
  // Bloquear recursos pesados
  await page.route('**/*', (route) => {
    const reqUrl = route.request().url();
    if (/\.(png|jpe?g|webp|gif|svg|mp4|webm|woff2?|ttf)$/i.test(reqUrl)) {
      return route.abort();
    }
    return route.continue();
  });

  await safeGoto(page, url);

  // Aceptar cookies si aparece
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button, a')].find(b =>
      /acept(ar|o)|accept|entendido|ok/i.test(b.textContent || '')
    );
    btn?.click();
  }).catch(() => { });

  // Forzar hash (secciones SPA como #fibra-optica o #internet-y-tv-online)
  try {
    const hash = new URL(url).hash;
    if (hash) {
      await page.evaluate(h => { if (location.hash !== h) location.hash = h; }, hash);
    }
  } catch { }

  // Scroll para cargar lazy content
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let y = 0;
      const step = 600;
      const max = () => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      const id = setInterval(() => {
        y = Math.min(y + step, max());
        window.scrollTo(0, y);
        if (y >= max()) { clearInterval(id); resolve(); }
      }, 120);
    });
  });
}

/* =======================
   SCRAPE MOVIL
======================= */
async function scrapeMovil(page, url, fullDateTime) {
  // Esperar cards
  await page.waitForSelector('[class*="PlanItemCard-module--wrapper"]', {
    timeout: 30000,
    state: 'attached',
  });

  const tipoCampaña = inferTipoCampaña(url);

  return await page.$$eval(
    '[class*="PlanItemCard-module--wrapper"]',
    (cards, extra) => {
      const out = [];
      const norm = t => (t || '').replace(/\s+/g, ' ').trim();
      const digits = t => (t || '').replace(/\D/g, '') || '';

      cards.forEach(el => {
        const nameTxt = norm(el.querySelector('[class*="PlanItem-module--name"]')?.textContent || '');

        // Gigas: "150 Gigas" o "Gigas Libres(+)"
        let gigas = '';
        const m = nameTxt.match(/(\d+)\s*Gigas/i);
        if (m) gigas = `${m[1]} GB`;
        else if (/Gigas\s*Libres/i.test(nameTxt))
          gigas = nameTxt.replace(/.*?(Gigas\s*Libres\+?)/i, '$1');

        // Precio oferta
        const priceTxt = norm(el.querySelector('[class*="PlanItem-module--price"]')?.textContent || '');
        const precioOferta = digits(priceTxt);

        // Precio normal (texto “luego $YY.YYY”)
        const subRight = norm(el.querySelector('[class*="PlanItem-module--subTitleRight"]')?.textContent || '');
        const laterMatch = subRight.match(/luego\s*\$([\d\.]+)/i);
        const precioNormal = laterMatch ? laterMatch[1].replace(/\./g, '') : '';

        // Descuento/tag
        const offerPct = norm(el.querySelector('[class*="offerContainer"] p, .dinamicTextGradient')?.textContent || '');
        const offerTag = norm(el.querySelector('[class*="portabilityOfferTag"]')?.textContent || '');
        const descuento = [offerPct, offerTag].filter(Boolean).join(' | ');

        // Beneficios visibles
        const beneficio1 = norm(el.querySelector('[class*="womLifeTitle"]')?.textContent || '');
        const beneficio2 = norm(el.querySelector('[class*="womLifeDescription"]')?.textContent || '');
        const beneficios = [beneficio1, beneficio2].filter(Boolean).join(' | ');

        if (nameTxt || precioOferta) {
          out.push({
            Companie: 'WOM',
            Nombre: nameTxt,
            Gigas: gigas,
            PrecioOferta: precioOferta,
            PrecioNormal: precioNormal,
            Descuento: descuento,
            Beneficios: beneficios,
            TipoCampaña: extra.tipoCampaña,
            Categoria: 'Movil',
            URL: extra.url,
            Fecha: extra.fullDateTime,
          });
        }
      });

      return out;
    },
    { url, fullDateTime, tipoCampaña }
  );
}

/* =======================
   SCRAPE HOGAR (Fibra / Internet+TV)
======================= */
async function scrapeHogar(page, url, fullDateTime, categoria) {
  // La lista usa clases con hash, así que buscamos por fragmento
  await page.waitForSelector('ul[class*="fibraPlanList"]', { timeout: 25000 });

  return await page.$$eval(
    'ul[class*="fibraPlanList"] li, ul[class*="fibraPlanList"] div[class*="fiberWrapper"], ul[class*="fibraPlanList"] div[class*="customCard"], ul[class*="fibraPlanList"] div[class*="cardWithoutZapping"]',
    (cards, { url, fullDateTime, categoria }) => {
      const pickText = (root, selArr) => {
        for (const sel of selArr) {
          const el = root.querySelector(sel);
          if (el && el.textContent) return el.textContent.trim();
        }
        return '';
      };

      const pickAttr = (root, sel, attr) => {
        const el = root.querySelector(sel);
        return el ? el.getAttribute(attr) || '' : '';
      };

      const moneyToDigits = (s = '') => (s || '').replace(/[^\d]/g, '');

      return cards.map(card => {
        // Título: "Plan Internet Fibra" / "Plan + TV Fútbol"
        const titulo = pickText(card, ['p[class*="nameTitle"]']);

        // Velocidad: "800 Megas" / "940 Megas"
        const velocidad = pickText(card, ['p[class*="name--"]']);

        // Precio oferta: "$16.990"
        const precioOferta = pickText(card, ['p[class*="price--"]']);

        // Precio normal desde “mes 13 pagas $24.990” (o “mes 7…”)
        const adicional = pickText(card, ['p[class*="aditionalMonth"]']);
        const matchNormal = (adicional.match(/\$[\d\.]+/) || [])[0] || '';

        // Descuento: “xx% dcto …”
        const descuento = pickText(card, ['div[class*="bannerHeader"] p']);

        // Beneficios: TV/Canales o “Incluye Asistencia full …”
        const beneficios = pickText(card, [
          'div[class*="ChannelDescription"]',
          'p[class*="womLifeTitle"]',
          'div[class*="benefitBox"]',
        ]);

        // Link detalle (absoluto)
        let href = pickAttr(card, 'a[class*="linkGatsby"]', 'href');
        if (href && !/^https?:\/\//.test(href)) href = 'https://store.wom.cl' + href;

        const nombreArmado = [titulo, velocidad].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

        if (!precioOferta && !velocidad) return null;

        return {
          Companie: 'WOM',
          Nombre: nombreArmado || titulo || '',
          Gigas: '', // no aplica en hogar
          PrecioOferta: moneyToDigits(precioOferta),
          PrecioNormal: moneyToDigits(matchNormal),
          Descuento: descuento,
          Beneficios: beneficios,
          TipoCampaña: 'Hogar',
          Categoria: categoria,
          URL: url,
          LinkDetalle: href || url,
          Fecha: fullDateTime,
        };
      }).filter(Boolean);
    },
    { url, fullDateTime, categoria }
  );
}

/* =======================
   ENTRADA ÚNICA
======================= */
async function scrape(url, categoria, fullDateTime) {
  const { browser, context } = await newContext();
  const page = await context.newPage();

  try {
    await commonPrep(page, url);

    if (categoria === 'Movil' && !isHogarURL(url)) {
      return await scrapeMovil(page, url, fullDateTime);
    }

    if (categoria === 'Hogar' || isHogarURL(url)) {
      return await scrapeHogar(page, url, fullDateTime, 'Hogar');
    }

    // fallback: intenta ambos y concatena resultados únicos
    const [movil, hogar] = await Promise.allSettled([
      scrapeMovil(page, url, fullDateTime),
      scrapeHogar(page, url, fullDateTime, 'Hogar'),
    ]);
    const a = movil.status === 'fulfilled' ? movil.value : [];
    const b = hogar.status === 'fulfilled' ? hogar.value : [];
    return [...a, ...b];
  } finally {
    await context.close();
    await browser.close();
  }
}

module.exports = { scrape };
