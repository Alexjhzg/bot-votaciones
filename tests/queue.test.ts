import test from "node:test";
import assert from "node:assert/strict";
import { AsyncQueue } from "../src/services/queue.js";

test("AsyncQueue procesa tareas en orden estricto (FIFO)", async () => {
  const queue = new AsyncQueue(2, 50);
  const orden: number[] = [];

  const p1 = queue.add(async () => {
    await new Promise((r) => setTimeout(r, 60));
    orden.push(1);
    return "res1";
  });

  const p2 = queue.add(async () => {
    await new Promise((r) => setTimeout(r, 20));
    orden.push(2);
    return "res2";
  });

  const p3 = queue.add(async () => {
    orden.push(3);
    return "res3";
  });

  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

  assert.equal(r1, "res1");
  assert.equal(r2, "res2");
  assert.equal(r3, "res3");
  assert.deepEqual(orden, [1, 2, 3]);
  assert.equal(queue.getPendingCount(), 0);
  assert.equal(queue.isIdle(), true);
});

test("AsyncQueue reintenta tareas fallidas con retroceso", async () => {
  const queue = new AsyncQueue(3, 20);
  let intentos = 0;

  const res = await queue.add(async () => {
    intentos++;
    if (intentos < 3) {
      throw new Error("Fallo temporal de Google Sheets");
    }
    return "éxito en intento 3";
  });

  assert.equal(res, "éxito en intento 3");
  assert.equal(intentos, 3);
});

test("AsyncQueue continúa procesando tareas siguientes si una falla definitivamente", async () => {
  const queue = new AsyncQueue(1, 10);
  const resultados: string[] = [];

  const pFalla = queue.add(async () => {
    throw new Error("Error irrecuperable");
  });

  const pExito = queue.add(async () => {
    resultados.push("tarea posterior exitosa");
    return "ok";
  });

  await assert.rejects(pFalla, /Error irrecuperable/);
  const res2 = await pExito;

  assert.equal(res2, "ok");
  assert.deepEqual(resultados, ["tarea posterior exitosa"]);
  assert.equal(queue.isIdle(), true);
});
