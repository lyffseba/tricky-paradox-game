#!/usr/bin/env node
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/\/\* GAME_ENGINE_START \*\/([\s\S]*?)\/\* GAME_ENGINE_END \*\//);
if (!m) { console.error('FAIL: GameEngine block not found in index.html'); process.exit(1); }

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(m[1] + '; this.GameEngine = GameEngine;', ctx);
const G = ctx.GameEngine;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.error(' FAIL ' + name); console.error('       ' + e.message); }
}
function eq(a, b, msg) { assert.strictEqual(a, b, msg || (a + ' !== ' + b)); }
function ok(v, msg) { assert.ok(v, msg); }

console.log('Tricky Paradox Game — state engine tests\n');

test('createState returns intro with empty completed', () => {
  const s = G.createState();
  eq(s.stage, 'intro');
  eq(s.completed.length, 0);
  eq(s.stage1.caught, false);
  eq(s.stage2.solved, false);
  eq(s.stage3.synced, false);
  eq(s.stage4.solved, false);
  eq(s.stage5.solved, false);
});

test('isValidStage accepts all STAGES', () => {
  G.STAGES.forEach(st => ok(G.isValidStage(st)));
  ok(!G.isValidStage('bogus'));
});

test('stageIndex maps correctly', () => {
  eq(G.stageIndex('intro'), 0);
  eq(G.stageIndex('stage5'), 5);
  eq(G.stageIndex('victory'), 6);
});

test('canAdvance from intro without prerequisites', () => {
  ok(G.canAdvance(G.createState()));
});

test('canAdvance blocks stage1 until caught', () => {
  let s = G.createState(); s.stage = 'stage1';
  ok(!G.canAdvance(s));
  s.stage1.caught = true;
  ok(G.canAdvance(s));
});

test('canAdvance blocks stage2 until solved', () => {
  let s = G.createState(); s.stage = 'stage2';
  ok(!G.canAdvance(s));
  s.stage2.solved = true;
  ok(G.canAdvance(s));
});

test('canAdvance blocks stage3 until synced', () => {
  let s = G.createState(); s.stage = 'stage3';
  ok(!G.canAdvance(s));
  s.stage3.synced = true;
  ok(G.canAdvance(s));
});

test('canAdvance blocks stage4 until solved', () => {
  let s = G.createState(); s.stage = 'stage4';
  ok(!G.canAdvance(s));
  s.stage4.solved = true;
  ok(G.canAdvance(s));
});

test('canAdvance blocks stage5 until solved', () => {
  let s = G.createState(); s.stage = 'stage5';
  ok(!G.canAdvance(s));
  s.stage5.solved = true;
  ok(G.canAdvance(s));
});

test('advanceStage intro -> stage1 records nothing', () => {
  const s = G.advanceStage(G.createState());
  eq(s.stage, 'stage1');
  eq(s.completed.length, 0);
});

test('advanceStage stage1 -> stage2 when caught', () => {
  let s = G.createState(); s.stage = 'stage1'; s.stage1.caught = true;
  s = G.advanceStage(s);
  eq(s.stage, 'stage2');
  ok(s.completed.includes('stage1'));
});

test('advanceStage refuses without prerequisites', () => {
  let s = G.createState(); s.stage = 'stage3';
  const s2 = G.advanceStage(s);
  eq(s2.stage, 'stage3');
});

test('advanceStage full chain to victory', () => {
  let s = G.createState();
  s = G.advanceStage(s); eq(s.stage, 'stage1');
  s.stage1.caught = true; s = G.advanceStage(s); eq(s.stage, 'stage2');
  s.stage2.solved = true; s = G.advanceStage(s); eq(s.stage, 'stage3');
  s.stage3.synced = true; s = G.advanceStage(s); eq(s.stage, 'stage4');
  s.stage4.solved = true; s = G.advanceStage(s); eq(s.stage, 'stage5');
  s.stage5.solved = true; s = G.advanceStage(s); eq(s.stage, 'victory');
  eq(s.completed.length, 5);
});

test('clone deep-copies state', () => {
  const a = G.createState(); a.stage1.attempts = 3;
  const b = G.clone(a);
  b.stage1.attempts = 9;
  eq(a.stage1.attempts, 3);
});

test('stage1Init sets pause interval', () => {
  const s = G.stage1Init(G.createState());
  eq(s.stage1.pauseInterval, G.STAGE1_PAUSE_INTERVAL_MS);
});

test('stage1Catch keyboard always succeeds', () => {
  let s = G.createState(); s.stage = 'stage1';
  const r = G.stage1Catch(s, 'keyboard', 1000);
  ok(r.ok); ok(r.state.stage1.caught); eq(r.state.stage1.attempts, 1);
});

