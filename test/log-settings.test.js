import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';
import { logSettings, saveLogSettings } from '../src/log-settings.js';
import { createFeatureHandlers } from '../src/features.js';

function fixture() {
  const state={autoChannels:{createdIds:[]},logChannelId:'channel'},sent=[];
  const featureStore={snapshot:()=>structuredClone(state),update:async fn=>fn(state)};
  const channel={id:'channel',type:ChannelType.GuildText,parentId:'category',isTextBased:()=>true,permissionsFor:()=>({has:()=>true}),send:async payload=>sent.push(payload)};
  const guild={id:'guild',members:{me:{}},channels:{fetch:async id=>id==='category'?{type:ChannelType.GuildCategory}:channel}};
  const handlers=createFeatureHandlers({client:{},cfg:{guildId:'guild'},featureStore,applicationStore:{}});
  return {state,sent,featureStore,channel,guild,handlers};
}
test('zapis konfiguracji logów zachowuje kanał, kategorię i przełączniki',async()=>{
  const f=fixture();const body={...logSettings({}),channelId:'channel',categoryId:'category'};body.events.voice=false;
  await saveLogSettings({...f,body});assert.equal(f.state.logChannelId,'channel');assert.equal(f.state.logging.categoryId,'category');assert.equal(f.state.logging.events.voice,false);
  f.channel.parentId='inna';await assert.rejects(saveLogSettings({...f,body}),/kategorii/);
});
test('brak uprawnień i niepełne przełączniki są odrzucane',async()=>{
  const f=fixture();const body={...logSettings({}),channelId:'channel'};f.channel.permissionsFor=()=>({has:()=>false});
  await assert.rejects(saveLogSettings({...f,body}),/potrzebuje/);await assert.rejects(saveLogSettings({...f,body:{...body,events:{}}}),/przełączniki/);
});
test('log usunięcia wiadomości wysyła embed i zapisuje historię bez treści wiadomości',async()=>{
  const f=fixture();await f.handlers.messageDeleted({guild:f.guild,author:{id:'user'},channelId:'text',content:'prywatna treść'});
  assert.equal(f.sent.length,1);assert.equal(f.state.botLogs.length,1);assert.equal(f.state.botLogs[0].event,'messages');assert.ok(!f.state.botLogs[0].description.includes('prywatna treść'));
});
test('wyłączenie zdarzenia lub wszystkich logów zatrzymuje wysyłanie i zapis',async()=>{
  const f=fixture();f.state.logging=logSettings({});f.state.logging.events.messages=false;
  await f.handlers.messageDeleted({guild:f.guild,author:{id:'user'},channelId:'text'});assert.equal(f.sent.length,0);
  f.state.logging.enabled=false;await f.handlers.memberChanged({guild:f.guild,user:{id:'user',username:'User'},id:'user'},true);assert.equal(f.sent.length,0);assert.equal(f.state.botLogs,undefined);
});
test('logi członków są zapisywane osobno i nie dotyczą innych serwerów',async()=>{
  const f=fixture();const member={guild:f.guild,id:'user',user:{username:'User'}};
  await f.handlers.memberChanged(member,false);assert.equal(f.state.botLogs[0].event,'members');
  await f.handlers.memberChanged({...member,guild:{...f.guild,id:'other'}},true);assert.equal(f.sent.length,1);
});
