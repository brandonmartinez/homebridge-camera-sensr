# homebridge-camera-sensr
A homebridge plugin to access your IP cameras available in your Sensr.net account.

## Sample Configuration

    "platforms": [{
        "platform": "Camera-Sensr",
        "accounts": [{
            "description": "Any description, not really used",
            "token": "token from process outlined below"
        }]
    }]

## Getting an OAUTH2 Token

Follow the steps in the [Sensr.net guide](http://yacc.github.io/sensrapi-tutorials/) to get a token.

* _Application (client) name:_ put something along the lines of "My Family Homebridge".
* _Main URL:_ https://github.com/nfarina/homebridge
* _Callback URL:_ https://github.com/nfarina/homebridge