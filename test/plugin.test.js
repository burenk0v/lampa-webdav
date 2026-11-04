const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createJQuery(registered) {
  const isMenu = selector => selector === '.menu .menu__list';
  return function (selector) {
    return {
      length: 1,
      eq() { return this; },
      append() { if (isMenu(selector)) registered.menuItems++; return this; },
      on() { return this; },
      text() { return this; },
      empty() { return this; },
      remove() { return this; }
    };
  };
}

function createContext() {
  const registered = { components: {}, menuItems: 0, settings: [], params: [] };
  const lampa = {
    Storage: { field(name) { return name === 'lampa_dlna_port' ? '8200' : ''; }, set() {} },
    Component: {
      get(name) { return registered.components[name]; },
      add(name, component) { registered.components[name] = component; }
    },
    Activity: { push() {} },
    SettingsApi: {
      addComponent(value) { registered.settings.push(value); },
      addParam(value) { registered.params.push(value); }
    },
    Listener: { follow() {} }
  };
  const jquery = createJQuery(registered);
  const context = { console, URL, window: null, Lampa: lampa, jQuery: jquery, $: jquery, appready: true };
  context.window = context;
  context.Lampa = lampa;
  context.LampaDLNACore = {
    normalizeAddress(value) { if (!value) throw new Error('missing address'); return value; },
    normalizePort(value) { if (!value) throw new Error('missing port'); return Number(value); },
    serverUrl() { return 'http://192.168.1.1:8200/'; }
  };
  context.LampaDLNAClient = { DLNAClient: function () { this.list = function () { return { abort() {} }; }; } };
  return { context, registered };
}

test('built plugin registers DLNA settings, menu and browser', () => {
  const { context, registered } = createContext();
  vm.runInNewContext(fs.readFileSync('dist/lampa-webdav.js', 'utf8'), context);
  assert.equal(typeof registered.components.lampa_dlna_browser, 'function');
  assert.equal(registered.menuItems, 1);
  assert.equal(registered.settings.length, 1);
  assert.equal(registered.settings[0].component, 'lampa_dlna');
  assert.equal(registered.params.length, 2);
  assert.deepEqual(registered.params.map(item => item.param.name), ['lampa_dlna_address', 'lampa_dlna_port']);
  assert.ok(registered.params.every(item => item.param.type === 'input' && item.param.values === ''));
  assert.equal(registered.params[1].param.default, '8200');
  const component = new registered.components.lampa_dlna_browser({});
  assert.doesNotThrow(() => component.create());
  assert.equal(typeof component.render, 'function');
  assert.equal(typeof component.start, 'function');
  assert.equal(typeof component.pause, 'function');
  assert.equal(typeof component.stop, 'function');
  assert.doesNotThrow(() => component.start());
});

test('built plugin is guarded against duplicate initialization', () => {
  const { context, registered } = createContext();
  const source = fs.readFileSync('dist/lampa-webdav.js', 'utf8');
  vm.runInNewContext(source, context);
  vm.runInNewContext(source, context);
  assert.equal(registered.menuItems, 1);
});
