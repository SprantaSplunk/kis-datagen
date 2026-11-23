import { VisualizationAPI } from '@splunk/dashboard-studio-extension';
import { normalizeSearchData } from './data.js';
import { paletteFor } from './theme.js';
import { drawLoadingBadge, drawMessage, easeOutCubic, hitTest, prepareCanvas } from './draw.js';

const FRAME_MS = 1000 / 30;
const TRANSITION_MS = 700;

// Adapter between the Dashboard Extension API and a pure Canvas renderer.
//   toModel(normalized, options) -> { model } | { empty: message } | { error: message }
//   draw(ctx, width, height, model, env) -> hits [{ id, x, y, w, h } | { id, cx, cy, r }, label, tooltip, payload]
//   describe(model) -> accessible summary
//   animated(model, options) -> whether continuous motion is drawn
export function createVisualization(spec) {
    const root = document.getElementById('root') || document.body;
    const stage = document.createElement('div');
    stage.className = 'cs-stage';
    const canvas = document.createElement('canvas');
    canvas.className = 'cs-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', spec.label);
    const layer = document.createElement('div');
    layer.className = 'cs-hits';
    const tooltip = document.createElement('div');
    tooltip.className = 'cs-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    const live = document.createElement('div');
    live.className = 'cs-live';
    live.setAttribute('aria-live', 'polite');
    stage.append(canvas, layer, tooltip, live);
    root.replaceChildren(stage);

    const state = {
        dataSources: {},
        loading: false,
        options: {},
        width: 0,
        height: 0,
        theme: 'dark',
        mode: 'view',
    };
    let model = null;
    let previous = null;
    let changedAt = 0;
    let message = 'Loading data…';
    let errorShown = '';
    let hits = [];
    let hoverId = null;
    let frame = 0;
    let lastFrame = 0;
    let destroyed = false;
    const buttons = new Map();
    const cleanups = [];

    const motionQuery = globalThis.matchMedia ? globalThis.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const reducedMotion = () => Boolean(motionQuery && motionQuery.matches);

    function recompute() {
        const sourceData = state.dataSources?.primary?.data;
        if (!sourceData) {
            if (!state.loading) {
                model = null;
                message = 'No data available';
            }
            return;
        }
        const normalized = normalizeSearchData(sourceData);
        if (!normalized.rows.length) {
            if (!state.loading) {
                model = null;
                message = 'No results in the selected time range';
                clearShownError();
            }
            return;
        }
        let result;
        try {
            result = spec.toModel(normalized, state.options || {});
        } catch (err) {
            result = { error: `Could not read the search results: ${err instanceof Error ? err.message : String(err)}` };
        }
        if (result.error) {
            model = null;
            message = result.error;
            if (errorShown !== result.error) {
                errorShown = result.error;
                VisualizationAPI.setError(result.error);
            }
            return;
        }
        clearShownError();
        if (result.empty) {
            model = null;
            message = result.empty;
            return;
        }
        previous = model;
        model = result.model;
        changedAt = performance.now();
    }

    function clearShownError() {
        if (errorShown) {
            errorShown = '';
            VisualizationAPI.clearError();
        }
    }

    function requestRender() {
        if (destroyed || frame) return;
        frame = requestAnimationFrame(tick);
    }

    function tick(now) {
        frame = 0;
        const moving = needsAnimation(now);
        if (!moving || now - lastFrame >= FRAME_MS - 2) {
            lastFrame = now;
            render(now);
        }
        if (moving && !document.hidden) frame = requestAnimationFrame(tick);
    }

    function needsAnimation(now) {
        if (!model) return state.loading;
        if (reducedMotion()) return false;
        if (now - changedAt < TRANSITION_MS) return true;
        if (state.loading) return true;
        return Boolean(spec.animated && spec.animated(model, state.options || {}));
    }

    function render(now = performance.now()) {
        const { width, height } = state;
        const ctx = prepareCanvas(canvas, width, height);
        if (!ctx) return;
        const palette = paletteFor(state.theme);
        if (!model) {
            hits = [];
            syncButtons();
            drawMessage(ctx, width, height, state.loading ? 'Loading data…' : message, palette);
            if (state.loading) drawLoadingBadge(ctx, width, palette, now);
            canvas.setAttribute('aria-label', `${spec.label}: ${state.loading ? 'loading' : message}`);
            return;
        }
        const still = reducedMotion();
        const progress = still ? 1 : easeOutCubic(Math.min(1, (now - changedAt) / TRANSITION_MS));
        const env = {
            palette,
            theme: state.theme,
            time: still ? 0 : now,
            still,
            progress,
            previous,
            options: state.options || {},
            hoverId,
            mode: state.mode,
        };
        ctx.save();
        hits = spec.draw(ctx, width, height, model, env) || [];
        ctx.restore();
        if (state.loading) drawLoadingBadge(ctx, width, palette, now);
        syncButtons();
        canvas.setAttribute('aria-label', `${spec.label}: ${spec.describe ? spec.describe(model) : ''}`);
    }

    function syncButtons() {
        const seen = new Set();
        for (const hit of hits) {
            if (!hit.payload) continue;
            seen.add(hit.id);
            let button = buttons.get(hit.id);
            if (!button) {
                button = document.createElement('button');
                button.type = 'button';
                button.className = 'cs-hit';
                const id = hit.id;
                button.addEventListener('mouseenter', () => setHover(id));
                button.addEventListener('mouseleave', () => setHover(null));
                button.addEventListener('focus', () => setHover(id, true));
                button.addEventListener('blur', () => setHover(null));
                VisualizationAPI.addDrilldownListener({
                    node: button,
                    action: 'value',
                    payloadCallback: () => {
                        const current = hits.find((item) => item.id === id);
                        return current?.payload || { name: '', value: '' };
                    },
                });
                buttons.set(hit.id, button);
                layer.append(button);
            }
            const box = hit.r
                ? { x: hit.cx - hit.r, y: hit.cy - hit.r, w: hit.r * 2, h: hit.r * 2 }
                : { x: hit.x, y: hit.y, w: hit.w, h: hit.h };
            button.style.transform = `translate(${Math.round(box.x)}px, ${Math.round(box.y)}px)`;
            button.style.width = `${Math.max(8, Math.round(box.w))}px`;
            button.style.height = `${Math.max(8, Math.round(box.h))}px`;
            button.style.borderRadius = hit.r ? '50%' : '8px';
            button.setAttribute('aria-label', hit.label || hit.id);
        }
        for (const [id, button] of buttons) {
            if (!seen.has(id)) {
                button.remove();
                buttons.delete(id);
            }
        }
    }

    function setHover(id, announce = false) {
        hoverId = id;
        const hit = id ? hits.find((item) => item.id === id) : null;
        showTooltip(hit);
        if (announce && hit) live.textContent = hit.label || '';
        requestRender();
    }

    function showTooltip(hit, point) {
        if (!hit || !hit.tooltip || !hit.tooltip.length) {
            tooltip.hidden = true;
            return;
        }
        tooltip.replaceChildren(
            ...hit.tooltip.map((line, index) => {
                const row = document.createElement('div');
                row.className = index === 0 ? 'cs-tooltip-title' : 'cs-tooltip-line';
                row.textContent = String(line);
                return row;
            })
        );
        const palette = paletteFor(state.theme);
        tooltip.style.background = palette.tooltipBg;
        tooltip.style.color = palette.tooltipText;
        tooltip.style.borderColor = palette.panelEdge;
        tooltip.hidden = false;
        const anchorX = point ? point.x : hit.r ? hit.cx : hit.x + hit.w / 2;
        const anchorY = point ? point.y : hit.r ? hit.cy - hit.r : hit.y;
        const tipWidth = tooltip.offsetWidth || 160;
        const tipHeight = tooltip.offsetHeight || 40;
        const left = Math.min(Math.max(4, anchorX - tipWidth / 2), Math.max(4, state.width - tipWidth - 4));
        const top = anchorY - tipHeight - 10 < 4 ? anchorY + 14 : anchorY - tipHeight - 10;
        tooltip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    }

    // tooltips for marks without their own button (e.g. heat cells)
    function onPointerMove(event) {
        const rect = stage.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const hit = hitTest(hits.filter((item) => item.hover), x, y);
        if (hit) showTooltip(hit, { x, y });
        else if (!hoverId) tooltip.hidden = true;
    }
    stage.addEventListener('mousemove', onPointerMove);
    stage.addEventListener('mouseleave', () => {
        if (!hoverId) tooltip.hidden = true;
    });
    cleanups.push(() => stage.removeEventListener('mousemove', onPointerMove));

    const onMotionChange = () => requestRender();
    if (motionQuery && motionQuery.addEventListener) {
        motionQuery.addEventListener('change', onMotionChange);
        cleanups.push(() => motionQuery.removeEventListener('change', onMotionChange));
    }
    const onVisibility = () => requestRender();
    document.addEventListener('visibilitychange', onVisibility);
    cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

    cleanups.push(
        VisualizationAPI.addDataSourcesListener(
            (next) => {
                state.dataSources = next?.dataSources || {};
                state.loading = Boolean(next?.loading);
                recompute();
                requestRender();
            },
            { invokeImmediately: true }
        ),
        VisualizationAPI.addOptionsListener(
            (next) => {
                state.options = next?.options || {};
                recompute();
                requestRender();
            },
            { invokeImmediately: true }
        ),
        VisualizationAPI.addDimensionsListener(
            (next) => {
                state.width = Number(next?.width) || 0;
                state.height = Number(next?.height) || 0;
                requestRender();
            },
            { invokeImmediately: true }
        ),
        VisualizationAPI.addThemeListener(
            (next) => {
                state.theme = next?.theme === 'light' ? 'light' : 'dark';
                stage.dataset.theme = state.theme;
                requestRender();
            },
            { invokeImmediately: true }
        ),
        VisualizationAPI.addModeListener(
            (next) => {
                state.mode = next?.mode === 'edit' ? 'edit' : 'view';
            },
            { invokeImmediately: true }
        )
    );

    function destroy() {
        if (destroyed) return;
        destroyed = true;
        cleanups.splice(0).forEach((cleanup) => {
            if (typeof cleanup === 'function') cleanup();
        });
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        buttons.clear();
        stage.remove();
    }
    window.addEventListener('pagehide', destroy, { once: true });
    cleanups.push(() => window.removeEventListener('pagehide', destroy));
}
