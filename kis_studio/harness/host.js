// Outer harness host: owns UI controls and drives the sandboxed extension iframe via postMessage.
const ORIGIN = window.location.origin;
const $ = (id) => document.getElementById(id);
const manifest = await (await fetch('manifest.json')).json();

const host = {
    viz: null,
    config: null,
    fixture: null,
    frame: null,
    events: [],
    state: null,
};

function log(type, payload) {
    host.events.push({ type, payload, at: Date.now() });
    const item = document.createElement('li');
    item.textContent = `${type} ${payload ? JSON.stringify(payload).slice(0, 160) : ''}`;
    $('log').prepend(item);
    $('status').textContent = type;
}

function defaultsFrom(config) {
    const out = {};
    for (const [key, schema] of Object.entries(config?.config?.optionsSchema || {})) {
        if (schema.default !== undefined) out[key] = schema.default;
    }
    return out;
}

function primaryData() {
    if ($('nodata').checked) return {};
    if ($('empty').checked) {
        const fields = host.state.data?.fields || [];
        return { primary: { data: { fields, columns: fields.map(() => []) } } };
    }
    return { primary: { data: host.state.data } };
}

function send(kind, value) {
    host.frame?.contentWindow?.postMessage({ __source: 'cs_host', type: 'state', payload: { kind, value } }, ORIGIN);
}

function pushData() {
    send('dataSources', { loading: $('loading').checked, dataSources: primaryData() });
}

function pushAll() {
    pushData();
    send('options', { options: host.state.options });
    send('dimensions', { width: host.state.width, height: host.state.height });
    send('theme', { theme: host.state.theme });
    send('mode', { mode: host.state.mode });
}

function mountFrame() {
    $('frameBox').replaceChildren();
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    frame.title = `${host.viz.label} preview`;
    frame.width = host.state.width;
    frame.height = host.state.height;
    frame.src = 'frame.html';
    host.frame = frame;
    $('frameBox').append(frame);
}

window.addEventListener('message', (event) => {
    if (event.origin !== ORIGIN || event.source !== host.frame?.contentWindow) return;
    const message = event.data;
    if (!message || message.__source !== 'cs_frame') return;
    if (message.type === 'frame') {
        host.frame.contentWindow.postMessage(
            {
                __source: 'cs_host',
                type: 'load',
                payload: {
                    bundle: host.viz.bundle,
                    initial: {
                        dataSources: { loading: $('loading').checked, dataSources: primaryData() },
                        options: { options: host.state.options },
                        dimensions: { width: host.state.width, height: host.state.height },
                        theme: { theme: host.state.theme },
                        mode: { mode: host.state.mode },
                    },
                },
            },
            ORIGIN
        );
        return;
    }
    if (message.type === 'subscribe' || message.type === 'unsubscribe') return;
    log(message.type, message.payload);
});

function renderOptions() {
    const box = $('options');
    box.replaceChildren();
    const schema = host.config?.config?.optionsSchema || {};
    for (const group of host.config?.config?.editorConfig || []) {
        for (const line of group.layout) {
            for (const entry of line) {
                const key = entry.option;
                const spec = schema[key] || {};
                const label = document.createElement('label');
                label.textContent = `${entry.label} `;
                let input;
                if (entry.editor === 'editor.checkbox') {
                    input = document.createElement('input');
                    input.type = 'checkbox';
                    input.checked = Boolean(host.state.options[key]);
                    input.addEventListener('change', () => setOption(key, input.checked));
                } else if (entry.editor === 'editor.select') {
                    input = document.createElement('select');
                    for (const choice of entry.editorProps?.values || []) {
                        const option = document.createElement('option');
                        option.value = choice.value;
                        option.textContent = choice.label;
                        input.append(option);
                    }
                    input.value = host.state.options[key];
                    input.addEventListener('change', () => setOption(key, input.value));
                } else {
                    input = document.createElement('input');
                    input.type = entry.editor === 'editor.number' ? 'number' : entry.editor === 'editor.color' ? 'color' : 'text';
                    input.value = host.state.options[key] ?? '';
                    input.addEventListener('change', () =>
                        setOption(key, spec.type === 'number' ? Number(input.value) : input.value)
                    );
                }
                label.append(input);
                box.append(label);
            }
        }
    }
}

