const {app} = require('electron');
const util = require("util");
const nopt = require("nopt");
const path = require("path");
const SplashScreen = require('./splash.js');
const MainWindow = require('./mainWindow.js');

var red;
var mainWindow;

//TODO selfUpdate
//TODO crashreporter

var knownOpts = {
    "help": Boolean,
    "port": Number,
    "settings": [path],
    "userDir": [path],
    "verbose": Boolean
};
var shortHands = {
    "?":["--help"],
    "p":["--port"],
    "s":["--settings"],
    // As we want to reserve -t for now, adding a shorthand to help so it
    // doesn't get treated as --title
    "t":["--help"],
    "u":["--userDir"],
    "v":["--verbose"]
};
nopt.invalidHandler = function(k,v,t) {
    // TODO: console.log(k,v,t);
}

var parsedArgs = nopt(knownOpts,shortHands,process.argv,2)

if (parsedArgs.help) {
    console.log("Node-RED Desktop v"+require('../package.json').version);
    console.log("Node-RED v"+require('node-red').version());
    console.log("Usage: node-red [-v] [-?] [--settings settings.js] [--userDir DIR]");
    console.log("                [--port PORT] [--title TITLE] [flows.json]");
    console.log("");
    console.log("Options:");
    console.log("  -p, --port     PORT  port to listen on");
    console.log("  -s, --settings FILE  use specified settings file");
    console.log("  -u, --userDir  DIR   use specified user directory");
    console.log("  -v, --verbose        enable verbose output");
    console.log("  -?, --help           show this help");
    console.log("");
    console.log("Documentation can be found at http://nodered.org");
    process.exit();
}

function exitApp() {
  //gracefully exits Node-RED if available
  if (red && red.RED) {
    red.RED.stop().then(function() {
      app.quit();
    });
  } else {
    app.quit();
  }
}

function onReady() {
  //create and show splash as soon as possible
  let splash = new SplashScreen();

  // load and start NodeRED
  splash.setStatus('Loading...')
  red = require('./red.js');
  
  splash.setStatus('Initializing Node-RED...');
  red.init(parsedArgs) || app.quit();

  //create main window
  splash.setStatus('Creating main window...');
  mainWindow = new MainWindow();
  mainWindow.win.on('ready-to-show', () => {
    splash.close();
  });

  //show main window when NodeRED is started
  splash.setStatus('Starting Node-RED engine...');
  red.start((err, path) => {
    if(err) {
      exitApp();
    } else {
      mainWindow.load(path);
    }
  });
}

app.on('ready', onReady);

app.on('window-all-closed', () => {
  exitApp();
});

app.on('gpu-process-crashed', (evt, killed) => {
  util.log(`Error - GPU Process ${killed ? 'was killed' : 'crashed'}! Exiting application`);
  exitApp();
});

process.on('uncaughtException',function(err) {
    util.log('Uncaught Exception:');
    if (err.stack) {
        util.log(err.stack);
    } else {
        util.log(err);
    }
    app.quit();
});

process.on('SIGINT', function () {
    exitApp();
});