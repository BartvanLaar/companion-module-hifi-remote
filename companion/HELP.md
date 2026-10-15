## HiFi Remote

Control network music players from Companion over your local network. Works with BluOS. The module talks to the player's built-in HTTP API, so you don't need an account or a cloud connection.

### Configuration

| Setting                            | Description                                                                                                                                                           | Default      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Player Hostname or IP              | Hostname (e.g. `living.local`) or IP address of the player. A fixed IP / DHCP reservation is recommended. The module stays in a "bad config" state until this is set. | _(required)_ |
| Player API Port                    | Port of the player's HTTP API. Only change this if you know your device uses a different port.                                                                        | `11000`      |
| Status Poll Interval (seconds)     | How often the module asks the player for its current state (playing, shuffle, repeat, source).                                                                        | `5`          |
| Volume increase/decrease step (dB) | How many dB the **Volume Up** / **Volume Down** actions change the volume per press.                                                                                  | `2`          |

You can find the player's IP address in the player's app under _Settings → Diagnostics_ or in your router's client list.

### Actions

| Action            | Description                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Toggle Play/Pause | Pauses when playing, resumes otherwise.                                                                                        |
| Resume            | Resumes playback.                                                                                                              |
| Pause             | Pauses playback.                                                                                                               |
| Stop playback     | Stops playback.                                                                                                                |
| Next Track        | Skips to the next track.                                                                                                       |
| Previous Track    | Goes back to the previous track.                                                                                               |
| Volume Up / Down  | Changes the volume by the configured dB step.                                                                                  |
| Toggle Shuffle    | Turns shuffle on or off.                                                                                                       |
| Toggle Repeat     | Cycles through repeat queue → repeat track → repeat off.                                                                       |
| Set Repeat Queue  | Repeats the whole queue.                                                                                                       |
| Set Repeat Track  | Repeats the current track.                                                                                                     |
| Disable Repeat    | Turns repeat off.                                                                                                              |
| Set Stream        | Plays an internet radio or audio stream from the given URL (must start with `http://` or `https://`). Variables are supported. |

### Feedbacks

| Feedback                     | Active when…                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Playback State (Playing)     | The player is playing.                                                                                             |
| Shuffle Enabled              | Shuffle is on.                                                                                                     |
| Repeat Enabled               | Any repeat mode is on.                                                                                             |
| Repeat Current Track Enabled | Repeat track is on.                                                                                                |
| Repeat Current Queue Enabled | Repeat queue is on.                                                                                                |
| Active Stream                | The given stream URL is the one last started with **Set Stream**. Use the same URL in the action and the feedback. |
| Stream Enabled               | The current source is an internet stream.                                                                          |
| Spotify Enabled              | The current source is Spotify Connect.                                                                             |
| Bluetooth Enabled            | The current source is Bluetooth.                                                                                   |

### Variables

| Variable                        | Description                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `$(hifi-remote:playbackSource)` | The current playback source: `stream`, `spotify`, `bluetooth`, or the service name the player reports for other sources (e.g. `tunein`). Empty when unknown. |

### Presets

Ready-made buttons are in the **Presets** tab under _Transport_, _Volume_ and _Shuffle & Repeat_. Buttons that show a state (play, shuffle, repeat) turn green when it is active.

### Tips

- **Radio buttons:** put a **Set Stream** action on a button with the station's stream URL, then add the **Active Stream** feedback with the same URL to highlight the station that is playing.
- **Multiple players:** add one module instance per player.
- **Connection status:** the connection shows _Connection failure_ while the player is unreachable and recovers on its own once the player is back.
- **Troubleshooting:** if buttons do nothing, open `http://<player-ip>:11000/Status` in a browser on the Companion machine. If that doesn't return XML, Companion can't reach the player. Check the IP address, the network/VLAN and any firewall.

### Privacy

This module does not collect, store or send any personal data. It only talks to the player address you configure, on your local network. Nothing is sent to the author or any third party.

### Trademarks

BluOS is a trademark of Lenbrook Industries Limited. This module is an independent community project. It works with BluOS but is not affiliated with, endorsed by or sponsored by Lenbrook.
