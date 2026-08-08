// Preload: Bruecke zwischen Oberflaeche und System.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sku505', {
  stationSuchen: () => ipcRenderer.invoke('station-suchen'),
  einstellungenEinlesen: (p) => ipcRenderer.invoke('einstellungen-einlesen', p),
  loopsEinlesen: (p) => ipcRenderer.invoke('loops-einlesen', p),
  kenndatenLesen: (p) => ipcRenderer.invoke('kenndaten-lesen', p),
  speicherplaetzeLesen: (p) => ipcRenderer.invoke('speicherplaetze-lesen', p),
  datenordner: () => ipcRenderer.invoke('datenordner')
});