test('stage1Catch pause_click during freeze succeeds', () => {
  let s = G.createState(); s.stage = 'stage1';
  s.stage1.freezeUntil = 2000;
  const r = G.stage1Catch(s, 'pause_click', 1500);
  ok(r.ok); ok(r.state.stage1.caught);
});

test('stage1Catch pause_click outside freeze fails', () => {
  let s = G.createState(); s.stage = 'stage1';
  s.stage1.freezeUntil = 1000;
  const r = G.stage1Catch(s, 'pause_click', 1500);
  ok(!r.ok); eq(r.reason, 'missed_freeze');
});

test('stage1Catch wrong method fails', () => {
  const r = G.stage1Catch(G.createState(), 'click', 0);
  ok(!r.ok); eq(r.reason, 'wrong_method');
});

test('stage1FleePos frozen centers button', () => {
  const p = G.stage1FleePos(50, 50, 10, 10, 200, 100, 80, 30, true);
  eq(p.x, 60); eq(p.y, 35);
});

test('stage1FleePos flees when cursor near', () => {
  const p = G.stage1FleePos(50, 50, 40, 40, 200, 100, 80, 30, false);
  ok(p.x !== 40 || p.y !== 40);
});

test('stage1FleePos stays when cursor far', () => {
  const p = G.stage1FleePos(5, 5, 40, 40, 200, 100, 80, 30, false);
  eq(p.x, 40); eq(p.y, 40);
});

test('stage1FleePos coarse pointer ignores cursor proximity', () => {
  const p = G.stage1FleePos(50, 50, 40, 40, 200, 100, 80, 30, false, true);
  eq(p.x, 40); eq(p.y, 40);
});

test('stage1Catch touch_click always succeeds', () => {
  let s = G.createState(); s.stage = 'stage1';
  const r = G.stage1Catch(s, 'touch_click', 0);
  ok(r.ok); ok(r.state.stage1.caught); eq(r.state.stage1.attempts, 1);
});

test('isCoarsePointer false without window', () => {
  ok(!G.isCoarsePointer());
});

test('stage2Scenario deterministic from seed', () => {
  const a = G.stage2Scenario(42);
  const b = G.stage2Scenario(42);
  eq(a.truthGuard, b.truthGuard);
  eq(a.safeDoor, b.safeDoor);
  ok(a.truthGuard === 1 || a.truthGuard === 2);
  ok(a.safeDoor === 1 || a.safeDoor === 2);
});

test('stage2Statement truth guard names safe door', () => {
  eq(G.stage2Statement(1, 1, 2), 'Door BETA leads to the next stage.');
  eq(G.stage2Statement(2, 2, 1), 'Door ALPHA leads to the next stage.');
});

test('stage2Statement liar guard names trap door', () => {
  eq(G.stage2Statement(2, 1, 2), 'Door ALPHA leads to the next stage.');
  eq(G.stage2Statement(1, 2, 1), 'Door BETA leads to the next stage.');
});

test('stage2Choose correct door solves', () => {
  let s = G.createState(); s.stage2.safeDoor = 2;
  const r = G.stage2Choose(s, 2);
  ok(r.ok); ok(r.state.stage2.solved); eq(r.state.stage2.chosen, 2);
});

test('stage2Choose wrong door fails', () => {
  let s = G.createState(); s.stage2.safeDoor = 2;
  const r = G.stage2Choose(s, 1);
  ok(!r.ok); eq(r.reason, 'wrong_door');
});

test('stage3Phase wraps 0..1', () => {
  const p0 = G.stage3Phase(0, 0);
  const p1 = G.stage3Phase(G.STAGE3_PERIOD_MS, 0);
  ok(p0 >= 0 && p0 < 1);
  ok(Math.abs(p1 - p0) < 0.001);
});

test('stage3InWindow true at peak', () => {
  ok(G.stage3InWindow(0.25));
});

test('stage3InWindow false at trough', () => {
  ok(!G.stage3InWindow(0.75));
});

test('stage3Click succeeds at peak', () => {
  const t0 = 0, peak = t0 + G.STAGE3_PERIOD_MS * 0.25;
  const r = G.stage3Click(G.createState(), peak, t0);
  ok(r.ok); ok(r.state.stage3.synced);
});

test('stage3Click fails off peak (decay)', () => {
  const t0 = 0, off = t0 + G.STAGE3_PERIOD_MS * 0.75;
  const r = G.stage3Click(G.createState(), off, t0);
  ok(!r.ok); eq(r.reason, 'decay');
});

test('stage4Question returns all paradoxes', () => {
  eq(G.PARADOX_QUESTIONS.length, 3);
  for (let i = 0; i < 3; i++) ok(G.stage4Question(i));
  eq(G.stage4Question(99), null);
});

