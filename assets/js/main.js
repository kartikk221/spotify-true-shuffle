let SPOTIFY_API; // Globally stores the Spotify API instance
let SPOTIFY_USER_IS_PREMIUM; // Caches whether the Spotify user is a Premium user or not
let SHUFFLE_MAX_BATCH_SAMPLE_SIZE = 50; // The sample size for batch shuffling of tracks
let RECENT_SPOTIFY_PLAYBACK_DEVICE_ID; // Caches the device id of the Spotify player that most recently played shuffled tracks
let RECENT_SPOTIFY_PLAYBACK_PLAYLIST_ID; // Caches the playlist id of the Spotify player that most recently played shuffled tracks
let RECENT_SPOTIFY_SHUFFLED_TRACKS = []; // Caches the most recently shuffled tracks from Spotify
const ARE_CREATED_PLAYLISTS_PUBLIC = false; // Determines whether created playlists are public or not by True Shuffle

let TEMPORARY_SHUFFLED_PLAYLIST; // Caches the temporary shuffled playlist object to store free user shuffled tracks
const TEMPORARY_SHUFFLED_PLAYLIST_NAME = 'True Shuffle Playlist'; // Default name for the temporary shuffled playlist
const TEMPORARY_SHUFFLED_PLAYLIST_DESCRIPTION = `An Automatically Generated Playlist By True Shuffle from ${location.origin}`; // Default description for the temporary shuffled playlist

// UI Buttons active text tags
const UI_BUTTONS_TAGS = {
    PLAY: 'Reshuffle & Play',
    SAVE: 'Save To New Playlist',
};

/**
 * Begins the process of shuffling and playing music based on UI selected playlist/device.
 */
async function shuffle_and_play() {
    // Retrieve the selected playlist and device
    const device_id = document.getElementById('choose_device').value;
    const playlist_id = document.getElementById('choose_playlist').value;

    // Retrieve if alt-shuffle is enabled (no duplicant adders back-to-back for shared playlists)
    const alt_shuffle = document.getElementById('alt-shuffle').checked;

    // Clear the result message
    ui_render_application_message('');

    // Retrieve the songs from the selected playlist
    let songs;
    try {
        ui_render_play_button('Retrieving Songs...', false);
        if (playlist_id === SPOTIFY_API._constants.LIKED_SONGS_PLAYLIST_ID) {
            songs = await SPOTIFY_API.get_liked_tracks({
                on_progress: (progress, total) => {
                    // Update the UI to display progress of network fetches
                    ui_render_play_button(`Retrieving Songs... [${progress} / ${total}]`, false);
                },
            });
        } else {
            songs = await SPOTIFY_API.get_playlist_tracks(playlist_id, {
                on_progress: (progress, total) => {
                    // Update the UI to display progress of network fetches
                    ui_render_play_button(`Retrieving Songs... [${progress} / ${total}]`, false);
                },
            });
        }

        // Filter the retrieved songs to only include songs that are not local
        songs = songs.filter((song) => !song.local);

        // If there no songs to shuffle, then alert the user and return
        if (songs.length === 0) {
            log('ERROR', 'No songs to shuffle.');
            ui_render_play_button(UI_BUTTONS_TAGS.PLAY, true);
            alert('No songs to shuffle. Please select a different playlist.');
            return;
        }
    } catch (error) {
        log('ERROR', 'Failed to retrieve Spotify profile.');
        alert('Failed to retrieve songs from Spotify. Refresh the page to try again.');
        return console.log(error);
    }

    // Shuffle the songs array with a batch shuffle which batches with size up to 25 songs each batch
    ui_render_play_button('Shuffling Songs...', false);
    const size = Math.max(SHUFFLE_MAX_BATCH_SAMPLE_SIZE, Math.ceil(songs.length / 10));
    const shuffled = songs.length <= 10 ? swap_shuffle(songs) : batch_swap_shuffle(songs, size);

    let results;
	
    if (alt_shuffle) 
    {
        results = get_spread_batch_no_adjacent(shuffled, 100, size);
    } else {
        results = get_spread_batch(shuffled, 100, size);
    }

	//results.forEach(element => console.log(element.added_by_id));
	
    const uris = results.map(({ uri }) => uri);

    // Store the shuffled results in a global variable for later use
    RECENT_SPOTIFY_SHUFFLED_TRACKS = results;

    // Safely determine if the user is a Premium user by disabling shuffle
    let is_premium = SPOTIFY_USER_IS_PREMIUM;
    if (is_premium === undefined) {
        try {
            ui_render_play_button('Preparing Player...', false);
            is_premium = await SPOTIFY_API.set_playback_shuffle(device_id, false);
        } catch (error) {
            log('ERROR', 'Failed to set playback shuffle to disabled.');
            alert('Failed to disable playback shuffle in Spotify player.');
            return console.log(error);
        }
    }

    // Cache the user's premium status for later use
    SPOTIFY_USER_IS_PREMIUM = is_premium;

    // Cache the selected playlist id for later use
    RECENT_SPOTIFY_PLAYBACK_PLAYLIST_ID = playlist_id;

    // Spotify Premium User Scenario: Start playback with our shuffled results song uris
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
        // Spotify Free User Scenario: Create a temporary playlist to store the shuffled results song uris
        const playlists = await SPOTIFY_API.get_playlists();
        let temporary =
            TEMPORARY_SHUFFLED_PLAYLIST ||
            playlists[Object.keys(playlists).find((id) => playlists[id].name === TEMPORARY_SHUFFLED_PLAYLIST_NAME)];

        // Create the temporary shuffle results playlist if it does not exist yet
        if (!temporary)
            try {
                ui_render_play_button('Creating Temporary Playlist...', false);
                temporary = await SPOTIFY_API.create_playlist(TEMPORARY_SHUFFLED_PLAYLIST_NAME, {
                    description: TEMPORARY_SHUFFLED_PLAYLIST_DESCRIPTION,
                    public: ARE_CREATED_PLAYLISTS_PUBLIC,
                });
            } catch (error) {
                log('ERROR', 'Failed to create temporary shuffle results playlist.');
                alert('Failed to create temporary shuffle results playlist.');
                return console.log(error);
            }

        // Cache the temporary playlist for later use
        TEMPORARY_SHUFFLED_PLAYLIST = temporary;

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
        ui_render_application_message(`Your shuffled music has been placed inside of a playlist called
        <strong>${TEMPORARY_SHUFFLED_PLAYLIST_NAME}</strong>.`);
    }

    // Render the queued tracks in the UI
    ui_render_queued_songs(results, is_premium);

    // Ensure the user is a premium user to unlock certain advanced features
    if (is_premium) {
        // Bind the listeners to the UI elements that are responsible for playing music from a certain playable track
        bind_playables_listeners();

        // Display the song playback message
        document.querySelector('#song-playback-message').setAttribute('style', 'display: block; text-align: center;');
    }

    // Enable the UI button to allow the user to reshuffle and play music
    ui_render_play_button(UI_BUTTONS_TAGS.PLAY, true);

    // Enable the UI button to allow the user to save results to a new playlist
    ui_render_save_button(UI_BUTTONS_TAGS.SAVE, true);
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

            // Enable the UI button to allow the user to reshuffle and play music
            ui_render_play_button(UI_BUTTONS_TAGS.PLAY, true);
        };

        // Bind the listener to the playable element
        playable.addEventListener('click', listener);

        // Store the listener in the PLAYABLE_LISTENERS map
        PLAYABLE_LISTENERS.set(i, {
            playable,
            listener,
        });
    }
}

