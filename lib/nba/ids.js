// BUCKETS' id shapes, one place for the shell, the hooks and the routes
// (ESPN's: a game is 9 digits; an athlete up to 10; a club 2-4 letters, UTAH).
export const GAME_ID_RE = /^\d{9}$/
export const PLAYER_ID_RE = /^\d{2,10}$/
export const TEAM_RE = /^[A-Z]{2,4}$/
