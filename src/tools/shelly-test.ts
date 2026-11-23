/**
 * Testet die Verbindung zu einem Shelly Pro 1PM ohne free@home.
 *   npm run test:shelly -- <ip> [on|off]
 * Ohne on/off bleibt das Skript verbunden und zeigt Statusänderungen
 * (z. B. über Taster oder Shelly-App) live an. Beenden mit Ctrl+C.
 */
import { ShellyPro1PM } from '../shelly';

async function main(): Promise<void> {
  const [ip, action] = process.argv.slice(2);
  if (!ip) {
    console.error('Usage: npm run test:shelly -- <ip> [on|off]');
    process.exit(1);
  }
  const shelly = new ShellyPro1PM(ip);
  console.log('Device info:', await shelly.getDeviceInfo());
  console.log('Relay is', (await shelly.getOn()) ? 'ON' : 'OFF');

  if (action === 'on' || action === 'off') {
    await shelly.setOn(action === 'on');
    console.log('Relay is now', (await shelly.getOn()) ? 'ON' : 'OFF');
    return;
  }

  shelly.on('state', (on: boolean) => console.log(new Date().toISOString(), 'state:', on ? 'ON' : 'OFF'));
  shelly.on('online', () => console.log('online'));
  shelly.on('offline', () => console.log('offline'));
  shelly.start();
  process.on('SIGINT', () => {
    shelly.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
