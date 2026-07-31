const { google } = require('googleapis');

// =====================================================================
// Definición de "tablas" (pestañas del Sheet) y sus columnas.
// El orden aquí DEBE coincidir con el orden real de columnas en el sheet.
// =====================================================================
const SHEETS = {
  Quotes: ['uuid', 'title', 'status', 'created_at'],
  Parts: ['id', 'quote_uuid', 'name', 'code', 'unit', 'description'],
  Suppliers: ['id', 'quote_uuid', 'company', 'phone', 'email', 'submitted_at'],
  Bids: ['id', 'supplier_id', 'part_id', 'price', 'notes'],
};

function getSpreadsheetId() {
  const id = process.env.SPREADSHEET_ID;
  if (!id) throw new Error('Falta la variable de entorno SPREADSHEET_ID');
  return id;
}

let cachedClient = null;

function getClient() {
  if (cachedClient) return cachedClient;

  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (!clientEmail || !rawKey) {
    throw new Error(
      'Faltan GOOGLE_SHEETS_CLIENT_EMAIL o GOOGLE_SHEETS_PRIVATE_KEY'
    );
  }
  const privateKey = rawKey.replace(/\\n/g, '\n');

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  cachedClient = google.sheets({ version: 'v4', auth });
  return cachedClient;
}

function colLetter(index) {
  // index 0-based -> 'A', 'B', ... (soporta hasta 26 columnas, suficiente aquí)
  return String.fromCharCode(65 + index);
}

/**
 * Lee todas las filas de una hoja como objetos { columna: valor, _row: N }.
 */
async function getRows(sheetName) {
  const client = getClient();
  const columns = SHEETS[sheetName];
  const lastCol = colLetter(columns.length - 1);

  const res = await client.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${sheetName}!A2:${lastCol}`,
  });

  const rows = res.data.values || [];
  return rows
    .map((row, idx) => {
      const obj = { _row: idx + 2 };
      columns.forEach((col, colIdx) => {
        obj[col] = row[colIdx] ?? '';
      });
      return obj;
    })
    .filter((r) =>
      Object.entries(r).some(([k, v]) => k !== '_row' && v !== '' && v !== undefined)
    );
}

async function appendRow(sheetName, data) {
  return appendRows(sheetName, [data]);
}

async function appendRows(sheetName, dataRows) {
  if (!dataRows.length) return;
  const client = getClient();
  const columns = SHEETS[sheetName];
  const values = dataRows.map((data) => columns.map((col) => data[col] ?? ''));

  await client.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${sheetName}!A:A`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}

async function updateRow(sheetName, rowNumber, data) {
  const client = getClient();
  const columns = SHEETS[sheetName];
  const lastCol = colLetter(columns.length - 1);
  const values = columns.map((col) => data[col] ?? '');

  await client.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: `${sheetName}!A${rowNumber}:${lastCol}${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });
}

/**
 * Crea las 4 pestañas y sus encabezados si no existen todavía.
 * Se cachea en memoria del proceso (cada función serverless "fría"
 * lo vuelve a chequear una vez).
 */
let readyChecked = false;

async function ensureReady() {
  if (readyChecked) return;
  const client = getClient();
  const spreadsheetId = getSpreadsheetId();

  const meta = await client.spreadsheets.get({ spreadsheetId });
  const existingTitles = new Set(
    (meta.data.sheets || []).map((s) => s.properties.title)
  );

  const missing = Object.keys(SHEETS).filter((name) => !existingTitles.has(name));

  if (missing.length > 0) {
    await client.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
      },
    });
  }

  for (const name of Object.keys(SHEETS)) {
    const columns = SHEETS[name];
    const lastCol = colLetter(columns.length - 1);
    const res = await client.spreadsheets.values.get({
      spreadsheetId,
      range: `${name}!A1:${lastCol}1`,
    });
    const hasHeader = (res.data.values || []).length > 0;
    if (!hasHeader) {
      await client.spreadsheets.values.update({
        spreadsheetId,
        range: `${name}!A1:${lastCol}1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [columns] },
      });
    }
  }

  readyChecked = true;
}

module.exports = {
  SHEETS,
  getRows,
  appendRow,
  appendRows,
  updateRow,
  ensureReady,
};
