'use strict';

var spawn = require('child_process').spawn,
    debug = require('debug')('Camera:Sensr:MjpegToSrtpStream');

/**
 * Stream an MJPEG source to an SRTP destination
 * 
 * @param {any} streamOptions
 * @see {@link https://github.com/KhaosT/HAP-NodeJS/wiki/IP-Camera|HAP-NodeJS IP Camera Reference}
 * @see {@link https://github.com/KhaosT/homebridge-camera-ffmpeg/|Homebridge Camera FFMPEG}
 * @see {@link https://ffmpeg.org/ffmpeg.html|FFMPEG Reference}
 */
function MjpegToSrtpStream(streamOptions) {
    if (!streamOptions ||
        !streamOptions.sourceUrl ||
        !streamOptions.destinationUrl ||
        !streamOptions.destinationKey) {
        throw new Error('streamOptions must be specified with a sourceUrl, destinationUrl, and destinationKey.');
    }

    var self = this;
    self.mergeOptions(streamOptions);

    return self.startStream();
}

MjpegToSrtpStream.prototype.mergeOptions = function (streamOptions) {
    var self = this,
        defaultStreamOptions = {
            width: 640,
            height: 480,
            fps: 3,
            bitrate: 300,
            ssrc: 1,
            pixelFormat: 'yuvj420p'
        };

    // Cleanup first
    ////////////////////////////

    // we never want this value
    delete streamOptions.ssrc;

    // Merge options
    ////////////////////////////
    for (var k in streamOptions) {
        if (streamOptions.hasOwnProperty(k) && typeof streamOptions[k] !== 'undefined') {
            defaultStreamOptions[k] = streamOptions[k];
        }
    }

    // add to our model
    for (var o in defaultStreamOptions) {
        if (defaultStreamOptions.hasOwnProperty(o)) {
            self[o] = defaultStreamOptions[o];
        }
    }
};

MjpegToSrtpStream.prototype.startStream = function () {
    var self = this,
        ffmpegCommand = '';

    // GLOBAL OPTIONS
    ////////////////////////////////////////////
    //ffmpegCommand += ' -loglevel debug';
    //ffmpegCommand += ' -stats';

    // INPUT OPTIONS
    ////////////////////////////////////////////
    // set the input format explicitly
    ffmpegCommand += ' -f mjpeg';
    // Since we're using MJPEG, treat this as a "screen grabber"
    ffmpegCommand += ' -re';
    // starting with the input MJPEG URL
    ffmpegCommand += ' -i ' + self.sourceUrl;

    // OUTPUT OPTIONS
    ////////////////////////////////////////////
    // set the output codec
    ffmpegCommand += ' -c:v libx264';
    // set number of threads
    ffmpegCommand += ' -threads 0';
    // set the preset and tuning
    ffmpegCommand += ' -tune zerolatency';
    // set the constant rate (higher is lower quality)
    ffmpegCommand += ' -crf 18';
    // set a frame rate (DISABLED FOR NOW, USE NATIVE)
    // ffmpegCommand += ' -r ' + self.fps;
    // setting a video filter to scale to our destination size and override the pixel format for compatibility
    ffmpegCommand += ' -vf scale=' + self.width + ':' + self.height + ',format=' + self.pixelFormat;
    // set the pixel format
    ffmpegCommand += ' -pix_fmt ' + self.pixelFormat;
    // there is no audio feed available
    ffmpegCommand += ' -an';
    // Bit rate and buffer (DISABLED FOR NOW, USE NATIVE)
    // ffmpegCommand += ' -b:v ' + self.bitrate + 'k';
    // ffmpegCommand += ' -bufsize ' + self.bitrate + 'k';
    // some defaults for RTP
    ffmpegCommand += ' -ssrc ' + self.ssrc;
    ffmpegCommand += ' -payload_type 99';
    // setting destination output format to RTP
    ffmpegCommand += ' -f rtp';
    // specify the SRTP version
    ffmpegCommand += ' -srtp_out_suite AES_CM_128_HMAC_SHA1_80';
    // specify the SRTP key and destination for output
    ffmpegCommand += ' -srtp_out_params ' + self.destinationKey;
    // and now the output file
    ffmpegCommand += ' ' + self.destinationUrl;

    debug(ffmpegCommand);

    var ffmpegParameters = ffmpegCommand.trim().split(' '),
        ffmpeg = spawn('ffmpeg', ffmpegParameters, {
            env: process.env
        });

    ffmpeg.stdout.on('data', debug);
    ffmpeg.stderr.setEncoding('utf8');
    ffmpeg.stderr.on('data', debug);
    ffmpeg.on('err', debug);
    ffmpeg.on('close', function (code) {
        debug('FFMPEG exiting with code ' + code);
    });

    return ffmpeg;
};


module.exports = MjpegToSrtpStream;