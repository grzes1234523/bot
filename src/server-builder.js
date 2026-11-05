import { ChannelType, MessageFlags, PermissionFlagsBits as P, SlashCommandBuilder } from 'discord.js';
import { serverPresets, presetChoices } from './server-presets.js';

const fullCommand=name=>new SlashCommandBuilder().setName(name).setDescription('Dodaje brakujące kanały, kategorie i role całego serwera. NICZEGO NIE USUWA.').setDMPermission(false).setDefaultMemberPermissions(P.Administrator).addStringOption(o=>o.setName('wariant').setDescription('Wybierz układ; domyślnie 3. Rozbudowana społeczność').addChoices(...presetChoices));
export const serverBuilderCommands=[
  ...['rozbuduj-serwer','przebuduj-serwer','serwer-przebuduj'].map(fullCommand),
  new SlashCommandBuilder().setName('kategoria-dodaj').setDescription('Tworzy kategorię, zachowując obecne kanały.').setDMPermission(false).setDefaultMemberPermissions(P.ManageChannels)
    .addStringOption(o=>o.setName('nazwa').setDescription('Nazwa kategorii').setRequired(true).setMaxLength(100)),
  new SlashCommandBuilder().setName('kanal-dodaj').setDescription('Dodaje jeden kanał tekstowy lub głosowy.').setDMPermission(false).setDefaultMemberPermissions(P.ManageChannels)
    .addStringOption(o=>o.setName('nazwa').setDescription('Nazwa kanału').setRequired(true).setMaxLength(100))
    .addChannelOption(o=>o.setName('kategoria').setDescription('Istniejąca kategoria').addChannelTypes(ChannelType.GuildCategory))
    .addStringOption(o=>o.setName('typ').setDescription('Domyślnie tekstowy').addChoices({name:'Tekstowy',value:'text'},{name:'Głosowy',value:'voice'})),
  new SlashCommandBuilder().setName('rola-dodaj').setDescription('Tworzy rolę bez automatycznego nadawania jej użytkownikom.').setDMPermission(false).setDefaultMemberPermissions(P.ManageRoles)
    .addStringOption(o=>o.setName('nazwa').setDescription('Nazwa roli').setRequired(true).setMaxLength(100))
    .addStringOption(o=>o.setName('kolor').setDescription('Kolor HEX, np. #8B5CF6').setMaxLength(7)),
];
const normalize=name=>name.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('pl').replace(/[^\p{L}\p{N}]/gu,'');
export const layoutRoles=[
  {name:'👑 Właściciel',color:0xf1c40f},{name:'🛡️ Administrator',color:0xe74c3c},{name:'🛡️ Moderator',color:0x3498db},
  {name:'⭐ VIP',color:0xf39c12},{name:'🎮 Gracz',color:0x2ecc71},{name:'👤 Gość',color:0x95a5a6},
  {name:'🤖 Bot',color:0x9b59b6},{name:'REKRUTACYJNY',color:0x1abc9c},
];
export function createServerBuilderSystem({client}) {
  const busy=new Set();
  async function command(i){
    const reply=content=>i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
    if(!i.guild)return reply('Użyj tej komendy na serwerze Discord.');
    const full=['rozbuduj-serwer','przebuduj-serwer','serwer-przebuduj'].includes(i.commandName);
    const needed=i.commandName==='rola-dodaj'?P.ManageRoles:P.ManageChannels;
    if(full){await i.guild.fetch();if(i.user.id!==i.guild.ownerId)return reply('Rozbudowę całego serwera może uruchomić właściciel.');}
    else if(!i.memberPermissions?.has(needed))return reply('Nie masz uprawnień do tworzenia tego elementu.');
    if(busy.has(i.guildId))return reply('Na tym serwerze trwa już dodawanie. Poczekaj na zakończenie.');
    busy.add(i.guildId);
    let addedCategories=0,addedChannels=0,addedRoles=0,reused=0;
    try{
      await i.deferReply({flags:MessageFlags.Ephemeral});
      const bot=await i.guild.members.fetchMe();
      if(!bot.permissions.has(full?[P.ManageChannels,P.ManageRoles]:needed))throw new Error('Bot potrzebuje uprawnień Zarządzanie kanałami i/lub Zarządzanie rolami.');
      const [channels,roles]=await Promise.all([i.guild.channels.fetch(),i.guild.roles.fetch()]);
      const reason=`Dodawanie przez ${i.user.id}; bez usuwania istniejących elementów`;
      const ensureRole=async definition=>{
        const existing=roles.find(role=>role.id!==i.guild.id&&!role.managed&&normalize(role.name)===normalize(definition.name));
        if(existing){reused++;return existing;}
        const role=await i.guild.roles.create({name:definition.name,color:definition.color,permissions:[],mentionable:false,reason});roles.set(role.id,role);addedRoles++;return role;
      };
      const ensureCategory=async(name,permissionOverwrites)=>{
        const existing=channels.find(c=>c?.type===ChannelType.GuildCategory&&normalize(c.name)===normalize(name));
        if(existing){reused++;return existing;}
        if(channels.size>=500||channels.filter(c=>c?.type===ChannelType.GuildCategory).size>=50)throw new Error('Osiągnięto limit kanałów lub kategorii Discorda. Dotychczasowe elementy pozostały.');
        const category=await i.guild.channels.create({name,type:ChannelType.GuildCategory,...(permissionOverwrites?{permissionOverwrites}:{}),reason});channels.set(category.id,category);addedCategories++;return category;
      };
      const ensureChannel=async(definition,parent,permissionOverwrites)=>{
        const match=name=>definition.counter?normalize(name).replace(/\d+$/,'')===normalize(definition.name):normalize(name)===normalize(definition.name);
        const existing=channels.find(c=>c&&c.type===definition.type&&(c.parentId??null)===(parent?.id??null)&&match(c.name));
        if(existing){reused++;return existing;}
        if(channels.size>=500)throw new Error('Osiągnięto limit kanałów Discorda. Dotychczasowe elementy pozostały.');
        const channel=await i.guild.channels.create({name:definition.name,type:definition.type,...(parent?{parent:parent.id}:{}),...(permissionOverwrites?{permissionOverwrites}:{}),reason});channels.set(channel.id,channel);addedChannels++;return channel;
      };
      if(full){
        const preset=serverPresets[i.options.getString('wariant')??'spolecznosc'];
        if(!preset)throw new Error('Wybierz jeden z czterech dostępnych wariantów.');
        const presetRoles=preset.roles.map(name=>layoutRoles.find(r=>r.name===name)??{name,color:0x8b5cf6});
        const staff=[];for(const role of presetRoles){const created=await ensureRole(role);if(/Administrator|Moderator/.test(role.name))staff.push(created.id);}
        for(const category of preset.categories){
          const privatePermissions=[{id:i.guild.id,deny:[P.ViewChannel]},{id:client.user.id,allow:[P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.EmbedLinks,P.AttachFiles,P.ManageChannels]},...staff.map(id=>({id,allow:[P.ViewChannel,P.SendMessages,P.ReadMessageHistory]}))];
          const parent=await ensureCategory(category.name,category.private?privatePermissions:undefined);
          if(!parent.permissionsFor(bot)?.has([P.ViewChannel,P.ManageChannels]))throw new Error(`Bot nie ma dostępu do kategorii ${parent.name}. Istniejących uprawnień nie zmieniono.`);
          for(const channel of category.channels){
            // Nie modyfikujemy uprawnień ani treści istniejących kanałów.
            let overwrites;
            if(category.private||channel.private)overwrites=privatePermissions;
            else if(channel.readOnly||channel.counter){
              const inherited=[...(parent.permissionOverwrites?.cache?.values()??[])].filter(o=>o.id!==i.guild.id&&o.id!==client.user.id).map(o=>({id:o.id,type:o.type,allow:o.allow.bitfield,deny:o.deny.bitfield}));
              const everyone=parent.permissionOverwrites?.cache?.get(i.guild.id);
              const deny=(everyone?.deny?.bitfield??0n)|P.SendMessages|(channel.counter?P.Connect:0n);
              overwrites=[...inherited,{id:i.guild.id,allow:(everyone?.allow?.bitfield??0n)&~deny,deny},{id:client.user.id,allow:[P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.EmbedLinks,P.AttachFiles]}];
            }
            await ensureChannel(channel,parent,overwrites);
          }
        }
      }else{
        const name=i.options.getString('nazwa',true).trim();if(!name)throw new Error('Podaj nazwę.');
        if(i.commandName==='rola-dodaj'){
          const color=i.options.getString('kolor')??'#8B5CF6';if(!/^#?[0-9a-f]{6}$/i.test(color))throw new Error('Kolor wpisz jako HEX, np. #8B5CF6.');
          await ensureRole({name,color:parseInt(color.replace('#',''),16)});
        }else if(i.commandName==='kategoria-dodaj')await ensureCategory(name);
        else{
          const parent=i.options.getChannel('kategoria');
          if(parent&&(parent.guildId!==i.guildId||parent.type!==ChannelType.GuildCategory||!parent.permissionsFor(i.member)?.has([P.ViewChannel,P.ManageChannels])||!parent.permissionsFor(bot)?.has([P.ViewChannel,P.ManageChannels])))throw new Error('Wybierz kategorię, którą Ty i bot możecie zarządzać.');
          await ensureChannel({name,type:i.options.getString('typ')==='voice'?ChannelType.GuildVoice:ChannelType.GuildText},parent);
        }
      }
      return i.editReply({content:`${full?'Układ: **'+serverPresets[i.options.getString('wariant')??'spolecznosc'].name+'**\n':''}✅ Dodano: **${addedCategories} kategorii, ${addedChannels} kanałów, ${addedRoles} ról**. Już istniejące: ${reused}. Niczego nie usunięto ani nie przeniesiono. Role nie zostały nadane użytkownikom. Nowe role nie mają globalnych uprawnień Administratora ani moderacji; możesz je ustawić w Discordzie.`,allowedMentions:{parse:[]}});
    }catch(error){return i.editReply({content:`Dodawanie zatrzymane: ${error.message}\nDodano dotąd: ${addedCategories} kategorii, ${addedChannels} kanałów, ${addedRoles} ról. Niczego nie usunięto.`,allowedMentions:{parse:[]}});}
    finally{busy.delete(i.guildId);}
  }
  return{command};
}
