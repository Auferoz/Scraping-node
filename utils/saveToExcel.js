// utils/saveToExcel.js
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

/**
 * Convierte un array de objetos a una hoja de Excel.
 * Si se pasa headerOrder, respeta ese orden de columnas.
 */
function objectsToSheet(data = [], headerOrder) {
    if (!Array.isArray(data) || data.length === 0) {
        return XLSX.utils.aoa_to_sheet([['(sin datos)']]);
    }

    const headers = headerOrder && headerOrder.length
        ? headerOrder
        : Array.from(
            data.reduce((set, obj) => {
                Object.keys(obj).forEach(k => set.add(k));
                return set;
            }, new Set())
        );

    const rows = data.map(obj => headers.map(h => obj[h] ?? ''));
    const aoa = [headers, ...rows];

    const sheet = XLSX.utils.aoa_to_sheet(aoa);

    // Auto ancho simple por contenido
    const colWidths = headers.map((h, colIdx) => {
        const maxLen = Math.max(
            String(h ?? '').length,
            ...rows.map(r => (r[colIdx] != null ? String(r[colIdx]).length : 0))
        );
        return { wch: Math.min(Math.max(maxLen + 2, 10), 60) };
    });
    sheet['!cols'] = colWidths;

    return sheet;
}

/**
 * Guarda un XLSX con pestañas "Planes" y/o "Beneficios".
 * filename es opcional; si no se pasa, usa:
 *   Planes-Movil-y-Hogar-DD-MM-YYYY.xlsx
 */
async function saveToExcel({ planes = [], beneficios = [] } = {}, filename) {
    const wb = XLSX.utils.book_new();

    // Orden de columnas sugerido
    const commonOrder = [
        'Companie', 'Nombre', 'Gigas',
        'PrecioOferta', 'PrecioNormal', 'Descuento', 'Beneficios',
        'TipoCampaña', 'Categoria', 'URL', 'Fecha'
    ];

    if (planes.length) {
        const wsPlanes = objectsToSheet(planes, commonOrder);
        XLSX.utils.book_append_sheet(wb, wsPlanes, 'Planes');
    }
    if (beneficios.length) {
        const wsBenef = objectsToSheet(beneficios, commonOrder);
        XLSX.utils.book_append_sheet(wb, wsBenef, 'Beneficios');
    }
    if (!planes.length && !beneficios.length) {
        XLSX.utils.book_append_sheet(
            wb,
            XLSX.utils.aoa_to_sheet([['(sin datos)']]),
            'Datos'
        );
    }

    // Carpeta de reports
    const dir = path.resolve(process.cwd(), 'reports');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Nombre por defecto: Planes-Movil-y-Hogar-DD-MM-YYYY.xlsx
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const fecha = `${dd}-${mm}-${yyyy}`;

    const outName = filename || `Planes-Movil-y-Hogar-${fecha}.xlsx`;
    const outPath = path.join(dir, outName);

    XLSX.writeFile(wb, outPath);
    console.log(`✅ Excel generado: ${outPath}`);
    return outPath;
}

module.exports = { saveToExcel };
