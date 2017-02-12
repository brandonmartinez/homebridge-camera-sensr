'use strict';
var uuid, Service, Characteristic, StreamController;

var fs = require('fs');
var request = require('request').defaults({ encoding: null });
var spawn = require('child_process').spawn;

function SensrCamera(hap, sensrCameraOptions) {
    uuid = hap.uuid;
    Service = hap.Service;
    Characteristic = hap.Characteristic;
    StreamController = hap.StreamController;

    this.options = sensrCameraOptions;

    this.services = [];
    this.streamControllers = [];

    this.pendingSessions = {};
    this.ongoingSessions = {};

    // TODO: These should be dynamic to some degree
    var numberOfStreams = 1;
    var maxWidth = 640;
    var maxHeight = 480;
    var maxFPS = 15;

    this.createCameraControlService();
    this._createStreamControllers(numberOfStreams);
}

SensrCamera.prototype.handleCloseConnection = function (connectionID) {
    this.streamControllers.forEach(function (controller) {
        controller.handleCloseConnection(connectionID);
    });
}


SensrCamera.prototype.createCameraControlService = function () {
    var controlService = new Service.CameraControl();

    this.services.push(controlService);
}

SensrCamera.prototype._createStreamControllers = function (maxStreams, options) {
    let self = this;
    options = options || {
        video: {
            codec: 'MJPEG',
            resolutions: [
                [640, 480, 15]
            ]
        }
    };

    for (var i = 0; i < maxStreams; i++) {
        var streamController = new StreamController(i, options, self);

        self.services.push(streamController.service);
        self.streamControllers.push(streamController);
    }
}

module.exports = SensrCamera;