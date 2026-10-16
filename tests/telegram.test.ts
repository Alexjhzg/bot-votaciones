import test from "node:test";
import assert from "node:assert/strict";
import {
  formatearTarjetaElector,
  formatearConfirmacionVoto,
  formatearAlertaYaVoto,
  formatearReporteNomina,
  formatearReporteCorteNomina,
  obtenerReportesSeparados,
  obtenerReportesCorteSeparados,
} from "../src/utils/telegram.js";
import { VoterRecord, EstadisticasNomina } from "../src/services/voterService.js";

const mockVoter: VoterRecord = {
  cedula: "27334492",
  nombre: "María Pérez",
  nomina: "SEGEN",
  centro: "E.B. República de Venezuela",
  mesa: "1",
  parroquia: "San Simón",
  municipio: "Maturín",
  haVotado: false,
  corte: null,
  fechaHoraVoto: null,
  reportadoPor: null,
  sheetTitle: "SEGEN",
  mapping: {} as any,
  rowRef: {} as any,
};

test("formatearTarjetaElector muestra estado pendiente", () => {
  const card = formatearTarjetaElector(mockVoter);
  assert.match(card, /María Pérez/);
  assert.match(card, /V-27\.334\.492/);
  assert.match(card, /PENDIENTE POR VOTAR/);
  assert.match(card, /E\.B\. República de Venezuela/);
});

test("formatearTarjetaElector muestra estado ya votó", () => {
  const voterVoted: VoterRecord = {
    ...mockVoter,
    haVotado: true,
    corte: "10:00 AM",
    fechaHoraVoto: "16/10/2026 10:30 AM",
    reportadoPor: "@coordinador",
  };
  const card = formatearTarjetaElector(voterVoted);
  assert.match(card, /YA VOTÓ/);
  assert.match(card, /10:00 AM/);
  assert.match(card, /@coordinador/);
});

test("formatearConfirmacionVoto incluye datos clave y corte", () => {
  const voterVoted: VoterRecord = {
    ...mockVoter,
    haVotado: true,
    corte: "10:00 AM",
    fechaHoraVoto: "16/10/2026 09:15 AM",
  };
  const msg = formatearConfirmacionVoto(voterVoted);
  assert.match(msg, /VOTO REGISTRADO EXITOSAMENTE/);
  assert.match(msg, /V-27\.334\.492/);
  assert.match(msg, /10:00 AM/);
  assert.match(msg, /09:15 AM/);
});

test("formatearAlertaYaVoto previene duplicados", () => {
  const msg = formatearAlertaYaVoto(
    mockVoter,
    "16/10/2026 08:00 AM",
    "@usuario1"
  );
  assert.match(msg, /REGISTRADO PREVIAMENTE/);
  assert.match(msg, /08:00 AM/);
  assert.match(msg, /@usuario1/);
});

test("formatearReporteNomina emite reporte individual para SEGEN", () => {
  const statsSegen = {
    nomina: "SEGEN",
    total: 600,
    votaron: 300,
    pendientes: 300,
    porcentaje: "50.0%",
    porCorte: {
      "8:00 AM": 100,
      "10:00 AM": 200,
    },
  };
  const msg = formatearReporteNomina(statsSegen, "10:00 AM");
  assert.match(msg, /REPORTE DE PARTICIPACIÓN — NÓMINA SEGEN/);
  assert.match(msg, /Padrón SEGEN:\* 600 electores/);
  assert.match(msg, /50\.0%/);
  assert.match(msg, /8:00 AM:\* 100 votos/);
});

test("obtenerReportesSeparados devuelve 2 reportes distintos (SEGEN e INE)", () => {
  const stats: EstadisticasNomina = {
    total: 1000,
    votaron: 450,
    pendientes: 550,
    porcentajeVotaron: "45.0%",
    corteActivo: "12:00 PM",
    porCorte: {
      "8:00 AM": 150,
      "10:00 AM": 300,
    },
    porNomina: {
      SEGEN: {
        nomina: "SEGEN",
        total: 600,
        votaron: 300,
        pendientes: 300,
        porcentaje: "50.0%",
        porCorte: { "8:00 AM": 100, "10:00 AM": 200 },
      },
      INE: {
        nomina: "INE",
        total: 400,
        votaron: 150,
        pendientes: 250,
        porcentaje: "37.5%",
        porCorte: { "8:00 AM": 50, "10:00 AM": 100 },
      },
    },
  };

  const reportes = obtenerReportesSeparados(stats);
  assert.equal(reportes.length, 2);
  assert.equal(reportes[0].nomina, "SEGEN");
  assert.match(reportes[0].mensaje, /NÓMINA SEGEN/);
  assert.equal(reportes[1].nomina, "INE");
  assert.match(reportes[1].mensaje, /NÓMINA INE/);
});

test("obtenerReportesCorteSeparados emite 2 alertas oficiales distintas", () => {
  const stats: EstadisticasNomina = {
    total: 1000,
    votaron: 450,
    pendientes: 550,
    porcentajeVotaron: "45.0%",
    corteActivo: "10:00 AM",
    porCorte: { "10:00 AM": 300 },
    porNomina: {
      SEGEN: {
        nomina: "SEGEN",
        total: 600,
        votaron: 300,
        pendientes: 300,
        porcentaje: "50.0%",
        porCorte: { "10:00 AM": 200 },
      },
      INE: {
        nomina: "INE",
        total: 400,
        votaron: 150,
        pendientes: 250,
        porcentaje: "37.5%",
        porCorte: { "10:00 AM": 100 },
      },
    },
  };

  const reportesCorte = obtenerReportesCorteSeparados("10:00 AM", stats);
  assert.equal(reportesCorte.length, 2);
  assert.equal(reportesCorte[0].nomina, "SEGEN");
  assert.match(reportesCorte[0].mensaje, /CORTE DE LAS 10:00 AM/);
  assert.match(reportesCorte[0].mensaje, /NÓMINA SEGEN/);
  assert.match(reportesCorte[0].mensaje, /bloque de las 10:00 AM:\* 200/);

  assert.equal(reportesCorte[1].nomina, "INE");
  assert.match(reportesCorte[1].mensaje, /CORTE DE LAS 10:00 AM/);
  assert.match(reportesCorte[1].mensaje, /NÓMINA INE/);
  assert.match(reportesCorte[1].mensaje, /bloque de las 10:00 AM:\* 100/);
});
