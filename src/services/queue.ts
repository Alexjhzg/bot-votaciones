/**
 * Cola de tareas asíncronas secuenciales (FIFO) con reintentos y retroceso exponencial.
 * Garantiza que las escrituras a Google Sheets se realicen en orden estricto,
 * evitando condiciones de carrera, errores 429 de límite de cuota y pérdidas de reportes concurrentes.
 */

export interface QueueTaskOptions {
  retries?: number;
  delayMs?: number;
  label?: string;
}

export class AsyncQueue {
  private chain: Promise<any> = Promise.resolve();
  private pendingCount = 0;
  private defaultRetries = 3;
  private defaultDelayMs = 1000;

  constructor(defaultRetries: number = 3, defaultDelayMs: number = 1000) {
    this.defaultRetries = defaultRetries;
    this.defaultDelayMs = defaultDelayMs;
  }

  /**
   * Encola una tarea asíncrona para ser ejecutada secuencialmente.
   */
  public add<T>(task: () => Promise<T>, options?: QueueTaskOptions): Promise<T> {
    const retries = options?.retries ?? this.defaultRetries;
    const delayMs = options?.delayMs ?? this.defaultDelayMs;
    const label = options?.label ?? "Tarea";

    this.pendingCount++;

    return new Promise<T>((resolve, reject) => {
      this.chain = this.chain
        .then(async () => {
          try {
            const result = await this.executeWithRetry(task, retries, delayMs, label);
            resolve(result);
          } catch (error) {
            reject(error);
          } finally {
            this.pendingCount--;
          }
        })
        .catch((fatalErr) => {
          // Previene que un fallo no capturado rompa la cadena de la cola
          console.error(`[QUEUE ERROR] Error crítico en la cadena de la cola (${label}):`, fatalErr);
        });
    });
  }

  /**
   * Ejecuta una tarea con reintentos automáticos ante errores de red o cuota de API.
   */
  private async executeWithRetry<T>(
    task: () => Promise<T>,
    retries: number,
    delayMs: number,
    label: string
  ): Promise<T> {
    let attempt = 0;

    while (attempt <= retries) {
      try {
        return await task();
      } catch (err: any) {
        attempt++;

        if (attempt > retries) {
          console.error(
            `[QUEUE] Falló definitivamente "${label}" tras ${retries} reintentos:`,
            err?.message || err
          );
          throw err;
        }

        // Retroceso exponencial: 1s, 2s, 4s...
        const waitTime = delayMs * Math.pow(2, attempt - 1);
        console.warn(
          `[QUEUE WARN] Intento ${attempt} de "${label}" falló (${err?.message || "Error"}). Reintentando en ${waitTime}ms... (En cola: ${this.pendingCount})`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    throw new Error(`No se pudo completar la tarea "${label}".`);
  }

  /**
   * Devuelve la cantidad de tareas actualmente en cola o ejecución.
   */
  public getPendingCount(): number {
    return this.pendingCount;
  }

  /**
   * Indica si la cola está vacía e inactiva.
   */
  public isIdle(): boolean {
    return this.pendingCount === 0;
  }

  /**
   * Espera a que todas las tareas en cola terminen de ejecutarse.
   */
  public async onIdle(): Promise<void> {
    while (!this.isIdle()) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

/**
 * Instancia singleton global para gestionar las escrituras y sincronizaciones de votos.
 */
export const voteQueue = new AsyncQueue(3, 1000);
