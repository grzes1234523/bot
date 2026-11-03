import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  EmbedBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, SlashCommandBuilder, StringSelectMenuBuilder,
  TextInputBuilder, TextInputStyle,
} from 'discord.js';

const TICKET_BUTTON = 'strefa:ticket-pro:';
const purple = 0x8b5cf6;
const shortId = () => `${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const admin = () => new SlashCommandBuilder();
export const proCommands = [
  admin().setName('ticket').setDescription('Zarządzanie systemem ticketów.')
    .addSubcommand(s => s.setName('panel').setDescription('Publikuje konfigurowalny panel zgłoszeń.')
      .addStringOption(o => o.setName('tytul').setDescription('Tytuł panelu').setMaxLength(256))
      .addStringOption(o => o.setName('opis').setDescription('Opis panelu').setMaxLength(3500))
      .addChannelOption(o => o.setName('kanal').setDescription('Kanał publikacji').addChannelTypes(ChannelType.GuildText))
      .addChannelOption(o => o.setName('kategoria').setDescription('Kategoria nowych ticketów').addChannelTypes(ChannelType.GuildCategory))
      .addRoleOption(o => o.setName('obsluga').setDescription('Rola obsługi ticketów')))
    .addSubcommand(s => s.setName('panel-edytuj').setDescription('Edytuje istniejący panel bez publikowania nowej wiadomości.')
      .addStringOption(o => o.setName('wiadomosc').setDescription('ID wiadomości panelu').setRequired(true))
      .addStringOption(o => o.setName('tytul').setDescription('Nowy tytuł').setMaxLength(256))
      .addStringOption(o => o.setName('opis').setDescription('Nowy opis').setMaxLength(3500)))
    .addSubcommand(s => s.setName('panel-usun').setDescription('Wyłącza i usuwa zapisany panel.')
      .addStringOption(o => o.setName('wiadomosc').setDescription('ID wiadomości panelu').setRequired(true)))
    .addSubcommand(s => s.setName('kategoria').setDescription('Tworzy, edytuje lub usuwa kategorię ticketów.')
      .addStringOption(o => o.setName('id').setDescription('Krótki identyfikator kategorii').setRequired(true).setMaxLength(24))
      .addStringOption(o => o.setName('nazwa').setDescription('Nazwa kategorii (pominięcie usuwa kategorię)').setMaxLength(80))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji przycisku/menu').setMaxLength(32))
      .addChannelOption(o => o.setName('kanal-kategorii').setDescription('Kategoria Discord dla ticketów').addChannelTypes(ChannelType.GuildCategory))
      .addRoleOption(o => o.setName('rola-obslugi').setDescription('Rola obsługująca tę kategorię'))
      .addStringOption(o => o.setName('pytanie1').setDescription('Pierwsze pytanie formularza').setMaxLength(45))
      .addStringOption(o => o.setName('pytanie2').setDescription('Drugie pytanie formularza').setMaxLength(45))
      .addStringOption(o => o.setName('pytanie3').setDescription('Trzecie pytanie formularza').setMaxLength(45))
      .addStringOption(o => o.setName('pytanie4').setDescription('Czwarte pytanie formularza').setMaxLength(45))
      .addStringOption(o => o.setName('pytanie5').setDescription('Piąte pytanie formularza').setMaxLength(45)))
    .addSubcommand(s => s.setName('kategorie').setDescription('Pokazuje kategorie i pytania formularzy.'))
    .addSubcommand(s => s.setName('administrator').setDescription('Dodaje lub usuwa rolę administrującą ticketami.')
      .addRoleOption(o => o.setName('rola').setDescription('Rola administracji').setRequired(true))
      .addBooleanOption(o => o.setName('dodaj').setDescription('True dodaje rolę, false ją usuwa').setRequired(true)))
    .addSubcommand(s => s.setName('lista').setDescription('Pokazuje ostatnie tickety.'))
    .addSubcommand(s => s.setName('statystyki').setDescription('Pokazuje statystyki ticketów.'))
    .addSubcommand(s => s.setName('zamknij').setDescription('Zamyka ticket w bieżącym kanale.'))
    .addSubcommand(s => s.setName('otworz-ponownie').setDescription('Otwiera ponownie zamknięty ticket.'))
    .addSubcommand(s => s.setName('przejmij').setDescription('Przejmuje ticket w bieżącym kanale.'))
    .addSubcommand(s => s.setName('dodaj').setDescription('Dodaje osobę do bieżącego ticketu.')
      .addUserOption(o => o.setName('uzytkownik').setDescription('Osoba do dodania').setRequired(true)))
    .addSubcommand(s => s.setName('usun-uzytkownika').setDescription('Usuwa osobę z bieżącego ticketu.')
      .addUserOption(o => o.setName('uzytkownik').setDescription('Osoba do usunięcia').setRequired(true)))
    .addSubcommand(s => s.setName('transcript').setDescription('Pobiera transkrypt bieżącego ticketu.'))
    .addSubcommand(s => s.setName('konfiguracja').setDescription('Ustawia limit ticketów i kanał logów.')
      .addIntegerOption(o => o.setName('limit_na_osobe').setDescription('Liczba ticketów otwartych jednocześnie').setMinValue(1).setMaxValue(10).setRequired(true))
      .addChannelOption(o => o.setName('kanal_logow').setDescription('Kanał logów ticketów').addChannelTypes(ChannelType.GuildText))
      .addRoleOption(o => o.setName('rola_obslugi').setDescription('Domyślna rola obsługi'))
      .addIntegerOption(o => o.setName('przypomnienie_h').setDescription('Przypomnienie o nieaktywnym tickecie w godzinach (0 wyłącza)').setMinValue(0).setMaxValue(720))
      .addIntegerOption(o => o.setName('auto_zamknij_h').setDescription('Automatyczne zamknięcie po bezczynności w godzinach (0 wyłącza)').setMinValue(0).setMaxValue(720))
      .addIntegerOption(o => o.setName('bez_opiekuna_min').setDescription('Powiadom o braku opiekuna po minutach (0 wyłącza)').setMinValue(0).setMaxValue(10080)))
    .addSubcommand(s => s.setName('blacklist').setDescription('Blokuje lub odblokowuje otwieranie ticketów.')
      .addUserOption(o => o.setName('uzytkownik').setDescription('Użytkownik').setRequired(true))
      .addBooleanOption(o => o.setName('zablokuj').setDescription('Włącz lub wyłącz blokadę').setRequired(true)))
    .addSubcommand(s => s.setName('historia').setDescription('Pokazuje tickety danego użytkownika.')
      .addUserOption(o => o.setName('uzytkownik').setDescription('Osoba (domyślnie Ty)')))
    .addSubcommand(s => s.setName('przekaz').setDescription('Przekazuje ticket innemu opiekunowi.')
      .addUserOption(o => o.setName('opiekun').setDescription('Nowy opiekun').setRequired(true)))
    .addSubcommand(s => s.setName('zmien-nazwe').setDescription('Zmienia nazwę kanału ticketu.')
      .addStringOption(o => o.setName('nazwa').setDescription('Nowa nazwa kanału').setRequired(true).setMinLength(1).setMaxLength(90)))
    .addSubcommand(s => s.setName('ocena').setDescription('Ocenia zamkniętą obsługę ticketu.')
      .addIntegerOption(o => o.setName('gwiazdki').setDescription('Ocena od 1 do 5').setMinValue(1).setMaxValue(5).setRequired(true))
      .addStringOption(o => o.setName('komentarz').setDescription('Komentarz do obsługi').setMaxLength(500)))
    .addSubcommand(s => s.setName('raport').setDescription('Raport ticketów za dzień lub miesiąc.')
      .addStringOption(o => o.setName('okres').setDescription('Zakres raportu').setRequired(true).addChoices({name:'dzisiaj',value:'dzien'},{name:'ten miesiąc',value:'miesiac'})))
    .addSubcommand(s => s.setName('eksport').setDescription('Eksportuje zgłoszenia serwera do CSV.'))
    .addSubcommand(s => s.setName('usun').setDescription('Usuwa bieżący ticket po potwierdzeniu.')),
    // Additional reports and exports use ephemeral responses or attachments.
    // Subcommand count stays below Discord's limit.
  admin().setName('embed').setDescription('Tworzenie i zarządzanie embedami.')
    .addSubcommand(s => s.setName('kreator').setDescription('Otwiera kreator embeda bez JSON.')
      .addChannelOption(o => o.setName('kanal').setDescription('Kanał publikacji').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(s => s.setName('lista').setDescription('Pokazuje ostatnie embedy opublikowane przez bota.'))
    .addSubcommand(s => s.setName('edytuj').setDescription('Edytuje zapisany embed i podgląda zmianę przed publikacją.')
      .addStringOption(o => o.setName('wiadomosc').setDescription('ID wiadomości embeda').setRequired(true)))
    .addSubcommand(s => s.setName('usun').setDescription('Usuwa zapisany embed po ID wiadomości.')
      .addStringOption(o => o.setName('wiadomosc').setDescription('ID wiadomości embeda').setRequired(true)) )
    .addSubcommand(s => s.setName('import').setDescription('Importuje definicję embeda w JSON.')
      .addChannelOption(o => o.setName('kanal').setDescription('Kanał publikacji').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption(o => o.setName('json').setDescription('Obiekt Discord Embed w JSON (do 4000 znaków)').setRequired(true).setMaxLength(4000)))
    .addSubcommand(s => s.setName('eksport').setDescription('Eksportuje zapisany embed jako JSON.')
      .addStringOption(o => o.setName('wiadomosc').setDescription('ID wiadomości').setRequired(true)))
    .addSubcommand(s => s.setName('cofnij').setDescription('Przywraca starszą wersję embeda.')
      .addStringOption(o => o.setName('wiadomosc').setDescription('ID wiadomości').setRequired(true))
      .addIntegerOption(o => o.setName('wersja').setDescription('Numer wersji z listy historii').setMinValue(1).setRequired(true)))
    .addSubcommand(s => s.setName('szablon').setDescription('Zapisuje lub publikuje szablon embeda.')
      .addStringOption(o => o.setName('akcja').setDescription('Operacja').setRequired(true).addChoices({name:'zapisz z embeda',value:'zapisz'},{name:'użyj szablonu',value:'uzyj'},{name:'lista',value:'lista'},{name:'usuń',value:'usun'}))
      .addStringOption(o => o.setName('nazwa').setDescription('Nazwa szablonu').setMaxLength(80))
      .addStringOption(o => o.setName('wiadomosc').setDescription('ID embeda do zapisania').setMaxLength(24))
      .addChannelOption(o => o.setName('kanal').setDescription('Kanał publikacji po użyciu szablonu').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName('zaplanuj').setDescription('Planuje publikację embeda z prostym szablonem.')
      .addChannelOption(o => o.setName('kanal').setDescription('Kanał docelowy').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption(o => o.setName('data').setDescription('Data i czas ISO, np. 2026-12-31T18:00:00+01:00').setRequired(true).setMaxLength(40))
      .addStringOption(o => o.setName('tytul').setDescription('Tytuł embeda').setRequired(true).setMaxLength(256))
      .addStringOption(o => o.setName('opis').setDescription('Opis embeda').setRequired(true).setMaxLength(4000))
      .addStringOption(o => o.setName('powtarzaj').setDescription('Opcjonalne powtarzanie publikacji').addChoices({name:'codziennie',value:'daily'},{name:'co tydzień',value:'weekly'},{name:'co miesiąc',value:'monthly'})))
    .addSubcommand(s => s.setName('harmonogram').setDescription('Pokazuje, anuluje lub ponawia zaplanowane embedy.')
      .addStringOption(o => o.setName('anuluj').setDescription('ID zadania do anulowania').setMaxLength(20))
      .addStringOption(o => o.setName('ponow').setDescription('ID nieudanej publikacji do ponowienia').setMaxLength(20)))
    .addSubcommand(s => s.setName('szablony').setDescription('Pokazuje zapisane szablony embedów'))
    .addSubcommand(s => s.setName('pole').setDescription('Dodaje pole do embeda bez zmiany jego wiadomości.')
      .addStringOption(o => o.setName('wiadomosc').setDescription('ID zapisanej wiadomości embeda').setRequired(true))
      .addStringOption(o => o.setName('nazwa').setDescription('Nazwa pola').setRequired(true).setMaxLength(256))
      .addStringOption(o => o.setName('wartosc').setDescription('Treść pola').setRequired(true).setMaxLength(1024))
      .addBooleanOption(o => o.setName('inline').setDescription('Wyświetl pole w jednej linii')))
    .addSubcommand(s => s.setName('akcja').setDescription('Dodaje bezpieczny przycisk do embeda.')
      .addStringOption(o => o.setName('wiadomosc').setDescription('ID wiadomości embeda').setRequired(true))
      .addStringOption(o => o.setName('typ').setDescription('Działanie przycisku').setRequired(true).addChoices({name:'nadaj rolę',value:'rola-dodaj'},{name:'odbierz rolę',value:'rola-odbierz'},{name:'otwórz ticket',value:'ticket'},{name:'formularz',value:'formularz'}))
      .addStringOption(o => o.setName('etykieta').setDescription('Tekst przycisku').setRequired(true).setMaxLength(80))
      .addRoleOption(o => o.setName('rola').setDescription('Rola do nadania/odebrania'))
      .addChannelOption(o => o.setName('kanal').setDescription('Kanał do odpowiedzi z formularza').addChannelTypes(ChannelType.GuildText))
      .addStringOption(o => o.setName('pytanie').setDescription('Pytanie w formularzu, wymagane dla typu formularz').setMaxLength(45)))
    .addSubcommand(s => s.setName('menu-role').setDescription('Konfiguruje bezpieczne menu samodzielnego wyboru ról.')
      .addStringOption(o => o.setName('wiadomosc').setDescription('ID wiadomości embeda').setRequired(true))
      .addStringOption(o => o.setName('role_ids').setDescription('Dozwolone ID ról oddzielone przecinkami (maks. 25)').setRequired(true).setMaxLength(600))
      .addIntegerOption(o => o.setName('maksimum').setDescription('Maksymalna liczba wybranych ról').setMinValue(1).setMaxValue(5)))
    .addSubcommand(s => s.setName('kopiuj').setDescription('Kopiuje zapisany embed do innego kanału.')
      .addStringOption(o => o.setName('wiadomosc').setDescription('ID wiadomości źródłowej').setRequired(true))
      .addChannelOption(o => o.setName('kanal').setDescription('Kanał docelowy').addChannelTypes(ChannelType.GuildText).setRequired(true))),
];

export const isProCommand = name => name === 'ticket' || name === 'embed';

function embedModal(customId, saved) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(saved ? 'Edytuj embed' : 'Kreator embeda');
  const first=saved?.embeds?.[0] ?? {};
  const fields = [
    ['title', 'Tytuł', TextInputStyle.Short, true, 256, saved?.title || first.title],
    ['description', 'Opis', TextInputStyle.Paragraph, false, 4000, saved?.description || first.description],
    ['color', 'Kolor HEX, np. #8B5CF6', TextInputStyle.Short, false, 7, saved?.color || (first.color ? `#${first.color.toString(16).padStart(6,'0')}` : '#8B5CF6')],
    ['footer', 'Stopka', TextInputStyle.Short, false, 2048, saved?.footer || first.footer?.text],
    ['image', 'Adres obrazu (HTTPS)', TextInputStyle.Short, false, 500, saved?.image || first.image?.url],
  ].map(([id, label, style, required, max, value]) => {
    const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);
    if (value) input.setValue(String(value).slice(0, max));
    return new ActionRowBuilder().addComponents(input);
  });
  return modal.addComponents(...fields);
}

