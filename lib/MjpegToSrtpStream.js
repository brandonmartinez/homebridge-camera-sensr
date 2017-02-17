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
        !streamOptions.destinationKey ||
        !streamOptions.width ||
        !streamOptions.height) {
        throw new Error('streamOptions must be specified with a sourceUrl, destinationUrl, destinationKey, width, and height.');
    }

    var self = this;
    self.sourceUrl = streamOptions.sourceUrl;
    //self.sourceUrl = 'http://192.168.123.181/video.cgi';
    self.destinationUrl = streamOptions.destinationUrl;
    self.destinationKey = streamOptions.destinationKey;
    self.width = streamOptions.width;
    self.height = streamOptions.height;
    self.fps = streamOptions.fps || 3;
    self.bitrate = streamOptions.bitrate || 300;

    return self.startStream();
}

MjpegToSrtpStream.prototype.startStream = function () {
    var self = this,
        ffmpegCommand = '';

    // GLOBAL OPTIONS
    ////////////////////////////////////////////
    ffmpegCommand += ' -loglevel debug';
    ffmpegCommand += ' -stats';

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
    ffmpeg += ' -crf 18';
    // set a frame rate
    ffmpeg += ' -r ' + self.fps;
    // set the pixel format
    //ffmpeg += ' -pix_fmt yuv420p';
    // set a scaling
    ffmpegCommand += ' -vf scale=' + self.width + ':' + self.height;
    // there is no audio feed available
    ffmpegCommand += ' -an';
    // Bit rate and buffer
    ffmpegCommand += ' -b:v '+ self.bitrate +'k';
    ffmpegCommand += ' -bufsize '+ self.bitrate +'k';
    // there is no audio feed available
    ffmpegCommand += ' -ssrc 1 -payload_type 99';
    // setting destination output format to RTP
    ffmpegCommand += ' -f rtp';
    // specify the SRTP version
    ffmpegCommand += ' -srtp_out_suite AES_CM_128_HMAC_SHA1_80';
    // specify the SRTP key and destination for output
    ffmpegCommand += ' -srtp_out_params ' + self.destinationKey;
    // and now the output file
    ffmpegCommand +=' ' + self.destinationUrl;

    debug(ffmpegCommand);

    var ffmpeg = spawn('ffmpeg', ffmpegCommand.split(' '), {
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