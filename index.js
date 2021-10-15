const fs = require('fs');
const { exec, spawnSync } = require('child_process');
const queue = require('queue');
const PubSubService = require('./services');

const configFile = fs.readFileSync('./config.json');
const config = JSON.parse(configFile);
const initImageFilename = 'init.ppm';
const { logo, ledMatrix } = config;

const ledOptions = `--led-rows=32 --led-cols=32 --led-chain=4 --led-gpio-mapping=adafruit-hat --led-pixel-mapper U-mapper --led-slowdown-gpio=2 --led-pwm-bits=11 --led-brightness=84`;

let q = queue();
q.autostart = true;
q.concurrency = 1;

let repeatMessage;

run().then(() => {
  console.log('Projext-pxl-client started!');
});

async function run() {
  
  const cmdDisplayLogo = `sudo ${ledMatrix.path}/utils/led-image-viewer ${logo} -w2 ./${logo} -w2 -C ${ledOptions}`;
  q.push(() =>
    execCommand({
      cmd: cmdDisplayLogo,
      ledMatrix,
    })
  );

  const pubsubService = new PubSubService(config);

  pubsubService.subscribe(sendMessage, sendCommand);

  q.on('success', (message, job) => {
    console.log('job finished processing', message);
    if (!message) {
      displayTime(ledMatrix);
      return;
    }

    const { repeat } = message.userMetadata;
    if (repeat) {
      repeatMessage = message;
    }

    loopMessage();
  });

  q.on('error', (error, job) => {
    console.error('job failed to execute', error);
  });

  q.start((err) => console.log('queue ended', err));
}

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

function sendMessage(message) {
  q[message.userMetadata.priority ? 'unshift' : 'push'](() => {
    return new Promise((resolve) => {
      sendToDisplayPanel({
        message,
        imageFile: `${message.userMetadata.name}.ppm`,
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

function loopMessage() {
  if (q.length !== 0) {
    return;
  }

  if (repeatMessage) {
    q.push((cb) => {
      return new Promise((resolve, reject) => {
        sendToDisplayPanel({
          message: repeatMessage,
          imageFile: `${repeatMessage.userMetadata.name}.ppm`,
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
    displayTime(ledMatrix);
  }
}

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

async function sendToDisplayPanel({ message, imageFile, ledMatrix }) {

  var { duration } = message.userMetadata;
  var { name } = message.userMetadata;
  var { speed } = message.userMetadata;
  var { red } = message.userMetadata;
  var { green } = message.userMetadata;
  var { blue } = message.userMetadata;
  var { pictureFile } = message.userMetadata;
  var { type } = message.userMetadata;

  const cmdKillDemo= `sudo pkill demo`;

  const cmdSyncPictures= `wget http://pxl.cedrichoechli.com/service/uploads/pictures/${pictureFile} -P assets/pictures/`;
  const cmdSyncAnimations= `wget http://pxl.cedrichoechli.com/service/uploads/animations/${pictureFile} -P assets/animations/`;

  const cmdDisplayAnimation = `sudo ${ledMatrix.path}/utils/led-image-viewer -t${duration} assets/animations/${pictureFile} -C ${ledOptions}`;
  const cmdDisplayPicture = `sudo ${ledMatrix.path}/utils/led-image-viewer -w${duration} assets/pictures/${pictureFile} -w${duration} assets/pictures/${pictureFile} -C ${ledOptions}`;
  const cmdDisplayTextImage = `sudo ${ledMatrix.path}/examples-api-use/demo -m 25 -D 1 ./${imageFile} ${ledOptions}`;
  const cmdDisplayMessage = `sudo ${ledMatrix.path}/utils/text-scroller -f ${ledMatrix.path}/fonts/10x20.bdf -s ${speed} -l ${duration} -y 22 ${message.message} -C ${red},${green},${blue} ${ledOptions}`;
  
  if (name == "weather") {

    generateTextImage({
      text: message.message,
      filename: imageFile,
      ledRows: ledMatrix.options.ledRows,
    });
  
    return await execCommand({
      cmd: cmdDisplayTextImage,
      message,
      ledMatrix,
    });
  } if (name == "picture") {

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

function displayTime(ledMatrix) {
  const cmdDisplayClock = `sudo ${ledMatrix.path}/examples-api-use/clock -f ${ledMatrix.path}/fonts/8x13.bdf -d "%H:%M:%S" -y 25 -C 255,255,255 ${ledOptions}`;
  const child = exec(cmdDisplayClock);
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
}

function killProcess(grepPattern) {
  const cmdKillProcess = `sudo kill $(ps aux | grep '${grepPattern}' | awk '{print $2}')`;
  exec(cmdKillProcess);
}