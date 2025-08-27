// scrapers/movistar.js
const { chromium } = require('playwright');
const cheerio = require('cheerio');
const axios = require('axios');
const https = require('https');

const agent = new https.Agent({ rejectUnauthorized: false });

function norm(t = '') { return t.replace(/\s+/g, ' ').trim(); }
function digits(t = '') { return (t || '').toString().replace(/\D+/g, '') || ''; }

// Nueva función para extraer solo el precio principal
function extractMainPrice($, priceElement) {
    if (!priceElement || !priceElement.length) return '';
    
    // Obtener solo el texto directo del elemento, sin elementos hijos
    const directText = priceElement.clone().children().remove().end().text().trim();
    
    // Si hay texto directo (caso: <p>$33.990 <span>al mes</span></p> o <div>$28.480<span>...</span></div>)
    if (directText) {
        return digits(directText);
    }
    
    // Fallback: si no hay texto directo, buscar en el primer span
    const firstSpan = priceElement.find('span').first();
    if (firstSpan.length) {
        const spanContent = firstSpan.clone().children().remove().end().text();
        return digits(spanContent);
    }
    
    // Último fallback: tomar todo el texto
    return digits(priceElement.text());
}

// Función específica para extraer precio normal de duos/trios
function extractPrecioNormalDuosTrios($, cardElement) {
    const $precioEl = cardElement.find('.parr-item-luego');
    let precioNormal = '';
    
    if ($precioEl.length) {
        // Obtener todo el texto del elemento
        const fullText = $precioEl.text();
        // Extraer solo la primera cantidad monetaria (antes de cualquier texto adicional)
        // Ejemplo: "$48.990 desde mes 13" -> tomar solo "$48.990"
        const priceMatch = fullText.match(/\$?([\d\.,]+)/);
        precioNormal = priceMatch ? digits(priceMatch[1]) : '';
    }
    
    // Fallback con otros selectores si no encuentra
    if (!precioNormal) {
        precioNormal = digits(cardElement.find('.price .before, .price .was, .price-after').text());
    }
    
    return precioNormal;
}

async function fetchHtml(url) {
    const { data } = await axios.get(url, {
        httpsAgent: agent,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36'
        },
        timeout: 60000
    });
    return data;
}

/* =====================
    EXTRACTORES POR SECCIÓN (CHEERIO) - CORREGIDOS
   ===================== */
function extractMovilPortabilidad($, { url, categoria, fullDateTime }) {
    const out = [];
    $('.card.plan, .card.is-plan').each((_, el) => {
        const $card = $(el);
        const nombre = norm($card.find('.plan-titulo, .title, h3').text());
        const gigas = (nombre.match(/(\d+)\s*GB/i)?.[1] || '') + (nombre.match(/(\d+)\s*GB/i) ? ' GB' : '');
        
        // CORREGIDO: Extraer precio principal correctamente
        const $precioEl = $card.find('.info-price .precio, .price .current, .price .amount, .plan-price, .precio');
        const precioOferta = extractMainPrice($, $precioEl);
        
        const precioNormal = digits($card.find('.info-price .price-after, .price .before, .price .was, .price-after').text());
        const descuento = norm($card.find('.info-price .dcto, .badge, .tag, .label-dcto').text());
        const beneficios = $card.find('.c-detalle li, .features li, .plan-features li, .c-detalle .item')
            .map((i, li) => norm($(li).text())).get().join(' | ');

        if (nombre) out.push({
            Companie: 'Movistar',
            Nombre: nombre,
            Gigas: gigas,
            PrecioOferta: precioOferta,
            PrecioNormal: precioNormal,
            Descuento: descuento,
            Beneficios: beneficios,
            TipoCampaña: 'Portabilidad',
            Categoria: categoria,
            URL: url,
            Fecha: fullDateTime
        });
    });
    return out;
}

