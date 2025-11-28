// Get your own Spotify Client ID at https://developer.spotify.com/
const AUTH_CLIENT_ID = '0e188cfad9f3470ca424b84c2dc532df';
const AUTH_MAX_RECENT_CONNECTION_AGE = 1000 * 60 * 60 * 24 * 7; // 7 days
const AUTH_APPLICATION_SCOPES = [
    'playlist-modify-public',
    'playlist-modify-private',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-modify-playback-state',
    'user-library-read',
    'user-read-playback-state',
];

/**
 * Returns whether this device connected to Spotify recently or not.
 * @returns {Boolean}
 */
function auth_has_recently_connected() {
    const last_connection_at = localStorage.getItem('last_connection_at');
    return last_connection_at && parseInt(last_connection_at) > Date.now() - AUTH_MAX_RECENT_CONNECTION_AGE;
}

/**
 * Generates and returns a base64 code challenge based on the code verifier.
 *
 * @param {String} code_verifier
 * @returns {String}
 */
async function auth_get_code_challenge(code_verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(code_verifier);
    const hash = await window.crypto.subtle.digest('SHA-256', data)
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

/**
 * Generates and returns an authentication integrity hash that is valid for up to specified "expiry" seconds.
 *
 * @param {Number} expiry
 * @returns {String}
 */
function auth_get_hash(expiry = 60) {
    const hash = random_string(20);
    localStorage.setItem('auth_hash', btoa(`${hash}:${Date.now() + 1000 * expiry}`));
    log('AUTHENTICATION', `Generated Authentication Hash: ${hash}`);
    return hash;
}

/**
 * Validates the provided integrity hash against a stored hash and returns a boolean specifying whether the hash is valid.
 *
 * @param {String} hash
 * @returns {Boolean}
 */
function auth_validate_hash(hash) {
    const raw = localStorage.getItem('auth_hash');
    if (typeof raw == 'string') {
        const [integrity, expiry] = atob(raw).split(':');
        return hash === integrity && parseInt(expiry) > Date.now();
    }
    return false;
}

/**
 * Stores the provided Spotify access token and expiry timestamp in local storage.
 *
 * @param {String} token
 * @param {Number} expiry
 */
function auth_set_access_token(token, expiry) {
    localStorage.setItem('access_token', btoa(`${token}:${expiry.toString()}`));
    log('AUTHENTICATION', `Stored Spotify Access Token: [REDACTED] Expires: ${new Date(expiry).toLocaleString()}`);
}

let _auth_access_token_cache;
/**
 * Retrieves a valid Spotify access token from local storage.
 *
 * @returns {String=}
 */
function auth_get_access_token() {
    // Check if the access token is cached
    if (_auth_access_token_cache) return _auth_access_token_cache;

    // Check if the access token is stored in local storage
    const raw = localStorage.getItem('access_token');
    if (typeof raw == 'string') {
        const [token, expiry] = atob(raw).split(':');
        _auth_access_token_cache = parseInt(expiry) > Date.now() ? token : undefined;
        return _auth_access_token_cache;
    }
}

/**
 * Step 1: Redirects the user to the Spotify OAuth page to connect their account with the application.
 */
async function auth_connect_spotify() {
    // Build the required parameters for the Spotify OAuth page
    const integrity = auth_get_hash(60);
    const code_verifier = random_string(64);
    const code_challenge = await auth_get_code_challenge(code_verifier);
    const callback_uri = encodeURIComponent(location.origin + location.pathname);
    const scopes = encodeURIComponent(AUTH_APPLICATION_SCOPES);

    // Update the UI to show the user that they are connecting
    ui_render_connect_button('Connecting...', false);
    log('AUTHENTICATION', `Redirecting to Spotify OAuth Page: ${callback_uri}`);

    // Save code verifier to provide later
    localStorage.setItem('auth_verifier', code_verifier);

    // Redirect the user to the Spotify OAuth page
    location.href = `https://accounts.spotify.com/authorize?client_id=${AUTH_CLIENT_ID}&response_type=code&code_challenge_method=S256&code_challenge=${code_challenge}&redirect_uri=${callback_uri}&state=${integrity}&scope=${scopes}`;
}

/**
 * Step 2: Parses the search parameters from the Spotify OAuth page and attempts to connect the user's account with the application.
 */
async function auth_parse_connection_parameters() {
    // Ensure the authorisation code is provided
    if (location.search.length == 0) return;
    if (!location.search.includes('code=') || !location.search.includes('state=')) return (location.search = '');

    // Parse the search parameters from Spotify
    const auth_params = {};
    location.search
        .substring(1)
        .split('&')
        .forEach((chunk) => {
            const [key, value] = chunk.split('=');
            if (key && value) auth_params[key] = decodeURIComponent(value);
        });

    // Destructure the expected parameters
    const { code, state } = auth_params;

    // Validate the expected parameters
    if (
        typeof code !== 'string' ||
        typeof state !== 'string'
    )
        return (location.search = '');

    // Validate the incoming integrity hash (state) with the stored hash
    if (!auth_validate_hash(state)) return (location.search = '');

    // Build the required parameters for the Spotify OAuth token request
    const code_verifier = localStorage.getItem('auth_verifier');

    // Request the access token using the auth code
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        body: new URLSearchParams({
            client_id: AUTH_CLIENT_ID,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: location.origin + location.pathname,
            code_verifier: code_verifier,
        }),
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    })

    // Destructure the expected parameters
    const { access_token, expires_in } = await response.json();
    // TODO refresh_token is also provided, would be useful to implement

    // Validate the expected parameters
    if (
        typeof access_token !== 'string' ||
        typeof expires_in !== 'number' ||
        isNaN(expires_in)
    )
        return;

    // Store the access token and expiry time in local storage
    auth_set_access_token(access_token, Date.now() + parseInt(expires_in) * 1000);

    // Store a timestamp marking this successful connection
    localStorage.setItem('last_connection_at', Date.now().toString());

    // Empty the search from the URL
    location.search = '';
}
