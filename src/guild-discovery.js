const pageSize = 200;
function lastId(ids, previous) {
  const valid = [...ids].filter(id => /^\d{17,20}$/.test(id));
  const last = valid.sort((a,b) => BigInt(a) < BigInt(b) ? -1 : 1).at(-1);
  if (!last || (previous && BigInt(last) <= BigInt(previous))) throw new Error('Discord nie zwrócił kolejnej strony serwerów.');
  return last;
}

export async function fetchUserGuilds(accessToken, fetchImpl = fetch) {
  if (!accessToken) { const error = new Error('Zaloguj się ponownie, aby odświeżyć serwery.'); error.status = 401; throw error; }
  const all = new Map(); let after;
  for (let page = 0; page < 100; page++) {
    const query = new URLSearchParams({ limit: String(pageSize) });
    if (after) query.set('after', after);
    const response = await fetchImpl(`https://discord.com/api/v10/users/@me/guilds?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      const error = new Error(response.status === 401 ? 'Sesja Discord wygasła. Zaloguj się ponownie, aby odświeżyć serwery.' : 'Discord nie udostępnił listy serwerów. Spróbuj ponownie za chwilę.');
      error.status = response.status === 401 ? 401 : 502; throw error;
    }
    const guilds = await response.json();
    if (!Array.isArray(guilds)) throw new Error('Nieprawidłowa lista serwerów Discord.');
    for (const guild of guilds) all.set(guild.id,guild);
    if (guilds.length < pageSize) return [...all.values()];
    after = lastId(guilds.map(guild => guild.id), after);
  }
  throw new Error('Lista serwerów jest zbyt długa. Spróbuj ponownie.');
}

export async function fetchBotGuildIds(client, discordMode) {
  if (discordMode !== 'rest' || !client.guilds.fetch) return new Set(client.guilds.cache.keys());
  const all = new Set(); let after;
  for (let page = 0; page < 100; page++) {
    const guilds = await client.guilds.fetch({ limit: pageSize, ...(after ? { after } : {}) });
    for (const id of guilds.keys()) all.add(id);
    if (guilds.size < pageSize) return all;
    after = lastId(guilds.keys(),after);
  }
  throw new Error('Nie można odczytać pełnej listy serwerów bota.');
}

export function chooseHomeGuild(guilds, botIds, primaryGuildId) {
  const list = Array.isArray(guilds) ? guilds : [];
  const present = guild => botIds?.has?.(guild?.id);
  return list.find(guild => guild?.id === primaryGuildId && present(guild)) ?? list.find(present) ?? null;
}

export function manageableGuilds(guilds) {
  return guilds.filter(guild => {
    if (guild.owner === true) return true;
    try { return (BigInt(guild.permissions ?? '0') & (8n | 32n)) !== 0n; }
    catch { return false; }
  }).map(guild => ({ id: guild.id, name: guild.name || 'Serwer Discord', iconUrl: guild.icon && /^\d{17,20}$/.test(String(guild.id)) && /^[a-zA-Z0-9_]+$/.test(String(guild.icon)) ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : null }));
}
