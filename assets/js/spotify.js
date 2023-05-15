async function SpotifyAPI(token) {
    // Initialize the object for containing the Spotify API properties and methods
    const instance = {
        _with_pagination: null,
        _api_request: null,
        _parse_track: null,
        _cache: {
            tracks: {},
            profile: null,
            playlists: null,
            devices: null,
        },
        _constants: {
            API_BASE: 'https://api.spotify.com/v1',
            LIKED_SONGS_PLAYLIST_ID: 'user_saved_tracks',
            TOKEN: token,
        },
        play_tracks: null,
        get_profile: null,
        get_devices: null,
        get_playlists: null,
        get_liked_tracks: null,
        create_playlist: null,
        get_playlist_tracks: null,
        set_playback_shuffle: null,
        set_playlist_tracks: null,
    };

    // Define the method for making API requests to Spotify API
    instance._api_request = async ({ method = 'GET', endpoint, body, timeout = 15, json = true }) => {
        // Destructure the required constants
        const { API_BASE, TOKEN } = instance._constants;

        // Create an abort controller instance with a timeout to trigger it
        const controller = new AbortController();
        const _timeout = setTimeout(() => controller.abort(), timeout * 1000);

        // Perform the fetch request to Spotify API
        const { signal } = controller;
        let response = await fetch(`${API_BASE}${endpoint}`, {
            method,
            headers: {
                authorization: `Bearer ${TOKEN}`,
                'content-type': 'application/json',
            },
            body,
            signal,
        });
        log('SPOTIFY_API', `${response.status} ${method} ${endpoint}`);

        // Resolve the response as a JSON object if specified by caller
        if (json) response = await response.json();

        // Clear the timeout to prevent the abort controller from triggering
        clearTimeout(_timeout);

        // Return the final response object
        return response;
    };

    // Define the method for performing pagination based operations
    instance._with_pagination = async ({ request, limit = 50, delay = 0, cursor = 0 }) => {
        // Retrieve the initial batch of items
        const { items, next } = await request({ limit, offset: cursor });

        // Ensure we have a valid pagination request
        if (items === undefined && next === undefined)
            throw new Error('SpotifyAPI._with_pagination(): No items or next page found.');

        // Retrieve the items and determine if there are more pages to retrieve
        if (typeof next == 'string') {
            // Wait for the delay before making the next request
            await async_wait(delay);

            // Retrieve the next page of playlists
            const more_items = await instance._with_pagination({ request, limit, delay, cursor: cursor + limit });

            // Concatenate the items from the initial request and the next page
            if (Array.isArray(more_items)) return items.concat(more_items);
        }

        // Return the final array of items
        return items;
    };

    // Define a method for parsing a track object
    instance._parse_track = ({ track }, index) => ({
        index,
        id: track?.id,
        uri: track?.uri,
        name: track?.name,
        local: track?.uri?.startsWith('spotify:local:'),
        image: track?.album?.images?.[0]?.url,
        artists: track?.artists?.map?.(({ name }) => name),
        release_date: track?.album?.release_date,
		added_by_id: track?.added_by?.id,
    });

    // Define the method for retrieving the user's profile
    instance.get_profile = async (options = {}) => {
        // Resolve from cache if specified
        const { cache = true } = options;

        // Resolve from cache if specified and available
        if (cache && instance._cache.profile) return instance._cache.profile;

        // Retrieve the user's profile from the Spotify API
        instance._cache.profile = await instance._api_request({
            endpoint: '/me',
        });

        return instance._cache.profile;
    };

    // Define the method for retrieving the user's available devices
    instance.get_devices = async (options = {}) => {
        // Resolve from cache if specified
        const { cache = true } = options;

        // Resolve from cache if specified and available
        if (cache && instance._cache.devices) return instance._cache.devices;

        // Retrieve the user's devices from the Spotify API
        const { devices } = await instance._api_request({
            endpoint: '/me/player/devices',
        });

        // Convert the devices array to an object
        instance._cache.devices = {};
        devices.forEach((device) => (instance._cache.devices[device.id] = device));
        return instance._cache.devices;
    };

    // Define the method for retrieving the user's playlists
    instance.get_playlists = async (options = {}) => {
        // Destructure the required parameters from the options object
        const { cache = true, limit = 50, delay = 0, offset = 0 } = options;

        // Resolve from cache if specified
        if (cache && instance._cache.playlists) return instance._cache.playlists;

        // Retrieve the user's playlists from the cache if specified
        const playlists = await instance._with_pagination({
            limit,
            delay,
            cursor: offset,
            request: ({ limit, offset }) =>
                instance._api_request({
                    endpoint: `/me/playlists?limit=${limit}&offset=${offset}`,
                }),
        });

        // Convert the devices array to an object
        instance._cache.playlists = {};
        playlists.forEach((playlist) => {
            // Add a property called 'me' which will signify if the owner is self
            playlist.owner.me = playlist.owner.id === instance._cache.profile.id;
            instance._cache.playlists[playlist.id] = playlist;
        });
        return instance._cache.playlists;
    };

    // Define the method for retrieving the user's liked tracks
    instance.get_liked_tracks = async (options = {}) => {
        // Desctructure the required parameters from the options object
        const { LIKED_SONGS_PLAYLIST_ID } = instance._constants;
        const { cache = true, limit = 50, delay = 0, offset = 0, count = false, on_progress } = options;

        // Retrieve the user's liked tracks from Spotify API
        if (count) {
            // Only retrieve the first page of liked tracks
            const { total } = await instance._api_request({
                endpoint: '/me/tracks?limit=1&offset=0', // Only retrieve the first page with 1 track
            });

            // Return the total number of liked tracks
            return total;
        } else {
            // Resolve from cache if specified
            if (cache && instance._cache.tracks[LIKED_SONGS_PLAYLIST_ID])
                return instance._cache.tracks[LIKED_SONGS_PLAYLIST_ID];

            // Retrieve the liked tracks with pagination
            const tracks = await instance._with_pagination({
                limit,
                delay,
                _offset: offset,
                request: async ({ limit, offset }) => {
                    // Retrieve the tracks for this props request
                    const tracks = await instance._api_request({
                        endpoint: `/me/tracks?limit=${limit}&offset=${offset}`,
                    });

                    // Invoke the progress callback if one is specified for updating the progress
                    if (typeof on_progress == 'function') on_progress(offset + limit, tracks.total);

                    // Return the tracks
                    return tracks;
                },
            });

            // Process and sanitize the tracks and cache the playlist tracks
            instance._cache.tracks[LIKED_SONGS_PLAYLIST_ID] = tracks.map(instance._parse_track);

            // Return the playlist tracks
            return instance._cache.tracks[LIKED_SONGS_PLAYLIST_ID];
        }
    };

    // Define the method for retrieving playlist tracks
    instance.get_playlist_tracks = async (playlist_id, options = {}) => {
        // Destructure the required parameters from the options object
        const { cache = true, limit = 50, delay = 0, offset = 0, on_progress } = options;

        // Check and resolve from memory cache if available
        if (cache && instance._cache.tracks[playlist_id]) return instance._cache.tracks[playlist_id];

        // Retrieve the playlist object
        const playlist = instance._cache.playlists[playlist_id];
        const tracks = await instance._with_pagination({
            limit,
            delay,
            _offset: offset,
            request: async ({ limit, offset }) => {
                // Retrieve the tracks for this props request
                const tracks = await instance._api_request({
                    endpoint: `/playlists/${playlist.id}/tracks?limit=${limit}&offset=${offset}`,
                });

                // Invoke the progress callback if one is specified
                if (typeof on_progress == 'function') on_progress(offset + limit, playlist.tracks.total);

                // Return the tracks
                return tracks;
            },
        });

        // Process and sanitize the tracks and cache the playlist tracks
        instance._cache.tracks[playlist_id] = tracks.map(instance._parse_track);

        // Return the playlist tracks
        return instance._cache.tracks[playlist_id];
    };

    // Define the method for updating the playback shuffle
    instance.set_playback_shuffle = async (device_id, enabled = false) => {
        // Make an API request to Spotify to update playback shuffle state
        const response = await instance._api_request({
            method: 'PUT',
            endpoint: `/me/player/shuffle?device_id=${device_id}&state=${enabled ? 'true' : 'false'}`,
            json: false,
        });

        // Match the request's HTTP status code to one of the possible scenarios
        switch (response.status) {
            case 204:
                return true;
            case 403:
                return false;
            default:
                throw new Error(`Invalid HTTP Status Code ${response.status}`);
        }
    };

    // Define the method for playing tracks with uris
    instance.play_tracks = async (device_id, options = {}) => {
        // Destructure the required parameters from the options object
        const { context_uri, uris, offset, position_ms } = options;

        // Make an API request to Spotify to play the specified tracks
        const response = await instance._api_request({
            method: 'PUT',
            endpoint: `/me/player/play?device_id=${device_id}`,
            json: false,
            body: JSON.stringify({
                context_uri,
                uris,
                offset,
                position_ms,
            }),
        });

        // Match the request's HTTP status code to one of the possible scenarios
        switch (response.status) {
            case 204:
                return true;
            default:
                throw new Error(`Invalid HTTP Status Code ${response.status}`);
        }
    };

    // Define the method for creating a Spotify playlist
    instance.create_playlist = async (name, options = {}) => {
        // Destructure the required parameters from the options object
        const { description, public } = options;

        // Retrieve the user profile as it is required for this endpoint
        const { id } = await instance.get_profile();

        // Make an API request to Spotify to play the specified tracks
        return await instance._api_request({
            method: 'POST',
            endpoint: `/users/${id}/playlists`,
            body: JSON.stringify({
                name,
                description,
                public,
            }),
        });
    };

    // Define the method for setting/updating a playlist's tracks
    instance.set_playlist_tracks = async (playlist_id, track_uris) => {
        // Make an API request to Spotify to update playlist's tracks
        return await instance._api_request({
            method: 'POST',
            endpoint: `/playlists/${playlist_id}/tracks`,
            body: JSON.stringify({
                uris: track_uris,
            }),
        });
    };

    // Retrieve the profile from Spotify to validate the provided token
    await instance.get_profile();
    return instance;
}
