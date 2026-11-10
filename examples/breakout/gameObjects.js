/*
    LittleJS Breakout Objects
*/

'use strict';

import * as LJS from '../../dist/littlejs.esm.js';
import * as Game from './game.js';
import { SPRITE_COLORS } from './rules.mjs';
const {tile, vec2, hsl} = LJS;

///////////////////////////////////////////////////////////////////////////////
const sound_start  = new LJS.Sound([,0,500,,.04,.3,1,2,,,570,.02,.02,,,,.04]);
const sound_break  = new LJS.Sound([,,90,,.01,.03,4,,,,,,,9,50,.2,,.2,.01]);
const sound_bounce = new LJS.Sound([,,1e3,,.03,.02,1,2,,,940,.03,,,,,.2,.6,,.06]);

///////////////////////////////////////////////////////////////////////////////
export class PhysicsObject extends LJS.EngineObject
{
    constructor(pos, size, tileInfo, angle, color)
    {
        super(pos, size, tileInfo, angle, color);
        this.setCollision();
        this.mass = 0;
    }
}

///////////////////////////////////////////////////////////////////////////////
export class Wall extends PhysicsObject
{
    constructor(pos, size)
    {
        super(pos, size, 0, 0, hsl(0,0,0,0));
    }
}

///////////////////////////////////////////////////////////////////////////////
export class Paddle extends PhysicsObject
{
    constructor(pos)
    {
        super(pos, vec2(5,.5));
    }
    update()
    {
        this.pos.x = LJS.isUsingGamepad ? this.pos.x + LJS.gamepadStick(0).x : LJS.mousePos.x;
        this.pos.x = LJS.clamp(this.pos.x, this.size.x/2, Game.levelSize.x - this.size.x/2);
    }
}

///////////////////////////////////////////////////////////////////////////////
export class Brick extends PhysicsObject
{
    constructor(pos)
    {
        // deterministic purple bricks: a fixed grid pattern, clearly visible
        const col = Math.round((pos.x - 4) / 2);
        const row = Math.round(pos.y - 12);
        const isPurple = (col * 3 + row) % 5 === 0 || (row === 0 && (col === 7 || col === 8));
        const hues = [.02, .10, .17, .34, .49, .57];
        const color = isPurple ? hsl(.78, .9, .55) : hsl(hues[(col + row * 2) % hues.length], .86, .52);
        super(pos, vec2(2,1), tile(1, vec2(32,16)), 0, color);
        this.isPurple = isPurple;
        Game.changeBrickCount(1);
    }

    collideWithObject(o)
    {
        if (this.destroyed) return 0;
        this.destroy();
        Game.changeBrickCount(-1);
        Game.handleBrickDestroyed(this, o);
        sound_break.play(this.pos);
        const color1 = this.color;
        const color2 = color1.lerp(hsl(), .5);
        new LJS.ParticleEmitter(
            this.pos, 0,
            this.size, .1, 200, 3.14,
            tile(0, 16),
            color1, color2,
            color1.scale(1,0), color2.scale(1,0),
            .3, .8, .3, .05, .05,
            .99, .95, .4, 3.14,
            .1, .8, 0, 1
        );
        if (o.trailEffect)
        {
            o.trailEffect.colorStartA = this.color;
            o.trailEffect.colorStartB = this.color.lerp(hsl(), .5);
        }
        return 1;
    }
}

///////////////////////////////////////////////////////////////////////////////
export class Ball extends PhysicsObject
{
    constructor(pos)
    {
        super(pos, vec2(.5), tile(0));
        this.velocity = vec2(0, -.1);
        this.restitution = 1;
        this.mass = 1;
        const color = hsl(0,0,.2);
        this.trailEffect = new LJS.ParticleEmitter(
            this.pos, 0,
            this.size, 0, 80, 3.14,
            tile(0, 16),
            color, color,
            color.scale(0), color.scale(0),
            2, .4, 1, .001, .05,
            .99, .95, 0, 3.14,
            .1, .5, 0, 1
        );
        this.addChild(this.trailEffect);
        sound_start.play(this.pos);
    }

    render()
    {
        super.render();
        const sprite = Game.activeSprite;
        if (!sprite) return;
        // visual only: drawn larger than the ball, physical radius unchanged
        const drawSize = 1.2;
        const cell = drawSize / 8;
        for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++)
        {
            const ch = sprite.sprite[y][x];
            if (ch === '.') continue;
            const [h, s, l] = SPRITE_COLORS[ch];
            const px = this.pos.x - drawSize/2 + cell * (x + .5);
            const py = this.pos.y + drawSize/2 - cell * (y + .5);
            LJS.drawRect(vec2(px, py), vec2(cell, cell), hsl(h, s, l));
        }
    }

    collideWithObject(o)
    {
        if (o instanceof Ball) return false; // no ball-ball collision
        if (o != Game.paddle) return true;
        if (this.velocity.y > 0) return false;
        this.velocity = this.velocity.rotate(.2 * (o.pos.x - this.pos.x));
        this.velocity.y = LJS.max(-this.velocity.y, .2);
        const speed = LJS.min(1.04*this.getSpeed(), .5);
        this.velocity = this.velocity.normalize(speed);
        sound_bounce.play(this.pos, 1, speed*2);
        return false;
    }
}
