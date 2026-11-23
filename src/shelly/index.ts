import { Gen1ShellyClient } from './gen1';
import { Gen2ShellyClient } from './gen2';
import { ShellyClient, ShellyInfo, fetchJson } from './types';

export type { ShellyClient, ShellyInfo };

/**
 * Erkennt Generation und Relais-Kanäle eines Shelly und liefert den passenden Client.
 * Wirft, wenn der Shelly nicht erreichbar ist, ein Passwort verlangt oder keine Relais hat.
 */
export async function connectShelly(ip: string, log = `[shelly ${ip}]`): Promise<ShellyClient> {
  const id = await fetchJson(`http://${ip}/shelly`);
  const gen = typeof id.gen === 'number' ? id.gen : 1;
  const model = String(id.model ?? id.type ?? 'unknown');
  const mac = String(id.mac ?? '');

  const authEnabled = gen >= 2 ? id.auth_en === true : id.auth === true;
  if (authEnabled) {
    throw new Error(`${model} has password protection enabled, which is not supported`);
  }

  const channels = gen >= 2 ? await Gen2ShellyClient.discoverChannels(ip) : await Gen1ShellyClient.discoverChannels(ip);
  if (channels.length === 0) {
    throw new Error(`${model} has no switch relays (cover/roller mode, dimmer or sensor?)`);
  }

  const info: ShellyInfo = { gen, model, mac, channels };
  console.log(`${log} detected ${model} (Gen${gen}), ${channels.length} relay channel(s)`);
  return gen >= 2 ? new Gen2ShellyClient(ip, info, log) : new Gen1ShellyClient(ip, info, log);
}
