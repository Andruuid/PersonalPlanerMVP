# Zusatzdokument zum Fachkonzept und technischen Umsetzungskonzept

Version: 1  
Datum: 30.04.2026  
Bezug: "Fachkonzept / Anforderungen" und "Technisches Umsetzungskonzept für Entwickler", Version 1

## Zweck dieses Zusatzdokuments

Dieses Dokument ergänzt das bestehende Fachkonzept und technische Umsetzungskonzept. Es benennt erkannte Inkonsistenzen, unklare Punkte und fachlich-technische Risiken und legt die empfohlene bzw. verbindliche Lösung fest.

Das Ziel ist, dass Entwickler die Spezifikation eindeutiger umsetzen können, ohne zentrale Fachlogik unterschiedlich interpretieren zu müssen.

## Verbindliche Grundentscheidungen

Folgende Entscheidungen gelten als Ergänzung zur bestehenden Spezifikation:

1. Die Zielgrösse der ersten Version ist auf 1 bis 30 Mitarbeitende pro Betrieb festzulegen.
2. Die Architektur muss trotzdem so gebaut werden, dass spätere grössere Mandanten möglich bleiben.
3. Geplante Dienstzeit gilt nach Wochenabschluss automatisch als Istzeit, sofern keine Abweichung oder Korrektur erfasst wurde.
4. Feiertage auf Arbeitstagen sind zeitsaldoneutral zu behandeln.
5. Überzeit über der HAZ wird nur ins UEZ-Konto gebucht und nicht zusätzlich ins Zeitsaldo.
6. Es gibt einen internen System- bzw. Superadmin zur Plattformverwaltung.
7. Echte End-to-End-Verschlüsselung wird nicht gefordert. Gefordert sind TLS, sichere Speicherung, Passwort-Hashing, 2FA und sauberes Schlüsselmanagement.
8. Soft-Delete und Archivierung gelten fix für mindestens 10 Jahre.
9. Alle vorgesehenen Zeitrechtsprüfungen gehören bereits in den MVP.
10. Eine E-Mail-Adresse darf mehreren Betrieben zugeordnet sein. Nach Login muss der Benutzer den gewünschten Betrieb auswählen.

## Priorisierte Klärungen und Korrekturen

### P0 - Kritisch vor Entwicklungsstart

#### 1. Feiertagslogik erzeugt aktuell rechnerisch ein falsches Plus

**Problem**  
Im Fachkonzept steht sinngemäss:

- Feiertag hat immer Soll = 0.
- Wenn der Feiertag auf einen geplanten Arbeitstag fällt, gilt zusätzlich eine anrechenbare Abwesenheit in Höhe der persönlichen Tagessollzeit.
- Gleichzeitig lautet die Zeitsaldo-Formel: Istzeit + anrechenbare Abwesenheiten - Sollzeit.

Wenn Soll = 0 und gleichzeitig eine Gutschrift in Höhe der Tagessollzeit erfolgt, entsteht ein positives Zeitsaldo, obwohl der Mitarbeitende an einem Feiertag nicht gearbeitet hat. Das ist fachlich wahrscheinlich falsch.

**Verbindliche Lösung**  
Feiertage auf regulären Arbeitstagen müssen zeitsaldoneutral sein.

**Umsetzungsvorgabe**  
Ein Feiertag auf einem regulären Arbeitstag erfüllt die persönliche Tagessollzeit, erzeugt aber kein Plus im Zeitsaldo.

Empfohlene Rechenlogik:

```text
Wenn Feiertag auf persönlichem Arbeitstag:
  Sollzeit_effektiv = Tagessollzeit
  anrechenbare Abwesenheit = Tagessollzeit
  Zeitsaldo-Wirkung = 0

Wenn Feiertag auf freiem Tag:
  Sollzeit_effektiv = 0
  anrechenbare Abwesenheit = 0
  Zeitsaldo-Wirkung = 0
```

Alternativ kann intern weiterhin mit `Soll = 0` gearbeitet werden, dann darf aber keine zusätzliche Zeitsaldo-Gutschrift entstehen. Für die Nachvollziehbarkeit ist die oben genannte Variante mit erfüllter Sollzeit klarer.

**Entwicklerhinweis**  
Feiertag sollte als eigener Tagesstatus mit neutraler Kontowirkung modelliert werden, nicht als normale frei buchbare Abwesenheit.

