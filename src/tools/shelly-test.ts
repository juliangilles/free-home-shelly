/**
 * Testet die Verbindung zu einem Shelly ohne free@home.
 *   npm run test:shelly -- <ip> [on|off] [kanal]
 * Ohne on/off bleibt das Skript verbunden und zeigt Statusänderungen
 * (z. B. über Taster oder Shelly-App) live an. Beenden mit Ctrl+C.
 */
import { connectShelly } from '../shelly';

async function main(): Promise<void> {
  const [ip, action, channelArg] = process.argv.slice(2);
  if (!ip) {
    console.error('Usage: npm run test:shelly -- <ip> [on|off] [channel]');
    process.exit(1);
  }
  const shelly = await connectShelly(ip);
  console.log('Shelly:', shelly.info);

  if (action === 'on' || action === 'off') {
    const channel = Number(channelArg ?? shelly.info.channels[0]);
    await shelly.setOn(channel, action === 'on');
    console.log(`Channel ${channel} switched ${action.toUpperCase()}`);
    shelly.stop();
    return;
  }

  shelly.on('state', (channel: number, on: boolean) =>
    console.log(new Date().toISOString(), `channel ${channel}:`, on ? 'ON' : 'OFF'),
  );
  shelly.on('online', () => console.log('online'));
  shelly.on('offline', () => console.log('offline'));
  shelly.start();
  process.on('SIGINT', () => {
    shelly.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
