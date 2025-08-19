// config.js
const config = {
    apiUrl: window.location.hostname === 'localhost' 
        ? 'http://localhost:3000' 
        : '' // Empty string for same-origin requests when deployed
};
