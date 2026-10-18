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
import { voteQueue } from "./queue.js";

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
  horaReportada: string | null;
  horaRecibida: string | null;
  fechaHoraVoto: string | null; // Alias para retrocompatibilidad
  reportadoPor: string | null;
  sheetTitle: string;
  mapping: HeaderMapping;
  rowRef: GoogleSpreadsheetRow;
}

export interface OpcionesRegistroVoto {
  horaReportada?: { horaStr: string; corte: string };
  horaRecibida?: string;
  fechaRecibida?: Date;
  corteRecibido?: string;
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
          const esSegen =
            nominaFinal.toUpperCase().includes("SEGEN") || title.toLowerCase().includes("segen");

          let horaReportada: string | null = null;
          let horaRecibida: string | null = null;

          if (esSegen) {
            horaReportada =
              String(
                (mapping.horaReportadaKey ? row.get(mapping.horaReportadaKey) : "") ||
                (mapping.fechaHoraKey ? row.get(mapping.fechaHoraKey) : "") ||
                ""
              ).trim() || null;
            horaRecibida =
              String(
                (mapping.horaRecibidaKey ? row.get(mapping.horaRecibidaKey) : "") || ""
              ).trim() || null;
          } else {
            // INE: Solo debe tener Hora Recibida (no maneja Hora Reportada)
            const horaIne =
              String(
                (mapping.horaRecibidaKey ? row.get(mapping.horaRecibidaKey) : "") ||
                (mapping.horaKey ? row.get(mapping.horaKey) : "") ||
                ""
              ).trim() || null;
            horaRecibida = horaIne;
            horaReportada = null;
          }
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
            horaReportada,
            horaRecibida,
            fechaHoraVoto: horaReportada,
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
  /**
   * Recarga los datos desde Google Sheets protegiendo la ejecución a través de la cola.
   */
  public async recargar(): Promise<number> {
    return voteQueue.add(
      async () => {
        await this.inicializar();
        return this.voters.size;
      },
      { label: "Sincronización Nómina Sheets" }
    );
  }

  /**
   * Consulta los datos de un elector por cédula (lectura rápida en memoria).
   */
  public consultar(cedulaRaw: string): VoterRecord | null {
    const cedula = limpiarCedula(cedulaRaw);
    return this.voters.get(cedula) || null;
  }

  /**
   * Devuelve la cantidad de operaciones actualmente en cola de espera.
   */
  public getColaPendientes(): number {
    return voteQueue.getPendingCount();
  }

  /**
   * Registra el "voto listo" de un elector a través de la cola secuencial.
   * Evita condiciones de carrera y previene pérdida de reportes simultáneos.
   */
  public async registrarVoto(
    cedulaRaw: string,
    remitente: string,
    opcionesOHoraPersonalizada?:
      | OpcionesRegistroVoto
      | { horaStr: string; corte: string }
  ): Promise<RegistroResultado> {
    const cedula = limpiarCedula(cedulaRaw);
    return voteQueue.add(
      async () => {
        return this.ejecutarRegistroVoto(cedula, remitente, opcionesOHoraPersonalizada);
      },
      { label: `Registro Voto C.I. ${cedula}` }
    );
  }

