let SPOTIFY_API;
let RECENT_SPOTIFY_PLAYBACK_DEVICE_ID;
let RECENT_SPOTIFY_SHUFFLED_TRACKS = [];
let SHUFFLE_MAX_BATCH_SAMPLE_SIZE = 50;
const TEMPORARY_SHUFFLED_PLAYLIST_NAME = 'True Shuffle Playlist';
const TEMPORARY_SHUFFLED_PLAYLIST_DESCRIPTION = `An Automatically Generated Playlist By True Shuffle from ${location.origin}`;

/**
 * Begins the process of shuffling and playing music based on UI selected playlist/device.
 */
async function shuffle_and_play() {
    // Retrieve the selected playlist and device
    const device_id = document.getElementById('choose_device').value;
    const playlist_id = document.getElementById('choose_playlist').value;

    // Retrieve the songs from the selected playlist
    let songs;
    try {
        ui_render_play_button('Retrieving Songs...', false);
        songs = await SPOTIFY_API.get_playlist_tracks(playlist_id, {
            on_progress: (progress, total) => {
                // Update the UI to display progress of network fetches
                ui_render_play_button(`Retrieving Songs... [${progress} / ${total}]`, false);
            },
        });

        // Filter the retrieved songs to only include songs that are not local
        songs = songs.filter((song) => !song.local);
    } catch (error) {
        log('ERROR', 'Failed to retrieve Spotify profile.');
        alert('Failed to retrieve songs from Spotify. Refresh the page to try again.');
        return console.log(error);
    }

    // Shuffle the songs array with a batch shuffle which batches with size up to 25 songs each batch
    ui_render_play_button('Shuffling Songs...', false);
    const size = Math.max(SHUFFLE_MAX_BATCH_SAMPLE_SIZE, Math.round(songs.length / 10));
    const shuffled = songs.length <= 10 ? swap_shuffle(songs) : batch_swap_shuffle(songs, size);
    const results = get_spread_batch(shuffled, 100, size);
    const uris = results.map(({ uri }) => uri);

    // Store the shuffled results in a global variable for later use
    RECENT_SPOTIFY_SHUFFLED_TRACKS = results;

    // Safely determine if the user is a Premium user by disabling shuffle
    let is_premium;
    try {
        ui_render_play_button('Preparing Player...', false);
        is_premium = await SPOTIFY_API.set_playback_shuffle(device_id, false);
    } catch (error) {
        log('ERROR', 'Failed to set playback shuffle to disabled.');
        alert('Failed to disable playback shuffle in Spotify player.');
        return console.log(error);
    }

    // Spotify Premium User: Start playback with our shuffled results song uris
    if (is_premium) {
        try {
            // Play the shuffled tracks in the selected device player
            ui_render_play_button('Starting Playback...', false);
            await SPOTIFY_API.play_tracks(device_id, {
                uris,
            });

            // Store the device id for later use
            RECENT_SPOTIFY_PLAYBACK_DEVICE_ID = device_id;
        } catch (error) {
            log('ERROR', 'Failed to play shuffled tracks in selected device Spotify player.');
            alert('Failed to play shuffled tracks in selected device Spotify player.');
            return console.log(error);
        }
    } else {
        // Spotify Free User: Create a temporary playlist to store the shuffled results song uris
        const playlists = await SPOTIFY_API.get_playlists();
        let temporary =
            playlists[Object.keys(playlists).find((id) => playlists[id].name === TEMPORARY_SHUFFLED_PLAYLIST_NAME)];

        // Create the temporary shuffle results playlist if it does not exist yet
        if (!temporary)
            try {
                ui_render_play_button('Creating Temporary Playlist...', false);
                temporary = await SPOTIFY_API.create_playlist(TEMPORARY_SHUFFLED_PLAYLIST_NAME, {
                    description: TEMPORARY_SHUFFLED_PLAYLIST_DESCRIPTION,
                    public: true,
                });
            } catch (error) {
                log('ERROR', 'Failed to create temporary shuffle results playlist.');
                alert('Failed to create temporary shuffle results playlist.');
                return console.log(error);
            }

        // Set the shuffled tracks into the temporary playlist
        try {
            ui_render_play_button('Updating Temporary Playlist...', false);
            await SPOTIFY_API.set_playlist_tracks(temporary.id, uris);
        } catch (error) {
            log('ERROR', 'Failed to store shuffled tracks into temporary playlist.');
            alert('Failed to store shuffled tracks into temporary playlist.');
            return console.log(error);
        }

        // Render the application message to alert the user
        ui_render_application_message(`Your shuffled music has been placed inside a
        <strong>temporary</strong> playlist called
        <strong>${TEMPORARY_SHUFFLED_PLAYLIST_NAME}</strong>.`);
    }

    // Render the queued tracks in the UI
    ui_render_queued_songs(results, is_premium);

    // Bind the listeners to the UI elements that are responsible for playing music from a certain playable track
    if (is_premium) bind_playables_listeners();

    // Enable the UI button to allow the user to reshuffle and play music
    ui_render_play_button('Reshuffle & Play', true);
}

