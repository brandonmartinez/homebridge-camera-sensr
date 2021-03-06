'use strict';

// Minimal "global" variables
var SensrCamera,
    request = require('request'),
    debug = require('debug')('Camera:Sensr:Platform');

/**
 * Represents the Sensr.net Platform to integrate with Homebridge
 * 
 * @param {any} log
 * @param {any} config
 * @param {any} api
 */
function SensrPlatform(log, config, api) {
    var self = this;

    // Capture parameters as instance variables
    self.log = debug || log || console.log;
    self.config = config || {};
    self.api = api;

    // Light validation of API
    if (!api || api.version < 2.1) {
        throw new Error('Homebridge API v2.1 or higher required.');
    }

    // Cleaning up Sensr API config
    self._configureSensrApi();
    self.api.on('didFinishLaunching', self.didFinishLaunching.bind(self));
}

SensrPlatform.prototype.didFinishLaunching = function () {
    var self = this;
    self.log('Connecting to Sensr.net to retrieve camera configuration.');

    if (self.config.accounts) {
        self.config.accounts.forEach(self._processSensrAccounts, self);
    } else {
        self.log('No Sensr.net accounts found.');
    }
};

SensrPlatform.prototype._sanitizeUrlSlash = function (u) {
    return (u[u.length - 1] !== '/') ? u + '/' : u;
};

SensrPlatform.prototype._configureSensrApi = function () {
    var self = this;
    // Validating the existance of Sensr API configuration, otherwise providing defaults
    var sensrApi = self.config.sensrApi || {};

    sensrApi.baseUrl = self._sanitizeUrlSlash(sensrApi.baseUrl || 'https://api.sensr.net/u/v3/');
    sensrApi.camerasBaseUrl = self._sanitizeUrlSlash(sensrApi.camerasBaseUrl || sensrApi.baseUrl + 'cameras/');
    sensrApi.camerasOwnedUrl = sensrApi.camerasOwnedUrl || sensrApi.camerasBaseUrl + 'owned.json';

    // Assigning cleaned up API endpoints back to config object
    self.config.sensrApi = sensrApi;
};

SensrPlatform.prototype.configureAccessory = function () {
    // No configuration options available
};

SensrPlatform.prototype._processSensrCamera = function (cameraConfig) {
    var self = this,
        camera = cameraConfig.camera,
        urls = cameraConfig.urls,
        sensrCameraConfig = {
            name: camera.name,
            id: camera.id,
            state: camera.state,
            still: urls.latestimage,
            live: urls.livestream,
            uuid: self.HomebridgeUUIDGen.generate(cameraConfig.camera.id.toString())
        };

    self.log('Adding new Sensr Camera source.', sensrCameraConfig.name, sensrCameraConfig.id);
    var cameraAccessory = new self.HomebridgeAccessory(sensrCameraConfig.name, sensrCameraConfig.uuid, self.HomebridgeHap.Accessory.Categories.CAMERA),
        cameraSource = new SensrCamera(sensrCameraConfig);

    cameraAccessory.configureCameraSource(cameraSource);
    self.log('Adding Sensr Camera to available accessories.', sensrCameraConfig.name, sensrCameraConfig.uuid);
    return cameraAccessory;
};

SensrPlatform.prototype._processSensrAccounts = function (account) {
    var self = this,
        token = account.token;

    self.log('Attempting to connect to Sensr.net account.', self.config.sensrApi.camerasOwnedUrl, account);

    if (!token) {
        self.log('A token is required to connect with Sensr.net.');
        return;
    }

    request({
        url: self.config.sensrApi.camerasOwnedUrl,
        headers: {
            'Authorization': 'OAUTH ' + token
        }
    }, function (error, response, body) {
        var configuredAccessories = [];

        if (!error && response && response.statusCode === 200) {
            var data = JSON.parse(body);

            if (data && data.cameras) {
                data.cameras.forEach(function (cameraResponse) {
                    var camera = self._processSensrCamera(cameraResponse);
                    configuredAccessories.push(camera);
                }, self);
            } else {
                self.log('No data was found for account.');
            }
        } else {
            self.log('There was an error retrieving data from the Sensr.net account.', (response || {}).statusCode || 0, error);
        }

        self.log('Publishing ' + configuredAccessories.length + ' available accessories.');
        self.api.publishCameraAccessories('Camera-Sensr', configuredAccessories);
    });
};

module.exports = function (homebridge) {
    SensrCamera = require('./lib/SensrCamera')(homebridge.hap);

    SensrPlatform.prototype.HomebridgeAccessory = homebridge.platformAccessory;
    SensrPlatform.prototype.HomebridgeHap = homebridge.hap;
    SensrPlatform.prototype.HomebridgeUUIDGen = homebridge.hap.uuid;

    homebridge.registerPlatform('homebridge-camera-sensr', 'Camera-Sensr', SensrPlatform, true);
};