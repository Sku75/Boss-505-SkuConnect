// Beschreibung aller Felder der Station: Klartextname, Art und Wertebereich.
//
// Grundsatz: Nur Felder, die hier beschrieben sind, lassen sich ändern.
// Alles andere wird angezeigt, aber nicht geschrieben. So kann Sku505 nie
// einen Wert in ein Feld schreiben, dessen erlaubten Bereich wir nicht kennen.
//
// Art:
//   liste       Auswahl aus festen Texten, der Zahlenwert ist die Position
//   zahl        Zahl von min bis max
//   tempo       Tempo, in der Datei mit zehn malgenommen (1086 heißt 108,6)
//   looplaenge  0 heißt AUTO, sonst die Anzahl Takte
//   text        Freitext

const AUS_AN = ["Aus", "An"];

const FELDER = {
  // --- Speicherplatz gesamt ---
  "MASTER.Lvl":   { text: "Speicher-Pegel", art: "zahl", min: 0, max: 100 },
  "MASTER.Tmp":   { text: "Tempo", art: "tempo" },
  "MASTER.Cs":    { text: "Kompressor", art: "zahl", min: 0, max: 100 },
  "MASTER.Rv":    { text: "Hall", art: "zahl", min: 0, max: 100 },

  "REC_OPTION.DubMod":  { text: "Overdub-Art", art: "liste", werte: ["Overdub", "Ersetzen"] },
  "REC_OPTION.RecAct":  { text: "Tastenfolge", art: "liste", werte: ["Aufnahme, Overdub, Wiedergabe", "Aufnahme, Wiedergabe, Overdub"] },
  "REC_OPTION.RecQtz":  { text: "Aufnahme im Takt fangen", art: "liste", werte: AUS_AN },

  "PLAY_OPTION.LpLen":        { text: "Loop-Länge", art: "looplaenge" },
  "PLAY_OPTION.SinglePlyChg": { text: "Umschalten bei Einzelspur", art: "liste", werte: ["Sofort", "Am Schleifenende"] },
  "PLAY_OPTION.TgtTr":        { text: "Zielspur", art: "zahl", min: 0, max: 5 },

  // --- Je Spur, gilt für Spur 1 bis 5 ---
  "TRACK.Rev":     { text: "Rückwärts", art: "liste", werte: AUS_AN },
  "TRACK.PlyLvl":  { text: "Wiedergabepegel", art: "zahl", min: 0, max: 100 },
  "TRACK.Pan":     { text: "Panorama", art: "zahl", min: 0, max: 100 },
  "TRACK.One":     { text: "One-Shot", art: "liste", werte: AUS_AN },
  "TRACK.TrkFx":   { text: "Track FX anwenden", art: "liste", werte: AUS_AN },
  "TRACK.PlyMod":  { text: "Abspielart", art: "liste", werte: ["Mehrspurig", "Einzelspur"] },
  "TRACK.LpSync":  { text: "Loop Sync", art: "liste", werte: AUS_AN },
  "TRACK.TmpSync": { text: "Tempo Sync", art: "liste", werte: AUS_AN },
  "TRACK.WavStat": { text: "Aufnahme vorhanden", art: "liste", werte: ["Nein", "Ja"], nurLesen: true },
  "TRACK.RecTmp":  { text: "Aufnahmetempo", art: "tempo", nurLesen: true },
  "TRACK.WavLen":  { text: "Aufnahmelänge", art: "zahl", nurLesen: true },

  // --- Rhythmus ---
  "RHYTHM.Sw":      { text: "Rhythmus", art: "liste", werte: AUS_AN },
  "RHYTHM.Lvl":     { text: "Rhythmus-Pegel", art: "zahl", min: 0, max: 100 },
  "RHYTHM.Ptn":     { text: "Muster", art: "zahl", min: 0, max: 84 },
  "RHYTHM.LineOut": { text: "Nur auf Kopfhörer", art: "liste", werte: AUS_AN },
  "RHYTHM.RecCnt":  { text: "Einzähler vor Aufnahme", art: "liste", werte: AUS_AN },
  "RHYTHM.PlyCnt":  { text: "Einzähler vor Wiedergabe", art: "liste", werte: AUS_AN },

  // --- Effekt-Bänke Input FX und Track FX ---
  "FXBANK.Sw":   { text: "Effekte", art: "liste", werte: AUS_AN },
  "FXBANK.Sel":  { text: "Gewählte Taste", art: "liste", werte: ["A", "B", "C"] },
  "FXBANK.Typ1": { text: "Effekt auf Taste A, Typnummer", art: "zahl", min: 0, max: 27 },
  "FXBANK.Typ2": { text: "Effekt auf Taste B, Typnummer", art: "zahl", min: 0, max: 27 },
  "FXBANK.Typ3": { text: "Effekt auf Taste C, Typnummer", art: "zahl", min: 0, max: 27 },
  "FXBANK.MltSw":   { text: "Effekte im Multi-Betrieb", art: "liste", werte: AUS_AN },
  "FXBANK.MltTyp1": { text: "Multi, Taste A, Typnummer", art: "zahl", min: 0, max: 27 },
  "FXBANK.MltTyp2": { text: "Multi, Taste B, Typnummer", art: "zahl", min: 0, max: 27 },
  "FXBANK.MltTyp3": { text: "Multi, Taste C, Typnummer", art: "zahl", min: 0, max: 27 },

  // --- Assigns ---
  "ASSIGN.Sw":     { text: "Zuweisung", art: "liste", werte: AUS_AN },
  "ASSIGN.TgtMin": { text: "Kleinster Wert", art: "zahl", min: 0, max: 100 },
  "ASSIGN.TgtMax": { text: "Größter Wert", art: "zahl", min: 0, max: 100 },

  // --- Systemeinstellungen der Station ---
  "SETUP.LcdContrast": { text: "Display-Helligkeit", art: "zahl", min: 1, max: 16 },
  "SETUP.PhantomPwr":  { text: "Phantomspeisung", art: "liste", werte: AUS_AN },
  "SETUP.AutoOff":     { text: "Automatisch ausschalten", art: "liste", werte: AUS_AN },
  "INPUT_OUTPUT.LineOutLvl": { text: "Ausgangspegel Line Out", art: "zahl", min: 0, max: 100 }
};

