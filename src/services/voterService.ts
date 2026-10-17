import { GoogleSpreadsheetRow } from "google-spreadsheet";
import { cargarHojasDeNomina, SheetData, HeaderMapping } from "./sheets.js";
import {
  limpiarCedula,
  formatearCedula,
  normalizarTexto,
  normalizarCargo,
  obtenerFechaHoraActual,
  determinarCortePorHora,
  obtenerCorteActivoActual,
  CORTES_ETIQUETAS,
} from "../utils/parser.js";
import { config } from "../config/index.js";

export interface VoterRecord {
  cedula: string;
  nombre: string;
  nomina: string;
  cargo: string;
  unidad: string;
  centro: string;
  mesa: string;
  parroquia: string;
  municipio: string;
  haVotado: boolean;
  corte: string | null;
  fechaHoraVoto: string | null;
  reportadoPor: string | null;
  sheetTitle: string;
  mapping: HeaderMapping;
  rowRef: GoogleSpreadsheetRow;
}

export type RegistroResultadoStatus = "SUCCESS" | "ALREADY_VOTED" | "NOT_FOUND";

export interface RegistroResultado {
  status: RegistroResultadoStatus;
  cedula: string;
  voter?: VoterRecord;
  fechaHoraPrevia?: string | null;
  reportadoPorPrevio?: string | null;
}

export interface DesgloseItem {
  nombre: string;
  total: number;
  votaron: number;
  pendientes: number;
  porcentaje: string;
}

export interface EstadisticasNominaIndividual {
  nomina: string;
  total: number;
  votaron: number;
  pendientes: number;
  porcentaje: string;
  porCorte: Record<string, number>;
  cedulasPorCorte: Record<string, string[]>;
  porCargo: Record<string, DesgloseItem>;
  porUnidad: Record<string, DesgloseItem>;
}

export interface EstadisticasNomina {
  total: number;
  votaron: number;
  pendientes: number;
  porcentajeVotaron: string;
  corteActivo: string;
  porCorte: Record<string, number>;
  porNomina: Record<string, EstadisticasNominaIndividual>;
}

function normalizarNombreNomina(valor: string, defaultName: string): string {
  const norm = normalizarTexto(valor || defaultName);
  if (norm.includes("segen")) return "SEGEN";
  if (norm.includes("ine")) return "INE";
  return valor || defaultName || "General";
}

class VoterService {
  private voters: Map<string, VoterRecord> = new Map();
  private hojasData: SheetData[] = [];
  private estaCargado = false;
  private cargandoPromise: Promise<void> | null = null;

  /**
   * Carga e indexa todos los electores en memoria desde Google Sheets.
   */
  public async inicializar(): Promise<void> {
    if (this.cargandoPromise) return this.cargandoPromise;

    this.cargandoPromise = (async () => {
      console.log("[INFO] Cargando e indexando padrón de electores desde Google Sheets...");
      this.voters.clear();
      this.hojasData = await cargarHojasDeNomina();

      let totalRegistros = 0;

      for (const sheetData of this.hojasData) {
        const { rows, mapping, title } = sheetData;
        const nominaPorDefecto = normalizarNombreNomina(title, title);

        for (const row of rows) {
          const rawCedula = String(row.get(mapping.cedulaKey) || "");
          const cedulaLimpia = limpiarCedula(rawCedula);

          if (!cedulaLimpia) continue;

          const rawNombre = String(row.get(mapping.nombreKey) || "").trim();
          const rawNomina = mapping.nominaKey
            ? String(row.get(mapping.nominaKey) || "").trim()
            : "";
          const nominaFinal = normalizarNombreNomina(rawNomina, nominaPorDefecto);

          const rawCargo = mapping.cargoKey
            ? String(row.get(mapping.cargoKey) || "").trim()
            : "";
          const cargoFinal = normalizarCargo(rawCargo);
          const rawUnidad = mapping.unidadKey
            ? String(row.get(mapping.unidadKey) || "").trim()
            : "";

          const rawCentro = mapping.centroKey
            ? String(row.get(mapping.centroKey) || "").trim()
            : "";
          const rawMesa = mapping.mesaKey
            ? String(row.get(mapping.mesaKey) || "").trim()
            : "";
          const rawParroquia = mapping.parroquiaKey
            ? String(row.get(mapping.parroquiaKey) || "").trim()
            : "";
          const rawMunicipio = mapping.municipioKey
            ? String(row.get(mapping.municipioKey) || "").trim()
            : "";

          const rawVoto = String(row.get(mapping.votoKey) || "");
          const normVoto = normalizarTexto(rawVoto);
          const haVotado =
            normVoto === "si" ||
            normVoto === "listo" ||
            normVoto === "voto" ||
            normVoto === "voto listo" ||
            normVoto === "1" ||
            normVoto === "true";

          const rawCorte = String(row.get(mapping.corteKey) || "").trim() || null;
          const fechaHoraVoto = String(row.get(mapping.fechaHoraKey) || "").trim() || null;
          const reportadoPor = String(row.get(mapping.reportadoPorKey) || "").trim() || null;

          const voter: VoterRecord = {
            cedula: cedulaLimpia,
            nombre: rawNombre || "Sin nombre registrado",
            nomina: nominaFinal,
            cargo: cargoFinal,
            unidad: rawUnidad || "Sin unidad",
            centro: rawCentro,
            mesa: rawMesa,
            parroquia: rawParroquia,
            municipio: rawMunicipio,
            haVotado,
            corte: rawCorte,
            fechaHoraVoto,
            reportadoPor,
            sheetTitle: title,
            mapping,
            rowRef: row,
          };

          this.voters.set(cedulaLimpia, voter);
          totalRegistros++;
        }
      }

      this.estaCargado = true;
      console.log(`[INFO] Indexación completa: ${totalRegistros} electores listos en memoria.`);
    })();

    try {
      await this.cargandoPromise;
    } finally {
      this.cargandoPromise = null;
    }
  }

