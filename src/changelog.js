import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';

export const changelogCommands = [
  new SlashCommandBuilder().setName('aktualizacja').setDescription('Dodaj wpis do historii zmian bota i strony')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option => option.setName('typ').setDescription('Rodzaj zmiany').setRequired(true)
      .addChoices({name:'Dodano',value:'dodano'},{name:'Zmieniono',value:'zmieniono'},{name:'Usunięto',value:'usunieto'}))
    .addStringOption(option => option.setName('obszar').setDescription('Czego dotyczy zmiana').setRequired(true)
      .addChoices({name:'Bot Discord',value:'bot'},{name:'Strona',value:'strona'}))
    .addStringOption(option => option.setName('opis').setDescription('Opis aktualizacji (maks. 1000 znaków)').setRequired(true).setMaxLength(1000)),
];

export async function handleChangelogCommand(interaction, featureStore) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content:'Tylko osoby z uprawnieniem Zarządzanie serwerem mogą publikować aktualizacje.', flags:MessageFlags.Ephemeral });
  }
  const type=interaction.options.getString('typ',true);
  const area=interaction.options.getString('obszar',true);
  const description=interaction.options.getString('opis',true).trim();
  if (!['dodano','zmieniono','usunieto'].includes(type) || !['bot','strona'].includes(area) || !description || description.length>1000) {
    return interaction.reply({content:'Nieprawidłowe dane aktualizacji.',flags:MessageFlags.Ephemeral});
  }
  await featureStore.update(state=>{
    state.changelog ??= {};
    const entries=Array.isArray(state.changelog[interaction.guildId])?state.changelog[interaction.guildId]:[];
    state.changelog[interaction.guildId]=[{type,area,description,timestamp:new Date().toISOString(),authorId:interaction.user.id},...entries].slice(0,200);
  });
  return interaction.reply({content:'✅ Aktualizacja zapisana. Pojawi się na stronie po odświeżeniu.',flags:MessageFlags.Ephemeral});
}
