// Preload: Bruecke zwischen Oberflaeche und System.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sku505', {
  laufwerkDa:            ()        => ipcRenderer.invoke('laufwerk-da'),
  stationSuchen:         ()        => ipcRenderer.invoke('station-suchen'),
  kenndatenLesen:        (p)       => ipcRenderer.invoke('kenndaten-lesen', p),
  einstellungenEinlesen: (p)       => ipcRenderer.invoke('einstellungen-einlesen', p),
  loopsEinlesen:         (p)       => ipcRenderer.invoke('loops-einlesen', p),
  speicherplaetzeLesen:  (p)       => ipcRenderer.invoke('speicherplaetze-lesen', p),
  speicherplatzLesen:    (p, n)    => ipcRenderer.invoke('speicherplatz-lesen', p, n),
  systemLesen:           (p)       => ipcRenderer.invoke('system-lesen', p),
  wertSchreiben:         (p, a)    => ipcRenderer.invoke('wert-schreiben', p, a),
  nameSchreiben:         (p, n, t) => ipcRenderer.invoke('name-schreiben', p, n, t),
  platzKopieren:         (p, v, n) => ipcRenderer.invoke('platz-kopieren', p, v, n),
  platzTauschen:         (p, a, b) => ipcRenderer.invoke('platz-tauschen', p, a, b),
  loopsAuflisten:        (p, n)    => ipcRenderer.invoke('loops-auflisten', p, n),
  loopExportieren:       (p, n, s, z) => ipcRenderer.invoke('loop-exportieren', p, n, s, z),
  loopImportieren:       (p, n, s, q) => ipcRenderer.invoke('loop-importieren', p, n, s, q),
  usbSteuern:            (a)       => ipcRenderer.invoke('usb-steuern', a),
  gitSichern:            (t)       => ipcRenderer.invoke('git-sichern', t),
  wavSchreiben:          (z, d)    => ipcRenderer.invoke('wav-schreiben', z, d),
  datenordner:           ()        => ipcRenderer.invoke('datenordner'),
  dateiWaehlen:          (s, v)    => ipcRenderer.invoke('datei-waehlen', s, v)
});
