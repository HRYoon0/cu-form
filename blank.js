// 한글 파일 없이 시작하기: 기본 구성(학사·기준 시수) + 새 HWPX 문서 조립
// 조립한 문서는 core.js의 readDoc/buildEdits가 그대로 읽도록 원본 구성표와 같은 표 구조(제목 글자·열 배치)를 따른다
(function (g) {
  'use strict';
  const C = () => g.Core;
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const pad = n => String(n).padStart(2, '0');
  const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const WD = '일월화수목금토';

  // ───────── 날짜 도우미 ─────────
  const dow = s => C().D(s).getUTCDay();
  const add = (s, n) => C().iso(C().addDays(C().D(s), n));
  const nextDow = (s, w) => { let x = s; while (dow(x) !== w) x = add(x, 1); return x; };   // s 이후 첫 w요일(당일 포함)
  const prevDow = (s, w) => { let x = s; while (dow(x) !== w) x = add(x, -1); return x; };
  const febEnd = y => C().iso(new Date(Date.UTC(y, 2, 0)));

  // ───────── 공휴일: 법령대로 계산 ─────────
  // 근거(국가법령정보센터 현행 원문 확인, 2026-09-28)
  //  · 「관공서의 공휴일에 관한 규정」(대통령령 제36290호, 2026.5.1. 시행) 제2조 공휴일, 제3조 대체공휴일
  //    - 제2조제2호가 2026.5.11.부터 「국경일에 관한 법률」의 국경일 전부 → 제헌절(7.17.) 포함
  //  · 「국경일에 관한 법률」 제2조: 3·1절, 제헌절, 광복절, 개천절, 한글날
  //  · 「초·중등교육법 시행령」 제47조①: 학교 휴업일에 관공서의 공휴일을 포함
  //  · 「공직선거법」 제34조: 임기만료 선거일(①계산식, ②공휴일 전후면 다음 주 수요일)
  // 음력 공휴일 날짜(설날 당일은 다음 해 1~2월): superkts.com 공휴일표에서 대조
  const LUNAR = {
    2026: { buddha: '2026-05-24', chuseok: '2026-09-25', seol: '2027-02-07' },
    2027: { buddha: '2027-05-13', chuseok: '2027-09-15', seol: '2028-01-27' },
    2028: { buddha: '2028-05-02', chuseok: '2028-10-03', seol: '2029-02-13' },
    2029: { buddha: '2029-05-20', chuseok: '2029-09-22', seol: '2030-02-03' },
    2030: { buddha: '2030-05-09', chuseok: '2030-09-12', seol: '2031-01-23' },
    2031: { buddha: '2031-05-28', chuseok: '2031-10-01', seol: '2032-02-11' },
  };
  // 임기만료 선거일(제2조제10호의2). 2030 지방선거는 6.5.이 계산값이지만 다음 날이 현충일이라 제34조②로 6.12.
  const ELECTIONS = [['2026-06-03', '지방선거일'], ['2028-04-12', '국회의원선거일'], ['2030-03-27', '대통령선거일'], ['2030-06-12', '지방선거일']];
  const H = (from, name, to) => ({ name, from, to: to || from });

  // 학년도(3.1.~다음 해 2월 말)의 공휴일 + 대체공휴일. type = 규정 제2조 호수(10의2 = 10.5)
  function holidaysFor(year) {
    const from = ymd(year, 3, 1), to = febEnd(year + 1), L = LUNAR[year], base = [];
    // 제헌절(제2호 개정)은 2026.5.11., 노동절(제6호)은 2026.5.1. 시행 — 그 전 날짜엔 넣지 않는다
    const SINCE = { '제헌절': '2026-05-11', '노동절': '2026-05-01' };
    const P = (date, name, type) => { if (!(SINCE[name] && date < SINCE[name])) base.push({ date, name, type }); };
    for (const y of [year, year + 1]) {
      P(ymd(y, 3, 1), '3·1절', 2); P(ymd(y, 7, 17), '제헌절', 2); P(ymd(y, 8, 15), '광복절', 2); P(ymd(y, 10, 3), '개천절', 2); P(ymd(y, 10, 9), '한글날', 2);
      P(ymd(y, 1, 1), '신정', 3); P(ymd(y, 5, 1), '노동절', 6); P(ymd(y, 5, 5), '어린이날', 7); P(ymd(y, 6, 6), '현충일', 8); P(ymd(y, 12, 25), '기독탄신일', 10);
    }
    if (L) {
      [-1, 0, 1].forEach(k => P(add(L.seol, k), '설날', 4));
      P(L.buddha, '부처님 오신 날', 5);
      [-1, 0, 1].forEach(k => P(add(L.chuseok, k), '추석', 9));
    }
    ELECTIONS.forEach(([d, n]) => P(d, n, 10.5));
    const subs = new Map();
    const isHol = d => dow(d) === 0 || base.some(h => h.date === d) || subs.has(d);   // 제2조 공휴일(일요일 포함) — 토요일은 비공휴일
    const Q1 = [2, 5, 6, 7, 10], Q2 = [4, 9], Q3 = [2, 4, 5, 6, 7, 9, 10];
    for (const date of [...new Set(base.map(h => h.date))].sort()) {
      const hs = base.filter(h => h.date === date && h.type >= 2 && h.type <= 10);   // "제2호부터 제10호까지"(10의2 제외)
      const w = dow(date);
      let q = [];
      if (w === 6 || w === 0) q = hs.filter(h => Q1.includes(h.type) || (w === 0 && Q2.includes(h.type)));        // ①1·2
      else if (hs.length >= 2) q = hs.filter(h => Q3.includes(h.type)).slice(0, hs.length - 1);                   // ①3: 평일에 겹치면 잃은 날 수만큼
      for (const h of q) {
        let d = add(date, 1);
        while (dow(d) === 6 || isHol(d)) d = add(d, 1);          // 첫 비공휴일(②겹치면 그다음, ③토요일이면 그다음)
        subs.set(d, `대체공휴일(${h.name})`);
      }
    }
    // 목록으로: 설·추석은 3일 묶음, 나머지는 하루씩
    const out = [];
    for (const key of ['설날', '추석']) {
      const ds = base.filter(h => h.name === key).map(h => h.date).sort();
      for (let i = 0; i < ds.length; i += 3) out.push(H(ds[i], key === '설날' ? '설 연휴' : '추석 연휴', ds[i + 2]));
    }
    base.filter(h => h.name !== '설날' && h.name !== '추석').forEach(h => out.push(H(h.date, h.name)));
    subs.forEach((n, d) => out.push(H(d, n)));
    return out.filter(h => h.to >= from && h.from <= to).sort((x, y) => x.from.localeCompare(y.from));
  }
  const hasLunar = y => !!LUNAR[y];

  // ───────── 2022 개정 교육과정 기준 ─────────
  // 교과(군): nat=두 해 기준 시수, noReduce=기준 밑으로 못 줄임(체육·예술, 경남 권장: 즐거운 생활)
  const BANDS = {
    12: { grades: [1, 2], total: 1744, cha: 238, groups: [
      { key: '국어', subs: ['국어'], nat: 482 }, { key: '수학', subs: ['수학'], nat: 256 },
      { key: '바른 생활', subs: ['바른 생활'], nat: 144 }, { key: '슬기로운 생활', subs: ['슬기로운 생활'], nat: 224 },
      { key: '즐거운 생활', subs: ['즐거운 생활'], nat: 400, noReduce: true }] },
    34: { grades: [3, 4], total: 1972, cha: 204, groups: [
      { key: '국어', subs: ['국어'], nat: 408 }, { key: '사회/도덕', subs: ['사회', '도덕'], nat: 272 },
      { key: '수학', subs: ['수학'], nat: 272 }, { key: '과학', subs: ['과학'], nat: 204 },
      { key: '체육', subs: ['체육'], nat: 204, noReduce: true }, { key: '예술', label: '예술', subs: ['음악', '미술'], nat: 272, noReduce: true },
      { key: '영어', subs: ['영어'], nat: 136 }] },
    56: { grades: [5, 6], total: 2176, cha: 204, groups: [
      { key: '국어', subs: ['국어'], nat: 408 }, { key: '사회/도덕', subs: ['사회', '도덕'], nat: 272 },
      { key: '수학', subs: ['수학'], nat: 272 }, { key: '과학/실과', subs: ['과학', '실과'], nat: 340 },
      { key: '체육', subs: ['체육'], nat: 204, noReduce: true }, { key: '예술', label: '예술', subs: ['음악', '미술'], nat: 272, noReduce: true },
      { key: '영어', subs: ['영어'], nat: 204 }] },
  };
  const bandOf = gr => (gr <= 2 ? 12 : gr <= 4 ? 34 : 56);
  const rangeOf = (n, noReduce) => [noReduce ? n : Math.ceil(n * 0.8), Math.floor(n * 1.2)];
  // 학년별 한 해 본교기준 기본값(두 해 합 = nat). 1·2학년은 교과서 차시 기준으로 해마다 다르다
  const YEAR_BASE = {
    1: { '국어': 244, '수학': 120, '바른 생활': 72, '슬기로운 생활': 112, '즐거운 생활': 200, cha: 121 },
    2: { '국어': 238, '수학': 136, '바른 생활': 72, '슬기로운 생활': 112, '즐거운 생활': 200, cha: 117 },
    3: { '국어': 204, '사회': 102, '도덕': 34, '수학': 136, '과학': 102, '체육': 102, '음악': 68, '미술': 68, '영어': 68, cha: 102 },
    5: { '국어': 204, '사회': 102, '도덕': 34, '수학': 136, '과학': 102, '실과': 68, '체육': 102, '음악': 68, '미술': 68, '영어': 102, cha: 102 },
  };
  YEAR_BASE[4] = YEAR_BASE[3]; YEAR_BASE[6] = YEAR_BASE[5];
  const CHA_SPLIT = { 1: [102, 16, 3], 2: [98, 16, 3], 3: [82, 16, 4], 4: [82, 16, 4], 5: [82, 16, 4], 6: [82, 16, 4] };
  const CHA_NAMES = ['자율·자치 활동', '동아리 활동', '진로 활동'];

  function defaultPlan() {
    const grades = {};
    for (const gr of [1, 2, 3, 4, 5, 6]) {
      const band = BANDS[bandOf(gr)], [gA, gB] = band.grades;
      const rows = [];
      for (const grp of band.groups) for (const s of grp.subs)
        rows.push({ name: s, kind: 'sub', group: grp.key, b: [YEAR_BASE[gA][s], YEAR_BASE[gB][s]], v: [YEAR_BASE[gA][s], YEAR_BASE[gB][s]] });
      CHA_NAMES.forEach((n, i) => rows.push({ name: n, kind: 'cha', v: [CHA_SPLIT[gA][i], CHA_SPLIT[gB][i]] }));
      grades[gr] = { rows, chaBase: [YEAR_BASE[gA].cha, YEAR_BASE[gB].cha] };
    }
    return { grades };
  }

  // ───────── 학사 기본값 ─────────
  function defaultCfg(year) {
    const holidays = holidaysFor(year);
    const sumFrom = nextDow(ymd(year, 7, 21), 6), sumTo = prevDow(ymd(year, 8, 31), 0);
    const winFrom = ymd(year, 12, 25), winTo = nextDow(ymd(year + 1, 1, 18), 0);
    const endFrom = nextDow(ymd(year + 1, 2, 10), 6), endTo = febEnd(year + 1);
    const cfg = {
      semesters: [{ name: '1학기', from: ymd(year, 3, 1), to: sumTo }, { name: '2학기', from: add(sumTo, 1), to: febEnd(year + 1) }],
      vacations: [{ name: '여름방학', from: sumFrom, to: sumTo }, { name: '겨울방학', from: winFrom, to: winTo }, { name: '학년말 방학', from: endFrom, to: endTo }],
      holidays,
      base: { 1: [4, 5, 5, 5, 4], 2: [4, 5, 5, 5, 4], 3: [5, 5, 5, 6, 5], 4: [5, 5, 5, 6, 5], 5: [6, 6, 5, 6, 6], 6: [6, 6, 5, 6, 6] },
      events: [],
    };
    // 식 행사: 방학 앞뒤의 수업일에 둔다(교시는 흔한 예시값, 학교에 맞게 고치도록 안내)
    const school = s => !C().offReason(cfg, s);
    const after = s => { let x = s; while (!school(x)) x = add(x, 1); return x; };
    const before = s => { let x = s; while (!school(x)) x = add(x, -1); return x; };
    const E = (name, d, grades, periods) => cfg.events.push({ name, from: d, to: d, grades, periods });
    const first = after(ymd(year, 3, 2));
    E('입학식', first, [1], 2); E('시업식', first, [2, 3, 4], 4); E('시업식', first, [5, 6], 5);
    const sEnd = before(add(sumFrom, -1)), sBack = after(add(sumTo, 1)), wEnd = before(add(winFrom, -1)), wBack = after(add(winTo, 1)), last = before(add(endFrom, -1));
    E('여름방학식', sEnd, [3, 4], 4); E('여름방학식', sEnd, [5, 6], 5);
    E('여름방학 개학식', sBack, [3, 4], 4); E('여름방학 개학식', sBack, [5, 6], 5);
    E('겨울방학식', wEnd, [1, 2, 3, 4], 4); E('겨울방학식', wEnd, [5, 6], 5);
    E('겨울방학 개학식', wBack, [3, 4], 4); E('겨울방학 개학식', wBack, [5, 6], 5);
    E('종업식', last, [1, 2, 3, 4, 5], 4); E('졸업식', last, [6], 3);
    return cfg;
  }

  // ───────── HWPX 표 조립 ─────────
  let tblSeq = 0;
  const para = (t, cp = 7, pp = 20) => `<hp:p id="0" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${cp}"><hp:t>${esc(t)}</hp:t></hp:run></hp:p>`;
  // cells: {r,c,rs,cs,t(문자열 또는 줄 배열, 줄은 {t,cp}로 글자 모양 지정 가능),bf,cp,pp}. 모든 칸이 정확히 한 번씩 덮이는지 검사한다
  function table(nRows, rel, cells, repeat = 0) {
    const W = g.HWPX_SKELETON.width, sum = rel.reduce((a, b) => a + b, 0);
    const widths = rel.map(x => Math.floor((W * x) / sum));
    widths[widths.length - 1] += W - widths.reduce((a, b) => a + b, 0);
    const nCols = rel.length, RH = 1100, seen = Array.from({ length: nRows }, () => Array(nCols).fill(false));
    for (const c of cells) {
      c.rs = c.rs || 1; c.cs = c.cs || 1;
      for (let r = c.r; r < c.r + c.rs; r++) for (let k = c.c; k < c.c + c.cs; k++) {
        if (r >= nRows || k >= nCols || seen[r][k]) throw new Error(`표 조립 오류: (${r},${k}) 칸이 겹치거나 벗어남`);
        seen[r][k] = true;
      }
    }
    seen.forEach((row, r) => row.forEach((v, k) => { if (!v) throw new Error(`표 조립 오류: (${r},${k}) 칸이 비어 있음`); }));
    let rows = '';
    for (let r = 0; r < nRows; r++) {
      rows += '<hp:tr>';
      for (const c of cells.filter(x => x.r === r).sort((a, b) => a.c - b.c)) {
        const w = widths.slice(c.c, c.c + c.cs).reduce((a, b) => a + b, 0);
        const lines = Array.isArray(c.t) ? c.t : [c.t ?? ''];
        rows += `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${c.bf || 3}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${lines.map(t => (t && typeof t === 'object' ? para(t.t, t.cp, c.pp || 20) : para(t, c.cp || 7, c.pp || 20))).join('')}</hp:subList><hp:cellAddr colAddr="${c.c}" rowAddr="${c.r}"/><hp:cellSpan colSpan="${c.cs}" rowSpan="${c.rs}"/><hp:cellSz width="${w}" height="${RH * c.rs}"/><hp:cellMargin left="141" right="141" top="85" bottom="85"/></hp:tc>`;
      }
      rows += '</hp:tr>';
    }
    const id = 1300000000 + ++tblSeq;
    return `<hp:p id="0" paraPrIDRef="24" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="7"><hp:tbl id="${id}" zOrder="${tblSeq}" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="${repeat}" rowCnt="${nRows}" colCnt="${nCols}" cellSpacing="0" borderFillIDRef="3" noAdjust="0"><hp:sz width="${W}" widthRelTo="ABSOLUTE" height="${RH * nRows}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="141" right="141" top="85" bottom="85"/>${rows}</hp:tbl></hp:run></hp:p>`;
  }
  const hd = (r, c, t, rs, cs) => ({ r, c, t, rs, cs, bf: 4, cp: 8 });      // 머리글 칸
  const cell = (r, c, t = '', o = {}) => ({ r, c, t, ...o });

  // ───────── 날짜 표기 ─────────
  const dText = (s, withYear = true) => { const d = C().D(s); return `${withYear ? d.getUTCFullYear() + '. ' : ''}${d.getUTCMonth() + 1}. ${d.getUTCDate()}.(${WD[d.getUTCDay()]})`; };
  const period = (f, t) => (f === t ? dText(f) : `${dText(f)} ~ ${dText(t, f.slice(0, 4) !== t.slice(0, 4))}`);
  const md = s => { const d = C().D(s); return `${d.getUTCMonth() + 1}.${d.getUTCDate()}.`; };
  const gradesText = gs => (gs.length === 6 ? '전학년' : gs.every((x, i) => i === 0 || x === gs[i - 1] + 1) && gs.length > 2 ? `${gs[0]}~${gs[gs.length - 1]}학년` : `${gs.join(',')}학년`);
  const days = (f, t) => (C().D(t) - C().D(f)) / 864e5 + 1;

  // 주요 교육활동 문구: 휴업일(방학 제외, 빨강)과 행사. 화면 주별 표와 한글 파일이 같이 쓴다
  // 같은 날 같은 이름의 행사(학년별로 교시만 다른 것)는 한 줄로: 여름방학 개학식(3,4학년 4교시, 5,6학년 5교시)
  function weekNotes(cfg, w) {
    const notes = [];
    for (let k = 0; k < 5; k++) {
      const s = add(w.mon, k), why = w.off[k];
      if (why === null && !w.dates.includes(s)) continue;
      if (why) { if (!cfg.vacations.some(v => s >= v.from && s <= v.to)) notes.push({ t: `${md(s)} ${why}`, holiday: true }); continue; }
      const byName = new Map();
      for (const e of cfg.events) if (s >= e.from && s <= (e.to || e.from) && (e.from === s || k === 0))
        (byName.get(e.name) || byName.set(e.name, []).get(e.name)).push(`${gradesText(e.grades)} ${e.periods}교시`);
      for (const [name, parts] of byName) notes.push({ t: `${md(s)} ${name}(${parts.join(', ')})`, holiday: false });
    }
    return notes;
  }

  // ───────── 표별 조립 ─────────
  function schedTable(cfg) {
    const rows = [
      ...cfg.holidays.map(h => ({ name: h.name, from: h.from, to: h.to || h.from, note: '' })),
      ...cfg.vacations.map(v => ({ name: v.name, from: v.from, to: v.to, note: `${days(v.from, v.to)}일` })),
      // 식 행사만 올린다(읽을 때 '…식'은 수업일로 처리됨). 학년별로 나뉜 같은 행사는 한 줄로
      ...[...new Map(cfg.events.filter(e => /(시업|입학|방학|개학|종업|졸업)식/.test(e.name)).map(e => [e.name + e.from, { name: e.name, from: e.from, to: e.to || e.from, note: '' }])).values()],
    ].sort((a, b) => a.from.localeCompare(b.from));
    const cells = [hd(0, 0, '행사'), hd(0, 1, '기간'), hd(0, 2, '비고')];
    rows.forEach((x, i) => cells.push(cell(i + 1, 0, x.name), cell(i + 1, 1, period(x.from, x.to)), cell(i + 1, 2, x.note)));
    return table(rows.length + 1, [30, 50, 20], cells);
  }

  function monthsTable(res) {
    const order = m => (m < 3 ? m + 12 : m);
    const ms = res.sems.map(s => Object.keys(s.months).map(Number).sort((a, b) => order(a) - order(b)));
    const n = Math.max(...ms.map(x => x.length), 1);
    const cells = [hd(0, 0, ['수업', '일수'], 4)];
    res.sems.forEach((sem, si) => {
      const r = si * 2;
      cells.push(hd(r, 1, sem.name, 2), hd(r, 2, '월'), hd(r + 1, 2, '일수'));
      for (let k = 0; k < n; k++) {
        const m = ms[si][k];
        cells.push(m ? hd(r, 3 + k, String(m)) : cell(r, 3 + k, '', { bf: 4 }), cell(r + 1, 3 + k, ''));
      }
      cells.push(hd(r, 3 + n, '계'), cell(r + 1, 3 + n, '', { bf: 6, cp: 8 }));
      cells.push(hd(r, 4 + n, si === 0 ? ['수업일수', '총합계'] : ['방학일수', '총합계'], 2), cell(r, 5 + n, '', { rs: 2, cp: 8 }));
    });
    return table(4, [6, 6, 5, ...Array(n).fill(5), 5, 8, 7], cells);
  }

  function weekTable(cfg, sem) {
    const cells = [hd(0, 0, '월', 2), hd(0, 1, '주', 2), hd(0, 2, '연간 수업 일수', 1, 5), hd(0, 7, ['수업', '일수'], 2),
      hd(0, 8, '주요 교육활동', 2), hd(0, 9, '비고', 2), hd(0, 10, '학년별 주당 수업 시수', 1, 6)];
    '월화수목금'.split('').forEach((w, k) => cells.push(hd(1, 2 + k, w)));
    for (let k = 0; k < 6; k++) cells.push(hd(1, 10 + k, String(k + 1)));
    const weeks = sem.weeks;
    weeks.forEach((w, i) => {
      const r = 2 + i;
      if (i === 0 || weeks[i - 1].month !== w.month) {
        let span = 1;
        while (i + span < weeks.length && weeks[i + span].month === w.month) span++;
        cells.push(cell(r, 0, String(w.month), { rs: span, bf: 6 }));
      }
      cells.push(cell(r, 1, String(i + 1), { bf: 6 }));
      for (let k = 0; k < 5; k++) {
        const s = add(w.mon, k), why = w.off[k];
        if (why === null && !w.dates.includes(s)) { cells.push(cell(r, 2 + k, '')); continue; }
        const d = String(C().D(s).getUTCDate());
        if (why) cells.push(cell(r, 2 + k, d, { bf: 5, cp: 14 }));                 // 휴업일: 분홍 칸 + 빨간 굵은 글씨
        else cells.push(cell(r, 2 + k, d, cfg.events.some(e => s >= e.from && s <= (e.to || e.from)) ? { cp: 8 } : {}));
      }
      const notes = weekNotes(cfg, w).map(n => (n.holiday ? { t: n.t, cp: 9 } : n.t));
      cells.push(cell(r, 7, '', { bf: 6 }), cell(r, 8, notes.length ? notes : '', { pp: 21 }), cell(r, 9, ''));
      // 평소(요일 기본 시수 합)와 다른 주는 파란 글씨 — 원본 구성표 관례
      for (let k = 0; k < 6; k++) cells.push(cell(r, 10 + k, '', w.hours[k] !== cfg.base[k + 1].reduce((a, b) => a + +b, 0) ? { cp: 13 } : {}));
    });
    const r = 2 + weeks.length;
    const vac = cfg.vacations.filter(v => v.from > sem.weeks[0].mon && v.from <= sem.to).map(v => `${v.name} ${dText(v.from)}~${dText(v.to, v.from.slice(0, 4) !== v.to.slice(0, 4))}(${days(v.from, v.to)}일)`);
    cells.push(cell(r, 0, [sem.name, '소계'], { cs: 2, bf: 6, cp: 8 }));
    for (let k = 0; k < 5; k++) cells.push(cell(r, 2 + k, '', { bf: 6, cp: 8 }));
    cells.push(cell(r, 7, '', { bf: 6, cp: 8 }), cell(r, 8, vac.length ? vac : '', { cs: 2, bf: 6 }));
    for (let k = 0; k < 6; k++) cells.push(cell(r, 10 + k, '', { bf: 6, cp: 8 }));
    return table(r + 1, [3, 3, 3.2, 3.2, 3.2, 3.2, 3.2, 3.6, 22, 14, 3.6, 3.6, 3.6, 3.6, 3.6, 3.6], cells, 1);
  }

  function summaryTable(year) {
    const cells = [hd(0, 0, '연간수업일수', 1, 2), hd(0, 2, '학년별 수업 시수', 1, 2)];
    for (let k = 0; k < 6; k++) cells.push(hd(0, 4 + k, `${k + 1}학년`));
    cells.push(hd(1, 0, '1학기', 2), cell(1, 1, '', { rs: 2 }), hd(1, 2, [`${year}학년도`, '시수'], 4), hd(1, 3, '1학기'), hd(2, 3, '2학기', 2));
    for (let k = 0; k < 6; k++) cells.push(cell(1, 4 + k, ''), cell(2, 4 + k, '', { rs: 2 }));
    cells.push(hd(3, 0, '2학기', 2), cell(3, 1, '', { rs: 2 }), hd(4, 3, '시수 합계'));
    for (let k = 0; k < 6; k++) cells.push(cell(4, 4 + k, '', { bf: 6, cp: 8 }));
    cells.push(hd(5, 0, '합계', 3), cell(5, 1, '', { rs: 3, cp: 8 }), hd(5, 2, [`${year - 1}학년도`, '이수 시수'], 1, 2),
      hd(6, 2, [`${year - 1}~${year}학년도`, '이수 시수 합계'], 1, 2), hd(7, 2, '학년군별 총 최소 수업 시수', 1, 2));
    // 2·4·6학년 칸에만 지난해·누계 값이 들어간다(빈칸이면 계산이 건너뛰므로 자리표시 0)
    for (let k = 0; k < 6; k++) { const even = k % 2 === 1; cells.push(cell(5, 4 + k, even ? '0' : ''), cell(6, 4 + k, even ? '0' : '')); }
    cells.push(cell(7, 4, '1,744', { cs: 2 }), cell(7, 6, '1,972', { cs: 2 }), cell(7, 8, '2,176', { cs: 2 }));
    return table(8, [7, 5, 8, 7, 6, 6, 6, 6, 6, 6], cells);
  }

  function gradeTable(gr, plan, year) {
    const bandKey = bandOf(gr), band = BANDS[bandKey], [gA, gB] = band.grades, P = plan.grades[gr];
    const L = bandKey === 12 ? 2 : 3, col = { nat: L, range: L + 1, b1: L + 2, v1: L + 3, b2: L + 4, v2: L + 5, sum: L + 6 };
    const cells = [hd(0, 0, ['학년', '구분'], 2, L + 2), hd(0, L + 2, `${gA}~${gB}학년(군)`, 1, 5),
      hd(1, L + 2, [`${gA}학년(${year + gA - gr}년)`, '2022 개정 교육과정 적용'], 1, 2), hd(1, L + 4, [`${gB}학년(${year + gB - gr}년)`, '2022 개정 교육과정 적용'], 1, 2),
      hd(1, L + 6, ['시수합계', '(증감)'], 3), hd(2, 0, '과목', 2, L), hd(2, L, '2022 개정 교육과정', 1, 2),
      hd(2, L + 2, '본교기준', 2), hd(2, L + 3, ['본교시수', '(증감)'], 2), hd(2, L + 4, '본교기준', 2), hd(2, L + 5, ['본교시수', '(증감)'], 2),
      hd(3, L, '국가기준'), hd(3, L + 1, '증감범위')];
    const num = v => (v === null || v === undefined || v === '' ? '' : C().fmt(+v));
    let r = 4;
    const subRows = band.groups.map(grp => ({ grp, rows: P.rows.filter(x => x.kind === 'sub' && x.group === grp.key) }));
    const nSub = subRows.reduce((a, x) => a + x.rows.length, 0);
    cells.push(hd(r, 0, ['교과', '(군)'], nSub));
    for (const { grp, rows } of subRows) {
      const n = rows.length, [lo, hi] = rangeOf(grp.nat, grp.noReduce);
      cells.push(cell(r, col.nat, C().fmt(grp.nat), { rs: n }), cell(r, col.range, `${lo}~${hi}`, { rs: n }), cell(r, col.sum, '', { rs: n, cp: 8 }));
      if (L === 3 && grp.label) cells.push(hd(r, 1, grp.label, n));
      rows.forEach((x, i) => {
        if (L === 3 && grp.label) cells.push(hd(r + i, 2, x.name));
        else cells.push(hd(r + i, 1, x.name, 1, L - 1));
        cells.push(cell(r + i, col.b1, num(x.b && x.b[0])), cell(r + i, col.v1, num(x.v[0])), cell(r + i, col.b2, num(x.b && x.b[1])), cell(r + i, col.v2, num(x.v[1])));
      });
      r += n;
    }
    const natSub = band.total - band.cha, chaVar = Math.floor(band.cha * 0.2);
    const sumRow = (label, nat, range) => {
      cells.push(hd(r, 0, label, 1, L), cell(r, col.nat, nat, { bf: 6 }), cell(r, col.range, range, { bf: 6 }));
      for (const k of ['b1', 'v1', 'b2', 'v2', 'sum']) cells.push(cell(r, col[k], '', { bf: 6, cp: 8 }));
      r++;
    };
    sumRow('소계', C().fmt(natSub), `${C().fmt(natSub - chaVar)}~${C().fmt(natSub + chaVar)}`);
    const cha = P.rows.filter(x => x.kind === 'cha');
    cells.push(hd(r, 0, ['창의적 체험', '활동'], cha.length), cell(r, col.nat, C().fmt(band.cha), { rs: cha.length }), cell(r, col.range, `${band.cha}±${chaVar}`, { rs: cha.length }),
      cell(r, col.b1, num(P.chaBase[0]), { rs: cha.length }), cell(r, col.b2, num(P.chaBase[1]), { rs: cha.length }), cell(r, col.sum, '', { rs: cha.length, cp: 8 }));
    cha.forEach((x, i) => cells.push(hd(r + i, 1, x.name, 1, L - 1), cell(r + i, col.v1, num(x.v[0])), cell(r + i, col.v2, num(x.v[1]))));
    r += cha.length;
    sumRow('소계', C().fmt(band.cha), `${band.cha - chaVar}~${band.cha + chaVar}`);
    cells.push(hd(r, 0, '학년(군)별 총 수업 시간 수', 1, L), cell(r, col.nat, C().fmt(band.total), { cs: 2, bf: 6, cp: 8 }));
    for (const k of ['b1', 'v1', 'b2', 'v2', 'sum']) cells.push(cell(r, col[k], '', { bf: 6, cp: 8 }));
    r++;
    const rel = L === 2 ? [8, 14] : [6, 6, 14];
    return table(r, [...rel, 8, 11, 9, 12, 9, 12, 12], cells);
  }

  function chaTable() {
    const cells = [hd(0, 0, '영역', 2), hd(0, 1, '활동', 2), hd(0, 2, '활동 내용', 2), hd(0, 3, '학년별 시간 배정', 1, 6), hd(0, 9, '비고', 2)];
    for (let k = 0; k < 6; k++) cells.push(hd(1, 3 + k, String(k + 1)));
    const areas = [['자율·자치활동', '자치·적응, 창의주제 활동', '학교 행사·안전·계기 교육 등'], ['동아리활동', '동아리 활동', '학술·문화·예술·체육 등'], ['진로활동', '진로 탐색 활동', '진로 탐색·설계']];
    let r = 2;
    for (const [area, act, what] of areas) {
      cells.push(hd(r, 0, area, 2), cell(r, 1, act), cell(r, 2, what, { pp: 21 }), cell(r, 9, ''), cell(r + 1, 1, '소계', { cs: 2, bf: 6, cp: 8 }), cell(r + 1, 9, '', { bf: 6 }));
      for (let k = 0; k < 6; k++) cells.push(cell(r, 3 + k, ''), cell(r + 1, 3 + k, '', { bf: 6, cp: 8 }));
      r += 2;
    }
    for (const label of ['본교 운영 계획 시수', '운영 기준시수']) {
      cells.push(hd(r, 0, label, 1, 3), cell(r, 9, ''));
      for (let k = 0; k < 6; k++) cells.push(cell(r, 3 + k, '', { cp: 8 }));
      r++;
    }
    return table(r, [10, 14, 22, 5, 5, 5, 5, 5, 5, 10], cells);
  }

  function baseTable(cfg) {
    const cells = [hd(0, 0, ['요일', '학년'])];
    '월화수목금'.split('').forEach((w, k) => cells.push(hd(0, 1 + k, w)));
    cells.push(hd(0, 6, '계'));
    for (let gr = 1; gr <= 6; gr++) {
      cells.push(hd(gr, 0, String(gr)));
      cfg.base[gr].forEach((p, k) => cells.push(cell(gr, 1 + k, String(p))));
      cells.push(cell(gr, 6, '', { bf: 6, cp: 8 }));
    }
    return table(7, [16, 12, 12, 12, 12, 12, 12], cells);
  }

  // 문서 전체 본문(section0.xml). 합계·증감 같은 파생값은 비워 두고 buildEdits가 채운다
  function buildSection(cfg, plan, year) {
    tblSeq = 0;
    const res = C().calc(cfg), SK = g.HWPX_SKELETON;
    const h = t => para(t, 11, 22), sub = (t, pp = 21) => para(t, 8, pp);
    const body = [
      para(`${year}학년도 수업일수 및 교육과정 운영 계획`, 10, 24),
      h('가. 학사일정'), schedTable(cfg),
      h('나. 학기별, 월별 수업일수'), monthsTable(res),
      h('다. 연간 수업일수 및 수업시수'),
      ...res.sems.flatMap(sem => [para(`${sem.name}(${dText(sem.from).replace(/\(.\)$/, '')}~${dText(sem.to).replace(/\(.\)$/, '')})`, 7, 23), weekTable(cfg, sem)]),
      summaryTable(year),
      h('라. 학년(군)별 수업시수'),
      ...[1, 2, 3, 4, 5, 6].flatMap(gr => [sub(`○ ${gr}학년`), gradeTable(gr, plan, year)]),
      h('마. 창의적 체험활동 시간 배당'), chaTable(),
      h('바. 학년(군)별 주간 수업시간 배당'), baseTable(cfg),
    ];
    return SK.secOpen + SK.secFirstP + body.join('') + '</hs:sec>';
  }

  // HWPX 묶기: 골격 파트 + 본문. mimetype은 무압축·첫 항목
  async function packHwpx(sectionXml) {
    const SK = g.HWPX_SKELETON, zip = new g.JSZip();
    for (const n of SK.order) {
      if (n === 'mimetype') zip.file(n, SK.text[n], { compression: 'STORE', createFolders: false });
      else if (n === 'Contents/section0.xml') zip.file(n, sectionXml, { createFolders: false });
      else if (SK.b64[n]) zip.file(n, SK.b64[n], { base64: true, createFolders: false });
      else zip.file(n, SK.text[n], { createFolders: false });
    }
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/hwp+zip' });
  }

  const api = { weekNotes, holidaysFor, hasLunar, LUNAR, ELECTIONS, BANDS, bandOf, defaultCfg, defaultPlan, buildSection, packHwpx, rangeOf };
  if (typeof module !== 'undefined') module.exports = api;
  g.Blank = api;
})(typeof window !== 'undefined' ? window : globalThis);
