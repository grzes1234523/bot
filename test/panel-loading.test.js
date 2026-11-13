import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../src/panel/index.html',import.meta.url),'utf8');
const script=html.split('<script>').at(-1).split('</script>')[0];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture({sessionHangs=false,sessionStatus=200}={}) {
  const elements=new Map(), requests=[];
  const element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',style:{},options:[],selectedOptions:[],children:[],classList:{add(){},remove(){},toggle(){}},listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(){},removeAttribute(){},querySelectorAll(){return[];},replaceChildren(){}});return elements.get(id);};
  const request=(url,{signal}={})=>{requests.push(url);if(url==='/api/session'&&!sessionHangs){if(sessionStatus===401)return Promise.resolve(Response.json({authenticated:false,configured:true},{status:401}));return Promise.resolve(Response.json({user:{username:'Test'},guildName:'Test',canManage:true,discordReady:true,botReady:true,botStatus:'online'}));}return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));};
  const context={window:{fetch:request,addEventListener(){}},document:{getElementById:element,querySelectorAll:()=>[],body:{classList:{add(){}}},hidden:false},location:{hash:'#server-dashboard'},history:{replaceState(){}},AbortController,Response,console,setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,40)),clearTimeout,setInterval:()=>0};
  vm.runInNewContext(script,context);
  return {element,requests};
}
test('status połączenia pojawia się bez oczekiwania na moduł i pobierany jest tylko widoczny moduł',async()=>{
  const f=fixture();await sleep(10);
  assert.match(f.element('status').textContent,/Bot jest online/);
  assert.deepEqual(f.requests,['/api/session','/api/guilds','/api/server-control']);
  await sleep(60);assert.match(f.element('moduleLoadNotice').textContent,/Przekroczono czas/);
  assert.match(f.element('status').textContent,/Bot jest online/);
});
test('wylogowana sesja 401 otwiera logowanie i kończy sprawdzanie',async()=>{
  const f=fixture({sessionStatus:401});await sleep(20);
  assert.match(f.element('status').textContent,/Discord/);
  assert.doesNotMatch(f.element('status').textContent,/Sprawdzam połączenie/);
  assert.equal(f.requests.length,1);
});
test('zawieszona sesja kończy oczekiwanie czytelnym błędem',async()=>{
  const f=fixture({sessionHangs:true});await sleep(70);
  assert.match(f.element('status').textContent,/Przekroczono czas/);
  assert.equal(f.requests.length,1);
});
