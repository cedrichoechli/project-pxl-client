// Import der nötigen Bibliotheken

const fs = require('fs');
const { exec, spawnSync } = require('child_process');
const queue = require('queue');
const PubSubService = require('./services');

// Definition der nötigen Konstanten

const configFile = fs.readFileSync('./config.json');
const config = JSON.parse(configFile);
const { logo, ledMatrix } = config;

// Definition der Parameter, die von der rpi-rgb-led-matrix benutzt werden. Definieren wie die Matrizen angesprochen werden und wie diese Aufgebaut sind.

const ledOptions = `--led-rows=32 --led-cols=32 --led-chain=4 --led-gpio-mapping=adafruit-hat --led-pixel-mapper U-mapper --led-slowdown-gpio=2 --led-pwm-bits=11 --led-brightness=84`;

// Initialisiert die Queue

let q = queue();
q.autostart = true;
q.concurrency = 1;

let repeatMessage;

// Startet das Display

run().then(() => {
  console.log('Projext-pxl-client started!');
});

// Hauptfunktion

async function run() {
  
  // Definiert Befehl, um das Logo anzuzeigen

  const cmdDisplayLogo = `sudo ${ledMatrix.path}/utils/led-image-viewer ${logo} -w2 ./${logo} -w2 -C ${ledOptions}`;

  // Zeigt beim Start das Logo an

  q.push(() =>
    execCommand({
      cmd: cmdDisplayLogo,
      ledMatrix,
    })
  );

  // Initialisiert den Pub/Sub-Service

  const pubsubService = new PubSubService(config);

  pubsubService.subscribe(sendMessage, sendCommand);
  
  // Started die Queue

  q.on('success', (message, job) => {
    console.log('job finished processing', message);

    // Zeigt Uhrzeit an, wenn kein Ereignis ausgeführt wird

    if (!message) {
      displayTime(ledMatrix);
      return;
    }

    // Definiert die nötigen Konstante, falls das Ereignis wiederholt werden soll

    const { repeat } = message.userMetadata;
    if (repeat) {
      repeatMessage = message;
    }

    loopMessage();
  });

  // Schreibt bei Fehler Error-Nachricht in die Konsole

  q.on('error', (error, job) => {
    console.error('job failed to execute', error);
  });

  q.start((err) => console.log('queue ended', err));
}

// Definiert bei welchem Befehlt die Queue gestartet, gestopt, abgebrochen oder gelöscht wird

function sendCommand(command) {
  console.log('command', command);
  switch (command) {
    case 'start':
      q.start((err) => console.log('queue ended', err));
      break;
    case 'stop':
      q.stop();
      break;
    case 'end':
      q.end();
      break;
    case 'clear':
      q.splice(0);
      break;
  }
}

// Funktion, um die Nachricht an die Darstellungs-Funktion zu schicken

function sendMessage(message) {
  q[message.userMetadata.priority ? 'unshift' : 'push'](() => {
    return new Promise((resolve) => {
      sendToDisplayPanel({
        message,
        ledMatrix,
      })
        .then((res) => {
          resolve(res);
        })
        .catch((err) => {
          resolve(err);
        });
    });
  });
}

// Kontrolliert ob das Ereignis wiederholt werden soll

function loopMessage() {
  if (q.length !== 0) {
    return;
  }

  if (repeatMessage) {
    q.push((cb) => {
      return new Promise((resolve, reject) => {
        sendToDisplayPanel({
          message: repeatMessage,
          ledMatrix,
        })
          .then((res) => {
            resolve(res);
          })
          .catch((err) => {
            resolve(err);
          });
      });
    });
  } else {
    displayTime(ledMatrix); // falls nicht und keine weitere Ereignisse in der Queue stehen, wird die Zeit angezeigt
  }
}

// Führt den definierten Befehl aus, der etwas auf dem Display anzeigen soll

function execCommand({ cmd, message, ledMatrix }) {
  killProcess(`${ledMatrix.path}/examples-api-use/clock`);

  return new Promise((resolve, reject) => {
    const child = exec(cmd);
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    child.on('exit', (status) => {
      let msg = message;
      if (status !== 0) {
        console.error('command', cmd);
        msg = null;
      }
      resolve(msg);
    });
  });
}

// Funktion, die den richtigen Befehl definiert

async function sendToDisplayPanel({ message,  ledMatrix }) {

  // Variablen, die aus der Nachricht entnommen werden können

  var { duration } = message.userMetadata;
  var { name } = message.userMetadata;
  var { speed } = message.userMetadata;
  var { red } = message.userMetadata;
  var { green } = message.userMetadata;
  var { blue } = message.userMetadata;
  var { pictureFile } = message.userMetadata;
  var { type } = message.userMetadata;

  // Kopiert die Bild- oder Animationsdateien

  const cmdSyncPictures= `wget http://pxl.cedrichoechli.com/service/uploads/pictures/${pictureFile} -P assets/pictures/`;
  const cmdSyncAnimations= `wget http://pxl.cedrichoechli.com/service/uploads/animations/${pictureFile} -P assets/animations/`;


  // Befehl um eine Animation darzustellen

  const cmdDisplayAnimation = `sudo ${ledMatrix.path}/utils/led-image-viewer -t${duration} assets/animations/${pictureFile} -C ${ledOptions}`;

  // Befehl um ein Bild darzustellen

  const cmdDisplayPicture = `sudo ${ledMatrix.path}/utils/led-image-viewer -w${duration} assets/pictures/${pictureFile} -w${duration} assets/pictures/${pictureFile} -C ${ledOptions}`;

  // Befehl um einen Text darzustellen

  const cmdDisplayMessage = `sudo ${ledMatrix.path}/utils/text-scroller -f ${ledMatrix.path}/fonts/10x20.bdf -s ${speed} -l ${duration} -y 22 ${message.message} -C ${red},${green},${blue} ${ledOptions}`;
  
  //Kontrolliert welcher Befehl ausgeführt werden soll

  if (name == "picture") {

    return await execCommand({
      cmd: cmdDisplayPicture,
      message,
      ledMatrix,
    });

  } if (name == "animation") {

    return await execCommand({
      cmd: cmdDisplayAnimation,
      message,
      ledMatrix,
    });

  } if (name == "sync") {

    if (type == "picture") {

      return await execCommand({
        cmd: cmdSyncPictures,
        message,
        ledMatrix,
      });

    } else {

      return await execCommand({
        cmd: cmdSyncAnimations,
        message,
        ledMatrix,
      });

    }

  } else {
    return await execCommand({
      cmd: cmdDisplayMessage,
      message,
      ledMatrix,
    });
  }
}

// Funktion um die Zeit anzuzeigen

function displayTime(ledMatrix) {
  const cmdDisplayClock = `sudo ${ledMatrix.path}/examples-api-use/clock -f ${ledMatrix.path}/fonts/8x13.bdf -d "%H:%M:%S" -y 25 -C 255,255,255 ${ledOptions}`;
  const child = exec(cmdDisplayClock);
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
}

// Funktion um einen Befehl zu stoppen

function killProcess(grepPattern) {
  const cmdKillProcess = `sudo kill $(ps aux | grep '${grepPattern}' | awk '{print $2}')`;
  exec(cmdKillProcess);
}