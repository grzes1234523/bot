import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from 'discord.js';
import fs from 'node:fs';
import { createLevelSystem, levelDefaults, levelForXp, xpForLevel, validateLevelSettings, levelCommands, levelRanking, buildLevelCard, buildRankingEmbed } from '../src/levels.js';

function fixture(extra = {}) {
  let time = 1000000;
  let state = { levels: { guilds: {} } };
  const store = { snapshot: () => structuredClone(state), update: async fn => fn(state) };
  const guild = { id: 'guild', afkChannelId: 'afk', voiceStates: { cache: new Collection() }, roles: { cache: new Collection() } };
  const client = { guilds: { cache: new Map([['guild', guild]]) } };
  const member = id => ({ id, user: { id, username: id, bot: false }, displayName: id, guild, roles: { cache: new Collection(), add: async role => roleAdds.push([id, role.id]) } });
  const a = member('a'), b = member('b');
  const channel = { members: new Collection([['a', a], ['b', b]]) };
  for (const member of [a, b]) {
    member.voice = { id: member.id, member, guild, channelId: 'voice', channel, mute: false, deaf: false, suppress: false };
    guild.voiceStates.cache.set(member.id, member.voice);
  }
  const roleAdds = [];
  const system = () => createLevelSystem({ client, featureStore: store, guildId: 'guild', now: () => time, ...extra });
  const message = () => ({ guildId: 'guild', author: a.user, member: a });
  return { system, store, a, b, guild, roleAdds, message, advance: ms => { time += ms; } };
}

test('progi poziomów i rejestracja komend', () => {
  assert.equal(xpForLevel(2), 400);
  for (const [xp, level] of [[0, 0], [99, 0], [100, 1], [399, 1], [400, 2]]) assert.equal(levelForXp(xp), level);
  assert.deepEqual(levelCommands.map(c => c.toJSON().name), ['level', 'poziom', 'ranking', 'poziomy-ustaw']);
});
test('XP za wiadomości respektuje cooldown także po restarcie i ignoruje boty oraz inne serwery', async () => {
  const f = fixture();
  await f.system().message(f.message());
  await f.system().message(f.message());
  assert.equal(levelRanking(f.store.snapshot(), 'guild')[0].xp, 15);
  f.advance(60000);
  await f.system().message({ ...f.message(), author: { ...f.a.user, bot: true } });
  await f.system().message({ ...f.message(), guildId: 'other' });
  await f.system().message({ ...f.message(), webhookId: 'hook' });
  assert.equal(levelRanking(f.store.snapshot(), 'guild')[0].xp, 15);
  await f.system().message(f.message());
  assert.equal(levelRanking(f.store.snapshot(), 'guild')[0].xp, 30);
});
test('rozmowy przyznają XP po minucie, restart nie nalicza czasu offline', async () => {
  const f = fixture(); const system = f.system();
  await system.tick(); f.advance(60000); await system.tick();
  assert.deepEqual(levelRanking(f.store.snapshot(), 'guild').map(u => u.xp), [5, 5]);
  const restarted = f.system(); f.advance(3600000); await restarted.tick();
  assert.equal(levelRanking(f.store.snapshot(), 'guild')[0].xp, 5);
  f.advance(60000); await restarted.tick();
  assert.equal(levelRanking(f.store.snapshot(), 'guild')[0].xp, 10);
});
test('samotna osoba, AFK i wyciszenie nie otrzymują głosowego XP', async () => {
  const f = fixture(); const system = f.system();
  await system.tick();
  f.b.voice.mute = true; f.advance(60000); await system.tick();
  assert.equal(levelRanking(f.store.snapshot(), 'guild').length, 0);
  f.b.voice.mute = false;
  f.a.voice.channelId = 'afk'; f.b.voice.channelId = 'afk';
  f.advance(60000); await system.tick();
  assert.equal(levelRanking(f.store.snapshot(), 'guild').length, 0);
});
test('wyjście z rozmowy resetuje niepełną minutę i nagrody roli są nadawane po progu', async () => {
  const f = fixture(); const system = f.system();
  await system.tick(); f.advance(30000);
  const old = { ...f.b.voice };
  f.a.voice.channel.members.delete('b');
  f.b.voice = { ...old, channel: null, channelId: null };
  system.voiceState(old, f.b.voice);
  f.advance(30000); await system.tick();
  assert.equal(levelRanking(f.store.snapshot(), 'guild').length, 0);
  const roleId = '123456789012345678';
  await f.store.update(state => { state.levels.guilds.guild = { users: { a: { xp: 90, messageCount: 0, voiceMinutes: 0 } }, settings: { ...levelDefaults, rewards: [{ level: 1, roleId }] } }; });
  f.guild.roles.cache.set(roleId, { id: roleId, editable: true, managed: false });
  await system.message(f.message());
  assert.deepEqual(f.roleAdds, [['a', roleId]]);
});
test('walidacja panelu odrzuca nadmierne XP, duplikaty ról i błędne typy', () => {
  assert.doesNotThrow(() => validateLevelSettings(levelDefaults));
  assert.throws(() => validateLevelSettings({ ...levelDefaults, messageXp: 1001 }));
  assert.throws(() => validateLevelSettings({ ...levelDefaults, enabled: 'true' }));
  const reward = { level: 2, roleId: '123456789012345678' };
  assert.throws(() => validateLevelSettings({ ...levelDefaults, rewards: [reward, reward] }));
});

