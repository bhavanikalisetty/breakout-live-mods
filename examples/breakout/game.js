/*
    Little JS Breakout Game
    - A simple breakout game
    - Includes sound and particles
    - Uses a post processing effect
    - Control with mouse, touch, or gamepad
    - Live mods: bounded multiball and one allowlisted active rule
*/

'use strict';

// import LittleJS module
import * as LJS from '../../dist/littlejs.esm.js';
import * as GameObjects from './gameObjects.js';
import { EFFECT_LABELS, MAX_BALLS, PADDLE_MAX_WIDTH, PADDLE_MIN_WIDTH, PADDLE_WIDEN_STEP, describeRule, shouldFire, validateRule, validateSprite } from './rules.mjs';
import { initModUI } from './ui.js';
const {vec2, hsl} = LJS;

///////////////////////////////////////////////////////////////////////////////
// game objects
export let balls = [], score, brickCount, paddle;
export const levelSize = vec2(38, 20);
export let activeRule = null;
export let activeSprite = null;
export let bricksSinceRule = 0;
export let boardReady = false;
export let lastEvent = 'No rule has fired yet.';
let pendingSplits = [];
let ui = null;

export function changeBrickCount(delta)
{
    brickCount += delta;
    if (delta < 0)
        score -= delta;
}

export function setActiveRule(input)
{
    const result = validateRule(input);
    if (!result.ok)
    {
        setEvent(`Invalid rule kept previous rule: ${result.error}`);
        return result;
    }
    activeRule = result.rule;
    bricksSinceRule = 0;
    setEvent(`Rule armed: ${describeRule(activeRule)}`);
    refreshUI();
    return result;
}

export function clearActiveRule()
{
    activeRule = null;
    bricksSinceRule = 0;
    setEvent('Rule cleared. No rule is active.');
    refreshUI();
}

export function setActiveSprite(input)
{
    const result = validateSprite(input);
    if (!result.ok)
    {
        setEvent(`Invalid sprite kept previous look: ${result.error}`);
        return result;
    }
    activeSprite = result.sprite;
    setEvent(`Ball reskin armed: ${activeSprite.label}`);
    refreshUI();
    return result;
}

export function clearActiveSprite()
{
    activeSprite = null;
    setEvent('Ball restored to original look.');
    refreshUI();
}

export function setEvent(message)
{
    lastEvent = message;
    ui?.setEvent(message);
}

function refreshUI()
{
    ui?.refresh({ activeRule, activeSprite, balls: balls.length, bricksSinceRule });
}

export function handleBrickDestroyed(brick, ball)
{
    bricksSinceRule++;
    if (!activeRule || !shouldFire(activeRule, { isPurple: brick.isPurple, bricksSinceRule }))
        return;
    const effect = activeRule.effect;
    if (effect === 'split_ball')
    {
        if (balls.length + pendingSplits.length >= MAX_BALLS)
        {
            setEvent(`Rule fired: ${EFFECT_LABELS.split_ball} skipped, already at ${MAX_BALLS} balls.`);
            return;
        }
        if (!ball?.velocity) return;
        pendingSplits.push({ pos: ball.pos.copy(), velocity: ball.velocity.copy() });
        setEvent(`Rule fired: ${EFFECT_LABELS.split_ball} queued a new ball.`);
    }
    else if (effect === 'widen_paddle')
    {
        const before = paddle.size.x;
        paddle.size.x = LJS.clamp(before + PADDLE_WIDEN_STEP, PADDLE_MIN_WIDTH, PADDLE_MAX_WIDTH);
        setEvent(`Rule fired: ${EFFECT_LABELS.widen_paddle} ${before} to ${paddle.size.x}.`);
    }
    else if (effect === 'slow_ball')
    {
        for (const b of balls)
        {
            b.velocity = b.velocity.scale(.75);
            if (b.getSpeed() < .05)
                b.velocity = b.velocity.normalize(.05);
        }
        setEvent(`Rule fired: ${EFFECT_LABELS.slow_ball} slowed every ball.`);
    }
    refreshUI();
}

