import { EventEmitter } from 'events';

export const HTTP_TIMEOUT_MS = 5_000;

/** Grunddaten eines Shelly, ermittelt über GET /shelly. */
export interface ShellyInfo {
  gen: number;
  model: string;
  mac: string;
  /** Relais-Kanäle (0-basiert), die als Schaltaktor genutzt werden können. */
  channels: number[];
}

/**
 * Gemeinsame Schnittstelle für alle Shelly-Generationen.
 *
 * Events:
 *  - 'state'   (channel: number, isOn: boolean) – Relaiszustand gelesen oder geändert
 *  - 'online'  ()                               – Shelly ist (wieder) erreichbar
 *  - 'offline' ()                               – Shelly ist nicht mehr erreichbar
 */
export interface ShellyClient extends EventEmitter {
  readonly ip: string;
  readonly info: ShellyInfo;
  start(): void;
  stop(): void;
  setOn(channel: number, on: boolean): Promise<void>;
}

export async function fetchJson(url: string | URL): Promise<any> {
  const response = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status} ${await response.text()}`);
  }
  return response.json();
}

/** Basisklasse mit Online/Offline-Verwaltung. */
export abstract class BaseShellyClient extends EventEmitter implements ShellyClient {
  private online = false;
  protected stopped = true;

  constructor(
    readonly ip: string,
    readonly info: ShellyInfo,
    protected readonly log = `[shelly ${ip}]`,
  ) {
    super();
  }

  abstract start(): void;
  abstract setOn(channel: number, on: boolean): Promise<void>;

  stop(): void {
    this.stopped = true;
    this.removeAllListeners();
  }

  protected emitState(channel: number, on: boolean): void {
    if (this.info.channels.includes(channel)) this.emit('state', channel, on);
  }

  protected setOnline(online: boolean): void {
    if (this.online === online) return;
    this.online = online;
    console.log(`${this.log} ${online ? 'online' : 'offline'}`);
    this.emit(online ? 'online' : 'offline');
  }
}
