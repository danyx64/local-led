# Local LED IWA — ZENGGE Wi-Fi diretto

Questa variante usa la Direct Sockets API di Chrome dentro una Isolated Web App (IWA) per collegarsi direttamente alle lampade ZENGGE / Magic Home / Surplife sulla porta TCP 5577.

Non usa bridge Python, Home Assistant o server locale.

## Stato

È una build sperimentale. Il driver implementa il protocollo LEDENET/ZENGGE più comune:

- query stato `81 8A 8B 96`
- ON/OFF
- RGB + luminosità
- bianco caldo/freddo
- scansione TCP della subnet sulla porta 5577

Alcuni modelli ZENGGE recenti usano varianti/wrapper del protocollo. Se la lampada viene trovata ma non accetta i comandi, servirà aggiungere la variante identificata dalla sua risposta grezza.

## Requisiti

Serve una versione di Chrome/Chromium con supporto IWA e Direct Sockets. La versione GitHub Pages normale non può usare `TCPSocket`.

## Creare la IWA

Dalla cartella `iwa`:

```bash
npm install
openssl genpkey -algorithm ed25519 -out private.pem
npm run build
```

Con `private.pem` presente, il file prodotto è `dist/local-led.swbn`.

La chiave privata identifica l'IWA: non pubblicarla e non committarla.

## Installazione per test

Avvia Chrome con IWA developer mode / Direct Sockets abilitati e installa il Signed Web Bundle `dist/local-led.swbn`. La procedura esatta dipende dalla piattaforma/versione di Chrome; fare riferimento alla documentazione IWA corrente di Chrome.

Dopo l'avvio dell'app:

1. verifica che in alto compaia `DIRECT SOCKETS OK`;
2. imposta la subnet (es. `192.168.1`);
3. premi `Cerca`;
4. seleziona la lampada ZENGGE trovata;
5. prova ON/OFF e poi colori.

## Sicurezza

La scansione è limitata agli IP inseriti dall'utente e tenta esclusivamente la porta TCP 5577. Le lampade e le impostazioni vengono salvate nel `localStorage` isolato della IWA.
