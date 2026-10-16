import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet, GoogleSpreadsheetRow } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { config } from "../config/index.js";
import { normalizarTexto } from "../utils/parser.js";

export interface HeaderMapping {
  cedulaKey: string;
  nombreKey: string;
  nominaKey?: string;
  cargoKey?: string;
  unidadKey?: string;
  centroKey?: string;
  mesaKey?: string;
  parroquiaKey?: string;
  municipioKey?: string;
  votoKey: string;
  fechaHoraKey: string;
  corteKey: string;
  reportadoPorKey: string;
}

export interface SheetData {
  sheet: GoogleSpreadsheetWorksheet;
  title: string;
  rows: GoogleSpreadsheetRow[];
  mapping: HeaderMapping;
}

let docInstance: GoogleSpreadsheet | null = null;

/**
 * Inicializa y autentica la conexión a Google Sheets.
 */
export async function obtenerDocumento(): Promise<GoogleSpreadsheet> {
  if (docInstance) return docInstance;

  console.log(`[INFO] Autenticando con cuenta de servicio: ${config.google.serviceAccountEmail}`);
  const auth = new JWT({
    email: config.google.serviceAccountEmail,
    key: config.google.privateKey,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });

  const doc = new GoogleSpreadsheet(config.google.spreadsheetId, auth);
  await doc.loadInfo();
  docInstance = doc;
  return doc;
}

/**
 * Mapea de forma inteligente los nombres de columnas de una hoja dada.
 */
export function detectarMapeoColumnas(headerValues: string[]): HeaderMapping {
  const normHeaders = headerValues.map((h) => ({
    original: h,
    norm: normalizarTexto(h),
  }));

  const buscarColumna = (patrones: RegExp[]): string | undefined => {
    for (const pat of patrones) {
      const match = normHeaders.find((h) => pat.test(h.norm));
      if (match) return match.original;
    }
    return undefined;
  };

  const cedulaKey =
    buscarColumna([
      /^cedula$/i,
      /^ci$/i,
      /^c\.i\.?$/i,
      /^documento$/i,
      /cedula/i,
      /identidad/i,
    ]) || "Cédula";

  const nombreKey =
    buscarColumna([
      /^nombre$/i,
      /^nombres$/i,
      /nombre.*apellido/i,
      /apellido.*nombre/i,
      /^elector$/i,
      /^funcionario$/i,
      /^trabajador$/i,
      /nombre/i,
    ]) || "Nombre y Apellido";

  const nominaKey = buscarColumna([
    /^nomina$/i,
    /^institucion$/i,
    /^dependencia$/i,
    /^ente$/i,
    /^organismo$/i,
    /^segen$/i,
    /^ine$/i,
  ]);

  const cargoKey = buscarColumna([
    /^cargo$/i,
    /^cargos$/i,
    /^puesto$/i,
    /^funcion$/i,
    /^rol$/i,
    /cargo/i,
  ]);

  const unidadKey = buscarColumna([
    /^unidad$/i,
    /^unidades$/i,
    /unidad.*admin/i,
    /^gerencia$/i,
    /^departamento$/i,
    /^division$/i,
    /^area$/i,
    /unidad/i,
  ]);

  const centroKey = buscarColumna([
    /^centro$/i,
    /centro.*votacion/i,
    /^colegio$/i,
    /^cv$/i,
    /centro/i,
  ]);

  const mesaKey = buscarColumna([
    /^mesa$/i,
    /mesa.*votacion/i,
    /nro.*mesa/i,
  ]);

  const parroquiaKey = buscarColumna([/^parroquia$/i, /parroquia/i]);
  const municipioKey = buscarColumna([/^municipio$/i, /municipio/i]);

  const votoKey =
    buscarColumna([
      /^voto$/i,
      /^voto.*listo$/i,
      /^estado$/i,
      /^estatus$/i,
      /^ya.*voto$/i,
      /voto/i,
    ]) || "Voto Listo";

  const fechaHoraKey =
    buscarColumna([
      /^hora$/i,
      /^hora.*voto$/i,
      /^hora.*registro$/i,
      /^fecha.*hora$/i,
      /^fecha$/i,
      /^timestamp$/i,
    ]) || "Hora";

  const corteKey =
    buscarColumna([
      /^corte$/i,
      /corte.*horario/i,
      /bloque.*horario/i,
      /^bloque$/i,
    ]) || "Corte";

  const reportadoPorKey =
    buscarColumna([
      /^reportado.*por$/i,
      /^usuario$/i,
      /^remitente$/i,
      /^registrado.*por$/i,
    ]) || "Reportado Por";

  return {
    cedulaKey,
    nombreKey,
    nominaKey,
    cargoKey,
    unidadKey,
    centroKey,
    mesaKey,
    parroquiaKey,
    municipioKey,
    votoKey,
    fechaHoraKey,
    corteKey,
    reportadoPorKey,
  };
}

