import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Collection,ChannelType} from 'discord.js';
import {createServerBuilderSystem,serverBuilderCommands} from '../src/server-builder.js';
import {serverPresets} from '../src/server-presets.js';
function fixture(){
 const channels=new Collection(),roles=new Collection(),created=[],assigned=[],deleted=[],replies=[];let seq=0;
 const channel=options=>({id:`c${++seq}`,guildId:'guild',name:options.name,type:options.type,parentId:options.parent??null,permissionsFor:()=>({has:()=>true}),permissionOverwrites:{cache:new Collection()},delete:async()=>{deleted.push(1);throw new Error('Nie wolno usuwać');}});
 const guild={id:'guild',ownerId:'owner',fetch:async()=>guild,members:{fetchMe:async()=>({permissions:{has:()=>true}})},channels:{fetch:async()=>channels,create:async options=>{created.push(options);const c=channel(options);channels.set(c.id,c);return c;}},roles:{fetch:async()=>roles,create:async options=>{const role={...options,id:`r${++seq}`,managed:false};roles.set(role.id,role);return role;}}};
 const options={nazwa:'Nowy',typ:null,kategoria:null,kolor:null};
 const i={guildId:'guild',guild,user:{id:'owner'},member:{},memberPermissions:{has:()=>true},commandName:'rozbuduj-serwer',options:{getString:name=>options[name]??null,getChannel:name=>options[name]??null},deferReply:async()=>{},reply:async p=>replies.push(p),editReply:async p=>replies.push(p)};
 return{channels,roles,created,assigned,deleted,replies,guild,i,options,system:createServerBuilderSystem({client:{user:{id:'bot'}}})};
}
test('rozbudowa tworzy brakujący układ i role, a drugie wywołanie nie duplikuje elementów',async()=>{
 const f=fixture();await f.system.command(f.i);assert.equal(f.channels.size,51);assert.equal(f.roles.size,9);assert.equal(f.deleted.length,0);
 assert.ok([...f.roles.values()].every(r=>r.permissions.length===0));
 await f.system.command(f.i);assert.equal(f.channels.size,51);assert.equal(f.roles.size,9);assert.match(f.replies.at(-1).content,/0 kategorii, 0 kanałów, 0 ról/);
});
test('stare komendy również tylko dodają, nie usuwają kanałów',async()=>{
 for(const name of ['przebuduj-serwer','serwer-przebuduj']){const f=fixture();f.i.commandName=name;await f.system.command(f.i);assert.equal(f.channels.size,51);assert.equal(f.deleted.length,0);}
 const source=fs.readFileSync(new URL('../src/bot.js',import.meta.url),'utf8');assert.ok(!source.includes("from './server-rebuild.js'"));assert.match(source,/Usuwanie kanałów tym panelem jest wyłączone/);
});
test('pojedyncza kategoria, kanał i rola powstają bez przebudowy całego serwera',async()=>{
 const f=fixture();f.i.commandName='kategoria-dodaj';await f.system.command(f.i);assert.equal(f.channels.size,1);
 f.options.kategoria=[...f.channels.values()][0];f.options.nazwa='Rozmowy';f.options.typ='voice';f.i.commandName='kanal-dodaj';await f.system.command(f.i);
 assert.equal(f.channels.size,2);assert.equal([...f.channels.values()][1].type,ChannelType.GuildVoice);
 f.i.commandName='rola-dodaj';f.options.nazwa='Przyjaciel';f.options.kolor='#ff0000';await f.system.command(f.i);assert.equal(f.roles.size,1);assert.equal([...f.roles.values()][0].color,0xff0000);assert.deepEqual([...f.roles.values()][0].permissions,[]);
});
test('brak uprawnień lub błędny kolor nie tworzy elementów',async()=>{
 const f=fixture();f.i.commandName='rola-dodaj';f.i.memberPermissions.has=()=>false;await f.system.command(f.i);assert.equal(f.roles.size,0);
 f.i.memberPermissions.has=()=>true;f.options.kolor='nie-kolor';await f.system.command(f.i);assert.equal(f.roles.size,0);
 f.i.commandName='rozbuduj-serwer';f.i.user.id='other';await f.system.command(f.i);assert.equal(f.channels.size,0);
});
test('nazwy komend są unikalne i obejmują dodawanie kanału, kategorii i roli',()=>{
 const names=serverBuilderCommands.map(c=>c.toJSON().name);assert.equal(new Set(names).size,names.length);for(const name of ['kanal-dodaj','kategoria-dodaj','rola-dodaj'])assert.ok(names.includes(name));
});

for(const [key,preset] of Object.entries(serverPresets))test(`wariant ${key}: właściwe kanały i role, ponowienie bez duplikatów`,async()=>{
 const f=fixture();f.i.commandName='przebuduj-serwer';f.options.wariant=key;
 await f.system.command(f.i);
 assert.equal(f.channels.size,preset.categories.reduce((n,c)=>n+1+c.channels.length,0));
 assert.deepEqual([...f.roles.values()].map(r=>r.name).sort(),[...preset.roles].sort());
 assert.equal(f.deleted.length,0);assert.match(f.replies.at(-1).content,new RegExp(preset.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 const count=f.channels.size;await f.system.command(f.i);assert.equal(f.channels.size,count);assert.equal(f.roles.size,preset.roles.length);
});
test('każda komenda pełnego układu udostępnia cztery warianty',()=>{
 for(const command of serverBuilderCommands.slice(0,3))assert.equal(command.toJSON().options.find(o=>o.name==='wariant').choices.length,4);
});
test('nieznany wariant nie tworzy niczego',async()=>{
 const f=fixture();f.options.wariant='brak';await f.system.command(f.i);assert.equal(f.channels.size,0);assert.equal(f.roles.size,0);
});
