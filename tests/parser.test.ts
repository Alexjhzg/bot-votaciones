import test from "node:test";
import assert from "node:assert/strict";
import {
  limpiarCedula,
  formatearCedula,
  esIntencionVotoListo,
  extraerCedulas,
  normalizarTexto,
  determinarCortePorHora,
  parsearHoraTexto,
  esFormatoReporte,
  parsearReporteVoto,
} from "../src/utils/parser.js";

test("limpiarCedula extrae solo dígitos numéricos", () => {
  assert.equal(limpiarCedula("V-27.334.492"), "27334492");
  assert.equal(limpiarCedula("27334492"), "27334492");
  assert.equal(limpiarCedula("E-81.234.567"), "81234567");
});

test("formatearCedula añade puntos de miles", () => {
  assert.equal(formatearCedula("27334492"), "27.334.492");
  assert.equal(formatearCedula("1234567"), "1.234.567");
});

test("esIntencionVotoListo detecta variantes", () => {
  assert.equal(esIntencionVotoListo("27334492 voto listo"), true);
  assert.equal(esIntencionVotoListo("V-27334492 Voto Listo"), true);
  assert.equal(esIntencionVotoListo("ya voto 27334492"), true);
  assert.equal(esIntencionVotoListo("27334492 listo"), true);
  assert.equal(esIntencionVotoListo("27334492"), false);
  assert.equal(esIntencionVotoListo("buenas tardes a todos"), false);
});

test("extraerCedulas obtiene cédulas únicas", () => {
  const t1 = "27334492 voto listo";
  assert.deepEqual(extraerCedulas(t1), ["27334492"]);

  const t2 = "V-27.334.492 voto listo y E-18.456.789 voto listo";
  assert.deepEqual(extraerCedulas(t2), ["27334492", "18456789"]);

  const t3 = "solo texto sin numeros";
  assert.deepEqual(extraerCedulas(t3), []);

  // No debe capturar números de 5 dígitos ni códigos de nodo
  const tNodo = "Municipio: Cedeño, Nodo: 16018, Total: 02";
  assert.deepEqual(extraerCedulas(tNodo), []);

  // Texto real de reporte de campo
  const tReporte = `Formato de reporte y salida a campo
   1. Municipio: Cedeño 
   2. Nodo: 16018
   3. Total de Verificadores en el nodo: 02
   Bloque (1) 9am: 1`;
  assert.deepEqual(extraerCedulas(tReporte), []);
});

test("normalizarTexto quita tildes y mayúsculas", () => {
  assert.equal(normalizarTexto("Cédula Votó SEGEN"), "cedula voto segen");
});

test("determinarCortePorHora asigna correctamente los 7 cortes oficiales", () => {
  // 8:00 AM (08:00)
  assert.equal(determinarCortePorHora(7, 30).etiqueta, "8:00 AM");
  assert.equal(determinarCortePorHora(8, 0).etiqueta, "8:00 AM");

  // 10:00 AM (10:00)
  assert.equal(determinarCortePorHora(8, 1).etiqueta, "10:00 AM");
  assert.equal(determinarCortePorHora(10, 0).etiqueta, "10:00 AM");

  // 12:00 PM (12:00)
  assert.equal(determinarCortePorHora(10, 15).etiqueta, "12:00 PM");
  assert.equal(determinarCortePorHora(12, 0).etiqueta, "12:00 PM");

  // 2:00 PM (14:00)
  assert.equal(determinarCortePorHora(12, 30).etiqueta, "2:00 PM");
  assert.equal(determinarCortePorHora(14, 0).etiqueta, "2:00 PM");

  // 4:00 PM (16:00)
  assert.equal(determinarCortePorHora(14, 45).etiqueta, "4:00 PM");
  assert.equal(determinarCortePorHora(16, 0).etiqueta, "4:00 PM");

  // 6:00 PM (18:00)
  assert.equal(determinarCortePorHora(16, 10).etiqueta, "6:00 PM");
  assert.equal(determinarCortePorHora(18, 0).etiqueta, "6:00 PM");

  // 7:00 PM (19:00)
  assert.equal(determinarCortePorHora(18, 5).etiqueta, "7:00 PM");
  assert.equal(determinarCortePorHora(19, 0).etiqueta, "7:00 PM");

  // Post 7:00 PM
  assert.equal(determinarCortePorHora(19, 30).etiqueta, "Cierre (Post-7:00 PM)");
});

test("parsearHoraTexto interpreta horas 12h y 24h", () => {
  const h1 = parsearHoraTexto("8:45 AM");
  assert.equal(h1?.hora24, 8);
  assert.equal(h1?.minuto, 45);
  assert.equal(h1?.horaStr, "08:45:00 AM");

  const h2 = parsearHoraTexto("10:15 am");
  assert.equal(h2?.hora24, 10);
  assert.equal(h2?.minuto, 15);
  assert.equal(h2?.horaStr, "10:15:00 AM");

  const h3 = parsearHoraTexto("2:30 pm");
  assert.equal(h3?.hora24, 14);
  assert.equal(h3?.minuto, 30);
  assert.equal(h3?.horaStr, "02:30:00 PM");

  const h4 = parsearHoraTexto("14:20");
  assert.equal(h4?.hora24, 14);
  assert.equal(h4?.minuto, 20);
  assert.equal(h4?.horaStr, "02:20:00 PM");

  const h5 = parsearHoraTexto("10am");
  assert.equal(h5?.hora24, 10);
  assert.equal(h5?.minuto, 0);

  // Inválidas
  assert.equal(parsearHoraTexto("mediodia"), null);
  assert.equal(parsearHoraTexto("25:00"), null);
  assert.equal(parsearHoraTexto("10:75"), null);
});

