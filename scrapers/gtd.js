// scrapers/gtd.js
const { chromium } = require('playwright');

function norm(t = '') { 
    return (t || '').replace(/\s+/g, ' ').trim(); 
}

function digits(t = '') { 
    return (t || '').replace(/\D/g, '') || ''; 
}

async function scrape(url, categoria, fullDateTime) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Esperar a que carguen las cards de productos
        await page.waitForSelector('.card-productos', { timeout: 30000 });

        // Extraer todos los planes
        const planes = await page.$$eval('.card-productos', (cards, extra) => {
            const { url, categoria, fullDateTime } = extra;
            const results = [];

            const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
            const digits = (t) => (t || '').replace(/\D/g, '') || '';

            cards.forEach(card => {
                try {
                    // Extraer tipo de plan (Internet + Televisión, Internet + Telefonía)
                    const tipoPlanEl = card.querySelector('.card-productos__titulo-producto p:first-child');
                    const tipoPlan = norm(tipoPlanEl?.textContent || '');

                    // Extraer velocidad/nombre del plan (Fibra 600, Súper Fibra 800, etc.)
                    const nombrePlanEl = card.querySelector('.card-productos__titulo-producto h3');
                    const nombrePlan = norm(nombrePlanEl?.textContent || '');

                    // Nombre completo del plan
                    const nombreCompleto = `${tipoPlan} ${nombrePlan}`.trim();

                    // Extraer precio oferta
                    const precioOfertaEl = card.querySelector('[data-element="precioDescuento"]');
                    const precioOferta = digits(precioOfertaEl?.textContent || '');

                    // Extraer precio normal (después de los meses promocionales)
                    const precioNormalEl = card.querySelector('[data-element="precio"]');
                    const precioNormal = digits(precioNormalEl?.textContent || '');

                    // Extraer descuento/tag promocional (si existe)
                    const descuentoEl = card.querySelector('.tag.tag-primario p');
                    const descuento = norm(descuentoEl?.textContent || '');

                    // Extraer beneficios incluidos
                    const beneficiosEls = card.querySelectorAll('.card-productos__container__incluye-servicios__fila-info__texto h6, .card-productos__container-general__fila-info__texto h6');
                    const beneficios = Array.from(beneficiosEls)
                        .map(el => norm(el.textContent))
                        .filter(b => b && b !== '')
                        .join(' | ');

                    // Extraer detalles adicionales de beneficios
                    const detallesBeneficiosEls = card.querySelectorAll('.card-productos__container__incluye-servicios__fila-info__texto p, .card-productos__container-general__fila-info__texto p');
                    const detallesBeneficios = Array.from(detallesBeneficiosEls)
                        .map(el => norm(el.textContent))
                        .filter(b => b && b !== '' && !b.includes('Esta promoción incluye'))
                        .slice(0, 5) // Limitar para no saturar
                        .join(' | ');

                    // Combinar beneficios
                    const beneficiosCompletos = beneficios + (detallesBeneficios ? ' | ' + detallesBeneficios : '');

                    // Determinar tipo de campaña basado en el tipo de plan
                    let tipoCampana = 'Hogar';
                    if (tipoPlan.includes('Televisión') || tipoPlan.includes('TV')) {
                        tipoCampana = 'Duo Pack TV';
                    } else if (tipoPlan.includes('Telefonía')) {
                        tipoCampana = 'Duo Pack Telefonía';
                    }

                    // Solo agregar si tiene información básica
                    if (nombreCompleto && precioOferta) {
                        results.push({
                            Companie: 'GTD',
                            Nombre: nombreCompleto,
                            Gigas: '', // GTD no usa este campo para planes hogar
                            PrecioOferta: precioOferta,
                            PrecioNormal: precioNormal,
                            Descuento: descuento,
                            Beneficios: beneficiosCompletos,
                            TipoCampaña: tipoCampana,
                            Categoria: categoria,
                            URL: url,
                            Fecha: fullDateTime
                        });
                    }
                } catch (err) {
                    console.error('Error procesando card GTD:', err.message);
                }
            });

            return results;
        }, { url, categoria, fullDateTime });

        await browser.close();
        return planes;

    } catch (error) {
        console.error('❌ Error en scraper GTD:', error.message);
        await browser.close();
        return [];
    }
}

module.exports = { scrape };