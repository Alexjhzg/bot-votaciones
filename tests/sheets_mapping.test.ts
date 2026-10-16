import test from "node:test";
import assert from "node:assert/strict";
import { detectarMapeoColumnas } from "../src/services/sheets.js";

test("detectarMapeoColumnas identifica cabeceras con tildes y mayúsculas, incluyendo Cargo y Unidad", () => {
  const headers = [
    "CÉDULA",
    "NOMBRES Y APELLIDOS",
    "INSTITUCIÓN",
    "CARGO",
    "UNIDAD ADMINISTRATIVA",
    "CENTRO DE VOTACIÓN",
    "MESA",
    "PARROQUIA",
    "MUNICIPIO",
    "Voto Listo",
    "Fecha y Hora",
    "Corte",
    "Reportado Por",
  ];

  const mapping = detectarMapeoColumnas(headers);
  assert.equal(mapping.cedulaKey, "CÉDULA");
  assert.equal(mapping.nombreKey, "NOMBRES Y APELLIDOS");
  assert.equal(mapping.nominaKey, "INSTITUCIÓN");
  assert.equal(mapping.cargoKey, "CARGO");
  assert.equal(mapping.unidadKey, "UNIDAD ADMINISTRATIVA");
  assert.equal(mapping.centroKey, "CENTRO DE VOTACIÓN");
  assert.equal(mapping.mesaKey, "MESA");
  assert.equal(mapping.votoKey, "Voto Listo");
  assert.equal(mapping.fechaHoraKey, "Fecha y Hora");
  assert.equal(mapping.corteKey, "Corte");
  assert.equal(mapping.reportadoPorKey, "Reportado Por");
});

test("detectarMapeoColumnas identifica variantes cortas (CI, Nombre)", () => {
  const headers = ["CI", "Nombre", "Colegio", "Voto"];
  const mapping = detectarMapeoColumnas(headers);
  assert.equal(mapping.cedulaKey, "CI");
  assert.equal(mapping.nombreKey, "Nombre");
  assert.equal(mapping.centroKey, "Colegio");
  assert.equal(mapping.votoKey, "Voto");
  assert.equal(mapping.corteKey, "Corte");
});
