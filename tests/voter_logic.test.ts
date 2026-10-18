import test from "node:test";
import assert from "node:assert/strict";
import { voterService } from "../src/services/voterService.js";
import { HeaderMapping } from "../src/services/sheets.js";

// Mock helper para simular una fila de GoogleSpreadsheetRow
function crearMockRow(initialValues: Record<string, string> = {}) {
  const data = { ...initialValues };
  return {
    get: (key: string) => data[key],
    set: (key: string, val: string) => {
      data[key] = val;
    },
    save: async () => {},
    _data: data,
  };
}

test("Lógica de Registro - SEGEN con formato de reporte registra Hora Reportada y Hora Recibida", async () => {
  const rowMock = crearMockRow({
    CEDULA: "11111111",
    "NOMBRES APELLIDOS": "Pedro Perez",
    "CARGO OCTUBRE": "SUPERVISOR DE NODO",
    "Voto Listo": "",
    "Hora Reportada": "",
    "Hora Recibida": "",
    Corte: "",
    "Reportado Por": "",
  });

  const segenMapping: HeaderMapping = {
    cedulaKey: "CEDULA",
    nombreKey: "NOMBRES APELLIDOS",
    cargoKey: "CARGO OCTUBRE",
    votoKey: "Voto Listo",
    horaKey: "Hora Reportada",
    horaReportadaKey: "Hora Reportada",
    horaRecibidaKey: "Hora Recibida",
    fechaHoraKey: "Hora Reportada",
    corteKey: "Corte",
    reportadoPorKey: "Reportado Por",
  };

  // Inyectar elector SEGEN de prueba en voterService
  (voterService as any).voters.set("11111111", {
    cedula: "11111111",
    nombre: "Pedro Perez",
    nomina: "SEGEN",
    cargo: "SUPERVISOR DE NODO",
    unidad: "Sin unidad",
    centro: "Colegio 1",
    mesa: "1",
    parroquia: "",
    municipio: "",
    haVotado: false,
    corte: null,
    horaReportada: null,
    horaRecibida: null,
    fechaHoraVoto: null,
    reportadoPor: null,
    sheetTitle: "segen",
    mapping: segenMapping,
    rowRef: rowMock,
  });

  const res = await voterService.registrarVoto("11111111", "@supervisor", {
    horaReportada: { horaStr: "10:00:00 AM", corte: "10:00 AM" },
    horaRecibida: "10:18:22 AM",
    corteRecibido: "10:00 AM",
  });

  assert.equal(res.status, "SUCCESS");
  assert.equal(res.voter?.haVotado, true);
  assert.equal(res.voter?.horaReportada, "10:00:00 AM");
  assert.equal(res.voter?.horaRecibida, "10:18:22 AM");
  assert.equal(res.voter?.corte, "10:00 AM");

  // Verificar lo persistido en la fila de Google Sheets
  assert.equal(rowMock._data["Voto Listo"], "SI");
  assert.equal(rowMock._data["Hora Reportada"], "10:00:00 AM");
  assert.equal(rowMock._data["Hora Recibida"], "10:18:22 AM");
  assert.equal(rowMock._data["Corte"], "10:00 AM");
  assert.equal(rowMock._data["Reportado Por"], "@supervisor");
});

