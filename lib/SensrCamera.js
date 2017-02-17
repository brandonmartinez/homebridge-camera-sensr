'use strict';
var ip = require('ip'),
    request = require('request').defaults({
        encoding: null
    }),
    MjpegToSrtpStream = require('./MjpegToSrtpStream'),
    debug;

/**
 * Represents a Sensr.net Camera
 * 
 * @param {any} sensrCameraOptions
 * @see {@link https://github.com/KhaosT/HAP-NodeJS/wiki/IP-Camera|HAP-NodeJS IP Camera Reference}
 * @see {@link https://github.com/KhaosT/homebridge-camera-ffmpeg/|Homebridge Camera FFMPEG}
 * @see {@link https://ffmpeg.org/ffmpeg.html|FFMPEG Reference}
 */
function SensrCamera(sensrCameraOptions) {
    var self = this;
    self.name = sensrCameraOptions.name || 'NAME NOT SPECIFIED';
    debug = require('debug')('Camera:Sensr:CameraAccessory:' + self.name);

    self.options = sensrCameraOptions;
    self.log = debug;

    self.log('Configuring a SensrCamera.', self.options);

    self.services = [];
    self.streamControllers = [];

    self.pendingSessions = {};
    self.ongoingSessions = {};

    self.createCameraControlService();
    self._createStreamControllers();
}

SensrCamera.prototype.handleCloseConnection = function (connectionId) {
    var self = this;
    self.log('Closing Connection.', connectionId);
    self.streamControllers.forEach(function (controller) {
        controller.handleCloseConnection(connectionId);
    });
    self.log('Closed Connection.', connectionId);
};

SensrCamera.prototype.handleSnapshotRequest = function (req, callback) {
    var self = this;
    self.log('Generating Snapshot.', self.options.still);

    request({
        url: self.options.still
    }, function (err, response, buffer) {
        callback(err, buffer);
        self.log('Generated Snapshot.', self.options.still);
    });
};

SensrCamera.prototype.prepareStream = function (request, callback) {
    var self = this,
        sessionInfo = {},
        response = {},
        sessionID = request.sessionID,
        targetAddress = request.targetAddress;

    sessionInfo.address = targetAddress;

    self.log('Preparing Stream.', sessionInfo);

    var videoInfo = request.video;

    if (videoInfo) {
        var targetPort = videoInfo.port,
            srtp_key = videoInfo.srtp_key,
            srtp_salt = videoInfo.srtp_salt;

        var videoResp = {
            port: targetPort,
            ssrc: 1,
            srtp_key: srtp_key,
            srtp_salt: srtp_salt
        };

        response.video = videoResp;

        sessionInfo.video_port = targetPort;
        sessionInfo.video_srtp = Buffer.concat([srtp_key, srtp_salt]);
        sessionInfo.video_ssrc = 1;
    }

    var audioInfo = request.audio;
    if (audioInfo) {
        var targetPort = audioInfo.port,
            srtp_key = audioInfo.srtp_key,
            srtp_salt = audioInfo.srtp_salt,
            audioResp = {
                port: targetPort,
                ssrc: 1,
                srtp_key: srtp_key,
                srtp_salt: srtp_salt
            };

        response.audio = audioResp;

        sessionInfo.audio_port = targetPort;
        sessionInfo.audio_srtp = Buffer.concat([srtp_key, srtp_salt]);
        sessionInfo.audio_ssrc = 1;
    }

    var currentAddress = ip.address();
    var addressResp = {
        address: currentAddress
    };

    addressResp.type = ip.isV4Format(currentAddress) ? 'v4' : 'v6';

    response.address = addressResp;
    self.pendingSessions[self.HomebridgeHapUuid.unparse(sessionID)] = sessionInfo;

    callback(response);
    self.log('Prepared Stream.', sessionInfo);
};

SensrCamera.prototype.handleStreamRequest = function (request) {
    var self = this,
        sessionId = request.sessionID,
        requestType = request.type;

    self.log('Handling Stream Request.', sessionId, requestType);

    if (sessionId) {
        var sessionIdentifier = self.HomebridgeHapUuid.unparse(sessionId);

        if (requestType === 'start') {
            var sessionInfo = self.pendingSessions[sessionIdentifier];
            self.log('Starting Stream.', sessionId, sessionIdentifier);

            if (sessionInfo) {
                var videoInfo = request.video || {};

                // Build the ffmpeg command to serve the MJPEG stream as x264 over SRTP
                var streamOptions = {
                    sourceUrl: self.options.live,
                    destinationUrl: 'srtp://' + sessionInfo.address + ':' + sessionInfo.video_port + '?rtcpport=' + sessionInfo.video_port + '&localrtcpport=' + sessionInfo.video_port + '&pkt_size=1378',
                    destinationKey: sessionInfo.video_srtp.toString('base64'),
                    width: videoInfo.width || 1280,
                    height: videoInfo.height || 720,
                    fps: videoInfo.fps,
                    bitrate: videoInfo.max_bit_rate || 300
                };

                self.log(streamOptions);

                self.ongoingSessions[sessionIdentifier] = new MjpegToSrtpStream(streamOptions);
            }

            delete this.pendingSessions[sessionIdentifier];
        } else if (requestType === 'stop') {
            self.log('Stopping Stream.', sessionId, sessionIdentifier);
            var ffmpegProcess = self.ongoingSessions[sessionIdentifier];
            if (ffmpegProcess) {
                ffmpegProcess.kill('SIGKILL');
            }

            delete self.ongoingSessions[sessionIdentifier];
        }
    }

    self.log('Handled Stream Request.', sessionId, requestType);
};

SensrCamera.prototype.createCameraControlService = function () {
    var self = this;
    self.log('Creating Camera Control Service');

    var controlService = new self.HomebridgeHapService.CameraControl();
    self.services.push(controlService);

    self.log('Created Camera Control Service');
};

SensrCamera.prototype._createStreamControllers = function (options) {
    var self = this,
        // TODO: add support to override these options?
        maxStreams = 2,
        maxWidth = 640,
        maxHeight = 480,
        fps = 3;

    self.log('Creating Camera Stream Controller(s)');

    options = options || {
        srtp: true,
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
            codecs: [{
                type: "OPUS",
                samplerate: 16
            }]
        }
    };

    for (var i = 0; i < maxStreams; i++) {
        var streamController = new self.HomebridgeHapStreamController(i, options, self);
        self.services.push(streamController.service);
        self.streamControllers.push(streamController);
    }

    self.log('Created Camera Stream Controller(s)');
};

//module.exports = SensrCamera;

module.exports = function (hap) {
    if (!hap) {
        throw new Error('Homebridge hap must be defined.');
    }

    // Assigning these here as they should be the same across all instances
    SensrCamera.prototype.HomeBridgeHap = hap;
    SensrCamera.prototype.HomebridgeHapUuid = hap.uuid;
    SensrCamera.prototype.HomebridgeHapService = hap.Service;
    SensrCamera.prototype.HomebridgeHapCharacteristic = hap.Characteristic;
    SensrCamera.prototype.HomebridgeHapStreamController = hap.StreamController;

    return SensrCamera;
};