function embedAdvancedModal(draft) {
  const modal=new ModalBuilder().setCustomId(`strefa:embed:advanced:${draft.id}`).setTitle('Autor, miniatura i link');
  const fields=[
    ['author','Autor',draft.author],['authorUrl','Link autora (HTTPS)',draft.authorUrl],['authorIcon','Ikona autora (HTTPS)',draft.authorIcon],
    ['thumbnail','Miniatura (HTTPS)',draft.thumbnail],['url','Link tytułu (HTTPS)',draft.url],
  ].map(([id,label,value])=>{
    const input=new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(id==='author'?256:500);
    if(value)input.setValue(String(value).slice(0,id==='author'?256:500));
    return new ActionRowBuilder().addComponents(input);
  });
  return modal.addComponents(...fields);
}

export function embedAppearanceModal(draft) {
  const modal = new ModalBuilder().setCustomId(`strefa:embed:appearance:${draft.id}`).setTitle('Pozostałe właściwości embeda');
  const fields = [
    ['content', 'Treść wiadomości (poza embedem)', draft.content, TextInputStyle.Paragraph, 2000],
    ['footerIcon', 'Ikona stopki (HTTPS)', draft.footerIcon, TextInputStyle.Short, 500],
    ['timestamp', 'Znacznik czasu (ISO 8601)', draft.timestamp, TextInputStyle.Short, 40],
  ].map(([id, label, value, style, maxLength]) => {
    const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(false).setMaxLength(maxLength);
    if (value) input.setValue(String(value).slice(0, maxLength));
    return new ActionRowBuilder().addComponents(input);
  });
  return modal.addComponents(...fields);
}

function embedFrom(data) {
  const embed = new EmbedBuilder().setColor(Number.parseInt(String(data.color || '#8B5CF6').replace('#', ''), 16));
  if (data.title) embed.setTitle(String(data.title).slice(0, 256));
  if (data.url) embed.setURL(data.url);
  if (data.description) embed.setDescription(String(data.description).slice(0, 4096));
  if (data.author) embed.setAuthor({ name: String(data.author).slice(0, 256), ...(data.authorIcon ? { iconURL: data.authorIcon } : {}), ...(data.authorUrl ? { url: data.authorUrl } : {}) });
  if (data.footer) embed.setFooter({ text: String(data.footer).slice(0, 2048), ...(data.footerIcon ? { iconURL: data.footerIcon } : {}) });
  if (data.image) embed.setImage(data.image);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  if (data.timestamp) embed.setTimestamp(new Date(data.timestamp));
  if (Array.isArray(data.fields)) embed.addFields(data.fields.slice(0, 25).map(field => ({ name: String(field.name).slice(0, 256), value: String(field.value).slice(0, 1024), inline: Boolean(field.inline) })));
  return embed;
}

export function resolveEmbedVariables(data, guild, client) {
  const now = new Date();
  const values = {
    server_name: guild?.name ?? '', server_id: guild?.id ?? '', member_count: String(guild?.memberCount ?? ''),
    user_name: data.createdByName ?? '', user_mention: data.createdBy ? `<@${data.createdBy}>` : '',
    current_date: now.toLocaleDateString('pl-PL'), current_time: now.toLocaleTimeString('pl-PL'),
    channel_name: data.channelName ?? '', bot_name: client.user?.username ?? 'StrefaBot',
  };
  const replace = value => String(value ?? '').replace(/\{(server_name|server_id|member_count|user_name|user_mention|current_date|current_time|channel_name|bot_name)\}/g, (_, key) => values[key]);
  const embed = value => ({...value,
    ...(value.title ? {title:replace(value.title)}:{}), ...(value.description ? {description:replace(value.description)}:{}),
    ...(value.author ? {author:{...value.author,name:replace(value.author.name)}}:{}),
    ...(value.footer ? {footer:{...value.footer,text:replace(value.footer.text)}}:{}),
    ...(value.fields ? {fields:value.fields.map(field=>({...field,name:replace(field.name),value:replace(field.value)}))}:{}),
  });
  return {...data, title:replace(data.title),description:replace(data.description),content:replace(data.content), ...(data.embeds ? {embeds:data.embeds.map(embed)} : {})};
}

export function nextScheduledDate(dateValue, recurrence) {
  const date=new Date(dateValue);
  if(recurrence==='daily')date.setUTCDate(date.getUTCDate()+1);
  else if(recurrence==='weekly')date.setUTCDate(date.getUTCDate()+7);
  else if(recurrence==='monthly'){
    const day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+1);
    const max=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,max));
  }
  return date.toISOString();
}

