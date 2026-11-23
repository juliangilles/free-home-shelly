import { BaseShellyClient, fetchJson } from './types';

const POLL_INTERVAL_MS = 5_000;

/**
 * Shelly der ersten Generation (Shelly 1, 1PM, 2.5, Plug, Plug S, 1L, EM …)
 * über die HTTP-API. Gen1 hat keinen WebSocket, daher Polling alle 5 s.
 */
export class Gen1ShellyClient extends BaseShellyClient {
  private pollTimer?: NodeJS.Timeout;
  private polling = false;

  /** Ermittelt die Relais-Kanäle. Im Rollladen-Modus gibt es keine Schaltkanäle. */
  static async discoverChannels(ip: string): Promise<number[]> {
    const settings = await fetchJson(`http://${ip}/settings`);
    if (settings.mode === 'roller') return [];
    const relays: unknown[] = Array.isArray(settings.relays) ? settings.relays : [];
    return relays.map((_, index) => index);
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.pollTimer = setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
    void this.refresh();
  }

  stop(): void {
    super.stop();
    clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }

  async setOn(channel: number, on: boolean): Promise<void> {
    const result = await fetchJson(`http://${this.ip}/relay/${channel}?turn=${on ? 'on' : 'off'}`);
    this.setOnline(true);
    if (typeof result?.ison === 'boolean') this.emitState(channel, result.ison);
  }

  private async refresh(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const status = await fetchJson(`http://${this.ip}/status`);
      if (this.stopped) return;
      this.setOnline(true);
      const relays: any[] = Array.isArray(status.relays) ? status.relays : [];
      relays.forEach((relay, channel) => {
        if (typeof relay?.ison === 'boolean') this.emitState(channel, relay.ison);
      });
    } catch (error) {
      if (this.stopped) return;
      console.warn(`${this.log} status poll failed: ${(error as Error).message}`);
      this.setOnline(false);
    } finally {
      this.polling = false;
    }
  }
}