test('stage4Answer Q0 correct is No', () => {
  let s = G.createState();
  const r = G.stage4Answer(s, 'no');
  ok(r.ok); eq(r.state.stage4.index, 1);
});

test('stage4Answer Q0 wrong is Yes', () => {
  const r = G.stage4Answer(G.createState(), 'yes');
  ok(!r.ok); eq(r.reason, 'paradox');
});

test('stage4Answer Q1 correct is No', () => {
  let s = G.createState(); s.stage4.index = 1;
  const r = G.stage4Answer(s, 'no');
  ok(r.ok); eq(r.state.stage4.index, 2);
});

test('stage4Answer Q2 correct is No and solves', () => {
  let s = G.createState(); s.stage4.index = 2;
  const r = G.stage4Answer(s, 'no');
  ok(r.ok); ok(r.state.stage4.solved);
});

test('stage4Answer completes all three questions', () => {
  let s = G.createState();
  s = G.stage4Answer(s, 'no').state;
  s = G.stage4Answer(s, 'no').state;
  s = G.stage4Answer(s, 'no').state;
  ok(s.stage4.solved);
  eq(s.stage4.answers.length, 3);
});

test('stage5Sequence returns valid prompts', () => {
  for (let i = 0; i < 6; i++) {
    const item = G.stage5Sequence(i);
    ok(item.prompt); ok(Number.isInteger(item.answer));
  }
});

test('stage5StartRound sets deadline', () => {
  const s = G.stage5StartRound(G.createState(), 1000, 0);
  ok(s.stage5.current);
  eq(s.stage5.deadline, 1000 + G.STAGE5_TIME_MS);
});

test('stage5Submit correct fast answer advances', () => {
  let s = G.stage5StartRound(G.createState(), 1000, 0);
  const ans = s.stage5.current.answer;
  const r = G.stage5Submit(s, String(ans), 1500);
  ok(r.ok); eq(r.state.stage5.correct, 1);
});

test('stage5Submit too slow fails (too_human)', () => {
  let s = G.stage5StartRound(G.createState(), 1000, 0);
  const ans = s.stage5.current.answer;
  const r = G.stage5Submit(s, String(ans), 1000 + G.STAGE5_TIME_MS + 1);
  ok(!r.ok); eq(r.reason, 'too_human');
});

test('stage5Submit wrong math fails', () => {
  let s = G.stage5StartRound(G.createState(), 1000, 0);
  const r = G.stage5Submit(s, '0', 1500);
  ok(!r.ok); eq(r.reason, 'wrong_math');
});

test('stage5Submit no round fails', () => {
  const r = G.stage5Submit(G.createState(), '1', 1000);
  ok(!r.ok); eq(r.reason, 'no_round');
});

test('stage5Submit five correct solves', () => {
  let s = G.createState(), t = 1000;
  for (let i = 0; i < G.STAGE5_REQUIRED; i++) {
    s = G.stage5StartRound(s, t, 3);
    s = G.stage5Submit(s, String(s.stage5.current.answer), t + 100).state;
    t += 500;
  }
  ok(s.stage5.solved);
  eq(s.stage5.correct, G.STAGE5_REQUIRED);
});

test('isVictory true on victory stage', () => {
  let s = G.createState(); s.stage = 'victory';
  ok(G.isVictory(s));
});

test('isVictory true when stage5 solved', () => {
  let s = G.createState(); s.stage = 'stage5'; s.stage5.solved = true;
  ok(G.isVictory(s));
});

test('isVictory false during play', () => {
  ok(!G.isVictory(G.createState()));
});

test('progressDots reflects state', () => {
  let s = G.createState(); s.stage = 'stage1';
  let d = G.progressDots(s);
  eq(d.length, 5);
  eq(d[0], 'active');
  s.completed = ['stage1']; s.stage = 'stage2';
  d = G.progressDots(s);
  eq(d[0], 'done'); eq(d[1], 'active');
});

test('exportState returns clone', () => {
  const s = G.createState(); s.stage1.attempts = 5;
  const e = G.exportState(s);
  e.stage1.attempts = 0;
  eq(s.stage1.attempts, 5);
});

test('constants exported', () => {
  eq(G.TOTAL_STAGES, 5);
  eq(G.STAGE_NAMES.length, G.STAGES.length);
  ok(G.STAGE1_FREEZE_MS > 0);
  ok(G.STAGE3_TOLERANCE > 0);
});

test('advanceStage from victory stays at victory', () => {
  let s = G.createState(); s.stage = 'victory';
  eq(G.advanceStage(s).stage, 'victory');
});

