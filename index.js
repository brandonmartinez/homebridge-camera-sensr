var Accessory, hap, UUIDGen,
    SensrCamera = require('./SensrCamera'),
    Client = require('node-rest-client').Client,
    client = new Client(),
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
    self.log('didFinishLaunching');
    self.log(self.config);

    if (self.config.accounts) {
        // Checking for any available Sensr accounts
        var accounts = self.config.accounts;
        accounts.forEach(function (account) {
            var accountDescription = account.description,
                token = account.token;

            if (!token) {
                self.log("Missing parameters.");
                return;
            }

            client.get(SENSR_API_CAMERAS_OWNED,
                { "Authorization": "OAUTH " + token },
                function (data, response) {
                    self.log(data);
                    self.log(response);
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
                                },

                                uuid = UUIDGen.generate(sensrCameraConfig.id),
                                cameraAccessory = new Accessory(name, uuid, hap.Accessory.Categories.CAMERA),
                                cameraSource = new SensrCamera(hap, sensrCameraConfig);

                            cameraAccessory.configureCameraSource(cameraSource);
                            self.log(sensrCameraConfig);
                            self.log(cameraAccessory);
                            self.log(cameraSource);
                            configuredAccessories.push(cameraAccessory);
                        });

                        self.api.publishCameraAccessories("Camera-Sensr", configuredAccessories);
                    }
                });
        });
    }
}