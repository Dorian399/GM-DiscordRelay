// This file is part of a project licensed under the MIT License.
// See the LICENSE file in the root directory for full terms.

// Your Discord bot token.
exports.DiscordBotToken = 'YOUR_DISCORD_TOKEN';

// Your Steam API key. This is completely optional; it is only used for fetching avatar images.
exports.SteamAPIKey = 'YOUR_STEAM_APIKEY';

// The port on which the relay will listen.
exports.RelayPort = 9871;

// How often the status message should refresh (in seconds).
exports.StatusRefreshTime = 30;

// Show latest activity. This will add an additional line to the status message indicating the last time your server had any players, provided it is currently empty.
exports.ShowLastActivity = false;

// The maximum length for a message. (This only applies to Discord messages.)
exports.MaxMessageLength = 512;

// Allow the bot to indicate where a message was trimmed.
exports.AnnounceMessageTrim = true;

// Any chat message (from the GMod server side) starting with a character/string in this list will not be sent to the relay.
// Example: exports.MessagesStartsWithBlacklist = ['!', '/', '$'];
exports.MessagesStartsWithBlacklist = [];

// The prefix for commands used to execute RCON.
// Only users listed in exports.AllowedForCommands can use these.
// Default commands are:
//   --rcon [command]
//   --command [command]
//   --c [command]
// All of the above execute RCON commands on the server. 
// Commands only work in channels listed in exports.Servers.
exports.CommandPrefix = '--';
exports.rconCommands = ['rcon', 'command', 'c'];

// Users allowed to use commands.
// Example:
// exports.AllowedForCommands = [
//     '123456789123456789',
//     '109876543219876543',
// ];
exports.AllowedForCommands = [
    'DiscordUserID',
];

// Should the relay receive server-side Lua errors?
// Using this option in a public channel is not recommended, as it could reveal sensitive information about the server.
exports.ShowLuaErrors = false;

// Show debug logs.
// Enable this if something isn't working as expected.
exports.ShowDebugLogs = false;

// The Channel ID for the status message.
// Preferably, the channel should be empty.
// This config is optional. If you do not wish to use the status functionality, just leave this as-is.
// Example: exports.StatusChannelID = '123456789123456789';
exports.StatusChannelID = 'ChannelID';

// The servers that you want as part of the relay.
// This list can include multiple servers.
/* Example usage:
exports.Servers = {
    'server1': {
        ip: '192.168.1.2',
        publicip: '172.217.22.14',
        port: 27015,
        password: 'rconpass',
        relaychannel: '123456789123456789'
    },
    'server2': {
        ip: '192.168.1.3',
        publicip: '172.217.22.15',
        port: 27016,
        password: 'rconpass2',
        relaychannel: '123456789123456638'
    },
};
*/
exports.Servers = {
    'server1': { // A unique ID. This can be anything, as long as it is unique.
        ip: '127.0.0.1', // This IP is used for RCON and relaying messages. (If hosting on the same network, use a local IP.)
        publicip: '172.217.22.14', // This IP is used only for the server's status display. (It must be the IP players use to join.)
        port: 27015, // The server's port.
        password: 'password123', // The server's RCON password.
        relaychannel: 'ChannelID' // The Channel ID to use for the relay.
    },
};
