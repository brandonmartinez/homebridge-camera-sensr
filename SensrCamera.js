'use strict';
var ip = require('ip'),
    spawn = require('child_process').spawn,
    request = require('request').defaults({ encoding: null }),
    debug;

/**
 * Represents a Sensr.net Camera
 * 
 * @param {any} hap
 * @param {any} sensrCameraOptions
 * @param {any} log
 * @see {@link https://github.com/KhaosT/HAP-NodeJS/wiki/IP-Camera|HAP-NodeJS IP Camera Reference}
 * @see {@link https://github.com/KhaosT/homebridge-camera-ffmpeg/|Homebridge Camera FFMPEG}
 * @see {@link https://ffmpeg.org/ffmpeg.html|FFMPEG Reference}
 */
function SensrCamera(hap, sensrCameraOptions, log) {
    var self = this;
    self.name = sensrCameraOptions.name || 'NAME NOT SPECIFIED';
    debug = require('debug')('Camera:Sensr:CameraAccessory:' + self.name);
    
    self.HomeBridgeHap = hap;
    self.options = sensrCameraOptions;
    self.log = debug || log || console.log;

    self.HomebridgeHapUuid = hap.uuid;
    self.HomebridgeHapService = hap.Service;
    self.HomebridgeHapCharacteristic = hap.Characteristic;
    self.HomebridgeHapStreamController = hap.StreamController;

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

    request({ url: self.options.still }, function (err, response, buffer) {
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
                var width = 1280;
                var height = 720;
                var fps = 30;
                var bitrate = 300;

                var videoInfo = request.video;
                if (videoInfo) {
                    width = videoInfo.width;
                    height = videoInfo.height;

                    var expectedFPS = videoInfo.fps;
                    if (expectedFPS < fps) {
                        fps = expectedFPS;
                    }

                    bitrate = videoInfo.max_bit_rate;
                }

                var targetAddress = sessionInfo.address;
                var targetVideoPort = sessionInfo.video_port;
                var videoKey = sessionInfo.video_srtp;

                var ffmpegCommand = '-i ' + self.options.still + ' -threads 0 -vcodec libx264 -an -pix_fmt yuv420p -r ' + fps + ' -f rawvideo -tune zerolatency -vf scale=' + width + ':' + height + ' -b:v ' + bitrate + 'k -bufsize ' + bitrate + 'k -payload_type 99 -ssrc 1 -f rtp -srtp_out_suite AES_CM_128_HMAC_SHA1_80 -srtp_out_params ' + videoKey.toString('base64') + ' srtp://' + targetAddress + ':' + targetVideoPort + '?rtcpport=' + targetVideoPort + '&localrtcpport=' + targetVideoPort + '&pkt_size=1378';
                self.log(ffmpegCommand);
                var ffmpeg = spawn('ffmpeg', ffmpegCommand.split(' '), { env: process.env });
                self.ongoingSessions[sessionIdentifier] = ffmpeg;
            }

            delete this.pendingSessions[sessionIdentifier];
        } else if (requestType === 'stop') {
            self.log('Stopping Stream.', sessionId, sessionIdentifier);
            var ffmpegProcess = this.ongoingSessions[sessionIdentifier];
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
            codecs: [
                {
                    type: "OPUS",
                    samplerate: 16
                }
            ]
        }
    };

    for (var i = 0; i < maxStreams; i++) {
        var streamController = new self.HomebridgeHapStreamController(i, options, self);

        self.services.push(streamController.service);
        self.streamControllers.push(streamController);
    }

    self.log('Created Camera Stream Controller(s)');
};

module.exports = SensrCamera;