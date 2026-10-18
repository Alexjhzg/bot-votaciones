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
  horaReportadaKey: string;
  horaRecibidaKey: string;
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

  // Polyfill del transporter de gtoken con fetch nativo para máxima estabilidad en Node.js
  const origCreateGToken = (auth as any).createGToken.bind(auth);
  (auth as any).createGToken = function () {
    const gtoken = origCreateGToken();
    gtoken.transporter = {
      request: async (opts: any) => {
        const body = opts.data
          ? typeof opts.data === "object"
            ? new URLSearchParams(opts.data).toString()
            : opts.data
          : undefined;

        const res = await fetch(opts.url, {
          method: opts.method,
          headers: opts.headers,
          body,
        });

        const data = await res.json();
        return { data, status: res.status, headers: Object.fromEntries(res.headers.entries()) };
      },
    };
    return gtoken;
  };

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

  const horaReportadaKey =
    buscarColumna([
      /^hora.*report/i,
      /^report.*hora/i,
      /^hora.*voto/i,
      /^hora$/i,
      /^fecha.*hora$/i,
    ]) || "Hora Reportada";

  const horaRecibidaKey =
    buscarColumna([
      /^hora.*recib/i,
      /^recib.*hora/i,
      /^hora.*lleg/i,
      /^hora.*mensaj/i,
      /^hora.*telegram/i,
      /^timestamp$/i,
    ]) || "Hora Recibida";

  const fechaHoraKey = horaReportadaKey;

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
    horaReportadaKey,
    horaRecibidaKey,
    fechaHoraKey,
    corteKey,
    reportadoPorKey,
  };
}

/**
 * Asegura que la hoja tenga las columnas de auditoría de voto:
 * "Voto Listo", "Hora Reportada", "Hora Recibida", "Corte", "Reportado Por".
 * Si existía "Fecha y Hora" o "Hora", la renombra automáticamente a "Hora Reportada".
 */
export async function asegurarColumnasDeVoto(
  sheet: GoogleSpreadsheetWorksheet
): Promise<HeaderMapping> {
  await sheet.loadHeaderRow();
  let headers = [...sheet.headerValues];

  // Renombrar automáticamente "Fecha y Hora" o "Hora" a "Hora Reportada" si aún no existe
  const tieneHoraReportada = headers.some((h) =>
    /^hora.*report|^report.*hora/i.test(normalizarTexto(h))
  );

  let renombrado = false;
  if (!tieneHoraReportada) {
    headers = headers.map((h) => {
      const norm = normalizarTexto(h);
      if (norm === "hora" || norm === "fecha y hora") {
        renombrado = true;
        return "Hora Reportada";
      }
      return h;
    });
  }

  if (renombrado) {
    await sheet.setHeaderRow(headers);
  }

  let mapping = detectarMapeoColumnas(headers);
  let huboCambios = false;

  const columnasRequeridas = [
    { key: mapping.votoKey, fallback: "Voto Listo" },
    { key: mapping.horaReportadaKey, fallback: "Hora Reportada" },
    { key: mapping.horaRecibidaKey, fallback: "Hora Recibida" },
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
    if (headers.length > sheet.columnCount) {
      await sheet.resize({ rowCount: sheet.rowCount, columnCount: headers.length });
    }
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
