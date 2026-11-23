# free@home Add-On: Shelly Pro 1PM

Bindet einen oder mehrere **Shelly Pro 1PM** als virtuelle **Schaltaktoren** in
ABB/Busch-Jaeger free@home ein (System Access Point 2.0 mit Add-On-Unterstützung).

- Ein/Aus aus free@home (App, Taster, Szenen, Zeitprogramme)
- Live-Rückmeldung, wenn der Shelly anders geschaltet wird (Eingang, Shelly-App, Web-UI) – per WebSocket
- Shelly nicht erreichbar → Gerät erscheint in free@home als „nicht erreichbar“, automatischer Reconnect
- Kommunikation rein lokal über die Shelly Gen2 RPC-API (kein Cloud-Zugriff, kein Passwort am Shelly)

## Voraussetzungen

- Shelly Pro 1PM im selben Netz wie der SysAP, **feste IP** (DHCP-Reservierung empfohlen), **ohne** Passwortschutz
- SysAP mit Add-On-Unterstützung und aktiviertem Entwicklermodus (zum Hochladen eigener Add-Ons)
- Für die Entwicklung: Node.js ≥ 20

## Bauen

```bash
npm install
```

```bash
npm run pack
```

Ergebnis: `de.julian-gilles.shelly-pro-1pm-1.0.0.tar` – diese Datei im SysAP-Webinterface
unter Add-Ons hochladen und installieren.

## Konfiguration

In der Add-On-Konfiguration im SysAP pro Shelly einen Eintrag „Shelly-Geräte“ anlegen:

| Feld       | Beispiel        |
|------------|-----------------|
| Name       | Gartenpumpe     |
| IP-Adresse | 192.168.1.50    |

Pro Eintrag erscheint ein neuer Schaltaktor in free@home, der wie ein normales Gerät
einem Raum zugeordnet und mit Tastern verknüpft werden kann.

Hinweis: Wird ein Eintrag gelöscht, markiert das Add-On das Gerät nur als „nicht erreichbar“;
das Gerät selbst muss in free@home bei Bedarf manuell entfernt werden.

## Shelly ohne free@home testen

```bash
npm run test:shelly -- 192.168.1.50 on
```

Ohne `on`/`off` bleibt das Skript verbunden und zeigt Statusänderungen live an.

## Lokal gegen den SysAP laufen lassen (Entwicklung)

```bash
FREEATHOME_BASE_URL=http://<sysap-ip> FREEATHOME_API_USERNAME=<user> FREEATHOME_API_PASSWORD=<passwort> npm start
```

## Aufbau

- `src/shelly.ts` – Shelly-Client (HTTP-RPC `Switch.Set`/`Switch.GetStatus`, WebSocket `ws://<ip>/rpc` für `NotifyStatus`, 30-s-Polling als Fallback)
- `src/bridge.ts` – verknüpft einen Shelly mit einem virtuellen free@home-Schaltaktor
- `src/main.ts` – liest die Add-On-Konfiguration und verwaltet die Geräte
- `free-at-home-metadata.json` – Add-On-Metadaten und Konfigurationsparameter

## Lizenz

[MIT](LICENSE) © 2026 Julian Gilles
