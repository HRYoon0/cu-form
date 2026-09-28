// 교육과정 시수 계산 + HWPX 표 읽기/쓰기 (브라우저·node 공용, DOM 미사용)
(function (g) {
  'use strict';

  // ───────── 날짜 ─────────
  const D = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const iso = dt => dt.toISOString().slice(0, 10);
  const addDays = (dt, n) => new Date(dt.getTime() + n * 864e5);
  const GRADES = [1, 2, 3, 4, 5, 6];

  // ───────── 편성 기준 (근거: 2026 경상남도 초등학교 교육과정 설계·운영 도움자료, 2025 초등학교 학교자율시간 도움자료) ─────────
  const RULES = {
    minSchoolDays: 190,                              // 연간 수업일수 190일 이상
    maxDaily: g => (g <= 2 ? 5 : 6),                 // 1일 수업 시수: 1~2학년 5, 3~6학년 6시간 이하
    maxDailyEvent: 8,                                // 현장체험학습 등은 사전 계획 근거로 최대 8시간
    changeRate: 0.2,                                 // 교과(군)·창체 기준 시수의 20% 범위 증감
    weeks: 34,                                       // 학교자율시간 = 학년 총 수업 시간 수 ÷ 34 (1주 분량)
    minAutoSubject: 17,                              // 새 과목 개설 시 17차시 이상(경남)
    maxAutoPerTerm: 2,                               // 한 학년 한 학기 2개 이내 과목·활동
  };
  const norm = s => String(s || '').replace(/[\s·]/g, '');
  // 국가 교육과정 교과(과목). 이 밖의 교과 행은 학교자율시간 과목으로 본다
  const STANDARD = new Set(['국어', '사회', '도덕', '수학', '과학', '실과', '체육', '음악', '미술', '영어', '바른생활', '슬기로운생활', '즐거운생활'].map(norm));
  const NO_REDUCE = new Set(['체육', '음악', '미술'].map(norm));        // 기준 시수 감축 불가
  const NO_REDUCE_GN = new Set(['즐거운생활'].map(norm));              // 감축하지 않도록 권장(경남)

  // ───────── 달력 계산 ─────────
  // cfg = { semesters:[{name,from,to}], vacations:[{name,from,to}], holidays:[{name,from,to}],
  //         base:{1:[월,화,수,목,금],...}, events:[{name,from,to,grades:[..],periods}] }
  function offReason(cfg, s) {
    const w = D(s).getUTCDay();
    if (w === 0 || w === 6) return '주말';
    for (const v of cfg.vacations) if (s >= v.from && s <= (v.to || v.from)) return v.name;
    for (const h of cfg.holidays) if (s >= h.from && s <= (h.to || h.from)) return h.name;
    return null;
  }

  // 그날 그 학년의 교시 수: 행사가 있으면 행사 교시, 없으면 요일 기본. 행사가 겹치면 기간이 짧은 쪽 우선
  function periodsOn(cfg, s, gr) {
    let best = null, span = Infinity;
    for (const e of cfg.events) {
      const to = e.to || e.from;
      if (s < e.from || s > to || !e.grades.includes(gr)) continue;
      const len = D(to) - D(e.from);
      if (len <= span) { best = e; span = len; }
    }
    return best ? +best.periods : +cfg.base[gr][D(s).getUTCDay() - 1];
  }

  function semesterWeeks(cfg, sem) {
    let mon = D(sem.from);
    mon = addDays(mon, -((mon.getUTCDay() + 6) % 7));
    const weeks = [];
    for (; iso(mon) <= sem.to; mon = addDays(mon, 7)) {
      const dates = [], off = [];
      for (let i = 0; i < 5; i++) {
        const s = iso(addDays(mon, i));
        if (s < sem.from || s > sem.to) { off.push(null); continue; }
        const why = offReason(cfg, s);
        off.push(why);
        if (!why) dates.push(s);
      }
      if (!dates.length) continue;                       // 수업일이 없는 주(방학 중)는 표에 없다
      const hours = GRADES.map(gr => dates.reduce((a, s) => a + periodsOn(cfg, s, gr), 0));
      const thu = addDays(mon, 3);                        // 주의 소속 월 = 목요일이 있는 달(파일 관례와 일치)
      weeks.push({ mon: iso(mon), dates, off, hours, month: thu.getUTCMonth() + 1 });
    }
    return weeks;
  }

  function calc(cfg) {
    const sems = cfg.semesters.map(sem => {
      const weeks = semesterWeeks(cfg, sem);
      const dow = [0, 0, 0, 0, 0], months = {};
      let days = 0;
      const hours = [0, 0, 0, 0, 0, 0];
      for (const w of weeks) {
        for (const s of w.dates) {
          dow[D(s).getUTCDay() - 1]++;
          const m = D(s).getUTCMonth() + 1;
          months[m] = (months[m] || 0) + 1;
          days++;
        }
        w.hours.forEach((h, i) => { hours[i] += h; });
      }
      return { ...sem, weeks, dow, months, days, hours };
    });
    const vacationDays = cfg.vacations.reduce((a, v) => a + (D(v.to) - D(v.from)) / 864e5 + 1, 0);
    return {
      sems,
      totalDays: sems.reduce((a, s) => a + s.days, 0),
      vacationDays,
      gradeTotals: GRADES.map((_, i) => sems.reduce((a, s) => a + s.hours[i], 0)),
    };
  }

  // ───────── 숫자 표기 ─────────
  const num = t => { const m = String(t || '').replace(/\s/g, '').match(/^-?[\d,]+/); return m ? parseInt(m[0].replace(/,/g, ''), 10) : null; };
  const fmt = n => n.toLocaleString('en-US');
  const diffStr = d => (d ? `(${d > 0 ? '+' : ''}${d})` : '');
  const withDiff = (n, base) => fmt(n) + diffStr(n - base);

  // ───────── HWPX 표 파싱 ─────────
  const decode = s => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function paraTexts(xml) {
    return [...xml.matchAll(/<hp:p\b[^>]*>([\s\S]*?)<\/hp:p>/g)]
      .map(p => [...p[1].matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)].map(t => decode(t[1])).join('').trim())
      .filter(Boolean);
  }

  function parseTables(xml) {
    const tables = [];
    for (const m of xml.matchAll(/<hp:tbl\b[\s\S]*?<\/hp:tbl>/g)) {
      const tx = m[0];
      if (tx.indexOf('<hp:tbl', 1) > 0) throw new Error('표 안에 표가 들어 있는 문서는 아직 지원하지 않습니다.');
      const rows = +tx.match(/rowCnt="(\d+)"/)[1], cols = +tx.match(/colCnt="(\d+)"/)[1];
      const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
      const cells = [];
      for (const c of tx.matchAll(/<hp:tc\b[\s\S]*?<\/hp:tc>/g)) {
        const x = c[0];
        const cell = {
          r: +x.match(/rowAddr="(\d+)"/)[1], c: +x.match(/colAddr="(\d+)"/)[1],
          rs: +x.match(/rowSpan="(\d+)"/)[1], cs: +x.match(/colSpan="(\d+)"/)[1],
          start: m.index + c.index, end: m.index + c.index + x.length, xml: x,
        };
        cell.paras = paraTexts(x);
        cell.text = cell.paras.join('\n');
        cell.flat = cell.text.replace(/\s/g, '');
        cells.push(cell);
        for (let r = cell.r; r < cell.r + cell.rs; r++)
          for (let k = cell.c; k < cell.c + cell.cs; k++) if (grid[r] && k < cols) grid[r][k] = cell;
      }
      tables.push({ rows, cols, cells, grid, flat: cells.map(c => c.flat).join('|'), at: (r, k) => (grid[r] || [])[k] || null });
    }
    return tables;
  }

  // 칸 글자 교체: 첫 문단 모양만 남기고 글 한 줄로. 계산식 필드·줄배치 캐시는 버린다(한글이 다시 계산)
  function setCellText(xml, text) {
    const paras = [...xml.matchAll(/<hp:p\b[^>]*>[\s\S]*?<\/hp:p>/g)];
    if (!paras.length) throw new Error('문단 없는 칸');
    const open = paras[0][0].match(/^<hp:p\b[^>]*>/)[0];
    const cp = (paras[0][0].match(/<hp:run charPrIDRef="(\d+)"/) || [])[1] || '0';
    const p = `${open}<hp:run charPrIDRef="${cp}"><hp:t>${esc(text)}</hp:t></hp:run></hp:p>`;
    const first = paras[0].index, last = paras[paras.length - 1];
    return xml.slice(0, first) + p + xml.slice(last.index + last[0].length);
  }

  function applyEdits(xml, edits) {
    const sorted = [...edits].sort((a, b) => b.cell.start - a.cell.start);
    for (let i = 1; i < sorted.length; i++)
      if (sorted[i].cell === sorted[i - 1].cell) throw new Error('같은 칸을 두 번 고치려 함: ' + sorted[i].text);
    let out = xml;
    for (const e of sorted) out = out.slice(0, e.cell.start) + (e.xml || setCellText(e.cell.xml, e.text)) + out.slice(e.cell.end);
    return out;
  }

  // ───────── 문서 읽기 ─────────
  function parseDates(txt) {
    const m = txt.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./);
    if (!m) return null;
    const p = (y, mo, d) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const from = p(m[1], m[2], m[3]);
    const r = txt.slice(m.index + m[0].length).match(/~\s*(?:(\d{4})\.\s*)?(\d{1,2})\.\s*(\d{1,2})\./);
    return { from, to: r ? p(r[1] || m[1], r[2], r[3]) : from };
  }

  function readGradeTable(t, grade) {
    const L = t.cols - 7;
    const col = { nat: L, range: L + 1, b1: L + 2, v1: L + 3, b2: L + 4, v2: L + 5, sum: L + 6 };
    const hdrGrade = k => { const m = (t.at(1, col[k]) || {}).text?.match(/(\d)학년/); return m ? +m[1] : null; };
    const years = { 1: hdrGrade('b1'), 2: hdrGrade('b2') };
    const cur = years[1] === grade ? 1 : years[2] === grade ? 2 : null;
    if (!cur) throw new Error(`${grade}학년 교과 표에서 ${grade}학년 열을 찾지 못했습니다.`);
    const rows = [];
    let subtotals = 0;
    for (let r = 4; r < t.rows; r++) {
      const nameCell = t.at(r, L - 1);
      const name = nameCell ? nameCell.text.replace(/\n/g, ' ') : '';
      let kind;
      if (/총\s*수업/.test(name)) kind = 'total';
      else if (name.replace(/\s/g, '') === '소계') kind = subtotals++ === 0 ? 'subSum' : 'chaSum';
      else kind = subtotals === 0 ? 'sub' : 'cha';
      const cells = {};
      for (const k of Object.keys(col)) cells[k] = t.at(r, col[k]);
      rows.push({ r, name, kind, cells });
    }
    return { grade, cur, years, rows, col, table: t };
  }

  function readDoc(xml) {
    const T = parseTables(xml);
    const pick = (label, pred) => { const i = T.findIndex(pred); if (i < 0) throw new Error(`'${label}' 표를 찾지 못했습니다.`); return T[i]; };
    const doc = {
      sched: pick('학사일정', t => t.flat.startsWith('행사|기간')),
      months: pick('월별 수업일수', t => t.flat.includes('수업일수총합계')),
      cal: T.filter(t => t.flat.includes('학년별주당수업시수')),
      summary: pick('연간 수업일수·시수 요약', t => t.flat.startsWith('연간수업일수')),
      grades: T.filter(t => t.flat.includes('총수업시간수')),
      cha: pick('창의적 체험활동 시간 배당', t => t.flat.includes('학년별시간배정')),
      baseT: pick('주간 수업시간 배당', t => t.flat.startsWith('요일')),
    };
    if (doc.cal.length !== 2) throw new Error('학기별 주간 시수 표 2개를 찾지 못했습니다.');
    if (doc.grades.length !== 6) throw new Error(`학년별 교과 표가 6개가 아닙니다(${doc.grades.length}개).`);

    const allText = paraTexts(xml).join('\n');
    const semesters = [1, 2].map(n => {
      const d = [...allText.matchAll(new RegExp(`${n}학기\\s*\\(([^)]*)\\)`, 'g'))].map(m => parseDates(m[1])).find(x => x && x.to !== x.from);
      if (!d) throw new Error(`${n}학기 기간(예: ${n}학기(2026. 3. 1.~2026. 8. 30.))을 찾지 못했습니다.`);
      return { name: `${n}학기`, ...d };
    });

    const holidays = [], vacations = [];
    for (let r = 1; r < doc.sched.rows; r++) {
      const name = (doc.sched.at(r, 0) || {}).text || '', d = parseDates((doc.sched.at(r, 1) || {}).text || '');
      if (!d) continue;
      if (/(시업|입학|방학|개학|종업|졸업)식/.test(name)) continue;       // 수업하는 날
      (/방학/.test(name) ? vacations : holidays).push({ name, ...d });
    }

    const base = {};
    for (let r = 1; r < doc.baseT.rows; r++) {
      const gr = num(doc.baseT.at(r, 0).text);
      if (gr) base[gr] = [1, 2, 3, 4, 5].map(k => num(doc.baseT.at(r, k).text));
    }

    doc.gradeModels = doc.grades.map((t, i) => readGradeTable(t, i + 1));
    doc.cfg = { semesters, vacations, holidays, base };
    return doc;
  }

  // ───────── 교과 표 계산 ─────────
  // vals: Map(cell → 숫자). 칸 객체를 열쇠로 써서 병합 칸이 한 번만 더해지게 한다
  function initialVals(model) {
    const vals = new Map();
    for (const row of model.rows) for (const k of ['b1', 'v1', 'b2', 'v2']) {
      const c = row.cells[k];
      if (c && !vals.has(c)) vals.set(c, num(c.text));
    }
    return vals;
  }

  const uniq = arr => [...new Set(arr.filter(Boolean))];

  function gradeCompute(model, vals) {
    const v = c => (c && vals.get(c)) || 0;
    const edits = [], checks = [];
    const rowsOf = kind => model.rows.filter(x => x.kind === kind);
    const rowSet = kind => new Set(rowsOf(kind).map(x => x.r));
    const cellsIn = (k, rs) => uniq(model.rows.map(x => x.cells[k])).filter(c => rs.has(c.r));
    const put = (cell, text) => { if (cell) edits.push({ cell, text }); };
    const tot = { 1: { b: 0, v: 0 }, 2: { b: 0, v: 0 } };

    for (const Y of [1, 2]) {
      for (const [kind, sumKind] of [['sub', 'subSum'], ['cha', 'chaSum']]) {
        const rs = rowSet(kind);
        const vc = cellsIn('v' + Y, rs), bc = cellsIn('b' + Y, rs);
        const vSum = vc.reduce((a, c) => a + v(c), 0), bSum = bc.reduce((a, c) => a + v(c), 0);
        vc.forEach((c, i) => {
          if (vals.get(c) === null) return;
          if (kind === 'sub') { const b = bc.find(x => x.r === c.r); put(c, withDiff(v(c), b ? v(b) : 0)); }
          else put(c, fmt(v(c)) + (i === 0 ? diffStr(vSum - bSum) : ''));   // 창체 증감은 첫 활동(자율) 칸에 몰아 표시
        });
        const srow = rowsOf(sumKind)[0];
        if (srow) { put(srow.cells['b' + Y], fmt(bSum)); put(srow.cells['v' + Y], withDiff(vSum, bSum)); }
        tot[Y].b += bSum; tot[Y].v += vSum;
      }
      const trow = rowsOf('total')[0];
      if (trow) { put(trow.cells['b' + Y], fmt(tot[Y].b)); put(trow.cells['v' + Y], withDiff(tot[Y].v, tot[Y].b)); }
    }

    // 합계 열: 병합된 행 범위 안의 두 해 값을 모두 더한다
    const spanSum = (r0, rs, filter) => {
      const inSpan = x => x.r >= r0 && x.r < r0 + rs && filter(x);
      let V = 0, B = 0;
      for (const k of ['v1', 'v2']) V += uniq(model.rows.filter(inSpan).map(x => x.cells[k])).filter(c => c.r >= r0 && c.r < r0 + rs).reduce((a, c) => a + v(c), 0);
      for (const k of ['b1', 'b2']) B += uniq(model.rows.filter(inSpan).map(x => x.cells[k])).filter(c => c.r >= r0 && c.r < r0 + rs).reduce((a, c) => a + v(c), 0);
      return { V, B };
    };
    for (const c of uniq(model.rows.filter(x => x.kind === 'sub' || x.kind === 'cha').map(x => x.cells.sum))) {
      const { V, B } = spanSum(c.r, c.rs, () => true);
      put(c, withDiff(V, B));
    }
    for (const [sumKind, kinds] of [['subSum', ['sub']], ['chaSum', ['cha']], ['total', ['sub', 'cha']]]) {
      const row = rowsOf(sumKind)[0];
      if (!row) continue;
      const { V, B } = spanSum(0, 999, x => kinds.includes(x.kind));
      put(row.cells.sum, withDiff(V, B));
    }

    // 증감 범위 검사: 국가기준 칸(병합) 범위의 두 해 합계
    for (const nc of uniq(model.rows.filter(x => x.kind === 'sub' || x.kind === 'cha').map(x => x.cells.nat))) {
      const rc = model.table.at(nc.r, model.col.range);
      const t = (rc && rc.flat) || '';
      let lo, hi, m;
      if ((m = t.match(/^([\d,]+)[~\-]([\d,]+)$/))) { lo = num(m[1]); hi = num(m[2]); }
      else if ((m = t.match(/^([\d,]+)±([\d,]+)$/))) { lo = num(m[1]) - num(m[2]); hi = num(m[1]) + num(m[2]); }
      else continue;
      const { V } = spanSum(nc.r, nc.rs, () => true);
      const names = model.rows.filter(x => x.r >= nc.r && x.r < nc.r + nc.rs).map(x => x.name).join('·');
      if (V < lo || V > hi) checks.push({ level: 'error', msg: `${model.grade}학년 표 · ${names}: 두 해 합계 ${fmt(V)}가 증감 범위 ${fmt(lo)}~${fmt(hi)}를 벗어났습니다.` });
    }

    return { edits, checks, curTotal: tot[model.cur].v, curBase: tot[model.cur].b, otherTotal: tot[3 - model.cur].v, tot };
  }

  // 현재 학년도 창체 활동별 값 (표13용)
  function chaValues(model, vals) {
    const k = 'v' + model.cur;
    const rows = model.rows.filter(x => x.kind === 'cha');
    const get = kw => { const row = rows.find(x => x.name.includes(kw)); return row && vals.get(row.cells[k]); };
    return {
      자율: get('자율'), 동아리: get('동아리'), 진로: get('진로'),
      total: uniq(rows.map(x => x.cells[k])).reduce((a, c) => a + (vals.get(c) || 0), 0),
    };
  }

  // ───────── 전체 반영 목록 만들기 ─────────
  function buildEdits(doc, cfg, gradeVals) {
    const res = calc(cfg);
    const edits = [], checks = [];
    const put = (table, cell, text, why) => { if (cell && cell.text !== text) edits.push({ table, cell, text, why }); };
    const warn = msg => checks.push({ level: 'warn', msg });
    const year0 = +cfg.semesters[0].from.slice(0, 4);

    if (!cfg.events.length) warn('행사 시수 조정이 비어 있습니다. 시업식·방학식처럼 교시가 달라지는 날을 넣지 않으면 주별 시수가 요일 기본값으로만 계산됩니다. «주별 시수» 탭의 노란 칸(파일과 다른 주)을 보고 채우거나, 설정 JSON을 불러오세요.');

    // 학사 기준
    if (res.totalDays < RULES.minSchoolDays) checks.push({ level: 'error', msg: `연간 수업일수 ${res.totalDays}일: 190일 이상이어야 합니다(학교운영위원회 심의).` });
    if (!cfg.semesters[0].from.endsWith('-03-01')) warn(`1학기는 3월 1일부터 시작해야 합니다(지금 ${cfg.semesters[0].from}).`);
    const febEnd = iso(new Date(Date.UTC(year0 + 1, 2, 0)));   // 다음 해 2월 말일
    if (cfg.semesters[1].to !== febEnd) warn(`2학기는 다음 해 2월 말일(${febEnd})까지여야 합니다(지금 ${cfg.semesters[1].to}).`);
    for (const gr of GRADES) {
      const over = cfg.base[gr].map((p, k) => ({ p: +p, w: '월화수목금'[k] })).filter(x => x.p > RULES.maxDaily(gr));
      if (over.length) checks.push({ level: 'error', msg: `${gr}학년 요일별 기본 시수(${over.map(x => `${x.w} ${x.p}`).join(', ')}): 하루 ${RULES.maxDaily(gr)}시간을 넘을 수 없습니다.` });
    }
    for (const e of cfg.events) {
      let d = e.from, any = false;
      for (; d <= (e.to || e.from); d = iso(addDays(D(d), 1))) if (!offReason(cfg, d)) { any = true; break; }
      if (!any) warn(`행사 «${e.name}»(${e.from}${e.to && e.to !== e.from ? '~' + e.to : ''})가 수업일이 아닌 날에 있어 계산에 반영되지 않습니다. 날짜를 확인하세요.`);
    }
    for (const e of cfg.events) for (const gr of e.grades) {
      if (+e.periods > RULES.maxDailyEvent) checks.push({ level: 'error', msg: `행사 «${e.name}» ${gr}학년 ${e.periods}교시: 하루 최대 ${RULES.maxDailyEvent}시간을 넘습니다.` });
      else if (+e.periods > RULES.maxDaily(gr)) warn(`행사 «${e.name}» ${gr}학년 ${e.periods}교시: 평소 한도 ${RULES.maxDaily(gr)}시간을 넘습니다. 현장체험학습 등 사전 운영 계획이 있을 때만 가능합니다(최대 8시간).`);
    }

    // 요일별 기본 시수 표
    const bt = doc.baseT;
    for (let r = 1; r < bt.rows; r++) {
      const gr = num(bt.at(r, 0).text);
      if (!gr) continue;
      cfg.base[gr].forEach((p, i) => put('주간 시수 배당', bt.at(r, i + 1), String(p)));
      put('주간 시수 배당', bt.at(r, 6), String(cfg.base[gr].reduce((a, b) => a + +b, 0)));
    }

    // 학기별 주간 시수 표
    doc.cal.forEach((t, si) => {
      const sem = res.sems[si];
      const h0 = t.cells.filter(c => c.r === 0);
      const colDays = h0.find(c => c.flat === '수업일수').c;
      const colG = h0.find(c => c.flat.includes('학년별')).c;
      const colW = h0.find(c => c.flat.includes('연간수업일수')).c;
      const weekRows = [];
      let sumRow = null;
      for (let r = 2; r < t.rows; r++) {
        const wc = t.at(r, 1);
        if (wc && wc.r === r && /^\d+$/.test(wc.flat)) weekRows.push(r);
        else if ((t.at(r, 0) || {}).flat?.includes('소계')) sumRow = r;
      }
      const label = `${sem.name} 주간 시수`;
      if (weekRows.length !== sem.weeks.length) {
        checks.push({ level: 'error', msg: `${sem.name}: 파일의 주 수(${weekRows.length})와 계산한 주 수(${sem.weeks.length})가 다릅니다. 한글에서 표의 행을 맞춘 뒤 다시 불러오세요. 이 표는 반영하지 않습니다.` });
        return;
      }
      weekRows.forEach((r, i) => {
        const w = sem.weeks[i];
        put(label, t.at(r, colDays), String(w.dates.length), `${i + 1}주`);
        w.hours.forEach((h, gi) => put(label, t.at(r, colG + gi), String(h), `${i + 1}주 ${gi + 1}학년`));
      });
      if (sumRow !== null) {
        sem.dow.forEach((n, k) => put(label, t.at(sumRow, colW + k), String(n), '소계 요일'));
        put(label, t.at(sumRow, colDays), String(sem.days), '소계 일수');
        sem.hours.forEach((h, gi) => put(label, t.at(sumRow, colG + gi), fmt(h), `소계 ${gi + 1}학년`));
      }
    });

    // 월별 수업일수 표
    const mt = doc.months;
    for (let r = 0; r < mt.rows; r++) {
      const monthLabel = mt.cells.find(c => c.r === r && c.flat === '월');
      if (!monthLabel) continue;
      const si = (mt.at(r, 1) || {}).flat?.includes('2학기') ? 1 : 0;
      for (const c of mt.cells.filter(x => x.r === r && x.c > monthLabel.c).sort((a, b) => a.c - b.c)) {
        if (c.flat === '계') { put('월별 수업일수', mt.at(r + 1, c.c), String(res.sems[si].days), `${si + 1}학기 계`); break; }
        const m = num(c.flat);
        if (m >= 1 && m <= 12) put('월별 수업일수', mt.at(r + 1, c.c), String(res.sems[si].months[m] || 0), `${m}월`);
      }
    }
    for (const c of mt.cells) {
      if (c.flat === '수업일수총합계') put('월별 수업일수', mt.at(c.r, c.c + c.cs), `${res.totalDays}일`);
      if (c.flat === '방학일수총합계') put('월별 수업일수', mt.at(c.r, c.c + c.cs), `${res.vacationDays}일`);
    }

    // 교과 표
    const gradeResults = doc.gradeModels.map((m, i) => {
      const gr = gradeCompute(m, gradeVals[i]);
      gr.edits.forEach(e => put(`${m.grade}학년 교과 시수`, e.cell, e.text));
      checks.push(...gr.checks);
      const calTotal = res.gradeTotals[i];
      if (gr.curTotal !== calTotal)
        checks.push({ level: 'error', grade: m.grade, residual: calTotal - gr.curTotal, msg: `${m.grade}학년: 교과·창체 합계 ${fmt(gr.curTotal)}시간이 달력 시수 ${fmt(calTotal)}시간과 다릅니다. ${calTotal > gr.curTotal ? `${calTotal - gr.curTotal}시간을 더 배분해야` : `${gr.curTotal - calTotal}시간을 줄여야`} 합니다.` });
      // 1·3·5학년은 내년 계획까지 더한 두 해 합계가 학년군 최소 시수 이상인지(2·4·6학년은 연간 요약 표에서 검사)
      const minCell = m.rows.find(x => x.kind === 'total')?.cells.nat;
      const twoYear = gr.tot[1].v + gr.tot[2].v - gr.curTotal + calTotal;
      if (m.cur === 1 && minCell && num(minCell.flat) && twoYear < num(minCell.flat))
        checks.push({ level: 'error', msg: `${m.grade}학년 표: 올해 시수와 내년 계획을 더한 ${fmt(twoYear)}시간이 학년군 최소 ${minCell.text}시간에 못 미칩니다.` });

      // 학교자율시간 (3~4·5~6학년군 한 학기 이상 필수, 학년 총 시수 ÷ 34, 과목 17차시 이상, 한 학기 2개 이내)
      const auto = { 1: autonomousSubjects(m, gradeVals[i], 1), 2: autonomousSubjects(m, gradeVals[i], 2) };
      const autoInfo = [];
      for (const Y of [1, 2]) {
        const gy = m.years[Y], yy = year0 + (gy - m.grade), list = auto[Y];
        const T = Y === m.cur ? calTotal : gr.tot[Y].v;
        const need = Math.floor(T / RULES.weeks), sum = list.reduce((a, x) => a + x.hours, 0);
        const who = `${gy}학년(${yy}년${Y === m.cur ? '' : Y < m.cur ? ', 지난해' : ', 내년 계획'})`;
        autoInfo.push({ Y, gy, yy, list, sum, need, T, cur: Y === m.cur, rel: Y === m.cur ? '올해' : Y < m.cur ? '지난해' : '내년 계획' });
        if (!list.length) continue;
        if (sum < need) warn(`${m.grade}학년 표 · ${who} 학교자율시간 ${sum}시간: 총 수업 시간 수 ${fmt(T)}÷34 = ${(T / RULES.weeks).toFixed(2)} → ${need}시간(또는 ${need + 1}시간) 이상이 기준입니다.`);
        for (const x of list) if (x.hours < RULES.minAutoSubject) warn(`${m.grade}학년 표 · ${who} «${x.name}» ${x.hours}시간: 학교자율시간 과목은 17차시 이상 편성합니다(경남).`);
        if (list.length > RULES.maxAutoPerTerm) warn(`${m.grade}학년 표 · ${who} 학교자율시간 과목이 ${list.length}개: 한 학기 2개 이내로 운영합니다.`);
      }
      if (m.grade >= 3 && !auto[1].length && !auto[2].length) {
        const pair = m.grade <= 4 ? '3~4' : '5~6';
        warn(`${m.grade}학년 표: ${pair}학년군 두 해(${autoInfo.map(a => `${a.gy}학년 ${a.yy}년`).join('·')}) 어디에도 학교자율시간 과목이 없습니다. ${pair}학년군은 한 학기 이상 필수입니다.`);
      }
      gr.autoInfo = autoInfo;

      // 학년 표 머리글 연도 바로잡기(예: 3학년(2024년) → 2025년)
      for (const Y of [1, 2]) {
        const hc = m.table.at(1, m.col['b' + Y]);
        const gy = m.years[Y];
        if (!hc || !gy) continue;
        const want = year0 + (gy - m.grade);
        const fixed = hc.xml.replace(/(<hp:t>[^<]*?\d학년\()(\d{4})(년\))/, (a, p, y, s) => p + want + s);
        if (fixed !== hc.xml) edits.push({ table: `${m.grade}학년 교과 시수`, cell: hc, xml: fixed, text: `${gy}학년(${want}년)`, why: '머리글 연도' });
      }
      return { ...gr, calTotal };
    });

    // 연간 요약 표
    const st = doc.summary;
    const rowBy = (re) => { for (let r = 0; r < st.rows; r++) for (const k of [2, 3]) { const c = st.at(r, k); if (c && re.test(c.flat)) return r; } return -1; };
    const rSem1 = rowBy(/^1학기$/), rSem2 = rowBy(/^2학기$/), rTot = rowBy(/^시수합계$/);
    const rPrev = rowBy(/^\d{4}학년도이수/), rCum = rowBy(/~.*이수/), rMin = rowBy(/최소/);
    for (let gi = 0; gi < 6; gi++) {
      const k = 4 + gi;
      if (rSem1 >= 0) put('연간 요약', st.at(rSem1, k), fmt(res.sems[0].hours[gi]));
      if (rSem2 >= 0) put('연간 요약', st.at(rSem2, k), fmt(res.sems[1].hours[gi]));
      if (rTot >= 0) put('연간 요약', st.at(rTot, k), fmt(res.gradeTotals[gi]));
      const pc = rPrev >= 0 && st.at(rPrev, k);
      if (pc && pc.c === k && pc.flat) {
        const prev = gradeResults[gi].otherTotal;
        put('연간 요약', pc, fmt(prev));
        const cc = rCum >= 0 && st.at(rCum, k), mc = rMin >= 0 && st.at(rMin, k);
        if (cc && mc) {
          const cum = prev + res.gradeTotals[gi], min = num(mc.flat);
          put('연간 요약', cc, withDiff(cum, min));
          if (cum < min) checks.push({ level: 'error', msg: `${gi}~${gi + 1}학년군 두 해 합계 ${fmt(cum)}시간이 최소 ${fmt(min)}시간에 못 미칩니다.` });
        }
      }
    }
    for (let r = 0; r < st.rows; r++) {
      const lab = st.at(r, 0);
      if (!lab || lab.r !== r) continue;
      const vc = st.at(r, 1);
      if (/^1학기$/.test(lab.flat)) put('연간 요약', vc, String(res.sems[0].days));
      if (/^2학기$/.test(lab.flat)) put('연간 요약', vc, String(res.sems[1].days));
      if (/^합계$/.test(lab.flat)) put('연간 요약', vc, String(res.totalDays));
    }

    // 창체 시간 배당 표: 소계·단일 활동·운영 시수
    const ct = doc.cha;
    const cv = doc.gradeModels.map((m, i) => chaValues(m, gradeVals[i]));
    const areaKey = t => (t.includes('자율') ? '자율' : t.includes('동아리') ? '동아리' : t.includes('진로') ? '진로' : null);
    const areaRows = {};
    for (let r = 2; r < ct.rows; r++) {
      const a = ct.at(r, 0);
      const key = a && areaKey(a.flat);
      const isSum = (ct.at(r, 1) || {}).flat === '소계';
      if (key) {
        const ar = (areaRows[key] = areaRows[key] || { sum: null, items: [] });
        if (isSum) ar.sum = r; else ar.items.push(r);
      }
      for (let gi = 0; gi < 6; gi++) {
        const cell = ct.at(r, 3 + gi);
        if (!cell || cell.c !== 3 + gi) continue;
        // 파일 관례상 '운영 기준시수'도 본교 운영 계획 시수와 같은 값을 적는다
        if (a && (a.flat.includes('본교운영계획') || a.flat.includes('운영기준'))) put('창체 시간 배당', cell, String(cv[gi].total));
      }
    }
    for (const [key, ar] of Object.entries(areaRows)) {
      const targets = ar.sum !== null ? [ar.sum] : [];
      if (ar.items.length === 1) targets.push(ar.items[0]);
      for (const r of targets) for (let gi = 0; gi < 6; gi++) {
        const val = cv[gi][key];
        if (val !== null && val !== undefined) put('창체 시간 배당', ct.at(r, 3 + gi), String(val));
      }
    }

    return { res, edits, checks, gradeResults };
  }

  // 남는(모자란) 시수를 어느 과목에 배분할지 정하는 규칙
  // rows: 현재 학년도 교과·창체 행 [{name, kind:'sub'|'cha', base, value}], residual: 더해야 할 시간(음수면 빼야 함)
  // 반환: 새 값 배열(rows와 같은 순서) 또는 null(자동 배분 안 함 → 화면에 '직접 배분' 경고만 표시)
  // 규칙: 기준 대비 여유(비율)가 가장 큰 교과부터 1시간씩 → 모든 교과가 비슷한 비율로 고르게 늘고 준다.
  //  - 한 해 기준의 ±20% 안에서만 움직인다(교과군 두 해 합계 검사는 따로 한다)
  //  - 체육·음악·미술은 기준 밑으로, 즐거운 생활은 (경남 권장) 기준 밑으로 줄이지 않는다
  //  - 학교자율시간 과목(기준 없음)과 창체는 건드리지 않는다: 자율시간은 34주 기준 시수로 정해 두고,
  //    창체는 행사별 배당표(창체 시간 배당)와 묶여 있어서다
  function distributeResidual(rows, residual) {
    const next = rows.map(r => r.value);
    const cand = rows.map((r, i) => ({ i, ...r, key: norm(r.name) }))
      .filter(r => r.kind === 'sub' && r.base > 0 && r.value !== null && r.value !== undefined);
    const lo = r => (NO_REDUCE.has(r.key) || NO_REDUCE_GN.has(r.key) ? r.base : Math.ceil(r.base * (1 - RULES.changeRate)));
    const hi = r => Math.floor(r.base * (1 + RULES.changeRate));
    const dir = Math.sign(residual);
    for (let left = Math.abs(residual); left > 0; left--) {
      let best = null, bestScore = 0;
      for (const r of cand) {
        const room = dir > 0 ? hi(r) - next[r.i] : next[r.i] - lo(r);
        const score = room / r.base;
        if (room > 0 && (score > bestScore || (score === bestScore && best && r.base > best.base))) { best = r; bestScore = score; }
      }
      if (!best) break;                              // 더 옮길 여유가 없으면 남은 만큼은 경고로 남긴다
      next[best.i] += dir;
    }
    return next;
  }

  // 학교자율시간 과목: 교과 행 중 국가 교과가 아니고 그해 기준 시수가 없는 과목
  function autonomousSubjects(model, vals, Y) {
    const out = [];
    for (const row of model.rows) {
      if (row.kind !== 'sub' || STANDARD.has(norm(row.name))) continue;
      const c = row.cells['v' + Y], b = row.cells['b' + Y];
      if (!c || c.r !== row.r || !vals.get(c)) continue;
      if (b && b.r === row.r && vals.get(b)) continue;
      out.push({ name: row.name, hours: vals.get(c), row });
    }
    return out;
  }

  const api = { RULES, autonomousSubjects, calc, offReason, periodsOn, parseTables, readDoc, initialVals, gradeCompute, buildEdits, applyEdits, setCellText, distributeResidual, num, fmt, withDiff, iso, D, addDays };
  if (typeof module !== 'undefined') module.exports = api;
  g.Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
