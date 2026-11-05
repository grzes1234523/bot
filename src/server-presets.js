import { ChannelType } from 'discord.js';
import { serverLayout } from './server-layout.js';

const category=key=>serverLayout.find(c=>c.key===key);
const text=name=>({name,type:ChannelType.GuildText});
const voice=name=>({name,type:ChannelType.GuildVoice});
const group=(key,name,channels)=>({key,name,channels});
const core=['👑 Właściciel','🛡️ Administrator','🛡️ Moderator','🎮 Gracz','🤖 Bot'];
export const serverPresets={
  prosty:{name:'1. Prosty i czytelny',roles:[...core,'👤 Gość'],categories:[
    category('start'),group('community','💬 SPOŁECZNOŚĆ',[text('💬・ogólny'),text('🤣・memy'),text('💡・pomysły')]),
    group('voice','🔊 GŁOSOWE',[voice('🚀・Lobby'),voice('🔊・Rozmowy')]),category('help'),category('admin')
  ]},
  gaming:{name:'2. Gamingowy',roles:[...core,'⭐ VIP','Minecraft','CS2','Fortnite'],categories:[
    category('start'),category('info'),group('gaming','🎮 GRY',[text('🔎・szukam-ekipy'),text('⛏️・minecraft'),text('🎯・cs2'),text('🪂・fortnite')]),
    group('fun','🎲 ZABAWY',[text('💎・milionerzy'),text('🧠・quizy'),text('💰・ekonomia')]),
    group('voice','🔊 GŁOSOWE',[voice('🚀・Lobby'),voice('🎮・Ekipa-1'),voice('🎮・Ekipa-2'),voice('➕・Utwórz-pokój')]),category('help'),category('admin'),category('logs')
  ]},
  spolecznosc:{name:'3. Rozbudowana społeczność',roles:[...core,'🛟 Pomocnik','⭐ VIP','👤 Gość','REKRUTACYJNY'],categories:serverLayout},
  wydarzenia:{name:'4. Strefa z wydarzeniami',roles:[...core,'📅 Organizator','⚔️ Kapitan','🎟️ Uczestnik','🏆 Zwycięzca'],categories:[
    category('start'),group('players','🎮 STREFA GRACZA',[text('💬・rozmowy'),text('📸・multimedia'),text('💡・propozycje')]),
    group('tournaments','🏆 TURNIEJE',[text('📋・zapisy'),text('⚔️・drużyny'),text('🏅・wyniki')]),
    group('events','📅 WYDARZENIA',[text('🗓️・kalendarz'),text('🎁・konkursy')]),category('help'),
    group('voice','🔊 GŁOSOWE',[voice('🎤・Scena'),voice('⚔️・Drużyna-1'),voice('⚔️・Drużyna-2'),voice('➕・Utwórz-pokój')]),category('admin'),category('logs')
  ]}
};
export const presetChoices=Object.entries(serverPresets).map(([value,preset])=>({name:preset.name,value}));
