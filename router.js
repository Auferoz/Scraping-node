const entel = require('./scrapers/entel');
const movistar = require('./scrapers/movistar');
const wom = require('./scrapers/wom');
const vtr = require('./scrapers/vtr');
const claro = require('./scrapers/claro'); // ✅ Nuevo scraper

async function scrapeUrl(item, fullDateTime) {
    const { companie, categoria, url } = item;

    if (companie === 'Entel') return entel.scrape(url, categoria, fullDateTime);
    if (companie === 'Movistar') return movistar.scrape(url, categoria, fullDateTime);
    if (companie === 'WOM') return wom.scrape(url, categoria, fullDateTime);
    if (companie === 'VTR') return vtr.scrape(url, categoria, fullDateTime);
    if (companie === 'Claro') return claro.scrape(url, categoria, fullDateTime); // ✅ Nueva línea

    // console.warn(`Scraper no implementado: ${companie} - ${categoria}`);
    return [];
}

module.exports = { scrapeUrl };