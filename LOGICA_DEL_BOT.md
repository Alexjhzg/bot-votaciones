# 📖 Documentación de Arquitectura y Lógica del Bot de Votaciones

Este documento detalla de manera integral la arquitectura técnica, las reglas de negocio, los algoritmos de procesamiento y el flujo de datos del **Bot de Telegram para Consulta y Registro de Votaciones (`@votacionregistrobot`)**.

---

## 📑 Tabla de Contenidos
1. [Visión General y Objetivo](#1-visión-general-y-objetivo)
2. [Arquitectura del Sistema](#2-arquitectura-del-sistema)
3. [Estructura y Gestión de Datos (Google Sheets)](#3-estructura-y-gestión-de-datos-google-sheets)
4. [Flujos de Interacción en Telegram](#4-flujos-de-interacción-en-telegram)
5. [Lógica de Cortes Horarios Oficiales](#5-lógica-de-cortes-horarios-oficiales)
6. [Lógica de Generación de Reportes Consolidados](#6-lógica-de-generación-de-reportes-consolidados)
7. [Módulo de Seguimiento por Unidad (`/unidad`)](#7-módulo-de-seguimiento-por-unidad-unidad)
8. [Difusión Automática de Reportes](#8-difusión-automática-de-reportes)
9. [Catálogo de Comandos](#9-catálogo-de-comandos)
10. [Despliegue y Variables de Entorno (Render)](#10-despliegue-y-variables-de-entorno-render)

---

## 1. Visión General y Objetivo

El sistema fue concebido para salas situacionales, directivos y coordinadores de movilización durante jornadas electorales. 

### Objetivos Clave:
* **Registro en tiempo real:** Los movilizadores o electores escriben `12345678 voto listo` (en privado o en grupos de Telegram) y el bot valida, registra y audita el voto inmediatamente.
* **Sincronización en la nube:** Cada voto actualiza en vivo el documento oficial de **Google Sheets**, registrando la hora exacta, el corte horario y el remitente.
* **Separación de Nóminas:** Gestiona de forma independiente dos universos electorales con reglas de reportería diferenciadas:
  * **SEGEN:** 210 electores (reporte consolidado por **Cargos** y unificación de nodos).
  * **INE:** 43 electores (reporte consolidado por **Unidades** con listado explícito de cédulas por corte).
  * **Total Padrón:** 253 electores.
* **Emisión Automática:** Emite reportes de corte a las 8am, 10am, 12pm, 2pm, 4pm, 6pm y 7pm tanto al grupo oficial de Telegram como a los chats privados de los gerentes/encargados.

---

## 2. Arquitectura del Sistema

El bot está desarrollado en **Node.js con TypeScript**, priorizando la velocidad de respuesta en memoria y la persistencia atómica en Google Sheets:

```text
[ Usuario / Coordinador en Telegram ]
                 │
                 ▼
     [ Bot Telegram (Grammy) ]
                 │
                 ▼
   [ Cola de Procesos (AsyncQueue) ] ──▶ Control de Concurrencia FIFO y Reintentos
                 │
  ┌──────────────┴──────────────┐
  │  (En Memoria - Fast Read)   │ (Persistencia Secuencial Atómica)
  ▼                             ▼
[ voterService / padrón ]  ──▶  [ Google Sheets API v4 (Service Account) ]
        │
        ├──▶ Registro de Voto y Auditoría (Hora, Corte, Remitente)
        ├──▶ Prevención de Condiciones de Carrera y Duplicados
        ├──▶ Cálculos de Avance y Porcentajes
        └──▶ Cronjobs de Cortes (Zona: America/Caracas)
```

### Tecnologías y Componentes Clave:
* **Lenguaje:** TypeScript / Node.js (v20+).
* **Cola de Procesos (`AsyncQueue`):** Gestor FIFO de operaciones concurrentes. Garantiza que múltiples reportes simultáneos se procesen en orden estricto, previniendo saturación de cuota de Google Sheets (error 429) y reintentando automáticamente con retroceso exponencial ante fallos de red.
* **Framework Bot:** `grammy` (soporte para comandos, middleware de registro y control de rate limits).
* **Base de Datos / Padrón:** `googleapis` conectando vía cuenta de servicio con permisos de edición a Google Sheets.
* **Planificador de Tareas:** `croner` para ejecución de cronjobs con soporte nativo de husos horarios (`America/Caracas`).
* **Servidor Web Keep-Alive:** `express` en puerto dinámico (`PORT`) para healthchecks de Render (`/healthz`).

---

## 3. Estructura y Gestión de Datos (Google Sheets)

El bot lee y escribe directamente en la hoja de cálculo de Google Drive identificada en `GOOGLE_SPREADSHEET_ID`.

### Pestañas Utilizadas:
1. **`segen`**: Contiene los 210 electores de la nómina SEGEN.
2. **`ine`**: Contiene los 43 electores de la nómina INE.

### Columnas Reconocidas:
El servicio `voterService.ts` incluye un motor de detección flexible de cabeceras tolerante a tildes, mayúsculas y variantes:
* **Cédula:** `Cédula`, `Cedula`, `CI`, `C.I.`, `Documento`.
* **Nombre:** `Nombre y Apellido`, `Nombres y Apellidos`, `Nombre`, `Elector`.
* **Cargo (SEGEN):** `Cargo`, `Puesto`, `Rol`.
* **Unidad / Coordinación:** `Coord/Unidad`, `Unidad`, `Coordinación`, `Dependencia`.
* **Centro de Votación:** `Centro`, `Centro de Votación`, `Colegio`.
* **Mesa:** `Mesa`, `Mesa de Votación`.
* **Parroquia / Municipio:** `Parroquia`, `Municipio`.

### Columnas de Auditoría en Google Sheets (Diferenciadas por Nómina):
El sistema maneja de forma diferenciada la persistencia según la naturaleza operativa de cada nómina:

#### 1. Pestaña `segen` (Supervisores de Nodo - Formato Estructurado):
* **`Voto Listo`**: Guarda `SI` cuando el elector sufragó.
* **`Hora Reportada`**: Guarda la hora indicada en el reporte estructurado de nodo (`3. Hora: 10:00 AM`). Si el reporte fue directo por cédula, toma la hora de recepción.
* **`Hora Recibida`**: Guarda la hora exacta de recepción del mensaje en Telegram (ej: `10:14:22 AM`).
* **`Corte`**: Bloque horario calculado a partir de la **Hora Reportada** oficial del nodo.
* **`Reportado Por`**: Usuario u operador de Telegram que reportó.

#### 2. Pestaña `ine` (Flujo Directo Sencillo):
* **`Voto Listo`**: Guarda `SI` cuando el elector sufragó.
* **`Hora`**: Columna única limpia que guarda la **Hora Recibida en Telegram**.
* **`Corte`**: Bloque horario calculado a partir de la **Hora Recibida en Telegram**.
* **`Reportado Por`**: Usuario u operador de Telegram que reportó.

---

## 4. Flujos de Interacción en Telegram

### A. Reporte Estructurado de Voto por Nodo (SEGEN)
* **Plantilla oficial:**
  ```text
  Formato de reporte de voto
  1. Nodo: 16018
  2. Cédula: 
  12345678
  23456789
  3. Hora: 10:00 AM
  ```
* **Lógica y Validaciones:**
  1. `esFormatoReporte(texto)` detecta explícitamente el encabezado oficial `Formato de reporte de voto` (o `Formato de reporte de votos`).
  2. Valida obligatoriedad de `1. Nodo:`, `2. Cédula:` y `3. Hora:`.
  3. Al registrar:
     * Para electores de **SEGEN**: Registra la **Hora Reportada** (la escrita en el formato) y la **Hora Recibida** (la estampa de Telegram del mensaje). El corte se asigna según la **Hora Reportada**.
     * Si contiene electores de **INE**: El INE solo toma en cuenta la **Hora Recibida en Telegram** y su corte correspondiente, guardándolo en la columna `Hora`.
  4. Responde con reacción 👍 y emite incidencias si alguna cédula ya votó o no existe.

### B. Reporte Directo Sencillo (INE y Cédula Directa)
* **Entrada:** `12345678`, `12345678 voto listo`, o lista de cédulas.
* **Lógica:**
  1. Diseñado especialmente para **INE** ("mucho más sencillo, solo necesita la cédula").
  2. Toma la **hora exacta de recepción en Telegram** (`horaRecibida`).
  3. Calcula el corte horario oficial según la hora de recepción en Telegram.
  4. Para electores del INE, actualiza en la pestaña `ine` las columnas `Voto Listo`, `Hora` (con la hora de recepción), `Corte` y `Reportado Por`.
  5. Reacciona con 👍 de manera silenciosa si el registro fue exitoso (evitando saturar los grupos de trabajo). Si ya votó, emite una alerta informativa sin duplicar el registro.

### C. Consulta Rápida de Centro de Votación
* **Entrada:** `12345678` (solo el número de cédula).
* **Lógica:**
  * Busca la cédula en las nóminas SEGEN e INE.
  * Si la encuentra, responde con:
    * Nombre y Apellido.
    * Nómina a la que pertenece.
    * Cargo y Unidad.
    * Centro de votación, mesa y parroquia.
    * Estatus actual: `🔴 PENDIENTE POR VOTAR` o `✅ YA VOTÓ` (con su hora y corte).

---

## 5. Lógica de Cortes Horarios Oficiales

El bot implementa un reloj centralizado configurado en la zona horaria **`America/Caracas` (VET, UTC-4)**.

### Tabla de Ventanas de Corte:
| Nro | Corte | Hora Programada | Ventana de Asignación de Votos |
| :---: | :---: | :---: | :--- |
| **1** | **8:00 AM** | 08:00 VET | Votos emitidos antes de las 09:00 AM |
| **2** | **10:00 AM** | 10:00 VET | Votos emitidos entre las 09:00 AM y 10:59 AM |
| **3** | **12:00 PM** | 12:00 VET | Votos emitidos entre las 11:00 AM y 12:59 PM |
| **4** | **2:00 PM** | 14:00 VET | Votos emitidos entre la 01:00 PM y 02:59 PM |
| **5** | **4:00 PM** | 16:00 VET | Votos emitidos entre las 03:00 PM y 04:59 PM |
| **6** | **6:00 PM** | 18:00 VET | Votos emitidos entre las 05:00 PM y 06:29 PM |
| **7** | **7:00 PM** | 19:00 VET | Votos emitidos a partir de las 06:30 PM (Cierre definitivo) |

---

## 6. Lógica de Generación de Reportes Consolidados

Cuando se solicita `/resumen`, `/total`, `/corte` o se dispara el cronjob horario, el bot **emite dos reportes por separado** respetando las directrices de cada nómina:

### A. Reporte Consolidado SEGEN
* **Enfoque:** Agrupado por **CARGOS**.
* **Regla Especial de Unificación de Cargos:**
  * La nómina contiene dos variantes de supervisores de nodo:
    * `SUPERVISOR DE NODO - AMBITOS INDUSTRIALES` (4 personas)
    * `SUPERVISOR DE NODO` (46 personas)
  * El sistema los fusiona automáticamente en una sola categoría: **`SUPERVISOR DE NODO`** con un total unificado de **50 electores**.
* **Estructura del Mensaje:**
  1. Encabezado con fecha, hora actual y corte activo.
  2. Desglose por cada Cargo:
     * `🔹 <NOMBRE DEL CARGO>`
     * `Total: X | Votaron: Y | Faltan: Z | % Participación`
  3. Totalización General de SEGEN:
     * Padrón total (210), Votos registrados, Faltantes.
     * Porcentaje total de participación con barra visual de progreso (`▓▓▓░░░`).
  4. Resumen acumulativo de los 7 cortes horarios oficiales.

### B. Reporte Consolidado INE
* **Enfoque:** Agrupado por **UNIDAD / COORDINACIÓN**.
* **Regla de Auditoría de Cédulas:**
  * Además del porcentaje por unidad, el reporte de INE desglosa de manera explícita **cuáles cédulas votaron en cada corte horario**.
* **Estructura del Mensaje:**
  1. Encabezado con fecha, hora actual y corte activo.
  2. Desglose de cada Unidad:
     * `🏛️ <NOMBRE DE LA UNIDAD>`
     * `Padrón: X | Votaron: Y | Faltan: Z | % Participación`
  3. Desglose Detallado de Votos por Corte:
     * Para cada uno de los cortes transcurridos, lista la cantidad y las cédulas exactas:
       * `⏰ 8:00 AM (3 votos): V-12.345.678, V-87.654.321, ...`
       * `⏰ 10:00 AM (5 votos): V-11.222.333, ...`
  4. Totalización General de INE:
     * Padrón total (43), Votos registrados, Faltantes.
     * Porcentaje total de participación con barra visual de progreso.

---

## 7. Módulo de Seguimiento por Unidad (`/unidad`)

Diseñado para que los coordinadores de cada área o gerencia puedan hacer seguimiento operativo puntual:

### 1. Resumen General de Unidades: `/unidad`
Muestra una tabla compacta con todas las unidades registradas, indicando cuántos electores tiene asignados, cuántos han votado y el porcentaje alcanzado.

### 2. Detalle Específico de Unidad: `/unidad <nombre>`
Ejemplo: `/unidad seem` o `/unidad economica`.
* Filtra la unidad solicitada (búsqueda insensible a mayúsculas o tildes).
* Muestra:
  * Resumen numérico y porcentaje de esa unidad.
  * **Lista de electores que ya votaron:** Nombre, Cédula y Hora del voto.
  * **Lista de electores pendientes:** Nombre, Cédula, Centro de Votación y Mesa asignada (para llamarlos o movilizarlos directamente).

---

## 8. Difusión Automática de Reportes

El módulo `src/jobs/cutoffs.ts` ejecuta automáticamente a cada hora de corte:
1. Genera los reportes consolidados actualizados de SEGEN e INE.
2. Si está configurado `TELEGRAM_REPORT_CHAT_ID`, envía ambos mensajes directamente al grupo o canal de la sala situacional.
3. Si está configurado `TELEGRAM_MANAGER_CHAT_ID`, envía ambos mensajes al chat privado de cada uno de los gerentes/administradores definidos.

---

## 9. Catálogo de Comandos

| Comando | Parámetros | Descripción |
| :--- | :--- | :--- |
| `/start` o `/ayuda` | Ninguno | Bienvenida, instrucciones y corte horario activo. |
| `/comandos` | Ninguno | Lista oficial completa de comandos disponibles. |
| `/resumen` o `/total` | Ninguno | Emite los dos reportes consolidados (SEGEN e INE) por separado. |
| `/segen` | Ninguno | Emite el reporte consolidado exclusivo de SEGEN. |
| `/ine` | Ninguno | Emite el reporte consolidado exclusivo de INE. |
| `/corte` | Ninguno | Emite los reportes del corte activo actual. |
| `/unidad` | Opcional: `<nombre>` | Reporte de avance de todas las unidades o detalle nominal de una específica. |
| `/id` | Ninguno | Muestra el ID del chat/grupo actual y el ID del usuario en Telegram. |
| `/recargar` o `/sync` | Ninguno | Descarga y sincroniza la nómina desde Google Sheets en caliente. |
| `/deshacer` | `<cédula>` | Revierte un voto marcado por error (solo administradores). |
| `<cédula>` | Ninguno | Consulta rápida de datos de un elector (Ej: `12345678`). |
| `<cédula> voto listo`| Ninguno | Registra el voto en el padrón y en Google Sheets. |

---

## 10. Despliegue y Variables de Entorno (Render)

El bot se despliega en **Render** como un **Web Service (Node)** conectado al repositorio de GitHub:

### Parámetros de Render:
* **Service Type:** Web Service (Node.js).
* **Build Command:** `npm install && npm run build`
* **Start Command:** `npm start`
* **Health Check Path:** `/healthz`

### Variables de Entorno (`Environment Variables`):

| Variable | Tipo | Descripción |
| :--- | :--- | :--- |
| `TELEGRAM_BOT_TOKEN` | Secreto | Token de la API de Telegram proporcionado por BotFather. |
| `GOOGLE_SPREADSHEET_ID` | String | ID del documento de Google Sheets (extraído de la URL). |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | String | Correo de la cuenta de servicio de Google Cloud. |
| `GOOGLE_PRIVATE_KEY` | Secreto | Llave privada RSA completa del Service Account (con cabeceras y saltos `\n`). |
| `GOOGLE_SHEET_TABS` | String | Pestañas a sincronizar: `segen,ine`. |
| `TELEGRAM_REPORT_CHAT_ID` | String | ID numérico del grupo o canal de Telegram donde se publican los reportes. |
| `TELEGRAM_MANAGER_CHAT_ID` | String | IDs de los gerentes separados por comas para recibir reportes en privado. |
| `APP_TIMEZONE` | String | Zona horaria del cronjob: `America/Caracas`. |
| `NODE_VERSION` | String | Versión de Node.js recomendada (`20.14.0`). |

---

*Documento actualizado y verificado para la jornada electoral oficial.*
