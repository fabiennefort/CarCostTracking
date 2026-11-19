# Autokosten – Funktionsbeschreibung

Web-App für das iPhone, die über Safari auf den Home-Bildschirm gelegt wird. Sie erfasst alle Kosten eines Autos von der Anschaffung bis zum Verkauf und zeigt, was es pro gefahrenem Kilometer wirklich kostet. Mehrere Personen können ein Auto gemeinsam pflegen.

## Einstieg

- **Konto:** Registrierung und Anmeldung mit E-Mail und Passwort.
- **Begrüßung:** Neue Nutzer sehen kurz, was die App kann. Danach wählen sie „Unser Auto anlegen“ oder „Ich habe einen Einladungscode“.
- **Einrichtungsassistent** in 5 Schritten. Alles außer Schritt 1 lässt sich überspringen.
  1. **Auto:** Name, Antrieb (Liter oder kWh) und optional ein geschätzter Restwert.
     - *Gerade gekauft:* Kaufdatum, Kaufpreis und km-Stand beim Kauf.
     - *Haben wir schon länger:* Startdatum, **geschätzter Wert als Ausgangswert** und km-Stand zum Start. Alles davor bleibt außen vor.
  2. **Laufende Kosten:** Versicherung (Betrag, Zahlweise, erste Zahlung) und Kfz-Steuer.
  3. **Erinnerungen:** nächster TÜV (Monat), nächster Ölwechsel (km), Reifenwechsel im Frühjahr und Herbst, jährlicher Versicherungsvergleich.
  4. **Zusätzliche Kategorien:** Bußgelder, Mitgliedschaften, Bewohnerparken, Zubehör, Finanzierung/Leasing, Erstattungen.
  5. **Teilen:** Einladungscode erzeugen und verschicken.
- **Beitritt per Code:** Wer einen Code hat, landet nach dem Beitritt auf einer eigenen Willkommensseite für das Auto.

## Erfassen (Plus-Taste)

- **Tanken/Laden:** Betrag, Liter oder kWh, km-Stand, Datum, Kommentar, Belegfoto. Der Preis pro Liter wird mitgerechnet. Ein „vollgetankt“-Häkchen gibt es bewusst nicht.
- **Kosten:** Kategorie, Betrag, Datum, optional km-Stand, Kommentar („Worum ging’s?“) und Belegfoto. Pro Eintrag lässt sich die Einordnung als fix oder nutzungsabhängig umschalten.
- **Einnahmen,** z. B. Spritgeld von Mitfahrern oder Erstattungen. Sie senken die Kosten, nicht aber den Verbrauch.
- **km-Stand,** zwischendurch, wenn länger nicht getankt wird.
- **Erlebnis:** Titel, Datum, km-Stand, Notiz und mehrere Fotos.
- **Erinnerung** (siehe unten).

Alle Einträge lassen sich nachträglich bearbeiten und löschen.

## Übersicht

- **Kosten pro km** als große Kennzahl. Sie folgt der Auswahl der Filter-Chips aus der Kosten-Auswertung.
- **Fällige Erinnerungen**, markiert als „Überfällig“ oder „Bald“.
- **Vier Kennzahlen:** gefahrene km, Fixkosten pro Monat, Nutzungskosten pro km, Verbrauch der letzten 6 Monate.
- Zuletzt eingetragene Einträge und das letzte Erlebnis.
- Tipp auf den Autonamen öffnet **Meine Autos**: wechseln, neues Auto anlegen, per Code beitreten, geteiltes Auto verlassen.

## Kosten

- **Auswertung**
  - Nutzungskosten, Fixkosten, Wertverlust (Kaufpreis minus Restwert bzw. Verkaufspreis), Einnahmen und das Ergebnis – jeweils gesamt und pro km.
  - **Filter-Chips** Nutzung · Fixkosten · Wertverlust · Einnahmen schalten Bestandteile ein und aus. Ausgeschlossene Werte erscheinen ausgegraut. Die Auswahl gilt pro Gerät.
  - Diagramm der Monatskosten der letzten 12 Monate, getrennt nach fix und Nutzung. Versicherung und Steuer werden auf die Monate verteilt.
  - Aufteilung nach Kategorien mit Anteil und Cent pro km. Einnahmen erscheinen in einem eigenen Abschnitt.