test('powiadomienie trafia na wybrany kanał tylko po przekroczeniu poziomu', async () => {
  const f = fixture(); const sent = [];
  const channelId = '123456789012345679';
  f.guild.channels = { fetch: async id => { assert.equal(id, channelId); return { isTextBased: () => true, send: async payload => sent.push(payload) }; } };
  await f.store.update(state => { state.levels.guilds.guild = { settings: { ...levelDefaults, announcementChannelId: channelId }, users: { a: { xp: 90, messageCount: 0, voiceMinutes: 0 } } }; });
  const system = f.system();
  await system.message(f.message());
  assert.equal(sent.length, 1);
  assert.match(sent[0].content, /awansował\(a\) na poziom \*\*1\*\*/);
  assert.deepEqual(sent[0].allowedMentions, { parse: [], users: ['a'] });
  f.advance(60000); await system.message(f.message());
  assert.equal(sent.length, 1);
});

test('błąd kanału nie odbiera XP; pusta konfiguracja wyłącza powiadomienia', async () => {
  const f = fixture();
  f.guild.channels = { fetch: async () => { throw new Error('Missing Access'); } };
  await f.store.update(state => { state.levels.guilds.guild = { settings: { ...levelDefaults, announcementChannelId: '123456789012345679' }, users: { a: { xp: 90, messageCount: 0, voiceMinutes: 0 } } }; });
  await f.system().message(f.message());
  assert.equal(levelRanking(f.store.snapshot(), 'guild')[0].xp, 105);
  assert.equal(validateLevelSettings({ ...levelDefaults, announcementChannelId: '' }).announcementChannelId, null);
  assert.throws(() => validateLevelSettings({ ...levelDefaults, announcementChannelId: 'zly-kanal' }));
});

