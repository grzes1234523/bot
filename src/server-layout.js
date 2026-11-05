import { ChannelType } from 'discord.js';
const text = (key,name,extra={}) => ({key,name,type:ChannelType.GuildText,...extra});
const voice = (key,name,extra={}) => ({key,name,type:ChannelType.GuildVoice,...extra});
export const serverLayout = [
  {key:'statistics',name:'📊 STATYSTYKI',channels:[voice('online','🟢・online', {counter:true}),voice('members','👥・wszyscy',{counter:true}),voice('bots','🤖・boty',{counter:true})]},
  {key:'start',name:'👋 START',channels:[text('welcome','👋・powitania',{readOnly:true}),text('rules','📜・regulamin',{readOnly:true}),text('verification','✅・weryfikacja',{readOnly:true}),text('farewell','💔・pożegnania',{readOnly:true})]},
  {key:'info',name:'📢 INFORMACJE',channels:[text('announcements','📢・ogłoszenia',{readOnly:true}),text('events','📅・wydarzenia',{readOnly:true}),text('offers','🎁・oferty')]},
  {key:'community',name:'💬 SPOŁECZNOŚĆ',channels:[text('general','💬・ogólny'),text('introduce','👋・przedstaw-się'),text('media','📸・media'),text('memes','🤣・memy'),text('ideas','💡・pomysły')]},
  {key:'games',name:'🎮 ROZRYWKA',channels:[text('games','🎮・gry'),text('fun','🎲・zabawy'),text('millionaires','💎・milionerzy'),text('economy','💰・ekonomia'),text('rankings','🏆・rankingi',{readOnly:true})]},
  {key:'recruitment',name:'📋 REKRUTACJA',channels:[text('applications','📋・złóż-podanie',{readOnly:true}),text('reviews','🔒・podania-administracja',{private:true})]},
  {key:'help',name:'🎫 POMOC',channels:[text('tickets','🎫・zgłoszenia',{readOnly:true}),voice('waiting','🎫・poczekalnia')]},
  {key:'voice',name:'🔊 ROZMOWY',channels:[voice('lobby','🚀・Lobby'),voice('talk','🔊・Rozmowy'),voice('gaming','🎮・Gaming'),voice('music','🎧・Muzyka'),voice('afk','🌙・AFK'),voice('create','➕・Utwórz-pokój')]},
  {key:'admin',name:'🛡️ ADMINISTRACJA',private:true,channels:[text('admin','🛠️・administracja'),text('modchat','🛡️・mod-chat'),text('status','status-bota')]},
  {key:'logs',name:'📜 LOGI',private:true,channels:[text('moderation','logi-moderacji'),text('messages','logi-wiadomości'),text('voice','logi-głosowe'),text('members','logi-członków'),text('channels','logi-kanałów'),text('automod','logi-automod'),text('tickets','logi-ticketów'),text('recruitment','logi-rekrutacji')]},
];
export const layoutCount = () => serverLayout.reduce((sum,category) => sum+1+category.channels.length,0);

export function applyLayoutSettings(state,guildId,primaryGuildId,ids) {
  state.botStatusChannelId=ids['admin.status'];
  state.statisticsChannels = {categoryId:ids['category.statistics'],onlineChannelId:ids['statistics.online'],membersChannelId:ids['statistics.members'],botsChannelId:ids['statistics.bots'],panelChannelId:null,panelMessageId:null};
  state.autoChannels = {...state.autoChannels,joinChannelId:ids['voice.create'],categoryId:ids['category.voice'],createdIds:[]};
  state.voiceSupport = {...state.voiceSupport,channelId:ids['help.waiting']};
  state.logChannelId = ids['logs.moderation'];
  state.moderation={...state.moderation,logChannelId:ids['logs.moderation']};
  state.logging = {...state.logging,enabled:true,categoryId:ids['category.logs'],eventChannels:Object.fromEntries(['moderation','messages','voice','members','channels','automod'].map(key=>[key,ids[`logs.${key}`]]))};
  state.recruitment = {...state.recruitment,applicationChannelId:ids['recruitment.reviews'],logChannelId:ids['logs.recruitment']};
  state.verification = {...state.verification,channelId:ids['start.verification'],messageId:null};
  for (const [module,key] of [['welcome','welcome'],['farewell','farewell']]) {
    state[module] ??= {guilds:{}}; state[module].guilds ??= {};
    state[module].guilds[guildId] = {...state[module].guilds[guildId],categoryId:ids['category.start'],channelId:ids[`start.${key}`]};
  }
  state.community ??= {guilds:{}}; state.community.guilds ??= {};
  const community = state.community.guilds[guildId] ??= {};
  community.settings = {...community.settings,categoryId:ids['category.community'],ideasChannelId:ids['community.ideas']};
  state.levels ??= {guilds:{}}; state.levels.guilds ??= {};
  const levels = state.levels.guilds[guildId] ??= {users:{}};
  levels.settings = {...levels.settings,announcementChannelId:ids['games.rankings']};
  state.tickets.guildSettings ??= {};
  state.tickets.guildSettings[guildId] = {...state.tickets.guildSettings[guildId],categoryId:ids['category.help'],logChannelId:ids['logs.tickets']};
  for(const category of state.tickets.guildSettings[guildId].categories??[])category.categoryId=ids['category.help'];
  for (const panel of state.tickets.panels ?? []) if ((panel.guildId || primaryGuildId) === guildId) panel.active = false;
  if(guildId===primaryGuildId){state.tickets.categoryId=ids['category.help'];state.tickets.logChannelId=ids['logs.tickets'];}
}
