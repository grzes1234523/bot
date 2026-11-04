// Tylko klient Gateway ma kompletną listę członków i ich statusy.
export function collectServerStatistics(guild, now = Date.now()) {
  const members = guild.members.cache;
  if (!Number.isInteger(guild.memberCount) || guild.memberCount < 1 || members.size !== guild.memberCount) return null;
  const bots = members.filter(member => member.user.bot).size;
  return {
    guildId: guild.id, members: members.size, bots, humans: members.size - bots,
    online: members.filter(member => member.presence && member.presence.status !== 'offline').size,
    updatedAt: new Date(now).toISOString(),
  };
}

export function readServerStatistics(snapshot, guildId, now = Date.now()) {
  if (!snapshot || snapshot.guildId !== guildId) return null;
  const age = now - Date.parse(snapshot.updatedAt);
  if (!Number.isFinite(age) || age < -5000 || age > 120000) return null;
  if (!['members', 'bots', 'humans', 'online'].every(key => Number.isInteger(snapshot[key]) && snapshot[key] >= 0)) return null;
  if (snapshot.members !== snapshot.bots + snapshot.humans || snapshot.online > snapshot.members) return null;
  return snapshot;
}