/**
 * Saves the most recently shuffled tracks to a new playlist.
 */
async function save_to_playlist() {
    // Retrieve the shuffled tracks uris from the most recent shuffle
    const uris = RECENT_SPOTIFY_SHUFFLED_TRACKS.map(({ uri }) => uri);

    // Retrieve the recently shuffled playlist
    const playlists = await SPOTIFY_API.get_playlists();
    const recent_playlist = playlists[RECENT_SPOTIFY_PLAYBACK_PLAYLIST_ID];

    // Come up with a concise yet unique name for the shuffle results playlist
    const date = new Date();
    const day = date.getDate();
    const hours = date.getHours() % 12 || 12;
    const am_pm = date.getHours() >= 12 ? 'PM' : 'AM';
    const minutes = date.getMinutes();
    const month = MONTH_NAMES[date.getMonth()];
    const day_prefix = get_month_date_prefix(day);
    const name = `Shuffle Results From ${month.substring(0, 3)} ${day}${day_prefix}, ${hours}:${minutes} ${am_pm}`;

    // Create the shuffle results playlist
    let playlist;
    try {
        ui_render_save_button('Creating Playlist...', false);
        playlist = await SPOTIFY_API.create_playlist(name, {
            description: `True Shuffle generated results from the "${recent_playlist.name}" playlist with over ${recent_playlist.tracks.total} songs.`,
            public: ARE_CREATED_PLAYLISTS_PUBLIC,
        });
    } catch (error) {
        ui_render_save_button(UI_BUTTONS_TAGS.SAVE, true);
        log('ERROR', 'Failed to create the shuffle results playlist.');
        alert('Failed to create the shuffle results playlist.');
        return console.log(error);
    }

    // Set the shuffled tracks into the playlist
    try {
        ui_render_save_button('Updating Playlist...', false);
        await SPOTIFY_API.set_playlist_tracks(playlist.id, uris);
    } catch (error) {
        ui_render_save_button(UI_BUTTONS_TAGS.SAVE, true);
        log('ERROR', 'Failed to store shuffled tracks into the playlist.');
        alert('Failed to store shuffled tracks into the playlist.');
        return console.log(error);
    }

    // Disable the UI button after the playlist has been successfully created
    ui_render_save_button('', false, false);

    // Render the application message to alert the user
    ui_render_application_message(`Your shuffled music has been placed inside a new playlist called<br>
    <strong>${name}</strong>.`);
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
    let profile;
    try {
        loading_message.innerText = 'Retrieving Your Spotify Profile';
        SPOTIFY_API = await SpotifyAPI(auth_get_access_token());
        profile = await SPOTIFY_API.get_profile(); // This should be cached in the SpotifyAPI instance already
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
        // Retrieve the user's playlists along with the total number of liked songs
        loading_message.innerText = 'Retrieving Your Spotify Playlists';
        const [playlists, total_liked_songs] = await Promise.all([
            SPOTIFY_API.get_playlists(),
            SPOTIFY_API.get_liked_tracks({ count: true }),
        ]);

        // Create a dummy playlist for the user's liked songs
        playlists[SPOTIFY_API._constants.LIKED_SONGS_PLAYLIST_ID] = {
            id: SPOTIFY_API._constants.LIKED_SONGS_PLAYLIST_ID,
            type: 'playlist',
            name: 'Your Music / Liked Songs',
            description: 'The songs you liked on Spotify.',
            snapshot_id: total_liked_songs.toString(), // Use the total number of liked songs as the snapshot ID as we don't have a real snapshot ID for the liked songs playlist
            tracks: {
                total: total_liked_songs,
            },
            owner: {
                me: true,
            },
        };

        // If the user has no playlists, display an error message
        const identifiers = Object.keys(playlists);
        if (identifiers.length === 0) throw 'No Playlists Found. Please Create Or Like A Playlist On Spotify.';

        // Sort the playlist identifiers based on personalization factors
        identifiers.sort((a, b) => {
            const a_total_tracks = playlists[a].tracks.total;
            const a_owned_by_me = playlists[a].owner.me ? 1_000_000 : 0;
            const b_total_tracks = playlists[b].tracks.total;
            const b_owned_by_me = playlists[b].owner.me ? 1_000_000 : 0;
            const a_is_liked_songs = a === SPOTIFY_API._constants.LIKED_SONGS_PLAYLIST_ID ? 100_000_000 : 0;
            const b_is_liked_songs = b === SPOTIFY_API._constants.LIKED_SONGS_PLAYLIST_ID ? 100_000_000 : 0;

            // Sort the playlists by decreasing number of tracks
            // Sort playlists owned by the user higher than other playlists
            return (
                b_total_tracks + b_owned_by_me + b_is_liked_songs - (a_total_tracks + a_owned_by_me + a_is_liked_songs)
            );
        });

        // Insert empty spacers between the liked playlist, user's playlists, and followed playlists
        for (let i = 0; i < identifiers.length; i++) {
            // Ensure the current identifier is not a spacer
            if (identifiers[i]) {
                const current = playlists[identifiers[i]];
                const next = playlists[identifiers[i + 1]];

                // Insert a spacer if this is the liked songs playlist
                if (current.id === SPOTIFY_API._constants.LIKED_SONGS_PLAYLIST_ID) identifiers.splice(i + 1, 0, '');

                // Insert a spacer if this is a user playlist and the next playlist is not a user playlist
                if (current.owner.me && (!next || !next.owner.me)) identifiers.splice(i + 1, 0, '');
            }
        }

        // Render the playlist identifiers to HTML for the UI
        const rendered = identifiers.map((id) => {
            // If there is no ID, render an empty spacer
            if (!id) return '<option value="spacer" disabled>    </option>';

            // Render the playlist as an option in the UI selector
            const playlist = playlists[id];
            const playlist_songs = playlist.tracks.total;
            const playlist_name = clamp_string(playlist.name || playlist.id || 'Unknown', 25);
            const playlist_author_name = clamp_string(
                playlist.owner.display_name || playlist.owner.id || 'Unknown',
                25
            );
            const playlist_owned_by_me = playlist.owner.me === true;
            return `<option value="${playlist.id}">${playlist_name} - ${playlist_songs} Songs ${
                playlist_owned_by_me ? '(By You)' : `(By ${playlist_author_name})`
            }</option>`;
        });

        // Render the devices in the UI selector
        document.getElementById('choose_playlist').innerHTML = rendered.join('\n');
    } catch (error) {
        log('ERROR', 'Failed to retrieve Spotify playlists.');
        loading_message.innerText = 'Failed to retrieve Spotify playlists. Refresh the page to try again.';
        return console.log(error);
    }

    // Update the landing title with a more personalized message
    document.querySelector('.landing-title').innerText = `Welcome, ${profile.display_name}!`;

    // Hide the loading UI & Display the application UI
    document.querySelector('.container').classList.add('authenticated');
    document.getElementById('application_section').setAttribute('style', '');
    document.getElementById('loader_container').setAttribute('style', 'display: none;');
}

window.addEventListener('load', async () => {
    // Ensure localStorage is available else browser is unsupported
    log('STARTUP', 'Checking for local storage support...');
    if (!local_storage_supported()) return ui_render_connect_button('Unsupported Browser', false);

    // Attempt to parse hash parameters from spotify for oauth callback
    log('STARTUP', 'Parsing authentication connection parameters from Spotify...');
    await auth_parse_connection_parameters();

    // Determine if a valid access token is available and load application
    if (auth_get_access_token()) return load_application();

    // If the user has recently connected their account with the application, automatically reconnect with Spotify
    if (auth_has_recently_connected()) {
        log('STARTUP', 'User has recently connected their account with the application, redirecting to reconnect...');
        await auth_connect_spotify();
    }
});