/**
 * Asegura que la hoja tenga las columnas de auditoría de voto ("Voto Listo", "Hora", "Corte", "Reportado Por").
 * Si existe "Fecha y Hora", la renombra automáticamente a "Hora".
 */
export async function asegurarColumnasDeVoto(
  sheet: GoogleSpreadsheetWorksheet
): Promise<HeaderMapping> {
  await sheet.loadHeaderRow();
  let headers = [...sheet.headerValues];

  // Renombrar automáticamente "Fecha y Hora" a "Hora" si existía previamente
  let renombrado = false;
  headers = headers.map((h) => {
    if (normalizarTexto(h) === "fecha y hora") {
      renombrado = true;
      return "Hora";
    }
    return h;
  });

  if (renombrado) {
    await sheet.setHeaderRow(headers);
  }

  let mapping = detectarMapeoColumnas(headers);
  let huboCambios = false;

  const columnasRequeridas = [
    { key: mapping.votoKey, fallback: "Voto Listo" },
    { key: mapping.fechaHoraKey, fallback: "Hora" },
    { key: mapping.corteKey, fallback: "Corte" },
    { key: mapping.reportadoPorKey, fallback: "Reportado Por" },
  ];

  for (const col of columnasRequeridas) {
    if (!headers.some((h) => normalizarTexto(h) === normalizarTexto(col.key))) {
      headers.push(col.fallback);
      huboCambios = true;
    }
  }

  if (huboCambios) {
    await sheet.setHeaderRow(headers);
    mapping = detectarMapeoColumnas(headers);
  }

  return mapping;
}

/**
 * Carga los datos de las pestañas relevantes de nómina (ej. SEGEN, INE o especificadas en .env).
 */
export async function cargarHojasDeNomina(): Promise<SheetData[]> {
  const doc = await obtenerDocumento();
  const resultados: SheetData[] = [];

  const titulosDisponibles = Object.keys(doc.sheetsByTitle);
  console.log(`[INFO] Pestañas detectadas en Google Sheets:`, titulosDisponibles);

  let hojasAProcesar: GoogleSpreadsheetWorksheet[] = [];

  if (config.google.sheetTabs.length > 0) {
    // Si el usuario especificó pestañas en .env
    for (const tabName of config.google.sheetTabs) {
      const sheet = doc.sheetsByTitle[tabName];
      if (sheet) {
        hojasAProcesar.push(sheet);
      } else {
        console.warn(`[ADVERTENCIA] La pestaña configurada "${tabName}" no existe en el documento.`);
      }
    }
  } else {
    // Búsqueda automática por nombres conocidos: SEGEN, INE, nomina, electores, o la primera hoja
    for (const title of titulosDisponibles) {
      const norm = normalizarTexto(title);
      if (
        norm.includes("segen") ||
        norm.includes("ine") ||
        norm.includes("nomina") ||
        norm.includes("elector") ||
        norm.includes("padron") ||
        norm.includes("votacion")
      ) {
        hojasAProcesar.push(doc.sheetsByTitle[title]);
      }
    }

    // Si ninguna coincide con palabras clave, tomar la primera hoja del documento
    if (hojasAProcesar.length === 0 && titulosDisponibles.length > 0) {
      console.log(`[INFO] Usando la primera pestaña disponible: "${titulosDisponibles[0]}"`);
      hojasAProcesar.push(doc.sheetsByIndex[0]);
    }
  }

  for (const sheet of hojasAProcesar) {
    try {
      const mapping = await asegurarColumnasDeVoto(sheet);
      const rows = await sheet.getRows();
      resultados.push({
        sheet,
        title: sheet.title,
        rows,
        mapping,
      });
      console.log(`[INFO] Pestaña "${sheet.title}" cargada con ${rows.length} registros.`);
    } catch (err) {
      console.error(`[ERROR] No se pudo leer la pestaña "${sheet.title}":`, err);
    }
  }

  return resultados;
}