#### 2. UEZ / Überzeit widerspricht der allgemeinen Zeitsaldo-Formel

**Problem**  
Das Fachkonzept sagt:

- Zeitsaldo = Istzeit + anrechenbare Abwesenheiten - Sollzeit.
- UEZ ist Arbeitszeit über HAZ.
- UEZ wird direkt aufs UEZ-Konto gebucht.
- UEZ wird nicht zusätzlich aufs Zeitsaldo gebucht.

Wenn die gesamte Istzeit ungefiltert in die Zeitsaldo-Formel einfliesst, würde UEZ trotzdem auch im Zeitsaldo landen.

**Verbindliche Lösung**  
Arbeitszeit über der HAZ wird nur ins UEZ-Konto gebucht und nicht zusätzlich ins Zeitsaldo.

**Umsetzungsvorgabe**  
Für die Zeitsaldo-Berechnung wird die anrechenbare Istzeit bei der HAZ gekappt.

Empfohlene Wochenlogik:

```text
wochen_istzeit_total = Summe effektive Arbeitszeit der Woche
wochen_sollzeit = persönliche Sollzeit der Woche
haz = 45h oder 50h gemäss Mitarbeitergruppe oder individueller Einstellung

zeitsaldo_relevante_istzeit = min(wochen_istzeit_total, haz)
uez_minuten = max(0, wochen_istzeit_total - haz)

zeitsaldo_delta =
  zeitsaldo_relevante_istzeit
  + anrechenbare_abwesenheiten
  - wochen_sollzeit

uez_delta = uez_minuten
```

**Entwicklerhinweis**  
UEZ darf nicht doppelt kompensiert werden. Wenn UEZ später bezogen oder ausbezahlt wird, reduziert dies ausschliesslich das UEZ-Konto.

#### 3. Istzeit-Erfassung war nicht eindeutig geregelt

**Problem**  
Das Konzept enthält Planzeiten, Dienstzeiten und effektive Arbeitszeit. Es war aber nicht eindeutig definiert, ob Mitarbeitende ihre Istzeit erfassen müssen oder ob geplante Dienstzeit automatisch als geleistete Zeit gilt.

**Verbindliche Lösung**  
Geplante Dienstzeit gilt nach Wochenabschluss automatisch als Istzeit, sofern keine Abweichung erfasst wurde.

**Umsetzungsvorgabe**  
Das System arbeitet mit folgender Hierarchie:

```text
1. Erfasste effektive Arbeitszeit / Korrektur
2. Sonst geplante Dienstzeit
3. Sonst 0 Minuten
```

Beispiel:

- Mitarbeitender ist für 08:00 bis 17:00 mit 60 Minuten Pause geplant.
- Nettoarbeitszeit = 8 Stunden.
- Wenn keine Abweichung erfasst wird, werden beim Abschluss 8 Stunden Istzeit gebucht.
- Wenn Admin eine Korrektur auf 7 Stunden 30 Minuten erfasst, gilt die Korrektur.

**Entwicklerhinweis**  
Korrekturen müssen auditierbar sein. Die ursprüngliche Planzeit und die korrigierte Istzeit müssen historisch nachvollziehbar bleiben.

#### 4. Sicherheitsanforderung "End-to-End-Verschlüsselung" passt nicht zur Backend-First-Logik

**Problem**  
Das technische Konzept fordert Backend-First, serverseitige Berechnung, zentrale Datenhaltung und gleichzeitig End-to-End-Verschlüsselung. Echte E2E-Verschlüsselung würde bedeuten, dass das Backend viele Daten nicht lesen kann. Das widerspricht der geforderten serverseitigen Zeit- und Kontenberechnung.

**Verbindliche Lösung**  
Keine echte End-to-End-Verschlüsselung fordern. Stattdessen werden konkrete Sicherheitsmassnahmen verlangt.

**Umsetzungsvorgabe**  
Erforderlich sind mindestens:

- TLS für sämtliche Verbindungen.
- Verschlüsselung sensibler Daten bei Speicherung, soweit technisch und betrieblich sinnvoll.
- Sichere Passwort-Hashes, z. B. Argon2id oder bcrypt mit angemessenen Parametern.
- 2-Faktor-Authentifizierung.
- Sichere Session-Verwaltung.
- Serverseitige Rechteprüfung bei jeder relevanten Aktion.
- Mandantentrennung im Backend und in der Datenbank.
- Schutz gegen OWASP-Top-10-Risiken.
- Sichere Verwaltung von Secrets und Schlüsseln.
- Audit-Logs für sicherheits- und fachrelevante Vorgänge.

