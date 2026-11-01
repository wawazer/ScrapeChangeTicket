import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { ServiceNowClient } from '../../src/servicenow.js';

async function withMock(html, run) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const client = new ServiceNowClient({ baseUrl: 'http://mock.local', loginUrl: 'http://mock.local/login', headless: true });
    client.browser = browser; client.page = page;
    await page.setContent('<!doctype html><body><iframe name="gsft_main"></iframe></body>');
    const frame = page.frames().find((item) => item.name() === 'gsft_main');
    await frame.setContent(html);
    return await run({ client, frame });
  } finally {
    await browser.close();
  }
}

const listMenu = (expanded, open) => `<!doctype html><body>
  <button id="change_task_control_button" aria-expanded="${expanded}">Settings</button>
  <div id="context_list_titlechange_task" class="context_menu" role="menu" aria-label="List controls" style="display:${open ? 'block' : 'none'}; position:absolute; top:0; left:0; width:200px; background:#fff">
    <div class="context-menu-minwidth" style="width:120px; height:1px; overflow:hidden"></div>
    <div item_id="view" class="context_item" data-context-menu-label="View" aria-expanded="false">View</div>
    <div item_id="b17a69630a0a0bbb00f2601a9fa1e2da" class="context_item" data-context-menu-label="Filters" aria-expanded="false">Filters</div>
  </div>
  <table><thead><tr><th data-field="number">No. Tiket</th></tr></thead><tbody>
    <tr><td><a class="linked formlink" href="/task/CTASK0016976">CTASK0016976</a></td></tr>
  </tbody></table>
  <script>
    const entry = document.querySelector('[data-context-menu-label="Filters"]');
    const control = document.getElementById('change_task_control_button');
    window.controlClicks = 0;
    control.addEventListener('click', () => { window.controlClicks += 1; });
    entry.addEventListener('mouseenter', () => {
      entry.setAttribute('aria-expanded', 'true');
      if (document.getElementById('filters_sub')) return;
      const sub = document.createElement('div');
      sub.id = 'filters_sub'; sub.className = 'context_menu'; sub.setAttribute('role', 'menu'); sub.setAttribute('aria-label', 'Filters');
      sub.style.cssText = 'position:absolute; left:200px; top:0; background:#fff';
      sub.innerHTML = '<div item_id="--personal--" class="context_item">Edit personal filters</div>'
        + '<div item_id="--none--" class="context_item">None</div>'
        + '<div item_id="f1" class="context_item">CTASK SEPTEMBER</div>'
        + '<div item_id="f2" class="context_item">CTASK last month</div>';
      document.body.appendChild(sub);
    });
  </script>
</body>`;

test('filters submenu is read without re-clicking an already open List controls menu', async () => {
  await withMock(listMenu('true', true), async ({ client, frame }) => {
    const filters = await client.openFilters();
    assert.deepEqual(filters.map((item) => item.name), ['CTASK SEPTEMBER', 'CTASK last month']);
    assert.equal(await frame.evaluate(() => window.controlClicks), 0);
  });
});

test('stale aria-expanded does not trigger a click that an open menu would intercept', async () => {
  await withMock(listMenu('false', true), async ({ client, frame }) => {
    const filters = await client.openFilters();
    assert.equal(filters.length, 2);
    assert.equal(await frame.evaluate(() => window.controlClicks), 0);
  });
});

test('a covered List controls button still opens the menu through the DOM fallback', async () => {
  const html = `<!doctype html><body>
    <button id="change_task_control_button" style="position:absolute; top:0; left:0; z-index:1">Settings</button>
    <div id="mask" style="position:absolute; top:0; left:0; width:260px; height:40px; z-index:9; background:rgba(0,0,0,.01)"></div>
    <div id="context_list_titlechange_task" class="context_menu" role="menu" aria-label="List controls" style="display:none; position:absolute; top:120px; left:0; width:200px; background:#fff">
      <div class="context-menu-minwidth" style="width:120px; height:1px; overflow:hidden"></div>
      <div item_id="b17a69630a0a0bbb00f2601a9fa1e2da" class="context_item" data-context-menu-label="Filters">Filters</div>
    </div>
    <table><thead><tr><th data-field="number">No. Tiket</th></tr></thead><tbody>
      <tr><td><a class="linked formlink" href="/task/CTASK0016976">CTASK0016976</a></td></tr>
    </tbody></table>
    <script>
      const entry = document.querySelector('[data-context-menu-label="Filters"]');
      document.getElementById('change_task_control_button').addEventListener('click', () => {
        document.getElementById('context_list_titlechange_task').style.display = 'block';
      });
      entry.addEventListener('mouseenter', () => {
        const sub = document.createElement('div');
        sub.id = 'filters_sub'; sub.className = 'context_menu'; sub.setAttribute('aria-label', 'Filters');
        sub.style.cssText = 'position:absolute; left:200px; top:120px; background:#fff';
        sub.innerHTML = '<div class="context_item">CTASK SEPTEMBER</div>';
        document.body.appendChild(sub);
      });
    </script>
  </body>`;
  await withMock(html, async ({ client }) => {
    const filters = await client.openFilters();
    assert.deepEqual(filters.map((item) => item.name), ['CTASK SEPTEMBER']);
  });
});
