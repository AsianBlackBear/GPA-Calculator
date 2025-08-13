'use strict';

// ===== Constants =====
const SCALE = {"A+":4.3,"A0":4.0,"A-":3.7,"B+":3.3,"B0":3.0,"B-":2.7};
const LETTERS = Object.keys(SCALE);
const SU = ["S","U"]; // S=Pass, U=Fail
const STORAGE_KEY = 'gpa-calc-v5';
const ALLOWED_TERMS = ['2025-1','2025-S','2025-2','2025-W'];
const TERM_START = ALLOWED_TERMS[0];

// ===== DOM =====
const rowsEl = document.getElementById('rows');
const gpaValueEl = document.getElementById('gpaValue');
const totalGpaValueEl = document.getElementById('totalGpaValue');
const footerStatsEl = document.getElementById('footerStats');
const termSelect = document.getElementById('termSelect');
const sortSelect = document.getElementById('sortSelect');




// ===== State helpers =====
function getState(){
  const empty = { currentTerm: TERM_START, terms: {} };
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY)) || empty;
    // 허용 학기만 남기기
    const allowed = new Set(ALLOWED_TERMS);
    s.terms = Object.fromEntries(
      Object.entries(s.terms || {}).filter(([k]) => allowed.has(k))
    );
    if (!allowed.has(s.currentTerm)) s.currentTerm = TERM_START;
    return s;
  } catch {
    return empty;
  }
}
function setState(s){
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
  catch (e) { console.warn('setState failed:', e); }
}
function ensureTerm(state, term){
  if (!ALLOWED_TERMS.includes(term)) return;
  if (!state.terms[term]) state.terms[term] = [];
}

// ===== UI helpers =====
function setLetterOptions(sel, mode, value){
  const list = mode==='grade' ? LETTERS : SU;
  sel.innerHTML = list.map(v=>`<option value="${v}" ${v===value?'selected':''}>${v}</option>`).join('');
}

