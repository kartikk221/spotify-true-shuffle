const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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

/**
 * Logs specified message to console in an organized log message
 *
 * @param {String} logger
 * @param {String} message
 */
function log(logger = 'SYSTEM', message) {
    let dt = new Date();
    let timeStamp = dt.toLocaleString([], { hour12: true, timeZone: 'America/New_York' }).replace(', ', ' ').split(' ');
    timeStamp[1] += ':' + dt.getMilliseconds().toString().padStart(3, '0') + 'ms';
    timeStamp = timeStamp.join(' ');
    console.log(`[${timeStamp}][${logger}] ${message}`);
}

/**
 * Returns a Promise which is resolved after the specified amount of milliseconds.
 *
 * @param {Number} milliseconds
 * @returns {Promise<void>}
 */
async function async_wait(milliseconds) {
    return new Promise((resolve, _) => setTimeout((r) => r(), Math.max(1, milliseconds), resolve));
}

/**
 * Generates and returns a random hexadecimal string of the given size.
 *
 * @param {Number} size
 * @returns {String}
 */
function random_string(size) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(size));
    return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}

/**
 * Returns a random number between the specified min and max range.
 * Note! This method is inclusive thus min or max may be returned.
 *
 * @param {Number} min
 * @param {Number} max
 * @returns {Number}
 */