**Entwicklerhinweis**  
Die Formulierung "256-bit Verschlüsselung" soll nicht als pauschale Architekturvorgabe verstanden werden. Entscheidend ist ein stimmiges Sicherheitskonzept mit geeigneten Algorithmen und Schlüsselverwaltung.

### P1 - Hoch, vor technischer Detailkonzeption klären

#### 5. Zielgrösse der ersten Version vereinheitlichen

**Problem**  
Im Dokument kommen unterschiedliche Zielgrössen vor:

- 2 bis 15 Mitarbeitende.
- 1 bis 30 Mitarbeitende.

Das beeinflusst Datenmodell, UX, Tests, Performanceannahmen und Preis-/Mandantenlogik.

**Verbindliche Lösung**  
Die erste Version ist für 1 bis 30 Mitarbeitende pro Betrieb auszulegen.

**Umsetzungsvorgabe**  
Die Architektur darf nicht hart auf 30 Mitarbeitende begrenzt werden. 1 bis 30 ist die Zielgrösse für MVP und Testabnahme, nicht die technische Maximalgrenze.

#### 6. Wochenstatus einheitlich definieren

**Problem**  
Im Fachkonzept werden teilweise nur die Status "offen" und "abgeschlossen" genannt. Im technischen Konzept werden zusätzlich "Entwurf" und "veröffentlicht" verwendet. Für Veröffentlichung, Mitarbeitersicht und Sperrlogik ist ein eindeutiges Statusmodell nötig.

**Verbindliche Lösung**  
Die Woche erhält mindestens folgende Status:

```text
ENTWURF
VEROEFFENTLICHT
ABGESCHLOSSEN
WIEDER_GEOEFFNET
```

**Umsetzungsvorgabe**

- `ENTWURF`: Admin kann planen. Mitarbeitende sehen diese Fassung nicht.
- `VEROEFFENTLICHT`: Mitarbeitende sehen die veröffentlichte Version.
- `ABGESCHLOSSEN`: Woche ist fachlich gesperrt. Planzeit wird, sofern nicht korrigiert, als Istzeit übernommen. Zeitkonten werden final gebucht.
- `WIEDER_GEOEFFNET`: Sonderstatus für kontrollierte rückwirkende Bearbeitung durch Admin.

Wenn eine veröffentlichte Woche zurück in den Entwurf gesetzt wird, muss die zuletzt veröffentlichte Mitarbeitersicht weiter sichtbar bleiben.

**Entwicklerhinweis**  
Technisch sollte zwischen Arbeitsentwurf und veröffentlichter Version unterschieden werden. Eine veröffentlichte Version darf nicht überschrieben werden, solange sie für Mitarbeitende sichtbar bleiben muss.

#### 7. Rückwirkende Änderungen und abgeschlossene Wochen präzisieren

**Problem**  
Das Konzept sagt einerseits, abgeschlossene Wochen seien gesperrt, andererseits seien Änderungen durch Admin möglich. Ohne klaren Prozess besteht das Risiko, dass abgeschlossene Daten normal überschrieben werden.

**Verbindliche Lösung**  
Abgeschlossene Wochen dürfen nicht normal editiert werden. Änderungen erfolgen nur über definierte Sonderprozesse.

**Umsetzungsvorgabe**  
Zulässige Prozesse:

1. **Korrekturbuchung**  
   Für reine Konto- oder Zeitkorrekturen ohne Änderung des ursprünglichen Plans.

2. **Wiederöffnung durch Admin**  
   Für fachlich notwendige Plan- oder Abwesenheitskorrekturen. Die Wiederöffnung muss protokolliert werden.

3. **Erneuter Abschluss**  
   Nach Wiederöffnung muss die Woche erneut abgeschlossen werden. Differenzen zur vorherigen Abschlussversion müssen nachvollziehbar bleiben.

**Entwicklerhinweis**  
Keine stille Überschreibung abgeschlossener Planungs- oder Buchungsdaten.

#### 8. Benutzer mit gleicher E-Mail in mehreren Betrieben

**Problem**  
Die E-Mail-Adresse dient als Login. Es ist aber möglich, dass dieselbe Person mehreren Betrieben zugeordnet ist.

