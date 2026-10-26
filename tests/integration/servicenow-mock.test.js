import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { ServiceNowClient } from '../../src/servicenow.js';

test('mock ServiceNow supports dynamic filters and multi-page table reads', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const client = new ServiceNowClient({ baseUrl: 'http://mock.local', loginUrl: 'http://mock.local/login', headless: true });
  client.browser = browser; client.page = page;
  await page.setContent('<!doctype html><body><iframe name="gsft_main"></iframe></body>');
  const frame = page.frames().find((item) => item.name() === 'gsft_main');
  await frame.setContent(`<!doctype html><body>
    <button id="change_task_control_button">Settings</button>
    <div item_id="b17a69630a0a0bbb00f2601a9fa1e2da"><div class="context_item">CTASK SEPTEMBER</div><div class="context_item">CTASK last month</div></div>
    <table id="change_task_table"><thead><tr><th>Selector</th><th data-field="number">No. Tiket</th><th>Tipe Task</th></tr></thead><tbody id="body"></tbody></table><button id="next" onclick="nextPage()">Next</button>
    <script>let p=0;const pages=[[['CTASK0016976','Release'],['CTASK0016977','Normal']],[['CTASK0016977','Normal'],['CTASK0016978','Release']]];function render(){body.innerHTML=pages[p].map(x=>'<tr><td>□</td><td><a class="linked formlink" href="/task/'+x[0]+'">'+x[0]+'</a></td><td>'+x[1]+'</td></tr>').join('')}function nextPage(){p=1;render()}render()</script>
  </body>`);
  const filters = await client.openFilters();
  assert.equal(filters.length, 2);
  await client.selectFilter('CTASK SEPTEMBER');
  const all = await client.readAllTickets();
  assert.equal(all.pages, 2);
  assert.deepEqual(all.tickets.map((ticket) => ticket.nomor_tiket), ['CTASK0016976', 'CTASK0016977', 'CTASK0016978']);
  await browser.close();
});
