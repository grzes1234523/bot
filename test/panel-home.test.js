import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');

function sliceElement(source, startIndex, tagName) {
  const open = source.indexOf('>', startIndex);
  const re = new RegExp(`</?${tagName}\\b[^>]*>`, 'gi');
  re.lastIndex = open + 1;
  let depth = 1;
  let match;
  while ((match = re.exec(source))) {
    const token = match[0];
    const closing = token.startsWith('</');
    if (!closing && /\/>\s*$/.test(token)) continue;
    depth += closing ? -1 : 1;
    if (depth === 0) return source.slice(startIndex, match.index + token.length);
  }
  throw new Error(`Nie znaleziono końca elementu ${tagName}`);
}

const dashboard = sliceElement(html, html.indexOf('<section id="server-dashboard"'), 'section');
const control = sliceElement(html, html.indexOf('<section id="server-control"'), 'section');
const sidebar = html.slice(html.indexOf('class="sidebar-home"'), html.indexOf('id="moduleNav"') + html.slice(html.indexOf('id="moduleNav"')).indexOf('</nav>'));

test('centrum dowodzenia jest widokiem #server-control i aliasu #server-dashboard', () => {
  assert.match(control, /aria-label="Twoje centrum dowodzenia"/);
  assert.ok(control.indexOf('Twoje centrum') < control.indexOf('Serwer i kanały'));
  assert.equal(control.includes('Centrum serwera'), false);
  assert.match(dashboard, /class="cc-legacy"/);
  assert.match(dashboard, /Centrum serwera/);
  assert.equal(dashboard.includes('class="command-center"'), false);
  assert.match(html, /#server-dashboard \.cc-legacy\{display:none!important\}/);
  assert.match(html, /#server-dashboard:target\{display:none!important\}/);
  assert.match(html, /body:has\(#server-dashboard:target\) #server-control/);
  assert.match(control, /class="module-card control-page"/);
  assert.match(html, /main \.module-card:target\{display:block\}/);
  assert.match(html, /\.control-page:target\{display:block\}/);
  assert.equal(html.includes('#command-center'), false);
  assert.equal(html.includes('#centrum'), false);
});

test('z centrum dowodzenia da się dojść do istniejących modułów i listy kanałów', () => {
  const moduleLinks = [
    '#server-dashboard', '#server-control', '#module-statystyki', '#module-aktywnosc', '#module-powitania-pozegnania',
    '#module-ekonomia', '#module-poziomy', '#module-auto-kanaly', '#module-zabawy', '#module-pomysly',
    '#module-moderacja', '#module-auto-mod', '#module-moderowane-kanaly', '#module-tickets', '#module-weryfikacja',
    '#module-logi', '#module-automatyzacje',
  ];
  for (const href of moduleLinks) {
    assert.match(sidebar, new RegExp(`href="${href}"`));
    assert.match(html, new RegExp(`id="${href.slice(1)}"`));
  }
  assert.match(control, /href="#server-control">Zobacz wszystkie kanały/);
  assert.match(control, /href="#module-logi">Otwórz logi/);
  assert.match(control, /id="serverChannelRows"/);
  assert.match(control, /id="guildCards"/);
  assert.match(control, /id="ccPicker"/);
  assert.match(control, /id="ccGuildLabel"/);
  assert.match(control, /id="ccSwitchServer" href="\/wybor-serwera"[^>]*>Zmień serwer/);
  assert.match(html, /location\.hash='#server-control';location\.reload\(\)/);
});

test('wylogowana strona główna nadal pokazuje logowanie Discord', async () => {
  assert.match(html, /id="landing"/);
  assert.match(html, /body\.landing-active>header,body\.landing-active>\.module-sidebar,body\.landing-active>main,body\.landing-active>footer\{display:none!important\}/);
  assert.match(html, /href="\/auth\/discord"/);
  const script = html.split('<script>').at(-1).split('</script>')[0];
  const classes = [];
  const landing = { classList: { remove(name) { this.removed = name; }, removed: '' }, className: 'landing-page hidden' };
  const element = id => id === 'landing' ? landing : { value: '', textContent: '', style: {}, options: [], selectedOptions: [], children: [], classList: { add() {}, remove() {}, toggle() {} }, listeners: {}, addEventListener() {}, setAttribute() {}, removeAttribute() {}, querySelectorAll: () => [], replaceChildren() {} };
  const request = async () => Response.json({ configured: true, authenticated: false }, { status: 401 });
  const context = {
    window: { fetch: request, addEventListener() {} },
    document: { getElementById: element, querySelectorAll: () => [], querySelector: () => null, body: { classList: { add(name) { classes.push(name); } } }, hidden: false },
    location: { hash: '#server-control' },
    history: { replaceState() {} },
    AbortController, Response, console,
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 20)),
    clearTimeout, setInterval: () => 0,
  };
  vm.runInNewContext(script, context);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.ok(classes.includes('landing-active'));
  assert.equal(landing.classList.removed, 'hidden');
});

test('przycisk Zarządzaj serwerem zostawia użytkownika na centrum dowodzenia', async () => {
  const script = html.slice(html.indexOf('<script id="command-center-script">') + '<script id="command-center-script">'.length, html.lastIndexOf('</script>'));
  const make = tag => ({
    tag, children: [], listeners: {}, className: '', textContent: '', title: '', alt: '', src: '', disabled: false, value: '', scrolled: false,
    addEventListener(name, fn) { (this.listeners[name] ??= []).push(fn); },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    setAttribute() {},
    scrollIntoView() { this.scrolled = true; },
  });
  const byId = {
    ccSearch: make('input'), ccGuilds: make('div'), ccBotStatus: make('strong'), ccMembers: make('strong'),
    ccChannels: make('div'), ccServerCount: make('strong'), serverChannelRows: make('tbody'),
  };
  const location = { hash: '#server-control', reload() { this.reloads = (this.reloads || 0) + 1; } };
  const requests = [];
  const guilds = [
    { id: '123456789012345679', name: 'Strefa Gry i Rozrywki', installed: true, owner: true, iconUrl: 'https://cdn.discordapp.com/icons/a.png' },
    { id: '123456789012345680', name: 'Drugi serwer', installed: false, owner: false, invite: 'https://example.invalid/invite' },
  ];
  const fetch = async (url, options = {}) => {
    requests.push([String(url), options.method || 'GET']);
    if (String(url).startsWith('/api/session')) return Response.json({ discordReady: true, botReady: true });
    if (String(url).startsWith('/api/guilds') && (options.method || 'GET') === 'GET') return Response.json({ guilds });
    if (String(url).startsWith('/api/guilds') && options.method === 'POST') return Response.json({ ok: true });
    if (String(url) === '/api/server-control') return Response.json({ server: { memberCount: 1280 }, channels: [{ name: 'ogolny', type: 'tekstowy', canSend: true }] });
    return Response.json({ error: 'brak' }, { status: 404 });
  };
  const channelLink = make('a');
  const hashListeners = [];
  const document = {
    getElementById: id => byId[id] || null,
    createElement: make,
    querySelector: selector => selector === '.command-center a[href="#server-control"]' ? channelLink : null,
  };
  const window = { fetch, addEventListener(name, fn) { if (name === 'hashchange') hashListeners.push(fn); } };
  vm.runInNewContext(script, { document, location, window, fetch, setTimeout, clearTimeout, URL, console });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(byId.ccBotStatus.textContent, '● Online');
  assert.equal(byId.ccServerCount.textContent, '2');
  assert.equal(byId.ccMembers.textContent, (1280).toLocaleString('pl-PL'));
  assert.match(JSON.stringify(byId.ccChannels.children), /ogolny/);
  const buttons = byId.ccGuilds.children.flatMap(card => card.children.flatMap(node => node.tag === 'button' ? [node] : (node.children || []).filter(child => child.tag === 'button')));
  const manage = buttons.find(button => button.textContent.includes('Zarządzaj serwerem'));
  const addBot = buttons.find(button => button.textContent.includes('Dodaj bota'));
  assert.ok(manage);
  assert.ok(addBot);
  await manage.listeners.click[0]();
  assert.equal(location.hash, '#server-control');
  assert.equal(location.reloads, 1);
  assert.deepEqual(requests.at(-1), ['/api/guilds', 'POST']);
  const reloadsAfterManage = location.reloads;
  await addBot.listeners.click[0]();
  assert.equal(location.hash, '#server-control');
  assert.equal(location.reloads, reloadsAfterManage);
  const event = { prevented: false, preventDefault() { this.prevented = true; } };
  channelLink.listeners.click[0](event);
  assert.equal(event.prevented, true);
  assert.equal(byId.serverChannelRows.scrolled, true);
  assert.equal(location.hash, '#server-control');
  const before = requests.length;
  location.hash = '#server-dashboard';
  hashListeners[0]();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(requests.slice(before).some(([url]) => url.startsWith('/api/guilds')));
  assert.equal(location.hash, '#server-dashboard');
});

test('wybrany serwer otwiera centrum i zostawia wybór pod /wybor-serwera', async () => {
  const script = html.slice(html.indexOf('<script id="command-center-script">') + '<script id="command-center-script">'.length, html.lastIndexOf('</script>'));
  const make = tag => ({
    tag, hidden: false, textContent: '', value: '', children: [], listeners: {},
    addEventListener(name, fn) { (this.listeners[name] ??= []).push(fn); },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    append(...nodes) { this.children.push(...nodes); },
    setAttribute() {},
  });
  const byId = {
    ccSearch: make('input'), ccGuilds: make('div'), ccBotStatus: make('strong'), ccMembers: make('strong'),
    ccChannels: make('div'), ccServerCount: make('strong'), ccPicker: make('div'), ccSwitchServer: make('a'), ccGuildLabel: make('p'),
  };
  byId.ccSwitchServer.hidden = true;
  const guildId = '123456789012345679';
  const fetch = async url => {
    if (String(url).startsWith('/api/session')) return Response.json({ canManage: true, guildId, guildName: 'Strefa Gry i Rozrywki', discordReady: true, botReady: true });
    if (String(url).startsWith('/api/guilds')) return Response.json({ guilds: [
      { id: '123456789012345680', name: 'Inny', installed: true },
      { id: guildId, name: 'Strefa Gry i Rozrywki', installed: true, owner: true },
    ]});
    if (String(url) === '/api/server-control') return Response.json({ server: { memberCount: 1280, name: 'Strefa Gry i Rozrywki' }, channels: [] });
    return Response.json({}, { status: 404 });
  };
  vm.runInNewContext(script, {
    document: { getElementById: id => byId[id] || null, createElement: make, querySelector: () => null },
    location: { hash: '#server-control' },
    window: { fetch, addEventListener() {}, scrollTo() {} },
    fetch, setTimeout, clearTimeout, URL, console, requestAnimationFrame: fn => fn(),
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(byId.ccPicker.hidden, true);
  assert.equal(byId.ccSwitchServer.hidden, false);
  assert.equal(byId.ccGuildLabel.textContent, 'Strefa Gry i Rozrywki');
  assert.match(html, /href="\/wybor-serwera"/);
});
