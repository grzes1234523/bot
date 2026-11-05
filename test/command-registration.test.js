import test from 'node:test';
import assert from 'node:assert/strict';
import {Client,ApplicationCommand,Collection,SlashCommandBuilder} from 'discord.js';
import {registerGuildCommands} from '../src/command-registration.js';
const commands=['pierwsza','auto-mod-fraza','ostatnia'].map(name=>new SlashCommandBuilder().setName(name).setDescription('Opis').setDMPermission(false));
function fixture(){
 const created=[],errors=[],client=new Client({intents:[]});
 const guild={id:'123',name:'Testowy',available:true,commands:{fetch:async()=>new Collection(),create:async data=>{created.push(data);}}};
 return{guild,created,errors,args:{guild,commands,reportFailure:(context,error)=>errors.push({context,error})},client};
}
test('rejestruje wszystkie brakujące komendy',async()=>{const f=fixture();const r=await registerGuildCommands(f.args);assert.equal(r.updated,3);assert.equal(r.ok,true);});
test('50001 przy odczycie zgłasza jeden błąd z nazwą i ID serwera',async()=>{
 const f=fixture();f.guild.commands.fetch=async()=>{throw{code:50001};};const r=await registerGuildCommands(f.args);
 assert.equal(r.reason,'missing_access');assert.equal(f.created.length,0);assert.equal(f.errors.length,1);assert.match(f.errors[0].context,/Testowy \(123\)/);
});
test('utrata dostępu podczas rejestracji przerywa serię błędów',async()=>{
 const f=fixture();f.guild.commands.create=async data=>{f.created.push(data);throw{code:50001};};await registerGuildCommands(f.args);
 assert.equal(f.created.length,1);assert.equal(f.errors.length,1);
});
test('usunięty lub niedostępny serwer nie otrzymuje kolejnych żądań',async()=>{
 const f=fixture();let active=true;f.args.isActive=()=>active;f.guild.commands.create=async data=>{f.created.push(data);active=false;};
 assert.equal((await registerGuildCommands(f.args)).reason,'unavailable');assert.equal(f.created.length,1);
 const other=fixture();other.guild.available=false;assert.equal((await registerGuildCommands(other.args)).reason,'unavailable');assert.equal(other.created.length,0);
});
test('niezmienione komendy Discord.js nie są ponownie wysyłane, obce pozostają',async()=>{
 const f=fixture();const existing=commands.map((command,index)=>new ApplicationCommand(f.client,{...command.toJSON(),id:String(index),application_id:'456',guild_id:'123',version:'1',type:1}));
 existing.push(new ApplicationCommand(f.client,{id:'other',application_id:'456',guild_id:'123',version:'1',type:1,name:'obca',description:'Nie zmieniaj'}));
 f.guild.commands.fetch=async()=>new Collection(existing.map(c=>[c.id,c]));const r=await registerGuildCommands(f.args);assert.equal(r.unchanged,3);assert.equal(f.created.length,0);
});
test('zmieniony opis jest aktualizowany, błąd jednej komendy nie blokuje kolejnych',async()=>{
 const f=fixture();f.guild.commands.create=async data=>{f.created.push(data);if(data.name==='pierwsza')throw{code:50035};};const r=await registerGuildCommands(f.args);assert.equal(r.failed,1);assert.equal(f.created.length,3);assert.match(f.errors[0].context,/pierwsza.*Testowy/);
});
