import test from 'node:test';
import assert from 'node:assert/strict';
import {createMiniGames,miniGamePayload,playMiniTurn,boardWinner,botMove,miniGameTypes} from '../src/mini-games.js';
import {communityCommands,createCommunitySystem} from '../src/community.js';
function game(type,extra={}){return{id:'abcdef123456',type,userId:'user',channelId:'channel',messageId:'msg',status:'active',revision:0,expiresAt:700000,board:Array(9).fill(null),rounds:[],playerScore:0,botScore:0,guesses:[],secret:7,...extra};}
function fixture(){
 const state={community:{guilds:{guild:{settings:{gamesEnabled:true},miniGames:[]}}}};let clock=100000;
 const calls=[];const featureStore={snapshot:()=>structuredClone(state),update:async fn=>fn(state)};
 const i={guildId:'guild',channelId:'channel',user:{id:'user'},message:{id:'msg'},reply:async p=>calls.push(p),deferReply:async()=>{},deferUpdate:async()=>{},editReply:async p=>{calls.push(p);return{id:'msg'};},followUp:async p=>calls.push(p)};
 const system=()=>createMiniGames({featureStore,guildId:'guild',now:()=>clock,random:()=>0});
 return{state,calls,featureStore,i,system,advance:ms=>{clock+=ms;},games:()=>state.community.guilds.guild.miniGames};
}
test('gry są zarejestrowane pod zabawa i mieszczą komponenty w limitach Discorda',()=>{
 for(const type of miniGameTypes){assert.ok(communityCommands[0].toJSON().options.some(s=>s.name===type));const p=miniGamePayload(game(type));assert.ok(p.components.length<=5);for(const row of p.components){assert.ok(row.toJSON().components.length<=5);for(const b of row.toJSON().components)assert.ok(b.custom_id.length<=100);}assert.deepEqual(p.allowedMentions,{parse:[]});}
});
test('bot wygrywa lub blokuje linię, plansza rozpoznaje wygraną i remis',()=>{
 assert.equal(botMove(['O','O',null,'X','X',null,null,null,null]),2);
 assert.equal(botMove(['X','X',null,null,'O',null,null,null,null]),2);
 const g=game('kolko-krzyzyk',{board:['X','X',null,'O','O',null,null,null,null]});playMiniTurn(g,'2',100000);assert.equal(g.status,'won');assert.equal(boardWinner(g.board),'X');
 const draw=game('kolko-krzyzyk',{board:['X','O','X','X','O','O','O','X',null]});playMiniTurn(draw,'8',100000);assert.equal(draw.status,'draw');
 const occupied=game('kolko-krzyzyk',{board:['X',null,null,null,null,null,null,null,null]});assert.match(playMiniTurn(occupied,'0',100000),/puste/);assert.equal(occupied.revision,0);
});
test('kamień papier nożyce poprawnie liczy zwycięstwa i ogranicza remisy',()=>{
 const g=game('kamien-papier-nozyce');playMiniTurn(g,'1',100000,()=>0);playMiniTurn(g,'1',100001,()=>0);assert.equal(g.status,'won');assert.equal(g.playerScore,2);
 const lost=game('kamien-papier-nozyce');playMiniTurn(lost,'0',100000,()=>1);playMiniTurn(lost,'0',100001,()=>1);assert.equal(lost.status,'lost');
 const draw=game('kamien-papier-nozyce');for(let n=0;n<5;n++)playMiniTurn(draw,'0',100000+n,()=>0);assert.equal(draw.status,'draw');assert.equal(draw.rounds.length,5);
});
test('liczba ma podpowiedzi, trzy próby i nie zużywa ponownego kliknięcia',()=>{
 const g=game('zgadnij-liczbe');assert.ok(!miniGamePayload(g).embeds[0].toJSON().description.includes('Szukana liczba:'));
 playMiniTurn(g,'1',100000);assert.match(g.hint,/większa/);assert.match(playMiniTurn(g,'1',100001),/już/);assert.equal(g.guesses.length,1);
 playMiniTurn(g,'9',100002);assert.match(g.hint,/mniejsza/);playMiniTurn(g,'6',100003);assert.equal(g.status,'won');
 const lost=game('zgadnij-liczbe');for(const n of ['0','1','2'])playMiniTurn(lost,n,100000);assert.equal(lost.status,'lost');assert.match(miniGamePayload(lost).embeds[0].toJSON().description,/\*\*7\*\*/);
});
test('gra zapisuje wiadomość, działa po restarcie i odrzuca starą rewizję',async()=>{
 const f=fixture();await f.system().start(f.i,'kolko-krzyzyk');const g=f.games()[0];assert.equal(g.messageId,'msg');f.i.customId=`strefa:community:mini:${g.id}:0:0`;
 await f.system().button(f.i);assert.equal(g.board[0],'X');assert.equal(g.revision,1);await f.system().button(f.i);assert.match(f.calls.at(-1).content,/nieaktualny/);assert.equal(g.revision,1);
});
test('inny gracz, serwer lub wiadomość nie może zagrać cudzej rozgrywki',async()=>{
 const f=fixture();await f.system().start(f.i,'zgadnij-liczbe');const g=f.games()[0];const customId=`strefa:community:mini:${g.id}:0:1`;
 for(const change of [{user:{id:'other'}},{guildId:'other'},{channelId:'other'},{message:{id:'other'}}])await f.system().button({...f.i,...change,customId});
 assert.equal(g.revision,0);assert.equal(g.guesses.length,0);
});
test('wyłączenie modułu blokuje start i ruch, jedna gra na gracza',async()=>{
 const f=fixture();await f.system().start(f.i,'zgadnij-liczbe');await f.system().start(f.i,'kolko-krzyzyk');assert.equal(f.games().length,1);assert.match(f.calls.at(-1).content,/aktywną/);
 f.state.community.guilds.guild.settings.gamesEnabled=false;const g=f.games()[0];await f.system().button({...f.i,customId:`strefa:community:mini:${g.id}:0:1`});assert.equal(g.revision,0);assert.match(f.calls.at(-1).content,/wyłączyła/);
 const empty=fixture();empty.state.community.guilds.guild.settings.gamesEnabled=false;await empty.system().start(empty.i,'kolko-krzyzyk');assert.equal(empty.games().length,0);
});
test('limit czasu, rezygnacja i porządkowanie po restarcie zamykają grę',async()=>{
 const f=fixture();await f.system().start(f.i,'kolko-krzyzyk');f.advance(600001);await f.system().tick();assert.equal(f.games()[0].status,'expired');
 await f.system().start(f.i,'kamien-papier-nozyce');const g=f.games().at(-1);await f.system().button({...f.i,customId:`strefa:community:mini:${g.id}:0:quit`});assert.equal(g.status,'quit');assert.equal(miniGamePayload(g).components.length,0);
});
test('wspólna komenda community uruchamia nową grę i nie zmienia ekonomii ani XP',async()=>{
 const f=fixture();f.state.economy={user:{balance:100}};f.state.levels={xp:200};const system=createCommunitySystem({featureStore:f.featureStore,guildId:'guild',now:()=>100000});
 await system.command({...f.i,commandName:'zabawa',options:{getSubcommand:()=> 'kolko-krzyzyk'}});assert.equal(f.games().length,1);assert.deepEqual(f.state.economy,{user:{balance:100}});assert.deepEqual(f.state.levels,{xp:200});
});
