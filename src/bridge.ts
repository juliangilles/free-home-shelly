import { FreeAtHome } from '@busch-jaeger/free-at-home';
import { ShellyClient, connectShelly } from './shelly';

type SwitchingActuatorChannel = Awaited<ReturnType<FreeAtHome['createSwitchingActuatorDevice']>>;

export interface ShellyConfig {
  /** Stabile Basis-ID je Konfigurationseintrag; pro Kanal wird "-<n>" angehängt. */
  nativeId: string;
  name: string;
  ip: string;
}

const DETECT_RETRY_MIN_MS = 10_000;
const DETECT_RETRY_MAX_MS = 5 * 60_000;

interface ActuatorState {
  channel: SwitchingActuatorChannel;
  lastState?: boolean;
}

/**
 * Verbindet einen Shelly mit free@home: pro Relais-Kanal ein virtueller Schaltaktor.
 * Ist der Shelly beim Start nicht erreichbar, wird die Erkennung wiederholt.
 */
export class ShellyBridge {
  private shelly?: ShellyClient;
  private readonly actuators = new Map<number, ActuatorState>();
  private retryTimer?: NodeJS.Timeout;
  private retryDelayMs = DETECT_RETRY_MIN_MS;
  private stopped = false;
  private readonly log: string;

  constructor(private readonly freeAtHome: FreeAtHome, readonly config: ShellyConfig) {
    this.log = `[${config.name} ${config.ip}]`;
  }

  start(): void {
    void this.detect();
  }

  /** Beendet die Verbindung; die Geräte werden in free@home als nicht erreichbar markiert. */
  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.shelly?.stop();
    this.shelly = undefined;
    await Promise.all([...this.actuators.values()].map((a) => a.channel.destroy().catch(() => undefined)));
    this.actuators.clear();
  }

  private async detect(): Promise<void> {
    if (this.stopped) return;
    try {
      const shelly = await connectShelly(this.config.ip, this.log);
      if (this.stopped) return;
      this.shelly = shelly;
      await this.createActuators(shelly);
      if (this.stopped) return;
      this.wire(shelly);
      shelly.start();
    } catch (error) {
      if (this.stopped) return;
      console.warn(`${this.log} detection failed: ${(error as Error).message}; retry in ${this.retryDelayMs / 1000} s`);
      this.shelly?.stop();
      this.shelly = undefined;
      this.retryTimer = setTimeout(() => void this.detect(), this.retryDelayMs);
      this.retryDelayMs = Math.min(this.retryDelayMs * 2, DETECT_RETRY_MAX_MS);
    }
  }

  private async createActuators(shelly: ShellyClient): Promise<void> {
    const { channels } = shelly.info;
    for (const ch of channels) {
      if (this.actuators.has(ch)) continue;
      const name = channels.length > 1 ? `${this.config.name} ${ch + 1}` : this.config.name;
      const channel = await this.freeAtHome.createSwitchingActuatorDevice(`${this.config.nativeId}-${ch}`, name);
      // Zustand erst bestätigen, wenn der Shelly wirklich geschaltet hat.
      channel.setAutoConfirm(false);
      await channel.setUnresponsive().catch(() => undefined);
      this.actuators.set(ch, { channel });

      channel.on('isOnChanged', (on: boolean) => void this.switch(ch, on));
    }
  }

  private wire(shelly: ShellyClient): void {
    shelly.on('state', (ch: number, on: boolean) => this.updateState(ch, on));

    shelly.on('online', () => {
      for (const { channel, lastState } of this.actuators.values()) {
        channel.setAutoKeepAlive(true);
        channel.triggerKeepAlive().catch((e) => console.error(`${this.log} keepalive failed`, e));
        if (lastState !== undefined) channel.setOn(lastState);
      }
    });

    shelly.on('offline', () => {
      for (const { channel } of this.actuators.values()) {
        channel.setAutoKeepAlive(false);
        channel.setUnresponsive().catch((e) => console.error(`${this.log} setUnresponsive failed`, e));
      }
    });
  }

  private async switch(ch: number, on: boolean): Promise<void> {
    const actuator = this.actuators.get(ch);
    if (!actuator) return;
    console.log(`${this.log} free@home -> channel ${ch} ${on ? 'ON' : 'OFF'}`);
    try {
      if (!this.shelly) throw new Error('Shelly not connected');
      await this.shelly.setOn(ch, on);
      this.updateState(ch, on, true);
    } catch (error) {
      console.error(`${this.log} switching channel ${ch} failed: ${(error as Error).message}`);
      // Alten Zustand zurückmelden, damit free@home nicht falsch anzeigt.
      if (actuator.lastState !== undefined) actuator.channel.setOn(actuator.lastState);
    }
  }

  private updateState(ch: number, on: boolean, force = false): void {
    const actuator = this.actuators.get(ch);
    if (!actuator) return;
    if (!force && on === actuator.lastState) return;
    actuator.lastState = on;
    console.log(`${this.log} channel ${ch} ${on ? 'ON' : 'OFF'}`);
    actuator.channel.setOn(on);
  }
}
