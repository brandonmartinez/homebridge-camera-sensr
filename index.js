var Accessory, hap, UUIDGen,
    SensrCamera = require('./SensrCamera'),
    request = require('request'),
    SENSR_API_URL = 'https://api.sensr.net/u/v3/',
    SENSR_API_CAMERAS_OWNED = SENSR_API_URL + 'cameras/owned.json';

module.exports = function (homebridge) {
    Accessory = homebridge.platformAccessory;
    hap = homebridge.hap;
    UUIDGen = homebridge.hap.uuid;

    homebridge.registerPlatform("homebridge-camera-sensr", "Camera-Sensr", sensrPlatform, true);
}

function sensrPlatform(log, config, api) {
    var self = this;

    self.log = log;
    self.config = config || {};

    if (api) {
        self.api = api;

        if (api.version < 2.1) {
            throw new Error("Unexpected API version.");
        }
        self.log('Api ready to go!');
        self.api.on('didFinishLaunching', self.didFinishLaunching.bind(this));
    }
}

sensrPlatform.prototype.configureAccessory = function (accessory) {
    // Won't be invoked
}

sensrPlatform.prototype.didFinishLaunching = function () {
    var self = this;

    function processSensrResponse(error, response, body) {
        if (!error && response.statusCode == 200) {
            var data = JSON.parse(body);

            if (data && data.cameras) {
                var configuredAccessories = [];

                data.cameras.forEach(function (cameraConfig) {
                    var camera = cameraConfig.camera,

                        urls = cameraConfig.urls,
                        sensrCameraConfig = {
                            name: camera.name,
                            id: camera.id,
                            state: camera.state,
                            still: urls.latestimage,
                            live: urls.livestream,
                        };

                    var uuid = UUIDGen.generate(sensrCameraConfig.id.toString()),
                        cameraAccessory = new Accessory(sensrCameraConfig.name, uuid, hap.Accessory.Categories.CAMERA),
                        cameraSource = new SensrCamera(hap, sensrCameraConfig, self.log);

                    sensrCameraConfig.uuid = uuid;
                    self.log(sensrCameraConfig);

                    cameraAccessory.configureCameraSource(cameraSource);
                    configuredAccessories.push(cameraAccessory);
                });

                self.api.publishCameraAccessories("Camera-Sensr", configuredAccessories);
            } else {
                self.log('No data was found for account.');
            }
        }
    }

    function processSensrAccounts(account) {
        var accountDescription = account.description,
            token = account.token;

        if (!token) {
            self.log("Missing parameters.");
            return;
        }

        request({
            url: SENSR_API_CAMERAS_OWNED,
            headers: {
                "Authorization": "OAUTH " + token
            }
        }, processSensrResponse);
    }

    if (self.config.accounts) {
        self.config.accounts.forEach(processSensrAccounts);
    }
}