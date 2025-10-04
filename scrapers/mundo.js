// scrapers/mundo.js
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
        args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage({
        viewport: { width: 1366, height: 900 }
    });

    const results = [];

    try {
        await page.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 60000 
        });

        // Esperar a que carguen las tarjetas
        await page.waitForSelector('.card.card-mundo', { 
            timeout: 30000 
        }).catch(() => {});

        // Si la URL tiene hash (#planes, #fibra), activarlo
        const urlHash = new URL(url).hash;
        if (urlHash) {
            await page.evaluate((hash) => {
                if (location.hash !== hash) {
                    location.hash = hash;
                }
            }, urlHash);
            await page.waitForTimeout(1000);
        }

        // Scroll para cargar contenido lazy
        await page.evaluate(async () => {
            await new Promise(resolve => {
                let y = 0;
                const step = 600;
                const max = Math.max(
                    document.body.scrollHeight, 
                    document.documentElement.scrollHeight
                );
                const interval = setInterval(() => {
                    y = Math.min(y + step, max);
                    window.scrollTo(0, y);
                    if (y >= max) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 150);
            });
        });

        // Extraer datos de las tarjetas
        const cards = await page.$$eval(
            '.card.card-mundo',
            (elements, { url, categoria, fullDateTime }) => {
                const norm = t => (t || '').replace(/\s+/g, ' ').trim();
                const digits = t => (t || '').replace(/\D/g, '') || '';

                return elements.map(card => {
                    // Nombre del plan
                    const nombre = norm(
                        card.querySelector('.plan-nombre span')?.textContent || ''
                    );

                    let gigas = '';
                    let velocidad = '';
                    let beneficios = [];

                    // Detectar si es Hogar (tiene .plan-velocidad) o Móvil (tiene .plan-redes)
                    const isHogar = !!card.querySelector('.plan-velocidad');

                    if (isHogar) {
                        // PLANES HOGAR: Extraer velocidad
                        const velocidadElement = card.querySelector('.plan-velocidad');
                        if (velocidadElement) {
                            const velNum = norm(velocidadElement.childNodes[0]?.textContent || '');
                            const velUnit = norm(velocidadElement.querySelector('span')?.textContent || '');
                            velocidad = `${velNum} ${velUnit}`.trim();
                        }

                        // Tipo de fibra
                        const tipoFibra = norm(
                            card.querySelector('.plan-fibra')?.textContent || ''
                        );
                        if (tipoFibra) beneficios.push(tipoFibra);

                        // Velocidades máxima y mínima
                        const velocidades = card.querySelectorAll('.contendorVel p');
                        velocidades.forEach(vel => {
                            const velText = norm(vel.textContent);
                            if (velText) beneficios.push(velText);
                        });

                    } else {
                        // PLANES MÓVIL: Extraer gigas
                        const gigasElement = card.querySelector('.plan-redes');
                        if (gigasElement) {
                            const gigasText = norm(gigasElement.textContent);
                            const match = gigasText.match(/(\d+)\s*GIGAS?/i);
                            if (match) {
                                gigas = match[1] + ' GB';
                            } else if (/GIGAS?\s*LIBRES/i.test(gigasText)) {
                                gigas = 'Gigas Libres';
                            }
                        }

                        // Minutos
                        const minutosElement = card.querySelector('.plan-pack span:has(.icontm-voz)');
                        if (minutosElement) {
                            beneficios.push(norm(minutosElement.textContent));
                        }

                        // Redes sociales
                        const redesElement = card.querySelector('.plan-pack span:not(:has(.icontm-voz))');
                        if (redesElement && redesElement.textContent.includes('REDES')) {
                            beneficios.push(norm(redesElement.textContent));
                        }

                        // Alta velocidad (para planes XL)
                        const altaVelocidad = card.querySelector('.plan-fibra');
                        if (altaVelocidad) {
                            beneficios.push(norm(altaVelocidad.textContent));
                        }
                    }

                    // Precio oferta (el precio principal)
                    const precioElement = card.querySelector('.plan-precio');
                    let precioOferta = '';
                    if (precioElement) {
                        // Buscar el número después del símbolo $
                        const precioText = precioElement.childNodes;
                        for (let node of precioText) {
                            if (node.nodeType === 3) { // Text node
                                const text = norm(node.textContent);
                                const precio = digits(text);
                                if (precio && precio.length >= 4) {
                                    precioOferta = precio;
                                    break;
                                }
                            }
                        }
                    }

                    // Precio normal (después del descuento)
                    const precioNormalElements = card.querySelectorAll('.plan-precio-desc');
                    let precioNormal = '';
                    if (precioNormalElements.length > 1) {
                        const ultimoPrecio = precioNormalElements[precioNormalElements.length - 1];
                        const text = norm(ultimoPrecio.textContent);
                        // Buscar el primer precio en el texto (ej: "$21.990 desde mes 13")
                        const match = text.match(/\$?\s*([\d.,]+)/);
                        if (match) {
                            precioNormal = digits(match[1]);
                        }
                    }

                    // Descuento
                    const descuento = norm(
                        card.querySelector('.descuento')?.textContent || ''
                    );

                    // Período promocional
                    const periodoDesc = card.querySelector('.plan-precio-desc:first-of-type');
                    if (periodoDesc) {
                        const periodo = norm(periodoDesc.textContent);
                        if (periodo && periodo !== 'POR 12 MESES' && periodo !== 'POR 6 MESES' && periodo !== 'POR 24 MESES') {
                            // Solo agregar si no es un período estándar que ya está implícito
                        } else if (periodo) {
                            beneficios.unshift(periodo); // Agregar al inicio
                        }
                    }

                    // Detectar tipo de campaña
                    let tipoCampaña = categoria;
                    if (categoria === 'Hogar') {
                        tipoCampaña = 'Hogar';
                    } else if (url.includes('portabilidad')) {
                        tipoCampaña = 'Portabilidad';
                    } else if (url.includes('linea-nueva') || url.includes('plan-individual')) {
                        tipoCampaña = 'Línea nueva';
                    }

                    return {
                        Companie: 'Mundo',
                        Nombre: nombre,
                        Gigas: isHogar ? velocidad : gigas, // Para hogar usar velocidad en campo Gigas
                        PrecioOferta: precioOferta,
                        PrecioNormal: precioNormal,
                        Descuento: descuento,
                        Beneficios: beneficios.filter(Boolean).join(' | '),
                        TipoCampaña: tipoCampaña,
                        Categoria: categoria,
                        URL: url,
                        Fecha: fullDateTime
                    };
                }).filter(item => item.Nombre && item.PrecioOferta);
            },
            { url, categoria, fullDateTime }
        );

        results.push(...cards);

    } catch (error) {
        console.error('❌ Error scraping Mundo:', error.message);
    } finally {
        await page.close().catch(() => {});
        await browser.close().catch(() => {});
    }

    return results;
}

module.exports = { scrape };