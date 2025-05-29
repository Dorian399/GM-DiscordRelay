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
	return new Promise((resolve,reject) => {
		const conn = new Rcon(ip,port,pass);
		let resolved = false;
		let result = '';
		let timeoutID;
		conn.on('auth',() => {
			conn.send(command);
		});
		conn.on('response',(str) => {
			if(timeoutID)
				clearTimeout(timeoutID);
			result += str;
			timeoutID = setTimeout(() => {
				if(!resolved){
					resolved=true;
					resolve(result);
					conn.disconnect();
				}
			}, 500);	
		});
		conn.on('error',(err) => {
			if(!resolved){
				resolved=true;
				resolve(err.toString());
			}
		});
		conn.on('end',() => {
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
	if(!config.SteamAPIKey || config.SteamAPIKey.length <20)
		return;
	if(avatarCache[steamid])
		return avatarCache[steamid];
	const steamidsplit = steamid.split(':');
	const X = parseInt(steamidsplit[0].replace('STEAM_', ''));
	const Y = parseInt(steamidsplit[1]);
	const Z = parseInt(steamidsplit[2]);
	const V = BigInt('76561197960265728');
	const steamid64 = (BigInt(Z) * 2n + BigInt(Y) + V).toString();
	let res = await fetch(`http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${config.SteamAPIKey}&steamids=${steamid64}`);
	let data = await res.json();
	avatarCache[steamid]=data.response.players[0].avatarfull;
	return avatarCache[steamid];
}


// Assigns an existing webhook or creates a new one if it doesn't exists.
async function fetchChannelWebhooks(channel) {
	try {
		const hooks = await channel.fetchWebhooks();
		let webhook = hooks.find(hook => hook.name === 'srcds_chat_relay');
		if(!webhook){
			webhook = await channel.createWebhook({
				name: 'srcds_chat_relay'
			});
		}
		return webhook;
	} catch (error) {
		console.error(error);
	}
}

// Set up webhooks for each server's channel.
let relayWebhooks = {};
client.once(Events.ClientReady, async readyClient => {
	for(var key in config.Servers){
		const channel = client.channels.cache.get(config.Servers[key].relaychannel);
		if(!channel)
			continue;
		const webhook = await fetchChannelWebhooks(channel);
		relayWebhooks[config.Servers[key].relaychannel] = webhook;
	}
	console.log(`Bot started. Logged in as ${readyClient.user.tag}`);
	run().catch(console.log);
});

// Capture and relay logs.
receiver.on('log', async (log) => {
	const ip_and_port = log.receivedFrom.address + ':' + log.receivedFrom.port;
	if(!serverChannelIDs[ip_and_port])
		return;
	const channelID = serverChannelIDs[ip_and_port];
	const message = log.payload;
	const matched_message = message.match(/<[0-9]+><STEAM_[0-5]:[01]:\d+><Team>" (say|say_team) "/);
	if(!matched_message){
		// Lua errors.
		if(!config.ShowLuaErrors)
			return;
		const regex = /^(?:\d{2}\/\d{2}\/\d{4} - \d{2}:\d{2}:\d{2}: )(Lua Error:\s*\n\[ERROR\][\s\S]*)$/m;
		const matched_luaerror = message.match(regex);
		if(!matched_luaerror)
			return;
		const channel = client.channels.cache.get(channelID);
		const webhook = relayWebhooks[channelID];
		if(!webhook)
			return;
		try{
			webhook.send({
				content: matched_luaerror[1],
				username: 'Lua Error',
			});
		}catch(error){
			console.error(error);
		}
		return;
	}
	// Chat messages.
	const channel = client.channels.cache.get(channelID);
	const steamid = message.match(/STEAM_[0-5]:[01]:\d+/)[0].replace('<','').replace('>','');
	const username = message.match(/^.*?"(.*?)<\d+><STEAM_0:[01]:\d+><.*?>"/)[1];
	const content_match = message.match(/^.*?"[^"]*<\d+><STEAM_0:[01]:\d+><[^>]+>"\s+say(?:_team)?\s+"(.*)"/);
	if(!content_match || !content_match[1])
		return;
	const content = content_match[1].replace('@','@ ');
	if(channel){
		const avatar = await fetchAvatarUrl(steamid);
		const webhook = relayWebhooks[channelID];
		if(!webhook)
			return;
		try{
			webhook.send({
				content: content,
				username: username,
				avatarURL: avatar,
			});
		}catch(error){
			webhook.send({
				content: ' '+content,
				username: username,
				avatarURL: avatar,
			});
		}
	}
});



// Relays messages and detect commands.
client.on(Events.MessageCreate, async message => {
	if(!serverChannelIDs[message.channelId] || !serverChannelIDs[message.channelId].ip || !serverChannelIDs[message.channelId].port || message.author.bot){
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
			if(!usersWhitelist[author])
				return;
			const command = content.substring(rconAliases[i].length, message.length).trim().replace('"',"'");
			const reply = await message.reply('Executing command : '+command);
			const result = await sendRCON(ip,port,pass,command);
			if(!result || result.length <=0){
				reply.edit('Command executed but returned no results.');
				return;
			}
			reply.edit('```'+result.substring(0,1993)+'```');
			return;
		}
	}
	
	if(!ip || !port || !username || !author || !message || !content)
		return;
	
	if(content.length > config.MaxMessageLength){
		content = content.substring(0,config.MaxMessageLength);
		message.react('✂');
	}
	
	const usernameb64 = utf8ToBase64(username);
	const contentb64 = utf8ToBase64(content);
	const messageHash = generateHash(message.id);
	const startSize = relayCommand.length+2+usernameb64.length;
	if(contentb64.length <= 500 - startSize){  // For requests less 500 bytes in total, no chunking.
		const command = relayCommand+' '+usernameb64+' '+contentb64;
		const result = await sendRCON(ip,port,pass,command);
		if( result.length>0 && result.toLowerCase().includes('error') ){
			message.react('❌');
		}
	}else{ // For requests over 500 bytes in total, chunking.
		const chunkSize = 500 - (relayCommand.length+2+messageHash.length);
		const requestsAmount = Math.ceil(contentb64.length / chunkSize);
		// First request acts as a starting point with the username and an unique hash.
		const firstRequest_command = relayCommand+' 0 '+requestsAmount+' '+messageHash+' '+usernameb64;
		const firstRequest = await sendRCON(ip,port,pass,firstRequest_command);
		if( firstRequest.length>0 && firstRequest.toLowerCase().includes('error') ){
			message.react('❌');
			return;
		}
		for(let i=1;i<=requestsAmount;i++){
			const chunk = contentb64.substring((i-1)*chunkSize,i*chunkSize);
			const command = relayCommand+' '+i+' '+messageHash+' '+chunk;
			await sendRCON(ip,port,pass,command);
		}
	}
});



// Log in to Discord with your client's token.
client.login(config.DiscordBotToken);
