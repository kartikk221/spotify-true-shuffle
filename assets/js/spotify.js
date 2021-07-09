async function get_user_profile(token) {
    let response = await fetch('https://api.spotify.com/v1/me', {
        method: 'GET',
        headers: {
            authorization: 'Bearer ' + token,
        },
    });

    if (response.status !== 200) throw new Error('Bad HTTP Status Code');

    let body = await response.json();
    return body;
}

async function async_wait(milliseconds) {
    return new Promise((resolve, _) =>
        setTimeout((r) => r(), milliseconds, resolve)
    );
}

async function fetch_devices(token) {
    let response = await fetch('https://api.spotify.com/v1/me/player/devices', {
        method: 'GET',
        headers: {
            authorization: 'Bearer ' + token,
        },
    });

    if (response.status !== 200) throw new Error('Invalid HTTP Status Code');

    let body = await response.json();
    return body.devices;
}

async function fetch_all_playlists(token, limit = 50, offset = 0, delay = 150) {
    let response = await fetch(
        `https://api.spotify.com/v1/me/playlists?limit=${limit}&offset=${offset}`,
        {
            method: 'GET',
            headers: {
                authorization: 'Bearer ' + token,
            },
        }
    );

    if (response.status !== 200) throw new Error('Invalid HTTP Status Code');

    let body = await response.json();
    let playlists = body.items;

    // Paginate further if more playlists need to be fetched
    if (typeof body.next == 'string') {
        // Delay to prevent hitting rate limit
        await async_wait(delay);
        let paginated = await fetch_all_playlists(
            token,
            limit,
            body.offset + limit
        );

        playlists = playlists.concat(paginated.playlists);
    }

    return {
        userId: body.href.split('users/')[1].split('/')[0],
        playlists: playlists,
    };
}

async function fetch_all_playlist_songs(
    token,
    playlist_id,
    on_progess_change,
    limit = 50,
    offset = 0,
    delay = 250
) {
    let response = await fetch(
        `	https://api.spotify.com/v1/playlists/${playlist_id}/tracks?limit=${limit}&offset=${offset}`,
        {
            method: 'GET',
            headers: {
                authorization: 'Bearer ' + token,
            },
        }
    );

    if (response.status !== 200) throw new Error('Invalid HTTP Status Code');

    let body = await response.json();
    let songs = body.items;
    if (typeof on_progess_change == 'function')
        on_progess_change(body.offset + songs.length);

    // Paginate further if more songs need to be fetched
    if (typeof body.next == 'string') {
        // Delay to prevent hitting rate limit
        await async_wait(delay);
        songs = songs.concat(
            await fetch_all_playlist_songs(
                token,
                playlist_id,
                on_progess_change,
                limit,
                body.offset + limit
            )
        );
    }

    return songs;
}

async function create_playlist(
    token,
    userId,
    name,
    description = '',
    public = false
) {
    let response = await fetch(
        `https://api.spotify.com/v1/users/${userId}/playlists`,
        {
            method: 'POST',
            headers: {
                authorization: 'Bearer ' + token,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                name,
                description,
                public,
            }),
        }
    );

    return await response.json();
}

async function append_songs_to_playlist(token, playlist_id, song_uris) {
    let response = await fetch(
        `https://api.spotify.com/v1/playlists/${playlist_id}/tracks`,
        {
            method: 'POST',
            headers: {
                authorization: 'Bearer ' + token,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                uris: song_uris,
            }),
        }
    );

    let body = await response.json();

    if (response.status !== 201) {
        console.log(body);
        throw new Error('Bad HTTP Status Code');
    }

    return body;
}

async function replace_songs_in_playlist(token, playlist_id, song_uris) {
    let response = await fetch(
        `https://api.spotify.com/v1/playlists/${playlist_id}/tracks`,
        {
            method: 'PUT',
            headers: {
                authorization: 'Bearer ' + token,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                uris: song_uris,
            }),
        }
    );

    let body = await response.json();

    if (response.status !== 201) {
        console.log(body);
        throw new Error('Bad HTTP Status Code');
    }

    return body;
}

async function toggle_playback_shuffle(token, device_id, state = false) {
    let response = await fetch(
        `https://api.spotify.com/v1/me/player/shuffle?device_id=${device_id}&state=${
            state === true ? 'true' : 'false'
        }`,
        {
            method: 'PUT',
            headers: {
                authorization: 'Bearer ' + token,
            },
        }
    );

    if (response.status === 403) return false;

    if (response.status === 204) {
        return true;
    } else {
        throw new Error('Bad HTTP Status Code');
    }
}

async function start_playback(
    token,
    device_id,
    { context_uri, uris, offset, position_ms }
) {
    let response = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${device_id}`,
        {
            method: 'PUT',
            headers: {
                authorization: 'Bearer ' + token,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                context_uri,
                uris,
                offset,
                position_ms,
            }),
        }
    );

    if (response.status === 204) {
        return true;
    } else {
        throw new Error('Bad HTTP Status Code');
    }
}
