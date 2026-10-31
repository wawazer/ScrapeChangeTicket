import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { ServiceNowClient } from '../../src/servicenow.js';

async function withMock(html, run, options = {}) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const client = new ServiceNowClient({ baseUrl: 'http://mock.local', loginUrl: 'http://mock.local/login', headless: true, ...options });
    client.browser = browser; client.page = page;
    await page.setContent('<!doctype html><body><iframe name="gsft_main"></iframe></body>');
    const frame = page.frames().find((item) => item.name() === 'gsft_main');
    await frame.setContent(html);
    return await run({ client, frame });
  } finally {
    await browser.close();
  }
}

const listPage = (script) => `<!doctype html><body>
  <button id="change_task_control_button">Settings</button>
  <div item_id="b17a69630a0a0bbb00f2601a9fa1e2da"><div class="context_item">CTASK SEPTEMBER</div><div class="context_item">CTASK last month</div></div>
  <table id="change_task_table"><thead><tr><th>Selector</th><th data-field="number">No. Tiket</th><th>Tipe Task</th></tr></thead><tbody id="body"></tbody></table>
  <span id="pager" class="vcr_page"></span>
  <button name="vcr_next" style="display:none" onclick="p=99;render()">Next</button>
  <button id="list_next" name="vcr_next" onclick="nextPage()">Next</button>
  <button name="vcr_prev" style="display:none" onclick="p=99;render()">Previous</button>
  <button id="list_prev" name="vcr_prev" onclick="prevPage()">Previous</button>
  <script>${script}</script>
</body>`;

test('mock ServiceNow prefers the visible pager and ignores hidden duplicates', async () => {
  await withMock(listPage(`
    const pages = [[['CTASK0016976','Release'],['CTASK0016977','Normal']],[['CTASK0016977','Normal'],['CTASK0016978','Release']],[['CTASK0016978','Release'],['CTASK0016979','Normal']]];
    let p = 2;
    const body = document.getElementById('body'); const pager = document.getElementById('pager');
    const nextButton = document.getElementById('list_next'); const prevButton = document.getElementById('list_prev');
    function render() {
      body.innerHTML = pages[p].map(x => '<tr><td>□</td><td><a class="linked formlink" href="/task/' + x[0] + '">' + x[0] + '</a></td><td>' + x[1] + '</td></tr>').join('');
      pager.textContent = (p + 1) + ' of ' + pages.length;
      nextButton.disabled = p === pages.length - 1; prevButton.disabled = p === 0;
    }
    function nextPage() { if (p < pages.length - 1) { p += 1; render(); } }
    function prevPage() { if (p > 0) { p -= 1; render(); } }
    render();
  `), async ({ client, frame }) => {
    const filters = await client.openFilters();
    assert.equal(filters.length, 2);
    await client.selectFilter('CTASK SEPTEMBER');
    assert.equal((await client.readTablePage()).next, null);
    await client.goToFirstPage();
    const firstPage = await client.readTablePage();
    assert.equal(firstPage.next.visible, true);
    assert.equal(await frame.locator(firstPage.next.selector).count(), 1);
    const all = await client.readAllTickets();
    assert.equal(all.pages, 3);
    assert.deepEqual(all.tickets.map((ticket) => ticket.nomor_tiket), ['CTASK0016976', 'CTASK0016977', 'CTASK0016978', 'CTASK0016979']);
    assert.match(all.tickets[0].href, /\/task\/CTASK0016976$/);
  });
});

test('mock ServiceNow clicks a hidden next button and verifies the page change', async () => {
  await withMock(`<!doctype html><body>
    <table><thead><tr><th data-field="number">No. Tiket</th></tr></thead><tbody id="body"></tbody></table>
    <button id="hidden_next" name="vcr_next" style="display:none" onclick="nextPage()">Next</button>
    <script>
      const pages = [['CTASK0016976'],['CTASK0016977']]; let p = 0;
      const body = document.getElementById('body'); const nextButton = document.getElementById('hidden_next');
      function render() { body.innerHTML = pages[p].map(x => '<tr><td><a class="linked formlink" href="/task/' + x + '">' + x + '</a></td></tr>').join(''); nextButton.disabled = p === pages.length - 1; }
      function nextPage() { if (p < pages.length - 1) { p += 1; render(); } }
      render();
    </script>
  </body>`, async ({ client }) => {
    const all = await client.readAllTickets({ maxPages: 5 });
    assert.equal(all.pages, 2);
    assert.deepEqual(all.tickets.map((ticket) => ticket.nomor_tiket), ['CTASK0016976', 'CTASK0016977']);
  });
});

test('mock ServiceNow stops when the pager does not change the page', async () => {
  await withMock(`<!doctype html><body>
    <table><thead><tr><th data-field="number">No. Tiket</th></tr></thead><tbody>
      <tr><td><a class="linked formlink" href="/task/CTASK0016976">CTASK0016976</a></td></tr>
    </tbody></table>
    <button id="stalled_next" name="vcr_next">Next</button>
  </body>`, async ({ client }) => {
    const all = await client.readAllTickets({ maxPages: 5 });
    assert.equal(all.pages, 1);
    assert.deepEqual(all.tickets.map((ticket) => ticket.nomor_tiket), ['CTASK0016976']);
  }, { pageChangeTimeout: 400 });
});
