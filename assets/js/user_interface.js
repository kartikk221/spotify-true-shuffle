/**
 * Renders the connect button on the landing page with the specified tag and enabled.
 *
 * @param {String} tag
 * @param {Boolean} enabled
 */
function ui_render_connect_button(tag, enabled) {
    const button = document.getElementById('connect_button');
    const classes = button.getAttribute('class');
    button.innerText = tag;
    button.setAttribute('class', `${classes} ${enabled ? '' : 'disabled'}`);
}

/**
 * Renders the "Shuffle & Play" button in the main application with the specified tag and enabled.
 *
 * @param {String} tag
 * @param {Boolean} enabled
 */
function ui_render_play_button(tag, enabled = true) {
    const button = document.getElementById('play_button');
    button.innerText = tag;
    button.disabled = !enabled;
    button.classList[enabled ? 'remove' : 'add']('disabled');
}

/**
 * Renders the application message under the play button with specified content.
 *
 * @param {String} content
 * @param {Boolean} enabled
 */
function ui_render_application_message(content, enabled = true) {
    const text = document.getElementById('application_message');
    text.innerHTML = content;
    text.setAttribute('style', enabled ? '' : 'display: none');
}

const MONTH_NAMES = [
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

function ui_render_queued_songs(songs) {
    // Render the queued tracks into the results container
    document.getElementById('shuffle_results').innerHTML = songs
        .map(({ index, name, artists, image, release_date }) => {
            const [year, month, day] = release_date.split('-');
            const released_on = `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
            return `
                <div class="row mt-3">
                    <div class="song-element">
                        ${image ? `<img class="song-image" src="${image}" />` : ''}
                        <p class="song-title">
                            #${index + 1} - ${name}
                            <br />
                            <strong class="song-subtitle">${artists.join(', ')} - Released On ${released_on}</strong>
                        </p>
                    </div>
                </div>`;
        })
        .join('\n');

    // Show the shuffle results container
    document.getElementById('shuffle_results_container').setAttribute('style', '');
}