test('karta pokazuje lokalny avatar, ranking oraz XP w bieżącym poziomie',()=>{
 const card=buildLevelCard({user:{username:'Gracz',displayAvatarURL:()=> 'https://cdn.discordapp.com/avatar.png'},member:{displayName:'Nazwa serwerowa',displayAvatarURL:()=> 'https://cdn.discordapp.com/guild.png'},account:{xp:105,messageCount:7,voiceMinutes:2},rank:3,guild:{name:'Strefa'},timestamp:1000000}).toJSON();
 assert.equal(card.title,'Karta poziomu');assert.equal(card.thumbnail.url,'https://cdn.discordapp.com/guild.png');assert.equal(card.color,0x9d5cff);
 assert.match(card.description,/User:\*\* Nazwa serwerowa/);assert.match(card.description,/Level:\*\* 1/);assert.match(card.description,/5 \/ 300 XP/);assert.match(card.description,/LEVEL 1/);assert.match(card.description,/Następny: Poziom 2/);assert.equal(card.description.match(/[█░]/g).length,20);assert.match(card.footer.text,/Strefa.*#3.*105 XP.*7.*2 min/);
});
test('karta nowej osoby nie wymyśla miejsca w rankingu, próg rozpoczyna nowy pasek',()=>{
 for(const xp of [0,100,400]){const card=buildLevelCard({user:{username:'Nowy'},account:{xp},rank:null}).toJSON();assert.match(card.footer.text,/Ranking —/);assert.equal(card.description.includes('█'),false);assert.match(card.description,/░{20}/);}
});
test('level i poziom pokazują kartę wybranej osoby bez zmiany jej XP',async()=>{
 const f=fixture();await f.store.update(s=>{s.levels.guilds.guild={users:{a:{xp:105,messageCount:1,voiceMinutes:0},b:{xp:500}},settings:levelDefaults};});
 for(const commandName of ['level','poziom']){let reply;const calls=[];await f.system().command({commandName,guildId:'guild',guild:f.guild,user:f.b.user,options:{getUser:()=>f.a.user,getMember:()=>f.a},deferReply:async()=>{calls.push('defer');},editReply:async payload=>{reply=payload;calls.push('edit');},reply:async payload=>{reply=payload;calls.push('reply');}});assert.equal(calls[0],'defer');if(reply.files?.[0]){assert.equal(reply.files[0].name,'poziom.png');assert.equal(reply.files[0].attachment[0],0x89);}else{assert.match(reply.embeds[0].toJSON().description,/Następny: Poziom/);assert.match(reply.embeds[0].toJSON().footer.text,/Ranking #2/);}assert.deepEqual(reply.allowedMentions,{parse:[]});}
 assert.equal(levelRanking(f.store.snapshot(),'guild').find(u=>u.id==='a').xp,105);
});
test('podgląd strony używa układu User, Level, Profil i paska XP',()=>{
 const html=fs.readFileSync(new URL('../src/panel/poziomy-podglad.html',import.meta.url),'utf8');
 for(const label of ['User:','Level:','Profil:','LEVEL','progressbar'])assert.match(html,new RegExp(label));
 assert.match(html,/0 \/ 100 XP/);
 assert.match(fs.readFileSync(new URL('../src/panel/index.html',import.meta.url),'utf8'),/href="\/poziomy-podglad"/);
});
test('ranking TOP 10 jest malejący, ma medale i miejsce wołającego poza dziesiątką',()=>{
 const users={};
 for(let i=1;i<=12;i++) users['u'+i]={xp:(13-i)*10,name:'Gracz '+i,messageCount:0,voiceMinutes:0};
 const ranking=levelRanking({levels:{guilds:{g:{users}}}},'g');
 assert.deepEqual(ranking.map(user=>user.xp),[120,110,100,90,80,70,60,50,40,30,20,10]);
 const top=buildRankingEmbed(ranking,'u1').toJSON();
 assert.equal(top.title,'🏆 Ranking TOP 10');
 assert.match(top.description,/🥇/);
 assert.match(top.description,/🥈/);
 assert.match(top.description,/🥉/);
 assert.match(top.description,/\*\*4\.\*\*/);
 assert.equal(top.description.includes('Twoje miejsce'),false);
 assert.equal((top.description.match(/Gracz /g)||[]).length,10);
 const outside=buildRankingEmbed(ranking,'u12').toJSON();
 assert.match(outside.description,/Twoje miejsce: \*\*#12\*\*/);
 assert.match(outside.description,/\*\*10 XP\*\*/);
 const none=buildRankingEmbed(ranking,'brak').toJSON();
 assert.match(none.description,/poza rankingiem/);
});
test('błąd rysowania po deferReply wysyła zapasowy embed',async()=>{
 const logs=[];
 const f=fixture({renderLevelCard:async()=>{throw new Error('canvas padł');},levelCardLog:message=>logs.push(message)});
 let reply;const calls=[];
 await f.system().command({commandName:'poziom',guildId:'guild',guild:f.guild,user:f.a.user,options:{getUser:()=>null},deferReply:async()=>{calls.push('defer');},editReply:async payload=>{reply=payload;},reply:async payload=>{reply=payload;calls.push('reply');}});
 assert.deepEqual(calls,['defer']);
 assert.match(reply.embeds[0].toJSON().description,/Następny: Poziom/);
 assert.match(logs[0],/\[poziom\]/);
});
test('zbyt długie rysowanie karty kończy się embedem',async()=>{
 const logs=[];
 const f=fixture({renderLevelCard:()=>new Promise(resolve=>setTimeout(()=>resolve(Buffer.from([0x89])),200)),levelCardTimeoutMs:20,levelCardLog:message=>logs.push(message)});
 const started=Date.now();
 let reply;
 await f.system().command({commandName:'level',guildId:'guild',guild:f.guild,user:f.a.user,options:{getUser:()=>null},deferReply:async()=>{},editReply:async payload=>{reply=payload;},reply:async()=>{throw new Error('po defer nie wolno użyć reply');}});
 assert.ok(Date.now()-started<1000);
 assert.match(reply.embeds[0].toJSON().description,/Następny: Poziom/);
 assert.match(logs[0],/\[poziom\].*limit czasu/);
});
test('renderer karty zwraca PNG albo jest pomijany bez canvas',async t=>{
 let render;
 try{({renderLevelCardPng:render}=await import('../src/level-card.js'));}
 catch{t.skip('Biblioteka canvas jest niedostępna');return;}
 const png=await render({displayName:'Żółć',username:'zolc',level:1,progress:40,needed:300});
 assert.ok(Buffer.isBuffer(png));
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
});
test('awans wysyła jedną kartę końcowego poziomu na kanał wiadomości albo powiadomień', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const source = [];
  const announced = [];
  const sourceChannel = { isTextBased: () => true, send: async payload => source.push(payload) };
  const f = fixture({ renderLevelCard: async card => { assert.equal(card.account.xp, 1000); return png; } });
  f.guild.channels = { fetch: async () => ({ isTextBased: () => true, isThread: () => false, send: async payload => announced.push(payload) }) };
  await f.store.update(state => { state.levels.guilds.guild = { settings: { ...levelDefaults, messageXp: 1000 }, users: { a: { xp: 0, messageCount: 0, voiceMinutes: 0 } } }; });
  await f.system().message({ ...f.message(), channel: sourceChannel });
  assert.equal(source.length, 1);
  assert.equal(announced.length, 0);
  assert.match(source[0].content, /<@a> awansował\(a\) na poziom \*\*3\*\*/);
  assert.equal(source[0].files[0].name, 'poziom.png');
  assert.equal(source[0].files[0].attachment[0], 0x89);
  assert.deepEqual(source[0].allowedMentions, { parse: [], users: ['a'] });
  await f.store.update(state => { state.levels.guilds.guild.settings.announcementChannelId = '123456789012345679'; state.levels.guilds.guild.users.a.xp = 0; });
  f.advance(60000);
  await f.system().message({ ...f.message(), channel: sourceChannel });
  assert.equal(announced.length, 1);
  assert.equal(source.length, 1);
  assert.match(announced[0].content, /poziom \*\*3\*\*/);
  assert.match(fs.readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8'), /id="levelAnnounceCard"[^>]*>\s*Wysyłaj kartę przy awansie/);
  assert.equal(validateLevelSettings({ ...levelDefaults, announceCard: false }).announceCard, false);
  assert.equal(validateLevelSettings({ ...levelDefaults, announceCard: undefined }).announceCard, true);
});
test('błąd i limit czasu karty awansu zostawiają dotychczasowy tekst', async () => {
  const logs = [];
  const sent = [];
  const channel = { isTextBased: () => true, send: async payload => sent.push(payload) };
  const failing = fixture({ renderLevelCard: async () => { throw new Error('canvas padł'); }, levelCardLog: message => logs.push(message) });
  await failing.store.update(state => { state.levels.guilds.guild = { settings: { ...levelDefaults }, users: { a: { xp: 90, messageCount: 0, voiceMinutes: 0 } } }; });
  await failing.system().message({ ...failing.message(), channel });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].files, undefined);
  assert.match(sent[0].content, /zdobywa \*\*poziom 1\*\*/);
  assert.match(logs[0], /\[poziom\].*canvas padł/);
  assert.equal(levelRanking(failing.store.snapshot(), 'guild')[0].xp, 105);
  const slow = [];
  const timed = fixture({
    renderLevelCard: () => new Promise(resolve => setTimeout(() => resolve(Buffer.from([0x89, 0, 0, 0, 0, 0, 0, 0])), 200)),
    levelCardTimeoutMs: 20,
    levelCardLog: message => logs.push(message),
  });
  const slowChannel = { isTextBased: () => true, send: async payload => slow.push(payload) };
  await timed.store.update(state => { state.levels.guilds.guild = { settings: { ...levelDefaults, announceCard: true }, users: { a: { xp: 90, messageCount: 0, voiceMinutes: 0 } } }; });
  const started = Date.now();
  await timed.system().message({ ...timed.message(), channel: slowChannel });
  assert.ok(Date.now() - started < 1000);
  assert.match(slow[0].content, /zdobywa \*\*poziom 1\*\*/);
  assert.match(logs.at(-1), /\[poziom\].*limit czasu/);
  const quiet = [];
  const muted = fixture({ renderLevelCard: async () => { throw new Error('nie powinno rysować'); } });
  const quietChannel = { isTextBased: () => true, send: async payload => quiet.push(payload) };
  await muted.store.update(state => { state.levels.guilds.guild = { settings: { ...levelDefaults, announceCard: false }, users: { a: { xp: 90, messageCount: 0, voiceMinutes: 0 } } }; });
  await muted.system().message({ ...muted.message(), channel: quietChannel });
  assert.equal(quiet.length, 0);
  assert.equal(levelRanking(muted.store.snapshot(), 'guild')[0].xp, 105);
});
