import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { featureCommands } from './features.js';
import { levelCommands } from './levels.js';
import { welcomeCommands, farewellCommands } from './welcome.js';
import { communityCommands } from './community.js';
import { serverBuilderCommands } from './server-builder.js';

const applicationId = command => command.addStringOption(opt =>
  opt.setName('id').setDescription('ID podania, np. A3D4F501').setRequired(true));

export const recruitmentCommands = [
  new SlashCommandBuilder().setName('rekrutacja-ustaw').setDescription('Konfiguruje rekrutację na bieżącym serwerze.').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o => o.setName('kanal').setDescription('Kanał na podania').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addRoleOption(o => o.setName('rola').setDescription('Rola po zaakceptowaniu podania').setRequired(true))
    .addRoleOption(o => o.setName('obsluga').setDescription('Rola osób rozpatrujących podania'))
    .addChannelOption(o => o.setName('logi').setDescription('Kanał logów rekrutacji').addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName('rekrutacja-panel').setDescription('Publikuje panel rekrutacyjny na tym kanale (administracja).'),
  new SlashCommandBuilder().setName('rekrutacja-akceptuj').setDescription('Akceptuje podanie i nadaje rolę po ID.')
    .addStringOption(opt => opt.setName('id').setDescription('ID podania').setRequired(true))
    .addStringOption(opt => opt.setName('uwagi').setDescription('Wiadomość dla kandydata').setMaxLength(500)),
  new SlashCommandBuilder().setName('rekrutacja-odrzuc').setDescription('Odrzuca podanie z powodem.')
    .addStringOption(opt => opt.setName('id').setDescription('ID podania').setRequired(true))
    .addStringOption(opt => opt.setName('powod').setDescription('Powód odrzucenia').setRequired(true).setMaxLength(700)),
  new SlashCommandBuilder().setName('rekrutacja-zamknij').setDescription('Zamyka podanie bez akceptacji.')
    .addStringOption(opt => opt.setName('id').setDescription('ID podania').setRequired(true))
    .addStringOption(opt => opt.setName('powod').setDescription('Wiadomość dla kandydata').setMaxLength(700)),
  new SlashCommandBuilder().setName('rekrutacja-lista').setDescription('Lista ostatnich podań dla administracji.')
    .addStringOption(opt => opt.setName('status').setDescription('Filtr statusu').addChoices(
      { name: 'Oczekujące', value: 'pending' },
      { name: 'Zaakceptowane', value: 'accepted' },
      { name: 'Odrzucone', value: 'rejected' },
      { name: 'Zamknięte', value: 'closed' },
      { name: 'Wszystkie', value: 'all' },
    )),
  new SlashCommandBuilder().setName('rekrutacja-status').setDescription('Sprawdza status podania (bez ID: ostatnie własne).')
    .addStringOption(opt => opt.setName('id').setDescription('ID podania (opcjonalne)')),
  new SlashCommandBuilder().setName('rekrutacja-moje').setDescription('Wyświetla historię Twoich podań.'),
  new SlashCommandBuilder().setName('rekrutacja-statystyki').setDescription('Podsumowanie rekrutacji dla administracji.'),
  new SlashCommandBuilder().setName('rekrutacja-usun').setDescription('Usuwa pojedyncze rozpatrzone podanie (z potwierdzeniem; tylko administracja serwera).')
    .addStringOption(opt => opt.setName('id').setDescription('ID rozpatrzonego podania').setRequired(true))
    .addBooleanOption(opt => opt.setName('wiadomosc').setDescription('Czy usuwać również wiadomość z kanału podań? (domyślnie tak)')),
  new SlashCommandBuilder().setName('rekrutacja-wyczysc').setDescription('Usuwa zakończone podania; NIE usuwa oczekujących (z potwierdzeniem).')
    .addStringOption(opt => opt.setName('status').setDescription('Które zakończone podania usunąć?').addChoices(
      { name: 'Wszystkie zakończone', value: 'all' },
      { name: 'Zaakceptowane', value: 'accepted' },
      { name: 'Odrzucone', value: 'rejected' },
      { name: 'Zamknięte', value: 'closed' },
    ))
    .addBooleanOption(opt => opt.setName('wiadomosci').setDescription('Czy usuwać także wiadomości z kanału podań? (domyślnie tak)')),
  new SlashCommandBuilder().setName('rekrutacja-pomoc').setDescription('Pokazuje instrukcję składania podań.'),
];

const publicRecruitmentCommands=new Set(['rekrutacja-status','rekrutacja-moje','rekrutacja-pomoc']);
for(const command of recruitmentCommands){
  command.setDMPermission(false);
  if(!publicRecruitmentCommands.has(command.name))command.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
}

export const commands = [...serverBuilderCommands, ...recruitmentCommands, ...featureCommands, ...levelCommands, ...welcomeCommands, ...farewellCommands, ...communityCommands];
