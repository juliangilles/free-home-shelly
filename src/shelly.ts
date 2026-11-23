import { EventEmitter } from 'events';
import WebSocket from 'ws';

/**
 * Client für einen Shelly Pro 1PM (Gen2 RPC API, ohne Authentifizierung).
 *
 * Events:
 *  - 'state'   (isOn: boolean)  – Relaiszustand hat sich geändert / wurde gelesen
 *  - 'online'  ()               – Shelly ist (wieder) erreichbar
 *  - 'offline' ()               – Shelly ist nicht mehr erreichbar
 */
export class ShellyPro1PM extends EventEmitter {
  private ws?: WebSocket;
  private reconnectTimer?: NodeJS.Timeout;
  private pollTimer?: NodeJS.Timeout;
  private pingTimer?: NodeJS.Timeout;
  private reconnectDelayMs = 1000;
  private online = false;
  private stopped = true;
  private rpcId = 1;

  static readonly SWITCH_ID = 0;
  static readonly POLL_INTERVAL_MS = 30_000;
  static readonly HTTP_TIMEOUT_MS = 5_000;
  static readonly MAX_RECONNECT_DELAY_MS = 60_000;

  constructor(public readonly ip: string, private readonly logPrefix = `[shelly ${ip}]`) {
    super();
  }

  get isOnline(): boolean {
    return this.online;
  }

  /** Startet WebSocket-Verbindung (Live-Status) und Polling-Fallback. */
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
    this.pollTimer = setInterval(() => void this.refresh(), ShellyPro1PM.POLL_INTERVAL_MS);
    void this.refresh();
  }

  stop(): void {
    this.stopped = true;
    clearInterval(this.pollTimer);
    clearInterval(this.pingTimer);
    clearTimeout(this.reconnectTimer);
    this.pollTimer = this.pingTimer = this.reconnectTimer = undefined;
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.on('error', () => undefined);
      this.ws.terminate();
      this.ws = undefined;
    }
    this.removeAllListeners();
  }

  /** Relais schalten. Wirft bei Fehler. */
  async setOn(on: boolean): Promise<void> {
    await this.rpc('Switch.Set', { id: ShellyPro1PM.SWITCH_ID, on });
    this.setOnline(true);
  }

  /** Aktuellen Relaiszustand per HTTP lesen. */
  async getOn(): Promise<boolean> {
    const status = await this.rpc('Switch.GetStatus', { id: ShellyPro1PM.SWITCH_ID });
    return Boolean(status.output);
  }

  async getDeviceInfo(): Promise<{ id: string; mac: string; model: string; fw_id: string }> {
    return this.rpc('Shelly.GetDeviceInfo');
  }

  private async refresh(): Promise<void> {
    try {
      const on = await this.getOn();
      this.setOnline(true);
      this.emit('state', on);
    } catch (error) {
      console.warn(`${this.logPrefix} status poll failed: ${(error as Error).message}`);
      this.setOnline(false);
    }
  }

  private async rpc(method: string, params?: Record<string, unknown>): Promise<any> {
    const url = new URL(`http://${this.ip}/rpc/${method}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(ShellyPro1PM.HTTP_TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`${method} failed: HTTP ${response.status} ${await response.text()}`);
    }
    return response.json();
  }

  private connect(): void {
    if (this.stopped) return;
    const ws = new WebSocket(`ws://${this.ip}/rpc`, { handshakeTimeout: ShellyPro1PM.HTTP_TIMEOUT_MS });
    this.ws = ws;

    ws.on('open', () => {
      console.log(`${this.logPrefix} websocket connected`);
      this.reconnectDelayMs = 1000;
      // Shelly sendet Notifications nur an Clients, die sich mit einem "src" gemeldet haben.
      this.send('Switch.GetStatus', { id: ShellyPro1PM.SWITCH_ID });
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => ws.ping(), 20_000);
    });

    ws.on('message', (data) => this.handleMessage(data.toString()));

    ws.on('error', (error) => {
      console.warn(`${this.logPrefix} websocket error: ${error.message}`);
    });

    ws.on('close', () => {
      clearInterval(this.pingTimer);
      if (this.stopped) return;
      console.warn(`${this.logPrefix} websocket closed, reconnecting in ${this.reconnectDelayMs} ms`);
      this.setOnline(false);
      this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelayMs);
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, ShellyPro1PM.MAX_RECONNECT_DELAY_MS);
    });
  }

  private send(method: string, params?: Record<string, unknown>): void {
    this.ws?.send(JSON.stringify({ id: this.rpcId++, src: `fah-addon-${process.pid}`, method, params }));
  }

  private handleMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // Antwort auf Switch.GetStatus
    if (msg.result && typeof msg.result.output === 'boolean') {
      this.setOnline(true);
      this.emit('state', msg.result.output);
      return;
    }

    // Statusänderung (z. B. Taster, App, Web-UI)
    if (msg.method === 'NotifyStatus' || msg.method === 'NotifyFullStatus') {
      const sw = msg.params?.[`switch:${ShellyPro1PM.SWITCH_ID}`];
      if (sw && typeof sw.output === 'boolean') {
        this.setOnline(true);
        this.emit('state', sw.output);
      }
    }
  }

  private setOnline(online: boolean): void {
    if (this.online === online) return;
    this.online = online;
    console.log(`${this.logPrefix} ${online ? 'online' : 'offline'}`);
    this.emit(online ? 'online' : 'offline');
  }
}