// Tracks the listeners that are bound to the UI elements that are responsible for playing music from a certain playable track
const PLAYABLE_LISTENERS = new Map();

/**
 * Binds the listeners to the UI elements that are responsible for playing music from a certain playable track.
 */
function bind_playables_listeners() {
    // Purge old listeners from previous bound playable elements
    for (const { playable, listener } of PLAYABLE_LISTENERS.values()) {
        playable.removeEventListener('click', listener);
    }
    PLAYABLE_LISTENERS.clear();

    // Retrieve all the playable elements
    const playables = document.querySelectorAll('.playable');
    for (let i = 0; i < playables.length; i++) {
        // Bind the listener to the playable element
        const playable = playables[i];
        const listener = async () => {
            // Add the muted class to all tracks up to the selected track and remove the muted class from all tracks after the selected track
            for (let j = 0; j < playables.length; j++) {
                const _playable = playables[j];
                if (j < i) {
                    _playable.classList.add('muted');
                } else {
                    _playable.classList.remove('muted');
                }
            }

            // Play music from the given track
            try {
                // Play the shuffled tracks in the selected device player
                const sliced = RECENT_SPOTIFY_SHUFFLED_TRACKS.slice(i);
                const uris = sliced.map(({ uri }) => uri);
                ui_render_play_button('Starting Playback...', false);
                await SPOTIFY_API.play_tracks(RECENT_SPOTIFY_PLAYBACK_DEVICE_ID, {
                    uris,
                });
            } catch (error) {
                log('ERROR', 'Failed to play tracks from the selected track in selected device Spotify player.');
                alert('Failed to play tracks from the selected track in selected device Spotify player.');
                return console.log(error);
            }
        };
        playable.addEventListener('click', listener);

        // Store the listener in the PLAYABLE_LISTENERS map
        PLAYABLE_LISTENERS.set(i, {
            playable,
            listener,
        });
    }
}

/**
 * Begins loading the application with the Spotify user access token.
 */
