# free@home Add-On: Shelly Schaltaktoren

Bindet Shelly-Relais und -Steckdosen als virtuelle **Schaltaktoren** in
ABB/Busch-Jaeger free@home ein (System Access Point 2.0 mit Add-On-Unterstützung).

- Ein/Aus aus free@home (App, Taster, Szenen, Zeitprogramme)
- Generation und Anzahl der Relais werden automatisch erkannt; pro Relais-Kanal entsteht ein Schaltaktor
- Rückmeldung, wenn der Shelly anders geschaltet wird (Eingang, Shelly-App, Web-UI)
- Shelly nicht erreichbar → Gerät erscheint als „nicht erreichbar“, automatischer Reconnect
- Rein lokal über die Shelly-HTTP/RPC-API, kein Cloud-Zugriff

## Unterstützte Geräte

| Shelly | Beispiele | Rückmeldung |
|---|---|---|
| Gen2, Gen3, Gen4 (Plus, Pro, Mini) | Pro 1PM, Pro 4PM, Plus 1, Plus Plug S, 1PM Gen3, Plug S Gen3 | sofort (WebSocket) |
| Gen1 | Shelly 1, 1PM, 2.5, Plug, Plug S | alle 5 s (Polling) |

Nicht unterstützt: Rollladen-/Cover-Modus, Dimmer, RGBW, reine Sensoren und
Shellys mit aktiviertem Passwortschutz. Getestet am echten Gerät wurde bisher der Shelly Pro 1PM;
die übrigen Modelle nutzen dieselbe dokumentierte Shelly-API.

## Voraussetzungen

- Shelly im selben Netz wie der SysAP, **feste IP** (DHCP-Reservierung empfohlen), **ohne** Passwortschutz
- SysAP mit Add-On-Unterstützung und aktiviertem Entwicklermodus (zum Hochladen eigener Add-Ons)
- Für die Entwicklung: Node.js ≥ 20

## Bauen

```bash
npm install
```

```bash
npm run pack
```

Ergebnis: `de.julian-gilles.shelly-switch-2.0.0.tar` – diese Datei im SysAP-Webinterface
unter Add-Ons hochladen und installieren.

## Konfiguration

In der Add-On-Konfiguration im SysAP pro Shelly einen Eintrag „Shelly-Geräte“ anlegen:

| Feld       | Beispiel        |
|------------|-----------------|
| Name       | Gartenpumpe     |
| IP-Adresse | 192.168.1.50    |

Hat ein Shelly mehrere Relais (z. B. Pro 4PM), entstehen automatisch mehrere Schaltaktoren
mit durchnummerierten Namen („Gartenpumpe 1“, „Gartenpumpe 2“ …).

Wird ein Eintrag gelöscht, markiert das Add-On die Geräte nur als „nicht erreichbar“;
die Geräte selbst müssen in free@home bei Bedarf manuell entfernt werden.

### Umstieg von Version 1 (`de.julian-gilles.shelly-pro-1pm`)

Version 2 hat eine neue Add-On-ID. Alte Version im SysAP deinstallieren, neue installieren,
Shellys neu eintragen und die neuen Schaltaktoren in free@home Räumen und Tastern zuordnen.

## Shelly ohne free@home testen

```bash
npm run test:shelly -- 192.168.1.50 on
```

Optional mit Kanal: `npm run test:shelly -- 192.168.1.50 on 1`. Ohne `on`/`off` bleibt das
Skript verbunden und zeigt Statusänderungen live an.

## Lokal gegen den SysAP laufen lassen (Entwicklung)

```bash
FREEATHOME_BASE_URL=http://<sysap-ip> FREEATHOME_API_USERNAME=<user> FREEATHOME_API_PASSWORD=<passwort> npm start
```

## Aufbau

- `src/shelly/index.ts` – erkennt Generation und Relais-Kanäle (`GET /shelly`) und wählt den Client
- `src/shelly/gen2.ts` – Gen2+: RPC `Switch.Set`/`Shelly.GetStatus`, WebSocket `NotifyStatus`, 30-s-Polling als Fallback
- `src/shelly/gen1.ts` – Gen1: `/relay/<n>?turn=on|off`, `/status`-Polling
- `src/bridge.ts` – verknüpft einen Shelly mit je einem free@home-Schaltaktor pro Kanal
- `src/main.ts` – liest die Add-On-Konfiguration und verwaltet die Geräte
- `free-at-home-metadata.json` – Add-On-Metadaten und Konfigurationsparameter

## Lizenz

[MIT](LICENSE) © 2026 Julian Gilles
