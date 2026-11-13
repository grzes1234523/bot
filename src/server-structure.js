/**
 * Układ serwera dla komendy /setup-serwera.
 * Można zmieniać `name`, `color`, `permissions`, `hoist` i `mentionable`.
 * Nie zmieniaj `key` — po tych identyfikatorach bot podpina moduły.
 *
 * Kolejność ról w tablicy to kolejność od góry listy (najwyższa rola pierwsza).
 * Puste `permissions` oznacza rolę bez uprawnień.
 * `nativeBooster`: jeśli serwer ma już rolę boostów, bot jej nie tworzy i nie zmienia.
 * Uprawnienie Administrator wolno wpisać tylko przy Właścicielu i Adminie.
 */
export const serverStructure = {
  roles: [
    { key: 'owner', name: '👑 Właściciel', color: '#F1C40F', hoist: true, rank: 'owner', permissions: ['Administrator'] },
    { key: 'admin', name: '🛠️ Admin', color: '#E74C3C', hoist: true, rank: 'admin', permissions: ['Administrator'] },
    { key: 'moderator', name: '🛡️ Moderator', color: '#3498DB', hoist: true, rank: 'mod', permissions: ['KickMembers', 'BanMembers', 'ModerateMembers', 'ManageMessages', 'ManageThreads', 'MuteMembers', 'DeafenMembers', 'MoveMembers', 'ViewAuditLog', 'ManageNicknames'] },
    { key: 'helper', name: '🔰 Pomocnik', color: '#2ECC71', hoist: true, rank: 'helper', permissions: ['ModerateMembers', 'ManageMessages', 'MuteMembers', 'MoveMembers', 'ManageNicknames'] },
    { key: 'recruit', name: '🧪 Rekrutant (okres próbny)', color: '#1ABC9C', hoist: true, rank: 'recruit', permissions: ['ModerateMembers', 'MuteMembers', 'MoveMembers'] },
    { key: 'bots', name: '🤖 Boty', color: '#5865F2', hoist: true, permissions: [] },
    { key: 'booster', name: '💜 Booster', color: '#F47FFF', hoist: true, nativeBooster: true, images: true, permissions: ['AttachFiles', 'EmbedLinks'] },
    { key: 'vip', name: '⭐ VIP', color: '#F39C12', hoist: true, images: true, permissions: ['AttachFiles', 'EmbedLinks'] },
    { key: 'champion', name: '🏆 Mistrz Turnieju', color: '#E67E22', hoist: true, permissions: [] },
    { key: 'active', name: '🔥 Aktywny tygodnia', color: '#FF6B35', hoist: true, permissions: [] },
    { key: 'legend', name: '💎 Legenda', color: '#FFD700', hoist: true, level: 50, permissions: [] },
    { key: 'veteran', name: '🥇 Weteran', color: '#E0B040', hoist: true, level: 30, permissions: [] },
    { key: 'regular', name: '🥈 Bywalec', color: '#C0C0C0', hoist: true, level: 15, permissions: [] },
    { key: 'novice', name: '🥉 Nowicjusz', color: '#95A5A6', hoist: true, level: 5, permissions: [] },
    { key: 'red', name: '🎨 Czerwony', color: '#E74C3C', permissions: [] },
    { key: 'blue', name: '🎨 Niebieski', color: '#3498DB', permissions: [] },
    { key: 'green', name: '🎨 Zielony', color: '#2ECC71', permissions: [] },
    { key: 'purple', name: '🎨 Fioletowy', color: '#9B59B6', permissions: [] },
    { key: 'minecraft', name: '🎮 Minecraft', game: 'minecraft', permissions: [] },
    { key: 'cs2', name: '🎮 CS2', game: 'cs2', permissions: [] },
    { key: 'fortnite', name: '🎮 Fortnite', game: 'fortnite', permissions: [] },
    { key: 'lol', name: '🎮 LoL', game: 'lol', permissions: [] },
    { key: 'notify-announcements', name: '🔔 Ogłoszenia', mentionable: true, permissions: [] },
    { key: 'notify-events', name: '🎉 Eventy', mentionable: true, permissions: [] },
    { key: 'notify-giveaway', name: '🎁 Giveaway', mentionable: true, permissions: [] },
    { key: 'notify-contests', name: '🎁 Konkursy', mentionable: true, permissions: [] },
    { key: 'member', name: '✅ Członek', rank: 'member', permissions: [] },
    { key: 'unverified', name: '❌ Niezweryfikowany', color: '#7F8C8D', rank: 'unverified', permissions: [] },
  ],
  categories: [
    {
      key: 'start', name: '📌・START', visibility: 'start',
      channels: [
        { key: 'rules', name: '📜・regulamin', kind: 'text', readOnly: true },
        { key: 'announcements', name: '📢・ogłoszenia', kind: 'text', readOnly: true },
        { key: 'welcome', name: '👋・witamy', kind: 'text' },
        { key: 'verification', name: '✅・weryfikacja', kind: 'text', visibility: 'unverified' },
        { key: 'pick-roles', name: '🎭・wybierz-role', kind: 'text' },
      ],
    },
    {
      key: 'general', name: '💬・OGÓLNE', visibility: 'members',
      channels: [
        { key: 'chat', name: '💬・czat', kind: 'text' },
        { key: 'memes', name: '🤣・memy', kind: 'text' },
        { key: 'media', name: '📸・media', kind: 'text' },
        { key: 'bot-commands', name: '🤖・komendy-bota', kind: 'text' },
        { key: 'suggestions', name: '💡・propozycje', kind: 'text' },
      ],
    },
    {
      key: 'social', name: '💡・SPOŁECZNOŚĆ', visibility: 'members',
      channels: [
        { key: 'ideas', name: '💡・pomysły', kind: 'text' },
        { key: 'polls', name: '📊・ankiety', kind: 'text' },
        { key: 'showcase', name: '🌟・pochwal-się', kind: 'text' },
        { key: 'vip-lounge', name: '⭐・vip-lounge', kind: 'text', visibility: 'vip' },
      ],
    },
    {
      key: 'games', name: '🎮・GRY', visibility: 'members',
      channels: [
        { key: 'lfg', name: '🔎・szukam-ekipy', kind: 'forum', tags: ['ranked', 'casual', 'PL', 'EN'] },
      ],
    },
    {
      key: 'game-minecraft', name: '🎮・Minecraft', visibility: 'game', gameRole: 'minecraft',
      channels: [
        { key: 'minecraft-text', name: '💬・czat-minecraft', kind: 'text' },
        { key: 'minecraft-voice', name: '🔊・minecraft', kind: 'voice' },
      ],
    },
    {
      key: 'game-cs2', name: '🎮・CS2', visibility: 'game', gameRole: 'cs2',
      channels: [
        { key: 'cs2-text', name: '💬・czat-cs2', kind: 'text' },
        { key: 'cs2-voice', name: '🔊・cs2', kind: 'voice' },
      ],
    },
    {
      key: 'game-fortnite', name: '🎮・Fortnite', visibility: 'game', gameRole: 'fortnite',
      channels: [
        { key: 'fortnite-text', name: '💬・czat-fortnite', kind: 'text' },
        { key: 'fortnite-voice', name: '🔊・fortnite', kind: 'voice' },
      ],
    },
    {
      key: 'game-lol', name: '🎮・LoL', visibility: 'game', gameRole: 'lol',
      channels: [
        { key: 'lol-text', name: '💬・czat-lol', kind: 'text' },
        { key: 'lol-voice', name: '🔊・lol', kind: 'voice' },
      ],
    },
    {
      key: 'voice', name: '🔊・GŁOSOWE', visibility: 'members',
      channels: [
        { key: 'create-voice', name: '➕・Stwórz kanał', kind: 'voice' },
        { key: 'talk', name: '🔊・Pogaduchy', kind: 'voice' },
      ],
    },
    {
      key: 'events-hub', name: '🎉・EVENTY', visibility: 'members',
      channels: [
        { key: 'events', name: '📅・eventy', kind: 'text' },
        { key: 'giveaway', name: '🎁・giveaway', kind: 'text' },
        { key: 'contests', name: '🎁・konkursy', kind: 'text' },
        { key: 'fun', name: '🎲・zabawy', kind: 'text' },
        { key: 'levels', name: '🏆・poziomy', kind: 'text' },
        { key: 'economy', name: '💰・ekonomia', kind: 'text' },
        { key: 'tournaments', name: '🎤・Turnieje', kind: 'stage' },
      ],
    },
    {
      key: 'help', name: '🎫・POMOC', visibility: 'members',
      channels: [
        { key: 'tickets', name: '🎫・zgłoszenia', kind: 'text' },
        { key: 'faq', name: '❓・faq', kind: 'text' },
        { key: 'recruitment', name: '📋・rekrutacja', kind: 'text' },
      ],
    },
    {
      key: 'staff', name: '🛡️・EKIPA', visibility: 'staff',
      channels: [
        { key: 'staff-chat', name: '💬・ekipa-czat', kind: 'text' },
        { key: 'recruit-decisions', name: '📋・decyzje-rekrutacja', kind: 'text' },
        { key: 'recruit-inbox', name: '📥・rekrutacja-zgłoszenia', kind: 'text' },
        { key: 'reports', name: '📊・raporty', kind: 'text' },
        { key: 'logs', name: '📜・logi', kind: 'text', visibility: 'mods' },
      ],
    },
  ],
};
