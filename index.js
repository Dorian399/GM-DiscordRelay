/*
MIT License

Copyright (c) 2025 Dorian399/Dorian15

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import { Client, Events, GatewayIntentBits } from 'discord.js';
import { SrcdsLogReceiver } from '@srcds/log-receiver';
import Rcon from 'rcon';
const config = await import('./config.cjs'); 
const relayCommand = 'say_relay';


// Specifies the users that can use commands.
let usersWhitelist = {};
for (var key in config.AllowedForRCON) {
	usersWhitelist[config.AllowedForRCON[key]] = true;
}

// Specifies the channel id's relations to specific servers for fast lookup when relaying messages and rcon commands.
let serverChannelIDs = {};
for (var key in config.Servers) {
	const ip_and_port = config.Servers[key].ip + ':' + config.Servers[key].port
	serverChannelIDs[ip_and_port] = config.Servers[key].relaychannel;
	serverChannelIDs[config.Servers[key].relaychannel] = {ip: config.Servers[key].ip,port: config.Servers[key].port,password: config.Servers[key].password};
}

// List of commands that will be recognized as a RCON request.
const rconAliases = [config.CommandPrefix+'rcon',config.CommandPrefix+'command',config.CommandPrefix+"c"];


// Creates a log listener.
const receiver = new SrcdsLogReceiver({
	hostname: '0.0.0.0',
	port: config.RelayPort,
	onlyRegisteredServers: true,
});


// Add servers to log whitelist
let serversToAdd = []
for(var key in config.Servers){
	serversToAdd.push({hostname:config.Servers[key].ip, port:config.Servers[key].port});
}
receiver.addServers(serversToAdd);

// Create a new client instance.
const client = new Client({ intents: [
	GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.GuildWebhooks, 
    GatewayIntentBits.MessageContent
] });

// Starts log capture.
async function run() {
	await receiver.listen();

	console.log('Log capture sucessfully started.');
}

function debugLog(str) {
	if(config.ShowDebugLogs){
		console.log(str);
	}
}

// Converts string to Base64.
function utf8ToBase64(str) {
	const utf8Bytes = new TextEncoder().encode(str);
	const binaryStr = String.fromCharCode(...utf8Bytes);
	return btoa(binaryStr);
}

// Creates a short hash from a string. Used as chunk identifiers if a discord message exceeds 500 bytes.
function generateHash(str) {
	const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash * 15 + str.charCodeAt(i)) >>> 0;
	}
	let result = '';
	for (let i = 0; i < 4; i++) {
		const index = (hash >>> (i * 6)) & 0x3F;
		result += charset[index % 62];
	}
	return result;
}

// Sends a rcon command to the specified server. Returns the command's response.
async function sendRCON(ip,port,pass,command) {
	debugLog('\n[RCON] Sending RCON request');
	return new Promise((resolve,reject) => {
		const conn = new Rcon(ip,port,pass);
		let resolved = false;
		let result = '';
		let timeoutID;
		conn.on('auth',() => {
			debugLog('[RCON] Auth successful, sending command.');
			conn.send(command);
		});
		conn.on('response',(str) => {
			debugLog('[RCON] Received response/response chunk.');
			if(timeoutID)
				clearTimeout(timeoutID);
			result += str;
			timeoutID = setTimeout(() => {
				if(!resolved){
					resolved=true;
					resolve(result);
					debugLog('[RCON] Result gathered, closing connection manually.');
					conn.disconnect();
				}
			}, 500);	
		});
		conn.on('error',(err) => {
			if(!resolved){
				resolved=true;
				debugLog('[RCON] Error: '+err.toString()+'.');
				resolve(err.toString());
			}
		});
		conn.on('end',() => {
			debugLog('[RCON] Connection ended.\n');
			if(!resolved){
				resolved=true;
				resolve(result);
			}
		});
		conn.connect();
	});
}


// Fetches ancd caches the avatar url from a steam profile.
let avatarCache = {};
async function fetchAvatarUrl(steamid) {
	debugLog('\n[AVATAR] Avatar fetch started.');
	if(!config.SteamAPIKey || config.SteamAPIKey.length <20){
		debugLog('[AVATAR] Invalid or missing API key.\n');
		return;
	}
	if(avatarCache[steamid]){
		debugLog('[AVATAR] Accessing URL from cache.');
		debugLog('[AVATAR] Avatar fetched successfully.\n');
		return avatarCache[steamid];
	}
	debugLog('[AVATAR] Requesting from API.');
	const steamidsplit = steamid.split(':');
	const X = parseInt(steamidsplit[0].replace('STEAM_', ''));
	const Y = parseInt(steamidsplit[1]);
	const Z = parseInt(steamidsplit[2]);
	const V = BigInt('76561197960265728');
	const steamid64 = (BigInt(Z) * 2n + BigInt(Y) + V).toString();
	let res = await fetch(`http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${config.SteamAPIKey}&steamids=${steamid64}`);
	let data = await res.json();
	avatarCache[steamid]=data.response.players[0].avatarfull;
	debugLog('[AVATAR] Avatar fetched successfully.\n');
	return avatarCache[steamid];
}


// Assigns an existing webhook or creates a new one if it doesn't exists.
async function fetchChannelWebhooks(channel) {
	debugLog('\n[WEBHOOK] Retrieving webhook for channel: '+channel.name+'.');
	try {
		const hooks = await channel.fetchWebhooks();
		let webhook = hooks.find(hook => hook.name === 'srcds_chat_relay');
		if(!webhook){
			debugLog('[WEBHOOK] Webhook not found, creating a new one.\n');
			webhook = await channel.createWebhook({
				name: 'srcds_chat_relay'
			});
		}else{
			debugLog('[WEBHOOK] Webhook found.\n');
		}
		return webhook;
	} catch (error) {
		console.error(error);
	}
}

// Assigns an existing webhook or creates a new one if it doesn't exists.
async function fetchStatusChannel(channel,botid) {
	debugLog('\n[STATUS] Retrieving existing status message: '+channel.name+'.');
	try {
		const messages = await channel.messages.fetch({ limit: 100 });
		let statusMessage = messages.find(message => message.author.id == botid);
		if(!statusMessage){
			debugLog('[STATUS] Status message not found, creating a new one.\n');
			statusMessage = await channel.send('Status Message.');
		}else{
			debugLog('[STATUS] Status message found.\n');
		}
		return statusMessage;
	} catch (error) {
		console.error(error);
	}
}

// Set up webhooks for each server's channel.
let relayWebhooks = {};
// Set up status message.
let statusMessage;
client.once(Events.ClientReady, async readyClient => {
	// Prepare webhooks.
	for(var key in config.Servers){
		const channel = client.channels.cache.get(config.Servers[key].relaychannel);
		if(!channel)
			continue;
		const webhook = await fetchChannelWebhooks(channel);
		relayWebhooks[config.Servers[key].relaychannel] = webhook;
	}
	
	//Prepare status message.
	if(config.StatusChannelID.length >= 16) {
		const channel = client.channels.cache.get(config.StatusChannelID);
		statusMessage = await fetchStatusChannel(channel,readyClient.user.id);
	}
	
	console.log(`Bot started. Logged in as ${readyClient.user.tag}`);
	run().catch(console.log);
});

// Capture and relay logs.
receiver.on('log', async (log) => {
	const ip_and_port = log.receivedFrom.address + ':' + log.receivedFrom.port;
	debugLog('\n[LOG] Received log from: '+ip_and_port+'.');
	if(!serverChannelIDs[ip_and_port]){
		debugLog('[LOG] No channelID found, skipping.\n');
		return;
	}
	const channelID = serverChannelIDs[ip_and_port];
	const message = log.payload;
	const matched_message = message.match(/<[0-9]+><STEAM_[0-5]:[01]:\d+><Team>" (say|say_team) "/);
	if(!matched_message){
		// Lua errors.
		if(!config.ShowLuaErrors)
			return;
		const regex = /^(?:\d{2}\/\d{2}\/\d{4} - \d{2}:\d{2}:\d{2}: )(Lua Error:\s*\n\[ERROR\][\s\S]*)$/m;
		const matched_luaerror = message.match(regex);
		if(!matched_luaerror){
			debugLog('[LOG] Log does not match any of the criteria, skipping.\n');
			return;
		}
		debugLog('[LOG] Log is a Lua error.');
		const channel = client.channels.cache.get(channelID);
		const webhook = relayWebhooks[channelID];
		if(!webhook){
			debugLog('[LOG] Webhook not found or invalid, skipping.\n');
			return;
		}
		try{
			debugLog('[LOG] Sending Lua error to the webhook.\n');
			webhook.send({
				content: matched_luaerror[1],
				username: 'Lua Error',
			});
		}catch(error){
			console.error(error);
		}
		return;
	}else{
		debugLog('[LOG] Log is a chatlog.');
	}
	// Chat messages.
	const channel = client.channels.cache.get(channelID);
	const steamid = message.match(/STEAM_[0-5]:[01]:\d+/)[0].replace('<','').replace('>','');
	const username = message.match(/^.*?"(.*?)<\d+><STEAM_0:[01]:\d+><.*?>"/)[1];
	const content_match = message.match(/^.*?"[^"]*<\d+><STEAM_0:[01]:\d+><[^>]+>"\s+say(?:_team)?\s+"(.*)"/);
	if(!content_match || !content_match[1]){
		debugLog('[LOG] Chatlog invalid, skipping.\n');
		return;
	}
	const content = content_match[1].replace('@','@ ');
	if(channel){
		const avatar = await fetchAvatarUrl(steamid);
		const webhook = relayWebhooks[channelID];
		if(!webhook){
			debugLog('[LOG] Webhook not found or invalid, skipping.\n');
			return;
		}
		try{
			debugLog('[LOG] Sending chatlog to webhook.');
			webhook.send({
				content: content,
				username: username,
				avatarURL: avatar,
			});
		}catch(error){
			debugLog('[LOG] Sending failed, retrying.');
			webhook.send({
				content: ' '+content,
				username: username,
				avatarURL: avatar,
			});
		}
		debugLog('[LOG] Chatlog sent.\n');
	}else{
		debugLog('[LOG] Invalid channelID, skipping.\n');
	}
});



// Relays messages and detect commands.
client.on(Events.MessageCreate, async message => {
	if(!message.author.bot)
		debugLog('\n[MESSAGE] Received message from: '+message.author.globalName+'.');
	if(!serverChannelIDs[message.channelId] || !serverChannelIDs[message.channelId].ip || !serverChannelIDs[message.channelId].port || message.author.bot){
		if(!message.author.bot)
			debugLog('[MESSAGE] Message is not a part of the relay channels, skipping.\n');
		return;
	}
	const ip = serverChannelIDs[message.channelId].ip;
	const port = serverChannelIDs[message.channelId].port;
	const pass = serverChannelIDs[message.channelId].password;
	const author = message.author.id;
	const username = message.author.globalName;
	let content = message.content;
	
	for(var i in rconAliases){
		if(content.startsWith(rconAliases[i])){
			debugLog('[MESSAGE] Command detected.\n');
			if(!usersWhitelist[author]){
				debugLog('[MESSAGE] User does not have permission to execute commands, skipping.\n');
				return;
			}
			const command = content.substring(rconAliases[i].length, message.length).trim().replace('"',"'");
			const reply = await message.reply('Executing command : '+command);
			const result = await sendRCON(ip,port,pass,command);
			debugLog('[MESSAGE] Command executed.');
			if(!result || result.length <=0){
				reply.edit('Command executed but returned no results.');
				return;
			}
			reply.edit('```'+result.substring(0,1993)+'```');
			return;
		}
	}
	
	if(!ip || !port || !username || !author || !message || !content){
		debugLog('[MESSAGE] Invalid value detected (Either missing sender data, or invalid ip/port) ,skipping.\n');
		return;
	}
	
	if(content.length > config.MaxMessageLength){
		debugLog('[MESSAGE] Message is over the max message length, trimming message.');
		content = content.substring(0,config.MaxMessageLength);
		message.react('✂');
	}
	
	const usernameb64 = utf8ToBase64(username);
	const contentb64 = utf8ToBase64(content);
	const messageHash = generateHash(message.id);
	const startSize = relayCommand.length+2+usernameb64.length;
	if(contentb64.length <= 500 - startSize){  // For requests less 500 bytes in total, no chunking.
		debugLog('[MESSAGE] Message fits into a single request.');
		const command = relayCommand+' '+usernameb64+' '+contentb64;
		debugLog('[MESSAGE] Sending message to the server.');
		const result = await sendRCON(ip,port,pass,command);
		if( result.length>0 && result.toLowerCase().includes('error') ){
			debugLog('[MESSAGE] Server errored or has not responded.\n');
			message.react('❌');
			return;
		}
		debugLog('[MESSAGE] Message sucessfully sent to server.');
	}else{ // For requests over 500 bytes in total, chunking.
		debugLog('[MESSAGE] Message does not fit into a single request, chunking.');
		const chunkSize = 500 - (relayCommand.length+2+messageHash.length);
		const requestsAmount = Math.ceil(contentb64.length / chunkSize);
		// First request acts as a starting point with the username and an unique hash.
		const firstRequest_command = relayCommand+' 0 '+requestsAmount+' '+messageHash+' '+usernameb64;
		debugLog('[MESSAGE] Sending message chunks to the server.');
		const firstRequest = await sendRCON(ip,port,pass,firstRequest_command);
		debugLog('[MESSAGE] Chunk 0 sent.');
		if( firstRequest.length>0 && firstRequest.toLowerCase().includes('error') ){
			debugLog('[MESSAGE] Server errored or has not responded.\n');
			message.react('❌');
			return;
		}
		for(let i=1;i<=requestsAmount;i++){
			const chunk = contentb64.substring((i-1)*chunkSize,i*chunkSize);
			const command = relayCommand+' '+i+' '+messageHash+' '+chunk;
			await sendRCON(ip,port,pass,command);
			debugLog('[MESSAGE] Chunk '+i+' sent.');
		}
		debugLog('[MESSAGE] All chunks have been sent.\n');
	}
});



// Log in to Discord with your client's token.
client.login(config.DiscordBotToken);
