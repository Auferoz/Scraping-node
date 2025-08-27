const { chromium } = require('playwright');

async function scrape(url, categoria, fullDateTime) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    const page = await context.newPage();
    const results = [];

    const clean = (txt) => (txt || '').replace(/\s+/g, ' ').trim();
    const digits = (txt) => (txt || '').replace(/\D/g, '');

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        // MÓVIL
        if (/\/moviles\/planes-moviles\/individuales\/?$/.test(url)) {
            // console.log('📱 Scraping VTR móvil...');
            
            const allPlans = new Set();
            const tabs = ['200 GB', '300 GB', '500 GB'];
            
            for (const tab of tabs) {
                // console.log(`🔄 Procesando pestaña: ${tab}`);
                try {
                    await page.click(`button:has-text("${tab}")`, { timeout: 5000 });
                    await page.waitForTimeout(1500);
                    // console.log(`✅ Click en ${tab}`);
                } catch (e) {
                    console.log(`⚠️ No se pudo hacer click en ${tab}`);
                }

                try {
                    const cardElements = await page.$$('[class*="planCardv2-module--card"], [class*="card"]');
                    
                    for (const cardElement of cardElements) {
                        const cardData = await cardElement.evaluate((card, args) => {
                            const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
                            const digits = (t) => (t || '').replace(/\D/g, '');
                            
                            const text = card.textContent || '';
                            if (!text.includes('$')) return null;

                            const title = clean(card.querySelector('h1, h2, h3, [class*="title"]')?.textContent);
                            const subtitle = clean(card.querySelector('[class*="subtitle"]')?.textContent);
                            const priceEl = card.querySelector('[class*="price"]');
                            const price = digits(priceEl?.textContent);
                            
                            const gbMatch = text.match(/(\d+)\s*(GB|Gigas)/i);
                            const laterMatch = text.match(/después\s*\$\s*([\d\.]+)/i);
                            const features = Array.from(card.querySelectorAll('li')).map(li => clean(li.textContent));

                            if (!title && !price) return null;

                            return {
                                Companie: 'VTR',
                                Nombre: [title, subtitle].filter(Boolean).join(' ') || 'Plan móvil',
                                Gigas: gbMatch ? `${gbMatch[1]} GB` : '',
                                PrecioOferta: price,
                                PrecioNormal: laterMatch ? digits(laterMatch[1]) : '',
                                Descuento: '',
                                Beneficios: features.join(' | '),
                                TipoCampaña: 'Movil',
                                Categoria: args.categoria,
                                URL: args.url,
                                Fecha: args.fullDateTime
                            };
                        }, { categoria, url, fullDateTime });

                        if (cardData) {
                            const key = `${cardData.Nombre}-${cardData.PrecioOferta}-${cardData.Gigas}`;
                            if (!allPlans.has(key)) {
                                allPlans.add(key);
                                results.push(cardData);
                            }
                        }
                    }
                    // console.log(`📊 Planes en pestaña ${tab}: ${results.length}`);
                } catch (e) {
                    console.log(`⚠️ Error procesando ${tab}:`, e.message);
                }
            }
        }

        // INTERNET HOGAR
        else if (/\/hogar-packs\/internet-hogar\/?$/.test(url)) {
            // console.log('🏠 Scraping VTR Internet Hogar...');
            const tabs = ['Mega 500', 'Fibra 600', 'Fibra 800', 'Fibra 940'];
            
            for (const tab of tabs) {
                try {
                    await page.click(`button:has-text("${tab}")`, { timeout: 5000 });
                    await page.waitForTimeout(1000);
                } catch (e) {
                    console.log(`⚠️ No se pudo hacer click en ${tab}`);
                }

                try {
                    const cardElements = await page.$$('.packCardv2-module--card--2SZin');
                    // console.log(`📊 Cards encontrados en ${tab}: ${cardElements.length}`);
                    
                    for (const cardElement of cardElements) {
                        const cardData = await cardElement.evaluate((card, args) => {
                            const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
                            const digits = (t) => (t || '').replace(/\D/g, '');

                            const title = clean(card.querySelector('[class*="card__title"]')?.textContent);
                            const subtitle = clean(card.querySelector('[class*="card__subtitle"]')?.textContent);
                            const price = digits(card.querySelector('[class*="card__price"]')?.textContent);
                            const priceText = clean(card.querySelector('[class*="priceText"]')?.textContent);
                            const laterMatch = priceText.match(/después\s*\$\s*([\d\.]+)/i);
                            const features = Array.from(card.querySelectorAll('li')).map(li => clean(li.textContent));

                            const textBlob = clean(card.textContent).toLowerCase();
                            const matchesTab = 
                                (args.tab.includes('500') && textBlob.includes('500')) ||
                                (args.tab.includes('600') && textBlob.includes('600')) ||
                                (args.tab.includes('800') && textBlob.includes('800')) ||
                                (args.tab.includes('940') && textBlob.includes('940'));

                            if (!matchesTab || (!title && !price)) return null;

                            return {
                                Companie: 'VTR',
                                Nombre: [title, subtitle].filter(Boolean).join(' '),
                                Gigas: '',
                                PrecioOferta: price,
                                PrecioNormal: laterMatch ? digits(laterMatch[1]) : '',
                                Descuento: '',
                                Beneficios: features.join(' | '),
                                TipoCampaña: 'Hogar',
                                Categoria: args.categoria,
                                URL: args.url,
                                Fecha: args.fullDateTime
                            };
                        }, { tab, categoria, url, fullDateTime });

                        if (cardData) results.push(cardData);
                    }
                } catch (e) {
                    console.log(`⚠️ Error procesando ${tab}:`, e.message);
                }
            }
        }

        // DOBLE Y TRIPLE PACKS
        else if (/\/hogar-packs\/(doble|triple)-pack/.test(url)) {
            // console.log('📺 Scraping VTR Packs...');
            await page.waitForTimeout(2000);
            
            try {
                const cardElements = await page.$$('.packCardv2-module--card--2SZin');
                // console.log(`📊 Cards encontrados en Packs: ${cardElements.length}`);
                
                for (const cardElement of cardElements) {
                    const cardData = await cardElement.evaluate((card, args) => {
                        const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
                        const digits = (t) => (t || '').replace(/\D/g, '');

                        const title = clean(card.querySelector('[class*="card__title"]')?.textContent);
                        const subtitle = clean(card.querySelector('[class*="card__subtitle"]')?.textContent);
                        const price = digits(card.querySelector('[class*="card__price"]')?.textContent);
                        const priceText = clean(card.querySelector('[class*="priceText"]')?.textContent);
                        const laterMatch = priceText.match(/después\s*\$\s*([\d\.]+)/i);
                        const features = Array.from(card.querySelectorAll('li')).map(li => clean(li.textContent));

                        if (!title && !price) return null;

                        return {
                            Companie: 'VTR',
                            Nombre: [title, subtitle].filter(Boolean).join(' '),
                            Gigas: '',
                            PrecioOferta: price,
                            PrecioNormal: laterMatch ? digits(laterMatch[1]) : '',
                            Descuento: '',
                            Beneficios: features.join(' | '),
                            TipoCampaña: 'Hogar',
                            Categoria: args.categoria,
                            URL: args.url,
                            Fecha: args.fullDateTime
                        };
                    }, { categoria, url, fullDateTime });

                    if (cardData) results.push(cardData);
                }
            } catch (e) {
                console.log(`⚠️ Error procesando Packs:`, e.message);
            }
        }

        // TV CABLE
        else if (/\/hogar-packs\/tv-cable\/?$/.test(url)) {
            // console.log('📺 Scraping VTR TV Cable...');
            await page.waitForTimeout(2000);
            
            try {
                const cardElements = await page.$$('.packCardv2-module--card--2SZin');
                // console.log(`📊 Cards encontrados en TV Cable: ${cardElements.length}`);
                
                for (const cardElement of cardElements) {
                    const cardData = await cardElement.evaluate((card, args) => {
                        const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
                        const digits = (t) => (t || '').replace(/\D/g, '');

                        const title = clean(card.querySelector('[class*="card__title"]')?.textContent);
                        const subtitle = clean(card.querySelector('[class*="card__subtitle"]')?.textContent);
                        const discount = clean(card.querySelector('[class*="card__discount"]')?.textContent);
                        const price = digits(card.querySelector('[class*="card__price"]')?.textContent);
                        const priceText = clean(card.querySelector('[class*="priceText"]')?.textContent);
                        const laterMatch = priceText.match(/después\s*\$\s*([\d\.]+)/i);
                        const features = Array.from(card.querySelectorAll('li')).map(li => clean(li.textContent));

                        if (!title && !price) return null;

                        return {
                            Companie: 'VTR',
                            Nombre: [title, subtitle].filter(Boolean).join(' '),
                            Gigas: '',
                            PrecioOferta: price,
                            PrecioNormal: laterMatch ? digits(laterMatch[1]) : '',
                            Descuento: discount,
                            Beneficios: features.join(' | '),
                            TipoCampaña: 'Hogar',
                            Categoria: args.categoria,
                            URL: args.url,
                            Fecha: args.fullDateTime
                        };
                    }, { categoria, url, fullDateTime });

                    if (cardData) results.push(cardData);
                }
            } catch (e) {
                console.log(`⚠️ Error procesando TV Cable:`, e.message);
            }
        }

        // OTROS PACKS
        else if (/\/hogar-packs\/otros-packs\/?$/.test(url)) {
            // console.log('🏠 Scraping VTR Otros Packs...');
            await page.waitForTimeout(2000);
            
            try {
                const cardElements = await page.$$('.packCardv2-module--card--2SZin');
                // console.log(`📊 Cards encontrados en Otros Packs: ${cardElements.length}`);
                
                for (const cardElement of cardElements) {
                    const cardData = await cardElement.evaluate((card, args) => {
                        const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
                        const digits = (t) => (t || '').replace(/\D/g, '');

                        const title = clean(card.querySelector('[class*="card__title"]')?.textContent);
                        const subtitle = clean(card.querySelector('[class*="card__subtitle"]')?.textContent);
                        const discount = clean(card.querySelector('[class*="card__discount"]')?.textContent);
                        const price = digits(card.querySelector('[class*="card__price"]')?.textContent);
                        const priceText = clean(card.querySelector('[class*="priceText"]')?.textContent);
                        const laterMatch = priceText.match(/después\s*\$\s*([\d\.]+)/i);
                        const features = Array.from(card.querySelectorAll('li')).map(li => clean(li.textContent));

                        if (!title && !price) return null;

                        return {
                            Companie: 'VTR',
                            Nombre: [title, subtitle].filter(Boolean).join(' '),
                            Gigas: '',
                            PrecioOferta: price,
                            PrecioNormal: laterMatch ? digits(laterMatch[1]) : '',
                            Descuento: discount,
                            Beneficios: features.join(' | '),
                            TipoCampaña: 'Hogar',
                            Categoria: args.categoria,
                            URL: args.url,
                            Fecha: args.fullDateTime
                        };
                    }, { categoria, url, fullDateTime });

                    if (cardData) results.push(cardData);
                }
            } catch (e) {
                console.log(`⚠️ Error procesando Otros Packs:`, e.message);
            }
        }

    } catch (err) {
        console.error(`❌ Error VTR (${categoria}):`, err.message);
    } finally {
        await context.close();
        await browser.close();
    }

    // console.log(`✅ VTR ${categoria} completado: ${results.length} planes`);
    return results;
}

module.exports = { scrape };