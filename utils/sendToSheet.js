// sendToSheet.js (versión con SheetDB API)
const axios = require('axios');

// ==== CONFIG ====
const SHEETDB_API_URL = 'https://sheetdb.io/api/v1/mv1wyv7au3gc0'; // PRODUCCIÓN
// const SHEETDB_API_URL = 'https://sheetdb.io/api/v1/fxge82f00xmcx'; // TEST

// Chunk para evitar límites de tamaño en POST
const CHUNK_SIZE = 100; // SheetDB tiene límites, reducimos el chunk
// Reintentos básicos
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// ==== HELPERS ====
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function postWithRetry(payload, sheet) {
    let lastErr;
    for (let i = 1; i <= MAX_RETRIES; i++) {
        try {
            // SheetDB permite especificar la hoja mediante query param ?sheet=NombreHoja
            const url = sheet ? `${SHEETDB_API_URL}?sheet=${encodeURIComponent(sheet)}` : SHEETDB_API_URL;
            
            const res = await axios.post(url, payload, {
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 30000,
            });
            return res.data;
        } catch (err) {
            lastErr = err;
            const status = err.response?.status;
            const errorMsg = err.response?.data?.message || err.message;
            console.warn(`⚠️ POST intento ${i}/${MAX_RETRIES} falló${status ? ' (HTTP ' + status + ')' : ''}: ${errorMsg}`);
            if (i < MAX_RETRIES) await sleep(RETRY_DELAY_MS * i);
        }
    }
    throw lastErr;
}

// Función para limpiar y preparar los datos para SheetDB
function prepareDataForSheetDB(data) {
    if (!Array.isArray(data) || data.length === 0) return [];
    
    return data.map(item => {
        // Asegurar que todos los valores sean strings o números simples
        const cleanedItem = {};
        Object.keys(item).forEach(key => {
            let value = item[key];
            if (value === null || value === undefined) {
                value = '';
            } else if (typeof value === 'object') {
                value = JSON.stringify(value);
            } else {
                value = String(value).trim();
            }
            cleanedItem[key] = value;
        });
        return cleanedItem;
    });
}

// ==== API PRINCIPAL ====
// data: Array<Objeto>; tipo: 'Planes' | 'Beneficios'; append: boolean (default true)
async function sendToSheet(data, tipo, append = true) {
    const sheet = tipo || 'Hoja1';

    if (!Array.isArray(data) || data.length === 0) {
        console.log(`ℹ️ Nada que enviar para ${sheet}.`);
        return;
    }

    const action = append ? 'SUMANDO' : 'REEMPLAZANDO';
    console.log(`📤 ${action} ${data.length} filas en hoja "${sheet}" vía SheetDB...`);
    
    // Si NO es append (es decir, queremos reemplazar), limpiamos la hoja primero
    if (!append) {
        try {
            console.log(`🗑️ Limpiando hoja "${sheet}" antes de insertar nuevos datos...`);
            await clearSheet(sheet);
            console.log(`✅ Hoja "${sheet}" limpiada`);
        } catch (err) {
            console.warn(`⚠️ No se pudo limpiar la hoja "${sheet}":`, err.message);
            console.log('🔄 Continuando con el envío (se sumarán a datos existentes)...');
        }
    }

    // Preparar datos para SheetDB
    const cleanData = prepareDataForSheetDB(data);

    // Fragmenta el envío en bloques para mayor robustez
    let totalEnviado = 0;
    for (let i = 0; i < cleanData.length; i += CHUNK_SIZE) {
        const chunk = cleanData.slice(i, i + CHUNK_SIZE);
        
        try {
            console.log(`📤 Enviando bloque ${Math.floor(i/CHUNK_SIZE) + 1}/${Math.ceil(cleanData.length/CHUNK_SIZE)} (${chunk.length} filas)...`);
            
            // SheetDB espera un array de objetos directamente
            const payload = chunk;
            
            const resp = await postWithRetry(payload, sheet);
            totalEnviado += chunk.length;
            
            console.log(`✅ Bloque ${i + 1}-${i + chunk.length} OK → ${sheet}`);
            console.log(`📊 Respuesta SheetDB:`, {
                created: resp?.created || chunk.length,
                updated: resp?.updated || 0
            });
            
            // Pequeña pausa entre requests para no sobrecargar la API
            if (i + CHUNK_SIZE < cleanData.length) {
                await sleep(500);
            }
            
        } catch (err) {
            const errorDetails = err.response?.data || err.message;
            console.error(`❌ Error enviando bloque ${i + 1}-${i + chunk.length} → ${sheet}:`);
            console.error('Detalles del error:', errorDetails);
            
            // Si es un error 400, mostramos más detalles
            if (err.response?.status === 400) {
                console.error('💡 Tip: Verifica que los nombres de columnas coincidan con tu Google Sheet');
                console.error('💡 Primeros datos del chunk:', JSON.stringify(chunk.slice(0, 2), null, 2));
            }
        }
    }
    
    console.log(`🎯 Total enviado a ${sheet}: ${totalEnviado}/${data.length} filas`);
}

// Función adicional para obtener datos de la hoja (opcional)
async function getSheetData(sheet = '') {
    try {
        const url = sheet ? `${SHEETDB_API_URL}?sheet=${encodeURIComponent(sheet)}` : SHEETDB_API_URL;
        const response = await axios.get(url, {
            timeout: 15000,
            headers: { 'Accept': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error(`❌ Error obteniendo datos de ${sheet || 'hoja por defecto'}:`, error.message);
        return [];
    }
}

// Función para limpiar la hoja (opcional)
async function clearSheet(sheet = '') {
    try {
        const url = sheet ? `${SHEETDB_API_URL}?sheet=${encodeURIComponent(sheet)}` : SHEETDB_API_URL;
        const response = await axios.delete(url, {
            timeout: 15000,
            headers: { 'Accept': 'application/json' }
        });
        console.log(`🗑️ Hoja ${sheet || 'por defecto'} limpiada exitosamente`);
        return response.data;
    } catch (error) {
        console.error(`❌ Error limpiando hoja ${sheet || 'por defecto'}:`, error.message);
        throw error;
    }
}

module.exports = { 
    sendToSheet, 
    getSheetData, 
    clearSheet 
};