function renderDataControls() {
    const box = $('dataControls');
    box.replaceChildren();
    for (const control of host.fixture?.dataControls || []) {
        const fields = (host.state.data.fields || []).map((field) => field.name || field);
        const column = fields.indexOf(control.field);
        if (column < 0) continue;
        const rows = host.state.data.columns[column];
        const index = control.row === 'last' || control.row === undefined ? rows.length - 1 : control.row === 'first' ? 0 : Number(control.row);
        const label = document.createElement('label');
        label.textContent = `${control.label} `;
        const input = document.createElement('input');
        input.type = 'range';
        input.min = control.min ?? 0;
        input.max = control.max ?? 100;
        input.step = control.step ?? 1;
        input.value = rows[index];
        input.addEventListener('input', () => {
            rows[index] = String(input.value);
            $('data').value = JSON.stringify(host.state.data, null, 1);
            pushData();
        });
        label.append(input);
        box.append(label);
    }
}

function setOption(key, value) {
    host.state.options = { ...host.state.options, [key]: value };
    send('options', { options: host.state.options });
}

async function selectViz(id) {
    host.viz = manifest.visualizations.find((item) => item.id === id) || manifest.visualizations[0];
    host.config = await (await fetch(host.viz.config)).json();
    host.fixture = await (await fetch(host.viz.harness)).json();
    const size = host.config.config.size || {};
    host.state = {
        data: structuredClone(host.fixture.dataSources.primary.data),
        options: defaultsFrom(host.config),
        width: Number($('width').value) || size.initialWidth || 600,
        height: Number($('height').value) || size.initialHeight || 400,
        theme: document.body.classList.contains('light') ? 'light' : 'dark',
        mode: $('mode').value,
    };
    $('data').value = JSON.stringify(host.state.data, null, 1);
    renderOptions();
    renderDataControls();
    mountFrame();
}

for (const item of manifest.visualizations) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.label;
    $('viz').append(option);
}
$('viz').addEventListener('change', () => selectViz($('viz').value));
$('reload').addEventListener('click', () => mountFrame());
$('reset').addEventListener('click', () => selectViz(host.viz.id));
for (const id of ['loading', 'nodata', 'empty']) $(id).addEventListener('change', pushData);
$('applyData').addEventListener('click', () => {
    host.state.data = JSON.parse($('data').value);
    pushData();
});
for (const id of ['width', 'height']) {
    $(id).addEventListener('change', () => {
        host.state.width = Number($('width').value);
        host.state.height = Number($('height').value);
        host.frame.width = host.state.width;
        host.frame.height = host.state.height;
        send('dimensions', { width: host.state.width, height: host.state.height });
    });
}
$('mode').addEventListener('change', () => {
    host.state.mode = $('mode').value;
    send('mode', { mode: host.state.mode });
});
$('theme').addEventListener('click', () => {
    document.body.classList.toggle('light');
    host.state.theme = document.body.classList.contains('light') ? 'light' : 'dark';
    $('theme').textContent = host.state.theme === 'light' ? '☀' : '☾';
    send('theme', { theme: host.state.theme });
});

// automation hooks for the headless checks
window.harness = {
    select: (id) => selectViz(id),
    events: () => host.events,
    clearEvents: () => { host.events = []; },
    setData: (data) => { host.state.data = data; pushData(); },
    setFlags: (flags) => {
        for (const [key, value] of Object.entries(flags)) $(key).checked = value;
        pushData();
    },
    setOptions: (options) => { host.state.options = { ...host.state.options, ...options }; send('options', { options: host.state.options }); },
    setSize: (width, height) => {
        host.state.width = width;
        host.state.height = height;
        host.frame.width = width;
        host.frame.height = height;
        send('dimensions', { width, height });
    },
    setTheme: (theme) => {
        document.body.classList.toggle('light', theme === 'light');
        host.state.theme = theme;
        send('theme', { theme });
    },
    setMode: (mode) => { host.state.mode = mode; send('mode', { mode }); },
    reload: () => mountFrame(),
    pushAll,
    frame: () => host.frame,
};

const initial = new URLSearchParams(window.location.search).get('viz');
await selectViz(initial || manifest.visualizations[0].id);
