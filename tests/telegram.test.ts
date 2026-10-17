import test from "node:test";
import assert from "node:assert/strict";
import {
  formatearTarjetaElector,
  formatearConfirmacionVoto,
  formatearAlertaYaVoto,
  formatearReporteSEGEN,
  formatearReporteINE,
  formatearReporteCorteSEGEN,
  formatearReporteCorteINE,
  obtenerReportesSeparados,
  obtenerReportesCorteSeparados,
  formatearDetalleUnidad,
  formatearReporteTodasUnidades,
} from "../src/utils/telegram.js";
import { config } from "../src/config/index.js";
import { VoterRecord, EstadisticasNomina, EstadisticasNominaIndividual } from "../src/services/voterService.js";

const mockVoter: VoterRecord = {
  cedula: "27334492",
  nombre: "María Pérez",
  nomina: "SEGEN",
  cargo: "Directora General",
  unidad: "Despacho",
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

test("formatearTarjetaElector muestra estado pendiente, cargo y unidad", () => {
  const card = formatearTarjetaElector(mockVoter);
  assert.match(card, /María Pérez/);
  assert.match(card, /V-27\.334\.492/);
  assert.match(card, /Directora General/);
  assert.match(card, /Despacho/);
  assert.match(card, /PENDIENTE POR VOTAR/);
  assert.doesNotMatch(card, /Centro de Votación/);
  assert.doesNotMatch(card, /Mesa/);
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
  assert.doesNotMatch(msg, /Centro/);
  assert.doesNotMatch(msg, /Mesa/);
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

test("formatearReporteSEGEN estructura reporte por cargos y totalización", () => {
  const statsSegen: EstadisticasNominaIndividual = {
    nomina: "SEGEN",
    total: 600,
    votaron: 300,
    pendientes: 300,
    porcentaje: "50.0%",
    porCorte: {
      "8:00 AM": 100,
      "10:00 AM": 200,
    },
    cedulasPorCorte: {
      "8:00 AM": ["12345678"],
      "10:00 AM": ["23456789"],
    },
    porCargo: {
      Director: { nombre: "Director", total: 10, votaron: 10, pendientes: 0, porcentaje: "100.0%" },
      Coordinador: { nombre: "Coordinador", total: 50, votaron: 30, pendientes: 20, porcentaje: "60.0%" },
    },
    porUnidad: {},
  };

  const msg = formatearReporteSEGEN(statsSegen, "10:00 AM");
  assert.match(msg, /NÓMINA SEGEN/);
  assert.match(msg, /TOTALIZACIÓN GENERAL SEGEN/);
  assert.match(msg, /Padrón Total:\* 600 electores/);
  assert.match(msg, /PARTICIPACIÓN POR CARGOS/);
  assert.match(msg, /Director:\* 10\/10/);
  assert.match(msg, /Coordinador:\* 30\/50/);
});

test("formatearReporteINE estructura reporte por unidad y cédulas por corte", () => {
  const statsIne: EstadisticasNominaIndividual = {
    nomina: "INE",
    total: 400,
    votaron: 150,
    pendientes: 250,
    porcentaje: "37.5%",
    porCorte: {
      "8:00 AM": 50,
      "10:00 AM": 100,
    },
    cedulasPorCorte: {
      "8:00 AM": ["11111111", "22222222"],
      "10:00 AM": ["33333333"],
    },
    porCargo: {},
    porUnidad: {
      "Gerencia General": { nombre: "Gerencia General", total: 20, votaron: 15, pendientes: 5, porcentaje: "75.0%" },
    },
  };

  const msg = formatearReporteINE(statsIne, "10:00 AM");
  assert.match(msg, /NÓMINA INE/);
  assert.match(msg, /TOTALIZACIÓN GENERAL INE/);
  assert.match(msg, /PARTICIPACIÓN POR UNIDAD/);
  assert.match(msg, /Gerencia General:\* 15\/20/);
  assert.match(msg, /DETALLE Y CÉDULAS POR CADA CORTE/);
  assert.match(msg, /V-11\.111\.111/);
});

test("obtenerReportesSeparados devuelve 2 reportes distintos con reglas de SEGEN e INE", () => {
  const stats: EstadisticasNomina = {
    total: 1000,
    votaron: 450,
    pendientes: 550,
    porcentajeVotaron: "45.0%",
    corteActivo: "12:00 PM",
    porCorte: { "8:00 AM": 150, "10:00 AM": 300 },
    porNomina: {
      SEGEN: {
        nomina: "SEGEN",
        total: 600,
        votaron: 300,
        pendientes: 300,
        porcentaje: "50.0%",
        porCorte: { "8:00 AM": 100, "10:00 AM": 200 },
        cedulasPorCorte: { "8:00 AM": [], "10:00 AM": [] },
        porCargo: {
          Director: { nombre: "Director", total: 10, votaron: 10, pendientes: 0, porcentaje: "100.0%" },
        },
        porUnidad: {},
      },
      INE: {
        nomina: "INE",
        total: 400,
        votaron: 150,
        pendientes: 250,
        porcentaje: "37.5%",
        porCorte: { "8:00 AM": 50, "10:00 AM": 100 },
        cedulasPorCorte: { "8:00 AM": ["12345678"], "10:00 AM": ["23456789"] },
        porCargo: {},
        porUnidad: {
          Estadística: { nombre: "Estadística", total: 40, votaron: 25, pendientes: 15, porcentaje: "62.5%" },
        },
      },
    },
  };

  const reportes = obtenerReportesSeparados(stats);
  assert.equal(reportes.length, 2);
  assert.equal(reportes[0].nomina, "SEGEN");
  assert.match(reportes[0].mensaje, /CARGOS/);
  assert.equal(reportes[1].nomina, "INE");
  assert.match(reportes[1].mensaje, /UNIDAD/);
  assert.match(reportes[1].mensaje, /Cédulas:/);
});

test("formatearDetalleUnidad desglosa personas que ya votaron y pendientes", () => {
  const detalle = {
    nombre: "Económica",
    total: 2,
    votaron: 1,
    pendientes: 1,
    porcentaje: "50.0%",
    electoresVotaron: [
      {
        ...mockVoter,
        nombre: "Juan Silva",
        cedula: "11206771",
        haVotado: true,
        corte: "10:00 AM",
        fechaHoraVoto: "10:15 AM",
      },
    ],
    electoresPendientes: [
      {
        ...mockVoter,
        nombre: "Pedro Gómez",
        cedula: "14205119",
        haVotado: false,
      },
    ],
  };

  const texto = formatearDetalleUnidad(detalle);
  assert.match(texto, /Económica/);
  assert.match(texto, /YA REPORTARON \(1\)/);
  assert.match(texto, /Juan Silva/);
  assert.match(texto, /11\.206\.771/);
  assert.match(texto, /PENDIENTES POR REPORTAR \(1\)/);
  assert.match(texto, /Pedro Gómez/);
  assert.match(texto, /14\.205\.119/);
});

test("formatearReporteTodasUnidades lista avance por unidad", () => {
  const lista = [
    {
      nombre: "Económica",
      total: 8,
      votaron: 2,
      pendientes: 6,
      porcentaje: "25.0%",
      electoresVotaron: [
        {
          ...mockVoter,
          nombre: "Juan Silva",
          cedula: "11206771",
          haVotado: true,
        },
      ],
      electoresPendientes: [],
    },
  ];

  const texto = formatearReporteTodasUnidades(lista);
  assert.match(texto, /REPORTE DE PARTICIPACIÓN POR UNIDADES/);
  assert.match(texto, /Económica/);
  assert.match(texto, /Juan/);
});

test("configuración de grupos contiene los IDs dedicados de SEGEN e INE", () => {
  assert.equal(config.telegram.segenChatId, "-1003785032543");
  assert.equal(config.telegram.ineChatId, "-4562387860");
});
