'use strict';
var uuid, Service, Characteristic, StreamController,
    request = require('request').defaults({ encoding: null });

function SensrCamera(hap, sensrCameraOptions, log) {
    var self = this;

    uuid = hap.uuid;
    Service = hap.Service;
    Characteristic = hap.Characteristic;
    StreamController = hap.StreamController;

    self.options = sensrCameraOptions;
    self.log = log;

    self.services = [];
    self.streamControllers = [];

    self.pendingSessions = {};
    self.ongoingSessions = {};

    self.createCameraControlService();
    self._createStreamControllers();
}

SensrCamera.prototype.handleCloseConnection = function (connectionID) {
    var self = this;
    self.streamControllers.forEach(function (controller) {
        controller.handleCloseConnection(connectionID);
    });
};


SensrCamera.prototype.handleSnapshotRequest = function (req, callback) {
    var self = this;
    self.log('Request made for handleSnapshotRequest.', self.options.still);

    request({ url: self.options.still }, function (err, response, buffer) {
        callback(err, buffer);
    });
};

SensrCamera.prototype.createCameraControlService = function () {
    var self = this,
        controlService = new Service.CameraControl();

    self.services.push(controlService);
};

SensrCamera.prototype._createStreamControllers = function (options) {
    var self = this,
        // TODO: add support to override these options?
        maxStreams = 1,
        maxWidth = 640,
        maxHeight = 480,
        fps = 3;

    options = options || {
        video: {
            codec: {
                // Enum, refer to StreamController.VideoCodecParamProfileIDTypes
                profiles: [0, 1, 2],
                // Enum, refer to StreamController.VideoCodecParamLevelTypes
                levels: [0, 1, 2]
            },
            resolutions: [
                [maxWidth, maxHeight, fps]
            ]
        },
        // We don't really use this, since there is no sound from the JPEG stream
        audio: {
            codecs: [
                {
                    type: "OPUS",
                    samplerate: 8
                },
                {
                    type: "AAC-eld",
                    samplerate: 16
                }
            ]
        }
    };

    for (var i = 0; i < maxStreams; i++) {
        var streamController = new StreamController(i, options, self);

        self.services.push(streamController.service);
        self.streamControllers.push(streamController);
    }
};

module.exports = SensrCamera;