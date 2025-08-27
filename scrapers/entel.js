const { chromium } = require('playwright');

async function scrape(url, categoria, fullDateTime) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const results = [];

    if (url.includes('oferta-portabilidad')) {
        await page.waitForSelector('andino-card-planes-moviles-ecommerce', { timeout: 15000 });

        const cardsData = await page.$eval('andino-card-planes-moviles-ecommerce', (el, extra) => {
            const { url, categoria, fullDateTime } = extra;
            const edsCardAttr = el.getAttribute('eds-card');
            if (!edsCardAttr) return [];

            const jsonData = JSON.parse(edsCardAttr);
            return jsonData.map(plan => ({
                Companie: 'Entel',
                Nombre: plan.type + ' ' + (plan.title || ''),
                Gigas: plan.title || '',
                PrecioOferta: plan.price || '',
                PrecioNormal: (plan.priceLater || '').replace(/\D/g, ''),
                Descuento: plan.label ? `${plan.label.text} ${plan.label.secondText || ''}` : (plan.tagSavings?.text || ''),
                Beneficios: plan.details ? plan.details.map(d => d.text).join(' | ') : '',
                TipoCampaña: 'Portabilidad',
                Categoria: categoria,
                URL: url,
                Fecha: fullDateTime
            }));
        }, { url, categoria, fullDateTime });

        results.push(...cardsData);
    }

    else if (url.includes('plan-adicional-con-descuento')) {
        await page.waitForSelector('andino-card-planes-horizontal', { timeout: 15000 });

        const cards = await page.$$eval('andino-card-planes-horizontal', (elements, { url, categoria, fullDateTime }) => {
            return elements.map(el => {
                const shadow = el.shadowRoot;
                if (!shadow) return null;

                const plan = {};

                plan.Companie = 'Entel';
                plan.Nombre = shadow.querySelector('.plan-type')?.getAttribute('eds-text') || '';
                plan.Gigas = 'Gigas igual a tu plan';

                const precio = shadow.querySelector('.price');
                plan.PrecioOferta = precio?.textContent.replace(/\D/g, '') || '';

                const precioNormal = shadow.querySelector('.plan-description')?.getAttribute('eds-text') || '';
                plan.PrecioNormal = precioNormal.replace(/\D/g, '');

                const label = shadow.querySelector('andino-label');
                plan.Descuento = label?.getAttribute('eds-text') || '';

                const beneficios = [];
                shadow.querySelectorAll('.detail-group andino-text-styler').forEach(el => {
                    beneficios.push(el.getAttribute('eds-text'));
                });
                plan.Beneficios = beneficios.join(' | ');

                plan.TipoCampaña = 'Adicional';
                plan.Categoria = categoria;
                plan.URL = url;
                plan.Fecha = fullDateTime;

                return plan;
            }).filter(item => item !== null);
        }, { url, categoria, fullDateTime });

        results.push(...cards);
    }

    else if (categoria === 'Hogar') {
        await page.waitForSelector('andino-card-planes-hibrida', { timeout: 15000, state: 'attached' });

        const cardsData = await page.$$eval('andino-card-planes-hibrida', (elements, { url, categoria, fullDateTime }) => {
            return elements.map(el => {
                const edsCardAttr = el.getAttribute('eds-card');
                if (!edsCardAttr) return null;

                const jsonDataArray = JSON.parse(edsCardAttr);
                if (!Array.isArray(jsonDataArray)) return null;

                return jsonDataArray.map(jsonData => {
                    const esTelevision = !!jsonData.subtitle?.text;

                    // Precio normal solo si existe normalPrice (Internet y packs)
                    const precioNormalMatch = jsonData.normalPrice?.match(/\$([\d\.]+)/);
                    const precioNormal = precioNormalMatch ? precioNormalMatch[1].replace(/\./g, '') : '';

                    return {
                        Companie: 'Entel',
                        Nombre: esTelevision ? jsonData.subtitle.text.replace(/\*\*/g, '').trim() : jsonData.title || '',
                        Gigas: '',
                        PrecioOferta: jsonData.price || '',
                        PrecioNormal: esTelevision ? '' : precioNormal,
                        Descuento: jsonData.label ? `${jsonData.label.text} ${jsonData.label.secondText || ''}` : '',
                        Beneficios: (jsonData.details || jsonData.plan_list || []).map(d => d.text).join(' | ') || '',
                        TipoCampaña: 'Hogar',
                        Categoria: categoria,
                        URL: url,
                        Fecha: fullDateTime
                    };
                });
            }).flat().filter(item => item !== null);
        }, { url, categoria, fullDateTime });

        results.push(...cardsData);
    }


    await browser.close();
    return results;
}

module.exports = { scrape };
