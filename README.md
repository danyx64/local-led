# Local LED

Telecomando web leggero e responsive per lampadine RGB/Wi-Fi sulla rete locale.

## Obiettivo

Aprire il sito, collegarsi a una lampadina compatibile e controllare rapidamente:

- accensione e spegnimento
- luminosita
- temperatura del bianco (caldo/freddo)
- colori rapidi
- tavolozza RGB

L'interfaccia e progettata anche per telefoni in orizzontale.

## Stato

La UI e funzionante in modalita demo. Il codice separa volutamente l'interfaccia dal driver hardware (`driver` in `app.js`). Per inviare comandi reali bisogna identificare il protocollo LAN delle lampadine da supportare e implementare i relativi metodi di connessione/controllo.

## Avvio

E un sito statico: basta servire la cartella con un web server oppure pubblicarla tramite GitHub Pages.

> Nota: l'accesso dal browser a dispositivi della rete locale e soggetto alle policy di sicurezza del browser e alle caratteristiche del protocollo usato dalla lampadina.