function random_number(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Wraps the provided number inside the specified range between min and max.
 *
 * @param {Number} number
 * @param {Number} min
 * @param {Number} max
 * @returns {Number}
 */
function wrap_number(number, min, max) {
    // Determine if the number is outside the specified bounds
    const range = max - min;
    const direction = number < min ? 1 : number > max ? -1 : 0;
    if (direction !== 0) {
        const distance = direction == 1 ? min - number : number - max;
        number += direction * (range * Math.ceil(distance / range));
    }

    return number;
}

/**
 * Returns a boolean specifying whether local storage is supported.
 *
 * @returns {Boolean}
 */
function local_storage_supported() {
    try {
        localStorage.setItem('ls_test', 'true');
        localStorage.removeItem('ls_test');
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * Returns a clamped/truncated string of the specified length.
 *
 * @param {String} string
 * @param {Number} length
 * @param {String=} trail
 * @returns {String}
 */
function clamp_string(string, length, trail = '...') {
    return string.length > length ? string.substring(0, length) + trail : string;
}

/**
 * Performs a per item swap shuffle powered by the Math.random() generator.
 *
 * @param {Array} array
 * @returns {Array}
 */
function swap_shuffle(array) {
    // Handle scenario for less than 2 items
    if (array.length < 2) return array;

    // Perform a swap shuffle on the provided array
    for (let i = 0; i < array.length; i++) {
        // Determine a random index with which we will swap current element
        const rand = random_number(0, array.length - 1);
        const temp = array[rand];

        // Swap the current item with the randomly picked item
        array[rand] = array[i];
        array[i] = temp;
    }

    // Return the shuffled array
    return array;
}

/**
 * Performs a swap shuffle on specified batch sizes in the provided array.
 *
 * @param {Array} array
 * @returns {Array}
 */
function batch_swap_shuffle(array, size) {
    // Determine if a batch size automatically if one is not provided based on an array size of 100
    size = Math.max(1, size || Math.round(array.length / 10));

    // Generate shuffled batches from the provided array
    const batches = [];
    const iterations = Math.ceil(array.length / size);
    for (let i = 0; i < iterations; i++) {
        const batch = array.slice(i * size, i * size + size);
        swap_shuffle(batch);
        batches.push(batch);
    }

    // Return the batches as a single array
    return batches.flat();
}

/**
 * Returns a batch array of specified batch_size length using random selections over the specified sample_size ranges.
 *
 * @param {Array} array
 * @param {Number} batch_size
 * @param {Number=} sample_size
 * @returns {Array}
 */
function get_spread_batch(array, batch_size, sample_size) {
    // Ensure we receive a valid batch size
    if (Number.isNaN(batch_size) || batch_size < 1) throw new Error('Invalid batch_size provided');

    // Determine if a sample size automatically if one is not provided based on an array size of 100
    sample_size = Math.max(1, sample_size || Math.ceil(array.length / 10));

    // Handle scenario for less array items than batch size
    if (array.length < batch_size) return array;

    // Generate a random of batch of items picked randomly based on sample size based random increments
    let batch = [];
    let cache = {};
    let cursor = random_number(0, array.length - 1);
    for (let i = 0; i < batch_size; i++) {
        // Randomly adjust the cursor and wrap it around if it passes array length
        while (cache[cursor]) cursor += random_number(0, sample_size);
        if (cursor >= array.length) cursor = wrap_number(cursor, 0, array.length - 1);

        // Store the item at the cursor in our batch
        cache[cursor] = true;
        batch.push(array[cursor]);
    }

    return batch;
}

/**
 * Returns a batch array of specified batch_size length using random selections over the specified sample_size ranges.
 * Attempts to select unique adder id's up to 10 times first to avoid adjacent adders. (Adder is person who adds track to a playlist)
 *
 * @param {Array} array
 * @param {Number} batch_size
 * @param {Number=} sample_size
 * @returns {Array}
 */
function get_spread_batch_no_adjacent(array, batch_size, sample_size) {
    // Ensure we receive a valid batch size
    if (Number.isNaN(batch_size) || batch_size < 1) throw new Error('Invalid batch_size provided');

    // Determine if a sample size automatically if one is not provided based on an array size of 100
    sample_size = Math.max(1, sample_size || Math.ceil(array.length / 10));

    // Handle scenario for less array items than batch size
    if (array.length < batch_size) batch_size = array.length;

	const maxAltSearchs = 25;

    // Generate a random of batch of items picked randomly based on sample size based random increments
    let batch = [];
    let cache = {};
    let cursor = random_number(0, array.length - 1);
	let altSearchCounter = 0;
	let prev_adder = null;
    for (let i = 0; i < batch_size; i++) {
        // Randomly adjust the cursor and wrap it around if it passes array length
        while ((cache[cursor] || array[cursor].added_by_id == prev_adder) && altSearchCounter < maxAltSearchs) 
		{
            //if (cache[cursor]) console.log(array[cursor].added_by_id + " song is already in batch, curr search count: " + altSearchCounter);
            //if (array[cursor].added_by_id == prev_adder) console.log(array[cursor].added_by_id + " matches previous, searching, curr search count: " + altSearchCounter);
			cursor += random_number(0, sample_size);
			if (cursor >= array.length) cursor = wrap_number(cursor, 0, array.length - 1);
			altSearchCounter++;
		}
        //Backup if non-duplicate song replacement can't be found, allows for back-to-back same id
        if (altSearchCounter == maxAltSearchs)
        {
            while (cache[cursor])
            {
                cursor++;
                cursor %= array.length;
            }
        }
		altSearchCounter = 0;

		//if (array[cursor].added_by_id == prev_adder) console.log(i + ": " + array[cursor].added_by_id + " matches " + prev_adder + " but could not find replacement.");
		//if (array[cursor].added_by_id != prev_adder) console.log(i + ": " + array[cursor].added_by_id + " does not match " + prev_adder + " so it was added.");
        // Store the item at the cursor in our batch
        cache[cursor] = true;
        batch.push(array[cursor]);
		prev_adder = array[cursor].added_by_id;
    }

    return batch;
}
/**
 * Returns the date number prefix for a given month day.
 */
function get_month_date_prefix(day) {
    // Ensure we receive a valid day
    if (day < 1 || day > 31) throw new Error('Invalid day');

    // Handle special cases
    if (day >= 11 && day <= 13) return 'th';

    // Return the prefix based on the day
    switch (day % 10) {
        case 1:
            return 'st';
        case 2:
            return 'nd';
        case 3:
            return 'rd';
        default:
            return 'th';
    }
}
