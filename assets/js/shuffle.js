function copy_array(array) {
    return array.slice(0);
}

function unbiased_shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function spread_shuffle(array, length, iterations, spread = 4) {
    // Partition array into chunks based on specified spread
    let partitions = [];
    let count = array.length;
    let partition_length = Math.floor(count / spread);
    for (let i = 1; i <= spread; i++) {
        if (i == spread) {
            partitions.push(array);
        } else {
            partitions.push(array.splice(0, partition_length));
        }
    }

    // Perform unbiased shuffle on partitions once
    for (let i = 0; i < partitions.length; i++) unbiased_shuffle(partitions[i]);

    // Exchange values between partitions randomly
    let modifications = iterations || count;
    for (let i = 0; i < modifications; i++) {
        // Choose 2 random partitions to exchange values
        let from = partitions[Math.floor(Math.random() * partitions.length)];
        let to = partitions[Math.floor(Math.random() * partitions.length)];

        // Choose 2 random indexes and their values from each partition
        let from_index = Math.floor(Math.random() * from.length);
        let to_index = Math.floor(Math.random() * to.length);
        let from_value = from[from_index];
        let to_value = to[to_index];

        // Exchange values between two indexes
        from[from_index] = to_value;
        to[to_index] = from_value;
    }

    if (length && length < count) {
        let results = [];
        let cursor = 0;
        let indexes = partitions.map(() => 0);
        for (let i = 0; i < length; i++) {
            let partition = partitions[cursor];
            let value = partition[indexes[cursor]];
            results.push(value);

            cursor++;
            if (cursor >= partitions.length) cursor = 0;

            indexes[cursor]++;
            if (indexes[cursor] >= partition.length) indexes[cursor] = 0;
        }

        return results;
    } else {
        return [].concat(partitions);
    }
}

async function shuffle_retrieve_songs(playlist_id, on_progress_change) {
    // Check local cache first
    let cache = spotify_profile.playlist_songs[playlist_id];
    if (cache) return cache;

    // Retrieve From Spotify API
    let token = get_access_token();
    let songs = await fetch_all_playlist_songs(
        token,
        playlist_id,
        on_progress_change
    );

    // Filter songs to only retain non local songs
    songs = songs.filter(({ is_local }) => is_local === false);

    // Cache resolved songs for faster access in future
    spotify_profile.playlist_songs[playlist_id] = songs;
    return songs;
}

function to_readable_date(date) {
    const month_names = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
    ];

    try {
        let chunks = date.split('-');
        let year = +chunks[0];
        let month = month_names[+chunks[1] - 1];
        let day = (+chunks[2]).toString();
        if (day.endsWith('1')) {
            day += 'st';
        } else if (day.endsWith('2')) {
            day += 'nd';
        } else if (day.endsWith('3')) {
            day += 'rd';
        } else {
            day += 'th';
        }

        return `${month} ${day}, ${year}`;
    } catch (error) {
        return 'Invalid Format';
    }
}

async function shuffle_and_play() {
    let playlist = $('#choose_playlist').val();
    let device = $('#choose_device').val();

    // Validate selected parameters
    let playlist_object = spotify_profile.playlists_by_key[playlist];
    if (playlist == 'default' || playlist_object == undefined)
        return alert('Please Select a Valid Playlist');
    if (device == 'default') return alert('Please Select a Device');

    // Mark Shuffle & Play button in flight
    let play_button = $('#play_button');
    play_button.text('Processing').prop('disabled', true).addClass('disabled');

    // Retrieve songs for playlist and create a copy to prevent modification of original cache
    let total = playlist_object.tracks.total;
    let songs_lookup = await shuffle_retrieve_songs(playlist, (progress) =>
        play_button.text(`Retrieving Songs... [${progress} / ${total}]`)
    );
    let songs = copy_array(songs_lookup);

    // Shuffle songs based on length and only be left with 100 songs in the end as that is playback API limit
    play_button.text('Shuffling Songs');
    let uris_cap = 100;
    if (songs.length < uris_cap + 1) {
        unbiased_shuffle(songs);
    } else {
        songs = spread_shuffle(songs, uris_cap);
    }

    // Map song uris for Spotify API
    let song_uris = songs.map((song) => song.track.uri);

    // Check for Spotify Premium With Shuffle Toggle
    play_button.text('Starting Playback');
    let is_premium = await toggle_playback_shuffle(
        get_access_token(),
        device,
        false
    );

    // Launch Playback If User Has Premium
    let reshuffle_message = 'Reshuffle & Play';
    if (is_premium) {
        await start_playback(get_access_token(), device, {
            uris: song_uris,
        });
    } else {
        // Retrieve temporary playlist
        let playlist_object = spotify_profile.temporary.playlist;

        // Create a new temporary playlist if one doesn't already exist
        if (playlist_object === null) {
            play_button.text('Creating Temporary Playlist');
            playlist_object = await create_playlist(
                get_access_token(),
                spotify_profile.id,
                spotify_profile.temporary.name,
                'An Automatic Playlist Generated By True Shuffle from ' +
                    location.origin +
                    location.pathname,
                false
            );

            spotify_profile.temporary.playlist = playlist_object;
        }

        // Update temporary playlist with shuffled song uris
        play_button.text('Updating Temporary Playlist');
        await replace_songs_in_playlist(
            get_access_token(),
            playlist_object.id,
            song_uris
        );

        reshuffle_message = 'Reshuffle & Update';
        $('#application_message')
            .html(
                `Your shuffled music has been placed inside a
        <strong>temporary</strong> playlist called
        <strong>True Shuffle Temporary</strong>.`
            )
            .show();
    }

    // Display shuffle results in application UI
    let shuffle_results = [];
    songs.forEach(({ track }) => {
        let title = track.name;
        let artists = track.artists.map((artist) => artist.name).join(', ');
        let image;
        if (Array.isArray(track.album.images))
            image = track.album.images[0].url;

        shuffle_results.push(`
        <div class="row mt-3">
            <div class="song-element">
                ${
                    image
                        ? `<img
                class="song-image"
                src="${image}"
            />`
                        : ''
                }
                <p class="song-title">
                    ${title}<br /><strong class="song-subtitle"
                        >${artists} - Released On ${to_readable_date(
            track.album.release_date
        )}</strong
                    >
                </p>
            </div>
        </div>`);
    });

    $('#shuffle_results').html(shuffle_results.join('\n'));
    $('#shuffle_results_container').show();

    // Re-Enable UI controls for reshuffling
    return play_button
        .text(reshuffle_message)
        .prop('disabled', false)
        .removeClass('disabled');
}
