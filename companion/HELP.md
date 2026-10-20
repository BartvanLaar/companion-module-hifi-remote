## HiFi Remote

Control network music players from Companion over your local network. Works with BluOS. The module talks to the player's built-in HTTP API, so you don't need an account or a cloud connection.

### Configuration

| Setting                            | Description                                                                                                                                                                                                                            | Default      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Player Hostname or IP              | Hostname (e.g. `living.local`) or IP address of the player. A fixed IP / DHCP reservation is recommended. The module stays in a "bad config" state until this is set.                                                                  | _(required)_ |
| Player API Port                    | Port of the player's HTTP API. Only change this if you know your device uses a different port.                                                                                                                                         | `11000`      |
| Reconnect / Fallback Poll Interval | The player pushes status changes instantly, so this is only used to retry while the player is unreachable, or to poll players that don't support instant updates (at most every 30 seconds).                                           | `5`          |
| Volume increase/decrease step (dB) | How many dB the **Volume Up** / **Volume Down** actions change the volume per press.                                                                                                                                                   | `2`          |
| Stream presets                     | Your own stations as `Name=URL`, separated by `;`, e.g. `My Radio=https://radio.example/live; Jazz=https://jazz.example/stream`. Each one becomes a button under _Streams_ in the Presets tab. Invalid entries are skipped and logged. | _(empty)_    |

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
| Set Volume        | Sets the volume to a fixed level (0-100).                                                                                      |
| Toggle Mute       | Mutes when unmuted, unmutes otherwise.                                                                                         |
| Mute / Unmute     | Mutes or unmutes the player.                                                                                                   |
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
| Muted                        | The player is muted.                                                                                               |

### Variables

| Variable                         | Description                                                                                                                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$(hifi-remote:playbackSource)`  | The current playback source: `stream`, `spotify`, `bluetooth`, or the service name the player reports for other sources (e.g. `tunein`). Empty when unknown.                                                                 |
| `$(hifi-remote:playState)`       | The player state as reported by the player, e.g. `play`, `pause`, `stop` or `stream`.                                                                                                                                        |
| `$(hifi-remote:volume)`          | The volume (0-100), or `-1` when the player has a fixed volume.                                                                                                                                                              |
| `$(hifi-remote:muted)`           | `true` when the player is muted.                                                                                                                                                                                             |
| `$(hifi-remote:title)`           | The title of the current track.                                                                                                                                                                                              |
| `$(hifi-remote:artist)`          | The artist of the current track.                                                                                                                                                                                             |
| `$(hifi-remote:album)`           | The album of the current track.                                                                                                                                                                                              |
| `$(hifi-remote:nowPlayingLine1)` | First line of what is playing, as the player shows it (e.g. the track or station name). Use these three lines to show what is playing on a button: they also work for radio and inputs, which often have no artist or album. |
| `$(hifi-remote:nowPlayingLine2)` | Second line of what is playing.                                                                                                                                                                                              |
| `$(hifi-remote:nowPlayingLine3)` | Third line of what is playing.                                                                                                                                                                                               |
| `$(hifi-remote:artworkUrl)`      | The URL of the current cover art.                                                                                                                                                                                            |

If you renamed the connection, use its name instead of `hifi-remote`.

### Presets

Ready-made buttons are in the **Presets** tab under _Transport_, _Volume_, _Shuffle & Repeat_ and _Streams_. Buttons that show a state (play, mute, shuffle, repeat, the active stream) turn green when it is active. _Streams_ contains a button for each station in the **Stream presets** setting, and is empty until you add some.

### Tips

- **Instant updates:** changes made elsewhere (the BluOS app, a remote, the player itself) show up on your buttons straight away.
- **Radio buttons:** put a **Set Stream** action on a button with the station's stream URL, then add the **Active Stream** feedback with the same URL to highlight the station that is playing.
- **Multiple players:** add one module instance per player.
- **Grouped players:** grouped players report the status of the primary player of the group. Control the group through the primary player.
- **Resume after Stop:** the player can only resume from pause. After **Stop**, start something new instead, e.g. with **Set Stream** or from the BluOS app.
- **Connection status:** the connection shows _Connection failure_ while the player is unreachable and recovers on its own once the player is back. While it is unreachable, buttons show no active state and the variables are empty, so they never show an outdated state.
- **Troubleshooting:** if buttons do nothing, open `http://<player-ip>:11000/Status` in a browser on the Companion machine. If that doesn't return XML, Companion can't reach the player. Check the IP address, the network/VLAN and any firewall.

### Privacy

This module does not collect, store or send any personal data. It only talks to the player address you configure, on your local network. Nothing is sent to the author or any third party.

### Trademarks

BluOS is a trademark of Lenbrook Industries Limited. This module is an independent community project. It works with BluOS but is not affiliated with, endorsed by or sponsored by Lenbrook.