  /**
   * Recarga los datos desde Google Sheets.
   */
  public async recargar(): Promise<number> {
    await this.inicializar();
    return this.voters.size;
  }

  /**
   * Consulta los datos de un elector por cédula.
   */
  public consultar(cedulaRaw: string): VoterRecord | null {
    const cedula = limpiarCedula(cedulaRaw);
    return this.voters.get(cedula) || null;
  }

  /**
   * Registra el "voto listo" de un elector asignándole el corte horario oficial.
   * Actualiza inmediatamente en memoria y persiste en Google Sheets de forma segura.
   */
  public async registrarVoto(
    cedulaRaw: string,
    remitente: string,
    horaPersonalizada?: { horaStr: string; corte: string }
  ): Promise<RegistroResultado> {
    const cedula = limpiarCedula(cedulaRaw);
    const voter = this.voters.get(cedula);

    if (!voter) {
      return {
        status: "NOT_FOUND",
        cedula,
      };
    }

    if (voter.haVotado) {
      return {
        status: "ALREADY_VOTED",
        cedula,
        voter,
        fechaHoraPrevia: voter.fechaHoraVoto,
        reportadoPorPrevio: voter.reportadoPor,
      };
    }

    // Hora y corte horario oficial activo (o personalizado si proviene de un reporte formal)
    let horaFinal: string;
    let corteFinal: string;

    if (horaPersonalizada) {
      horaFinal = horaPersonalizada.horaStr;
      corteFinal = horaPersonalizada.corte;
    } else {
      const { horaStr, hora24, minuto } = obtenerFechaHoraActual(config.app.timezone);
      const corte = determinarCortePorHora(hora24, minuto);
      horaFinal = horaStr;
      corteFinal = corte.etiqueta;
    }

    // Actualizar en memoria primero (respuesta instantánea)
    voter.haVotado = true;
    voter.corte = corteFinal;
    voter.fechaHoraVoto = horaFinal;
    voter.reportadoPor = remitente;

    // Persistir de inmediato en Google Sheets
    try {
      voter.rowRef.set(voter.mapping.votoKey, "SI");
      voter.rowRef.set(voter.mapping.fechaHoraKey, horaFinal);
      voter.rowRef.set(voter.mapping.corteKey, corteFinal);
      voter.rowRef.set(voter.mapping.reportadoPorKey, remitente);
      await voter.rowRef.save();
      console.log(
        `[INFO] Voto guardado en Sheets: C.I. ${cedula} (${voter.nombre}) [${voter.nomina} - ${voter.cargo} / ${voter.unidad}] - Corte: ${corteFinal}`
      );
    } catch (err) {
      console.error(`[ERROR] Falló al guardar el voto en Google Sheets para C.I. ${cedula}:`, err);
      // Revertir memoria si falló la persistencia
      voter.haVotado = false;
      voter.corte = null;
      voter.fechaHoraVoto = null;
      voter.reportadoPor = null;
      throw err;
    }

    return {
      status: "SUCCESS",
      cedula,
      voter,
    };
  }

