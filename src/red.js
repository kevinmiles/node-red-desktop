/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
const http = require('http');
const util = require("util");
const path = require("path");
const url = require("url");
const express = require("express");
const fs = require("fs-extra");
const RED = require("node-red");
const {dialog} = require('electron');

var server;
var app = express();

var settings;
var settingsFile;
var userDir;
var flowFile;

function init(parsedArgs) {

    let userDir;

    if (parsedArgs.argv.remain.length > 0) {
        flowFile = parsedArgs.argv.remain[0];
    }

    userDir = parsedArgs.userDir
    if (!userDir && process.platform == 'win32') {
        userDir = path.join(process.env.LOCALAPPDATA || process.env.APPDATA || path.join(process.env.HOMEDRIVE, process.env.HOMEPATH), 'Node-RED Desktop')
    } else {
        // complying to "XDG Base Directory Specification"
        // https://specifications.freedesktop.org/basedir-spec/basedir-spec-0.6.html
        userDir = path.join(process.env.XDG_CONFIG_HOME || path.join(process.env.HOME, '.config'), "node-red-desktop");
    }

    if (parsedArgs.settings) {
        // User-specified settings file
        settingsFile = parsedArgs.settings;
    } else {
        var userSettingsFile = path.join(userDir, "settings.js");
        if (!fs.existsSync(userSettingsFile)) {
            // Always copy default settings file to userDir if it does not exists
            var defaultSettings = path.join(__dirname, "..", "node_modules", "node-red", "settings.js");
            fs.copySync(defaultSettings, userSettingsFile);
            settingsFile = userSettingsFile;
        }
        settingsFile = userSettingsFile;
    }

    try {
        settings = require(settingsFile);
        settings.settingsFile = settingsFile;
    } catch (err) {
        console.log("Error loading settings file: " + settingsFile)
        if (err.code == 'MODULE_NOT_FOUND') {
            if (err.toString().indexOf(settingsFile) === -1) {
                console.log(err.toString());
            }
        } else {
            console.log(err);
        }
        dialog.showErrorBox("Error loading settings", `Error loading settings file\n${err.toString()}`);
        return false;
    }

    if (parsedArgs.verbose) {
        settings.verbose = true;
    }

    server = http.createServer(function (req, res) {
        app(req, res);
    });
    server.setMaxListeners(0);

    function formatRoot(root) {
        if (root[0] != "/") {
            root = "/" + root;
        }
        if (root.slice(-1) != "/") {
            root = root + "/";
        }
        return root;
    }

    settings.httpAdminRoot = '/';
    settings.disableEditor = false;
    delete settings.httpAdminAuth;

    if (settings.httpNodeRoot !== false) {
        settings.httpNodeRoot = formatRoot(settings.httpNodeRoot || settings.httpRoot || "/");
        settings.httpNodeAuth = settings.httpNodeAuth || settings.httpAuth;
    }

    settings.uiPort = parsedArgs.port || settings.uiPort || 0;
    settings.uiHost = settings.uiHost || "127.0.0.1";

    if (flowFile) {
        settings.flowFile = flowFile;
    }
    settings.userDir = parsedArgs.userDir || userDir;

    try {
        RED.init(server, settings);
    } catch (err) {
        if (err.code == "unsupported_version") {
            console.log("Unsupported version of node.js:", process.version);
            console.log("Node-RED requires node.js v4 or later");
        } else if (err.code == "not_built") {
            console.log("Node-RED has not been built. See README.md for details");
        } else {
            console.log("Failed to start server:");
            if (err.stack) {
                console.log(err.stack);
            } else {
                console.log(err);
            }
        }
        dialog.showErrorBox("Failed to initialize", `Error while initializing Node-RED:\n${err.toString()}`);
        return false;
    }

    app.use(settings.httpAdminRoot, RED.httpAdmin);

    if (settings.httpNodeRoot !== false) {
        app.use(settings.httpNodeRoot, RED.httpNode);
    }

    if (settings.httpStatic) {
        app.use("/", express.static(settings.httpStatic));
    }

    return true;
}

function start(cb) {

    if (typeof cb !== 'function') {
        throw new Error('Callback function must be supplied');
    }

    function getListenPath(port) {
        return url.format({
            protocol: 'http:',
            hostname: settings.uiHost == '0.0.0.0' ? '127.0.0.1' : settings.uiHost,
            port: port,
            pathname: settings.httpAdminRoot || '/'

        });
    }

    RED.start().then(function () {
        server.on('error', function (err) {
            if (err.errno === "EADDRINUSE") {
                RED.log.error(RED.log._("server.unable-to-listen", {
                    listenpath: getListenPath(settings.uiPort)
                }));
                RED.log.error(RED.log._("server.port-in-use"));
            } else {
                RED.log.error(RED.log._("server.uncaught-exception"));
                if (err.stack) {
                    RED.log.error(err.stack);
                } else {
                    RED.log.error(err);
                }
            }
            dialog.showErrorBox("Failed to start", `Error while starting internal server:\n${err.toString()}`);
            cb(err, null);
        });
        server.listen(settings.uiPort, settings.uiHost, function () {
            let listenPath = getListenPath(server.address().port);
            RED.log.info(RED.log._("server.now-running", {
                listenpath: listenPath
            }));

            cb(null, listenPath);
        });
    }).otherwise(function (err) {
        RED.log.error(RED.log._("server.failed-to-start"));
        if (err.stack) {
            RED.log.error(err.stack);
        } else {
            RED.log.error(err);
        }
        dialog.showErrorBox("Failed to start", `Error while starting Node-RED:\n${err.toString()}`);
        cb(err, null)
    });
}

module.exports = {
    init,
    start,
    RED
}