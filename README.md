# second-brain-app

PWA-Add-on zu einem privaten Obsidian-Vault. Enthält nur Code, keine Daten.
Die App schreibt mit einem lokal gespeicherten, fine-grained GitHub-Token direkt in das private Vault-Repo.

Zugehöriger Vault: privates Repo `DaStocki/second-brain` (Obsidian). Mnemo (Claude) arbeitet dort; die Befehle `/checkin`, `/offen` und die Action `checkin-reminder.yml` kennen die App.

Eine einzelne HTML-Datei (`index.html`, kein Build) als Ergänzung zu Obsidian. Sie liest und schreibt das Repo über die GitHub-API; Obsidian, der Vault und Mnemo (Claude) arbeiten unverändert weiter.

## Entscheidungen (11.10.2026)
- Hosting: GitHub Pages aus dem öffentlichen Repo `DaStocki/second-brain-app` (nur Code), https://dastocki.github.io/second-brain-app/ – Artifact verworfen, weil es api.github.com blockiert
- PWA, Oberfläche auf Deutsch, Token nur lokal im Gerät (fine-grained, `contents: write` nur für dieses Repo)
- Der Wiki-Ingest bleibt bei Mnemo (`/ingest-journal`); die App schreibt nur in `journal/`
- Journaltexte werden nur angehängt, nie umgeschrieben; Commits gehen auf `main`, nie Force

## Stand
- [x] Heute (Startseite): Check-in-Status, Fälliges der nächsten 7 Tage, letzte Notizen, Knöpfe für Notiz und Beobachtung
- [x] Check-in: eine Frage pro Bildschirm, Tipp auf die Zahl springt weiter, „kurz“, Zusammenfassung vor dem Speichern; Entwurf bleibt auf dem Gerät
- [x] Notiz (`/journal`), Beobachtung (`/symptom`, nur Journalteil)
- [x] Offline: Check-in, Notiz und Beobachtung landen ohne Netz in einer Warteschlange und werden automatisch gesendet
- [x] Neue Aufgabe („+ Aufgabe“ auf Heute, „+ Neu“ auf Offen): Text (mit Diktat), Seite per Suche aus Projekten/Personen/Themen (zuletzt genutzte zuerst), optional Datum. Landet als `- [ ] …` (ggf. mit `📅 YYYY-MM-DD`) unter „## Offene Aufgaben“ bzw. „## Offene Punkte“ der Seite, sonst wird der Abschnitt vor „## Quellen“ angelegt; setzt `offen`-Tag und `last-updated`, Eintrag in `wiki/log.md`; geht offline in die Warteschlange
- [x] Offen: `- [ ]`-Aufgaben aus `wiki/` (ohne log/index), Datumserkennung wie `/offen`, Filter nach Bereich, Abhaken mit 5 s „Rückgängig“ (geschrieben wird erst danach, beim Tab-Wechsel oder Schließen sofort); setzt `last-updated`, entfernt `offen` beim letzten Haken; Seitenname öffnet die Seite in Obsidian; Datum antippen bzw. „+ Datum“ setzt oder ändert die Fälligkeit, „×“ entfernt sie (schreibt `📅 YYYY-MM-DD` ans Zeilenende, das hat Vorrang vor erkannten Daten im Text; `/offen` liest es genauso)
- [x] Verlauf: ein Diagramm pro Check-in-Wert aus `journal/` (Tageswerte und 7-Tage-Schnitt), 14 Tage / 30 Tage / alle
- [x] Spracheingabe: Mikrofon-Knopf in Notiz, Beobachtung und den Freitext-Fragen des Check-ins (Web Speech API, Deutsch). In Chrome geht der Ton zur Erkennung an Google; Brave unterstützt die Funktion nicht, dort fehlt der Knopf (Alternative: Mikrofon der Tastatur)
- [x] Benachrichtigungen (⚙︎): Check-in-Erinnerung per Web-Push. Die App legt ihre Anmeldung in `.github/push-subscriptions.json` ab; die Action `.github/workflows/checkin-reminder.yml` läuft täglich um 20:47 (Europe/Berlin, Sommer- und Winterzeit) und schickt nur, wenn `journal/<heute>.md` noch kein `typ: checkin` hat. Braucht das Repo-Secret `VAPID_PRIVATE_KEY`; manuell testen über Actions → „Check-in-Erinnerung“ → Run workflow
- [x] PIN-Sperre (⚙︎): Token, Check-in-Entwurf, Notiz-Entwurf, Warteschlange und Zwischenspeicher werden mit AES-GCM verschlüsselt, Schlüssel per PBKDF2 (310.000 Runden) aus der PIN; Sperre nach 5 Minuten im Hintergrund; nach 5 Fehlversuchen wachsende Wartezeit; „PIN vergessen“ setzt die App auf dem Gerät zurück

