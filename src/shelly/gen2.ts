import WebSocket from 'ws';
import { BaseShellyClient, HTTP_TIMEOUT_MS, fetchJson } from './types';

const POLL_INTERVAL_MS = 30_000;
const PING_INTERVAL_MS = 20_000;
const MAX_RECONNECT_DELAY_MS = 60_000;

/**
 * Shelly ab Generation 2 (Plus, Pro, Mini, Gen3, Gen4 …) über die RPC-API.
 * Schalten per HTTP, Live-Status per WebSocket (NotifyStatus), Polling als Fallback.
 */
export class Gen2ShellyClient extends BaseShellyClient {
  private ws?: WebSocket;
  private reconnectTimer?: NodeJS.Timeout;
  private pollTimer?: NodeJS.Timeout;
  private pingTimer?: NodeJS.Timeout;
  private reconnectDelayMs = 1000;
  private rpcId = 1;

  /** Ermittelt alle Relais-Kanäle (Komponenten "switch:N"). */
  static async discoverChannels(ip: string): Promise<number[]> {
    const status = await rpc(ip, 'Shelly.GetStatus');
    return switchChannels(status);
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
    this.pollTimer = setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
    void this.refresh();
  }

  stop(): void {
    super.stop();
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
  }

  async setOn(channel: number, on: boolean): Promise<void> {
    await rpc(this.ip, 'Switch.Set', { id: channel, on });
    this.setOnline(true);
  }

  private async refresh(): Promise<void> {
    try {
      const status = await rpc(this.ip, 'Shelly.GetStatus');
      this.setOnline(true);
      this.applyStatus(status);
    } catch (error) {
      console.warn(`${this.log} status poll failed: ${(error as Error).message}`);
      this.setOnline(false);
    }
  }

  private applyStatus(status: Record<string, any>): void {
    for (const [key, value] of Object.entries(status ?? {})) {
      const match = /^switch:(\d+)$/.exec(key);
      if (match && typeof value?.output === 'boolean') {
        this.emitState(Number(match[1]), value.output);
      }
    }
  }

  private connect(): void {
    if (this.stopped) return;
    const ws = new WebSocket(`ws://${this.ip}/rpc`, { handshakeTimeout: HTTP_TIMEOUT_MS });
    this.ws = ws;

    ws.on('open', () => {
      console.log(`${this.log} websocket connected`);
      this.reconnectDelayMs = 1000;
      // Der Shelly sendet Notifications nur an Clients, die schon einmal mit "src" angefragt haben.
      this.send('Shelly.GetStatus');
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => ws.ping(), PING_INTERVAL_MS);
    });

    ws.on('message', (data) => this.handleMessage(data.toString()));

    ws.on('error', (error) => {
      console.warn(`${this.log} websocket error: ${error.message}`);
    });

    ws.on('close', () => {
      clearInterval(this.pingTimer);
      if (this.stopped) return;
      console.warn(`${this.log} websocket closed, reconnecting in ${this.reconnectDelayMs} ms`);
      this.setOnline(false);
      this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelayMs);
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
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

    if (msg.result && typeof msg.result === 'object') {
      // Antwort auf Shelly.GetStatus
      this.setOnline(true);
      this.applyStatus(msg.result);
    } else if (msg.method === 'NotifyStatus' || msg.method === 'NotifyFullStatus') {
      // Statusänderung (Taster, Shelly-App, Web-UI, Zeitplan …)
      this.setOnline(true);
      this.applyStatus(msg.params);
    }
  }
}

export function switchChannels(status: Record<string, unknown>): number[] {
  return Object.keys(status ?? {})
    .map((key) => /^switch:(\d+)$/.exec(key))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}

async function rpc(ip: string, method: string, params?: Record<string, unknown>): Promise<any> {
  const url = new URL(`http://${ip}/rpc/${method}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, String(value));
  }
  return fetchJson(url);
}

