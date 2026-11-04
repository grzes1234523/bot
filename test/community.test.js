import test from 'node:test';
import assert from 'node:assert/strict';
import { communityCommands, communityGuild, createCommunitySystem, decideIdea, saveCommunitySettings } from '../src/community.js';
import { ChannelType } from 'discord.js';

function fixture() {
  const state = {}; communityGuild(state, 'guild');
  const featureStore = { snapshot: () => structuredClone(state), update: async fn => fn(state) };
  const calls = [], edits = [];
  const channel = { type: ChannelType.GuildText, parentId: 'category', permissionsFor: () => ({ has: () => true }), send: async payload => { calls.push(payload);return { id: 'message', url: 'https://discord.com/channels/guild/channel/message', delete: async () => {} }; }, messages: { fetch: async () => ({ edit: async payload => edits.push(payload) }) } };
  const guild = { id: 'guild', members: { me: {} }, channels: { fetch: async id => id === 'category' ? { type: ChannelType.GuildCategory } : channel } };
  const i = { guildId: 'guild', guild, channelId: 'channel', user: { id: 'user' }, commandName: 'pomysl', options: { getString: () => 'Pomysł na nowy kanał' }, deferReply: async () => {}, editReply: async payload => calls.push(payload), reply: async payload => calls.push(payload), message: { id: 'message', edit: async payload => edits.push(payload) } };
  const system = () => createCommunitySystem({ featureStore, guildId: 'guild', now: () => 1000000 });
  return { state, featureStore, calls, edits, guild, channel, i, system };
}
test('komendy zabaw i pomysłów mają poprawne opcje', () => {
  assert.deepEqual(communityCommands.map(c => c.toJSON().name), ['zabawa','pomysl']);
  assert.equal(communityCommands[0].toJSON().options.length, 3);
});
test('konfiguracja odrzuca kanał w innej kategorii', async () => {
  const f = fixture();f.channel.parentId = 'inna';
  await assert.rejects(saveCommunitySettings({ ...f, body: { gamesEnabled: true, ideasEnabled: true, categoryId: 'category', ideasChannelId: 'channel' } }), /kategorii/);
});
test('pomysł jest publikowany, zapisany i chroniony przed powtórzeniem w minucie', async () => {
  const f = fixture();f.state.community.guilds.guild.settings.ideasChannelId='channel';
  await f.system().command(f.i);
  assert.equal(f.state.community.guilds.guild.ideas.length, 1);
  assert.equal(f.state.community.guilds.guild.ideas[0].messageId,'message');
  await f.system().command(f.i);
  assert.equal(f.state.community.guilds.guild.ideas.length, 1);
  assert.match(f.calls.at(-1).content,/minucie/);
});
test('głos można zmienić, a po restarcie nie można go podwoić', async () => {
  const f = fixture();const idea={id:'abcdef123456',text:'Dobry pomysł',authorId:'author',channelId:'channel',messageId:'message',status:'pending',votes:{}};f.state.community.guilds.guild.ideas.push(idea);
  f.i.customId='strefa:community:idea:abcdef123456:yes';await f.system().button(f.i);await f.system().button(f.i);
  assert.deepEqual(idea.votes,{user:'yes'});
  f.i.customId='strefa:community:idea:abcdef123456:no';await f.system().button(f.i);assert.deepEqual(idea.votes,{user:'no'});
  await decideIdea({...f,id:idea.id,status:'accepted',actorId:'admin'});
  f.i.customId='strefa:community:idea:abcdef123456:yes';await f.system().button(f.i);assert.deepEqual(idea.votes,{user:'no'});
  assert.match(f.calls.at(-1),/przyjmuje/);
});
test('quiz po restarcie przyjmuje jedną odpowiedź na osobę i respektuje termin', async () => {
  const f=fixture();f.state.community.guilds.guild.quizzes.push({id:'abcdef123456',expiresAt:1000001,correct:1,options:['A','B','C','D'],answers:{}});
  f.i.customId='strefa:community:quiz:abcdef123456:1';await f.system().button(f.i);assert.match(f.calls.at(-1),/Poprawna/);
  await f.system().button(f.i);assert.match(f.calls.at(-1),/Już/);
  f.state.community.guilds.guild.quizzes[0].expiresAt=1;f.i.user.id='other';await f.system().button(f.i);assert.match(f.calls.at(-1),/zakończony/);
});
test('losowanie odrzuca jedną opcję i nie pozwala pingować wszystkich', async () => {
  const f=fixture();f.i.commandName='zabawa';f.i.options.getSubcommand=()=> 'losuj';f.i.options.getString=()=> 'jedna';await f.system().command(f.i);assert.match(f.calls.at(-1).content,/2 do 20/);
  f.i.options.getString=()=> '@everyone, pizza';await f.system().command(f.i);assert.deepEqual(f.calls.at(-1).allowedMentions,{parse:[]});assert.equal(f.state.community.guilds.guild.draws,1);
});
test('wyłączone zabawy i inny serwer nie tworzą quizów', async () => {
  const f=fixture();f.i.commandName='zabawa';f.i.options.getSubcommand=()=> 'quiz';f.state.community.guilds.guild.settings.gamesEnabled=false;await f.system().command(f.i);assert.match(f.calls.at(-1).content,/wyłączone/);
  f.i.guildId='other';await f.system().command(f.i);assert.equal(f.state.community.guilds.guild.quizzes.length,0);
});