test("parsearReporteVoto detecta formato válido y asigna cortes", () => {
  const msg = `Formato de reporte de voto
1. Nodo: 16018 - Maturín
2. Cédula: 
V-18.456.123
V-20.145.896
3. Hora: 10:15 AM`;

  const res = parsearReporteVoto(msg);
  assert.equal(res.esFormatoReporte, true);
  assert.equal(res.esValido, true);
  assert.equal(res.nodo, "16018 - Maturín");
  assert.deepEqual(res.cedulas, ["18456123", "20145896"]);
  assert.equal(res.horaInfo?.horaStr, "10:15:00 AM");
  assert.equal(res.horaInfo?.corte, "12:00 PM");
  assert.equal(res.errores.length, 0);
});

test("parsearReporteVoto detecta errores cuando colocan mal el formato", () => {
  // 1. Plantilla vacía con ceros
  const msgVacio = `Formato de reporte de voto
1. Nodo:
2. Cédula: 
00000000
00000000
3. Hora:`;

  const resVacio = parsearReporteVoto(msgVacio);
  assert.equal(resVacio.esFormatoReporte, true);
  assert.equal(resVacio.esValido, false);
  assert.equal(resVacio.errores.some((e) => e.includes("Nodo")), true);
  assert.equal(resVacio.errores.some((e) => e.includes("ceros de ejemplo")), true);
  assert.equal(resVacio.errores.some((e) => e.includes("Hora")), true);

  // 2. Falta la hora
  const msgSinHora = `Formato de reporte de voto
1. Nodo: 16018
2. Cédula: 
18456123
3. Hora:`;
  const resSinHora = parsearReporteVoto(msgSinHora);
  assert.equal(resSinHora.esValido, false);
  assert.equal(resSinHora.errores.some((e) => e.includes("Hora")), true);

  // 3. Cédula inválida (demasiado corta)
  const msgCedulaCorta = `Formato de reporte de voto
1. Nodo: 16018
2. Cédula: 
12345
3. Hora: 10:00 AM`;
  const resCorta = parsearReporteVoto(msgCedulaCorta);
  assert.equal(resCorta.esValido, false);
  assert.equal(resCorta.errores.some((e) => e.includes("demasiado corto")), true);
});

test("esFormatoReporte solo se activa cuando dice formato de reporte de voto", () => {
  // Casos válidos que deben reconocerse como formato de reporte de votos
  assert.equal(esFormatoReporte("Formato de reporte de voto"), true);
  assert.equal(esFormatoReporte("Formato de reporte de votos"), true);
  assert.equal(esFormatoReporte("FORMATO DE REPORTE DE VOTO"), true);
  assert.equal(esFormatoReporte("Formato reporte de voto"), true);
  assert.equal(esFormatoReporte("Formato de reporte del voto"), true);

  // Casos que NO deben reconocerse (otros tipos de reportes o estructuras de campo)
  assert.equal(esFormatoReporte("Formato de reporte de verificadores"), false);
  assert.equal(esFormatoReporte("Formato de reporte"), false);
  assert.equal(esFormatoReporte("Formato de reporte de incidencias"), false);
  assert.equal(esFormatoReporte("Formato de reporte de apertura de mesas"), false);

  const reporteVerificadores = `Formato de reporte
1. Municipio: Maturin
2. Nodo: 16066
Total Verificadores en el nodo: 04
➡️Bloque (1) 9am: 0
➡️Bloque (2) 2pm: 02
➡️Bloque (3) 6pm: 0`;

  assert.equal(esFormatoReporte(reporteVerificadores), false);
  const parsed = parsearReporteVoto(reporteVerificadores);
  assert.equal(parsed.esFormatoReporte, false);
  assert.equal(parsed.esValido, false);
  assert.equal(parsed.errores.length, 0);

  // Caso real de reporte de salida a campo (verificadores)
  const reporteSalidaCampo = `Buenas
Formato de reporte salida a campo
   *1. Municipio:Uracoa
   *2. Nodo:* 16088
   
*Total Verificadores en el nodo:* 02

 ➡️*Bloque (1) 9am:
 ➡️*Bloque (2) 2pm:
 ➡️*Bloque (3) 6pm1`;

  assert.equal(esFormatoReporte(reporteSalidaCampo), false);
  const parsedSalidaCampo = parsearReporteVoto(reporteSalidaCampo);
  assert.equal(parsedSalidaCampo.esFormatoReporte, false);
  assert.equal(parsedSalidaCampo.esValido, false);
  assert.equal(parsedSalidaCampo.errores.length, 0);
  assert.deepEqual(extraerCedulas(reporteSalidaCampo), []);
});