test('stage1Tick sets freeze window at interval', () => {
  let s = G.stage1Init(G.createState());
  s.stage1.pauseInterval = 3000;
  const t = G.stage1Tick(s, 3000, 200, 100, 80, 30);
  ok(t.stage1.freezeUntil >= 3000);
  ok(t.stage1.frozenPos);
});

test('stage4Answer past last question returns no_question', () => {
  let s = G.createState(); s.stage4.index = 99;
  const r = G.stage4Answer(s, 'no');
  ok(!r.ok); eq(r.reason, 'no_question');
});

test('index.html contains required UI and engine markers', () => {
  ok(html.includes('GAME_ENGINE_START'));
  ok(html.includes('Stage 1 — The Teleporting Button'));
  ok(html.includes('Stage 5 — The Reverse Turing Test'));
  ok(html.includes('AudioFX'));
  ok(html.includes('id="screen"'));
  ok(html.includes('Logic Bypass'));
  ok(html.includes('bypass-btn'));
});

test('BYPASS_COMMENTS cover playable stages', () => {
  ['intro', 'stage1', 'stage2', 'stage3', 'stage4', 'stage5'].forEach(st => {
    ok(G.BYPASS_COMMENTS[st]);
    ok(G.BYPASS_COMMENTS[st].length > 10);
  });
});

test('bypassStage intro advances to stage1 with init', () => {
  const r = G.bypassStage(G.createState());
  ok(r.ok); eq(r.state.stage, 'stage1'); eq(r.bypassed, 'intro');
  ok(r.comment); eq(r.state.stage1.pauseInterval, G.STAGE1_PAUSE_INTERVAL_MS);
  eq(r.state.completed.length, 0);
});

test('bypassStage stage1 advances to stage2', () => {
  let s = G.createState(); s.stage = 'stage1';
  const r = G.bypassStage(s);
  ok(r.ok); eq(r.state.stage, 'stage2'); eq(r.bypassed, 'stage1');
  ok(r.state.completed.includes('stage1'));
  ok(r.state.stage1.caught);
});

test('bypassStage stage2 advances to stage3', () => {
  let s = G.createState(); s.stage = 'stage2';
  const r = G.bypassStage(s);
  ok(r.ok); eq(r.state.stage, 'stage3'); ok(r.state.stage2.solved);
});

test('bypassStage stage3 advances to stage4', () => {
  let s = G.createState(); s.stage = 'stage3';
  const r = G.bypassStage(s);
  ok(r.ok); eq(r.state.stage, 'stage4'); ok(r.state.stage3.synced);
});

test('bypassStage stage4 advances to stage5', () => {
  let s = G.createState(); s.stage = 'stage4';
  const r = G.bypassStage(s);
  ok(r.ok); eq(r.state.stage, 'stage5'); ok(r.state.stage4.solved);
  eq(r.state.stage4.index, G.PARADOX_QUESTIONS.length);
});

test('bypassStage stage5 advances to victory', () => {
  let s = G.createState(); s.stage = 'stage5';
  const r = G.bypassStage(s);
  ok(r.ok); eq(r.state.stage, 'victory'); ok(r.state.stage5.solved);
  eq(r.state.stage5.correct, G.STAGE5_REQUIRED);
  ok(r.state.completed.includes('stage5'));
});

test('bypassStage victory refuses', () => {
  let s = G.createState(); s.stage = 'victory';
  const r = G.bypassStage(s);
  ok(!r.ok); eq(r.reason, 'no_bypass');
});

test('bypassStage full chain reaches victory', () => {
  let s = G.createState();
  for (let i = 0; i < 6; i++) {
    const r = G.bypassStage(s);
    ok(r.ok, 'bypass ' + i);
    s = r.state;
  }
  eq(s.stage, 'victory');
  eq(s.completed.length, 5);
});

test('solveCurrentStage marks stage1 caught only', () => {
  const s = G.createState(); s.stage = 'stage1';
  G.solveCurrentStage(s);
  ok(s.stage1.caught); ok(!s.stage2.solved);
});

test('stage2 logic consistent for all 4 scenarios', () => {
  for (let tg = 1; tg <= 2; tg++) {
    for (let sd = 1; sd <= 2; sd++) {
      const t1 = G.stage2Statement(1, tg, sd);
      const t2 = G.stage2Statement(2, tg, sd);
      ok(t1.includes('ALPHA') || t1.includes('BETA'));
      ok(t2.includes('ALPHA') || t2.includes('BETA'));
      let s = G.createState(); s.stage2.safeDoor = sd;
      ok(G.stage2Choose(s, sd).ok);
      ok(!G.stage2Choose(s, sd === 1 ? 2 : 1).ok);
    }
  }
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);