  /**
   * Deshace el registro de voto en caso de equivocación de un usuario.
   */
  public async deshacerVoto(
    cedulaRaw: string,
    remitente: string
  ): Promise<{ status: "SUCCESS" | "NOT_FOUND" | "NOT_VOTED"; voter?: VoterRecord }> {
    const cedula = limpiarCedula(cedulaRaw);
    const voter = this.voters.get(cedula);

    if (!voter) return { status: "NOT_FOUND" };
    if (!voter.haVotado) return { status: "NOT_VOTED", voter };

    voter.haVotado = false;
    voter.corte = null;
    voter.fechaHoraVoto = null;
    voter.reportadoPor = null;

    try {
      voter.rowRef.set(voter.mapping.votoKey, "NO");
      voter.rowRef.set(voter.mapping.fechaHoraKey, "");
      voter.rowRef.set(voter.mapping.corteKey, "");
      voter.rowRef.set(voter.mapping.reportadoPorKey, `Deshecho por ${remitente}`);
      await voter.rowRef.save();
      console.log(`[INFO] Voto deshecho en Sheets para C.I. ${cedula}`);
    } catch (err) {
      console.error(`[ERROR] Falló al deshacer voto en Google Sheets para C.I. ${cedula}:`, err);
      voter.haVotado = true; // revertir en memoria
      throw err;
    }

    return { status: "SUCCESS", voter };
  }

  /**
   * Genera el mapa inicial de cortes con 0 votos.
   */
  private crearMapaCortesInicial(): Record<string, number> {
    const cortes: Record<string, number> = {};
    for (const etiqueta of Object.values(CORTES_ETIQUETAS)) {
      cortes[etiqueta] = 0;
    }
    cortes["Cierre (Post-7:00 PM)"] = 0;
    return cortes;
  }

  /**
   * Genera el mapa inicial de cédulas por corte.
   */
  private crearMapaCedulasInicial(): Record<string, string[]> {
    const cedulas: Record<string, string[]> = {};
    for (const etiqueta of Object.values(CORTES_ETIQUETAS)) {
      cedulas[etiqueta] = [];
    }
    cedulas["Cierre (Post-7:00 PM)"] = [];
    return cedulas;
  }

  /**
   * Calcula estadísticas de participación globales y desglosadas por nómina individual (SEGEN e INE).
   * Para SEGEN: agrupa por cargos y calcula totalización.
   * Para INE: agrupa por unidad y acumula cédulas por cada corte.
   */
  public obtenerEstadisticas(): EstadisticasNomina {
    let total = 0;
    let votaron = 0;
    const porNomina: EstadisticasNomina["porNomina"] = {};
    const porCorteGlobal = this.crearMapaCortesInicial();

    for (const voter of this.voters.values()) {
      total++;
      const nom = voter.nomina;

      if (!porNomina[nom]) {
        porNomina[nom] = {
          nomina: nom,
          total: 0,
          votaron: 0,
          pendientes: 0,
          porcentaje: "0.0%",
          porCorte: this.crearMapaCortesInicial(),
          cedulasPorCorte: this.crearMapaCedulasInicial(),
          porCargo: {},
          porUnidad: {},
        };
      }
      porNomina[nom].total++;

      // Agrupación por Cargo (SEGEN)
      const cargo = normalizarCargo(voter.cargo || "Sin cargo");
      if (!porNomina[nom].porCargo[cargo]) {
        porNomina[nom].porCargo[cargo] = {
          nombre: cargo,
          total: 0,
          votaron: 0,
          pendientes: 0,
          porcentaje: "0.0%",
        };
      }
      porNomina[nom].porCargo[cargo].total++;

      // Agrupación por Unidad (INE)
      const unidad = voter.unidad || "Sin unidad";
      if (!porNomina[nom].porUnidad[unidad]) {
        porNomina[nom].porUnidad[unidad] = {
          nombre: unidad,
          total: 0,
          votaron: 0,
          pendientes: 0,
          porcentaje: "0.0%",
        };
      }
      porNomina[nom].porUnidad[unidad].total++;

      if (voter.haVotado) {
        votaron++;
        porNomina[nom].votaron++;
        porNomina[nom].porCargo[cargo].votaron++;
        porNomina[nom].porUnidad[unidad].votaron++;

        if (voter.corte) {
          if (porCorteGlobal[voter.corte] !== undefined) {
            porCorteGlobal[voter.corte]++;
          } else {
            porCorteGlobal[voter.corte] = (porCorteGlobal[voter.corte] || 0) + 1;
          }

          if (porNomina[nom].porCorte[voter.corte] !== undefined) {
            porNomina[nom].porCorte[voter.corte]++;
            porNomina[nom].cedulasPorCorte[voter.corte].push(voter.cedula);
          } else {
            porNomina[nom].porCorte[voter.corte] =
              (porNomina[nom].porCorte[voter.corte] || 0) + 1;
            if (!porNomina[nom].cedulasPorCorte[voter.corte]) {
              porNomina[nom].cedulasPorCorte[voter.corte] = [];
            }
            porNomina[nom].cedulasPorCorte[voter.corte].push(voter.cedula);
          }
        }
      }
    }

    const pctGlobal = total > 0 ? ((votaron / total) * 100).toFixed(1) : "0.0";

    for (const nom of Object.keys(porNomina)) {
      const item = porNomina[nom];
      item.pendientes = item.total - item.votaron;
      item.porcentaje =
        item.total > 0 ? `${((item.votaron / item.total) * 100).toFixed(1)}%` : "0.0%";

      // Porcentajes de cargos
      for (const c of Object.values(item.porCargo)) {
        c.pendientes = c.total - c.votaron;
        c.porcentaje = c.total > 0 ? `${((c.votaron / c.total) * 100).toFixed(1)}%` : "0.0%";
      }

      // Porcentajes de unidades
      for (const u of Object.values(item.porUnidad)) {
        u.pendientes = u.total - u.votaron;
        u.porcentaje = u.total > 0 ? `${((u.votaron / u.total) * 100).toFixed(1)}%` : "0.0%";
      }
    }

    const { etiqueta: corteActivo } = obtenerCorteActivoActual(config.app.timezone);

    return {
      total,
      votaron,
      pendientes: total - votaron,
      porcentajeVotaron: `${pctGlobal}%`,
      corteActivo,
      porCorte: porCorteGlobal,
      porNomina,
    };
  }