function addRow(sub='', mode='grade', letter='A+', credit=3){
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input value="${sub}"/></td>
    <td>
      <select data-role="type">
        <option value="grade" ${mode==='grade'?'selected':''}>Grade</option>
        <option value="su" ${mode==='su'?'selected':''}>S/U</option>
      </select>
    </td>
    <td><select data-role="letter"></select></td>
    <td>
      <select data-role="credit">
        ${[1,2,3,4].map(c=>`<option value="${c}" ${c==credit?'selected':''}>${c}</option>`).join('')}
      </select>
    </td>
    <td><button data-role="delete">Delete</button></td>
  `;
  const typeSel = tr.querySelector('select[data-role="type"]');
  const letterSel = tr.querySelector('select[data-role="letter"]');
  const delBtn = tr.querySelector('button[data-role="delete"]');
  setLetterOptions(letterSel, mode, letter);
  typeSel.onchange = ()=>{ setLetterOptions(letterSel, typeSel.value, letterSel.value); handleChange(); };
  tr.querySelectorAll('input,select').forEach(e=> e.oninput = handleChange);
  delBtn.onclick = ()=>{ tr.remove(); handleChange(); };
  rowsEl.appendChild(tr);
}

function readRows(){
  return [...rowsEl.querySelectorAll('tr')].map(tr=>({
    subject: tr.querySelector('input').value.trim(),
    type: tr.querySelector('[data-role="type"]').value,
    letter: tr.querySelector('[data-role="letter"]').value,
    credit: +tr.querySelector('[data-role="credit"]').value
  }));
}
function writeRows(list){
  rowsEl.innerHTML = '';
  (list || []).forEach(r=> addRow(r.subject, r.type, r.letter, r.credit));
}

let doughnut;

// ===== GPA Calc =====
function recalc(){
  const rows = readRows();
  let gradedCredits=0, sum=0;
  let gradedCount=0;
  let suCredits=0, suCount=0, sCount=0, uCount=0;
  let creditCountsObj = {"A+":0,"A0":0,"A-":0,"B+":0,"B0":0,"B-":0, "S":0, "U": 0}

  rows.forEach(({type,letter,credit})=>{
    if(type==='grade'){
      gradedCount++;
      gradedCredits += credit;
      sum += (SCALE[letter]||0)*credit;
      creditCountsObj[letter] += credit;
    } else {
      suCount++;
      if(letter==='S') { suCredits += credit; sCount++; }
      else { uCount++; }
      creditCountsObj[letter] += credit;
    }
  });
  

  gpaValueEl.textContent = gradedCredits ? (sum/gradedCredits).toFixed(2) : '—';
  footerStatsEl.textContent =
    `Total ${gradedCount + suCount} Courses · Graded ${gradedCount} (${gradedCredits+suCredits} Credits) · S/U ${suCount} (S ${sCount}, U ${uCount})`;

  const labels = Object.keys(creditCountsObj);
  const values = Object.values(creditCountsObj);
  const colors = ["#3e95cd", "#8e5ea2","#3cba9f","#e8c3b9","#c45850", "#ccc"]

  const ctx = document.getElementById("doughnut-chart").getContext("2d");
  if (!doughnut) {
    doughnut = new Chart(ctx, {
      type: 'doughnut',
      data : {
        labels,
        datasets: [{label: "Credits", data: values, backgroundColor: colors }]
      },
      options: {
        title: {display: true, text: "평점 당 학점 수"}
      }
    })
  } else {
    doughnut.data.labels = labels;
    doughnut.data.datasets[0].data = values;
    doughnut.update();
  }
  recalcTotalGpa();

}


function recalcTotalGpa(){
  const state = getState();
  let sum=0, credits=0;
  ALLOWED_TERMS.forEach(t=>{
    (state.terms[t] || []).forEach(r=>{
      if(r.type==='grade'){ credits += r.credit; sum += (SCALE[r.letter]||0)*r.credit; }
    });
  });
  totalGpaValueEl.textContent = credits ? (sum/credits).toFixed(2) : '—';
}

// ===== Persist per-term =====
function saveCurrentTerm(targetTerm){
  const state = getState();
  const term = targetTerm || termSelect.value || state.currentTerm || TERM_START;
  const safeTerm = ALLOWED_TERMS.includes(term) ? term : TERM_START;
  ensureTerm(state, safeTerm);
  state.terms[safeTerm] = readRows();
  state.currentTerm = safeTerm;
  setState(state);
}

function switchTerm(newTerm){
  const safeNew = ALLOWED_TERMS.includes(newTerm) ? newTerm : TERM_START;
  // 이전 학기 저장
  const prev = getState().currentTerm;
  if (prev) saveCurrentTerm(prev);

  // 새 학기 로드
  const state = getState();
  ensureTerm(state, safeNew);
  state.currentTerm = safeNew;
  setState(state);

  writeRows(state.terms[safeNew]);
  applySort();
  recalc();
}

// ===== Sorting =====
function applySort(){
  const mode = sortSelect.value;
  if(mode==='none') return;
  const rows = readRows().map(r=>({
    ...r,
    value: r.type==='grade' ? (SCALE[r.letter]||0) : null
  }));
  const collator = new Intl.Collator('en');
  const byNameAsc = (a,b)=> collator.compare(a.subject,b.subject);
  const byNameDesc = (a,b)=> collator.compare(b.subject,a.subject);
  const byCreditAsc = (a,b)=> a.credit - b.credit || byNameAsc(a,b);
  const byCreditDesc = (a,b)=> b.credit - a.credit || byNameAsc(a,b);
  const byValueAsc = (a,b)=> {
    const av=a.value,bv=b.value; if(av==null&&bv==null) return byNameAsc(a,b); if(av==null) return 1; if(bv==null) return -1; return av-bv || byNameAsc(a,b);
  };
  const byValueDesc = (a,b)=> {
    const av=a.value,bv=b.value; if(av==null&&bv==null) return byNameAsc(a,b); if(av==null) return 1; if(bv==null) return -1; return bv-av || byNameAsc(a,b);
  };
  const cmp = (
    mode==='nameAsc'?byNameAsc:
    mode==='nameDesc'?byNameDesc:
    mode==='creditLow'?byCreditAsc:
    mode==='creditHigh'?byCreditDesc:
    mode==='gpaLow'?byValueAsc:
    byValueDesc
  );
  rows.sort(cmp);
  writeRows(rows);
  saveCurrentTerm(); // 정렬 후 저장
}

// ===== Init =====
(function init(){
  const state = getState();

  // 고정 4개 학기만 옵션 구성
  termSelect.innerHTML = '';
  ALLOWED_TERMS.forEach(t=>{
    ensureTerm(state, t);
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    termSelect.appendChild(opt);
  });

  // currentTerm 보정
  if (!ALLOWED_TERMS.includes(state.currentTerm)) state.currentTerm = TERM_START;
  termSelect.value = state.currentTerm;
  setState(state);

  // 첫 렌더
  writeRows(state.terms[termSelect.value]);
  recalc();

  // 이벤트
  document.getElementById('addRowBtn').onclick = ()=>{ addRow(); handleChange(); };
  termSelect.onchange = ()=> switchTerm(termSelect.value);
  sortSelect.onchange = ()=> applySort();

  // 안전 저장
  window.addEventListener('beforeunload', ()=> saveCurrentTerm());
})();

function handleChange(){ recalc(); saveCurrentTerm(); }
