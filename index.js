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
import query from 'source-server-query';
import Rcon from 'rcon';
const config = await import('./config.cjs'); 
const relayCommand = 'say_relay';


// Specifies the users that can use commands.
let usersWhitelist = {};
for (const key in config.AllowedForCommands) {
	usersWhitelist[config.AllowedForCommands[key]] = true;
}

// Specifies the channel id's relations to specific servers for fast lookup when relaying messages and rcon commands.
let serverChannelIDs = {};
for (const key in config.Servers) {
	const ip_and_port = config.Servers[key].ip + ':' + config.Servers[key].port
	serverChannelIDs[ip_and_port] = config.Servers[key].relaychannel;
	serverChannelIDs[config.Servers[key].relaychannel] = {ip: config.Servers[key].ip,port: config.Servers[key].port,password: config.Servers[key].password};
}

// Creates a log listener.
const receiver = new SrcdsLogReceiver({
	hostname: '0.0.0.0',
	port: config.RelayPort,
	onlyRegisteredServers: true,
});


// Add servers to log whitelist
let serversToAdd = []
for(const key in config.Servers){
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

// Creates a hh:mm:ss format out of seconds.
function formatSecondsToHHMMSS(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
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
	try{
		const steamidsplit = steamid.split(':');
		const X = parseInt(steamidsplit[0].replace('STEAM_', ''));
		const Y = parseInt(steamidsplit[1]);
		const Z = parseInt(steamidsplit[2]);
		const V = BigInt('76561197960265728');
		const steamid64 = (BigInt(Z) * 2n + BigInt(Y) + V).toString();
		let res = await fetch(`http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${config.SteamAPIKey}&steamids=${steamid64}`);
		if (!res.ok) {
			debugLog('[AVATAR] Avatar fetch failed.\n');
			debugLog(res);
			return;
		}
		let data = await res.json();
		avatarCache[steamid]=data.response.players[0].avatarfull;
		debugLog('[AVATAR] Avatar fetched successfully.\n');
		return avatarCache[steamid];
	}catch(err){
		debugLog('[AVATAR] Avatar fetch failed.');
		console.error(err);
	}
}


// Assigns an existing webhook or creates a new one if it doesn't exists.
async function fetchChannelWebhooks(channel,botid) {
	if(!channel){
		debugLog("\n[WEBHOOK] Invalid relay channel.");
		return;
	}
	debugLog('\n[WEBHOOK] Retrieving webhook for channel: '+channel.name+'.');
	try {
		const hooks = await channel.fetchWebhooks();
		let webhook = hooks.find(hook => hook.name == 'srcds_chat_relay' && hook.owner.id == botid);
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

// Generates and returns the string that will be used for the status message.
async function generateStatusMessage() {
	let completeMessage = '';
	let serverMessage;
	debugLog("[STATUS] Fetching servers info.");
	for (const server of Object.values(config.Servers)) {
		const { ip,publicip,port } = server;
		serverMessage='';
		try{
			const info = await query.info(ip, port, 1000);
			let players = await query.players(ip, port, 1000);
			const maxUsernameLength = 22; // this prevents word wrap on mobile.
			const joiningPlayerUsername = 'JoiningPlayer';
			let playersTable = '';
			const separator = '|';
			
			serverMessage = `**${info.name}**
			[${publicip}:${port}](https://vauff.com/connect.php?ip=${publicip}:${port})
			**${info.players}** ${info.players == 1 ? 'person is' : 'people are'} playing on map **${info.map}**`.replace(/^\t+/gm, '');
			
			if(info.players == 0){
				serverMessage=serverMessage+'\n\n';
				completeMessage = completeMessage+serverMessage;
				debugLog("[STATUS] Fetched server info.");
				continue;
			}
			
			// replaces empty strings with 'JoiningPlayer'.
			players=players.map(e => ({ ...e, name: e.name ? e.name : joiningPlayerUsername }));
			
			let longestUsernameLength = Math.max(...players.map(player => player.name.length))+1;
			
			if(longestUsernameLength>maxUsernameLength)
				longestUsernameLength=maxUsernameLength;
			
			for (const ply of Object.values(players)) {
				const { name,duration } = ply;
				let paddedName;
				if(name.length >= longestUsernameLength){
					paddedName=name.substring(0,longestUsernameLength-1)+' ';
				}else{
					paddedName=name.padEnd(longestUsernameLength);
				}
				const formattedDuration = ' '+formatSecondsToHHMMSS(parseInt(duration));
				playersTable = playersTable+paddedName+separator+formattedDuration+'\n';
			}
			
			serverMessage = serverMessage+'\n```'+playersTable.trimEnd()+'```\n\n';
			
			completeMessage = completeMessage+serverMessage;
			
			debugLog("[STATUS] Fetched server info.");
		}catch(err){
			debugLog("[STATUS] Failed to fetch server info.");
			console.error(err);
		}
	}
	if(completeMessage.length == 0) {
		debugLog("[STATUS] servers appears to be offline.\n\n");
		completeMessage = 'Server is offline.';
	};
	debugLog("[STATUS] Fetched all servers info.\n\n");
	return completeMessage;
}

// Creates/Assigns the status message.
async function fetchStatusChannel(channel,botid) {
	if(!channel){
		debugLog('\n[STATUS] Invalid channel ID.\n');
		return;
	}
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
	for(const key in config.Servers){
		const channel = client.channels.cache.get(config.Servers[key].relaychannel);
		if(!channel){
			debugLog("\n[WEBHOOK] Invalid relay channel id: "+config.Servers[key].relaychannel+'.');
			continue;
		}
		const webhook = await fetchChannelWebhooks(channel,readyClient.user.id);
		relayWebhooks[config.Servers[key].relaychannel] = webhook;
	}
	
	//Prepare status message.
	if(config.StatusChannelID && config.StatusChannelID.length >= 16) {
		try{
			const channel = client.channels.cache.get(config.StatusChannelID);
			statusMessage = await fetchStatusChannel(channel,readyClient.user.id);
			
			const statustext = await generateStatusMessage();
			statusMessage.edit(statustext);
			debugLog("[STATUS] Status message updated.");
			setInterval( async () => {
				if(!statusMessage){
					debugLog("[STATUS] Status message not found.");
					return;
				}
				const statustext = await generateStatusMessage();
				statusMessage.edit(statustext);
				debugLog("[STATUS] Status message updated.");
			},config.StatusRefreshTime*1000);
		}catch(err){
			debugLog("[STATUS] Status message failed to create (Probably invalid channel ID).");
			console.error(err);
		}
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
	let username = '';
	let content = '';
	let steamid = '';
	const chatlog_match = message.match(/<[0-9]+><STEAM_[0-5]:[01]:\d+><Team>" (say|say_team) "/);
	const luaerror_match = message.match(/^(?:\d{2}\/\d{2}\/\d{4} - \d{2}:\d{2}:\d{2}: )(Lua Error:\s*\n\[ERROR\][\s\S]*)$/m);
	const custommessage_match = message.match(/<CustomRelayMessage><([^<>]*)><([^<>]*)>/);
	
	console.log(message);
	
	if(chatlog_match){ // Chat messages.
	
		debugLog('[LOG] Log is a chatlog.');
	
		const content_match = message.match(/^.*?"[^"]*<\d+><STEAM_0:[01]:\d+><[^>]+>"\s+say(?:_team)?\s+"(.*)"/);
		if(!content_match || !content_match[1]){
			debugLog('[LOG] Chatlog invalid, skipping.\n');
			return;
		}
		username = message.match(/^.*?"(.*?)<\d+><STEAM_0:[01]:\d+><.*?>"/)[1];
		steamid = message.match(/STEAM_[0-5]:[01]:\d+/)[0].replace('<','').replace('>','');
		content = content_match[1].replace('@','@ ');
		
		for(const val of config.MessagesStartsWithBlacklist.values()){
			if(content.trim().startsWith(val)){
				debugLog('[LOG] Chatlog starts with a character/string included in the blacklist, skipping.\n');
				return;
			}
		}
		
	}else if(luaerror_match){ // Lua errors.
	
		if(!config.ShowLuaErrors){
			debugLog('[LOG] Log does not match any of the criteria, skipping.\n');
			return;
		}
		debugLog('[LOG] Log is a lua error.');
		username = 'Lua Error';
		content = luaerror_match[1];
		
	}else if(custommessage_match){ // Custom message.
		
		debugLog('[LOG] Log is a custom message.');
		const usernameMatch = message.match(/<CustomRelayMessage><([^>]+)>/);
		const contentMatch = message.match(/<CustomRelayMessage><[^>]+><([^>]+)>/);
		username = atob(usernameMatch ? usernameMatch[1] : 'Tm9Vc2VybmFtZQ==');
		content = atob(contentMatch ? contentMatch[1] : 'Tm9NZXNzYWdl');
		
	}else{ // Does not match anything.
	
		debugLog('[LOG] Log does not match any of the criteria, skipping.\n');
		return;
	}
	const channel = client.channels.cache.get(channelID);
	if(channel){
		let avatar;
		if(steamid.length > 0){
			avatar = await fetchAvatarUrl(steamid);
		}
		const webhook = relayWebhooks[channelID];
		if(!webhook){
			debugLog('[LOG] Webhook not found or invalid, skipping.\n');
			return;
		}
		try{
			debugLog('[LOG] Sending message to webhook.');
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
		debugLog('[LOG] Message sent.\n');
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
	
	if(Array.isArray(config.rconCommands)){
		for(const i in config.rconCommands){
			if(content.startsWith(config.CommandPrefix+config.rconCommands[i])){
				debugLog('[MESSAGE] Command detected.\n');
				if(!usersWhitelist[author]){
					debugLog('[MESSAGE] User does not have permission to execute commands, skipping.\n');
					return;
				}
				const command = content.substring(config.CommandPrefix.length+config.rconCommands[i].length, message.length).trim();
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
	};
	
	if(!ip || !port || !username || !author || !message || !content){
		debugLog('[MESSAGE] Invalid value detected (Either missing sender data, or invalid ip/port) ,skipping.\n');
		return;
	}
	
	if(content.length > config.MaxMessageLength){
		debugLog('[MESSAGE] Message is over the max message length, trimming message.');
		content = content.substring(0,config.MaxMessageLength);
		message.react('✂');
		if(config.AnnounceMessageTrim){
			message.reply('Your message exceeds the '+config.MaxMessageLength+' character limit and has been cut off at "...'+content.substring(content.length-50,content.length)+'".');
		}
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
