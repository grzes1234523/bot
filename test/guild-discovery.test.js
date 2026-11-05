import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchUserGuilds, fetchBotGuildIds, manageableGuilds } from '../src/guild-discovery.js';

const rows = (start,count) => Array.from({ length: count }, (_,index) => ({ id: String(10000000000000000n + BigInt(start + index)), name: `Serwer ${start+index}`, permissions: '32' }));
test('lista konta pobiera wszystkie strony i przekazuje token wyłącznie w nagłówku', async () => {
  const calls = [], first = rows(0,200), second = rows(200,2);
  const result = await fetchUserGuilds('secret-token', async (url, options) => {
    calls.push(new URL(url)); assert.equal(options.headers.Authorization,'Bearer secret-token'); assert.ok(!url.includes('secret-token'));
    return Response.json(calls.length === 1 ? first : second);
  });
  assert.equal(result.length,202); assert.equal(calls[0].searchParams.get('limit'),'200');
  assert.equal(calls[1].searchParams.get('after'),first.at(-1).id);
});
test('lista bota pobiera serwery poza pierwszymi 200 zamiast polegać na cache panelu', async () => {
  const first=rows(0,200),second=rows(200,1),calls=[];
  const client={guilds:{cache:new Map(),fetch:async options=>{calls.push(options);return new Map((calls.length===1?first:second).map(g=>[g.id,g]));}}};
  const ids=await fetchBotGuildIds(client,'rest');assert.equal(ids.size,201);assert.equal(calls[1].after,first.at(-1).id);
});
test('właściciel oraz administrator i zarządzający widzą swoje serwery', () => {
  const result=manageableGuilds([{id:'owner',owner:true,permissions:'0'},{id:'admin',permissions:'8'},{id:'manager',permissions:'32'},{id:'guest',permissions:'0'},{id:'broken',permissions:'xyz'}]);
  assert.deepEqual(result.map(g=>g.id),['owner','admin','manager']);
});
test('wygasły token i błąd Discorda nie ujawniają sekretu', async () => {
  await assert.rejects(fetchUserGuilds('secret-token',async()=>Response.json({}, {status:401})),error=>error.status===401&&!error.message.includes('secret-token'));
  await assert.rejects(fetchUserGuilds('secret-token',async()=>Response.json({error:'secret-token'}, {status:500})),error=>error.status===502&&!error.message.includes('secret-token'));
});
test('powtarzająca się strona nie powoduje nieskończonego pobierania', async () => {
  let count=0; await assert.rejects(fetchUserGuilds('token',async()=>{count++;return Response.json(rows(0,200));}),/kolejnej strony/);
  assert.equal(count,2);
});