  /**
   * Obtiene las estadísticas exclusivas para una nómina específica ("SEGEN" o "INE").
   */
  public obtenerEstadisticasNomina(nombreNomina: string): EstadisticasNominaIndividual | null {
    const stats = this.obtenerEstadisticas();
    const buscada = normalizarTexto(nombreNomina);

    for (const [key, val] of Object.entries(stats.porNomina)) {
      if (normalizarTexto(key).includes(buscada)) {
        return val;
      }
    }
    return null;
  }

  /**
   * Obtiene el detalle de electores que han reportado por unidad y quiénes faltan.
   * Si se especifica un filtro (ej: "economica", "seem"), busca esa unidad.
   * Si no, devuelve todas las unidades ordenadas.
   */
  public obtenerDetallePorUnidad(filtro?: string): {
    unidades: Array<{
      nombre: string;
      total: number;
      votaron: number;
      pendientes: number;
      porcentaje: string;
      electoresVotaron: VoterRecord[];
      electoresPendientes: VoterRecord[];
    }>;
    unidadEspecifica?: {
      nombre: string;
      total: number;
      votaron: number;
      pendientes: number;
      porcentaje: string;
      electoresVotaron: VoterRecord[];
      electoresPendientes: VoterRecord[];
    };
    encontrada: boolean;
  } {
    const mapaUnidades: Map<string, {
      nombre: string;
      total: number;
      votaron: number;
      pendientes: number;
      porcentaje: string;
      electoresVotaron: VoterRecord[];
      electoresPendientes: VoterRecord[];
    }> = new Map();

    for (const voter of this.voters.values()) {
      const u = voter.unidad && voter.unidad !== "Sin unidad" ? voter.unidad.trim() : null;
      if (!u) continue;

      if (!mapaUnidades.has(u)) {
        mapaUnidades.set(u, {
          nombre: u,
          total: 0,
          votaron: 0,
          pendientes: 0,
          porcentaje: "0.0%",
          electoresVotaron: [],
          electoresPendientes: [],
        });
      }

      const item = mapaUnidades.get(u)!;
      item.total++;
      if (voter.haVotado) {
        item.votaron++;
        item.electoresVotaron.push(voter);
      } else {
        item.pendientes++;
        item.electoresPendientes.push(voter);
      }
    }

    const unidades = Array.from(mapaUnidades.values()).map((item) => {
      item.porcentaje =
        item.total > 0 ? `${((item.votaron / item.total) * 100).toFixed(1)}%` : "0.0%";
      return item;
    });

    unidades.sort((a, b) => b.total - a.total);

    if (filtro && filtro.trim()) {
      const buscado = normalizarTexto(filtro);
      const coincidencia = unidades.find((u) => normalizarTexto(u.nombre).includes(buscado));
      if (coincidencia) {
        return {
          unidades,
          unidadEspecifica: coincidencia,
          encontrada: true,
        };
      }
      return {
        unidades,
        encontrada: false,
      };
    }

    return {
      unidades,
      encontrada: true,
    };
  }
}

export const voterService = new VoterService();
