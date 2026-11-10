import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateModResponse, validateRule, validateSprite, shouldFire } from './rules.mjs';

test('rule validation accepts only allowlisted triggers and effects', () => {
    assert.equal(validateRule({ trigger: 'purple_brick', effect: 'split_ball' }).ok, true);
    assert.equal(validateRule({ trigger: 'purple_brick', effect: 'explode' }).ok, false);
    assert.equal(validateRule({ trigger: 'every_n_bricks', effect: 'widen_paddle', n: 5 }).ok, true);
    assert.equal(validateRule({ trigger: 'every_n_bricks', effect: 'widen_paddle', n: 1 }).ok, false);
    assert.equal(validateRule({ trigger: 'every_n_bricks', effect: 'widen_paddle', n: 21 }).ok, false);
});

test('every_n fires only on the nth brick', () => {
    const rule = { trigger: 'every_n_bricks', effect: 'widen_paddle', n: 5 };
    assert.equal(shouldFire(rule, { bricksSinceRule: 4 }), false);
    assert.equal(shouldFire(rule, { bricksSinceRule: 5 }), true);
    assert.equal(shouldFire({ trigger: 'purple_brick', effect: 'split_ball' }, { isPurple: true }), true);
    assert.equal(shouldFire({ trigger: 'purple_brick', effect: 'split_ball' }, { isPurple: false }), false);
});

test('sprite validation requires an exact non-empty 8x8 grid', () => {
    const good = Array(8).fill('..PP....');
    assert.equal(validateSprite({ sprite: good, label: 'joker' }).ok, true);
    assert.equal(validateSprite({ sprite: Array(8).fill('........'), label: 'empty' }).ok, false);
    assert.equal(validateSprite({ sprite: Array(7).fill('..PP....'), label: 'short' }).ok, false);
    assert.equal(validateSprite({ sprite: Array(8).fill('..PX....'), label: 'bad char' }).ok, false);
});

test('mod response kinds are separate and unsupported is explicit', () => {
    assert.equal(validateModResponse({ kind: 'unsupported', supported: false, message: 'no' }).kind, 'unsupported');
    assert.equal(validateModResponse({ kind: 'rule', trigger: 'any_brick', effect: 'slow_ball' }).ok, true);
    assert.equal(validateModResponse({ kind: 'rule', trigger: 'any_brick', effect: 'fly' }).ok, false);
});