**Verbindliche Lösung**  
Ein Benutzerkonto kann mehreren Mandanten/Betrieben zugeordnet sein. Das Mitarbeitendenprofil bleibt mandantenspezifisch.

**Umsetzungsvorgabe**  
Login-Ablauf:

```text
1. Benutzer meldet sich mit E-Mail und Passwort an.
2. Falls 2FA aktiv ist, erfolgt die 2FA-Prüfung.
3. System ermittelt alle Betriebe, denen der Benutzer zugeordnet ist.
4. Wenn genau ein Betrieb vorhanden ist:
   Benutzer wird direkt in diesen Betrieb geführt.
5. Wenn mehrere Betriebe vorhanden sind:
   Benutzer sieht ein Dropdown / Auswahlfenster mit allen zugeordneten Betrieben.
6. Nach Auswahl wird die Session auf diesen Betriebskontext gesetzt.
7. Alle weiteren Abfragen und Aktionen laufen strikt innerhalb dieses Mandantenkontexts.
```

**Entwicklerhinweis**  
Der aktive Mandant muss serverseitig in der Session bzw. im Token-Kontext abgesichert werden. Der Client darf den Mandantenkontext nicht frei manipulieren können.

#### 9. System- bzw. Superadmin ergänzen

**Problem**  
Das Rollenmodell enthält nur Admin und Mitarbeitender. Es ist nicht geregelt, wer neue Betriebe anlegt, Mandanten verwaltet oder bei Supportfällen eingreifen darf.

**Verbindliche Lösung**  
Es wird eine interne Plattformrolle `SYSTEM_ADMIN` ergänzt.

**Umsetzungsvorgabe**

- `SYSTEM_ADMIN` ist keine normale Kundenrolle.
- `SYSTEM_ADMIN` darf Betriebe anlegen, deaktivieren und technische Mandantenverwaltung ausführen.
- Zugriff auf personenbezogene Betriebsdaten ist auf das notwendige Minimum zu beschränken.
- Jeder Zugriff und jede Änderung durch `SYSTEM_ADMIN` muss auditierbar sein.

**Entwicklerhinweis**  
Kunden-Admins dürfen nur innerhalb ihres eigenen Betriebs handeln. Sie dürfen keine Mandanten anlegen oder fremde Betriebe sehen.

#### 10. Archivierung und Datenschutz konkretisieren

**Problem**  
Das Konzept fordert Datensparsamkeit, gleichzeitig aber Soft-Delete und mindestens 10 Jahre Archivierung. Das ist grundsätzlich möglich, muss aber sauber geregelt werden.

**Verbindliche Lösung**  
Soft-Delete und Archivierung für mindestens 10 Jahre sind verbindlich.

**Umsetzungsvorgabe**

- Betriebe, Mitarbeitende, Einsatzpläne, Zeitkonten, Buchungen und Audit-Logs werden bei Löschung nicht physisch gelöscht, sondern archiviert.
- Archivierte Daten dürfen im normalen Betrieb nicht mehr aktiv erscheinen.
- Zugriff auf Archivdaten ist nur für berechtigte Rollen und definierte Zwecke möglich.
- Archivzugriffe müssen protokolliert werden.
- Nach Ablauf der Aufbewahrungsfrist muss ein Lösch- oder Anonymisierungsprozess vorgesehen werden.
- Die Rechtsgrundlage für die 10-jährige Aufbewahrung ist im Datenschutzkonzept zu dokumentieren.

**Entwicklerhinweis**  
Soft-Delete sollte nicht nur ein einzelnes Boolean-Feld sein. Es braucht mindestens Löschstatus, Löschzeitpunkt, auslösenden Benutzer und Archiv-/Sichtbarkeitsregeln.

### P2 - Mittel, für saubere Umsetzung notwendig

#### 11. TZT-Regel einheitlich formulieren

**Problem**  
An einer Stelle steht pauschal "TZT zieht vom TZT-Konto". Später wird korrekt unterschieden:

- TZT im Tagesmodell hat ein echtes Konto.
- TZT als Reduktion hat kein echtes Konto.

**Verbindliche Lösung**  
TZT muss je nach Modell unterschiedlich behandelt werden.

**Umsetzungsvorgabe**

```text
TZT Tagesmodell:
  echtes Konto
  Bezug reduziert TZT-Konto
  nur verfügbare Kontingente können bezogen werden

TZT Reduktionsmodell:
  kein echtes Konto
  Sollzeit/Jahresarbeitszeit ist bereits reduziert
  TZT ist nur rechnerischer Ausweis
```