export const ticketCategoryKey = value => String(value ?? '').toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
export function ticketPanelPayload(panel, categories = []) {
  const embed = new EmbedBuilder().setColor(purple).setTitle(panel.title || '🎫 Centrum pomocy').setDescription(panel.description || 'Wybierz rodzaj zgłoszenia.').setFooter({ text: 'Strefa Gry i Rozrywki • Obsługa zgłoszeń' });
  let components;
  if (categories.length) {
    const menu = new StringSelectMenuBuilder().setCustomId(`${TICKET_BUTTON}category:${panel.messageId}`).setPlaceholder('Wybierz kategorię zgłoszenia');
    menu.addOptions(categories.slice(0, 25).map(category => ({ label: category.name.slice(0, 100), value: category.id, ...(category.emoji ? { emoji: category.emoji } : {}), ...(category.description ? { description: category.description.slice(0, 100) } : {}) })));
    components = [new ActionRowBuilder().addComponents(menu)];
  } else components = [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${TICKET_BUTTON}open`).setLabel(panel.buttonLabel || 'Otwórz zgłoszenie').setEmoji('🎫').setStyle(ButtonStyle.Primary))];
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

export function ticketFormModal(panel, category = null) {
  const questions = category?.questions?.length ? category.questions.slice(0, 5) : [
    { id: 'subject', label: 'Temat zgłoszenia', style: TextInputStyle.Short, required: true, maxLength: 100 },
    { id: 'details', label: 'Opisz sprawę', style: TextInputStyle.Paragraph, required: true, maxLength: 1000 },
    { id: 'expectation', label: 'Jakiej pomocy oczekujesz?', style: TextInputStyle.Paragraph, required: false, maxLength: 500 },
  ];
  const customId = `${TICKET_BUTTON}submit:${panel.messageId}${category ? `:${category.id}` : ''}`;
  const modal = new ModalBuilder().setCustomId(customId).setTitle((category?.name || 'Nowe zgłoszenie').slice(0, 45));
  modal.addComponents(...questions.map((question, index) => new ActionRowBuilder().addComponents(new TextInputBuilder()
    .setCustomId(question.id || `q${index}`)
    .setLabel(String(question.label || question).slice(0, 45))
    .setStyle(question.style === 'short' || question.style === TextInputStyle.Short ? TextInputStyle.Short : TextInputStyle.Paragraph)
    .setRequired(question.required !== false)
    .setMaxLength(Math.min(4000, Math.max(1, Number(question.maxLength) || 1000))))));
  return modal;
}

export function embedComponents(entry) {
  const rows = [];
  const actions = (entry.actions ?? []).filter(action => action.active !== false).slice(0,20);
  if (actions.length) {
    for (let offset=0; offset<actions.length; offset+=5) {
      rows.push(new ActionRowBuilder().addComponents(actions.slice(offset,offset+5).map(action => action.type==='ticket'
        ? new ButtonBuilder().setCustomId(`${TICKET_BUTTON}open`).setLabel(action.label).setEmoji('🎫').setStyle(ButtonStyle.Primary)
        : new ButtonBuilder().setCustomId(`strefa:embed:action:${entry.messageId}:${action.id}`).setLabel(action.label).setStyle(ButtonStyle.Secondary))));
    }
  }
  if (entry.roleOptions?.length && rows.length<5) {
    const menu=new StringSelectMenuBuilder().setCustomId(`strefa:embed:roles:${entry.messageId}`).setPlaceholder('Wybierz lub zdejmij role')
      .setMinValues(1).setMaxValues(Math.min(entry.maxRoleSelections ?? 1,entry.roleOptions.length,5))
      .addOptions(entry.roleOptions.slice(0,25).map(role=>({label:role.name.slice(0,100),value:role.id,description:'Kliknij ponownie, aby odebrać rolę'})));
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  return rows;
}

function embedDraftControls(id, label='Opublikuj') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`strefa:embed:draft:${id}:publish`).setLabel(label).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`strefa:embed:draft:${id}:advanced`).setLabel('Edytuj autora i media').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`strefa:embed:draft:${id}:appearance`).setLabel('Więcej właściwości').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`strefa:embed:draft:${id}:cancel`).setLabel('Anuluj').setStyle(ButtonStyle.Secondary),
  );
}

export function createProSystem({ client, featureStore, cfg }) {
  const opening = new Set();
  const closing = new Set();
  const legacyScans = new Map();
  const activityWrites = new Map();
  const scheduledBusy = new Set();
  const actionCooldowns = new Map();
  const ephemeral = { flags: MessageFlags.Ephemeral };
  const manager = interaction => {
    const settings = featureStore.snapshot().tickets.guildSettings?.[interaction.guildId] ?? {};
    const roles = interaction.member?.roles?.cache;
    return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
      (cfg.staffRoleId && roles?.has?.(cfg.staffRoleId)) || (settings.supportRoleId && roles?.has?.(settings.supportRoleId)) ||
      (settings.adminRoleIds ?? []).some(id => roles?.has?.(id)));
  };
  const canHandleTicket = (interaction, ticket) => manager(interaction) || Boolean(ticket.supportRoleId && interaction.member?.roles?.cache?.has?.(ticket.supportRoleId));
  const respond = (interaction, content, options = {}) => interaction.reply({ content, ...ephemeral, ...options });
  const ticketFor = channelId => featureStore.snapshot().tickets.items.find(item => item.channelId === channelId);

  async function syncLegacyTickets(guild) {
    if (Date.now() - (legacyScans.get(guild.id) ?? 0) < 30_000) return;
    legacyScans.set(guild.id, Date.now());
    const channels = await guild.channels.fetch().catch(() => null);
    if (!channels) return;
    const known = new Set(featureStore.snapshot().tickets.items.map(item => item.channelId));
    const legacy = channels.filter(channel => channel?.type === ChannelType.GuildText && channel.topic?.startsWith('strefa-ticket-owner:') && !known.has(channel.id));
    if (!legacy.size) return;
    const recovered = [...legacy.values()].map(channel => {
      const ownerId = channel.topic.slice('strefa-ticket-owner:'.length);
      const closed = channel.name.startsWith('zamkniety-');
      return { id: `L${channel.id.slice(-12)}`, guildId: guild.id, channelId: channel.id, ownerId, ownerName: ownerId, subject: channel.name.replace(/^zamkniety-/, 'Legacy: '), details: '', expectation: '', status: closed ? 'closed' : 'open', supportRoleId: null, createdAt: new Date(channel.createdTimestamp).toISOString(), closedAt: closed ? new Date(channel.createdTimestamp).toISOString() : null, legacy: true, events: [{ type: 'recovered', at: new Date().toISOString() }] };
    });
    await featureStore.update(state => {
      const current = new Set(state.tickets.items.map(item => item.channelId));
      state.tickets.items.push(...recovered.filter(item => !current.has(item.channelId)));
    });
  }

  async function writeLog(guild, title, description) {
    const actorId = /<@!?([0-9]{17,20})>/.exec(description)?.[1] ?? null;
    const ticketId = /(?:Ticket|ticket|ID):?\s*`?([A-Z0-9]{5,20})`?/i.exec(description)?.[1] ?? null;
    const entry = { id: shortId(), guildId: guild.id, ticketId, actorId, action: title, at: new Date().toISOString(), details: { description: String(description).slice(0, 1800) } };
    await featureStore.update(state => { state.tickets.auditLogs = [...(state.tickets.auditLogs ?? []), entry].slice(-5000); });
    const state = featureStore.snapshot();
    const id = state.tickets.guildSettings?.[guild.id]?.logChannelId || (guild.id === cfg.guildId ? state.tickets.logChannelId || state.logChannelId || cfg.logChannelId : null);
    if (!id) return;
    const channel = await guild.channels.fetch(id).catch(() => null);
    if (channel?.isTextBased()) await channel.send({ embeds: [new EmbedBuilder().setColor(purple).setTitle(title).setDescription(description.slice(0, 3900)).setTimestamp()], allowedMentions: { parse: [] } }).catch(() => {});
  }

  async function refreshTicketPanels(guild) {
    const state = featureStore.snapshot().tickets;
    const categories = state.guildSettings?.[guild.id]?.categories?.filter(item => item.active !== false) ?? [];
    const panels = state.panels.filter(item => item.guildId === guild.id && item.active !== false);
    for (const panel of panels) {
      const channel = await guild.channels.fetch(panel.channelId).catch(() => null);
      const message = channel?.isTextBased() ? await channel.messages.fetch(panel.messageId).catch(() => null) : null;
      if (message?.author?.id === client.user.id) await message.edit(ticketPanelPayload(panel, categories)).catch(error => console.warn(`Nie udało się odświeżyć panelu ticketów ${panel.messageId}:`, error.message));
    }
  }

  function ticketControls(ticket) {
    const buttons = ticket.status === 'open'
      ? [new ButtonBuilder().setCustomId(`${TICKET_BUTTON}${ticket.id}:claim`).setLabel(ticket.claimedBy ? `Opiekun: ${ticket.claimedName || 'przypisany'}` : 'Przejmij').setEmoji('🙋').setStyle(ButtonStyle.Secondary).setDisabled(Boolean(ticket.claimedBy)), new ButtonBuilder().setCustomId(`${TICKET_BUTTON}${ticket.id}:close`).setLabel('Zamknij').setEmoji('🔒').setStyle(ButtonStyle.Danger)]
      : [new ButtonBuilder().setCustomId(`${TICKET_BUTTON}${ticket.id}:reopen`).setLabel('Otwórz ponownie').setEmoji('🔓').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`${TICKET_BUTTON}${ticket.id}:transcript`).setLabel('Transkrypt').setEmoji('📄').setStyle(ButtonStyle.Secondary)];
    return [new ActionRowBuilder().addComponents(buttons)];
  }

  async function transcript(ticket, channel) {
    const collected = [];
    let before;
    while (collected.length < 1000) {
      const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (!page?.size) break;
      collected.push(...page.values());
      before = page.last()?.id;
      if (page.size < 100) break;
    }
    const rows = collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const body = rows.map(message => {
      const author = escapeHtml(message.author?.tag ?? 'nieznany użytkownik');
      const text = escapeHtml(message.content || '[wiadomość bez tekstu]');
      const links = [...message.attachments.values()].map(file => `<a href="${escapeHtml(file.url)}">${escapeHtml(file.name || 'załącznik')}</a>`).join(' · ');
      return `<article><b>${author}</b><time>${new Date(message.createdTimestamp).toLocaleString('pl-PL')}</time><p>${text.replaceAll('\n', '<br>')}</p>${links ? `<small>${links}</small>` : ''}</article>`;
    }).join('\n');
    return `<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Ticket ${escapeHtml(ticket.id)}</title><style>body{margin:0;background:#171321;color:#f5f3ff;font:15px system-ui}main{max-width:900px;margin:32px auto;padding:24px;background:#211b2c;border:1px solid #3c3150;border-radius:16px}h1{color:#a78bfa}article{padding:14px 0;border-bottom:1px solid #40364d}time{float:right;color:#b9aec7}p{white-space:normal;overflow-wrap:anywhere}a{color:#c4b5fd}</style><main><h1>Ticket ${escapeHtml(ticket.id)}</h1><p>Utworzono: ${escapeHtml(new Date(ticket.createdAt).toLocaleString('pl-PL'))} · Zamknięto: ${escapeHtml(ticket.closedAt ? new Date(ticket.closedAt).toLocaleString('pl-PL') : 'w trakcie')}</p><p>Autor: ${escapeHtml(ticket.ownerName)} · Opiekun: ${escapeHtml(ticket.claimedName || 'brak')} · Powód: ${escapeHtml(ticket.closeReason || 'brak')}</p>${body}</main></html>`;
  }

  async function finishClose(interaction, ticket, reason) {
    if (ticket.status !== 'open') return respond(interaction, 'Ticket nie jest już otwarty.');
    if (closing.has(ticket.id)) return respond(interaction, 'Ten ticket jest właśnie zamykany.');
    closing.add(ticket.id);
    try {
      await interaction.deferReply(ephemeral);
      const channel = interaction.channel;
      const owner = await interaction.guild.members.fetch(ticket.ownerId).catch(() => null);
      const next = { ...ticket, status: 'closed', closedAt: new Date().toISOString(), closeReason: reason, closedBy: interaction.user.id, deleteOnClose: true };
      next.transcriptHtml = await transcript(next, channel);
      await featureStore.update(state => { state.tickets.items = state.tickets.items.map(item => item.id === ticket.id ? next : item); });
      await owner?.send({ content: `Ticket ${ticket.id} na serwerze **${interaction.guild.name}** został zamknięty. Powód: ${reason || 'nie podano'}.` }).catch(() => {});
      await writeLog(interaction.guild, '🔒 Zamknięto ticket', `ID: ${ticket.id}\nAutor: <@${ticket.ownerId}>\nZamknął: <@${interaction.user.id}>\nPowód: ${reason || 'nie podano'}`);
      try {
        await deleteClosedChannel(next, channel);
      } catch (error) {
        console.error(`Nie udało się usunąć kanału ticketu ${ticket.id}:`, error.message);
        return interaction.editReply({ content: 'Ticket zamknięty i transkrypt zapisany, ale nie udało się usunąć kanału. Sprawdź uprawnienie bota Zarządzanie kanałami. Bot ponowi próbę automatycznie.' });
      }
      return interaction.editReply({ content: 'Ticket zamknięty. Transkrypt zapisano, a kanał usunięto.' });
    } finally { closing.delete(ticket.id); }
  }

  async function deleteClosedChannel(ticket, channel) {
    // Persist the transcript and closed state before removing the Discord channel.
    if (!ticket.transcriptHtml || ticket.status !== 'closed') throw new Error('Brak zapisanego transkryptu zamkniętego ticketu.');
    if (channel) await channel.delete(`Zamknięcie ticketu ${ticket.id}`);
    await featureStore.update(state => {
      const current = state.tickets.items.find(item => item.id === ticket.id);
      if (current) current.channelDeletedAt = new Date().toISOString();
    });
  }

  async function command(interaction) {
    if (!interaction.inGuild()) return respond(interaction, 'Ta funkcja działa tylko na serwerze Discord.');
    const top = interaction.commandName;
    const sub = interaction.options.getSubcommand();
    if (top === 'ticket') {
      await syncLegacyTickets(interaction.guild);
      if (sub === 'panel') {
        if (!manager(interaction)) return respond(interaction, 'Wymagane jest uprawnienie Zarządzanie serwerem.');
        const channel = interaction.options.getChannel('kanal') ?? interaction.channel;
        const category = interaction.options.getChannel('kategoria');
        const role = interaction.options.getRole('obsluga');
        const title = interaction.options.getString('tytul')?.trim() || '🎫 Centrum pomocy';
        const description = interaction.options.getString('opis')?.trim() || 'Wybierz przycisk, wypełnij krótki formularz, a prywatny kanał zgłoszenia zostanie utworzony.';
        const guildSettings = featureStore.snapshot().tickets.guildSettings?.[interaction.guildId] ?? {};
        const categoryId = category?.id ?? guildSettings.categoryId ?? featureStore.snapshot().tickets.categoryId;
        const supportRoleId = role?.id ?? guildSettings.supportRoleId ?? featureStore.snapshot().tickets.supportRoleId;
        const categories = guildSettings.categories?.filter(item => item.active !== false) ?? [];
        const panelConfig = { guildId: interaction.guildId, channelId: channel.id, channelName: channel.name, categoryId, supportRoleId, title, description, buttonLabel: 'Otwórz zgłoszenie', createdAt: new Date().toISOString(), active: true };
        const message = await channel.send(ticketPanelPayload(panelConfig, []));
        await featureStore.update(state => {
          state.tickets.guildSettings ??= {};
          state.tickets.guildSettings[interaction.guildId] = { ...(state.tickets.guildSettings[interaction.guildId] ?? {}), categoryId, supportRoleId };
          state.tickets.panels ??= [];
          state.tickets.panels.push({ ...panelConfig, messageId: message.id });
        });
        if (categories.length) await message.edit(ticketPanelPayload({ ...panelConfig, messageId: message.id }, categories));
        await writeLog(interaction.guild, '🎫 Utworzono panel ticketów', `Utworzył: <@${interaction.user.id}> · <#${channel.id}>`);
        return respond(interaction, `Panel ticketów opublikowany w <#${channel.id}>.`);
      }
      if (sub === 'panel-edytuj' || sub === 'panel-usun') {
        if (!manager(interaction)) return respond(interaction, 'Wymagane jest uprawnienie Zarządzanie serwerem.');
        const id = interaction.options.getString('wiadomosc', true);
        const panel = featureStore.snapshot().tickets.panels.find(item => item.guildId === interaction.guildId && item.messageId === id && item.active !== false);
        if (!panel) return respond(interaction, 'Nie znaleziono aktywnego panelu ticketów o tym ID wiadomości.');
        const channel = await interaction.guild.channels.fetch(panel.channelId).catch(() => null);
        const message = channel?.isTextBased() ? await channel.messages.fetch(id).catch(() => null) : null;
        if (!message || message.author.id !== client.user.id) return respond(interaction, 'Wiadomość panelu nie jest dostępna lub nie należy do bota.');
        if (sub === 'panel-usun') {
          await message.delete();
          await featureStore.update(state => { const current = state.tickets.panels.find(item => item.guildId === interaction.guildId && item.messageId === id); if (current) { current.active = false; current.deletedAt = new Date().toISOString(); } });
          await writeLog(interaction.guild, '🗑️ Usunięto panel ticketów', `Wiadomość ${id} · wykonał <@${interaction.user.id}>`);
          return respond(interaction, 'Panel usunięty; historia ticketów została zachowana.');
        }
        const title = interaction.options.getString('tytul')?.trim();
        const description = interaction.options.getString('opis')?.trim();
        const updated = { ...panel, ...(title ? { title } : {}), ...(description ? { description } : {}), updatedAt: new Date().toISOString() };
        const cats = featureStore.snapshot().tickets.guildSettings?.[interaction.guildId]?.categories?.filter(item => item.active !== false) ?? [];
        await message.edit(ticketPanelPayload(updated, cats));
        await featureStore.update(state => { const current = state.tickets.panels.find(item => item.guildId === interaction.guildId && item.messageId === id); if (current) Object.assign(current, updated); });
        await writeLog(interaction.guild, '✏️ Edytowano panel ticketów', `Wiadomość ${id} · wykonał <@${interaction.user.id}>`);
        return respond(interaction, `Zaktualizowano panel w <#${channel.id}> bez tworzenia nowej wiadomości.`);
      }
      if (sub === 'kategoria') {
        if (!manager(interaction)) return respond(interaction, 'Wymagane jest uprawnienie Zarządzanie serwerem.');
        const id = ticketCategoryKey(interaction.options.getString('id', true));
        if (!id) return respond(interaction, 'ID kategorii może zawierać litery, cyfry, myślnik i podkreślenie.');
        const name = interaction.options.getString('nazwa')?.trim();
        const questions = [1,2,3,4,5].map(index => interaction.options.getString(`pytanie${index}`)?.trim()).filter(Boolean)
          .map((label,index) => ({ id:`q${index}`, label, style: label.length > 32 ? 'paragraph' : 'short', required:true, maxLength: label.length > 32 ? 1000 : 256 }));
        const categoryChannel = interaction.options.getChannel('kanal-kategorii');
        const role = interaction.options.getRole('rola-obslugi');
        const emoji = interaction.options.getString('emoji')?.trim();
        const now = new Date().toISOString();
        let removed = false;
        await featureStore.update(state => {
          state.tickets.guildSettings ??= {};
          const setting = state.tickets.guildSettings[interaction.guildId] ??= {};
          setting.categories ??= [];
          setting.categories = setting.categories.filter(item => item.id !== id);
          if (!name) { removed = true; return; }
          setting.categories.push({ id, name, emoji: emoji || null, categoryId: categoryChannel?.id ?? null, supportRoleId: role?.id ?? null, questions: questions.length ? questions : [
            {id:'subject',label:'Temat zgłoszenia',style:'short',required:true,maxLength:100},
            {id:'details',label:'Opisz dokładnie problem',style:'paragraph',required:true,maxLength:1000},
            {id:'expectation',label:'Jakiej pomocy oczekujesz?',style:'paragraph',required:false,maxLength:500},
          ], active:true, updatedAt:now });
        });
        await refreshTicketPanels(interaction.guild);
        await writeLog(interaction.guild, removed ? '🗑️ Usunięto kategorię ticketu' : '⚙️ Zapisano kategorię ticketu', `${id} · wykonał <@${interaction.user.id}>`);
        return respond(interaction, removed ? `Usunięto kategorię **${id}**. Istniejące tickety i panele pozostają zachowane.` : `Zapisano kategorię **${name}** z ${questions.length || 3} pytaniami. Panele z kategoriami będą pokazywać menu wyboru.`);
      }
      if (sub === 'kategorie') {
        const categories = featureStore.snapshot().tickets.guildSettings?.[interaction.guildId]?.categories?.filter(item => item.active !== false) ?? [];
        return respond(interaction, categories.length ? categories.slice(0,25).map(item => `**${item.emoji ?? '🎫'} ${item.name}** (${item.id}) · pytania: ${(item.questions ?? []).map(question => question.label).join(' / ')}`).join('\n') : 'Nie skonfigurowano kategorii. Dodaj ją poleceniem `/ticket kategoria`.');
      }
      if (sub === 'administrator') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return respond(interaction, 'Tylko administrator serwera może zmieniać role administrujące ticketami.');
        const role = interaction.options.getRole('rola', true);
        const add = interaction.options.getBoolean('dodaj', true);
        await featureStore.update(state => {
          state.tickets.guildSettings ??= {};
          const settings = state.tickets.guildSettings[interaction.guildId] ??= {};
          settings.adminRoleIds ??= [];
          settings.adminRoleIds = [...new Set(settings.adminRoleIds.filter(id => id !== role.id))];
          if (add) settings.adminRoleIds.push(role.id);
        });
        await writeLog(interaction.guild, add ? '🛡️ Dodano rolę administracji ticketów' : '🛡️ Usunięto rolę administracji ticketów', `Rola <@&${role.id}> · wykonał <@${interaction.user.id}>`);
        return respond(interaction, add ? `Rola <@&${role.id}> może zarządzać ticketami.` : `Rola <@&${role.id}> nie zarządza już ticketami.`);
      }
      if (sub === 'statystyki' || sub === 'lista') {
        if (!manager(interaction)) return respond(interaction, 'Wymagane jest uprawnienie Zarządzanie serwerem.');
        const all = featureStore.snapshot().tickets.items.filter(item => item.guildId === interaction.guildId && item.status !== 'deleting');
        if (sub === 'statystyki') {
          const open = all.filter(item => item.status === 'open').length;
          const closed = all.length - open;
          const claimed = all.filter(item => item.claimedBy).length;
          const completed = all.filter(item => item.closedAt);
          const average = values => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length / 60000) : 0;
          const responseTimes = all.filter(item => item.firstResponseAt || item.claimedAt).map(item => Date.parse(item.firstResponseAt || item.claimedAt) - Date.parse(item.createdAt)).filter(value => value >= 0);
          const resolutionTimes = completed.map(item => Date.parse(item.closedAt) - Date.parse(item.createdAt)).filter(value => value >= 0);
          const ratings = all.map(item => Number(item.rating?.stars)).filter(value => value >= 1 && value <= 5);
          const staffStats = new Map();
          for (const item of all) if (item.claimedBy) {
            const current = staffStats.get(item.claimedBy) ?? { count: 0, ratings: [] };
            current.count++;
            if (item.rating?.staffId === item.claimedBy && item.rating.stars) current.ratings.push(item.rating.stars);
            staffStats.set(item.claimedBy, current);
          }
          const ranking = [...staffStats.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 5)
            .map(([id, value], index) => `${index + 1}. <@${id}> · ${value.count} ticketów${value.ratings.length ? ` · ocena ${(value.ratings.reduce((sum, rating) => sum + rating, 0) / value.ratings.length).toFixed(1)}/5` : ''}`).join('\n');
          return respond(interaction, '', { embeds: [new EmbedBuilder().setColor(purple).setTitle('🎫 Statystyki ticketów').addFields(
            { name: 'Wszystkie', value: String(all.length), inline: true }, { name: 'Otwarte', value: String(open), inline: true },
            { name: 'Zamknięte', value: String(closed), inline: true }, { name: 'Bez opiekuna', value: String(all.filter(item => item.status === 'open' && !item.claimedBy).length), inline: true },
            { name: 'Średnia pierwsza odpowiedź', value: `${average(responseTimes)} min`, inline: true }, { name: 'Średni czas zamknięcia', value: `${average(resolutionTimes)} min`, inline: true },
            { name: 'Średnia ocena', value: ratings.length ? `${(ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(2)} / 5 (${ratings.length})` : 'Brak ocen', inline: true },
            { name: 'Przejęte przez obsługę', value: String(claimed), inline: true },
            { name: 'Ranking obsługi', value: ranking || 'Brak przypisanych ticketów', inline: false },
          ).setTimestamp()] });
        }
        const rows = all.slice(-15).reverse().map(item => `• **${item.id}** · ${item.status === 'open' ? 'otwarty' : 'zamknięty'} · <#${item.channelId}> · <@${item.ownerId}>`);
        return respond(interaction, rows.length ? rows.join('\n') : 'Nie ma jeszcze ticketów.');
      }
      if (sub === 'raport' || sub === 'eksport') {
        if (!manager(interaction)) return respond(interaction, 'Wymagane jest uprawnienie Zarządzanie serwerem.');
        const all = featureStore.snapshot().tickets.items.filter(item => item.guildId === interaction.guildId && !['deleting', 'deleted'].includes(item.status));
        const now = new Date();
        const period = interaction.options.getString('okres');
        const start = sub === 'eksport' ? new Date(0) : period === 'miesiac' ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const entries = all.filter(item => Date.parse(item.createdAt) >= start.getTime());
        if (sub === 'raport') {
          const durations = entries.filter(item => item.closedAt).map(item => Date.parse(item.closedAt) - Date.parse(item.createdAt)).filter(value => value >= 0);
          const mean = durations.length ? Math.round(durations.reduce((sum,value)=>sum+value,0)/durations.length/60000) : 0;
          const categories = new Map();
          const staff = new Map();
          for (const item of entries) {
            const category = item.categoryName || 'Ogólna'; categories.set(category,(categories.get(category) ?? 0)+1);
            if (item.claimedBy) staff.set(item.claimedBy,(staff.get(item.claimedBy) ?? 0)+1);
          }
          const categoryText=[...categories].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,count])=>`• ${name}: **${count}**`).join('\n')||'Brak danych';
          const staffText=[...staff].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,count],index)=>`${index+1}. <@${id}> — ${count}`).join('\n')||'Brak danych';
          const rated=entries.filter(item=>item.rating?.stars).map(item=>item.rating.stars);
          return respond(interaction,'',{embeds:[new EmbedBuilder().setColor(purple).setTitle(`📊 Raport ticketów — ${period === 'miesiac' ? 'ten miesiąc' : 'dzisiaj'}`).addFields(
            {name:'Nowe',value:String(entries.length),inline:true},{name:'Otwarte',value:String(entries.filter(item=>item.status==='open').length),inline:true},{name:'Zamknięte',value:String(entries.filter(item=>item.status==='closed').length),inline:true},
            {name:'Średni czas rozwiązania',value:`${mean} min`,inline:true},{name:'Średnia ocena',value:rated.length?`${(rated.reduce((a,b)=>a+b,0)/rated.length).toFixed(2)}/5`:'Brak ocen',inline:true},
            {name:'Kategorie',value:categoryText,inline:false},{name:'Ranking opiekunów',value:staffText,inline:false},
          ).setTimestamp()]});
        }
        const cell = value => { const text = String(value ?? '').replace(/[\r\n]+/g,' '); return `"${(/^[=+@-]/.test(text)?`'${text}`:text).replaceAll('"','""')}"`; };
        const headings=['ID','Serwer','Kanał','Autor ID','Temat','Kategoria','Status','Opiekun ID','Utworzono','Zamknięto','Powód','Ocena'];
        const csv=[headings.join(';'),...entries.slice(-10000).map(item=>[item.id,item.guildId,item.channelId,item.ownerId,item.subject,item.categoryName,item.status,item.claimedBy,item.createdAt,item.closedAt,item.closeReason,item.rating?.stars].map(cell).join(';'))].join('\r\n');
        return respond(interaction,`Eksport zawiera ${Math.min(entries.length,10000)} z ${entries.length} ticketów.`,{files:[new AttachmentBuilder(Buffer.from(`\uFEFF${csv}`,'utf8'),{name:`tickety-${interaction.guildId}-${now.toISOString().slice(0,10)}.csv`})]});
      }
      if (sub === 'konfiguracja') {
        if (!manager(interaction)) return respond(interaction, 'Wymagane jest uprawnienie Zarządzanie serwerem.');
        const limit = interaction.options.getInteger('limit_na_osobe', true);
        const logChannel = interaction.options.getChannel('kanal_logow');
        const role = interaction.options.getRole('rola_obslugi');
        const reminderHours = interaction.options.getInteger('przypomnienie_h');
        const autoCloseHours = interaction.options.getInteger('auto_zamknij_h');
        const unassignedMinutes = interaction.options.getInteger('bez_opiekuna_min');
        if (logChannel && !logChannel.permissionsFor(interaction.guild.members.me ?? await interaction.guild.members.fetchMe())?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) return respond(interaction, 'Bot potrzebuje dostępu do kanału logów i uprawnienia wysyłania wiadomości oraz embedów.');
        await featureStore.update(state => { state.tickets.guildSettings ??= {}; const settings = state.tickets.guildSettings[interaction.guildId] ??= {}; Object.assign(settings, { maxOpenPerUser: limit, ...(logChannel ? { logChannelId: logChannel.id } : {}), ...(role ? { supportRoleId: role.id } : {}), ...(reminderHours !== null ? { reminderAfterHours: reminderHours || null } : {}), ...(autoCloseHours !== null ? { autoCloseAfterHours: autoCloseHours || null } : {}), ...(unassignedMinutes !== null ? { unassignedAfterMinutes: unassignedMinutes || null } : {}) }); });
        return respond(interaction, `Konfiguracja zapisana. Limit: **${limit}**${role ? ` · obsługa: <@&${role.id}>` : ''}${logChannel ? ` · logi: <#${logChannel.id}>` : ''}${reminderHours !== null ? ` · przypomnienia: ${reminderHours ? `${reminderHours} h` : 'wyłączone'}` : ''}${autoCloseHours !== null ? ` · autozamknięcie: ${autoCloseHours ? `${autoCloseHours} h` : 'wyłączone'}` : ''}${unassignedMinutes !== null ? ` · brak opiekuna: ${unassignedMinutes ? `${unassignedMinutes} min` : 'wyłączone'}` : ''}.`);
      }
      if (sub === 'blacklist') {
        if (!manager(interaction)) return respond(interaction, 'Wymagane jest uprawnienie Zarządzanie serwerem.');
        const user = interaction.options.getUser('uzytkownik', true);
        if (user.bot) return respond(interaction, 'Nie można dodawać botów do blacklisty ticketów.');
        const block = interaction.options.getBoolean('zablokuj', true);
        await featureStore.update(state => {
          state.tickets.blacklist = state.tickets.blacklist.filter(item => !(item.guildId === interaction.guildId && item.userId === user.id));
          if (block) state.tickets.blacklist.push({ guildId: interaction.guildId, userId: user.id, addedBy: interaction.user.id, at: new Date().toISOString() });
        });
        await writeLog(interaction.guild, block ? '⛔ Dodano użytkownika do blacklisty ticketów' : '✅ Usunięto użytkownika z blacklisty ticketów', `Użytkownik <@${user.id}> · zmienił <@${interaction.user.id}>`);
        return respond(interaction, block ? `Zablokowano otwieranie ticketów dla <@${user.id}>.` : `Odblokowano otwieranie ticketów dla <@${user.id}>.`);
      }
      if (sub === 'historia') {
        const user = interaction.options.getUser('uzytkownik') ?? interaction.user;
        if (user.id !== interaction.user.id && !manager(interaction)) return respond(interaction, 'Historię innych użytkowników może przeglądać tylko obsługa serwera.');
        const items = featureStore.snapshot().tickets.items.filter(item => item.guildId === interaction.guildId && item.ownerId === user.id).slice(-20).reverse();
        return respond(interaction, items.length ? items.map(item => `• **${item.id}** · ${item.subject} · ${item.status === 'open' ? 'otwarty' : 'zamknięty'} · <#${item.channelId}>`).join('\n') : 'Brak historii ticketów.');
      }
      const ticket = ticketFor(interaction.channelId);
      if (!ticket || ticket.guildId !== interaction.guildId) return respond(interaction, 'Ta komenda działa wewnątrz kanału ticketu.');
      if (sub === 'zamknij') {
        if (interaction.user.id !== ticket.ownerId && !canHandleTicket(interaction, ticket)) return respond(interaction, 'Tylko autor ticketu lub obsługa może go zamknąć.');
        return finishClose(interaction, ticket, 'Zamknięty komendą.');
      }
      if (sub === 'otworz-ponownie') return reopen(interaction, ticket);
      if (sub === 'przejmij') return claim(interaction, ticket);
      if (sub === 'transcript') return sendTranscript(interaction, ticket);
      if (sub === 'usun') {
        if (!manager(interaction)) return respond(interaction, 'Wymagane jest uprawnienie Zarządzanie serwerem.');
        const at = new Date().toISOString();
        await featureStore.update(state => { const current = state.tickets.items.find(item => item.id === ticket.id); if (current) current.deleteRequest = { requestedBy: interaction.user.id, at }; });
        const controls = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`${TICKET_BUTTON}${ticket.id}:delete-confirm`).setLabel('Usuń ticket').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`${TICKET_BUTTON}${ticket.id}:delete-cancel`).setLabel('Anuluj').setStyle(ButtonStyle.Secondary),
        );
        return respond(interaction, `Czy na pewno usunąć kanał ticketu **${ticket.id}**? Kanał i jego widoczny zapis rozmowy zostaną usunięte.`, { components: [controls] });
      }
      if (sub === 'dodaj' || sub === 'usun-uzytkownika') {
        if (!manager(interaction)) return respond(interaction, 'Wymagane jest uprawnienie Zarządzanie serwerem.');
        const user = interaction.options.getUser('uzytkownik', true);
        if (user.bot || user.id === ticket.ownerId) return respond(interaction, 'Wybierz użytkownika serwera, który nie jest autorem ticketu ani botem.');
        await interaction.channel.permissionOverwrites.edit(user.id, sub === 'dodaj' ? { ViewChannel: true, SendMessages: ticket.status === 'open', ReadMessageHistory: true, AttachFiles: true } : { ViewChannel: false }, { reason: `Ticket ${ticket.id}: ${sub} przez ${interaction.user.tag}` });
        await writeLog(interaction.guild, sub === 'dodaj' ? '➕ Dodano uczestnika ticketu' : '➖ Usunięto uczestnika ticketu', `Ticket: ${ticket.id} · użytkownik <@${user.id}> · wykonał <@${interaction.user.id}>`);
        return respond(interaction, sub === 'dodaj' ? `Dodano <@${user.id}> do ticketu.` : `Usunięto <@${user.id}> z ticketu.`);
      }
      if (sub === 'przekaz') {
        if (!manager(interaction)) return respond(interaction, 'Tylko obsługa serwera może przekazać ticket.');
        const newOwner = interaction.options.getUser('opiekun', true);
        const member = await interaction.guild.members.fetch(newOwner.id).catch(() => null);
        const isStaff = Boolean(member && (member.permissions.has(PermissionFlagsBits.ManageGuild) || member.permissions.has(PermissionFlagsBits.Administrator) || (cfg.staffRoleId && member.roles.cache.has(cfg.staffRoleId))));
        if (!member || newOwner.bot || (ticket.supportRoleId && !isStaff && !member.roles.cache.has(ticket.supportRoleId))) return respond(interaction, 'Nowy opiekun musi być członkiem obsługi ticketów.');
        const updated = { ...ticket, claimedBy: newOwner.id, claimedName: newOwner.tag, claimedAt: new Date().toISOString(), events: [...(ticket.events ?? []), { type: 'transferred', by: interaction.user.id, to: newOwner.id, at: new Date().toISOString() }] };
        await featureStore.update(state => { state.tickets.items = state.tickets.items.map(item => item.id === ticket.id ? updated : item); });
        const latest = await interaction.channel.messages.fetch({ limit: 20 });
        const controlMessage = latest.find(message => message.author.id === client.user.id && message.components.length);
        if (controlMessage) await controlMessage.edit({ components: ticketControls(updated) });
        await interaction.channel.send(`🔄 Ticket przekazano do <@${newOwner.id}>.`);
        await writeLog(interaction.guild, '🔄 Przekazano ticket', `${ticket.id} · <@${interaction.user.id}> → <@${newOwner.id}>`);
        return respond(interaction, `Ticket przekazano do <@${newOwner.id}>.`);
      }
      if (sub === 'zmien-nazwe') {
        if (!manager(interaction)) return respond(interaction, 'Tylko obsługa serwera może zmienić nazwę kanału.');
        const name = interaction.options.getString('nazwa', true).toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
        if (!name) return respond(interaction, 'Podaj nazwę zawierającą litery lub cyfry.');
        await interaction.channel.setName(name, `Nazwę ticketu ${ticket.id} zmienił ${interaction.user.tag}`);
        await writeLog(interaction.guild, '✏️ Zmieniono nazwę ticketu', `${ticket.id} · ${name} · <@${interaction.user.id}>`);
        return respond(interaction, `Nazwa kanału zmieniona na **${name}**.`);
      }
      if (sub === 'ocena') {
        if (interaction.user.id !== ticket.ownerId) return respond(interaction, 'Ticket może ocenić tylko jego autor.');
        if (ticket.status !== 'closed') return respond(interaction, 'Oceń ticket po jego zamknięciu.');
        if (ticket.rating) return respond(interaction, 'Ten ticket został już oceniony.');
        const stars = interaction.options.getInteger('gwiazdki', true);
        const comment = interaction.options.getString('komentarz')?.trim() || '';
        await featureStore.update(state => { const current = state.tickets.items.find(item => item.id === ticket.id); if (current && !current.rating) current.rating = { stars, comment, ratedBy: interaction.user.id, ratedAt: new Date().toISOString(), staffId: current.claimedBy ?? null }; });
        await writeLog(interaction.guild, '⭐ Ocena obsługi ticketu', `Ticket ${ticket.id} · ${stars}/5 · ${comment || 'bez komentarza'} · <@${interaction.user.id}>`);
        return respond(interaction, `Dziękujemy za ocenę **${'⭐'.repeat(stars)}**.`);
      }
    }
    if (top === 'embed') {
      if (!manager(interaction)) return respond(interaction, 'Wymagane jest uprawnienie Zarządzanie serwerem.');
      if (sub === 'kreator') {
        const channel = interaction.options.getChannel('kanal', true);
        return interaction.showModal(embedModal(`strefa:embed:compose:${channel.id}:new`, null));
      }
      const messages = featureStore.snapshot().embeds.messages.filter(item => item.guildId === interaction.guildId && item.active !== false);
      if (sub === 'kopiuj') {
        const id=interaction.options.getString('wiadomosc',true), channel=interaction.options.getChannel('kanal',true), source=messages.find(item=>item.messageId===id);
        if(!source) return respond(interaction,'Nie znaleziono zapisanego embeda o tym ID.');
        const draft={...structuredClone(source),id:shortId(),messageId:undefined,editMessageId:null,originalCreatedAt:null,channelId:channel.id,channelName:channel.name,authorId:interaction.user.id,createdBy:interaction.user.id,createdByName:interaction.user.username,createdAt:new Date().toISOString(),versions:[]};delete draft.messageId;
        await featureStore.update(state=>{state.embeds.drafts=[...state.embeds.drafts.filter(item=>item.authorId!==interaction.user.id),draft].slice(-100);});
        const preview=draft.embeds?.length?draft.embeds.map(item=>EmbedBuilder.from(resolveEmbedVariables(item,interaction.guild,client))):[embedFrom(resolveEmbedVariables(draft,interaction.guild,client))];
        const controls=embedDraftControls(draft.id,'Opublikuj kopię');
        return respond(interaction,`Podgląd kopii w <#${channel.id}>.`,{content:draft.content||undefined,embeds:preview.slice(0,10),components:[controls],allowedMentions:{parse:[]}});
      }
      if (sub === 'pole') {
        const id=interaction.options.getString('wiadomosc',true), saved=messages.find(item=>item.messageId===id);
        if(!saved) return respond(interaction,'Nie znaleziono zapisanego embeda o tym ID.');
        const channel=await interaction.guild.channels.fetch(saved.channelId).catch(()=>null), message=channel?.isTextBased()?await channel.messages.fetch(id).catch(()=>null):null;
        if(!message||message.author.id!==client.user.id) return respond(interaction,'Oryginalna wiadomość bota nie jest dostępna.');
        const before={...saved,savedAt:new Date().toISOString(),savedBy:interaction.user.id};
        const list=saved.embeds?.length?saved.embeds.map(item=>EmbedBuilder.from(item)):[embedFrom(saved)];
        try { list[0].addFields({name:interaction.options.getString('nazwa',true),value:interaction.options.getString('wartosc',true),inline:interaction.options.getBoolean('inline')??false}); }
        catch(error) { return respond(interaction,`Nie można dodać pola: ${String(error.message).slice(0,250)}`); }
        const updated={...saved,embeds:list.map(item=>item.toJSON()),versions:[...(saved.versions??[]),before].slice(-20),updatedAt:new Date().toISOString()};
        await message.edit({embeds:list,components:embedComponents(updated),allowedMentions:{parse:[]}});
        await featureStore.update(state=>{const current=state.embeds.messages.find(item=>item.guildId===interaction.guildId&&item.messageId===id);if(current)Object.assign(current,updated);});
        await writeLog(interaction.guild,'🧩 Dodano pole do embeda',`${id} · <@${interaction.user.id}>`);
        return respond(interaction,`Dodano pole do embeda ${id}.`);
      }
      if (sub === 'akcja') {
        const id=interaction.options.getString('wiadomosc',true), saved=messages.find(item=>item.messageId===id);
        if(!saved) return respond(interaction,'Nie znaleziono zapisanego embeda o tym ID.');
        const type=interaction.options.getString('typ',true), label=interaction.options.getString('etykieta',true), role=interaction.options.getRole('rola'), channelOption=interaction.options.getChannel('kanal'), question=interaction.options.getString('pytanie')?.trim();
        if(['rola-dodaj','rola-odbierz'].includes(type)&&(!role||role.managed||!role.editable)) return respond(interaction,'Wybierz zarządzalną rolę poniżej najwyższej roli bota.');
        if(type==='formularz'&&(!channelOption||!question)) return respond(interaction,'Dla formularza ustaw kanał odpowiedzi oraz pytanie.');
        if(type==='ticket'&&!saved.ticketPanel){
          const settings=featureStore.snapshot().tickets.guildSettings?.[interaction.guildId]??{};
          await featureStore.update(state=>{if(!state.tickets.panels.some(panel=>panel.guildId===interaction.guildId&&panel.messageId===saved.messageId))state.tickets.panels.push({guildId:interaction.guildId,messageId:saved.messageId,channelId:saved.channelId,title:saved.title,description:saved.description,categoryId:settings.categoryId??null,supportRoleId:settings.supportRoleId??null,buttonLabel:label,active:true,createdAt:new Date().toISOString(),embedPanel:true});});
        }
        const action={id:shortId(),type,label,...(role?{roleId:role.id}:{}),...(channelOption?{channelId:channelOption.id}:{}),...(question?{question}:{}),createdBy:interaction.user.id,createdAt:new Date().toISOString(),active:true};
        const updated={...saved,actions:[...(saved.actions??[]),action].slice(-20),updatedAt:new Date().toISOString()};
        const channel=await interaction.guild.channels.fetch(saved.channelId).catch(()=>null), message=channel?.isTextBased()?await channel.messages.fetch(id).catch(()=>null):null;
        if(!message||message.author.id!==client.user.id) return respond(interaction,'Oryginalna wiadomość bota nie jest dostępna.');
        await featureStore.update(state=>{const current=state.embeds.messages.find(item=>item.guildId===interaction.guildId&&item.messageId===id);if(current)Object.assign(current,updated);});
        await message.edit({components:embedComponents(updated),allowedMentions:{parse:[]}});
        await writeLog(interaction.guild,'🔘 Dodano akcję embeda',`${id} · ${type} · <@${interaction.user.id}>`);
        return respond(interaction,`Dodano przycisk **${label}** do wiadomości embeda.`);
      }
      if (sub === 'menu-role') {
        const id=interaction.options.getString('wiadomosc',true), saved=messages.find(item=>item.messageId===id);
        if(!saved) return respond(interaction,'Nie znaleziono zapisanego embeda o tym ID.');
        const ids=[...new Set(interaction.options.getString('role_ids',true).split(',').map(value=>value.trim()).filter(value=>/^\d{17,20}$/.test(value)))].slice(0,25);
        if(!ids.length) return respond(interaction,'Podaj przecinkami ID co najmniej jednej roli.');
        const guildRoles=await interaction.guild.roles.fetch();
        const roles=ids.map(roleId=>guildRoles.get(roleId)).filter(role=>role&&!role.managed&&role.editable&&role.id!==interaction.guildId);
        if(!roles.length) return respond(interaction,'Żadna z podanych ról nie jest dostępna do nadawania przez bota.');
        const updated={...saved,roleOptions:roles.map(role=>({id:role.id,name:role.name})),maxRoleSelections:interaction.options.getInteger('maksimum')??1,updatedAt:new Date().toISOString()};
        const channel=await interaction.guild.channels.fetch(saved.channelId).catch(()=>null), message=channel?.isTextBased()?await channel.messages.fetch(id).catch(()=>null):null;
        if(!message||message.author.id!==client.user.id) return respond(interaction,'Oryginalna wiadomość bota nie jest dostępna.');
        await featureStore.update(state=>{const current=state.embeds.messages.find(item=>item.guildId===interaction.guildId&&item.messageId===id);if(current)Object.assign(current,updated);});
        await message.edit({components:embedComponents(updated),allowedMentions:{parse:[]}});
        await writeLog(interaction.guild,'📋 Skonfigurowano menu ról embeda',`${id} · ${roles.length} ról · <@${interaction.user.id}>`);
        return respond(interaction,`Menu wyboru ról dodane. Użytkownicy mogą wybierać do ${updated.maxRoleSelections} ról z listy.`);
      }
      if (sub === 'lista') return respond(interaction, messages.length ? messages.slice(-20).reverse().map(item => `• **${item.title}** · <#${item.channelId}> · ID ${item.messageId}`).join('\n') : 'Nie zapisano jeszcze embedów.');
      if (sub === 'import') {
        const channel = interaction.options.getChannel('kanal', true);
        let parsed;
        try { parsed = JSON.parse(interaction.options.getString('json', true)); }
        catch { return respond(interaction, 'Podany tekst nie jest poprawnym JSON-em.'); }
        const rawEmbeds = Array.isArray(parsed) ? parsed : Array.isArray(parsed.embeds) ? parsed.embeds : [parsed];
        if (!rawEmbeds.length || rawEmbeds.length > 10) return respond(interaction, 'Import może zawierać od 1 do 10 embedów.');
        let validated;
        try { validated = rawEmbeds.map(raw => EmbedBuilder.from(raw).toJSON()); }
        catch (error) { return respond(interaction, `Embed nie spełnia limitów Discorda: ${String(error.message).slice(0,250)}`); }
        const urls = validated.flatMap(item=>[item.url,item.thumbnail?.url,item.image?.url,item.author?.url,item.author?.icon_url,item.footer?.icon_url]).filter(Boolean);
        if (urls.some(url=>{try{return new URL(url).protocol!=='https:';}catch{return true;}})) return respond(interaction,'Wszystkie adresy w embedach muszą używać HTTPS.');
        const data = { ...(Array.isArray(parsed) ? {} : parsed), embeds:validated, content:!Array.isArray(parsed) && typeof parsed.content==='string' ? parsed.content.slice(0,2000) : '', title:validated[0].title || 'Importowany embed', color:`#${(validated[0].color ?? purple).toString(16).padStart(6,'0')}`, guildId:interaction.guildId, channelId:channel.id, channelName:channel.name, authorId:interaction.user.id, createdBy:interaction.user.id, createdByName:interaction.user.username, createdAt:new Date().toISOString() };
        const draft={...data,id:shortId()};
        await featureStore.update(state=>{state.embeds.drafts=[...state.embeds.drafts.filter(item=>item.authorId!==interaction.user.id),draft].slice(-100);});
        const controls=embedDraftControls(draft.id);
        return respond(interaction,`Podgląd importu (${validated.length} embedów) dla <#${channel.id}>.`,{content:draft.content || undefined,embeds:validated.map(item=>EmbedBuilder.from(resolveEmbedVariables(item,interaction.guild,client))).slice(0,10),components:[controls],allowedMentions:{parse:[]}});
      }
      if (sub === 'eksport') {
        const id=interaction.options.getString('wiadomosc',true);
        const saved=messages.find(item=>item.messageId===id);
        if(!saved) return respond(interaction,'Nie znaleziono zapisanego embeda o tym ID.');
        const json=JSON.stringify({content:saved.content??'',embeds:saved.embeds?.length?saved.embeds:[embedFrom(saved).toJSON()]},null,2);
        return respond(interaction,'Plik JSON embeda:',{files:[new AttachmentBuilder(Buffer.from(json,'utf8'),{name:`embed-${id}.json`})]});
      }
      if (sub === 'cofnij') {
        const id=interaction.options.getString('wiadomosc',true), version=interaction.options.getInteger('wersja',true);
        const saved=messages.find(item=>item.messageId===id);
        if(!saved) return respond(interaction,'Nie znaleziono zapisanego embeda o tym ID.');
        const history=saved.versions??[];
        if(version>history.length) return respond(interaction,`Nie ma wersji ${version}. Dostępnych wersji: ${history.length}.`);
        const previous=history[version-1];
        const channel=await interaction.guild.channels.fetch(saved.channelId).catch(()=>null);
        const message=channel?.isTextBased()?await channel.messages.fetch(id).catch(()=>null):null;
        if(!message||message.author.id!==client.user.id) return respond(interaction,'Oryginalna wiadomość bota nie jest dostępna.');
        const rawEmbeds=previous.embeds?.length?previous.embeds:[embedFrom(previous).toJSON()];
        await message.edit({content:previous.content??null,embeds:rawEmbeds.map(item=>EmbedBuilder.from(item)),allowedMentions:{parse:[]}});
        await featureStore.update(state=>{const current=state.embeds.messages.find(item=>item.guildId===interaction.guildId&&item.messageId===id);if(current){current.versions=[...(current.versions??[]),{...current,restoredAt:new Date().toISOString(),restoredBy:interaction.user.id}].slice(-20);Object.assign(current,previous,{messageId:id,guildId:interaction.guildId,channelId:saved.channelId,versions:current.versions});}});
        await writeLog(interaction.guild,'↩️ Przywrócono embed',`Wiadomość ${id} · wersja ${version} · <@${interaction.user.id}>`);
        return respond(interaction,`Przywrócono wersję **${version}** wiadomości ${id}.`);
      }
      if (sub === 'zaplanuj') {
        const channel=interaction.options.getChannel('kanal',true), rawDate=interaction.options.getString('data',true).trim(), due=Date.parse(rawDate);
        if(!/(Z|[+-]\d{2}:?\d{2})$/i.test(rawDate)||!Number.isFinite(due)||due<Date.now()+60_000||due>Date.now()+365*24*60*60_000) return respond(interaction,'Podaj przyszłą datę ISO z określoną strefą, do roku naprzód.');
        const job={id:shortId(),guildId:interaction.guildId,channelId:channel.id,channelName:channel.name,dueAt:new Date(due).toISOString(),status:'pending',recurrence:interaction.options.getString('powtarzaj'),createdBy:interaction.user.id,createdByName:interaction.user.username,createdAt:new Date().toISOString(),data:{title:interaction.options.getString('tytul',true),description:interaction.options.getString('opis',true),color:'#8B5CF6',createdBy:interaction.user.id,createdByName:interaction.user.username,channelName:channel.name}};
        await featureStore.update(state=>{state.embeds.scheduled.push(job);});
        await writeLog(interaction.guild,'🗓️ Zaplanowano embed',`${job.id} · <#${channel.id}> · ${job.dueAt}`);
        return respond(interaction,`Zaplanowano publikację **${job.id}** na <t:${Math.floor(due/1000)}:F>.`);
      }
      if (sub === 'harmonogram') {
        const cancel=interaction.options.getString('anuluj')?.trim();
        const retry=interaction.options.getString('ponow')?.trim();
        if(retry){let found=false;await featureStore.update(state=>{const job=state.embeds.scheduled.find(item=>item.guildId===interaction.guildId&&item.id===retry);if(job?.status==='failed'){job.status='pending';job.dueAt=new Date().toISOString();job.lastError=null;job.failedAt=null;found=true;}});return respond(interaction,found?`Ponowiono zadanie **${retry}**. Sprawdź kanał i logi publikacji.`:'Nie znaleziono nieudanego zadania o tym ID.');}
        if(cancel){let found=false;await featureStore.update(state=>{const job=state.embeds.scheduled.find(item=>item.guildId===interaction.guildId&&item.id===cancel);if(job&&['pending','failed'].includes(job.status)){job.status='cancelled';job.cancelledAt=new Date().toISOString();found=true;}});return respond(interaction,found?`Anulowano zadanie **${cancel}**.`:'Nie znaleziono oczekującego zadania o tym ID.');}
        const jobs=featureStore.snapshot().embeds.scheduled.filter(item=>item.guildId===interaction.guildId&&['pending','processing','failed'].includes(item.status)).sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt)).slice(0,20);
        return respond(interaction,jobs.length?jobs.map(item=>`• **${item.id}** · ${item.status} · <#${item.channelId}> · <t:${Math.floor(Date.parse(item.dueAt)/1000)}:F>${item.lastError?` · ${item.lastError}`:''}`).join('\n'):'Brak zaplanowanych publikacji.');
      }
      if (sub === 'szablon' || sub === 'szablony') {
        const templates=featureStore.snapshot().embeds.templates.filter(item=>item.guildId===interaction.guildId&&item.active!==false);
        if(sub==='szablony'||interaction.options.getString('akcja')==='lista') return respond(interaction,templates.length?templates.slice(0,25).map(item=>`• **${item.name}** (${item.id})`).join('\n'):'Nie ma zapisanych szablonów.');
        const action=interaction.options.getString('akcja',true), name=interaction.options.getString('nazwa')?.trim();
        if(action==='zapisz'){
          const id=interaction.options.getString('wiadomosc'); const source=messages.find(item=>item.messageId===id);
          if(!source||!name)return respond(interaction,'Podaj nazwę i ID zapisanego embeda do utworzenia szablonu.');
          const template={id:shortId(),guildId:interaction.guildId,name,data:{...source,messageId:undefined,id:undefined,versions:[]},createdBy:interaction.user.id,createdAt:new Date().toISOString(),active:true};delete template.data.id;delete template.data.messageId;
          await featureStore.update(state=>{state.embeds.templates.push(template);});
          await writeLog(interaction.guild,'📑 Zapisano szablon embeda',`${name} · <@${interaction.user.id}>`);
          return respond(interaction,`Zapisano szablon **${name}**.`);
        }
        if(action==='usun'){
          const template=templates.find(item=>item.name.toLowerCase()===name?.toLowerCase());if(!template)return respond(interaction,'Nie znaleziono szablonu o tej nazwie.');
          await featureStore.update(state=>{const current=state.embeds.templates.find(item=>item.guildId===interaction.guildId&&item.id===template.id);if(current){current.active=false;current.deletedAt=new Date().toISOString();}});
          return respond(interaction,`Usunięto szablon **${template.name}**. Historia została zachowana.`);
        }
        if(action==='uzyj'){
          const template=templates.find(item=>item.name.toLowerCase()===name?.toLowerCase()), channel=interaction.options.getChannel('kanal');
          if(!template||!channel)return respond(interaction,'Podaj istniejącą nazwę szablonu oraz kanał publikacji.');
          const draft={...template.data,id:shortId(),guildId:interaction.guildId,channelId:channel.id,channelName:channel.name,authorId:interaction.user.id,createdBy:interaction.user.id,createdByName:interaction.user.username,createdAt:new Date().toISOString(),templateId:template.id};
          await featureStore.update(state=>{state.embeds.drafts=[...state.embeds.drafts.filter(item=>item.authorId!==interaction.user.id),draft].slice(-100);});
          const embedList=draft.embeds?.length?draft.embeds.map(item=>EmbedBuilder.from(resolveEmbedVariables(item,interaction.guild,client))):[embedFrom(resolveEmbedVariables(draft,interaction.guild,client))];
          const controls=embedDraftControls(draft.id);
          return respond(interaction,`Podgląd szablonu **${template.name}** w <#${channel.id}>.`,{content:draft.content||undefined,embeds:embedList.slice(0,10),components:[controls],allowedMentions:{parse:[]}});
        }
      }
      if (sub === 'edytuj') {
        const id = interaction.options.getString('wiadomosc', true);
        const saved = messages.find(item => item.messageId === id);
        if (!saved) return respond(interaction, 'Nie znaleziono zapisanego embeda o tym ID.');
        return interaction.showModal(embedModal(`strefa:embed:compose:${saved.channelId}:${id}`, saved));
      }
      if (sub === 'usun') {
        const id = interaction.options.getString('wiadomosc', true);
        const entry = messages.find(item => item.messageId === id);
        if (!entry) return respond(interaction, 'Nie znaleziono zapisanego embeda o tym ID.');
        const channel = await interaction.guild.channels.fetch(entry.channelId).catch(() => null);
        const message = channel?.isTextBased() ? await channel.messages.fetch(id).catch(() => null) : null;
        if (message) await message.delete();
        await featureStore.update(state => { const current=state.embeds.messages.find(item=>item.guildId===interaction.guildId&&item.messageId===id);if(current){current.active=false;current.deletedAt=new Date().toISOString();current.deletedBy=interaction.user.id;} });
        await writeLog(interaction.guild, '🗑️ Usunięto embed', `Wiadomość ${id} · wykonał <@${interaction.user.id}>`);
        return respond(interaction, 'Embed usunięty i usunięty z zapisanej listy.');
      }
    }
    return respond(interaction, 'Nieznana operacja.');
  }

  async function claim(interaction, ticket) {
    if (!canHandleTicket(interaction, ticket)) return respond(interaction, 'Tylko obsługa ticketów może go przejąć.');
    if (ticket.status !== 'open') return respond(interaction, 'Ticket jest zamknięty.');
    const result = await featureStore.update(state => {
      const current = state.tickets.items.find(item => item.id === ticket.id);
      if (!current || current.claimedBy) return false;
      current.claimedBy = interaction.user.id;
      current.claimedName = interaction.user.tag;
      current.claimedAt = new Date().toISOString();
      current.firstResponseAt ??= current.claimedAt;
      current.events ??= [];
      current.events.push({ type: 'claimed', by: interaction.user.id, at: current.claimedAt });
      return true;
    });
    if (!result) return respond(interaction, 'Ten ticket został już przejęty przez inną osobę.');
    const updated = ticketFor(interaction.channelId);
    await interaction.message.edit({ components: ticketControls(updated) });
    await interaction.channel.send(`🙋 <@${interaction.user.id}> przejął(a) ten ticket.`);
    await writeLog(interaction.guild, '🙋 Przejęto ticket', `${ticket.id} · <@${interaction.user.id}>`);
    return respond(interaction, 'Ticket został przypisany do Ciebie.');
  }

  async function reopen(interaction, ticket) {
    if (!canHandleTicket(interaction, ticket)) return respond(interaction, 'Tylko obsługa ticketów może go otworzyć ponownie.');
    if (ticket.status !== 'closed') return respond(interaction, 'Ticket nie jest zamknięty.');
    const channel = interaction.channel;
    await channel.permissionOverwrites.edit(ticket.ownerId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true }, { reason: `Ponowne otwarcie ticketu przez ${interaction.user.tag}` });
    if (channel.name.startsWith('zamkniety-')) await channel.setName(channel.name.slice('zamkniety-'.length));
    const updated = { ...ticket, status: 'open', reopenedAt: new Date().toISOString(), reopenedBy: interaction.user.id };
    await featureStore.update(state => { state.tickets.items = state.tickets.items.map(item => item.id === ticket.id ? updated : item); });
    await interaction.message.edit({ components: ticketControls(updated) });
    await writeLog(interaction.guild, '🔓 Otworzono ticket ponownie', `${ticket.id} · <@${interaction.user.id}>`);
    return respond(interaction, 'Ticket otwarty ponownie.');
  }

  async function sendTranscript(interaction, ticket) {
    if (interaction.user.id !== ticket.ownerId && !manager(interaction)) return respond(interaction, 'Nie masz dostępu do transkryptu tego ticketu.');
    const html = ticket.transcriptHtml || await transcript(ticket, interaction.channel);
    const file = new AttachmentBuilder(Buffer.from(html, 'utf8'), { name: `ticket-${ticket.id}.html` });
    return respond(interaction, 'Transkrypt ticketu:', { files: [file] });
  }

  async function button(interaction) {
    if (interaction.isStringSelectMenu?.() && interaction.customId.startsWith('strefa:embed:roles:')) {
      const messageId=interaction.customId.slice('strefa:embed:roles:'.length);
      const saved=featureStore.snapshot().embeds.messages.find(item=>item.guildId===interaction.guildId&&item.messageId===messageId&&item.active!==false);
      if(!saved) return respond(interaction,'To menu ról nie jest już aktywne.');
      const allowed=new Set((saved.roleOptions??[]).map(role=>role.id));
      if(interaction.values.some(id=>!allowed.has(id))) return respond(interaction,'Menu zawiera rolę spoza dozwolonej listy.');
      const member=await interaction.guild.members.fetch(interaction.user.id).catch(()=>null), bot=interaction.guild.members.me??await interaction.guild.members.fetchMe();
      if(!member||!bot.permissions.has(PermissionFlagsBits.ManageRoles)) return respond(interaction,'Botowi brakuje uprawnienia Zarządzanie rolami.');
      const results=[];
      for(const roleId of interaction.values){
        const role=await interaction.guild.roles.fetch(roleId).catch(()=>null);
        if(!role||role.managed||!role.editable||role.id===interaction.guildId) {results.push(`${role?.name??roleId}: niedostępna`);continue;}
        const has=member.roles.cache.has(role.id);
        try{if(has){await member.roles.remove(role,'Menu samoobsługowych ról');results.push(`${role.name}: odebrano`);}else{await member.roles.add(role,'Menu samoobsługowych ról');results.push(`${role.name}: nadano`);}}
        catch(error){results.push(`${role.name}: błąd uprawnień`);console.warn('Nie udało się zmienić roli z menu:',error.message);}
      }
      return respond(interaction,results.join('\n')||'Nie zmieniono żadnych ról.');
    }
    if (interaction.isButton?.() && interaction.customId.startsWith('strefa:embed:action:')) {
      const match=/^strefa:embed:action:(\d{17,20}):([A-Z0-9]+)$/.exec(interaction.customId);
      if(!match)return respond(interaction,'Przycisk ma nieprawidłową konfigurację.');
      const [,messageId,actionId]=match;
      const saved=featureStore.snapshot().embeds.messages.find(item=>item.guildId===interaction.guildId&&item.messageId===messageId&&item.active!==false);
      const action=saved?.actions?.find(item=>item.id===actionId&&item.active!==false);
      if(!action)return respond(interaction,'Ta akcja nie jest już dostępna.');
      if(action.type==='formularz'){
        const modal=new ModalBuilder().setCustomId(`strefa:embed:form:${messageId}:${actionId}`).setTitle('Formularz');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('answer').setLabel(String(action.question||'Wpisz odpowiedź').slice(0,45)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000)));
        return interaction.showModal(modal);
      }
      const key=`${interaction.user.id}:${action.id}`;
      if((actionCooldowns.get(key)??0)>Date.now())return respond(interaction,'Odczekaj chwilę przed ponownym użyciem tego przycisku.');
      actionCooldowns.set(key,Date.now()+15_000);
      const member=await interaction.guild.members.fetch(interaction.user.id).catch(()=>null), bot=interaction.guild.members.me??await interaction.guild.members.fetchMe();
      const role=action.roleId?await interaction.guild.roles.fetch(action.roleId).catch(()=>null):null;
      if(!member||!role||role.managed||!role.editable||role.id===interaction.guildId||!bot.permissions.has(PermissionFlagsBits.ManageRoles))return respond(interaction,'Rola nie jest dostępna do zarządzania przez bota.');
      try{
        if(action.type==='rola-dodaj'){
          if(member.roles.cache.has(role.id))return respond(interaction,`Masz już rolę **${role.name}**.`);
          await member.roles.add(role,`Samodzielny przycisk roli z embeda ${messageId}`);
          return respond(interaction,`Nadano Ci rolę **${role.name}**.`);
        }
        if(action.type==='rola-odbierz'){
          if(!member.roles.cache.has(role.id))return respond(interaction,`Nie masz roli **${role.name}**.`);
          await member.roles.remove(role,`Samodzielny przycisk roli z embeda ${messageId}`);
          return respond(interaction,`Odebrano Ci rolę **${role.name}**.`);
        }
      }catch(error){console.error('Nie udało się wykonać bezpiecznej akcji roli:',error.message);return respond(interaction,'Discord nie pozwolił zmienić tej roli. Sprawdź pozycję roli bota.');}
      return respond(interaction,'Nieznana akcja przycisku.');
    }
    if (interaction.customId.startsWith('strefa:embed:draft:')) {
      const match = /^strefa:embed:draft:([A-Z0-9]+):(publish|cancel|advanced|appearance)$/.exec(interaction.customId);
      if (!match) return respond(interaction, 'Ten przycisk kreatora jest nieprawidłowy.');
      const [, draftId, action] = match;
      const draft = featureStore.snapshot().embeds.drafts.find(item => item.id === draftId && item.guildId === interaction.guildId);
      if (!draft) return interaction.update({ content: 'Podgląd wygasł albo został już opublikowany.', embeds: [], components: [] });
      if (draft.authorId !== interaction.user.id || !manager(interaction)) return respond(interaction, 'Tylko osoba, która utworzyła podgląd i nadal zarządza serwerem, może go opublikować.');
      if (Date.now() - Date.parse(draft.updatedAt || draft.createdAt) > 60 * 60 * 1000) {
        await featureStore.update(state => { state.embeds.drafts = state.embeds.drafts.filter(item => item.id !== draftId); });
        return interaction.update({ content: 'Podgląd wygasł po godzinie. Otwórz kreator ponownie.', embeds: [], components: [] });
      }
      if(action==='advanced')return interaction.showModal(embedAdvancedModal(draft));
      if(action==='appearance')return interaction.showModal(embedAppearanceModal(draft));
      const channel = await interaction.guild.channels.fetch(draft.channelId).catch(() => null);
      if (!channel?.isTextBased()) return respond(interaction, 'Kanał publikacji nie jest już dostępny.');
      if (action === 'cancel') {
        await featureStore.update(state => { state.embeds.drafts = state.embeds.drafts.filter(item => item.id !== draftId); });
        return interaction.update({ content: 'Anulowano. Embed nie został opublikowany.', embeds: [], components: [] });
      }
      const prepared = resolveEmbedVariables(draft, interaction.guild, client);
      const embedList = prepared.embeds?.length ? prepared.embeds.map(item => EmbedBuilder.from(item)).slice(0, 10) : [embedFrom(prepared)];
      const content = prepared.content ? String(prepared.content).slice(0, 2000) : null;
      let message;
      if (draft.editMessageId) {
        message = await channel.messages.fetch(draft.editMessageId).catch(() => null);
        if (!message || !message.author?.bot) return respond(interaction, 'Oryginalna wiadomość bota nie jest już dostępna.');
        await message.edit({ content, embeds: embedList, allowedMentions: { parse: [] } });
      } else {
        message = await channel.send({ content, embeds: embedList, allowedMentions: { parse: [] } });
      }
      const saved = { ...draft, ...prepared, title: embedList[0]?.data?.title || draft.title, content, embeds: embedList.map(item => item.toJSON()), id: undefined, editMessageId: undefined, authorId: draft.authorId, messageId: message.id, createdAt: draft.editMessageId ? (draft.originalCreatedAt || draft.createdAt) : draft.createdAt, updatedAt: new Date().toISOString(), versions: [...(draft.versions || [])], active: true };
      delete saved.id;
      delete saved.editMessageId;
      delete saved.originalCreatedAt;
      await message.edit({ components: embedComponents(saved) });
      await featureStore.update(state => {
        state.embeds.drafts = state.embeds.drafts.filter(item => item.id !== draftId);
        if (draft.editMessageId) {
          const index = state.embeds.messages.findIndex(item => item.messageId === draft.editMessageId && item.guildId === interaction.guildId);
          if (index >= 0) {
            const previous = state.embeds.messages[index];
            const history = [...(previous.versions || []), { title: previous.title, description: previous.description, color: previous.color, footer: previous.footer, image: previous.image, content: previous.content, embeds: previous.embeds, savedAt: new Date().toISOString(), savedBy: interaction.user.id }].slice(-20);
            state.embeds.messages[index] = { ...saved, messageId: draft.editMessageId, versions: history };
          }
        } else {
          state.embeds.messages.push(saved);
          state.embeds.messages = state.embeds.messages.slice(-500);
        }
      });
      await writeLog(interaction.guild, draft.editMessageId ? '✏️ Edytowano embed' : '🖼️ Opublikowano embed', `Kanał <#${channel.id}> · wiadomość ${message.id} · <@${interaction.user.id}>`);
      return interaction.update({ content: draft.editMessageId ? `Zaktualizowano embed w <#${channel.id}>. ID wiadomości: ${message.id}.` : `Embed opublikowany w <#${channel.id}>. ID wiadomości: ${message.id}.`, embeds: [], components: [] });
    }
    const id = interaction.customId.slice(TICKET_BUTTON.length);
    if (interaction.isStringSelectMenu?.() && id.startsWith('category:')) {
      const panelId = id.slice('category:'.length);
      const panel = featureStore.snapshot().tickets.panels.find(item => item.messageId === panelId && item.guildId === interaction.guildId && item.active !== false);
      if (!panel) return respond(interaction, 'Ten panel zgłoszeń nie jest już aktywny.');
      const category = featureStore.snapshot().tickets.guildSettings?.[interaction.guildId]?.categories?.find(item => item.id === interaction.values[0] && item.active !== false);
      if (!category) return respond(interaction, 'Ta kategoria została usunięta. Odśwież panel i spróbuj ponownie.');
      if ((featureStore.snapshot().tickets.blacklist ?? []).some(item => item.guildId === interaction.guildId && item.userId === interaction.user.id)) return respond(interaction, 'Nie możesz otworzyć ticketu na tym serwerze. Skontaktuj się z administracją.');
      const activeCount = featureStore.snapshot().tickets.items.filter(item => item.guildId === interaction.guildId && item.ownerId === interaction.user.id && item.status === 'open').length;
      const limit = Math.max(1, Math.min(10, Number(featureStore.snapshot().tickets.guildSettings?.[interaction.guildId]?.maxOpenPerUser ?? featureStore.snapshot().tickets.maxOpenPerUser) || 1));
      if (activeCount >= limit) return respond(interaction, `Masz już ${activeCount} otwartych ticketów (limit: ${limit}).`);
      return interaction.showModal(ticketFormModal(panel, category));
    }
    if (id === 'open') {
      const panels = featureStore.snapshot().tickets.panels;
      const panel = panels.find(item => item.active !== false && item.messageId === interaction.message.id && (!item.guildId || item.guildId === interaction.guildId));
      const state = featureStore.snapshot().tickets;
      if (!panel) return respond(interaction, 'Ten panel nie jest już skonfigurowany. Poproś administrację o opublikowanie go ponownie.');
      if ((state.blacklist ?? []).some(item => item.guildId === interaction.guildId && item.userId === interaction.user.id)) return respond(interaction, 'Nie możesz otworzyć ticketu na tym serwerze. Skontaktuj się z administracją.');
        const openTickets = state.items.filter(item => item.guildId === interaction.guildId && item.ownerId === interaction.user.id && item.status === 'open');
        const limit = Math.max(1, Math.min(10, Number(state.guildSettings?.[interaction.guildId]?.maxOpenPerUser ?? state.maxOpenPerUser) || 1));
        if (openTickets.length >= limit) return respond(interaction, `Masz już ${openTickets.length} otwartych ticketów (limit: ${limit}): ${openTickets.slice(0, 5).map(item => `<#${item.channelId}>`).join(', ')}.`);
      return interaction.showModal(ticketFormModal(panel));
    }
    if (id.startsWith('submit:')) return this.modal(interaction);
    const match = /^([A-Z0-9]+):(claim|close|reopen|transcript|delete-confirm|delete-cancel)$/.exec(id);
    if (!match) return false;
    const [, ticketId, action] = match;
    const ticket = featureStore.snapshot().tickets.items.find(item => item.id === ticketId && item.guildId === interaction.guildId && item.channelId === interaction.channelId);
    if (!ticket) return respond(interaction, 'Nie znaleziono ticketu dla tego kanału.');
    if (action === 'claim') return claim(interaction, ticket);
    if (action === 'close') {
      if (interaction.user.id !== ticket.ownerId && !canHandleTicket(interaction, ticket)) return respond(interaction, 'Tylko autor ticketu lub obsługa może go zamknąć.');
      const modal = new ModalBuilder().setCustomId(`${TICKET_BUTTON}close:${ticket.id}`).setTitle('Zamknięcie ticketu');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Powód zamknięcia').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)));
      return interaction.showModal(modal);
    }
    if (action === 'reopen') return reopen(interaction, ticket);
    if (action === 'transcript') return sendTranscript(interaction, ticket);
    if (action === 'delete-cancel') {
      if (!manager(interaction)) return respond(interaction, 'Tylko obsługa może anulować usunięcie.');
      await featureStore.update(state => { const current = state.tickets.items.find(item => item.id === ticket.id); if (current) delete current.deleteRequest; });
      return interaction.update({ content: 'Usunięcie anulowano. Kanał ticketu został zachowany.', components: [] });
    }
    if (action === 'delete-confirm') {
      const request = ticket.deleteRequest;
      if (!manager(interaction) || request?.requestedBy !== interaction.user.id || Date.now() - Date.parse(request.at) > 2 * 60 * 1000) return respond(interaction, 'Potwierdzenie wygasło albo nie zostało wywołane przez Ciebie. Uruchom komendę ponownie.');
      await featureStore.update(state => { const current = state.tickets.items.find(item => item.id === ticket.id); if (current) { current.status = 'deleting'; current.deletedAt = new Date().toISOString(); } });
      await interaction.update({ content: `Usuwam kanał ticketu ${ticket.id}…`, components: [] });
      try {
        await interaction.channel.delete(`Ticket ${ticket.id} usunął ${interaction.user.tag}`);
        await featureStore.update(state => { const current = state.tickets.items.find(item => item.id === ticket.id); if (current) { current.status = 'deleted'; delete current.deleteRequest; } });
        await writeLog(interaction.guild, '🗑️ Usunięto ticket', `${ticket.id} · <@${interaction.user.id}>`);
      } catch (error) {
        await featureStore.update(state => { const current = state.tickets.items.find(item => item.id === ticket.id); if (current) current.status = ticket.status; });
        console.error(`Nie udało się usunąć kanału ticketu ${ticket.id}:`, error.message);
        await interaction.followUp({ content: 'Nie udało się usunąć kanału. Sprawdź uprawnienia Zarządzanie kanałami.', ...ephemeral }).catch(() => {});
      }
      return true;
    }
    return false;
  }

  async function modal(interaction) {
    if (interaction.customId.startsWith('strefa:embed:form:')) {
      const match=/^strefa:embed:form:(\d{17,20}):([A-Z0-9]+)$/.exec(interaction.customId);
      if(!match)return respond(interaction,'Ten formularz jest nieprawidłowy.');
      const [,messageId,actionId]=match;
      const saved=featureStore.snapshot().embeds.messages.find(item=>item.guildId===interaction.guildId&&item.messageId===messageId&&item.active!==false);
      const action=saved?.actions?.find(item=>item.id===actionId&&item.type==='formularz'&&item.active!==false);
      if(!action)return respond(interaction,'Ten formularz nie jest już aktywny.');
      const channel=await interaction.guild.channels.fetch(action.channelId).catch(()=>null);
      if(!channel?.isTextBased())return respond(interaction,'Kanał odpowiedzi formularza jest niedostępny.');
      const answer=interaction.fields.getTextInputValue('answer').trim();
      await channel.send({embeds:[new EmbedBuilder().setColor(purple).setTitle(`📝 Formularz: ${saved.title}`).addFields({name:'Użytkownik',value:`<@${interaction.user.id}>`,inline:true},{name:String(action.question||'Odpowiedź').slice(0,256),value:answer.slice(0,1024)}).setTimestamp()],allowedMentions:{users:[interaction.user.id]}});
      await writeLog(interaction.guild,'📝 Wysłano formularz z embeda',`${messageId} · <@${interaction.user.id}>`);
      return respond(interaction,'Dziękujemy. Twoja odpowiedź została przekazana do obsługi.');
    }
    if(interaction.customId.startsWith('strefa:embed:advanced:')){
      if(!manager(interaction))return respond(interaction,'Wymagane jest uprawnienie Zarządzanie serwerem.');
      const id=interaction.customId.slice('strefa:embed:advanced:'.length), draft=featureStore.snapshot().embeds.drafts.find(item=>item.id===id&&item.guildId===interaction.guildId&&item.authorId===interaction.user.id);
      if(!draft)return respond(interaction,'Podgląd wygasł. Uruchom kreator ponownie.');
      const get=key=>interaction.fields.getTextInputValue(key).trim();
      const values={author:get('author'),authorUrl:get('authorUrl'),authorIcon:get('authorIcon'),thumbnail:get('thumbnail'),url:get('url')};
      for(const [key,value] of Object.entries(values))if(value){try{if(new URL(value).protocol!=='https:')throw new Error();}catch{return respond(interaction,`Pole ${key} musi zawierać poprawny adres HTTPS.`);}}
      const updated={...draft,...values,updatedAt:new Date().toISOString()};
      await featureStore.update(state=>{const current=state.embeds.drafts.find(item=>item.id===id&&item.authorId===interaction.user.id);if(current)Object.assign(current,updated);});
      const embed=updated.embeds?.length?updated.embeds.map(item=>EmbedBuilder.from(resolveEmbedVariables(item,interaction.guild,client))):[embedFrom(resolveEmbedVariables(updated,interaction.guild,client))];
      return respond(interaction,`Podgląd embeda dla <#${updated.channelId}>.`,{content:updated.content||undefined,embeds:embed.slice(0,10),components:[embedDraftControls(id,updated.editMessageId?'Zapisz zmiany':'Opublikuj')],allowedMentions:{parse:[]}});
    }
    if(interaction.customId.startsWith('strefa:embed:appearance:')){
      if(!manager(interaction))return respond(interaction,'Wymagane jest uprawnienie Zarządzanie serwerem.');
      const id=interaction.customId.slice('strefa:embed:appearance:'.length), draft=featureStore.snapshot().embeds.drafts.find(item=>item.id===id&&item.guildId===interaction.guildId&&item.authorId===interaction.user.id);
      if(!draft)return respond(interaction,'Podgląd wygasł. Uruchom kreator ponownie.');
      const get=key=>interaction.fields.getTextInputValue(key).trim();
      const values={content:get('content'),footerIcon:get('footerIcon'),timestamp:get('timestamp')};
      if(values.footerIcon){try{if(new URL(values.footerIcon).protocol!=='https:')throw new Error();}catch{return respond(interaction,'Ikona stopki musi zawierać poprawny adres HTTPS.');}}
      if(values.timestamp && Number.isNaN(Date.parse(values.timestamp)))return respond(interaction,'Znacznik czasu musi być prawidłową datą ISO 8601.');
      const updated={...draft,...values,updatedAt:new Date().toISOString()};
      await featureStore.update(state=>{const current=state.embeds.drafts.find(item=>item.id===id&&item.authorId===interaction.user.id);if(current)Object.assign(current,updated);});
      const embed=updated.embeds?.length?updated.embeds.map(item=>EmbedBuilder.from(resolveEmbedVariables(item,interaction.guild,client))):[embedFrom(resolveEmbedVariables(updated,interaction.guild,client))];
      return respond(interaction,`Podgląd embeda dla <#${updated.channelId}>.`,{content:updated.content||undefined,embeds:embed.slice(0,10),components:[embedDraftControls(id,updated.editMessageId?'Zapisz zmiany':'Opublikuj')],allowedMentions:{parse:[]}});
    }
    if (interaction.customId.startsWith(`${TICKET_BUTTON}close:`)) {
      const id = interaction.customId.slice(`${TICKET_BUTTON}close:`.length);
      const ticket = featureStore.snapshot().tickets.items.find(item => item.id === id && item.channelId === interaction.channelId && item.guildId === interaction.guildId);
      if (!ticket) return respond(interaction, 'Ticket nie jest już dostępny.');
      if (interaction.user.id !== ticket.ownerId && !canHandleTicket(interaction, ticket)) return respond(interaction, 'Nie masz już dostępu do zamknięcia tego ticketu.');
      return finishClose(interaction, ticket, interaction.fields.getTextInputValue('reason').trim());
    }
    if (interaction.customId.startsWith(`${TICKET_BUTTON}submit:`)) {
      const [panelId, categoryId] = interaction.customId.slice(`${TICKET_BUTTON}submit:`.length).split(':');
      const panel = featureStore.snapshot().tickets.panels.find(item => item.messageId === panelId && (!item.guildId || item.guildId === interaction.guildId));
      if (!panel) return respond(interaction, 'Panel zgłoszeń nie jest już dostępny.');
      const key = `${interaction.guildId}:${interaction.user.id}`;
      if (opening.has(key)) return respond(interaction, 'Tworzenie Twojego ticketu już trwa.');
      opening.add(key);
      try {
        const snapshot = featureStore.snapshot();
        const openTickets = snapshot.tickets.items.filter(item => item.guildId === interaction.guildId && item.ownerId === interaction.user.id && item.status === 'open');
        const openLimit = Math.max(1, Math.min(10, Number(snapshot.tickets.guildSettings?.[interaction.guildId]?.maxOpenPerUser ?? snapshot.tickets.maxOpenPerUser) || 1));
        if (openTickets.length >= openLimit) return respond(interaction, `Osiągnięto limit ${openLimit} otwartych ticketów na osobę.`);
        const category = categoryId ? snapshot.tickets.guildSettings?.[interaction.guildId]?.categories?.find(item => item.id === categoryId && item.active !== false) : null;
        if (categoryId && !category) return respond(interaction, 'Ta kategoria została usunięta. Zacznij ponownie od panelu.');
        const questions = category?.questions?.length ? category.questions : [
          {id:'subject',label:'Temat zgłoszenia'}, {id:'details',label:'Opisz sprawę'}, {id:'expectation',label:'Jakiej pomocy oczekujesz?'}];
        const answers = questions.map((question,index) => ({ question: question.label, answer: interaction.fields.getTextInputValue(question.id || `q${index}`).trim() }));
        const subject = (answers[0]?.answer || 'Nowe zgłoszenie').slice(0,100);
        const details = answers.slice(1).map(answer => `**${answer.question}**\n${answer.answer || 'Nie podano'}`).join('\n\n').slice(0,4000) || 'Brak dodatkowych informacji.';
        const expectation = answers.at(-1)?.answer || '';
        const supportRoleId = category?.supportRoleId || panel.supportRoleId || snapshot.tickets.guildSettings?.[interaction.guildId]?.supportRoleId;
        const role = supportRoleId ? await interaction.guild.roles.fetch(supportRoleId).catch(() => null) : null;
        const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) return respond(interaction, 'Botowi brakuje uprawnienia Zarządzanie kanałami.');
        const number = snapshot.tickets.nextId ?? 1;
        const ticketId = String(number).padStart(6, '0');
        const overwrites = [
          { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles] },
        ];
        if (role) overwrites.push({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] });
        const channel = await interaction.guild.channels.create({ name: `ticket-${ticketId}`, type: ChannelType.GuildText, parent: category?.categoryId || panel.categoryId || snapshot.tickets.guildSettings?.[interaction.guildId]?.categoryId || undefined, permissionOverwrites: overwrites, reason: `Ticket ${ticketId} od ${interaction.user.tag}` });
        const now = new Date().toISOString();
        const ticket = { id: ticketId, guildId: interaction.guildId, channelId: channel.id, ownerId: interaction.user.id, ownerName: interaction.user.tag, subject, details, expectation, formAnswers: answers, categoryId: category?.id ?? null, categoryName: category?.name ?? null, status: 'open', supportRoleId: role?.id ?? null, panelMessageId: panelId, createdAt: now, lastActivityAt: now, events: [{ type: 'created', by: interaction.user.id, at: now }] };
        await featureStore.update(state => { state.tickets.items.push(ticket); state.tickets.nextId = Math.max(state.tickets.nextId ?? 1, number + 1); });
        const embed = new EmbedBuilder().setColor(purple).setTitle(`🎫 ${subject}`).setDescription(details.slice(0, 3500)).addFields({ name: 'Numer zgłoszenia', value: ticketId, inline: true }, { name: 'Autor', value: `<@${interaction.user.id}>`, inline: true }, { name: 'Kategoria', value: category?.name ?? 'Ogólna', inline: true }, { name: 'Oczekiwana pomoc', value: expectation || 'Nie podano' }).setTimestamp();
        await channel.send({ content: `<@${interaction.user.id}>${role ? ` <@&${role.id}>` : ''}`, embeds: [embed], components: ticketControls(ticket), allowedMentions: { users: [interaction.user.id], roles: role ? [role.id] : [] } });
        await writeLog(interaction.guild, '🎫 Utworzono ticket', `ID: ${ticketId}\nAutor: <@${interaction.user.id}>\nKanał: <#${channel.id}>\nTemat: ${subject}`);
        return respond(interaction, `Ticket **${ticketId}** utworzony: <#${channel.id}>.`);
      } finally { opening.delete(key); }
    }
    if (interaction.customId.startsWith('strefa:embed:compose:')) {
      if (!manager(interaction)) return respond(interaction, 'Wymagane jest uprawnienie Zarządzanie serwerem.');
      const match = /^strefa:embed:compose:(\d{17,20}):(new|\d{17,20})$/.exec(interaction.customId);
      if (!match) return respond(interaction, 'Sesja kreatora jest nieprawidłowa. Otwórz go ponownie.');
      const [, channelId, editId] = match;
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!channel?.isTextBased()) return respond(interaction, 'Wybrany kanał nie jest dostępny.');
      const title = interaction.fields.getTextInputValue('title').trim();
      const description = interaction.fields.getTextInputValue('description').trim();
      const rawColor = interaction.fields.getTextInputValue('color').trim() || '#8B5CF6';
      const footer = interaction.fields.getTextInputValue('footer').trim();
      const image = interaction.fields.getTextInputValue('image').trim();
      if (!/^#?[0-9a-fA-F]{6}$/.test(rawColor)) return respond(interaction, 'Kolor wpisz jako HEX, np. #8B5CF6. Uruchom kreator ponownie.');
      const validUrl = value => { if (!value) return true; try { return new URL(value).protocol === 'https:'; } catch { return false; } };
      if (!validUrl(image)) return respond(interaction, 'Adres obrazu musi być poprawnym adresem HTTPS.');
      const hex = rawColor.replace('#', '');
      const existing = editId === 'new' ? null : featureStore.snapshot().embeds.messages.find(item => item.guildId === interaction.guildId && item.messageId === editId);
      if (editId !== 'new' && (!existing || existing.channelId !== channelId)) return respond(interaction, 'Nie znaleziono embeda do edycji.');
      const priorEmbed=existing?.embeds?.[0]??(existing?embedFrom(existing).toJSON():null);
      const merged={...existing,title,description,color:`#${hex.toUpperCase()}`,footer,image,
        author:existing?.author||priorEmbed?.author?.name,authorIcon:existing?.authorIcon||priorEmbed?.author?.icon_url,authorUrl:existing?.authorUrl||priorEmbed?.author?.url,
        footerIcon:existing?.footerIcon||priorEmbed?.footer?.icon_url,thumbnail:existing?.thumbnail||priorEmbed?.thumbnail?.url,url:existing?.url||priorEmbed?.url,
        timestamp:priorEmbed?.timestamp,fields:priorEmbed?.fields};
      const updatedEmbeds=existing?[embedFrom(merged).toJSON(),...(existing.embeds??[]).slice(1)]:undefined;
      const draft = { ...merged, ...existing, id: shortId(), guildId: interaction.guildId, channelId, channelName:channel.name, authorId: interaction.user.id, createdBy:interaction.user.id, createdByName:interaction.user.username, title, description, color: `#${hex.toUpperCase()}`, footer, image, ...(updatedEmbeds?{embeds:updatedEmbeds}:{embeds:undefined}), createdAt: new Date().toISOString(), versions: existing?.versions ?? [], editMessageId: existing?.messageId ?? null, originalCreatedAt: existing?.createdAt ?? null };
      await featureStore.update(state => { state.embeds.drafts = [...state.embeds.drafts.filter(item => item.authorId !== interaction.user.id), draft].slice(-100); });
      const controls = embedDraftControls(draft.id,existing?'Zapisz zmiany':'Opublikuj');
      return respond(interaction, `Podgląd embeda dla <#${channel.id}>. Zatwierdzenie opublikuje wiadomość.`, { embeds: [embedFrom(draft)], components: [controls] });
    }
    return false;
  }

  async function message(message) {
    if (!message.guildId || message.author?.bot) return;
    const ticket = ticketFor(message.channelId);
    if (!ticket || ticket.guildId !== message.guildId || ticket.status !== 'open') return;
    const lastWrite = activityWrites.get(ticket.id) ?? 0;
    if (Date.now() - lastWrite < 30_000 && (message.author.id === ticket.ownerId || ticket.firstResponseAt)) return;
    activityWrites.set(ticket.id, Date.now());
    await featureStore.update(state => {
      const current = state.tickets.items.find(item => item.guildId === message.guildId && item.id === ticket.id && item.status === 'open');
      if (!current) return;
      current.lastActivityAt = new Date(message.createdTimestamp || Date.now()).toISOString();
      current.lastActivityBy = message.author.id;
      if (message.author.id !== current.ownerId && !current.firstResponseAt) current.firstResponseAt = current.lastActivityAt;
      current.lastReminderAt = null;
      current.unassignedNotifiedAt = null;
    });
  }

  async function maintenance() {
    const snapshot = featureStore.snapshot();
    const now = Date.now();
    for (const ticket of snapshot.tickets.items.filter(item => item.status === 'closed' && item.deleteOnClose && !item.channelDeletedAt && item.transcriptHtml)) {
      if (closing.has(ticket.id)) continue;
      const guild = client.guilds.cache.get(ticket.guildId);
      if (!guild) continue;
      closing.add(ticket.id);
      try {
        const channel = await guild.channels.fetch(ticket.channelId).catch(error => {
          if (error.code === 10003) return null;
          throw error;
        });
        await deleteClosedChannel(ticket, channel);
      } catch (error) { console.error(`Ponowne usuwanie kanału ticketu ${ticket.id}:`, error.message); }
      finally { closing.delete(ticket.id); }
    }
    for (const ticket of snapshot.tickets.items.filter(item => item.status === 'open' && item.guildId && item.channelId)) {
      const settings = snapshot.tickets.guildSettings?.[ticket.guildId] ?? {};
      const guild = client.guilds.cache.get(ticket.guildId);
      if (!guild) continue;
      const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
      if (!channel?.isTextBased()) continue;
      const lastActivity = Date.parse(ticket.lastActivityAt ?? ticket.createdAt);
      if (!Number.isFinite(lastActivity)) continue;
      const idleMs = now - lastActivity;
      if (!ticket.claimedBy && Number(settings.unassignedAfterMinutes) > 0 && idleMs >= Number(settings.unassignedAfterMinutes) * 60_000 && (!ticket.unassignedNotifiedAt || now - Date.parse(ticket.unassignedNotifiedAt) > 12*60*60_000)) {
        const roleId = ticket.supportRoleId || settings.supportRoleId;
        await channel.send({content:`🔔 Ticket **${ticket.id}** nadal czeka na opiekuna.${roleId ? ` <@&${roleId}>` : ''}`,allowedMentions:{parse:[],roles:roleId?[roleId]:[]}}).catch(error=>console.warn('Nie udało się powiadomić o nieprzypisanym tickecie:',error.message));
        await featureStore.update(state=>{const current=state.tickets.items.find(item=>item.id===ticket.id);if(current?.status==='open')current.unassignedNotifiedAt=new Date(now).toISOString();});
      }
      const remindHours = Number(settings.reminderAfterHours);
      if (remindHours > 0 && idleMs >= remindHours*3_600_000 && (!ticket.lastReminderAt || now-Date.parse(ticket.lastReminderAt)>=remindHours*3_600_000)) {
        await channel.send({content:`⏰ Ticket **${ticket.id}** jest nieaktywny od ${remindHours} h. Czy zgłoszenie nadal wymaga pomocy?`,allowedMentions:{parse:[]}}).catch(error=>console.warn('Nie udało się wysłać przypomnienia ticketu:',error.message));
        await featureStore.update(state=>{const current=state.tickets.items.find(item=>item.id===ticket.id);if(current?.status==='open')current.lastReminderAt=new Date(now).toISOString();});
      }
      const closeHours = Number(settings.autoCloseAfterHours);
      if (!(closeHours > 0) || idleMs < closeHours*3_600_000 || closing.has(ticket.id)) continue;
      closing.add(ticket.id);
      try {
        const fresh = featureStore.snapshot().tickets.items.find(item=>item.id===ticket.id && item.status==='open');
        if (!fresh) continue;
        const owner = await guild.members.fetch(ticket.ownerId).catch(()=>null);
        const next={...fresh,status:'closed',closedAt:new Date(now).toISOString(),closedBy:'system',closeReason:`Automatyczne zamknięcie po ${closeHours} h bezczynności`,deleteOnClose:true,events:[...(fresh.events??[]),{type:'auto-closed',at:new Date(now).toISOString()}]};
        next.transcriptHtml = await transcript(next, channel);
        const changed=await featureStore.update(state=>{const current=state.tickets.items.find(item=>item.id===ticket.id);if(!current||current.status!=='open')return false;Object.assign(current,next);return true;});
        if (!changed) continue;
        await owner?.send({content:`Ticket ${ticket.id} na serwerze **${guild.name}** został zamknięty automatycznie po ${closeHours} h bezczynności.`}).catch(()=>{});
        await writeLog(guild,'⏰ Automatycznie zamknięto ticket',`${ticket.id} · ${closeHours} h bezczynności`);
        await deleteClosedChannel(next, channel);
      } catch(error) { console.error(`Automatyzacja ticketu ${ticket.id} nie powiodła się:`,error.message); }
      finally { closing.delete(ticket.id); }
    }
    await publishDueEmbeds();
  }

  async function publishDueEmbeds() {
    const staleBefore = Date.now() - 10 * 60_000;
    await featureStore.update(state => {
      for (const item of state.embeds.scheduled) {
        if (item.status === 'processing' && Date.parse(item.processingAt ?? 0) < staleBefore) {
          item.status = 'failed';
          item.lastError = 'Publikacja została przerwana przez restart. Sprawdź kanał przed ponowieniem.';
          item.failedAt = new Date().toISOString();
          item.processingAt = null;
        }
      }
    });
    const due = featureStore.snapshot().embeds.scheduled.filter(item=>item.status==='pending' && Date.parse(item.dueAt)<=Date.now());
    for (const job of due) {
      if(scheduledBusy.has(job.id)) continue;
      scheduledBusy.add(job.id);
      try {
        await featureStore.update(state=>{const current=state.embeds.scheduled.find(item=>item.id===job.id);if(current?.status==='pending'){current.status='processing';current.processingAt=new Date().toISOString();}});
        const current=featureStore.snapshot().embeds.scheduled.find(item=>item.id===job.id);
        if(current?.status!=='processing') continue;
        const guild=client.guilds.cache.get(job.guildId);
        const channel=guild && await guild.channels.fetch(job.channelId).catch(()=>null);
        if(!channel?.isTextBased()) throw new Error('Kanał docelowy nie jest dostępny.');
        const data=resolveEmbedVariables(job.data,guild,client);
        const payload={content:data.content||undefined,embeds:(data.embeds?.length?data.embeds.map(item=>EmbedBuilder.from(item)):[embedFrom(data)]),allowedMentions:{parse:[]}};
        let sent;
        if(job.publishedMessageId){sent=await channel.messages.fetch(job.publishedMessageId).catch(()=>null);if(!sent||sent.author.id!==client.user.id)throw new Error('Poprzednia wiadomość cykliczna nie jest dostępna.');await sent.edit(payload);}
        else sent=await channel.send(payload);
        const rendered={...data,messageId:sent.id,guildId:job.guildId,channelId:channel.id,channelName:channel.name,authorId:job.createdBy,createdAt:job.createdAt,updatedAt:new Date().toISOString(),active:true,scheduledId:job.id,embeds:payload.embeds.map(item=>item.toJSON())};
        await featureStore.update(state=>{
          const item=state.embeds.scheduled.find(row=>row.id===job.id);if(item){item.publishedMessageId=sent.id;item.completedAt=new Date().toISOString();item.processingAt=null;if(item.recurrence){item.status='pending';item.dueAt=nextScheduledDate(item.dueAt,item.recurrence);}else item.status='sent';}
          const existing=state.embeds.messages.find(row=>row.guildId===job.guildId&&row.messageId===sent.id);
          if(existing){existing.versions=[...(existing.versions??[]),{...existing,savedAt:new Date().toISOString()}].slice(-20);Object.assign(existing,rendered);}
          else state.embeds.messages.push(rendered);
        });
        await writeLog(guild,'🗓️ Opublikowano zaplanowany embed',`${job.id} · wiadomość ${sent.id}`);
      } catch(error) {
        console.error(`Publikacja embeda ${job.id} nie powiodła się:`,error.message);
        await featureStore.update(state=>{const item=state.embeds.scheduled.find(row=>row.id===job.id);if(item){item.status='failed';item.lastError=String(error.message).slice(0,250);item.failedAt=new Date().toISOString();}});
      } finally { scheduledBusy.delete(job.id); }
    }
  }

  async function closeLegacy(interaction) {
    await syncLegacyTickets(interaction.guild);
    const ticket = ticketFor(interaction.channelId);
    if (!ticket) return respond(interaction, 'Nie rozpoznaję kanału jako ticketu.');
    if (interaction.user.id !== ticket.ownerId && !canHandleTicket(interaction, ticket)) return respond(interaction, 'Tylko autor ticketu lub obsługa może go zamknąć.');
    return finishClose(interaction, ticket, 'Zamknięty przyciskiem.');
  }

  return { command, button, modal, message, maintenance, closeLegacy };
}
