// Mod console UI. Talks to the game only through the callbacks from game.js.
import { SPRITE_COLORS } from './rules.mjs';

function fmtCost(cost) {
    return typeof cost === 'number' && Number.isFinite(cost) ? `$${cost.toFixed(6)}` : 'not reported';
}
function fmtElapsed(elapsedMs) {
    return typeof elapsedMs === 'number' && Number.isFinite(elapsedMs) ? `${(elapsedMs / 1000).toFixed(2)}s` : 'not reported';
}

export function initModUI(callbacks) {
    const $ = (id) => document.getElementById(id);
    const form = $('mod-form'), input = $('mod-input'), applyBtn = $('apply-btn');
    const statusEl = $('mod-status'), activeEl = $('active-rule'), eventEl = $('event-feedback'), costEl = $('cost'), spriteEl = $('sprite-preview'), spriteLabel = $('sprite-label'), ballCountEl = $('ball-count'), clearBtn = $('clear-btn');
    const quickBtns = [...document.querySelectorAll('[data-example]')];
    let inFlight = false;
    let lastPatchCost = null, lastCumulativeCost = null;
    function renderReceipt(elapsedMs) {
        costEl.textContent = `This patch: ${fmtCost(lastPatchCost)} | Session total: ${fmtCost(lastCumulativeCost)} | Elapsed: ${fmtElapsed(elapsedMs)}`;
    }
    function setBusy(busy) {
        inFlight = busy;
        applyBtn.disabled = busy;
        clearBtn.disabled = busy;
        quickBtns.forEach((btn) => btn.disabled = busy);
    }

    function setStatus(text, isError = false) {
        statusEl.textContent = text;
        statusEl.classList.toggle('error', isError);
    }
    function setEvent(text) { eventEl.textContent = text; }
    function drawSprite(sprite) {
        const ctx = spriteEl.getContext('2d');
        ctx.clearRect(0, 0, spriteEl.width, spriteEl.height);
        ctx.fillStyle = '#241a3a';
        ctx.fillRect(0, 0, spriteEl.width, spriteEl.height);
        if (!sprite) { spriteLabel.textContent = 'Original ball look'; return; }
        const cell = spriteEl.width / 8;
        sprite.sprite.forEach((row, y) => {
            [...row].forEach((ch, x) => {
                if (ch === '.') return;
                const [h, s, l] = SPRITE_COLORS[ch];
                ctx.fillStyle = `hsl(${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
                ctx.fillRect(x * cell, y * cell, cell, cell);
            });
        });
        spriteLabel.textContent = sprite.label;
    }
    function refresh(state) {
        activeEl.textContent = state.activeRule ? callbacks.describeRule(state.activeRule) : 'No rule active.';
        if (ballCountEl) ballCountEl.textContent = `${state.balls ?? 0} ball${(state.balls ?? 0) === 1 ? '' : 's'}`;
        drawSprite(state.activeSprite);
    }
    async function apply(prompt) {
        if (inFlight) return;
        const text = (prompt ?? input.value).trim();
        if (!text) { setStatus('Type a mod request first.', true); return; }
        setBusy(true);
        setStatus('Asking Muse Ember...');
        const startedAt = performance.now();
        try {
            const res = await fetch('/api/mod', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: text }),
            });
            const data = await res.json().catch(() => ({}));
            const elapsedMs = performance.now() - startedAt;
            if (typeof data.cost === 'number' && Number.isFinite(data.cost)) lastPatchCost = data.cost;
            else lastPatchCost = null;
            if (typeof data.cumulativeCost === 'number' && Number.isFinite(data.cumulativeCost)) lastCumulativeCost = data.cumulativeCost;
            renderReceipt(elapsedMs);
            if (!res.ok) { setStatus(data.error || 'Mod request failed.', true); return; }
            if (data.kind === 'rule') {
                const result = callbacks.setActiveRule(data.rule);
                setStatus(result.ok ? 'Rule armed immediately.' : result.error, !result.ok);
            } else if (data.kind === 'sprite') {
                const result = callbacks.setActiveSprite({ sprite: data.sprite, label: data.label });
                setStatus(result.ok ? 'Ball reskin armed.' : result.error, !result.ok);
            } else if (data.kind === 'unsupported') {
                setStatus(`Unsupported: ${data.message || 'That request is not supported.'} Previous rule and look kept.`, true);
            } else {
                setStatus('Unexpected response. Previous rule and look kept.', true);
            }
        } catch {
            lastPatchCost = null;
            renderReceipt(performance.now() - startedAt);
            setStatus('Could not reach the mod server.', true);
        } finally {
            setBusy(false);
        }
    }

    form.addEventListener('submit', (e) => { e.preventDefault(); apply(); });
    quickBtns.forEach((btn) => {
        btn.addEventListener('click', () => { input.value = btn.dataset.example; input.focus(); apply(btn.dataset.example); });
    });
    clearBtn.addEventListener('click', () => {
        if (inFlight) return;
        callbacks.clearActiveRule();
        callbacks.clearActiveSprite();
        setStatus('Cleared. Original ball look restored and no rule is active.');
    });

    setStatus('Ready.');
    return { setStatus, setEvent, refresh };
}
