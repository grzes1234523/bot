import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection, ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { createServerRebuildSystem, rebuildCommands } from '../src/server-rebuild.js';
import { serverLayout, layoutCount } from '../src/server-layout.js';
import { initialState } from '../src/feature-store.js';

const guildId='123456789012345670',otherGuild='123456789012345671';
function fixture(){
  let time=1000000,seq=0,queue=Promise.resolve();
  const state=initialState(),deleted=[],created=[],replies=[],updates=[];
  state.recruitment={acceptedRoleId:'accepted'};state.economy.user={balance:123};
  state.tickets.panels=[{guildId,messageId:'old-panel'},{guildId:otherGuild,messageId:'other-panel'}];
  const store={snapshot:()=>structuredClone(state),update:change=>{const result=queue.then(()=>change(state));queue=result.catch(()=>{});return result;}};
  const channels=new Collection();
  const channel=(id,name,type,parentId=null)=>({id,name,type,parentId,rawPosition:0,permissionOverwrites:{cache:new Collection()},permissionsFor:()=>({has:()=>true}),delete:async()=>{deleted.push(id);channels.delete(id);},send:async()=>{}});
  channels.set('old-text',channel('old-text','ogólny',ChannelType.GuildText,'old-category'));
  channels.set('old-category',channel('old-category','Stare',ChannelType.GuildCategory));
  const guild={id:guildId,name:'Serwer testowy',ownerId:'owner',features:['COMMUNITY'],fetch:async()=>guild,members:{fetchMe:async()=>({permissions:{has:()=>true}})},roles:{fetch:async()=>new Collection()},channels:{fetch:async id=>id?channels.get(id):new Collection(channels),create:async options=>{const c=channel(`new-${++seq}`,options.name,options.type,options.parent??null);channels.set(c.id,c);created.push({...options,id:c.id});return c;}},edit:async options=>updates.push(options)};
  const i={guildId,guild,user:{id:'owner'},options:{getString:()=>null},reply:async payload=>replies.push(payload),deferReply:async()=>{},editReply:async payload=>replies.push(payload),update:async payload=>replies.push(payload),showModal:async payload=>replies.push(payload.toJSON()),fields:{getTextInputValue:()=>`USUN ${guildId}`}};
  const system=()=>createServerRebuildSystem({client:{user:{id:'bot'}},featureStore:store,cfg:{guildId},now:()=>time});
  const job=()=>state.serverRebuilds?.[guildId];
  const preview=()=>system().command(i);
  const execute=()=>system().modal({...i,customId:`strefa:rebuild:execute:${job().id}`});
  return{state,store,guild,channels,i,created,deleted,replies,updates,system,job,preview,execute,advance:ms=>time+=ms};
}
test('komenda udostępnia tylko podgląd, status i anulowanie',()=>{
  const command=rebuildCommands[0].toJSON();assert.equal(command.name,'serwer-przebuduj');
  assert.equal(command.default_member_permissions,String(P.Administrator));
  assert.deepEqual(command.options[0].choices.map(c=>c.value),['preview','status','cancel']);
  assert.equal(command.options[1].name,'potwierdzenie');
  assert.equal(serverLayout.length,10);assert.equal(layoutCount(),51);
});
test('jedna komenda z dokładnym potwierdzeniem wykonuje przebudowę bez przycisku i formularza',async()=>{
  const f=fixture();f.i.options.getString=name=>name==='potwierdzenie'?`USUN ${guildId}`:null;
  await f.system().command(f.i);assert.equal(f.job().status,'complete');assert.equal(f.created.length,51);assert.equal(f.deleted.length,2);
  assert.equal(f.replies[0].files.length,1);assert.match(f.replies[0].content,/Rozpoczynam/);
});
test('przebuduj-serwer wykonuje cały układ bez opcji, przycisku i formularza',async()=>{
  const f=fixture();f.i.commandName='przebuduj-serwer';f.i.options.getString=()=>{throw new Error('Ta komenda nie ma parametrów');};
  const command=rebuildCommands.find(command=>command.name==='przebuduj-serwer').toJSON();assert.equal(command.options.length,0);
  await f.system().command(f.i);assert.equal(f.job().status,'complete');assert.equal(f.created.length,51);assert.equal(f.deleted.length,2);
});
test('komenda bez parametrów nadal odrzuca administratora niebędącego właścicielem',async()=>{
  const f=fixture();f.i.commandName='przebuduj-serwer';f.i.user.id='admin';await f.system().command(f.i);
  assert.equal(f.created.length,0);assert.equal(f.deleted.length,0);assert.match(f.replies.at(-1).content,/właściciel/);
});
test('błędny ID w opcji potwierdzenia nie tworzy planu i nie uruchamia usuwania',async()=>{
  const f=fixture();f.i.options.getString=name=>name==='potwierdzenie'?`USUN ${otherGuild}`:null;
  await f.system().command(f.i);assert.equal(f.job(),undefined);assert.equal(f.created.length,0);assert.equal(f.deleted.length,0);
});
test('podgląd pokazuje ostrzeżenie i kopię struktury, ale niczego nie zmienia na Discordzie',async()=>{
  const f=fixture();await f.preview();assert.equal(f.job().status,'preview');
  assert.deepEqual(f.created,[]);assert.deepEqual(f.deleted,[]);assert.equal(f.replies[0].files.length,1);
  assert.match(f.replies[0].embeds[0].toJSON().description,/bezpowrotnie/);
  const backup=JSON.parse(f.replies[0].files[0].attachment.toString());assert.equal(backup.oldChannels.length,2);assert.ok(!Object.hasOwn(backup,'messages'));
});
test('administrator niebędący właścicielem nie przygotuje ani nie wykona przebudowy',async()=>{
  const f=fixture();f.i.user.id='admin';await f.preview();assert.equal(f.job(),undefined);assert.equal(f.created.length,0);
  assert.match(f.replies[0].content,/właściciel/);
});
test('przycisk dopiero otwiera formularz, a błędna fraza niczego nie usuwa',async()=>{
  const f=fixture();await f.preview();await f.system().button({...f.i,customId:`strefa:rebuild:confirm:${f.job().id}`});
  assert.match(f.replies.at(-1).custom_id,/execute/);assert.equal(f.created.length,0);
  f.i.fields.getTextInputValue=()=>`USUN ${otherGuild}`;await f.execute();assert.equal(f.created.length,0);assert.equal(f.deleted.length,0);
});
test('wygasły lub zmieniony plan nie jest wykonywany',async()=>{
  const f=fixture();await f.preview();f.advance(300001);await f.execute();assert.equal(f.created.length,0);
  await f.preview();f.channels.get('old-text').name='Zmieniono po podglądzie';await f.execute();assert.equal(f.created.length,0);assert.equal(f.deleted.length,0);
  assert.match(f.replies.at(-1).content,/zmieniły się/);
});
test('potwierdzenie tworzy cały nowy układ przed usuwaniem wyłącznie starych ID',async()=>{
  const f=fixture();await f.preview();const oldDelete=f.channels.get('old-text').delete;
  f.channels.get('old-text').delete=async()=>{assert.equal(f.created.length,layoutCount());await oldDelete();};
  await f.execute();assert.equal(f.job().status,'complete');assert.equal(f.created.length,51);
  assert.deepEqual(f.deleted,['old-text','old-category']);assert.ok(f.created.every(c=>!f.deleted.includes(c.id)));
  assert.equal(f.state.economy.user.balance,123);assert.equal(f.state.recruitment.acceptedRoleId,'accepted');
  assert.equal(f.state.recruitment.applicationChannelId,f.job().created['recruitment.reviews']);
  assert.equal(f.state.logging.eventChannels.messages,f.job().created['logs.messages']);
  assert.equal(f.state.moderation.logChannelId,f.job().created['logs.moderation']);
  assert.equal(f.state.tickets.panels[0].active,false);assert.equal(f.state.tickets.panels[1].active,undefined);
  const privateCategory=f.created.find(c=>c.name==='📜 LOGI');assert.ok(privateCategory.permissionOverwrites[0].deny.includes(P.ViewChannel));
  assert.equal(f.updates[0].rulesChannel,f.job().created['start.rules']);
});
test('błąd tworzenia zatrzymuje proces przed jakimkolwiek usunięciem',async()=>{
  const f=fixture();await f.preview();f.guild.channels.create=async()=>{throw new Error('Brak uprawnień');};
  await f.execute();assert.equal(f.job().status,'failed');assert.deepEqual(f.deleted,[]);
});
test('błąd usuwania zatrzymuje dalsze usuwanie i zapisuje postęp',async()=>{
  const f=fixture();await f.preview();f.channels.get('old-text').delete=async()=>{throw new Error('Discord odrzucił usunięcie');};
  await f.execute();assert.equal(f.job().status,'failed');assert.deepEqual(f.deleted,[]);assert.equal(Object.keys(f.job().created).length,51);
});
test('anulowanie planu i restart nie uruchamiają usuwania automatycznie',async()=>{
  const f=fixture();await f.preview();const id=f.job().id;f.system();assert.equal(f.created.length,0);
  await f.system().button({...f.i,customId:`strefa:rebuild:cancel:${id}`});await f.execute();
  assert.equal(f.job().status,'cancelled');assert.equal(f.created.length,0);assert.equal(f.deleted.length,0);
});
test('brak miejsca albo uprawnień bota blokuje podgląd przed zmianami',async()=>{
  const f=fixture();f.guild.members.fetchMe=async()=>({permissions:{has:()=>false}});await f.preview();
  assert.equal(f.job(),undefined);assert.equal(f.created.length,0);assert.match(f.replies.at(-1).content,/uprawnień/);
});
test('drugie równoległe potwierdzenie nie uruchamia drugiego usuwania ani nie psuje statusu',async()=>{
  const f=fixture();await f.preview();const a=f.system(),b=f.system();
  const interaction={...f.i,customId:`strefa:rebuild:execute:${f.job().id}`};
  await Promise.all([a.modal(interaction),b.modal(interaction)]);
  assert.equal(f.job().status,'complete');assert.equal(f.created.length,51);assert.equal(f.deleted.length,2);
});
test('zatrzymanie w trakcie tworzenia nie usuwa starych kanałów i zapisuje wykonany krok',async()=>{
  const f=fixture();await f.preview();const create=f.guild.channels.create;
  f.guild.channels.create=async options=>{const result=await create(options);await f.system().command({...f.i,options:{getString:()=> 'cancel'}});return result;};
  await f.execute();assert.equal(f.job().status,'cancelled');assert.equal(f.created.length,1);assert.equal(Object.keys(f.job().created).length,1);assert.equal(f.deleted.length,0);
});
