// utils/date.js

function pad(n) {
    return n.toString().padStart(2, '0');
}

function getFullDateTime() {
    const now = new Date();

    const day = pad(now.getDate());
    const month = pad(now.getMonth() + 1);
    const year = now.getFullYear();

    const formatted = `${year}-${month}-${day}`;

    return formatted;
}

function getISODateTime() {
    return new Date().toISOString();
}

function getSimpleDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = pad(now.getMonth() + 1);
    const day = pad(now.getDate());

    return `${year}-${month}-${day}`;
}

module.exports = {
    getFullDateTime,
    getISODateTime,
    getSimpleDate
};