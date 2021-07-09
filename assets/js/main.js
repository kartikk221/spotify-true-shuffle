const spotify_client_id = '0e188cfad9f3470ca424b84c2dc532df';
const randomHex = (size) =>
    [...Array(size)]
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join('');

function has_local_storage() {
    try {
        localStorage.setItem('ls_test', 'true');
        localStorage.removeItem('ls_test');
        return true;
    } catch (e) {
        return false;
    }
}

function handle_auth_callback() {
    // Ensure hash is from Spotify
    if (location.hash.indexOf('#access_token=') == -1)
        return (location.hash = '');

    // Parse hash parameters
    let payload = {};
    location.hash
        .replace('#', '')
        .split('&')
        .forEach((chunk) => {
            chunk = chunk.split('=');
            if (chunk.length == 2) {
                payload[chunk[0]] = decodeURIComponent(chunk[1]);
            }
        });

    // Ensure a access_token and state is returned
    if (
        typeof payload.access_token !== 'string' ||
        typeof payload.state !== 'string' ||
        isNaN(+payload.expires_in)
    )
        return;

    // Validate authentication hash
    if (!verify_auth_hash(payload.state)) return (location.hash = '');

    localStorage.setItem('access_token', payload.access_token);
    localStorage.setItem(
        'access_token_expiry',
        (Date.now() + +payload.expires_in * 1000).toString()
    );
    location.hash = '';
}

let spotify_session;
function get_access_token(reload_on_fail = true) {
    if (spotify_session) {
        const { token, expiry } = spotify_session;
        if (Date.now() < expiry) return token;
    } else {
        let token = localStorage.getItem('access_token');
        let expiry = +localStorage.getItem('access_token_expiry');
        if (Date.now() < expiry) {
            spotify_session = {
                token,
                expiry,
            };

            return token;
        }
    }

    if (reload_on_fail) {
        alert(
            'You have been inactive for too long. Please connect your account again.'
        );
        location.reload();
    }
}

function get_auth_hash(expiry_seconds = 5) {
    let hash = randomHex(20);
    localStorage.setItem(
        'auth_hash',
        `${hash}:${Date.now() + 1000 * expiry_seconds}`
    );
    return hash;
}

function verify_auth_hash(hash) {
    let lookup = localStorage.getItem('auth_hash');
    if (typeof lookup == 'string') {
        let chunks = lookup.split(':');
        if (chunks.length == 2) {
            let chunk_hash = chunks[0];
            let chunk_expiry = +chunks[1];
            if (chunk_hash == hash && Date.now() < chunk_expiry) return true;
        }
    }

    return false;
}

function connect_with_spotify() {
    let hash = get_auth_hash(60);
    let oauth_url = `https://accounts.spotify.com/authorize?client_id=${spotify_client_id}&response_type=token&redirect_uri=${encodeURIComponent(
        location.origin + location.pathname
    )}&state=${hash}&scope=${encodeURIComponent(
        'playlist-modify-public playlist-modify-private playlist-read-private playlist-read-collaborative user-modify-playback-state user-library-read user-read-playback-state'
    )}`;

    $('#connect_button').text('Redirecting').addClass('disabled');
    location.href = oauth_url;
}

function application_loader(visible, message) {
    let loader = $('#loader_container');
    let message_tag = $('#loader_message');
    let is_visible = loader.css('display') !== 'none';

    if (typeof message == 'string') message_tag.text(message);

    if (visible && !is_visible) {
        loader.show();
    } else if (!visible && is_visible) {
        loader.hide();
    }
}

let spotify_profile = {
    id: '',
    devices: [],
    playlists: [],
    playlists_by_key: {},
    playlist_songs: {},
    temporary: {
        name: 'Temporary True Shuffle',
        playlist: null,
    },
};

async function load_application() {
    let token = get_access_token();

    application_loader(true, 'Retrieving Your Spotify Devices...');
    spotify_profile.devices = await fetch_devices(token);

    application_loader(true, 'Retrieving Your Spotify Playlists...');
    let { userId, playlists } = await fetch_all_playlists(token);
    spotify_profile.id = userId;

    spotify_profile.playlists = playlists.sort(
        (a, b) => b.tracks.total - a.tracks.total
    );

    spotify_profile.playlists.forEach((playlist) => {
        spotify_profile.playlists_by_key[playlist.id] = playlist;
        if (playlist.name === spotify_profile.temporary.name)
            spotify_profile.temporary.playlist = playlist;
    });

    let choose_playlist = $('#choose_playlist');
    spotify_profile.playlists.forEach((playlist) =>
        choose_playlist.append(
            `<option value="${playlist.id}">${playlist.name} - ${playlist.tracks.total} Songs</option>`
        )
    );

    let choose_device = $('#choose_device');
    spotify_profile.devices.forEach((device) =>
        choose_device.append(
            `<option value="${device.id}">${device.name}</option>`
        )
    );

    application_loader(false);
    $('#application_section').show();
}

window.addEventListener('load', () => {
    // Ensure localStorage is available else browser is unsupported
    if (!has_local_storage()) {
        return $('#connect_button')
            .text('Unsupported Browser')
            .addClass('disabled');
    }

    handle_auth_callback();

    if (typeof get_access_token(false) == 'string') {
        $('#auth_section').hide();
        load_application();
    }
});
