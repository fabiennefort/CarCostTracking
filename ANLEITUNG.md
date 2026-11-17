# Autokosten – Einrichtung (ca. 30 Minuten, einmalig, kostenlos)

Am bequemsten machst du das am Computer im Browser, also am alten Mac. Am iPhone geht es auch, ist aber fummeliger.
Du brauchst zwei kostenlose Konten: **Supabase** für die Datenbank und die Fotos, **GitHub** für die Webadresse der App.

---

## 1. Supabase-Projekt anlegen

1. Auf **supabase.com** → „Start your project“ → mit E-Mail registrieren. Eine Kreditkarte wird nicht verlangt.
2. **New project**:
   - Name: `autokosten`
   - Database Password: ein langes Passwort ausdenken und notieren. Die App braucht es nicht, aber du brauchst es, falls du später selbst an die Datenbank willst.
   - Region: **Central EU (Frankfurt)**
   - Plan: **Free**
3. Ein, zwei Minuten warten, bis das Projekt bereit ist.

## 2. Datenbank einrichten

1. Links im Menü **SQL Editor** → „New query“.
2. Den kompletten Inhalt der Datei **`schema.sql`** hineinkopieren → **Run**.
3. Unten sollte „Success. No rows returned“ stehen. Fertig: Damit sind alle Tabellen, Zugriffsregeln und der Foto-Speicher angelegt.

## 3. Anmeldung einstellen und Schlüssel holen

1. **Authentication → Sign In / Providers → Email**: **„Confirm email“ ausschalten** → Speichern.
   Dann könnt ihr euch direkt registrieren, ohne Bestätigungsmail.
2. **Project Settings → API Keys** (bzw. „API“): Notiere
   - die **Project URL**, z. B. `https://abcdefgh.supabase.co` (steht auch unter *Data API*)
   - den **anon / public**-Schlüssel (beginnt mit `eyJ…`) **oder** den **Publishable key** (beginnt mit `sb_publishable_…`). Beide funktionieren.
   - ⚠️ **Niemals** den `service_role`- bzw. `secret`-Schlüssel verwenden.
3. Die Datei **`config.js`** öffnen und die beiden Werte zwischen die Anführungszeichen eintragen:
   ```js
   export const SUPABASE_URL = 'https://abcdefgh.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJhbGciOi…';
   ```
   Der anon-Schlüssel darf öffentlich sein. Eure Daten schützen die Zugriffsregeln aus Schritt 2: Jeder sieht nur Autos, bei denen er Mitglied ist.

## 4. App ins Netz stellen (GitHub Pages)

1. Auf **github.com** registrieren.
2. Oben rechts **+ → New repository**
   - Name: `autokosten`
   - **Public** (GitHub Pages ist nur für öffentliche Repos kostenlos. Dort liegt nur der App-Code, eure Daten liegen bei Supabase.)
   - „Create repository“
3. Auf der leeren Repo-Seite: **„uploading an existing file“** → den **Inhalt** des entpackten Ordners `autokosten` hineinziehen (alle Dateien und den Ordner `icons`) → „Commit changes“.
4. **Die Wach-Halte-Automatik anlegen.** Den Ordner `.github` sieht man beim Hochladen oft nicht, weil er versteckt ist. Deshalb:
   **Add file → Create new file** → als Name `.github/workflows/keepalive.yml` eintippen (die Schrägstriche legen die Ordner an) → den Inhalt der Datei `keepalive.yml` hineinkopieren → „Commit changes“.
5. **Settings → Pages** → Source: „Deploy from a branch“ → Branch: `main`, Ordner `/ (root)` → Save.
   Nach ca. 1 Minute steht oben die Adresse, z. B. `https://deinname.github.io/autokosten/`
6. **Actions**-Reiter → falls gefragt, Workflows aktivieren → „Supabase wach halten“ → **Run workflow**. Ein grüner Haken heißt: Alles funktioniert.

## 5. Aufs iPhone holen

1. Die Adresse in **Safari** öffnen. Es muss Safari sein, nicht Chrome.
2. **Teilen-Symbol** (Quadrat mit Pfeil) → **„Zum Home-Bildschirm“** → Hinzufügen.
3. Die App **über das neue Icon** öffnen → **Registrieren** → **„Unser Auto anlegen“**.
   Ein Assistent führt dich in 5 kurzen Schritten durch die Einrichtung: das Auto, Versicherung und Steuer, Erinnerungen (TÜV, Ölwechsel, Reifen), zusätzliche Kategorien und das Teilen mit deiner Partnerin. Alles außer dem ersten Schritt kannst du überspringen und später nachholen.

   **Ihr habt das Auto schon länger?** Dann im ersten Schritt **„Haben wir schon länger“** antippen. Statt Kaufpreis und Kaufdatum gibst du den heutigen km-Stand und einen **geschätzten Wert des Autos** an, z. B. von mobile.de oder einer DAT-Bewertung. Dieser Schätzwert ist euer Ausgangswert: Ab hier rechnet die App Kosten, Verbrauch und Wertverlust, alles davor bleibt außen vor.

   Hinweis: Die App auf dem Home-Bildschirm hat ihren eigenen Speicher. Melde dich also direkt dort an, nicht vorher in Safari.

## 6. Partnerin dazuholen

