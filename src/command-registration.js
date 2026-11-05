const accessDenied=error=>[50001,10004].includes(Number(error.code));
export async function registerGuildCommands({guild,commands,isActive=()=>true,reportFailure=()=>{}}){
 const scope=`${guild.name} (${guild.id})`;
 const denied=error=>{reportFailure(`Rejestracja komend: brak dostępu do serwera ${scope}. Sprawdź, czy bot nadal jest na serwerze i ma instalację bot + applications.commands`,error);return{ok:false,reason:'missing_access'};};
 if(!isActive()||guild.available===false)return{ok:false,reason:'unavailable'};
 let existing;
 try{existing=await guild.commands.fetch();}catch(error){if(accessDenied(error))return denied(error);reportFailure(`Nie można odczytać komend serwera ${scope}`,error);return{ok:false,reason:'fetch_failed'};}
 let updated=0,unchanged=0,failed=0;
 for(const command of commands){
  if(!isActive()||guild.available===false)return{ok:false,reason:'unavailable',updated,unchanged};
  const data=JSON.parse(JSON.stringify(command.toJSON()));const found=existing.find(c=>c.name===data.name&&(c.type??1)===(data.type??1));
  if(found&&found.equals(data,true)){unchanged++;continue;}
  try{await guild.commands.create(data);updated++;}
  catch(error){if(accessDenied(error))return denied(error);failed++;reportFailure(`Nie udało się zarejestrować /${data.name} na serwerze ${scope}`,error);}
 }
 return{ok:failed===0,updated,unchanged,failed};
}
