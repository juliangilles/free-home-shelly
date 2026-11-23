import { FreeAtHome, AddOn } from '@busch-jaeger/free-at-home';
import { ShellyBridge, ShellyConfig } from './bridge';

const metaData = AddOn.readMetaData();
const freeAtHome = new FreeAtHome();
freeAtHome.activateSignalHandling();

const addOn = new AddOn.AddOn(metaData.id);
const bridges = new Map<string, ShellyBridge>();

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Liest alle Shelly-Einträge aus der Add-On-Konfiguration.
 * Die mehrfache Gruppe "shellys" kommt als { "<entryId>": { items: {...} } };
 * die entryId ist stabil und dient als nativeId des virtuellen Geräts.
 */
function parseConfiguration(configuration: AddOn.Configuration): ShellyConfig[] {
  const result: ShellyConfig[] = [];
  const group: any = configuration?.['shellys'];
  if (!group) return result;

  const entries: [string, any][] = 'items' in group ? [['0', group]] : Object.entries(group);
  for (const [entryId, entry] of entries) {
    const items = entry?.items ?? {};
    const ip = String(items.ip ?? '').trim();
    const name = String(items.name ?? '').trim() || `Shelly ${ip}`;
    if (items.$disabled) continue;
    if (!IPV4.test(ip)) {
      console.warn(`Ignoring Shelly entry "${name}": invalid IP "${ip}"`);
      continue;
    }
    result.push({ nativeId: `shellypro1pm-${entryId}`, name, ip });
  }
  return result;
}

let applying: Promise<void> = Promise.resolve();

async function applyConfiguration(configs: ShellyConfig[]): Promise<void> {
  const wanted = new Map(configs.map((c) => [c.nativeId, c]));

  // Entfernte oder geänderte Geräte stoppen
  for (const [id, bridge] of bridges) {
    const next = wanted.get(id);
    if (!next || next.ip !== bridge.config.ip || next.name !== bridge.config.name) {
      console.log(`Stopping ${bridge.config.name} (${bridge.config.ip})`);
      await bridge.stop();
      bridges.delete(id);
    }
  }

  // Neue Geräte starten
  for (const config of configs) {
    if (bridges.has(config.nativeId)) continue;
    console.log(`Starting ${config.name} (${config.ip})`);
    const bridge = new ShellyBridge(freeAtHome, config);
    bridges.set(config.nativeId, bridge);
    try {
      await bridge.start();
    } catch (error) {
      console.error(`Failed to start ${config.name}:`, error);
      bridges.delete(config.nativeId);
    }
  }
}

addOn.on('configurationChanged', (configuration) => {
  const configs = parseConfiguration(configuration);
  console.log(`Configuration changed: ${configs.length} Shelly device(s)`);
  // Änderungen nacheinander abarbeiten
  applying = applying.then(() => applyConfiguration(configs)).catch((e) => console.error(e));
});

addOn.connectToConfiguration();

// Beim Beenden markiert activateSignalHandling() alle Geräte als nicht erreichbar
// und beendet den Prozess; hier nur die Konfigurations-Verbindung schließen.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    addOn.dispose();
  });
}
