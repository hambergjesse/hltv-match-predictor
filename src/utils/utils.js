/**
 * Returns a promise that resolves after a specified number of milliseconds.
 * @param {number} ms - The number of milliseconds to delay.
 * @returns {Promise<void>}
 */
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms)); 