function extractMovilAdicionales($, { url, categoria, fullDateTime }) {
    const out = [];
    $('.card.planExtra, .card.plan-extra, .card.plan').each((_, el) => {
        const $card = $(el);
        const nombre = norm($card.find('.plan-titulo, .title, h3').text());
        const gigas = (nombre.match(/(\d+)\s*GB/i)?.[1] || '') + (nombre.match(/(\d+)\s*GB/i) ? ' GB' : '');
        
        // CORREGIDO: Extraer precio principal correctamente
        const $precioEl = $card.find('.info-price .precio, .price .current, .price .amount, .plan-price, .precio');
        const precioOferta = extractMainPrice($, $precioEl);
        
        const precioNormal = digits($card.find('.info-price .price-after, .price .before, .price .was, .price-after').text());
        const descuento = norm($card.find('.info-price .dcto, .badge, .tag, .label-dcto').text());
        const beneficios = $card.find('.c-detalle li, .features li, .plan-features li')
            .map((i, li) => norm($(li).text())).get().join(' | ');

        if (nombre) out.push({
            Companie: 'Movistar',
            Nombre: nombre,
            Gigas: gigas,
            PrecioOferta: precioOferta,
            PrecioNormal: precioNormal,
            Descuento: descuento,
            Beneficios: beneficios,
            TipoCampaña: 'Adicional',
            Categoria: categoria,
            URL: url,
            Fecha: fullDateTime
        });
    });
    return out;
}

function extractHogarInternet($, { url, categoria, fullDateTime }) {
    const out = [];
    $('.if-parrilla_col.up, .if-parrilla_col').each((_, el) => {
        const $card = $(el);
        const nombre = norm($card.find('h3').text()) + ' ' + norm($card.find('.if-parrilla_header_megas').text());
        
        // CORREGIDO: Extraer precio principal correctamente
        const $precioEl = $card.find('.if-parrilla_price .price, .if-parrilla_price .precio');
        const precioOferta = extractMainPrice($, $precioEl);
        
        const precioNormal = digits($card.find('.if-parrilla_price .normal, .price-after').text());
        const descuento = norm($card.find('.if-parrilla-mark, .badge, .tag').text());
        const beneficios = $card.find('.if-parrilla_body .if-parrilla-item, .features li')
            .map((i, li) => norm($(li).text())).get().join(' | ');

        if (nombre.trim()) out.push({
            Companie: 'Movistar',
            Nombre: nombre,
            Gigas: '',
            PrecioOferta: precioOferta,
            PrecioNormal: precioNormal,
            Descuento: descuento,
            Beneficios: beneficios,
            TipoCampaña: 'Hogar',
            Categoria: categoria,
            URL: url,
            Fecha: fullDateTime
        });
    });
    return out;
}

function extractHogarDuosTrios($, { url, categoria, fullDateTime }) {
    const out = [];
    $('.parr-item').each((_, el) => {
        const $card = $(el);
        const nombre = norm($card.find('.parr-item-titulo').text());
        
        // ESPECIAL: Para duos/trios, extraer precio OFERTA de forma específica
        const $precioEl = $card.find('.parr-item-precio');
        let precioOferta = '';
        
        if ($precioEl.length) {
            // Obtener todo el texto del elemento
            const fullText = $precioEl.text();
            // Extraer solo la primera cantidad monetaria (antes de cualquier texto adicional)
            const priceMatch = fullText.match(/\$?([\d\.,]+)/);
            precioOferta = priceMatch ? digits(priceMatch[1]) : '';
        }
        
        // Si no encuentra con el selector específico, usar el método general
        if (!precioOferta) {
            const $fallbackEl = $card.find('.price .current, .precio');
            precioOferta = extractMainPrice($, $fallbackEl);
        }
        
        // ESPECIAL: Para duos/trios, extraer precio NORMAL de forma específica
        const precioNormal = extractPrecioNormalDuosTrios($, $card);
        
        const descuento = norm($card.find('.parr-item-dcto, .badge, .tag').text());
        const beneficios = $card.find('.detalles li, .detalle-cambia, .features li')
            .map((i, li) => norm($(li).text())).get().join(' | ');

        if (nombre) out.push({
            Companie: 'Movistar',
            Nombre: nombre,
            Gigas: '',
            PrecioOferta: precioOferta,
            PrecioNormal: precioNormal,
            Descuento: descuento,
            Beneficios: beneficios,
            TipoCampaña: 'Hogar',
            Categoria: categoria,
            URL: url,
            Fecha: fullDateTime
        });
    });
    return out;
}

