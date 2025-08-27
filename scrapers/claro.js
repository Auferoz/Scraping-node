// scrapers/claro.js
const { chromium } = require('playwright');

function norm(t = '') { 
    return (t || '').replace(/\s+/g, ' ').trim(); 
}

function digits(t = '') { 
    return (t || '').replace(/\D/g, '') || ''; 
}

async function scrape(url, categoria, fullDateTime) {
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--disable-blink-features=AutomationControlled']
    });
    
    const page = await browser.newPage({
        viewport: { width: 1366, height: 900 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    });

    const results = [];

    try {
        // Bloquear recursos innecesarios para mayor velocidad
        await page.route('**/*', (route) => {
            const resourceType = route.request().resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                route.abort();
            } else {
                route.continue();
            }
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Cerrar posibles modales/cookies
        await page.evaluate(() => {
            const closeButtons = document.querySelectorAll('button, a, span');
            closeButtons.forEach(btn => {
                const text = btn.textContent?.toLowerCase() || '';
                if (text.includes('cerrar') || text.includes('aceptar') || text.includes('entendido')) {
                    btn.click();
                }
            });
        }).catch(() => {});

        // Esperar a que carguen los planes
        await page.waitForSelector('.cardiPlan', { timeout: 30000 });

        // Scroll para asegurar que se carguen todos los elementos
        await page.evaluate(async () => {
            await new Promise(resolve => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });

        // Extraer datos de los planes
        const planesData = await page.$$eval('.cardiPlan', (cards, { url, categoria, fullDateTime }) => {
            const results = [];
            
            const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
            const digits = (t) => (t || '').replace(/\D/g, '') || '';

            cards.forEach(card => {
                try {
                    // Nombre del plan
                    const nombreElement = card.querySelector('.cardiPlanTitle h3');
                    const nombre = norm(nombreElement?.textContent || '');

                    // Gigas - buscar en diferentes lugares posibles
                    let gigas = '';
                    const gigasElements = [
                        card.querySelector('.cardiPlanTitle p'),
                        card.querySelector('.cardiPlanTitle span'),
                        card.querySelector('[data-module] dd') // primer dd que suele ser Internet
                    ];
                    
                    for (const el of gigasElements) {
                        if (el) {
                            const text = norm(el.textContent);
                            if (text.includes('GB') || text.includes('LIBRES')) {
                                gigas = text;
                                break;
                            }
                        }
                    }

                    // Precio oferta
                    const precioElement = card.querySelector('.cippPrice strong');
                    const precioOferta = digits(precioElement?.textContent || '');

                    // Precio normal
                    const precioNormalElement = card.querySelector('.cippExtra del');
                    const precioNormal = digits(precioNormalElement?.textContent || '');

                    // Descuento
                    const descuentoElement = card.querySelector('.cardiPlanLabel');
                    const descuento = norm(descuentoElement?.textContent || '');

                    // Beneficios - extraer de la lista de detalles
                    const beneficiosList = [];
                    const detalleElements = card.querySelectorAll('.cardiPlanDetInfo dl');
                    detalleElements.forEach(dl => {
                        const titulo = norm(dl.querySelector('dt span')?.textContent || '');
                        const detalle = norm(dl.querySelector('dd')?.textContent || '');
                        if (titulo && detalle) {
                            beneficiosList.push(`${titulo}: ${detalle}`);
                        }
                    });
                    const beneficios = beneficiosList.join(' | ');

                    // Tipo de campaña - detectar si es portabilidad
                    const tipoElement = card.querySelector('.cippLighted');
                    let tipoCampaña = 'Móvil';
                    if (tipoElement && norm(tipoElement.textContent).toLowerCase().includes('portabilidad')) {
                        tipoCampaña = 'Portabilidad';
                    }

                    // Solo agregar si tiene información relevante
                    if (nombre || precioOferta) {
                        results.push({
                            Companie: 'Claro',
                            Nombre: nombre,
                            Gigas: gigas,
                            PrecioOferta: precioOferta,
                            PrecioNormal: precioNormal,
                            Descuento: descuento,
                            Beneficios: beneficios,
                            TipoCampaña: tipoCampaña,
                            Categoria: categoria,
                            URL: url,
                            Fecha: fullDateTime
                        });
                    }
                } catch (error) {
                    console.warn('Error procesando card de Claro:', error.message);
                }
            });

            return results;
        }, { url, categoria, fullDateTime });

        results.push(...planesData);

    } catch (error) {
        console.error('❌ Error scraping Claro:', error.message);
    } finally {
        await browser.close();
    }

    return results;
}

module.exports = { scrape };