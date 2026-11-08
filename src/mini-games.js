import crypto from 'node:crypto';
import {ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,MessageFlags} from 'discord.js';

export const miniGameTypes=['kolko-krzyzyk','kamien-papier-nozyce','zgadnij-liczbe'];
const titles={'kolko-krzyzyk':'⭕ Kółko i krzyżyk','kamien-papier-nozyce':'✊ Kamień, papier, nożyce','zgadnij-liczbe':'🔢 Zgadnij liczbę'};
const hands=['✊ Kamień','✋ Papier','✌️ Nożyce'];
const lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
export const boardWinner=board=>['X','O'].find(mark=>lines.some(line=>line.every(i=>board[i]===mark)))??null;
export function botMove(board,random=crypto.randomInt){
  const free=board.map((v,i)=>v?null:i).filter(i=>i!==null);
  for(const mark of ['O','X'])for(const index of free){const copy=[...board];copy[index]=mark;if(boardWinner(copy)===mark)return index;}
  return !board[4]?4:free.length?free[random(free.length)]:null;
}
function storage(state,id){state.community??={guilds:{}};state.community.guilds??={};const g=state.community.guilds[id]??={};g.miniGames??=[];return g;}
const enabled=(state,id)=>state.community?.guilds?.[id]?.settings?.gamesEnabled!==false;
function finish(game,status,time){game.status=status;game.finishedAt=time;}
export function playMiniTurn(game,action,time,random=crypto.randomInt){
  if(game.status!=='active')return 'Gra już się zakończyła.';
  if(game.expiresAt<=time){finish(game,'expired',time);game.revision++;return null;}
  if(action==='quit'){finish(game,'quit',time);game.revision++;return null;}
  const pick=Number(action);
  if(!/^\d$/.test(action))return 'Nieprawidłowy ruch.';
  if(game.type==='kolko-krzyzyk'){
    if(pick>8||game.board[pick])return 'Wybierz puste pole.';
    game.board[pick]='X';
    if(boardWinner(game.board)==='X')finish(game,'won',time);
    else if(game.board.every(Boolean))finish(game,'draw',time);
    else {const move=botMove(game.board,random);game.board[move]='O';if(boardWinner(game.board)==='O')finish(game,'lost',time);else if(game.board.every(Boolean))finish(game,'draw',time);}
  }else if(game.type==='kamien-papier-nozyce'){
    if(pick>2)return 'Wybierz kamień, papier lub nożyce.';
    const bot=random(3);game.rounds.push({player:pick,bot});
    if(pick!==bot){if((pick-bot+3)%3===1)game.playerScore++;else game.botScore++;}
    if(game.playerScore===2||game.botScore===2||game.rounds.length===5)finish(game,game.playerScore===game.botScore?'draw':game.playerScore>game.botScore?'won':'lost',time);
  }else{
    const number=pick+1;
    if(game.guesses.includes(number))return 'Ta liczba została już sprawdzona.';
    game.guesses.push(number);
    if(number===game.secret)finish(game,'won',time);
    else if(game.guesses.length===3)finish(game,'lost',time);
    else game.hint=number<game.secret?'Szukana liczba jest większa.':'Szukana liczba jest mniejsza.';
  }
  game.revision++;return null;
}
export function miniGamePayload(game){
  const active=game.status==='active';
  const result={won:'🏆 Wygrywasz!',lost:'🤖 Bot wygrywa.',draw:'🤝 Remis!',expired:'⌛ Upłynęło 10 minut. Rozpocznij nową grę.',quit:'Zakończono grę.'}[game.status];
  let body=`Gracz: <@${game.userId}>\n`;
  if(game.type==='kolko-krzyzyk')body+='Ty: ❌ · Bot: ⭕\nWybierz puste pole.';
  if(game.type==='kamien-papier-nozyce'){
    body+=`Ty **${game.playerScore} : ${game.botScore}** Bot\nDo dwóch zwycięstw, maksymalnie 5 rund.\n`;
    const last=game.rounds.at(-1);if(last)body+=`Ostatnia runda: Ty ${hands[last.player]} · Bot ${hands[last.bot]}`;
  }
  if(game.type==='zgadnij-liczbe'){
    body+=`Wylosowałem liczbę od **1 do 10**. Masz **3 próby**.\nSprawdzone: ${game.guesses.join(', ')||'—'}\n${active?game.hint||'Wybierz liczbę poniżej.':`Szukana liczba: **${game.secret}**.`}`;
  }
  if(result)body+=`\n\n**${result}**`;
  const embed=new EmbedBuilder().setColor(game.status==='won'?0x57f287:0x8b5cf6).setTitle(titles[game.type]).setDescription(body).setFooter({text:'Gra dla autora • 10 minut na całą rozgrywkę • bez stawek i zmian salda'});
  const button=(action,label,style=ButtonStyle.Secondary)=>new ButtonBuilder().setCustomId(`strefa:community:mini:${game.id}:${game.revision}:${action}`).setLabel(label).setStyle(style);
  const rows=[];
  if(game.type==='kolko-krzyzyk')for(let r=0;r<3;r++)rows.push(new ActionRowBuilder().addComponents(...[0,1,2].map(c=>{const index=r*3+c;return button(String(index),game.board[index]==='X'?'❌':game.board[index]==='O'?'⭕':String(index+1)).setDisabled(!active||Boolean(game.board[index]));})));
  if(active&&game.type==='kamien-papier-nozyce')rows.push(new ActionRowBuilder().addComponents(...hands.map((label,index)=>button(String(index),label,ButtonStyle.Primary))));
  if(active&&game.type==='zgadnij-liczbe')for(let r=0;r<2;r++)rows.push(new ActionRowBuilder().addComponents(...[0,1,2,3,4].map(c=>{const index=r*5+c;return button(String(index),String(index+1),ButtonStyle.Primary).setDisabled(game.guesses.includes(index+1));})));
  if(active)rows.push(new ActionRowBuilder().addComponents(button('quit','Zakończ',ButtonStyle.Danger)));
  return {embeds:[embed],components:rows,allowedMentions:{parse:[]}};
}
export function createMiniGames({featureStore,guildId,client,now=Date.now,random=crypto.randomInt}){
  const busy=new Set();
  const reply=(i,content)=>i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
  async function start(i,type){
    if(i.guildId!==guildId||!enabled(featureStore.snapshot(),guildId))return reply(i,'Zabawy są wyłączone lub wybrano inny serwer.');
    if(!miniGameTypes.includes(type))return reply(i,'Nieznana gra.');
    await i.deferReply();
    const game={id:crypto.randomBytes(6).toString('hex'),type,userId:i.user.id,channelId:i.channelId,messageId:null,status:'active',revision:0,expiresAt:now()+600000,board:Array(9).fill(null),rounds:[],playerScore:0,botScore:0,guesses:[],...(type==='zgadnij-liczbe'?{secret:random(10)+1}:{})};
    const error=await featureStore.update(state=>{
      const g=storage(state,guildId);for(const old of g.miniGames)if(old.status==='active'&&old.expiresAt<=now())finish(old,'expired',now());
      if(g.miniGames.some(old=>old.userId===i.user.id&&old.status==='active'))return 'Masz już aktywną grę. Zakończ ją albo poczekaj na jej wygaśnięcie.';
      const active=g.miniGames.filter(old=>old.status==='active');if(active.length>=100)return 'Na serwerze trwa już 100 gier. Spróbuj później.';
      g.miniGames=[...g.miniGames.filter(old=>old.status!=='active').slice(-99),...active,game];g.miniGamesPlayed=(g.miniGamesPlayed??0)+1;return null;
    });
    if(error)return i.editReply({content:error});
    try{const sent=await i.editReply(miniGamePayload(game));await featureStore.update(state=>{storage(state,guildId).miniGames.find(g=>g.id===game.id).messageId=sent.id;});}
    catch(error){await featureStore.update(state=>{const old=storage(state,guildId).miniGames.find(g=>g.id===game.id);if(old)finish(old,'quit',now());});throw error;}
  }
  async function button(i){
    const match=/^strefa:community:mini:([a-f0-9]{12}):(\d{1,3}):(\d|quit)$/.exec(i.customId);
    if(!match||i.guildId!==guildId)return reply(i,'Nieprawidłowy przycisk gry.');
    const [,id,revision,action]=match;
    const before=featureStore.snapshot().community?.guilds?.[guildId]?.miniGames?.find(g=>g.id===id);
    if(!before||before.userId!==i.user.id||before.channelId!==i.channelId||before.messageId!==i.message.id)return reply(i,'To nie jest Twoja gra lub wiadomość gry.');
    if(busy.has(id))return reply(i,'Trwa zapisywanie ruchu.');busy.add(id);
    try{
      await i.deferUpdate();
      const result=await featureStore.update(state=>{
        const g=storage(state,guildId).miniGames.find(g=>g.id===id);
        if(!enabled(state,guildId))return{error:'Administracja wyłączyła zabawy.'};
        if(!g||g.revision!==Number(revision))return{error:'Ten przycisk jest nieaktualny. Użyj aktualnej planszy.'};
        const error=playMiniTurn(g,action,now(),random);return error?{error}:{game:structuredClone(g)};
      });
      if(result.error)return i.followUp({content:result.error,flags:MessageFlags.Ephemeral});
      return i.editReply(miniGamePayload(result.game));
    }finally{busy.delete(id);}
  }
  async function tick(){
    const expired=featureStore.snapshot().community?.guilds?.[guildId]?.miniGames?.filter(g=>g.status==='active'&&g.expiresAt<=now())??[];
    if(!expired.length)return;
    await featureStore.update(state=>{for(const game of storage(state,guildId).miniGames)if(game.status==='active'&&game.expiresAt<=now()){finish(game,'expired',now());game.revision++;}});
    if(client)for(const game of expired){const channel=await client.channels.fetch(game.channelId).catch(()=>null);const message=await channel?.messages?.fetch(game.messageId).catch(()=>null);if(message)await message.edit(miniGamePayload({...game,status:'expired'})).catch(()=>{});}
  }
  return{start,button,tick};
}
