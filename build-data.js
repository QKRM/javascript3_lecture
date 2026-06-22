// Extracts lesson content from original slide decks into a single data file.
// Run: node build-data.js  -> writes lessons-data.js
const fs = require('fs');
const path = require('path');

const DIR = __dirname;

// id -> source html file
const FILES = {
  'OT': 'OT.html',
  'web3-1-1': 'web3-1-1.html',
  'web3-1-2': 'web3-1-2.html',
  'web3-1-3': 'web3-1-3.html',
  'web3-1-4': 'web3-1-4.html',
  'web3-2-1': 'web3-2-1.html',
  'web3-2-8': 'web3-2-8.html',
  'web3-3-9': 'web3-3-9.html',
  'web3-3-10': 'web3-3-10.html',
  'web3-3-11': 'web3-3-11.html',
  'web3-3-12': 'web3-3-12.html',
  'web3-4-13': 'web3-4-13.html',
  'web3-4-14': 'web3-4-14.html',
  'bonus3-4-14': 'bonus3-4-14.html',
  'bonus1': 'bonus1.html',
  'bonus2': 'bonus2.html',
  'bonus3': 'bonus3.html',
  'bonus4-1': 'bonus4-1.html',
  'bonus4-2': 'bonus4-2.html',
};

function extractArray(text, varName) {
  const letIdx = text.indexOf('let currentIndex = 0;');
  const chunk = text.slice(0, letIdx);
  const start = chunk.indexOf('const ' + varName);
  let rhs = chunk.slice(start).replace(/^const\s+\w+\s*=\s*/, '').trim();
  rhs = rhs.replace(/;\s*$/, '');
  // eval as data literal (pure array of objects, no external refs)
  return new Function('return (' + rhs + ');')();
}

function extractContainer(text) {
  // grab inner HTML of <div class="container"> ... </div> (last before </body>)
  const m = text.match(/<div class="container">([\s\S]*?)<\/div>\s*<\/body>/i);
  return m ? m[1].trim() : '';
}

// merge consecutive code blocks that are the same question (placeholder + answer pair)
function isPlaceholder(a) { return !a || /^[?\s]*$/.test(a); }

function mapType(s) {
  if (s.type === 'code-quiz') {
    return { type: 'code', title: s.question || s.title || '', desc: '', code: s.code || '', answer: s.answer || '' };
  }
  if (s.type === 'quiz') {
    const items = (s.options || []).slice();
    if (s.answer) items.push('<div class="practice-box"><b>' + s.answer + '</b></div>');
    return { type: 'content', title: s.question || '', items };
  }
  return s;
}

function normalizeSlides(slides) {
  slides = slides.map(mapType);
  const out = [];
  for (const s of slides) {
    if (s.type === 'code') {
      const prev = out[out.length - 1];
      if (prev && prev.type === 'code' && prev.title === s.title && prev.code === s.code) {
        // same question: keep the real answer
        if (isPlaceholder(prev.answer) && !isPlaceholder(s.answer)) prev.answer = s.answer;
        continue;
      }
    }
    out.push(Object.assign({}, s));
  }
  // strip pure-placeholder answers
  for (const b of out) if (b.type === 'code' && isPlaceholder(b.answer)) b.answer = '';
  return out;
}

const LESSONS = {};

for (const [id, file] of Object.entries(FILES)) {
  const text = fs.readFileSync(path.join(DIR, file), 'utf8');
  let blocks;

  if (text.includes('const slideData')) {
    blocks = normalizeSlides(extractArray(text, 'slideData'));
  } else if (text.includes('const quizData')) {
    const q = extractArray(text, 'quizData');
    blocks = q.map(x => ({
      type: 'code',
      title: x.title,
      desc: x.question || '',
      code: x.code || '',
      answer: (x.answer ? '정답: ' + x.answer : '') + (x.desc ? '\n💡 ' + x.desc : ''),
    }));
  } else {
    // static article page
    blocks = [{ type: 'raw', html: extractContainer(text) }];
  }

  LESSONS[id] = blocks;
  console.log(id.padEnd(14), file.padEnd(20), blocks.length, 'blocks');
}

// inject into index.html between markers (single-file deploy)
const idxPath = path.join(DIR, 'index.html');
let html = fs.readFileSync(idxPath, 'utf8');
// escape </script so the inlined JSON can't terminate the page's <script> tag
const json = JSON.stringify(LESSONS).replace(/<\/script/gi, '<\\/script');
const block = '/*LESSONS_START*/\nconst LESSONS = ' + json + ';\n/*LESSONS_END*/';
const re = /\/\*LESSONS_START\*\/[\s\S]*?\/\*LESSONS_END\*\//;
if (!re.test(html)) { console.error('marker not found in index.html'); process.exit(1); }
html = html.replace(re, block);
fs.writeFileSync(idxPath, html, 'utf8');
console.log('\nInjected', Object.keys(LESSONS).length, 'lessons into index.html');