async function load_application() {
    // Hide the authentication UI & Display the loading UI
    log('APPLICATION', 'Loading application...');
    const loading_message = document.getElementById('loader_message');
    document.getElementById('loader_container').setAttribute('style', '');
    document.getElementById('auth_section').setAttribute('style', 'display: none;');

    // Initialize the Spotify API instance
    try {
        loading_message.innerText = 'Retrieving Your Spotify Profile';
        SPOTIFY_API = await SpotifyAPI(auth_get_access_token());
    } catch (error) {
        log('ERROR', 'Failed to retrieve Spotify profile.');
        loading_message.innerText = 'Failed to retrieve Spotify profile. Refresh the page to try again.';
        return console.log(error);
    }

    // Fetch the user's devices from Spotify
    try {
        loading_message.innerText = 'Retrieving Your Spotify Devices';
        const devices = await SPOTIFY_API.get_devices();

        // If the user has no devices, display an error message
        const identifiers = Object.keys(devices);
        if (identifiers.length === 0) throw 'No Available Devices Found. Please Open Spotify On Your Device(s).';

        // Render the devices in the UI selector
        document.getElementById('choose_device').innerHTML = identifiers
            .sort((a, b) => {
                const a_active_score = devices[a].is_active ? 1_000_000 : 0;
                const a_volume_score = devices[a].volume_percent;
                const b_active_score = devices[b].is_active ? 1_000_000 : 0;
                const b_volume_score = devices[b].volume_percent;

                // Sort by active device first, then by volume
                return b_active_score + b_volume_score - (a_active_score + a_volume_score);
            })
            .map((id) => {
                const device = devices[id];
                return `<option value="${device.id}">${device.name}</option>`;
            })
            .join('\n');
    } catch (error) {
        log('ERROR', 'Failed to retrieve Spotify devices.');
        loading_message.innerText =
            typeof error == 'string'
                ? error
                : 'Failed to retrieve any active Spotify devices for playback. Refresh the page to try again.';
        return console.log(error);
    }

    // Fetch the user's playlists from Spotify
    try {
        loading_message.innerText = 'Retrieving Your Spotify Playlists';
        const playlists = await SPOTIFY_API.get_playlists();

        // If the user has no playlists, display an error message
        const identifiers = Object.keys(playlists);
        if (playlists.length === 0) throw 'No Playlists Found. Please Create Or Like A Playlist On Spotify.';

        // Render the devices in the UI selector
        document.getElementById('choose_playlist').innerHTML = identifiers
            .sort((a, b) => {
                const a_total_tracks = playlists[a].tracks.total;
                const a_owned_by_me = playlists[a].owner.me ? 1_000_000 : 0;
                const b_total_tracks = playlists[b].tracks.total;
                const b_owned_by_me = playlists[b].owner.me ? 1_000_000 : 0;

                // Sort the playlists by decreasing number of tracks
                // Sort playlists owned by the user higher than other playlists
                return b_total_tracks + b_owned_by_me - (a_total_tracks + a_owned_by_me);
            })
            .map((id) => {
                const playlist = playlists[id];
                return `<option value="${playlist.id}">${
                    !playlist.owner.me ? `[${playlist.owner.display_name}] ` : ''
                }${clamp_string(playlist.name, 40)} - ${playlist.tracks.total} Songs</option>`;
            })
            .join('\n');
    } catch (error) {
        log('ERROR', 'Failed to retrieve Spotify playlists.');
        loading_message.innerText = 'Failed to retrieve Spotify playlists. Refresh the page to try again.';
        return console.log(error);
    }

    // Hide the loading UI & Display the application UI
    document.querySelector('.container').classList.add('authenticated');
    document.getElementById('application_section').setAttribute('style', '');
    document.getElementById('loader_container').setAttribute('style', 'display: none;');
}

window.addEventListener('load', () => {
    // Ensure localStorage is available else browser is unsupported
    log('STARTUP', 'Checking for local storage support...');
    if (!local_storage_supported()) return ui_render_connect_button('Unsupported Browser', false);

    // Attempt to parse hash parameters from spotify for oauth callback
    log('STARTUP', 'Parsing authentication connection parameters from Spotify...');
    auth_parse_connection_parameters();

    // Determine if a valid access token is available and load application
    if (auth_get_access_token()) return load_application();

    // If the user has recently connected their account with the application, automatically reconnect with Spotify
    if (auth_has_recently_connected()) {
        log('STARTUP', 'User has recently connected their account with the application, redirecting to reconnect...');
        auth_connect_spotify();
    }
});