function extractHogarFlexible($, { url, categoria, fullDateTime }) {
    const out = [];
    $('.card.card-with-image, .card-with-image, .card:has(.card-title)').each((_, el) => {
        const $card = $(el);
        const nombre = norm($card.find('.card-title, h3, .title').text());
        
        // CORREGIDO: Extraer precio principal correctamente
        const $precioEl = $card.find('.card-pricing .price, .price .current, .price .amount, .precio');
        const precioOferta = extractMainPrice($, $precioEl);
        
        const precioNormal = digits($card.find('.card-pricing .price-secondary, .price .before, .price .was, .price-after').text());
        const descuento = norm($card.find('.savings, .badge, .tag').text());
        const beneficios = $card.find('.card-details-icons, .features li')
            .map((i, li) => norm($(li).text())).get().join(' | ');

        if (nombre) out.push({
            Companie: 'Movistar',
            Nombre: nombre,
            Gigas: '',
            PrecioOferta: precioOferta,
            PrecioNormal: precioNormal,
            Descuento: descuento,
            Beneficios: beneficios,
            TipoCampaña: 'Hogar',
            Categoria: categoria,
            URL: url,
            Fecha: fullDateTime
        });
    });
    return out;
}

/* =====================
    FALLBACK PLAYWRIGHT
   ===================== */
async function fallbackWithBrowser(url, categoria, fullDateTime) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

    try {
        await page.route('**/*.{png,jpg,jpeg,webp,gif,svg,woff,woff2,ttf}', route => route.abort());
        await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });

        // Cerrar banner cookies si aparece
        await page.evaluate(() => {
            const btn = [...document.querySelectorAll('button, a')].find(b =>
                /aceptar|accept|entendido|ok/i.test(b.textContent || '')
            );
            btn?.click();
        }).catch(() => { });

        // Scroll para disparar lazy-load
        await page.evaluate(async () => {
            await new Promise(r => {
                let y = 0, max = document.body.scrollHeight, step = 600;
                const i = setInterval(() => {
                    y = Math.min(y + step, max);
                    window.scrollTo(0, y);
                    if (y >= max) { clearInterval(i); r(); }
                }, 150);
            });
        });

        // Tomamos el HTML ya hidratado y aplicamos la lógica corregida
        const html = await page.content();
        const $ = cheerio.load(html);

        if (url.includes('planes-portabilidad')) {
            const r = extractMovilPortabilidad($, { url, categoria, fullDateTime });
            if (r.length) return r;
        } else if (url.includes('planes-adicionales')) {
            const r = extractMovilAdicionales($, { url, categoria, fullDateTime });
            if (r.length) return r;
        } else if (url.includes('/hogar/internet-hogar/')) {
            const r = extractHogarInternet($, { url, categoria, fullDateTime });
            if (r.length) return r;
        } else if (url.includes('/hogar/pack-duos-internet-television/') || url.includes('/hogar/pack-trios/')) {
            const r = extractHogarDuosTrios($, { url, categoria, fullDateTime });
            if (r.length) return r;
        } else if (url.includes('/hogar/arma-tu-plan-flexible/')) {
            const r = extractHogarFlexible($, { url, categoria, fullDateTime });
            if (r.length) return r;
        }

        return [];
    } finally {
        await browser.close();
    }
}

/* =====================
    MAIN SCRAPER
   ===================== */
async function scrape(url, categoria, fullDateTime) {
    // 1) Intento directo con Axios (HTML base)
    try {
        const html = await fetchHtml(url);
        const $ = cheerio.load(html);

        if (url.includes('planes-portabilidad')) {
            const r = extractMovilPortabilidad($, { url, categoria, fullDateTime });
            if (r.length) return r;
        } else if (url.includes('planes-adicionales')) {
            const r = extractMovilAdicionales($, { url, categoria, fullDateTime });
            if (r.length) return r;
        } else if (url.includes('/hogar/internet-hogar/')) {
            const r = extractHogarInternet($, { url, categoria, fullDateTime });
            if (r.length) return r;
        } else if (url.includes('/hogar/pack-duos-internet-television/') || url.includes('/hogar/pack-trios/')) {
            const r = extractHogarDuosTrios($, { url, categoria, fullDateTime });
            if (r.length) return r;
        } else if (url.includes('/hogar/arma-tu-plan-flexible/')) {
            const r = extractHogarFlexible($, { url, categoria, fullDateTime });
            if (r.length) return r;
        }
    } catch (e) {
        // Si Axios falla (CORS/SSL), seguimos al fallback
        // console.warn('Axios fallback:', e.message);
    }

    // 2) Fallback con navegador (cierra cookies, scroll, etc.)
    const r = await fallbackWithBrowser(url, categoria, fullDateTime);
    return r;
}

module.exports = { scrape };