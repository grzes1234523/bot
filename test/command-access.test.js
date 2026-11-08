import test from 'node:test';
import assert from 'node:assert/strict';
import {PermissionFlagsBits as P,Collection} from 'discord.js';
import {commands,recruitmentCommands} from '../src/commands.js';
import {featureCommands,createFeatureHandlers} from '../src/features.js';
import {proCommands,createProSystem,isProCommand} from '../src/pro-system.js';
import {createRecruitmentHandlers} from '../src/recruitment.js';
const publicNames=new Set(['zapros','statystyki','ekonomia-portfel','ekonomia-daily','ekonomia-praca','ekonomia-przelej','ekonomia-ranking','ekonomia-bank','level','poziom','ranking','zabawa','pomysl','rekrutacja-status','rekrutacja-moje','rekrutacja-pomoc']);
test('komendy gracza pozostają publiczne, wszystkie pozostałe mają ograniczenia Discorda',()=>{
 for(const command of commands){const d=command.toJSON();if(publicNames.has(d.name))assert.equal(d.default_member_permissions??null,null,d.name);else assert.ok(d.default_member_permissions,d.name);}
 const names=commands.map(c=>c.name);assert.equal(new Set(names).size,names.length);
});
test('administracyjna rekrutacja i konfiguracja modułów wymagają Zarządzania serwerem',()=>{
 for(const command of [...recruitmentCommands,...featureCommands].filter(c=>!publicNames.has(c.name)&&c.name!=='wyczysc')){const d=command.toJSON();assert.equal(d.default_member_permissions,String(P.ManageGuild),d.name);assert.equal(d.dm_permission,false);}
});
test('ticket gracza nie zawiera konfiguracji ani operacji obsługi',()=>{
 const defs=proCommands.map(c=>c.toJSON());const personal=defs.find(c=>c.name==='ticket'),admin=defs.find(c=>c.name==='ticket-admin');
 assert.deepEqual(personal.options.map(o=>o.name).sort(),['historia','ocena','transcript','zamknij']);assert.equal(personal.default_member_permissions,null);
 assert.equal(admin.default_member_permissions,String(P.ManageGuild));assert.equal(defs.find(c=>c.name==='embed').default_member_permissions,String(P.ManageGuild));
 for(const name of ['panel','konfiguracja','administrator','przejmij','eksport'])assert.ok(admin.options.some(o=>o.name===name));assert.equal(isProCommand('ticket-admin'),true);
});
test('zwykły gracz nie uruchomi konfiguracji nawet po ominięciu widoczności Discorda',async()=>{
 const state={autoChannels:{createdIds:[]},tickets:{items:[],guildSettings:{}}};let writes=0;const store={snapshot:()=>structuredClone(state),update:async()=>{writes++;throw new Error('Zapis niedozwolony');}};
 const features=createFeatureHandlers({client:{},cfg:{guildId:'guild'},featureStore:store});
 const replies=[];const interaction={guildId:'guild',guild:{id:'guild'},user:{id:'player'},memberPermissions:{has:()=>false},member:{roles:{cache:new Collection()}},reply:async p=>replies.push(p),inGuild:()=>true,options:{getSubcommand:()=> 'panel'}};
 for(const commandName of ['auto-mod-fraza','auto-mod-lista','auto-kanaly-ustaw','logi-ustaw','weryfikacja-panel','moderacja-ban'])await features.command({...interaction,commandName});
 const recruitment=createRecruitmentHandlers({client:{},cfg:{guildId:'guild'},featureStore:store,store:{},reportFailure:()=>{}});await recruitment.command({...interaction,commandName:'rekrutacja-akceptuj'});
 await createProSystem({client:{},featureStore:store,cfg:{}}).command({...interaction,commandName:'ticket-admin'});
 assert.equal(writes,0);assert.equal(replies.length,8);for(const p of replies)assert.match(p.content,/uprawnie|administrac/i);
});
