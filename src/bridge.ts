import { FreeAtHome } from '@busch-jaeger/free-at-home';
import { ShellyPro1PM } from './shelly';

type SwitchingActuatorChannel = Awaited<ReturnType<FreeAtHome['createSwitchingActuatorDevice']>>;

export interface ShellyConfig {
  nativeId: string;
  name: string;
  ip: string;
}

/** Verbindet einen Shelly Pro 1PM mit einem virtuellen free@home-Schaltaktor. */
export class ShellyBridge {
  private channel?: SwitchingActuatorChannel;
  private readonly shelly: ShellyPro1PM;
  private lastState?: boolean;
  private readonly log: string;

  constructor(private readonly freeAtHome: FreeAtHome, readonly config: ShellyConfig) {
    this.log = `[${config.name} ${config.ip}]`;
    this.shelly = new ShellyPro1PM(config.ip, this.log);
  }

  async start(): Promise<void> {
    const channel = await this.freeAtHome.createSwitchingActuatorDevice(this.config.nativeId, this.config.name);
    this.channel = channel;

    // Zustand erst bestätigen, wenn der Shelly wirklich geschaltet hat.
    channel.setAutoConfirm(false);
    // Bis der Shelly erreichbar ist, als "nicht erreichbar" markieren.
    await channel.setUnresponsive().catch(() => undefined);

    channel.on('isOnChanged', async (on: boolean) => {
      console.log(`${this.log} free@home -> ${on ? 'ON' : 'OFF'}`);
      try {
        await this.shelly.setOn(on);
        this.updateState(on, true);
      } catch (error) {
        console.error(`${this.log} switching failed: ${(error as Error).message}`);
        // Alten Zustand zurückmelden, damit free@home nicht falsch anzeigt.
        if (this.lastState !== undefined) channel.setOn(this.lastState);
      }
    });

    this.shelly.on('state', (on: boolean) => this.updateState(on));

    this.shelly.on('online', () => {
      channel.setAutoKeepAlive(true);
      channel.triggerKeepAlive().catch((e) => console.error(`${this.log} keepalive failed`, e));
      if (this.lastState !== undefined) channel.setOn(this.lastState);
    });

    this.shelly.on('offline', () => {
      channel.setAutoKeepAlive(false);
      channel.setUnresponsive().catch((e) => console.error(`${this.log} setUnresponsive failed`, e));
    });

    this.shelly.start();
  }

  /** Beendet die Verbindung; das Gerät wird in free@home als nicht erreichbar markiert. */
  async stop(): Promise<void> {
    this.shelly.stop();
    if (this.channel) {
      await this.channel.destroy().catch(() => undefined);
      this.channel = undefined;
    }
  }

  private updateState(on: boolean, force = false): void {
    if (!force && on === this.lastState) return;
    this.lastState = on;
    console.log(`${this.log} state ${on ? 'ON' : 'OFF'}`);
    this.channel?.setOn(on);
  }
}
