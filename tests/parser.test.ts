import test from "node:test";
import assert from "node:assert/strict";
import {
  limpiarCedula,
  formatearCedula,
  esIntencionVotoListo,
  extraerCedulas,
  normalizarTexto,
  determinarCortePorHora,
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