#### 12. Frei verlangt rechnerisch präzisieren

**Problem**  
"Frei verlangt" ist als anrechenbare Abwesenheit zulasten Zeitsaldo beschrieben. Ohne genaue Buchungslogik kann es zu Doppelzählungen kommen.

**Verbindliche Lösung**  
Frei verlangt erfüllt den Tag fachlich, reduziert aber das Zeitsaldo in gleicher Höhe.

**Umsetzungsvorgabe**

```text
Frei verlangt:
  anrechenbare Abwesenheit = bezogene Minuten
  Zeitsaldo-Abzug = bezogene Minuten
  Netto-Wirkung auf Tageserfüllung = erfüllt
  Netto-Wirkung auf Zeitsaldo = negativer Bezug
```

Beispiel:

- Tagessoll: 8 Stunden.
- Mitarbeitender nimmt 8 Stunden Frei verlangt.
- Tag gilt als erfüllt.
- Zeitsaldo reduziert sich um 8 Stunden.

#### 13. Sonn- und Feiertagskompensation präzisieren

**Problem**  
Bei Sonn- oder Feiertagsarbeit bis 5 Stunden gehen gearbeitete Stunden aufs Zeitsaldo und zusätzlich auf ein Kompensationskonto. Beim späteren Bezug ist nicht vollständig definiert, wie dieser Bezug auf Zeitsaldo und Sollzeit wirkt.

**Empfohlene Lösung**  
Das Kompensationskonto ist ein Anspruch auf bezahlte bzw. anrechenbare Freizeit. Beim Bezug wird das Kompensationskonto reduziert und der Bezug erfüllt die entsprechende Sollzeit.

**Umsetzungsvorgabe**

```text
Entstehung:
  gearbeitete Zeit erhöht Zeitsaldo gemäss Arbeitszeitlogik
  gleicher Umfang erhöht Sonn-/Feiertagskompensationsanspruch

Bezug:
  Bezug reduziert Kompensationskonto
  Bezug gilt als anrechenbare Abwesenheit
  Bezug darf nicht zusätzlich ein zweites Mal Zeitsaldo-Guthaben erzeugen
```

#### 14. Wochenend- und VFT-Logik klarer trennen

**Problem**  
Das Konzept sagt: Wenn Samstag oder Sonntag Arbeit geplant wird, bekommt der Tag die normale persönliche Tagessollzeit. Das kann dazu führen, dass zusätzliche Wochenendarbeit nicht als Mehrarbeit erscheint, weil gleichzeitig das Soll erhöht wird.

**Empfohlene Lösung**  
Es muss zwischen regulär verschobenem Arbeitstag und zusätzlicher Wochenendarbeit unterschieden werden.

**Umsetzungsvorgabe**

```text
Regulär verschobener Arbeitstag / VFT:
  Arbeitstag wird auf Samstag/Sonntag verschoben
  anderer Tag wird VFT mit Soll 0
  Wochensoll bleibt insgesamt neutral

Zusätzliche Wochenendarbeit:
  Samstag/Sonntag bleibt grundsätzlich Soll 0
  gearbeitete Zeit zählt als Istzeit
  es können Zeitsaldo, Sonn-/Feiertagskompensation oder ERT entstehen
```

**Entwicklerhinweis**  
Ein Planungseintrag am Wochenende braucht ein Feld oder eine Klassifikation, ob es sich um regulär verschobene Arbeit oder zusätzliche Arbeit handelt.

#### 15. Ruhezeitprüfungen konkretisieren

**Problem**  
Die Ruhezeitprüfungen sind als Pflichtprüfungen genannt, aber nicht detailliert beschrieben.

**Verbindliche Lösung**  
Alle vorgesehenen Prüfungen gehören bereits in den MVP.

**Umsetzungsvorgabe**  
Zu implementieren sind mindestens:

- tägliche Ruhezeit.
- wöchentliche Ruhezeit.
- maximal 6 Arbeitstage in Folge.
- ERT-Fristen.
- Fristen für Sonn- und Feiertagskompensation.
- freier Halbtag, wenn Arbeit auf mehr als 5 Tage verteilt wird.

Offen zu definieren sind im technischen Detailkonzept:

- konkrete Grenzwerte und Fristen je Regel.
- Umgang mit Schichten über Mitternacht.
- Umgang mit Pausen.
- Warnung oder Blockade bei Regelverletzung.
- Darstellung für Admins.
- Protokollierung von bewusst übersteuerten Warnungen, falls Übersteuerung erlaubt wird.

#### 16. Feiertagsregionen genauer modellieren

**Problem**  
Das technische Konzept erwähnt "Evangelisch/Katholisch + 1. August". Das ist für Schweizer Feiertagslogik wahrscheinlich zu eng, da Feiertage kantonal und teilweise regional/kommunal variieren können.

**Empfohlene Lösung**  
Feiertage werden über eine mandantenspezifische Standort-/Feiertagsregion geführt.

**Umsetzungsvorgabe**

- Jeder Mitarbeitende hat eine Standort- bzw. Feiertagsregion.
- Ein Betrieb kann mehrere Standorte/Feiertagsregionen haben.
- Feiertage können zentral vorgeschlagen, aber mandantenspezifisch gepflegt/überschrieben werden.
- Der 1. August ist als nationaler Feiertag zu berücksichtigen.
- Konfessionelle oder regionale Feiertage müssen je Standort aktivierbar sein.

#### 17. MVP-Umfang bewusst als produktionsnah definieren

**Problem**  
Der MVP ist umfangreich. Er enthält bereits Mandantenfähigkeit, Audit-Logs, Zeitkonten, Feiertagslogik, Jahreswechsel, Ruhezeitprüfungen, 2FA und Archivierung.

**Verbindliche Lösung**  
Der MVP soll diese Punkte enthalten. Er ist damit als produktionsnaher MVP zu verstehen, nicht als einfacher Prototyp.

**Umsetzungsvorgabe**  
Entwickler sollen den MVP nicht als Wegwerfversion bauen. Architektur, Datenmodell, Audit, Rechteprüfung und Zeitlogik müssen von Anfang an belastbar sein.

### P3 - Ergänzungen und Qualitätsanforderungen

#### 18. Browser-Support konkretisieren

**Problem**  
Es werden Edge, Chrome, Firefox und Safari genannt, aber keine Versionen.

**Empfohlene Lösung**  
Unterstützt werden aktuelle stabile Versionen der genannten Browser sowie Mobile Safari und Chrome auf Android.

**Umsetzungsvorgabe**

- Desktop: aktuelle stabile Versionen von Edge, Chrome, Firefox, Safari.
- Mobile: aktuelle Versionen von Safari iOS und Chrome Android.
- Keine Unterstützung für veraltete Browser ohne moderne Webstandards.

#### 19. "Codierung ohne KI" präzisieren

**Problem**  
Die Aussage "Die gesamte Codierung ist ohne Künstliche Intelligenz zu programmieren" ist schwer prüfbar.

**Empfohlene Lösung**  
Stattdessen sollte verlangt werden, dass keine KI-Abhängigkeit im Produktivbetrieb besteht und der Code vollständig nachvollziehbar, reviewbar und testbar ist.

**Umsetzungsvorgabe**

- Die Anwendung darf im Produktivbetrieb nicht von KI-Diensten abhängig sein, sofern dies nicht später ausdrücklich beauftragt wird.
- Der Quellcode muss versioniert, reviewbar, testbar und wartbar sein.
- Automatisch generierter Code darf nur verwendet werden, wenn er geprüft, verstanden und qualitätsgesichert ist.

#### 20. Offene technische Festlegungen ergänzen

**Problem**  
Technologie-Stack, Hosting, Datenbankstruktur, Backup/Restore und Performance-Ziele sind bewusst offen. Diese Punkte müssen vor oder während der technischen Detailkonzeption entschieden werden.

**Empfohlene Lösung**  
Vor Entwicklungsstart sollte ein kurzes technisches Architekturpapier erstellt werden.

**Mindestinhalt**

- Frontend-Technologie.
- Backend-Technologie.
- Datenbank.
- Authentifizierungsansatz.
- Hosting-Region.
- Backup- und Restore-Konzept.
- Mandantentrennung auf Datenbankebene.
- CI/CD-Pipeline.
- Teststrategie.
- Monitoring und Logging.
- Performance-Zielwerte für typische Betriebe mit 1 bis 30 Mitarbeitenden.

## Empfohlenes fachliches Zielmodell für Zeitberechnung

### Tagesebene

Auf Tagesebene werden erfasst bzw. abgeleitet:

