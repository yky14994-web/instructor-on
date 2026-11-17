/* 외래강사 ON — 강사관리카드·개인정보 동의서 PDF 만들기(브라우저 안에서만, 서버 전송 없음)
 *
 * IonPdf.make(data, opt) → Promise<{ card: Uint8Array, consent: Uint8Array }>
 *   opt.PDFLib, opt.fontkit : 라이브러리(브라우저에서는 window 전역을 씀)
 *   opt.fonts = { regular, bold, hanja? }  글꼴 파일(바이트). hanja는 성명(한자)가 있을 때만 필요
 *   opt.photo = { bytes, type: 'jpg'|'png' } (선택) · opt.sign = PNG 바이트(선택) · opt.today = Date
 *
 * 글자 배치는 한글 원본 양식과 같은 칸 제목·순서로 그린다(업무 화면의 카드 읽기 규칙과 맞춤).
 * 업무 화면이 정확히 읽도록 입력값을 PDF 정보에 함께 넣는다(IonData). 주민등록번호·계좌는 넣지 않는다.
 */
(function (root) {
  'use strict';
  var W = 595.28, H = 841.89, L = 48, R = W - 48;
  var CONTACT = '061-860-4735';
  var OPT = {
    type: ['단독(개인) 강사', '기관 소속 파견 강사'],
    spec: [['직무교육', '소방업무 수행에 필요한 전문역량'], ['직무역량교육', '직무를 더 잘 수행하기 위한 공통역량'], ['소양교육', '소방공무원으로서 갖춰야 할 기본 가치와 태도']],
    field: ['화재진압', '구조', '구급·응급의료', '화재조사', '예방·안전점검', '소방시설', '위험물', '재난·상황관리', '소방차량·장비', '체력·안전관리', '법령·행정', '리더십·조직관리', '심리·스트레스', '인문·소양', '디지털·AI', '안전교육·교수법'],
    target: ['신규임용자', '재직자(실무자)', '지휘관·관리자', '의용소방대', '일반 국민', '장애인·어린이·노인'],
    method: ['이론 강의', '실습·실기', '사례·토론', '시뮬레이션·VR', '현장 견학'],
    days: ['월', '화', '수', '목', '금']
  };

  function make(d, opt) {
    var P = opt.PDFLib || root.PDFLib, fk = opt.fontkit || root.fontkit;
    var rgb = P.rgb, BLACK = rgb(0, 0, 0), GRAY = rgb(0.35, 0.35, 0.35), LINE = rgb(0.15, 0.15, 0.15), DASH = rgb(0.6, 0.6, 0.6);
    var today = opt.today || new Date();
    var ymdK = today.getFullYear() + '년 ' + (today.getMonth() + 1) + '월 ' + today.getDate() + '일';
    var s = function (v) { return v == null ? '' : String(v); };

    async function newDoc(title) {
      var doc = await P.PDFDocument.create(); doc.registerFontkit(fk);
      var F = { r: await doc.embedFont(opt.fonts.regular, { subset: true }), b: await doc.embedFont(opt.fonts.bold, { subset: true }) };
      if (opt.fonts.hanja) F.h = await doc.embedFont(opt.fonts.hanja, { subset: true });
      doc.setTitle(title); doc.setAuthor(s(d.nm)); doc.setCreator('외래강사 ON 웹 작성'); doc.setProducer('외래강사 ON');
      doc.setCreationDate(today); doc.setModificationDate(today);
      return { doc: doc, F: F };
    }
    function has(f, cp) { try { return f.embedder.font.hasGlyphForCodePoint(cp); } catch (e) { return true; } }
    function isHan(cp) { return (cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0x3400 && cp <= 0x4DBF); }
    // 글자마다 쓸 글꼴을 골라 같은 글꼴끼리 묶음. 글꼴에 없는 글자는 '?'
    function runs(F, str, bold) {
      var out = [], base = bold ? F.b : F.r;
      Array.from(str).forEach(function (ch) {
        var cp = ch.codePointAt(0), f = (isHan(cp) && F.h) ? F.h : base;
        if (!has(f, cp)) { if (has(base, cp)) f = base; else ch = '?'; }
        var last = out[out.length - 1];
        if (last && last.f === f) last.t += ch; else out.push({ f: f, t: ch });
      });
      return out;
    }
    function width(F, str, size, bold) { return runs(F, str, bold).reduce(function (a, r) { return a + r.f.widthOfTextAtSize(r.t, size); }, 0); }
    function text(pg, F, str, x, y, size, bold, color) {
      runs(F, str, bold).forEach(function (r) { pg.drawText(r.t, { x: x, y: y, size: size, font: r.f, color: color || BLACK }); x += r.f.widthOfTextAtSize(r.t, size); });
    }
    function wrap(F, str, size, bold, maxW) {
      var out = [];
      s(str).replace(/\r/g, '').split('\n').forEach(function (para) {
        if (!para.trim()) { out.push(''); return; }
        var line = '';
        para.split(/(\s+)/).forEach(function (tok) {
          if (!tok) return;
          var t = line + tok;
          if (width(F, t, size, bold) <= maxW) { line = t; return; }
          if (line.trim()) { out.push(line.replace(/\s+$/, '')); line = ''; tok = tok.replace(/^\s+/, ''); if (!tok) return; }
          Array.from(tok).forEach(function (ch) {   // 한 낱말이 너무 길면 글자 단위로 자름
            if (width(F, line + ch, size, bold) > maxW && line) { out.push(line); line = ''; }
            line += ch;
          });
        });
        out.push(line.replace(/\s+$/, ''));
      });
      while (out.length && out[out.length - 1] === '') out.pop();
      return out;
    }
    function box(pg, x, y, w, h, thick) { pg.drawRectangle({ x: x, y: y - h, width: w, height: h, borderColor: LINE, borderWidth: thick || 0.6 }); }
    // 칸 안에 여러 줄 쓰기. align: 'c' 가운데, 'l' 왼쪽. 칸 높이 가운데에 세로 정렬
    function cell(pg, F, lines, x, y, w, h, o) {
      o = o || {}; var size = o.size || 10, lh = size * 1.45, pad = o.pad == null ? 6 : o.pad;
      var top = o.top ? y - pad - size : y - (h - lines.length * lh) / 2 - size * 0.95;
      lines.forEach(function (ln, i) {
        var tw = width(F, ln, size, o.bold), tx = o.align === 'c' ? x + (w - tw) / 2 : x + pad;
        text(pg, F, ln, tx, top - i * lh, size, o.bold, o.color);
      });
    }
    function mark(on) { return on ? '■' : '□'; }
    function sel(list, v) { return (Array.isArray(v) ? v : [v]).indexOf(list) > -1; }

    /* ---------------- 강사관리카드 ---------------- */
    async function card() {
      var o = await newDoc((s(d.nm) || '강사') + ' 강사관리카드'), doc = o.doc, F = o.F;
      var pg = doc.addPage([W, H]);
      // 제목(받은 서류 화면이 '강사관리카드' 글자로 종류를 판별하므로 붙여 씀)
      var ts = 24, tw = width(F, '강사관리카드', ts, true);
      text(pg, F, '강사관리카드', (W - tw) / 2, H - 82, ts, true);
      var y = H - 110, size = 10;
      // 1~2줄: 사진 | 성명 | 주민번호 / 소속 | 직위
      var h1 = 48, h2 = 40, xs = [L, L + 92, L + 150, L + 300, L + 372, R];
      box(pg, xs[0], y, R - L, h1 + h2, 1.1);
      box(pg, xs[0], y, xs[1] - xs[0], h1 + h2);
      if (opt.photo && opt.photo.bytes) {
        var im = opt.photo.type === 'png' ? await doc.embedPng(opt.photo.bytes) : await doc.embedJpg(opt.photo.bytes);
        var ph = h1 + h2 - 10, pw = ph * 0.75, sc = Math.min(pw / im.width, ph / im.height), iw = im.width * sc, ih = im.height * sc;
        pg.drawImage(im, { x: xs[0] + (xs[1] - xs[0] - iw) / 2, y: y - (h1 + h2 + ih) / 2, width: iw, height: ih });
      } else cell(pg, F, ['사 진'], xs[0], y, xs[1] - xs[0], h1 + h2, { align: 'c', size: size });
      box(pg, xs[1], y, xs[2] - xs[1], h1); cell(pg, F, ['성 명'], xs[1], y, xs[2] - xs[1], h1, { align: 'c', bold: true });
      box(pg, xs[2], y, xs[3] - xs[2], h1); cell(pg, F, ['(한글) ' + s(d.nm), '(한자) ' + s(d.nmH)], xs[2], y, xs[3] - xs[2], h1, { size: size });
      box(pg, xs[3], y, xs[4] - xs[3], h1); cell(pg, F, ['주민번호'], xs[3], y, xs[4] - xs[3], h1, { align: 'c', bold: true });
      var rrn = (s(d.rrn1) || s(d.rrn2)) ? s(d.rrn1) + ' - ' + s(d.rrn2) : '______ - _______';
      box(pg, xs[4], y, R - xs[4], h1); cell(pg, F, [rrn], xs[4], y, R - xs[4], h1, { align: 'c', size: size });
      var y2 = y - h1;
      box(pg, xs[1], y2, xs[2] - xs[1], h2); cell(pg, F, ['소 속'], xs[1], y2, xs[2] - xs[1], h2, { align: 'c', bold: true });
      box(pg, xs[2], y2, xs[3] - xs[2], h2); cell(pg, F, wrap(F, d.org, 9, false, xs[3] - xs[2] - 12).slice(0, 2), xs[2], y2, xs[3] - xs[2], h2, { size: 9 });
      box(pg, xs[3], y2, xs[4] - xs[3], h2); cell(pg, F, ['직 위'], xs[3], y2, xs[4] - xs[3], h2, { align: 'c', bold: true });
      box(pg, xs[4], y2, R - xs[4], h2); cell(pg, F, wrap(F, d.pos, 9, false, R - xs[4] - 12).slice(0, 2), xs[4], y2, R - xs[4], h2, { size: 9 });
      y = y2 - h2;
      // 3~4줄: 주소(택1) 직장/자택 | 전화번호 직장/핸드폰
      var h3 = 36, h4 = 36, a = [L, L + 46, L + 90, L + 290, L + 320, L + 382, R];
      var aW = d.addrK === '자택' ? '' : s(d.addr), aH = d.addrK === '자택' ? s(d.addr) : '';
      box(pg, a[0], y, a[1] - a[0], h3 + h4); cell(pg, F, ['주소', '(택1)'], a[0], y, a[1] - a[0], h3 + h4, { align: 'c', bold: true });
      box(pg, a[1], y, a[2] - a[1], h3); cell(pg, F, ['직장'], a[1], y, a[2] - a[1], h3, { align: 'c' });
      box(pg, a[2], y, a[3] - a[2], h3); cell(pg, F, wrap(F, aW, 9, false, a[3] - a[2] - 12).slice(0, 2), a[2], y, a[3] - a[2], h3, { size: 9 });
      box(pg, a[3], y, a[4] - a[3], h3 + h4); cell(pg, F, ['전화', '번호'], a[3], y, a[4] - a[3], h3 + h4, { align: 'c', bold: true });
      box(pg, a[4], y, a[5] - a[4], h3); cell(pg, F, ['직 장'], a[4], y, a[5] - a[4], h3, { align: 'c' });
      box(pg, a[5], y, R - a[5], h3); cell(pg, F, [s(d.telW)], a[5], y, R - a[5], h3, { align: 'c' });
      var y4 = y - h3;
      box(pg, a[1], y4, a[2] - a[1], h4); cell(pg, F, ['자택'], a[1], y4, a[2] - a[1], h4, { align: 'c' });
      box(pg, a[2], y4, a[3] - a[2], h4); cell(pg, F, wrap(F, aH, 9, false, a[3] - a[2] - 12).slice(0, 2), a[2], y4, a[3] - a[2], h4, { size: 9 });
      box(pg, a[4], y4, a[5] - a[4], h4); cell(pg, F, ['핸드폰', '(필수)'], a[4], y4, a[5] - a[4], h4, { align: 'c', size: 9.5 });
      box(pg, a[5], y4, R - a[5], h4); cell(pg, F, [s(d.mob)], a[5], y4, R - a[5], h4, { align: 'c' });
      y = y4 - h4;
      // 5줄: 강사수당 지급계좌 | 이메일
      var h5 = 44, b = [L, L + 70, L + 290, L + 382, R];
      box(pg, b[0], y, b[1] - b[0], h5); cell(pg, F, ['강사수당', '지급계좌'], b[0], y, b[1] - b[0], h5, { align: 'c', bold: true });
      box(pg, b[1], y, b[2] - b[1], h5); cell(pg, F, ['은행/예금주 : ' + s(d.bank), '계좌번호 : ' + s(d.acct)], b[1], y, b[2] - b[1], h5, { size: 9.5 });
      box(pg, b[2], y, b[3] - b[2], h5); cell(pg, F, ['이메일', '(필수)'], b[2], y, b[3] - b[2], h5, { align: 'c', bold: true });
      var emS = width(F, s(d.em), 10, false) > R - b[3] - 10 ? 8.5 : 10;
      box(pg, b[3], y, R - b[3], h5); cell(pg, F, [s(d.em)], b[3], y, R - b[3], h5, { align: 'c', size: emS });
      y -= h5;
      // 6~9줄: 학력·자격증·주요이력·강의경력(내용 길이에 맞춰 높이)
      var rows = [[['학   력', '(학   위)'], d.edu, 46], [['자격증'], d.cert, 46], [['주요이력'], d.career, 80], [['강의경력'], d.lect, 90]];
      var vw = R - L - 70 - 12, bottom = 56, fs = 10;
      for (; fs > 7.9; fs -= 0.5) {   // 한 쪽에 들어가도록 글자 크기를 줄여 봄
        var need = rows.reduce(function (acc, r) { return acc + Math.max(r[2], wrap(F, r[1], fs, false, vw).length * fs * 1.45 + 14); }, 0);
        if (y - need >= bottom) break;
      }
      rows.forEach(function (r) {
        var ln = wrap(F, r[1], fs, false, vw), rh = Math.max(r[2], ln.length * fs * 1.45 + 14);
        if (y - rh < bottom) {   // 그래도 넘치면 다음 쪽에 이어서
          pg = doc.addPage([W, H]); y = H - 60;
        }
        box(pg, L, y, 70, rh); cell(pg, F, r[0], L, y, 70, rh, { align: 'c', bold: true });
        box(pg, L + 70, y, R - L - 70, rh); cell(pg, F, ln, L + 70, y, R - L - 70, rh, { size: fs, top: true, pad: 7 });
        y -= rh;
      });

      // 2쪽: 강의 전문 정보
      pg = doc.addPage([W, H]); y = H - 70;
      pg.drawLine({ start: { x: L, y: y + 6 }, end: { x: R, y: y + 6 }, thickness: 1.2, color: LINE });
      text(pg, F, '강의 전문 정보', L + 4, y - 12, 11.5, true);
      text(pg, F, '(해당되는 곳에 □ 안에 ■ 표시 · 모두 선택 입력입니다)', L + 4 + width(F, '강의 전문 정보  ', 11.5, true), y - 12, 9.5, false, GRAY);
      y -= 24;
      var lw = 84, ow = R - L - lw - 14, os = 10;
      function optLines(list, chosen, perRow) {
        var out = [], line = '';
        list.forEach(function (v, i) {
          var t = mark(sel(v, chosen)) + ' ' + v;
          var cand = line ? line + '     ' + t : t;
          if ((perRow && i % perRow === 0 && line) || width(F, cand, os, false) > ow) { out.push(line); line = t; } else line = cand;
        });
        if (line) out.push(line);
        return out;
      }
      var fEtc = (d.field || []).indexOf('그 밖의 분야') > -1;
      var fieldLines = optLines(OPT.field, d.field || [], 3);
      fieldLines.push(mark(fEtc) + ' 그 밖의 분야 (' + (fEtc && s(d.fieldEtc) ? ' ' + s(d.fieldEtc) + ' ' : '                    ') + ')');
      var dayL = '요일 : ' + OPT.days.map(function (x) { return mark(sel(x, d.days || [])) + ' ' + x; }).join('  ') + '    (해당 시)';
      var p2 = [
        [['강사 구분'], optLines(OPT.type, d.type ? [d.type] : [], 0), 34],
        [['주 교육 구분', '(1개 선택)'], OPT.spec.map(function (x) { return mark(d.spec === x[0]) + ' ' + x[0] + ' (' + x[1] + ')'; }), 58],
        [['전문 분야', '(여러 개 선택)'], fieldLines, 92],
        [['강의 키워드'], wrap(F, d.kw, os, false, ow), 36],
        [['강의해 본', '교육 대상', '(여러 개 선택)'], optLines(OPT.target, d.target || [], 2), 60],
        [['강의 방식', '(여러 개 선택)'], optLines(OPT.method, d.method || [], 3), 46],
        [['활동지역'], wrap(F, d.region, os, false, ow), 34],
        [['출강이', '어려운 시기'], ['기간 : ' + (s(d.unav) || '______________________')].concat([dayL]), 46],
        [['교    수', '자료신청'], wrap(F, d.equip, os, false, ow), 36],
        [['교육자료', '사용동의'], ['본인의 강의에 사용하는 자료를 교육생에게 인쇄물 등으로 제공함을 허락합니다.',
          '( ' + (d.agMat === '동의함' ? '■' : '  ') + ' ) 동의함        ( ' + (d.agMat === '동의 안함' ? '■' : '  ') + ' ) 동의 안함'], 44]
      ];
      var topY = y;
      p2.forEach(function (r) {
        var rh = Math.max(r[2], r[1].length * os * 1.5 + 14);
        box(pg, L, y, lw, rh); cell(pg, F, r[0], L, y, lw, rh, { align: 'c', bold: true, size: 9.5 });
        box(pg, L + lw, y, R - L - lw, rh); cell(pg, F, r[1], L + lw, y, R - L - lw, rh, { size: os, pad: 8 });
        y -= rh;
      });
      pg.drawRectangle({ x: L, y: y, width: R - L, height: topY - y, borderColor: LINE, borderWidth: 1.1 });
      text(pg, F, '문의: ' + CONTACT, L + 4, y - 16, 9.5);
      text(pg, F, '※ 개인정보 수집·활용 동의서(별지)를 함께 작성·서명하여 제출해 주세요.', L + 4, y - 31, 9.5);
      text(pg, F, '외래강사 ON 웹 작성 · ' + ymdK, L + 4, 30, 7.5, false, GRAY);
      setData(doc, 'card');
      return doc.save();
    }

    /* ---------------- 개인정보 수집·활용 동의서 ---------------- */
    async function consent() {
      var o = await newDoc((s(d.nm) || '강사') + ' 개인정보 수집·활용 동의서'), doc = o.doc, F = o.F;
      var pg = doc.addPage([W, H]), y = H - 56, lw = 165;
      text(pg, F, '(앞쪽)', R - width(F, '(앞쪽)', 8.5, false), y, 8.5, false, GRAY);
      var t = '개인정보 수집ㆍ활용 동의서', tw = width(F, t, 19, true); text(pg, F, t, (W - tw) / 2, y - 40, 19, true);
      y -= 86;
      function head(str) { text(pg, F, '■  ' + str, L + 2, y, 12.5, true); y -= 22; }
      function dash(str) { text(pg, F, '- ' + str, L + 14, y, 10.5); y -= 18; }
      function tbl(rows) {
        var top = y;
        rows.forEach(function (r) {
          var ll = wrap(F, r[0], 9.5, false, lw - 12), rl = wrap(F, r[1], 10, false, R - L - lw - 14);
          var rh = Math.max(34, Math.max(ll.length * 9.5 * 1.45, rl.length * 10 * 1.45) + 14);
          box(pg, L, y, lw, rh); cell(pg, F, ll, L, y, lw, rh, { size: 9.5 });
          box(pg, L + lw, y, R - L - lw, rh); cell(pg, F, rl, L + lw, y, R - L - lw, rh, { size: 10, pad: 8 });
          y -= rh;
        });
        pg.drawRectangle({ x: L, y: y, width: R - L, height: top - y, borderColor: LINE, borderWidth: 1 });
        y -= 18;
      }
      function yn(on, a, b) {
        text(pg, F, a + ' ' + mark(on === true), L + 10, y, 10.5, true);
        text(pg, F, b + ' ' + mark(on === false), L + 250, y, 10.5, true);
        y -= 34;
      }
      var REF = '귀하는 개인정보 제공 동의를 거부할 권리가 있으며, 동의 거부에 따른 불이익은 없음. ';
      head('개인정보의 수집 및 이용목적'); dash('전남소방학교 교수 인력풀 관리 및 강사수당 지급'); y -= 10;
      head('개인정보의 보유 및 이용기간'); dash('교수인력풀 관리 및 교수섭외 활용 종료 시까지'); dash('개인정보 주체자의 삭제 요청 시 즉시 삭제'); y -= 10;
      head('기본 개인정보 수집 ㆍ 활용');
      tbl([['수집하는 기본 개인정보 항목', '성명, 주소, 직업, 전화번호(유선, 핸드폰), 자격사항, 이메일 주소, 주민등록번호, 학력, 경력, 계좌번호'],
        ['개인정보 제공 동의 거부 권리 및 동의 거부 따른 불이익 내용 또는 제한사항', REF + '다만, 주민등록번호, 계좌번호가 없을 시 강사수당 입금 등이 불편할 수 있음.']]);
      yn(d.c1, '개인정보 수집 및 이용에 동의함', '개인정보 수집 및 이용에 동의하지 않음');
      head('고유식별정보 수집 ㆍ 활용');
      tbl([['수집하는 고유식별정보 항목', '< 고유식별정보 항목 >\n주민등록번호'],
        ['개인정보 제공 동의 거부 권리 및 동의 거부 따른 불이익 내용 또는 제한사항', REF + '다만, 주민등록번호가 없을 시 강사수당 입금 등이 불편할 수 있음.']]);
      yn(d.c2, '개인정보 수집 및 이용에 동의함', '개인정보 수집 및 이용에 동의하지 않음');

      pg = doc.addPage([W, H]); y = H - 56;
      text(pg, F, '(뒤쪽)', R - width(F, '(뒤쪽)', 8.5, false), y, 8.5, false, GRAY);
      y -= 34; head('개인정보 제3자 제공');
      tbl([['개인정보를 제공받는 자', '전남 소방교육과(교육운영팀, 교육훈련팀) 및 전국 소방교육훈련기관 교수인력풀 담당자'],
        ['개인정보를 제공받는 자의 개인정보 이용목적', '출강강사의 강사수당 입금, 전국소방교육훈련기관 교수인력풀 공유(섭외)'],
        ['제공되는 개인정보 항목', '성명, 주민등록번호, 계좌번호, 직업, 전공분야, 전화번호 등 개인 기본 개인정보 수집·활용에 수집되는 정보 일체'],
        ['개인정보를 제공받는 자의 개인정보 보유 및 이용기간', '3년'],
        ['개인정보 제공 동의 거부 권리 및 동의 거부 따른 불이익 내용 또는 제한사항', REF + '다만, 성명, 주민등록번호, 계좌번호가 없을 시 강사수당 입금 등이 불편할 수 있음.']]);
      yn(d.c3, '동의함', '동의하지 않음');
      wrap(F, '※ 개인정보 제공자가 동의한 내용외의 다른 목적으로 활용하지 않으며, 제공된 개인정보의 이용을 거부하고자 할 때에는 개인정보보호 책임자를 통해 열람, 정정, 삭제를 요구할 수 있음', 10, false, R - L - 8)
        .forEach(function (ln) { text(pg, F, ln, L + 4, y, 10); y -= 15; });
      y -= 22;
      wrap(F, '「개인정보보호법」 등 관련 법규에 의거하여 상기 본인은 위와 같이 개인정보 수집 및 활용에 동의함.', 11, false, R - L - 8)
        .forEach(function (ln) { text(pg, F, ln, L + 4, y, 11); y -= 17; });
      y -= 14;
      text(pg, F, ymdK, R - 150, y, 11.5, true); y -= 34;
      var nmT = '이름 : ' + s(d.nm), nx = R - 300;
      text(pg, F, nmT, nx, y, 11.5, true);
      var sx = nx + width(F, nmT, 11.5, true) + 12;
      if (opt.sign && opt.sign.length) {
        var si = await doc.embedPng(opt.sign), sh = 42, sw = Math.min(R - 92 - sx, si.width * sh / si.height);
        pg.drawImage(si, { x: sx, y: y - 14, width: sw, height: sh });
      }
      text(pg, F, '(서명 또는 인)', R - 82, y, 10.5, false, GRAY);
      y -= 46;
      text(pg, F, '전남광주통합특별시 소방본부장 귀하', L + 10, y, 14, true);
      y -= 34;
      text(pg, F, '<개인정보 취급자>', L + 6, y, 10.5); y -= 10;
      var cw = [78, 58, 46, 136, 90], cx = [L], hd = ['소속', '성명', '직위', '이메일', '연락처', '개인정보보호 책임자'];
      cw.forEach(function (w, i) { cx.push(cx[i] + w); });
      var hh = 30, bh = 50;
      hd.forEach(function (h, i) { var x = cx[i], w = (i < 5 ? cw[i] : R - x); box(pg, x, y, w, hh); cell(pg, F, wrap(F, h, 9.5, true, w - 8), x, y, w, hh, { align: 'c', bold: true, size: 9.5 }); });
      var vals = [['전남소방본부', '소방교육과'], ['오성환', '유금용', '최선영'], [''], ['moksung407@korea.kr'], ['061-860-4735'], ['교육운영팀장']];
      vals.forEach(function (v, i) { var x = cx[i], w = (i < 5 ? cw[i] : R - x); box(pg, x, y - hh, w, bh); cell(pg, F, v, x, y - hh, w, bh, { align: 'c', size: 9 }); });
      pg.drawRectangle({ x: L, y: y - hh - bh, width: R - L, height: hh + bh, borderColor: LINE, borderWidth: 1 });
      text(pg, F, '외래강사 ON 웹 작성 · ' + ymdK + ' · 화면 서명', L + 4, 30, 7.5, false, GRAY);
      setData(doc, 'consent');
      return doc.save();
    }

    // 업무 화면이 정확히 읽도록 넣는 자료(주민등록번호·계좌·서명·사진 제외)
    function setData(doc, kind) {
      var keep = ['nm', 'nmH', 'org', 'pos', 'addrK', 'addr', 'mob', 'telW', 'em', 'edu', 'cert', 'career', 'lect', 'type', 'spec', 'field', 'fieldEtc', 'kw', 'target', 'method', 'region', 'unav', 'days', 'equip', 'agMat'];
      var o = { v: 1, kind: kind, date: today.getFullYear() + '-' + ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2) };
      if (kind === 'card') keep.forEach(function (k) { if (d[k] != null && d[k] !== '' && !(Array.isArray(d[k]) && !d[k].length)) o[k] = d[k]; });
      else { o.nm = s(d.nm); o.c1 = d.c1; o.c2 = d.c2; o.c3 = d.c3; o.signed = !!(opt.sign && opt.sign.length); }
      doc.getInfoDict().set(P.PDFName.of('IonData'), P.PDFHexString.fromText(JSON.stringify(o)));
      doc.setSubject(kind === 'card' ? '강사관리카드' : '개인정보 수집·활용 동의서');
    }

    return Promise.all([card(), consent()]).then(function (r) { return { card: r[0], consent: r[1] }; });
  }

  var api = { make: make, OPT: OPT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.IonPdf = api;
})(this);
