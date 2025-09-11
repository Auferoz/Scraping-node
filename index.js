// index.js
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const urls = require('./urls');
const { scrapeUrl } = require('./router');
const { sendToSheet } = require('./utils/sendToSheet'); 
// const { saveToExcel } = require('./utils/saveToExcel');
const { getFullDateTime } = require('./utils/date');

async function main() {
    const planesData = [];
    const beneficiosData = [];
    const fullDateTime = getFullDateTime();

    console.log('🚀 Iniciando scraping...');

    for (const item of urls) {
        try {
            console.log(`📡 Scrapeando: ${item.companie} - ${item.categoria} - ${item.url}`);
            const data = await scrapeUrl(item, fullDateTime);
            
            if (item.categoria === 'Beneficios') {
                beneficiosData.push(...data);
            } else {
                planesData.push(...data);
            }
            
            console.log(`✅ ${item.companie} completado: ${data.length} elementos`);
            
        } catch (err) {
            console.error(`❌ Error scraping ${item.companie} - ${item.url}:`, err.message);
        }
    }

    console.log('\n📊 Resumen de scraping:');
    console.log(`- Planes encontrados: ${planesData.length}`);
    console.log(`- Beneficios encontrados: ${beneficiosData.length}`);

    // ✅ Guardar Excel local
    console.log('\n💾 Guardando archivo Excel...');
    await saveToExcel({ planes: planesData, beneficios: beneficiosData });

    // 📤 Enviar a Google Sheets vía SheetDB
    console.log('\n📤 Enviando datos a Google Sheets...');
    
    // ✅ COMPORTAMIENTO ACTUAL: SUMA los datos a los existentes (NO reemplaza)
    // Si quieres REEMPLAZAR los datos, cambia 'true' por 'false' en las llamadas
    
    if (planesData.length) {
        try {
            await sendToSheet(planesData, 'Planes', true); // true = SUMAR, false = REEMPLAZAR
            console.log('✅ Planes SUMADOS a Google Sheets');
        } catch (error) {
            console.error('❌ Error enviando planes:', error.message);
        }
    }
    
    if (beneficiosData.length) {
        try {
            await sendToSheet(beneficiosData, 'Beneficios', true); // true = SUMAR, false = REEMPLAZAR
            console.log('✅ Beneficios SUMADOS a Google Sheets');
        } catch (error) {
            console.error('❌ Error enviando beneficios:', error.message);
        }
    }

    console.log('\n🎉 Proceso completado');
    console.log(`✅ Excel local generado`);
    console.log(`✅ Datos sincronizados con Google Sheets`);
}

main().catch(console.error);
