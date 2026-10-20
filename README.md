# companion-module-hifi-remote

A [Bitfocus Companion](https://bitfocus.io/companion) module for controlling network music players over your local network. Works with BluOS.

## Features

- Play, pause, stop, next and previous track
- Volume up/down in configurable dB steps, set a fixed volume, mute and unmute
- Shuffle and repeat (queue, track, off)
- Play any internet radio or audio stream by URL
- Instant updates: changes made in the BluOS app or on the player show up on your buttons straight away
- Feedbacks for the play state, mute, shuffle, repeat, active stream and playback source (stream, Spotify, Bluetooth)
- Variables for the volume, play state, track info, now playing lines and cover art
- Ready-made presets for transport, volume and shuffle/repeat buttons, plus a preset for each station in your own stream list

The module uses the player's built-in HTTP API (port 11000 by default, configurable in the connection settings), so you don't need an account or a cloud connection.

## Usage

Add a **HiFi Remote** connection in Companion and enter the hostname or IP address of your player. See [HELP.md](./companion/HELP.md) for all settings, actions, feedbacks and variables.

## Development

Requires Node.js 22 and Yarn 4 (via `corepack enable`).

```sh
yarn install
yarn format    # format the code with prettier
yarn test      # run the tests
yarn package   # build the module package (.tgz)
```

To test a local build, point Companion's _Developer modules path_ at the folder containing this repository.

## License

[MIT](./LICENSE)

## Privacy

This module does not collect, store or send any personal data. It only talks to the player address you configure, on your local network.

## Trademarks

BluOS is a trademark of Lenbrook Industries Limited. This is an independent community project. It works with BluOS but is not affiliated with, endorsed by or sponsored by Lenbrook.
