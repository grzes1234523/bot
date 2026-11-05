import crypto from 'node:crypto';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits as P, SlashCommandBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { serverLayout, layoutCount, applyLayoutSettings } from './server-layout.js';
import { guildStore } from './guild-store.js';

export const rebuildCommands = [new SlashCommandBuilder().setName('serwer-przebuduj').setDescription('Podgląd przebudowy kanałów; wykonanie wymaga potwierdzenia właściciela.').setDMPermission(false).setDefaultMemberPermissions(P.Administrator)
  .addStringOption(o=>o.setName('tryb').setDescription('Domyślnie pokazuje plan, bez usuwania.').addChoices({name:'Podgląd nowego układu',value:'preview'},{name:'Status ostatniej przebudowy',value:'status'},{name:'Anuluj lub zatrzymaj',value:'cancel'}))];
const running = new Set(['creating','deleting','configuring']);
const phrase = guildId => `USUN ${guildId}`;
function snapshot(channels) {
  return [...channels.values()].filter(Boolean).map(c=>({id:c.id,name:c.name,type:c.type,parentId:c.parentId??null,position:c.rawPosition??c.position??0,
    overwrites:[...(c.permissionOverwrites?.cache?.values()??[])].map(o=>({id:o.id,type:o.type,allow:String(o.allow.bitfield),deny:String(o.deny.bitfield)})).sort((a,b)=>a.id.localeCompare(b.id)),
  })).sort((a,b)=>a.id.localeCompare(b.id));
}
const fingerprint = channels => crypto.createHash('sha256').update(JSON.stringify(channels)).digest('hex');
const attachment = job => new AttachmentBuilder(Buffer.from(JSON.stringify({warning:'To kopia struktury, NIE wiadomości. Nie odzyskuje skasowanych kanałów ani ich ID.',guildId:job.guildId,guildName:job.guildName,createdAt:job.createdAt,oldChannels:job.backup,newLayout:serverLayout,created:job.created??{},deletedIds:job.deletedIds??[],status:job.status,error:job.error??null},null,2)),{name:`uklad-serwera-${job.id}.json`});

