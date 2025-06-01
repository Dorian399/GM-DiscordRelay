# GM-DiscordRelay
A Discord bot that relays messages bidirectionally from and to your GMod server. Unlike most relays this one doesn't require any binary modules installed on your GMod server.
![image](https://github.com/user-attachments/assets/6cb20ca4-0947-4c9c-a6da-8e1bbf45e994)


It can also show your server's status.

![image](https://github.com/user-attachments/assets/386dea54-825a-471c-8f62-5bfadfea4a95)


## Features
- Relay in-game chat and other messages from multiple servers.
- Relay discord messages to your GMod server.
- Execute RCON commands from discord.
- Show live server status on a designated channel.

## Requirements
- A GMod server with RCON and logging working properly and [this addon](https://github.com/Dorian399/gm_discordrelay_addon) installed.
- Node.js v16 or higher.

## For developers
The relay also supports sending custom messages from your GMod server.
This can be useful for implementing gamemode specific functionality to the relay.
In order to send a custom message you can use the ```SendRelayMessage(string,string)``` function.
Example usage:
```
SendRelayMessage("Custom Username","Any message")
```
Result:

![image](https://github.com/user-attachments/assets/778e3447-6428-45f1-9db7-372373c0e02a)

## Installation
#### Setting up the bot itself.
1. Head over to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Press the "New Application" button and name the bot however you like.
3. Go to the "Bot" tab and check the "Message Content Intent" option, then click "Save changes".
![image](https://github.com/user-attachments/assets/a242f100-39b8-4014-bc6b-e8edb0f36d0d)
4. Go to "Installation" and copy the "Install Link".
![image](https://github.com/user-attachments/assets/4e101943-d8c4-4890-aec3-7299611c289d)
5. Paste the link into your address bar and add this snippet of text at the end ```&permissions=536938560&scope=bot``` and hit Enter.
![image](https://github.com/user-attachments/assets/7f0007c6-ce25-4fe2-a982-0aa46a416283)
6. Add the bot to your server.
7. After adding the bot to your server, go back to your bot's page and enter the "Bot" tab of your bot.
8. Click the "Reset Token" button and then copy the newly generated token.
![image](https://github.com/user-attachments/assets/d7484d11-7ac7-44f2-ba94-61aded0f3392)
9. Save the token for later, as you will need it in later steps.
10. Head over to (https://steamcommunity.com/dev/apikey).
11. Create an API key and then copy and save it for later.
12. Clone this repository with the ```git clone https://github.com/Dorian399/GM-DiscordRelay.git``` command.
13. Go to the repo's main directory. (```cd "GM-DiscordRelay"```).
14. Edit the `config.cjs` file in a text editor and configure everything to your liking.
15. If you have any trouble figuring what to put as the channel ID's or User ID's, you can follow [this guide](https://docs.statbot.net/docs/faq/general/how-find-id/) to find those.
16. Everything is set up, you can launch the bot using ```node index.js```.

#### Setting up the GMod server.
1. Open your `server.cfg` in a text editor.
2. Add these commands to your `server.cfg`:
```log on
logaddress_add IP:PORT
sv_logecho 0
```
The IP and PORT values should be changed to the ip and port your bot is hosted on.

3. If you don't have an RCON password set, you can set it by adding ```rcon_password yourpassword``` to your `server.cfg` file.
4. Save and exit the `server.cfg` file.
5. Go to your server's addons folder.
6. Download the required addon using this command: ```git clone https://github.com/Dorian399/gm_discordrelay_addon.git```.
7. Everything is set up, you can start your GMod server.


