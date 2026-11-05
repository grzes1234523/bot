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

// Wspólna blokada dla panelu, komend i automatycznych liczników.
export function createStatisticsMemberLoader({now=Date.now}={}) {
  const requests=new WeakMap();
  return async function ensureMembers(guild) {
    if(collectServerStatistics(guild,now()))return true;
    let state=requests.get(guild);
    if(!state){state={nextAttempt:0,pending:null};requests.set(guild,state);}
    if(state.pending)return state.pending;
    if(now()<state.nextAttempt)return false;
    state.nextAttempt=now()+35000;
    state.pending=(async()=>{
      try{
        await guild.members.fetch({withPresences:true});
        return Boolean(collectServerStatistics(guild,now()));
      }catch(error){
        if(error.name!=='GatewayRateLimitError')throw error;
        const seconds=Number(error.retry_after??error.retryAfter??error.data?.retry_after??String(error.message).match(/Retry after ([\d.]+) seconds/i)?.[1]);
        state.nextAttempt=Math.max(state.nextAttempt,now()+(Number.isFinite(seconds)&&seconds>0?seconds*1000:35000)+1000);
        return Boolean(collectServerStatistics(guild,now()));
      }finally{state.pending=null;}
    })();
    return state.pending;
  };
}
export const ensureStatisticsMembers=createStatisticsMemberLoader();
