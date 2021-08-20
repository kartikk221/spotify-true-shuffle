const LocalDB = new Dexie('PlaylistSongs');

LocalDB.version(1).stores({
    songs: '++id,playlist_id,snapshot_id,data',
});

async function store_playlist_songs(playlist_id, snapshot_id, songs) {
    // Cache songs to local IndexedDB database
    await LocalDB.songs.add({
        playlist_id: playlist_id,
        snapshot_id: snapshot_id,
        data: JSON.stringify(songs),
    });
}

let _songs_cache;

async function get_playlist_songs(playlist_id, snapshot_id, auto_expire = true) {
    // Retrive data from IndexedDB on first lookup
    if (_songs_cache == undefined)
        _songs_cache = (await LocalDB.songs.toArray()).map((cell) => {
            cell.data = JSON.parse(cell.data);
            return cell;
        });

    // Iterate through cache to match against playlist id and snapshot id
    let result;
    _songs_cache.forEach(async (cell) => {
        let plist_check = cell.playlist_id === playlist_id;
        let snapshot_check = cell.snapshot_id === snapshot_id;
        if (plist_check) {
            if (snapshot_check) {
                result = cell;
            } else if (auto_expire) {
                try {
                    await LocalDB.songs.delete(cell.id);
                    console.log(`[SONG_STORAGE] Cleaned Up Songs Cache ID: ${cell.id}`);
                } catch (error) {
                    console.log(`[SONG_STORAGE] Failed To Cleanup Expired Songs @ ID: ${cell.id}`);
                    console.log(error);
                }
            }
        }
    });

    if (result) return result.data;
}
