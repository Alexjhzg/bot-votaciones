# 🗳️ Bot de Telegram para Consulta y Registro de Votaciones (SEGEN e INE)

Bot de Telegram ágil y simplificado diseñado para salas situacionales, coordinadores y movilizadores electorales. Permite registrar en tiempo real la participación de electores mediante la frase **"voto listo"** y consultar centros y mesas de votación, sincronizado directamente con **Google Sheets**.

---

## ⚡ ¿Cómo funciona?

### 1. Registro de Voto ("Voto Listo")
Cualquier usuario o coordinador en un grupo o chat privado puede enviar la cédula con la frase `voto listo`:

```text
12345678 voto listo
```
*También acepta variantes como `V-12.345.678 voto listo`, `12345678 listo` o varias cédulas en un mismo mensaje.*

El bot responde confirmando los datos del elector:
```text
✅ VOTO REGISTRADO EXITOSAMENTE

👤 Elector: María Pérez
🆔 Cédula: V-12.345.678
🏢 Nómina: SEGEN
🏫 Centro: E.B. República de Venezuela
🗳️ Mesa: 2
⏰ Hora: 16/10/2026 09:42:15 AM
```

### 2. Detección de Votos Duplicados (Auditoría)
Si una persona ya fue registrada anteriormente, el bot evita duplicaciones y advierte:
```text
⚠️ ATENCIÓN: EL VOTO YA FUE REGISTRADO PREVIAMENTE

👤 Elector: María Pérez
🆔 Cédula: V-12.345.678
🏢 Nómina: SEGEN
⏰ Hora de registro anterior: 16/10/2026 08:30:10 AM
👤 Registrado anteriormente por: @supervisor_juan

No se realizaron cambios duplicados.
```

### 3. Consulta Rápida de Elector (Dónde Vota)
Si se envía únicamente el número de cédula:
```text
12345678
```
El bot devuelve la ficha completa del elector indicando si está **Pendiente por Votar** o si **Ya Votó**.

---

## ⏰ Horarios Oficiales de Cortes

El bot gestiona de forma automática los **7 cortes horarios oficiales** de la jornada electoral (hora de Venezuela `America/Caracas`):

| Nro | Corte | Hora | Función del Bot |
| :---: | :--- | :--- | :--- |
| **1** | **Corte 1** | **8:00 AM** | Emisión automática de reporte consolidado al chat de reportes. |
| **2** | **Corte 2** | **10:00 AM** | Emisión automática de reporte consolidado al chat de reportes. |
| **3** | **Corte 3** | **12:00 PM** | Emisión automática de reporte consolidado al chat de reportes. |
| **4** | **Corte 4** | **2:00 PM** | Emisión automática de reporte consolidado al chat de reportes. |
| **5** | **Corte 5** | **4:00 PM** | Emisión automática de reporte consolidado al chat de reportes. |
| **6** | **Corte 6** | **6:00 PM** | Emisión automática de reporte consolidado al chat de reportes. |
| **7** | **Cierre** | **7:00 PM** | Reporte final de cierre de jornada electoral. |

* Cada voto registrado en Google Sheets guarda automáticamente a qué corte perteneció en la columna `Corte`.
* A cada hora de corte, el bot difunde de forma automática el avance consolidado al grupo de Telegram configurado (`TELEGRAM_REPORT_CHAT_ID`) y a los administradores.

---

## 🛠️ Comandos Disponibles

| Comando | Descripción |
| :--- | :--- |
| `/start` o `/ayuda` | Muestra el menú de ayuda con ejemplos de uso y corte activo. |
| `/resumen` o `/total` | Emite **dos reportes separados**: uno para **SEGEN** y otro para **INE** con avance de participación y cortes. |
| `/segen` | Emite **exclusivamente el reporte de SEGEN** (padrón, votos, % y avance por cortes). |
| `/ine` | Emite **exclusivamente el reporte de INE** (padrón, votos, % y avance por cortes). |
| `/corte` | Emite **dos notificaciones de corte por separado** (Corte SEGEN y Corte INE) para el bloque activo actual. |
| `/consulta <cédula>` | Consulta centro de votación, mesa y estado de un elector. |
| `/deshacer <cédula>` | Anula el registro de voto de una cédula en caso de error tipográfico. |
| `/recargar` | Refresca el padrón y recarga las filas desde Google Sheets sin reiniciar el bot. |

---

## 📊 Estructura de Google Sheets (SEGEN e INE)

El bot busca automáticamente pestañas que contengan nombres como `SEGEN`, `INE`, `nomina`, o las que configures en `.env`.

### Columnas soportadas (Detección flexible):
El sistema reconoce las cabeceras independientemente de mayúsculas, minúsculas o tildes:

* **Cédula:** `Cédula`, `Cedula`, `CI`, `C.I.`, `Documento`
* **Nombre:** `Nombre y Apellido`, `Nombres y Apellidos`, `Nombre`, `Elector`
* **Nómina / Institución:** `Nómina`, `Institución`, `Dependencia`, `SEGEN`, `INE`
* **Centro de Votación:** `Centro`, `Centro de Votación`, `Colegio`
* **Mesa:** `Mesa`, `Mesa de Votación`
* **Parroquia / Municipio:** `Parroquia`, `Municipio`
* **Auditoría de Voto (Añadidas automáticamente si no existen):**
  * `Voto Listo` (Guarda `SI` o `NO`)
  * `Fecha y Hora` (Guarda marca temporal exacta)
  * `Reportado Por` (Nombre o @usuario de Telegram)

---

## 🚀 Puesta en Marcha

### 1. Requisitos Previos
* Node.js v20 o superior
* Una cuenta de servicio de Google Cloud con acceso a la hoja de Google Sheets
* Un token de bot de Telegram obtenido desde [@BotFather](https://t.me/BotFather)

### 2. Configurar Variables de Entorno
Copia `.env.example` a `.env` y rellena las credenciales:
```bash
cp .env.example .env
```

```env
TELEGRAM_BOT_TOKEN=8907790321:AAHCieUqpB9SHArGIxWrp1axGMWHWhIuxM8
GOOGLE_SPREADSHEET_ID=1ZD57WTZMseTWIWqPriXobLe3imESwKnBhqGpfxXE99A
GOOGLE_SERVICE_ACCOUNT_EMAIL=telegram@telegram-496916.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEET_TABS=SEGEN,INE
TIMEZONE=America/Caracas
PORT=8080
```

### 3. Instalar dependencias y ejecutar
```bash
# Instalar dependencias
npm install

# Ejecutar pruebas unitarias
npm test

# Iniciar en modo desarrollo
npm run dev

# Iniciar en producción
npm start
```

---

## 🌐 Despliegue en la Nube (Render / Railway / VPS)

El proyecto incluye un servidor HTTP nativo en el puerto `8080` (o el que defina `process.env.PORT`) con endpoints `/` y `/healthz` que devuelven el estado del servicio y métricas de votación, permitiendo mantener el bot activo 24/7 sin caídas por inactividad.
