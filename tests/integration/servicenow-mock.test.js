import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { ServiceNowClient } from '../../src/servicenow.js';

async function withMock(html, run, options = {}) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const client = new ServiceNowClient({ baseUrl: 'http://mock.local', loginUrl: 'http://mock.local/login', headless: true, ...options });
    client.browser = browser; client.context = context; client.page = page;
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

test('mock ServiceNow scrapes and caches Change Request data without changing the CTASK page', async () => {
  await withMock('<!doctype html><body>CTASK page</body>', async ({ client }) => {
    const context = client.page.context();
    const originalUrl = client.page.url();
    let listRequests = 0;
    await context.route('**/change_request_list.do?*', async (route) => {
      listRequests += 1;
      await route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><iframe name="gsft_main"></iframe><script>document.querySelector("iframe").srcdoc = \'<a href="/change_request.do?sys_id=1">CHG0004562</a>\'</script>'
      });
    });
    await context.route('**/change_request.do?*', (route) => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><form>
        <button id="viewr.change_request.u_pic_requester" type="button">Preview</button>
        <script>document.querySelector('button').onclick = () => parent.document.body.insertAdjacentHTML('beforeend', '<div><input id="sys_readonly.sys_user.mobile_phone" value="08128467206"><input id="sys_readonly.sys_user.email" value="ARYANTI_WIHARYA@PELINDO.CO.ID"><input id="sys_readonly.sys_user.user_name" value="103047"><input id="sys_readonly.sys_user.employee_number" value="EMPLOYEE"></div>')</script>
        <input id="sys_display.change_request.u_pic_requester" value="CHG Requester">
        <select id="change_request.u_entity"><option value="1" selected>Kantor Pusat</option></select>
        <input name="sys_display.change_request.service_offering" value="Service Offering">
      </form>`
    }));

    const data = await client.scrapeChangeRequest('CHG0004562');
    assert.deepEqual(data, {
      picRequester: 'CHG Requester', entity: 'Kantor Pusat', serviceOffering: 'Service Offering',
      contact: '08128467206', email: 'ARYANTI_WIHARYA@PELINDO.CO.ID', nippNrk: '103047'
    });
    assert.equal(client.page.url(), originalUrl);
    assert.deepEqual(await client.scrapeChangeRequest('chg0004562'), data);
    assert.equal(listRequests, 1);
    assert.equal(client.page.url(), originalUrl);
  });
});

test('mock ServiceNow reads an already open requester popup and falls back to employee number', async () => {
  await withMock('<!doctype html><body>CTASK page</body>', async ({ client }) => {
    const context = client.page.context();
    await context.route('**/change_request_list.do?*', (route) => route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><a href="/change_request.do?sys_id=3">CHG0004564</a>'
    }));
    await context.route('**/change_request.do?*', (route) => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><form>
        <button id="viewr.change_request.u_pic_requester" type="button" onclick="document.getElementById('user-card').remove()">Preview</button>
        <div id="user-card">
          <input id="sys_readonly.sys_user.mobile_phone" value="08128467206">
          <input id="sys_readonly.sys_user.email" value="user@example.com">
          <input id="sys_readonly.sys_user.user_name" value="">
          <input id="sys_readonly.sys_user.employee_number" value="EMP-103047">
        </div>
        <input name="sys_display.change_request.u_pic_requester" value="CHG Requester">
        <select name="change_request.u_entity"><option value="1" selected>Kantor Pusat</option></select>
        <input name="sys_display.change_request.service_offering" value="Service Offering">
      </form>`
    }));

    const data = await client.scrapeChangeRequest('CHG0004564');
    assert.deepEqual(data, {
      picRequester: 'CHG Requester', entity: 'Kantor Pusat', serviceOffering: 'Service Offering',
      contact: '08128467206', email: 'user@example.com', nippNrk: 'EMP-103047'
    });
  });
});

test('mock ServiceNow waits for the requester popup values to be filled asynchronously', async () => {
  await withMock('<!doctype html><body>CTASK page</body>', async ({ client }) => {
    const context = client.page.context();
    await context.route('**/change_request_list.do?*', (route) => route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><a href="/change_request.do?sys_id=5">CHG0004566</a>'
    }));
    await context.route('**/change_request.do?*', (route) => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><form>
        <button id="viewr.change_request.u_pic_requester" type="button">Preview</button>
        <script>
          document.querySelector('button').onclick = () => {
            document.body.insertAdjacentHTML('beforeend', '<div><input id="sys_readonly.sys_user.mobile_phone"><input id="sys_readonly.sys_user.email"><input id="sys_readonly.sys_user.user_name"></div>');
            setTimeout(() => {
              document.getElementById('sys_readonly.sys_user.mobile_phone').setAttribute('value', '081200000000');
              document.getElementById('sys_readonly.sys_user.email').setAttribute('value', 'async@example.com');
              document.getElementById('sys_readonly.sys_user.user_name').setAttribute('value', '103999');
            }, 500);
          };
        </script>
        <input name="sys_display.change_request.u_pic_requester" value="CHG Requester">
        <select name="change_request.u_entity"><option value="1" selected>Kantor Pusat</option></select>
        <input name="sys_display.change_request.service_offering" value="Service Offering">
      </form>`
    }));

    const data = await client.scrapeChangeRequest('CHG0004566');
    assert.deepEqual(data, {
      picRequester: 'CHG Requester', entity: 'Kantor Pusat', serviceOffering: 'Service Offering',
      contact: '081200000000', email: 'async@example.com', nippNrk: '103999'
    });
  });
});

test('mock ServiceNow keeps CHG scraping successful when the requester preview is absent', async () => {
  await withMock('<!doctype html><body>CTASK page</body>', async ({ client }) => {
    const context = client.page.context();
    await context.route('**/change_request_list.do?*', (route) => route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><a href="/change_request.do?sys_id=4">CHG0004565</a>'
    }));
    await context.route('**/change_request.do?*', (route) => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><form>
        <input name="sys_display.change_request.u_pic_requester" value="CHG Requester">
        <select name="change_request.u_entity"><option value="1" selected>Kantor Pusat</option></select>
        <input name="sys_display.change_request.service_offering" value="Service Offering">
      </form>`
    }));

    const data = await client.scrapeChangeRequest('CHG0004565');
    assert.deepEqual(data, {
      picRequester: 'CHG Requester', entity: 'Kantor Pusat', serviceOffering: 'Service Offering',
      contact: '-', email: '-', nippNrk: '-'
    });
  });
});