export function createServerRebuildSystem({client,featureStore,cfg,now=Date.now}) {
  const busy=new Set();
  const respond=(i,content)=>i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
  const current=id=>featureStore.snapshot().serverRebuilds?.[id];
  async function owner(i) {
    if (!i.guild) return false;
    await i.guild.fetch?.();
    return i.user.id===i.guild.ownerId;
  }
  async function preflight(guild) {
    const bot=await guild.members.fetchMe();
    if (!bot.permissions.has([P.ManageChannels,P.ManageGuild])) throw new Error('Bot potrzebuje uprawnień Zarządzanie kanałami i Zarządzanie serwerem.');
    const channels=await guild.channels.fetch();
    if(channels.size+layoutCount()>500) throw new Error('Brak miejsca na bezpieczne utworzenie nowego układu przed usuwaniem (limit 500 kanałów).');
    if(channels.filter(c=>c?.type===ChannelType.GuildCategory).size+serverLayout.length>50) throw new Error('Brak miejsca na 10 nowych kategorii (limit 50). Zwolnij miejsce przed przebudową.');
    for(const channel of channels.values())if(channel&&!channel.permissionsFor(bot)?.has(P.ManageChannels)) throw new Error(`Bot nie może zarządzać kanałem ${channel.name}. Niczego nie usunięto.`);
    const roles=await guild.roles.fetch();
    const staff=roles.filter(role=>role.id!==guild.id&&!role.managed&&role.permissions.any([P.Administrator,P.ManageGuild,P.ModerateMembers])).map(role=>role.id);
    return {channels,staff};
  }
  function overwrites(guild,staff,{private:isPrivate=false,readOnly=false,counter=false,type}={}) {
    const allow=[P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.EmbedLinks,P.AttachFiles,P.Connect,P.Speak];
    return [
      {id:guild.id,allow:isPrivate?[]:[P.ViewChannel,P.ReadMessageHistory,P.EmbedLinks,P.AttachFiles,...(!readOnly&&!counter?[P.SendMessages]:[]),...(type===ChannelType.GuildVoice&&!counter?[P.Connect,P.Speak]:[])],deny:[...(isPrivate?[P.ViewChannel]:[]),...(readOnly||counter?[P.SendMessages]:[]),...(counter?[P.Connect]:[])]},
      {id:client.user.id,allow:[...allow,P.ManageChannels,P.ManageMessages]},
      {id:guild.ownerId,allow},
      ...staff.filter(id=>id!==guild.ownerId&&id!==client.user.id).map(id=>({id,allow})),
    ];
  }
  async function command(i) {
    if(!await owner(i))return respond(i,'Tylko właściciel tego serwera może przygotować lub zatwierdzić przebudowę.');
    const mode=i.options.getString('tryb')??'preview';
    const previous=current(i.guildId);
    if(mode==='status')return i.reply({content:previous?`Przebudowa ${previous.id}: **${previous.status}**. Utworzone: ${Object.keys(previous.created??{}).length}, usunięte: ${previous.deletedIds?.length??0}.${previous.error?`\n${previous.error}`:''}`:'Nie ma zapisanej przebudowy.',files:previous?[attachment(previous)]:[],flags:MessageFlags.Ephemeral});
    if(mode==='cancel') {
      if(previous?.status==='complete')return respond(i,'Przebudowa już się zakończyła. Usuniętych kanałów i wiadomości nie można cofnąć.');
      if(previous)await featureStore.update(state=>{const job=state.serverRebuilds?.[i.guildId];if(job?.id===previous.id)job.status='cancelled';});
      return respond(i,'Anulowano plan. Trwająca operacja zatrzyma się po bieżącym żądaniu Discorda. Wcześniejsze usunięcia nie zostaną cofnięte.');
    }
    if(running.has(previous?.status)||busy.has(i.guildId))return respond(i,'Przebudowa już trwa albo została przerwana restartem. Sprawdź tryb Status. Przed nowym planem użyj trybu Anuluj.');
    await i.deferReply({flags:MessageFlags.Ephemeral});
    try {
      const {channels}=await preflight(i.guild);
      const backup=snapshot(channels);
      const job={id:crypto.randomBytes(8).toString('hex'),guildId:i.guildId,guildName:i.guild.name,ownerId:i.user.id,status:'preview',createdAt:now(),expiresAt:now()+5*60000,backup,fingerprint:fingerprint(backup),created:{},deletedIds:[]};
      await featureStore.update(state=>{state.serverRebuilds??={};state.serverRebuilds[i.guildId]=job;});
      const embed=new EmbedBuilder().setColor(0xed4245).setTitle('Podgląd przebudowy — niczego nie usunięto')
        .setDescription(`Serwer: **${i.guild.name}**\nID: **${i.guildId}**\nDo usunięcia: **${backup.length} kanałów i kategorii**. Do utworzenia: **${layoutCount()}**.\n\n**Wszystkie wiadomości i wątki w usuwanych kanałach zostaną bezpowrotnie utracone. Rozmowy głosowe zostaną przerwane. Stare linki i panele przestaną działać.**\nRole, członkowie, salda, XP oraz zapisane podania pozostają. Kopia poniżej obejmuje tylko strukturę, bez wiadomości.\n\nPlan wygasa za 5 minut. Po kliknięciu potwierdzenia trzeba jeszcze wpisać: **${phrase(i.guildId)}**.`)
        .addFields(...serverLayout.map(category=>({name:category.name+(category.private?' 🔒':''),value:category.channels.map(c=>`${c.type===ChannelType.GuildVoice?'🔊':'#'} ${c.name}${c.private?' 🔒':''}`).join('\n')})));
      return i.editReply({embeds:[embed],files:[attachment(job)],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`strefa:rebuild:confirm:${job.id}`).setStyle(ButtonStyle.Danger).setLabel('Przejdź do potwierdzenia usunięcia'),new ButtonBuilder().setCustomId(`strefa:rebuild:cancel:${job.id}`).setStyle(ButtonStyle.Secondary).setLabel('Anuluj'))],allowedMentions:{parse:[]}});
    }catch(error){return i.editReply({content:error.message});}
  }
  async function button(i) {
    if(!await owner(i))return respond(i,'Tylko właściciel serwera może użyć tego potwierdzenia.');
    const match=/^strefa:rebuild:(confirm|cancel):([a-f0-9]{16})$/.exec(i.customId),job=current(i.guildId);
    if(!match||!job||job.id!==match[2]||job.ownerId!==i.user.id||job.status!=='preview'||job.expiresAt<=now())return respond(i,'Plan jest nieaktualny. Uruchom /serwer-przebuduj ponownie.');
    if(match[1]==='cancel'){await featureStore.update(state=>{const current=state.serverRebuilds?.[i.guildId];if(current?.id===job.id)current.status='cancelled';});return i.update({content:'Anulowano przebudowę. Niczego nie usunięto.',embeds:[],components:[]});}
    return i.showModal(new ModalBuilder().setCustomId(`strefa:rebuild:execute:${job.id}`).setTitle('Nieodwracalne usunięcie kanałów').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('confirmation').setLabel(`Wpisz: ${phrase(i.guildId)}`).setPlaceholder(phrase(i.guildId)).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50))));
  }
  async function modal(i) {
    if(!await owner(i))return respond(i,'Tylko właściciel serwera może zatwierdzić usunięcie.');
    const match=/^strefa:rebuild:execute:([a-f0-9]{16})$/.exec(i.customId),job=current(i.guildId);
    if(!match||!job||job.id!==match[1]||job.ownerId!==i.user.id||job.status!=='preview'||job.expiresAt<=now())return respond(i,'Plan jest nieaktualny. Niczego nie usunięto.');
    if(i.fields.getTextInputValue('confirmation').trim()!==phrase(i.guildId))return respond(i,'Tekst potwierdzenia nie pasuje. Niczego nie usunięto.');
    if(busy.has(i.guildId))return respond(i,'Przebudowa już trwa.');
    busy.add(i.guildId);
    let claimed=false;
    const mutate=change=>featureStore.update(state=>{const current=state.serverRebuilds?.[i.guildId];if(current?.id!==job.id||!running.has(current.status))throw new Error('Przebudowa została anulowana lub zastąpiona.');change(current);current.updatedAt=now();});
    const checkpoint=change=>featureStore.update(state=>{const current=state.serverRebuilds?.[i.guildId];if(current?.id===job.id){change(current);current.updatedAt=now();}});
    try {
      await i.deferReply({flags:MessageFlags.Ephemeral});
      const {channels,staff}=await preflight(i.guild);
      if(fingerprint(snapshot(channels))!==job.fingerprint)throw new Error('Kanały zmieniły się od podglądu. Przygotuj i zatwierdź nowy plan.');
      await featureStore.update(state=>{const current=state.serverRebuilds?.[i.guildId];if(current?.id!==job.id||current.status!=='preview'||current.expiresAt<=now())throw new Error('Plan został już wykorzystany lub wygasł.');current.status='creating';});
      claimed=true;
      const ids={};
      for(const category of serverLayout){
        await mutate(()=>{});
        const parent=await i.guild.channels.create({name:category.name,type:ChannelType.GuildCategory,permissionOverwrites:overwrites(i.guild,staff,{private:category.private}),reason:`Przebudowa zatwierdzona przez właściciela ${i.user.id}`});
        ids[`category.${category.key}`]=parent.id;
        await checkpoint(current=>{current.created={...ids};});
        for(const channel of category.channels){
          await mutate(()=>{});
          const created=await i.guild.channels.create({name:channel.name,type:channel.type,parent:parent.id,permissionOverwrites:overwrites(i.guild,staff,{...channel,private:category.private||channel.private}),reason:`Nowy układ ${job.id}`});
          ids[`${category.key}.${channel.key}`]=created.id;
          await checkpoint(current=>{current.created={...ids};});
        }
      }
      await mutate(()=>{});
      await i.guild.edit({systemChannel:ids['start.welcome'],afkChannel:ids['voice.afk'],...(i.guild.features.includes('COMMUNITY')?{rulesChannel:ids['start.rules'],publicUpdatesChannel:ids['admin.modchat']}:{}),reason:`Nowe kanały układu ${job.id}`});
      await mutate(current=>{current.status='deleting';});
      // Wyłącznie ID ze sprawdzonego podglądu; nigdy kanały nowego układu.
      const ordered=[...channels.values()].filter(Boolean).sort((a,b)=>(a.type===ChannelType.GuildCategory?1:0)-(b.type===ChannelType.GuildCategory?1:0));
      for(const old of ordered){
        await mutate(()=>{});
        await old.delete(`Potwierdzona przebudowa ${job.id}, właściciel ${i.user.id}`);
        await checkpoint(current=>{current.deletedIds.push(old.id);});
      }
      await mutate(current=>{current.status='configuring';});
      const scoped=guildStore(featureStore,i.guildId,cfg.guildId);
      await scoped.update(state=>applyLayoutSettings(state,i.guildId,cfg.guildId,ids));
      await mutate(current=>{current.status='complete';current.completedAt=now();});
      const status=await i.guild.channels.fetch(ids['admin.status']).catch(()=>null);
      await status?.send({content:`✅ Przebudowa zakończona. Utworzono ${layoutCount()} kanałów i kategorii. Zaktualizowano kanały modułów. Panele rekrutacji, ticketów i weryfikacji opublikuj ponownie odpowiednimi komendami.`,allowedMentions:{parse:[]}}).catch(()=>{});
      await i.editReply({content:`Przebudowa zakończona. Nowy kanał administracji: <#${ids['admin.admin']}>.`,components:[]}).catch(()=>{});
    }catch(error){
      if(claimed)await featureStore.update(state=>{const current=state.serverRebuilds?.[i.guildId];if(current?.id===job.id&&running.has(current.status)){current.status='failed';current.error=String(error.message).slice(0,1000);}});
      const result=current(i.guildId);
      await i.editReply({content:`Przebudowa zatrzymana: ${error.message}\nUsuniętych kanałów nie można przywrócić. Nowy plan nie wykona się automatycznie. Sprawdź /serwer-przebuduj tryb:Status.`,files:result?[attachment(result)]:[]}).catch(()=>{});
    }finally{busy.delete(i.guildId);}
  }
  return {command,button,modal};
}