///////////////////////////////////////////////////////////////////////////////
function gameReset()
{
    boardReady = false;
    LJS.engineObjectsDestroy();
    pendingSplits = [];
    balls = [];
    score = 0;
    brickCount = 0;
    bricksSinceRule = 0;

    const pos = vec2();
    for (pos.x = 4; pos.x <= levelSize.x-4; pos.x += 2)
    for (pos.y = 12; pos.y <= levelSize.y-2; pos.y += 1)
        new GameObjects.Brick(pos);

    new GameObjects.Wall(vec2(-.5,levelSize.y/2),            vec2(1,100));
    new GameObjects.Wall(vec2(levelSize.x+.5,levelSize.y/2), vec2(1,100));
    new GameObjects.Wall(vec2(levelSize.x/2,levelSize.y+.5), vec2(100,1));

    paddle = new GameObjects.Paddle(vec2(levelSize.x/2-12, 1));
    boardReady = true;
    setEvent(activeRule ? `Board reset. Rule still active: ${describeRule(activeRule)}` : 'Board reset. No rule is active.');
    refreshUI();
}

///////////////////////////////////////////////////////////////////////////////
function pointerOnGame()
{
    const s = LJS.mousePosScreen;
    return s.x >= 0 && s.x <= LJS.mainCanvasSize.x && s.y >= 0 && s.y <= LJS.mainCanvasSize.y;
}

function isTyping()
{
    const el = document.activeElement;
    return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable));
}

function gameInit()
{
    LJS.setCanvasFixedSize(vec2(1920, 1080));
    LJS.setCameraPos(levelSize.scale(.5));
    LJS.setCameraScale(48);
    setupPostProcess();
    ui = initModUI({ setActiveRule, clearActiveRule, setActiveSprite, clearActiveSprite, describeRule });
    gameReset();
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdate()
{
    // process splits queued by the previous frame's brick collision callback
    if (boardReady && pendingSplits.length)
    {
        const queued = pendingSplits;
        pendingSplits = [];
        for (const split of queued)
        {
            if (balls.length >= MAX_BALLS) continue;
            const ball = new GameObjects.Ball(split.pos);
            ball.velocity = split.velocity.rotate(.5);
            balls.push(ball);
        }
        refreshUI();
    }

    if (!balls.length && brickCount > 0 && !isTyping() && (LJS.mouseWasPressed(0) || LJS.gamepadWasPressed(0)))
    {
        if (LJS.mouseWasPressed(0) && !pointerOnGame()) { /* click was on the sidebar */ }
        else if (boardReady)
        {
            const ball = new GameObjects.Ball(vec2(levelSize.x/2, levelSize.y/2));
            balls.push(ball);
            refreshUI();
        }
    }

    let lostBall = false;
    for (let i = balls.length - 1; i >= 0; i--)
    {
        if (balls[i].pos.y < -1)
        {
            balls[i].destroy();
            balls.splice(i, 1);
            lostBall = true;
        }
    }
    if (lostBall) refreshUI();

    if (!isTyping() && LJS.keyWasPressed('KeyR'))
        gameReset();
}

///////////////////////////////////////////////////////////////////////////////
function gameUpdatePost() {}

function gameRender()
{
    LJS.drawRect(LJS.cameraPos, levelSize.scale(2), hsl(0,0,.5));
    LJS.drawRect(LJS.cameraPos, levelSize, hsl(0,0,.02));
}

function gameRenderPost()
{
    const font = LJS.engineImageFont;
    font.drawText('Score: ' + score, LJS.cameraPos.add(vec2(0,9.2)), 1);
    if (!brickCount)
        font.drawText('You Win!', LJS.cameraPos.add(vec2(0,-5)), 2);
    else if (!balls.length)
        font.drawText('Click to Play', LJS.cameraPos.add(vec2(0,-5)), 2);
}

function setupPostProcess()
{
    const tv = LJS.postProcessTV({scanlines: .6});
    new LJS.PostProcessPlugin(LJS.postProcessEffects(tv));
}

///////////////////////////////////////////////////////////////////////////////
// Startup LittleJS Engine. The canvas lives in the dedicated stage div.
const stage = document.getElementById('stage');
LJS.engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, ['tiles.png'], stage);
