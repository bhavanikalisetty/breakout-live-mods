// Shared allowlisted game rules and sprite validation.
// Imported by the browser game, the Node server, and the Node test.
// No arbitrary code is ever created from these values.

export const MAX_BALLS = 6;
export const PADDLE_MIN_WIDTH = 5;
export const PADDLE_MAX_WIDTH = 10;
export const PADDLE_WIDEN_STEP = 1;
export const EVERY_N_MIN = 2;
export const EVERY_N_MAX = 20;

export const TRIGGERS = ['purple_brick', 'any_brick', 'every_n_bricks'];
export const EFFECTS = ['split_ball', 'widen_paddle', 'slow_ball'];
export const EFFECT_LABELS = { split_ball: 'Split ball', widen_paddle: 'Widen paddle', slow_ball: 'Slow ball' };
export const TRIGGER_LABELS = { purple_brick: 'a purple brick', any_brick: 'any brick', every_n_bricks: 'every N bricks' };
export const SPRITE_CHARS = '.PWGROB';
export const SPRITE_COLORS = {
    P: [0.78, 0.9, 0.55],
    W: [0, 0, 0.95],
    G: [0.33, 0.8, 0.45],
    R: [0, 0.9, 0.55],
    O: [0.08, 1, 0.55],
    B: [0, 0, 0.08],
};

export function validateRule(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        return { ok: false, error: 'Rule must be an object.' };
    const { trigger, effect } = input;
    if (!TRIGGERS.includes(trigger))
        return { ok: false, error: `Unsupported trigger: ${String(trigger)}.` };
    if (!EFFECTS.includes(effect))
        return { ok: false, error: `Unsupported effect: ${String(effect)}.` };
    let n = null;
    if (trigger === 'every_n_bricks') {
        n = input.n;
        if (!Number.isInteger(n) || n < EVERY_N_MIN || n > EVERY_N_MAX)
            return { ok: false, error: `n must be an integer from ${EVERY_N_MIN} to ${EVERY_N_MAX}.` };
    }
    return { ok: true, rule: { trigger, effect, n } };
}

export function validateSprite(input) {
    const sprite = input?.sprite;
    const label = typeof input?.label === 'string' ? input.label.trim() : '';
    if (!Array.isArray(sprite) || sprite.length !== 8)
        return { ok: false, error: 'Sprite must contain exactly eight strings.' };
    let filled = 0;
    for (const row of sprite) {
        if (typeof row !== 'string' || row.length !== 8)
            return { ok: false, error: 'Each sprite row must be exactly eight characters.' };
        for (const ch of row) {
            if (!SPRITE_CHARS.includes(ch))
                return { ok: false, error: `Sprite contains invalid character: ${ch}.` };
            if (ch !== '.') filled++;
        }
    }
    if (!filled)
        return { ok: false, error: 'Sprite must not be empty.' };
    if (!label || label.length > 40)
        return { ok: false, error: 'Sprite label must be 1 to 40 characters.' };
    return { ok: true, sprite: { sprite: [...sprite], label } };
}

export function validateModResponse(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        return { ok: false, error: 'Model response must be a JSON object.' };
    if (input.supported === false || input.kind === 'unsupported')
        return { ok: true, kind: 'unsupported', message: typeof input.message === 'string' && input.message ? input.message : 'Unsupported request.' };
    if (input.kind === 'rule') {
        const result = validateRule(input);
        if (!result.ok) return result;
        return { ok: true, kind: 'rule', rule: result.rule };
    }
    if (input.kind === 'sprite') {
        const result = validateSprite(input);
        if (!result.ok) return result;
        return { ok: true, kind: 'sprite', sprite: result.sprite };
    }
    return { ok: false, error: 'Model response kind must be rule, sprite, or unsupported.' };
}

export function shouldFire(rule, { isPurple = false, bricksSinceRule = 0 } = {}) {
    if (!rule) return false;
    if (rule.trigger === 'purple_brick') return Boolean(isPurple);
    if (rule.trigger === 'any_brick') return true;
    if (rule.trigger === 'every_n_bricks')
        return Number.isInteger(rule.n) && bricksSinceRule > 0 && bricksSinceRule % rule.n === 0;
    return false;
}

export function describeRule(rule) {
    if (!rule) return 'No rule active.';
    const effect = EFFECT_LABELS[rule.effect] || rule.effect;
    if (rule.trigger === 'purple_brick') return `When I break a purple brick: ${effect}.`;
    if (rule.trigger === 'any_brick') return `On any brick: ${effect}.`;
    return `Every ${rule.n} bricks: ${effect}.`;
}