// Lesbare Namen für Felder, die wir anzeigen, aber nicht ändern.
const NUR_ANZEIGE = {
  "MASTER.PhOut": "Kopfhörer-Ausgang",
  "MASTER.PhOutTr": "Kopfhörer-Spuren, Bitmuster",
  "PLAY_OPTION.LpQtz": "Loop Quantize, Rohwert",
  "PLAY_OPTION.LpMod": "Loop-Modus, Rohwert",
  "PLAY_OPTION.AllStrt": "Alle starten, Bitmuster",
  "PLAY_OPTION.AllStp": "Alle stoppen, Bitmuster",
  "PLAY_OPTION.FadeTim": "Ein- und Ausblendzeit, Rohwert",
  "TRACK.StrtMod": "Startart, Rohwert",
  "TRACK.StpMod": "Stoppart, Rohwert",
  "TRACK.MeasMod": "Takt-Modus, Rohwert",
  "TRACK.MeasLen": "Taktzahl",
  "TRACK.MeasBtLp": "Takt-Schleife, Rohwert",
  "RHYTHM.Bt": "Taktart, Rohwert",
  "RHYTHM.Stp": "Stopp-Verhalten, Rohwert",
  "FXBANK.Mod": "Betriebsart, Rohwert",
  "FXBANK.MltMod": "Multi-Betriebsart, Rohwert",
  "ASSIGN.Src": "Quelle, Rohwert",
  "ASSIGN.SrcMod": "Quellart, Rohwert",
  "ASSIGN.Tgt": "Ziel, Rohwert"
};

// Liefert die Beschreibung eines Feldes. Abschnitte mit Nummer werden auf
// ihre Grundform zurückgeführt, TRACK3 wird also zu TRACK.
function grundform(abschnitt) {
  if (/^TRACK[1-5]$/.test(abschnitt)) return "TRACK";
  if (/^ASSIGN\d+$/.test(abschnitt)) return "ASSIGN";
  if (abschnitt === "INPUT_FX" || abschnitt === "TRACK_FX") return "FXBANK";
  return abschnitt;
}

function feldBeschreibung(abschnitt, feld) {
  const schluessel = grundform(abschnitt) + "." + feld;
  if (FELDER[schluessel]) return FELDER[schluessel];
  if (NUR_ANZEIGE[schluessel]) return { text: NUR_ANZEIGE[schluessel], art: "zahl", nurLesen: true };
  return null;
}