- geplanter Dienst.
- geplante Nettoarbeitszeit.
- effektive Istzeit, falls abweichend erfasst.
- Abwesenheitstyp.
- Feiertag.
- Wochenende.
- VFT.
- ERT-relevante Sachverhalte.
- persönliche Tagessollzeit.

### Wochenebene

Auf Wochenebene werden berechnet:

- Zeitsaldo-Delta.
- UES-Ausweis.
- UEZ-Delta.
- Sonn-/Feiertagskompensation.
- ERT-Fälle.
- Ruhezeitverletzungen.

### Jahresebene

Auf Jahresebene werden echte Konten geführt:

- Zeitsaldo.
- UEZ.
- Ferien.
- Eltern- und Betreuungsurlaub.
- TZT nur im Tagesmodell.
- Sonn-/Feiertagskompensation, sofern als fristgebundener Anspruch geführt.

## Empfohlenes Statusmodell

### Woche

```text
ENTWURF
VEROEFFENTLICHT
ABGESCHLOSSEN
WIEDER_GEOEFFNET
```

### Antrag / Wunsch

```text
OFFEN
GENEHMIGT
ABGELEHNT
ZURUECKGEZOGEN
```

Der Status `ZURUECKGEZOGEN` ist als Ergänzung sinnvoll, falls Mitarbeitende eigene Anträge vor Bearbeitung zurücknehmen dürfen.

### Mitarbeitender im Mandanten

```text
AKTIV
INAKTIV
AUSGETRETEN
ARCHIVIERT
```

### Benutzerkonto

```text
EINGELADEN
AKTIV
GESPERRT
DEAKTIVIERT
```

## Empfohlenes Rollenmodell

### SYSTEM_ADMIN

Interne Plattformrolle zur Verwaltung von Betrieben, Mandanten und technischen Supportprozessen.

### ADMIN

Kundenrolle innerhalb eines Betriebs. Darf Mitarbeitende, Dienste, Wochenplanung, Anträge, Zeitkonten, Feiertage und Regeln innerhalb des eigenen Mandanten verwalten.

### MITARBEITENDER

Kundenrolle innerhalb eines Betriebs. Darf eigene veröffentlichte Planung, eigene Konten und eigene Anträge/Wünsche sehen bzw. erfassen.

## Akzeptanzkriterien für Entwickler

Die Umsetzung gilt nur dann als fachlich konsistent, wenn mindestens folgende Punkte erfüllt sind:

1. Feiertage auf Arbeitstagen erzeugen kein positives Zeitsaldo.
2. UEZ über HAZ wird nicht doppelt in UEZ und Zeitsaldo gebucht.
3. Planzeit wird nach Abschluss automatisch als Istzeit übernommen, sofern keine Korrektur vorhanden ist.
4. Abgeschlossene Wochen können nicht normal überschrieben werden.
5. Veröffentlichte Mitarbeitersichten bleiben sichtbar, auch wenn Admins neue Entwürfe bearbeiten.
6. Jeder Zugriff ist mandantenspezifisch abgesichert.
7. Benutzer mit mehreren Betrieben erhalten nach Login eine Betriebsauswahl.
8. System-Admins sind von Kunden-Admins getrennt.
9. Manuelle Buchungen, Korrekturen, Wiederöffnungen und Archivzugriffe werden auditierbar protokolliert.
10. Soft-Delete und Archivierung über mindestens 10 Jahre sind technisch vorgesehen.
11. Alle Zeitrechtsprüfungen aus dem Konzept sind im MVP enthalten.
12. Sicherheitsanforderungen werden konkret über TLS, 2FA, sichere Speicherung, Passwort-Hashing, Rechteprüfung und Schlüsselmanagement umgesetzt.

## Zusammenfassung für die Übergabe an Entwickler

Das bestehende Fachkonzept ist grundsätzlich tragfähig, benötigt aber die in diesem Zusatzdokument beschriebenen Präzisierungen. Besonders wichtig sind die Korrekturen an Feiertagslogik, UEZ-/Zeitsaldo-Abgrenzung, Istzeit-Ermittlung, Wochenstatus, Mandanten-Login und Sicherheitsanforderungen.

Dieses Zusatzdokument ist zusammen mit der ursprünglichen Spezifikation zu verwenden. Bei Widersprüchen zwischen Ursprungsspezifikation und diesem Zusatzdokument sollen die hier festgelegten Präzisierungen gelten.