1. Im letzten Schritt des Assistenten, oder später unter **⚙️ → Gemeinsam nutzen**, auf **„Einladungscode erzeugen“** tippen und den Code mit **„Code teilen“** verschicken.
   Der Code ist **24 Stunden gültig** und funktioniert **nur einmal**. Danach verfällt er automatisch. Erzeuge ihn also erst, wenn du ihn gleich verschickst. Mit **„Zurückziehen“** machst du ihn sofort ungültig.
2. Sie macht Schritt 5 auf ihrem iPhone, registriert sich und tippt auf **„Ich habe einen Einladungscode“**.
3. Ab dann seht und bearbeitet ihr beide dasselbe Auto. Unter ⚙️ → Gemeinsam nutzen steht, wer Zugriff hat.
   Falls der Code bei ihr als „ungültig“ abgelehnt wird, obwohl er noch keine 24 Stunden alt ist, hat ihn schon jemand anderes benutzt. Dann dort nachsehen, wer Zugriff hat.

## 7. Abschließen (wichtig)

Wenn ihr beide registriert seid: In Supabase unter **Authentication → Sign In / Providers** die Option **„Allow new users to sign up“ ausschalten**.
Damit kann niemand Fremdes mehr ein Konto anlegen.

---

## Gut zu wissen

- **Pausieren:** Kostenlose Supabase-Projekte schlafen nach 7 Tagen ohne Nutzung ein. Die Automatik aus Schritt 4 pingt montags und donnerstags. Falls die App trotzdem mal nicht lädt: bei Supabase einloggen und im Projekt auf **„Restore project“** klicken. Die Daten bleiben erhalten.
- **Sicherung:** Im kostenlosen Tarif macht Supabase keine Backups. Daher ab und zu unter **⚙️ → Daten → Komplette Sicherung** eine Datei speichern, z. B. in iCloud Drive.
- **Speicher:** Fotos werden vor dem Hochladen verkleinert, auf ca. 200–400 KB. In den kostenlosen Speicher von 1 GB passen damit mehrere tausend Bilder.
- **Updates der App:** Geänderte Dateien bei GitHub einfach erneut hochladen. Die App lädt die neue Version beim nächsten Öffnen. Wenn sich `schema.sql` geändert hat, diese im SQL-Editor einfach noch einmal komplett ausführen. Das ist gefahrlos, vorhandene Daten bleiben erhalten.
- **Aufbau der App:**
  - **Übersicht:** Kosten pro km, fällige Erinnerungen, die wichtigsten Kennzahlen.
  - **Kosten:** Auswertung, alle Einträge, laufende Kosten wie Versicherung und Steuer.
  - **Verbrauch:** Auswertung, Tankungen, km-Stände.
  - **Erlebnisse:** euer Fotoalbum.
  - **Zahnrad oben rechts:** Auto, Erinnerungen, Kategorien, Teilen, Sicherung, Meine Autos.
- **Einnahmen:** Über **+ → Einnahme** trägst du z. B. Spritgeld von Mitfahrern ein. Einnahmen senken die Kosten, den Verbrauch aber nicht. Eigene Einnahme-Arten (z. B. „Erstattung“) legst du unter ⚙️ → Kategorien mit der Art „Einnahme“ an.
- **Was zählt mit?** Unter **Kosten → Auswertung** schaltest du mit den Chips **Nutzung · Fixkosten · Wertverlust · Einnahmen** ein und aus, was ins Ergebnis einfließt. Die Übersicht rechnet mit derselben Auswahl. Die Auswahl gilt pro Gerät.
- **Mehrere Autos:** Oben auf den Namen des Autos tippen → **Meine Autos**. Dort wechselst du zwischen Autos, legst ein neues an, trittst per Code bei oder verlässt ein geteiltes Auto.
- **Erinnerungen:** Fällig nach Datum und/oder km. Bei km schätzt die App das Datum aus eurer Fahrleistung. Mit „✓ Erledigt“ trägst du gleich die Kosten ein, und die nächste Erinnerung wird automatisch angelegt.
  - **Benachrichtigung aufs Handy:** Erinnerung öffnen → **„In den Kalender“**. Der Termin landet im iPhone-Kalender, mit Hinweis eine Woche vorher und am Tag selbst.
  - **Zähler am App-Symbol:** Optional unter Erinnerungen einschalten. Dann zeigt das App-Symbol, wie viele Erinnerungen fällig sind.
- **Verbrauchsberechnung:** Liter aller Tankungen (außer der allerersten) ÷ gefahrene km zwischen erster und letzter Tankung. Ob voll- oder teilgetankt wurde, mittelt sich über die Zeit heraus. Die Anzeige „letzte 6 Monate“ rechnet genauso, nur mit den Tankungen dieses Zeitraums.
- **Kosten pro km:**
  - *Betriebskosten*: alles außer dem Kaufpreis.
  - *Gesamtkosten*: zusätzlich der Wertverlust (Kaufpreis minus geschätzter Restwert bzw. Verkaufspreis).
  - *Fixkosten* (Versicherung, Steuer, TÜV) und *Nutzungskosten* (Tanken, Reparaturen …) werden getrennt ausgewiesen. Welche Kategorie wohin gehört, kannst du unter **Auto → Kategorien** ändern. Einzelne Einträge lassen sich beim Erfassen umschalten.
- **Versicherung & Steuer:** Als „wiederkehrende Kosten“ einmal anlegen, die Zahlungen zählen dann automatisch mit. Ändert sich der Beitrag: Eintrag antippen → **„Betrag ändert sich ab …“**. Alte Zahlungen bleiben erhalten.
