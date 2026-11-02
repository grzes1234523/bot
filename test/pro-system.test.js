import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { proCommands, ticketCategoryKey, ticketPanelPayload, ticketFormModal, embedComponents, embedAppearanceModal, nextScheduledDate, resolveEmbedVariables } from '../src/pro-system.js';

test('komendy PRO mieszczą się w limitach Discorda i obejmują konfigurację ticketów oraz embedów', () => {
  const json = proCommands.map(command => command.toJSON());
  const ticket = json.find(command => command.name === 'ticket');
  const embed = json.find(command => command.name === 'embed');
  assert.ok(ticket && embed);
  assert.ok(ticket.options.length <= 25);
  assert.ok(embed.options.length <= 25);
  const ticketNames = ticket.options.map(option => option.name);
  for (const name of ['kategoria','kategorie','administrator','raport','eksport','panel-edytuj','historia','przekaz']) assert.ok(ticketNames.includes(name), `brak /ticket ${name}`);
  const embedNames = embed.options.map(option => option.name);
  for (const name of ['import','eksport','cofnij','szablon','zaplanuj','harmonogram','pole','akcja','menu-role']) assert.ok(embedNames.includes(name), `brak /embed ${name}`);
  for (const command of json) assert.doesNotThrow(() => JSON.stringify(command));
});

test('ID kategorii ticketu są bezpieczne, ograniczone i nadają się do Discorda', () => {
  assert.equal(ticketCategoryKey('Pomoc techniczna!'), 'pomoc-techniczna');
  assert.equal(ticketCategoryKey('  PRAWO_i_zasady  '), 'prawo_i_zasady');
  assert.equal(ticketCategoryKey('żółć & pytanie'.repeat(8)).length, 24);
  assert.equal(ticketCategoryKey('!!!'), '');
});

test('panel ticketów pokazuje menu kategorii, a modal buduje właściwe pytania', () => {
  const panel = { messageId: 'panel-1', title: 'Pomoc', description: 'Wybierz dział' };
  const category = { id: 'tech', name: 'Techniczna', questions: [
    { id:'problem', label:'Co nie działa?', style:'paragraph', required:true, maxLength:800 },
    { id:'device', label:'Urządzenie', style:'short', required:false, maxLength:80 },
  ] };
  const payload = ticketPanelPayload(panel, [category]);
  assert.equal(payload.components[0].components[0].toJSON().type, 3);
  assert.equal(payload.components[0].components[0].options.length, 1);
  const modal = ticketFormModal(panel, category).toJSON();
  assert.equal(modal.custom_id, 'strefa:ticket-pro:submit:panel-1:tech');
  assert.equal(modal.components.length, 2);
  assert.equal(modal.components[0].components[0].custom_id, 'problem');
  assert.equal(modal.components[0].components[0].required, true);
  assert.equal(modal.components[1].components[0].style, 1);
  assert.equal(ticketPanelPayload(panel).components[0].components[0].toJSON().custom_id, 'strefa:ticket-pro:open');
});

test('embed akcji ma role select oraz przyciski działające z trwałymi ID', () => {
  const rows = embedComponents({ messageId:'message-1', actions:[{ id:'help', label:'Otwórz pomoc', type:'ticket' }, { id:'rules', label:'Nadaj rangę', type:'role-add' }], roleOptions:[{ id:'role-1', name:'Gracz' }] });
  assert.equal(rows.length, 2);
  const serialized = rows.map(row => row.toJSON());
  assert.equal(serialized[0].components[0].custom_id, 'strefa:ticket-pro:open');
  assert.equal(serialized[1].components[0].custom_id, 'strefa:embed:roles:message-1');
});

test('rozszerzony edytor embeda udostępnia treść, stopkę i datę w formularzu Discorda', () => {
  const modal = embedAppearanceModal({ id:'draft-1', content:'Wiadomość', footerIcon:'https://example.com/icon.png', timestamp:'2026-11-02T12:00:00Z' }).toJSON();
  assert.equal(modal.custom_id, 'strefa:embed:appearance:draft-1');
  assert.deepEqual(modal.components.map(row => row.components[0].custom_id), ['content','footerIcon','timestamp']);
  assert.equal(modal.components[2].components[0].value, '2026-11-02T12:00:00Z');
});

test('harmonogram powtarza publikacje, ogranicza koniec miesiąca i podstawia zmienne', () => {
  assert.equal(nextScheduledDate('2026-01-31T12:00:00Z','daily'), '2026-02-01T12:00:00.000Z');
  assert.equal(nextScheduledDate('2026-01-31T12:00:00Z','monthly'), '2026-02-28T12:00:00.000Z');
  assert.equal(nextScheduledDate('2026-01-31T12:00:00Z','weekly'), '2026-02-07T12:00:00.000Z');
  const resolved = resolveEmbedVariables({ title:'{server_name}: {user_name}', content:'{user_mention} {channel_name}', createdBy:'u1', createdByName:'Ola', channelName:'ogólny', embeds:[{description:'{bot_name} · {member_count}'}] }, { name:'Strefa', id:'123', memberCount:42 }, { user:{ username:'Bot' } });
  assert.equal(resolved.title, 'Strefa: Ola');
  assert.equal(resolved.content, '<@u1> ogólny');
  assert.equal(resolved.embeds[0].description, 'Bot · 42');
});

test('migracje relacyjne są przyrostowe i nie zawierają resetu ani usuwania danych', async () => {
  const first = await fs.readFile(new URL('../migrations/001_json_documents.sql', import.meta.url), 'utf8');
  const second = await fs.readFile(new URL('../migrations/002_ticket_embed_relations.sql', import.meta.url), 'utf8');
  const db = await fs.readFile(new URL('../src/database.js', import.meta.url), 'utf8');
  const featureStore = await fs.readFile(new URL('../src/feature-store.js', import.meta.url), 'utf8');
  assert.match(first, /CREATE TABLE IF NOT EXISTS strefa_documents/i);
  assert.match(second, /INSERT INTO ticket_records/i);
  assert.match(second, /INSERT INTO ticket_participants/i);
  assert.match(second, /INSERT INTO ticket_events/i);
  assert.match(second, /INSERT INTO ticket_ratings/i);
  assert.match(second, /INSERT INTO embed_versions/i);
  assert.match(second, /DECLARE\s+doc jsonb;\s+item jsonb;\s+setting record;/i);
  assert.match(db, /strefa_schema_migrations/);
  assert.match(db, /syncRelationalFeatures/);
  assert.match(featureStore, /loadDocument\('features', this\.#state\)[\s\S]*?updateDocument\('features', this\.#state/);
  assert.doesNotMatch(`${first}\n${second}`, /\b(DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\b/i);
});