Die 20:47-Routine und `/checkin` erkennen einen Check-in aus der App und übernehmen ihn ohne Fragen ins Wiki.

## Design
- Drei Designs, wählbar unter ⚙︎ → Design (pro Gerät, `localStorage` `theme`, gesetzt per `data-theme` auf `<html>` vor dem ersten Rendern):
  - **Ringe** (`rings`, Standard): dunkles Navy, Flächen mit Verlaufskante, Pill-Steuerelemente, hellblaue Leuchtakzente, Filmkorn; Poppins + JetBrains Mono
  - **Stahl** (`steel`): Stahlplatten mit Chrom-Fasen, VT323-Phosphor-Anzeigen, Geist als Fließtext, Scanlines in vertieften Feldern, Grün/Bernstein/Koralle nur als Zustand; schräge Laufschrift auf dem Sperrbildschirm
  - **Klinik** (`clinical`): tiefes Tintenblau, fast schwarze Panels mit Signalschein an der Oberkante, leichte Grotesk-Überschriften (Bricolage Grotesque), Hanken Grotesk, Daten in IBM Plex Mono, ein kühler Signalakzent; einziger Effekt ist der aufleuchtende Hauptknopf, sonst ruhig; Sperrbildschirm mit Kern und gekippten Tick-Ringen
- Schriftgröße wählbar unter ⚙︎ → Design (Klein 90 %, Normal, Groß 115 %, Sehr groß 130 %; `localStorage` `fontscale`): skaliert den App-Inhalt per CSS `zoom`, die Tab-Leiste wächst höchstens auf 110 %.
- Tokens als CSS-Variablen oben im `<style>`; „Stahl“ und „Klinik“ überschreiben sie in den Blöcken `[data-theme="steel"]` bzw. `[data-theme="clinical"]`.
- Alle Schriften liegen lokal unter `fonts/` (SIL Open Font License), kein Abruf bei Google Fonts.

## Schreiben ins Repo
- Journal-Einträge (Check-in, Notiz, Beobachtung): ein Commit über die Contents-API.
- Wiki-Änderungen (Abhaken, Fälligkeit, neue Aufgabe): Seite **und** Eintrag in `wiki/log.md` in **einem** Commit über die Git-Data-API (Tree, Commit, Ref vorspulen). Hat jemand anderes (Obsidian, Mnemo) in der Zwischenzeit gepusht, wird alles neu gelesen und erneut versucht; nie erzwungen.

## Grenzen
- Füllwörter werden nicht entfernt (wie `/journal -roh`); Bereinigung später durch Mnemo auf Zuruf
- `/symptom` ergänzt in der App nur `journal/`, die Tabelle in `wiki/concepts/beobachtungen.md` pflegt Mnemo beim nächsten Lauf

## Tests

Ende-zu-Ende-Tests mit Playwright gegen eine simulierte GitHub-API und einen frei erfundenen Test-Vault (`tests/fixtures/vault`, keine echten Daten). Sie laufen bei jedem Push in GitHub Actions.

```
npm ci
npx playwright install chromium
npm test
```