  /**
   * Lógica interna atómica de registro de voto (ejecutada dentro de la cola).
   */
  private async ejecutarRegistroVoto(
    cedula: string,
    remitente: string,
    opcionesOHoraPersonalizada?:
      | OpcionesRegistroVoto
      | { horaStr: string; corte: string }
  ): Promise<RegistroResultado> {
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
        fechaHoraPrevia: voter.horaReportada || voter.fechaHoraVoto,
        reportadoPorPrevio: voter.reportadoPor,
      };
    }

    // Determinar nómina para aplicar la regla de reportería correspondiente
    const esSegen =
      voter.nomina.toUpperCase().includes("SEGEN") ||
      voter.sheetTitle.toLowerCase().includes("segen");

    // Normalizar opciones de reporte y recepción
    let horaReportadaOpt: { horaStr: string; corte: string } | undefined;
    let horaRecibidaOpt: string | undefined;
    let fechaRecibidaOpt: Date | undefined;
    let corteRecibidoOpt: string | undefined;

    if (opcionesOHoraPersonalizada) {
      if ("horaStr" in opcionesOHoraPersonalizada && "corte" in opcionesOHoraPersonalizada) {
        horaReportadaOpt = opcionesOHoraPersonalizada;
      } else {
        const opts = opcionesOHoraPersonalizada as OpcionesRegistroVoto;
        horaReportadaOpt = opts.horaReportada;
        horaRecibidaOpt = opts.horaRecibida;
        fechaRecibidaOpt = opts.fechaRecibida;
        corteRecibidoOpt = opts.corteRecibido;
      }
    }

    const fechaRecibidaBase = fechaRecibidaOpt || new Date();
    const infoTiempoRecibido = obtenerFechaHoraActual(config.app.timezone, fechaRecibidaBase);
    const horaRecibidaFinal = horaRecibidaOpt || infoTiempoRecibido.horaStr;
    const corteRecibidoFinal =
      corteRecibidoOpt ||
      determinarCortePorHora(infoTiempoRecibido.hora24, infoTiempoRecibido.minuto).etiqueta;

    let horaReportadaFinal: string;
    let corteFinal: string;

    if (esSegen) {
      // =========================================================================
      // SEGEN: Maneja formato estructurado de Nodo -> Hora Reportada y Hora Recibida
      // =========================================================================
      if (horaReportadaOpt) {
        horaReportadaFinal = horaReportadaOpt.horaStr;
        corteFinal = horaReportadaOpt.corte;
      } else {
        // En caso de reporte directo de un elector de SEGEN, ambas horas coinciden con Telegram
        horaReportadaFinal = horaRecibidaFinal;
        corteFinal = corteRecibidoFinal;
      }
    } else {
      // =========================================================================
      // INE: Solo debe tener Hora Recibida (la hora de llegada en Telegram)
      // =========================================================================
      horaReportadaFinal = "";
      corteFinal = corteRecibidoFinal;
    }

    // Actualizar en memoria primero (protege contra reintentos concurrentes)
    voter.haVotado = true;
    voter.corte = corteFinal;
    voter.horaReportada = esSegen ? horaReportadaFinal : null;
    voter.horaRecibida = horaRecibidaFinal;
    voter.fechaHoraVoto = horaRecibidaFinal;
    voter.reportadoPor = remitente;

    // Persistir de inmediato en Google Sheets según la estructura de la nómina
    try {
      voter.rowRef.set(voter.mapping.votoKey, "SI");

      if (esSegen) {
        // En SEGEN guardamos Hora Reportada y Hora Recibida en sus respectivas columnas
        const colReportada = voter.mapping.horaReportadaKey || "Hora Reportada";
        const colRecibida = voter.mapping.horaRecibidaKey || "Hora Recibida";
        voter.rowRef.set(colReportada, horaReportadaFinal);
        voter.rowRef.set(colRecibida, horaRecibidaFinal);
      } else {
        // En INE solo se guarda en la columna 'Hora Recibida'
        const colRecibida = voter.mapping.horaRecibidaKey || voter.mapping.horaKey || "Hora Recibida";
        voter.rowRef.set(colRecibida, horaRecibidaFinal);
      }

      voter.rowRef.set(voter.mapping.corteKey, corteFinal);
      voter.rowRef.set(voter.mapping.reportadoPorKey, remitente);
      await voter.rowRef.save();
      console.log(
        `[INFO] [COLA] Voto guardado en Sheets [${voter.nomina}]: C.I. ${cedula} (${voter.nombre}) - ` +
          (esSegen
            ? `Reportada: ${horaReportadaFinal} | Recibida: ${horaRecibidaFinal} | Corte: ${corteFinal}`
            : `Hora Recibida: ${horaRecibidaFinal} | Corte: ${corteFinal}`)
      );
    } catch (err) {
      console.error(`[ERROR] [COLA] Falló al guardar el voto en Google Sheets para C.I. ${cedula}:`, err);
      // Revertir memoria si falló la persistencia definitiva
      voter.haVotado = false;
      voter.corte = null;
      voter.horaReportada = null;
      voter.horaRecibida = null;
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
   * Deshace el registro de voto a través de la cola secuencial.
   */
  public async deshacerVoto(
    cedulaRaw: string,
    remitente: string
  ): Promise<{ status: "SUCCESS" | "NOT_FOUND" | "NOT_VOTED"; voter?: VoterRecord }> {
    const cedula = limpiarCedula(cedulaRaw);
    return voteQueue.add(
      async () => {
        return this.ejecutarDeshacerVoto(cedula, remitente);
      },
      { label: `Deshacer Voto C.I. ${cedula}` }
    );
  }

  /**
   * Lógica interna atómica de deshacer voto (ejecutada dentro de la cola).
   */
  private async ejecutarDeshacerVoto(
    cedula: string,
    remitente: string
  ): Promise<{ status: "SUCCESS" | "NOT_FOUND" | "NOT_VOTED"; voter?: VoterRecord }> {
    const voter = this.voters.get(cedula);

    if (!voter) return { status: "NOT_FOUND" };
    if (!voter.haVotado) return { status: "NOT_VOTED", voter };

    const esSegen =
      voter.nomina.toUpperCase().includes("SEGEN") ||
      voter.sheetTitle.toLowerCase().includes("segen");

    voter.haVotado = false;
    voter.corte = null;
    voter.horaReportada = null;
    voter.horaRecibida = null;
    voter.fechaHoraVoto = null;
    voter.reportadoPor = null;

    try {
      voter.rowRef.set(voter.mapping.votoKey, "NO");
      if (esSegen) {
        if (voter.mapping.horaReportadaKey) {
          voter.rowRef.set(voter.mapping.horaReportadaKey, "");
        }
        if (voter.mapping.horaRecibidaKey) {
          voter.rowRef.set(voter.mapping.horaRecibidaKey, "");
        }
      } else {
        const colRecibida = voter.mapping.horaRecibidaKey || voter.mapping.horaKey || "Hora Recibida";
        voter.rowRef.set(colRecibida, "");
      }
      voter.rowRef.set(voter.mapping.corteKey, "");
      voter.rowRef.set(voter.mapping.reportadoPorKey, `Deshecho por ${remitente}`);
      await voter.rowRef.save();
      console.log(`[INFO] [COLA] Voto deshecho en Sheets para C.I. ${cedula} [${voter.nomina}]`);
    } catch (err) {
      console.error(`[ERROR] [COLA] Falló al deshacer voto en Google Sheets para C.I. ${cedula}:`, err);
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