- **Einträge:** alle Kosten und Einnahmen, filterbar nach Kategorie, mit Summen.
- **Laufend:** wiederkehrende Kosten wie Versicherung, Steuer, ADAC oder Leasing, monatlich bis jährlich. Ändert sich der Beitrag, gilt der neue Betrag ab einem Stichtag. Die bisherigen Zahlungen bleiben in der Auswertung erhalten.

## Verbrauch

- **Auswertung:** Durchschnitt über die ganze Zeit, Durchschnitt der letzten 6 Monate, Spritkosten pro 100 km, Durchschnittspreis pro Liter.
  - Diagramme: Verbrauchsverlauf (gleitend über 6 Monate) und Preis pro Liter (Monatsschnitt).
  - Berechnung: alle getankten Liter außer der ersten Füllung, geteilt durch die km zwischen erster und letzter Tankung. Teilbetankungen mitteln sich über die Zeit heraus.
- **Tankungen:** Liste aller Tank- bzw. Ladevorgänge.
- **km-Stände:** aktueller Stand, gefahrene km seit Start, Fahrleistung pro Jahr und pro Tag.

## Erinnerungen

- Fällig nach **Datum und/oder km**. Bei km schätzt die App das Datum aus der bisherigen Fahrleistung.
- **Vorlagen:** TÜV/HU, Ölwechsel, Inspektion, Winterreifen, Sommerreifen, Versicherung vergleichen, Verbandskasten. Eigene Erinnerungen sind möglich, ebenso Wiederholung nach Monaten und/oder km.
- **Erledigt:** Datum und km-Stand eintragen, optional gleich die Kosten in der passenden Kategorie. Die nächste Erinnerung wird automatisch angelegt.
- **In den Kalender:** Kalendereintrag mit Hinweis 7 Tage vorher und am Tag selbst. So kommt eine echte Benachrichtigung auf das iPhone.
- Optional ein **Zähler am App-Symbol** für fällige Erinnerungen.

## Erlebnisse

Fotoalbum je Auto mit Titel, Datum, km-Stand und Notiz. Die Fotos werden vor dem Hochladen verkleinert. Ein Tipp auf ein Foto zeigt es im Vollbild.

## Einstellungen (Zahnrad)

- **Auto:** Stammdaten, Restwert und Verkauf. Nach dem Verkauf wird die Auswertung zum Verkaufsdatum eingefroren.
- **Planen:** Erinnerungen und wiederkehrende Kosten.
- **Kategorien:** frei anlegen, umbenennen, Symbol wählen, Art festlegen (fix, Nutzung oder Einnahme), als Tank-/Ladekategorie markieren, ausblenden oder löschen (nur wenn unbenutzt).
- **Gemeinsam nutzen**
  - Einladungscode **auf Knopfdruck**, **24 Stunden gültig, nur einmal verwendbar**, jederzeit zurückziehbar.
  - Liste, wer Zugriff hat.
- **Darstellung:** Farbwelten **Salbei** (Standard), **Klar** und **Graphit**. Salbei und Klar folgen dem Dunkelmodus des iPhones.
- **Daten:** Export als Tabelle (CSV, für Excel/Numbers) und komplette Sicherung (JSON).
- **Konto:** Meine Autos, Abmelden.

## Sicherheit & Daten

- Die Datenbank (Supabase, Serverstandort Frankfurt) prüft **jeden Zugriff**: Jeder sieht nur Autos, bei denen er Mitglied ist. Das gilt auch für Fotos und Belege.
- Einladungscodes lassen sich nur über geschützte Datenbankfunktionen erzeugen, einlösen und zurückziehen.
- Neue Registrierungen werden nach der Einrichtung in Supabase gesperrt.
- Eine automatische GitHub-Aufgabe hält das kostenlose Supabase-Projekt wach. Bei Problemen meldet sie die Ursache im Klartext.

## Technik

- Reine Web-App (PWA): HTML, CSS, JavaScript ohne Build-Schritt.
- Datenbank und Fotospeicher: Supabase im kostenlosen Tarif.
- Hosting: GitHub Pages.
- Symbole: Lucide (ISC-Lizenz).
- Kosten: 0 €.