test("Lógica de Registro - INE es directo, solo necesita cédula y toma en cuenta hora recibida en Telegram", async () => {
  const rowMock = crearMockRow({
    Cédula: "22222222",
    "Apellidos y Nombres": "Maria Gomez",
    "Coord/Unidad": "Gerencia General",
    "Voto Listo": "",
    "Hora Recibida": "",
    Corte: "",
    "Reportado Por": "",
  });

  const ineMapping: HeaderMapping = {
    cedulaKey: "Cédula",
    nombreKey: "Apellidos y Nombres",
    unidadKey: "Coord/Unidad",
    votoKey: "Voto Listo",
    horaKey: "Hora Recibida",
    horaRecibidaKey: "Hora Recibida",
    fechaHoraKey: "Hora Recibida",
    corteKey: "Corte",
    reportadoPorKey: "Reportado Por",
  };

  (voterService as any).voters.set("22222222", {
    cedula: "22222222",
    nombre: "Maria Gomez",
    nomina: "INE",
    cargo: "ANALISTA",
    unidad: "Gerencia General",
    centro: "Colegio 2",
    mesa: "1",
    parroquia: "",
    municipio: "",
    haVotado: false,
    corte: null,
    horaReportada: null,
    horaRecibida: null,
    fechaHoraVoto: null,
    reportadoPor: null,
    sheetTitle: "ine",
    mapping: ineMapping,
    rowRef: rowMock,
  });

  // Registro de INE: solo se le pasa la hora recibida en Telegram
  const res = await voterService.registrarVoto("22222222", "@operador_ine", {
    horaRecibida: "11:45:10 AM",
    corteRecibido: "12:00 PM",
  });

  assert.equal(res.status, "SUCCESS");
  assert.equal(res.voter?.haVotado, true);
  assert.equal(res.voter?.horaRecibida, "11:45:10 AM");
  assert.equal(res.voter?.horaReportada, null);
  assert.equal(res.voter?.corte, "12:00 PM");

  // En la hoja de INE solo se guarda la columna 'Hora Recibida'
  assert.equal(rowMock._data["Voto Listo"], "SI");
  assert.equal(rowMock._data["Hora Recibida"], "11:45:10 AM");
  assert.equal(rowMock._data["Corte"], "12:00 PM");
  assert.equal(rowMock._data["Reportado Por"], "@operador_ine");

  // No debe haber columna 'Hora Reportada'
  assert.equal(rowMock._data["Hora Reportada"], undefined);
});

test("Lógica de Registro - Si una cédula INE llega en formato de nodo, prevalece hora recibida en Telegram", async () => {
  const rowMock = crearMockRow({
    Cédula: "33333333",
    "Apellidos y Nombres": "Carlos Rodriguez",
    "Coord/Unidad": "SEEM",
    "Voto Listo": "",
    "Hora Recibida": "",
    Corte: "",
    "Reportado Por": "",
  });

  const ineMapping: HeaderMapping = {
    cedulaKey: "Cédula",
    nombreKey: "Apellidos y Nombres",
    unidadKey: "Coord/Unidad",
    votoKey: "Voto Listo",
    horaKey: "Hora Recibida",
    horaRecibidaKey: "Hora Recibida",
    fechaHoraKey: "Hora Recibida",
    corteKey: "Corte",
    reportadoPorKey: "Reportado Por",
  };

  (voterService as any).voters.set("33333333", {
    cedula: "33333333",
    nombre: "Carlos Rodriguez",
    nomina: "INE",
    cargo: "DIRECTOR",
    unidad: "SEEM",
    centro: "Colegio 3",
    mesa: "2",
    parroquia: "",
    municipio: "",
    haVotado: false,
    corte: null,
    horaReportada: null,
    horaRecibida: null,
    fechaHoraVoto: null,
    reportadoPor: null,
    sheetTitle: "ine",
    mapping: ineMapping,
    rowRef: rowMock,
  });

  // Si alguien incluyó esta cédula en un reporte de nodo con hora 8:00 AM pero llegó a Telegram a las 10:20 AM
  const res = await voterService.registrarVoto("33333333", "@coordinador", {
    horaReportada: { horaStr: "08:00:00 AM", corte: "8:00 AM" },
    horaRecibida: "10:20:00 AM",
    corteRecibido: "10:00 AM",
  });

  assert.equal(res.status, "SUCCESS");
  // Para INE manda la hora recibida en Telegram y su corte correspondiente
  assert.equal(res.voter?.horaRecibida, "10:20:00 AM");
  assert.equal(res.voter?.horaReportada, null);
  assert.equal(res.voter?.corte, "10:00 AM");
  assert.equal(rowMock._data["Hora Recibida"], "10:20:00 AM");
  assert.equal(rowMock._data["Corte"], "10:00 AM");
  assert.equal(rowMock._data["Hora Reportada"], undefined);
});

test("Lógica de Deshacer - Revierte campos para SEGEN e INE adecuadamente", async () => {
  // Deshacer SEGEN
  const resDeshacerSegen = await voterService.deshacerVoto("11111111", "@admin");
  assert.equal(resDeshacerSegen.status, "SUCCESS");
  assert.equal(resDeshacerSegen.voter?.haVotado, false);
  assert.equal(resDeshacerSegen.voter?.horaReportada, null);
  assert.equal(resDeshacerSegen.voter?.horaRecibida, null);

  // Deshacer INE
  const resDeshacerIne = await voterService.deshacerVoto("22222222", "@admin");
  assert.equal(resDeshacerIne.status, "SUCCESS");
  assert.equal(resDeshacerIne.voter?.haVotado, false);
  assert.equal(resDeshacerIne.voter?.horaRecibida, null);
});
