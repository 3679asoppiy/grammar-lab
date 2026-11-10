const STORAGE_KEY = 'grammar-lab-data-v1';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const makeId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`;
const escapeHTML = (value='') => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

const seedItems = [
  {id:'seed-present-perfect',title:'現在完了（継続）',promptJa:'私は3年間ずっとここに住んでいます。',answerEn:'I have lived here for three years.',altEn:["I've lived here for three years."],promptEn:'I have lived here for three years.',answerJa:'私は3年間ここに住んでいます。',altJa:['私はここに3年間住み続けています。'],explanation:'現在完了形（have + 過去分詞）と for + 期間で、過去から現在まで続く状態を表します。'},
  {id:'seed-relative',title:'関係代名詞',promptJa:'あそこで走っている男の子は私の弟です。',answerEn:'The boy who is running over there is my younger brother.',altEn:['The boy running over there is my younger brother.'],promptEn:'The boy who is running over there is my younger brother.',answerJa:'あそこで走っている男の子は私の弟です。',altJa:['あそこで走っている少年は私の弟です。'],explanation:'who 以下が boy を説明しています。人を先行詞にする主格の関係代名詞です。'},
  {id:'seed-passive',title:'受動態',promptJa:'この橋は100年前に建てられました。',answerEn:'This bridge was built 100 years ago.',altEn:['This bridge was constructed 100 years ago.'],promptEn:'This bridge was built 100 years ago.',answerJa:'この橋は100年前に建てられました。',altJa:['この橋は100年前に造られました。'],explanation:'「〜される」は be動詞 + 過去分詞で表します。過去の出来事なので was を使います。'},
  {id:'seed-if',title:'仮定法過去',promptJa:'もし私が鳥なら、君のところへ飛んでいくのに。',answerEn:'If I were a bird, I would fly to you.',altEn:['Were I a bird, I would fly to you.'],promptEn:'If I were a bird, I would fly to you.',answerJa:'もし私が鳥なら、君のところへ飛んでいくのに。',altJa:['私が鳥だったら、君のもとへ飛んでいくのに。'],explanation:'現在の事実と異なる仮定を表します。if節では主語にかかわらず were を使うことがあります。'}
];

function loadData(){
  try { const raw=localStorage.getItem(STORAGE_KEY); if(!raw) return {items:seedItems.map(x=>({...x})),logs:{},review:{}}; const parsed=JSON.parse(raw); return {items:Array.isArray(parsed.items)?parsed.items:[],logs:parsed.logs&&typeof parsed.logs==='object'?parsed.logs:{},review:parsed.review&&typeof parsed.review==='object'?parsed.review:{}}; }
  catch { return {items:seedItems.map(x=>({...x})),logs:{},review:{}}; }
}
let data=loadData();
data.items=data.items.map(item=>({...item,altEn:Array.isArray(item.altEn)?item.altEn:[],altJa:Array.isArray(item.altJa)?item.altJa:[]}));
let currentView='home';
let session={questions:[],index:0,correct:0,total:0,graded:false,current:null,mode:'normal'};
let calendarCursor=new Date();
let selectedDate=todayISO();
let toastTimer;

function saveData(){localStorage.setItem(STORAGE_KEY,JSON.stringify(data));}
function showToast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400);}
function formatJapaneseDate(iso){const [y,m,d]=iso.split('-').map(Number);return `${y}年${m}月${d}日`;}
function navigate(view){
  currentView=view; $$('.view').forEach(el=>el.classList.toggle('active',el.id===`view-${view}`));
  $$('.nav-item[data-view]').forEach(el=>{const active=el.dataset.view===view;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  const labels={home:'ホーム',study:'テストする',library:'文法ノート',calendar:'学習カレンダー'};
  $('#breadcrumb').innerHTML=`YOUR LEARNING SPACE <span>/</span> ${labels[view]||'ホーム'}`;
  if(view==='home')renderHome(); if(view==='library')renderLibrary(); if(view==='calendar')renderCalendar(); if(view==='study')refreshStudyModeUI();
  window.scrollTo({top:0,behavior:'smooth'});
}
function getReviewEntries(){
  const availableItems=new Map(data.items.map(item=>[item.id,item]));
  return Object.entries(data.review||{}).filter(([,entry])=>availableItems.has(entry.itemId)).map(([key,entry])=>({...entry,key,item:availableItems.get(entry.itemId)}));
}
function renderReviewCounts(){
  const count=getReviewEntries().length;
  const status=$('#review-queue-status');
  if(status)status.textContent=count?`現在 ${count} 問が復習リストにあります。正解を2回続けるとリストから外れます。`:'復習対象はありません。通常テストで間違えた問題がここに追加されます。';
  const homeCount=$('#home-review-count');
  if(homeCount)homeCount.textContent=`${count}問`;
  const homeButton=$('#home-review-button');
  if(homeButton){homeButton.disabled=count===0;homeButton.setAttribute('aria-label',count?`間違えた問題を${count}問復習する`:'復習対象はありません');}
}
function updateReviewQueue(item,direction,outcome){
  const key=`${item.id}::${direction}`;
  const existing=data.review[key];
  if(outcome!=='correct'){
    data.review[key]={itemId:item.id,direction,wrongCount:(existing?.wrongCount||0)+(outcome==='incorrect'?1:0),reviewCount:(existing?.reviewCount||0)+(outcome==='review'?1:0),correctStreak:0,lastWrongAt:Date.now()};
    return outcome==='incorrect'?'復習リストに追加しました。':'要復習として復習リストに追加しました。';
  }
  if(existing){
    existing.correctStreak=(existing.correctStreak||0)+1;
    if(existing.correctStreak>=2){delete data.review[key];return '連続で2回正解したため、復習リストから外しました。';}
    return '連続正解 1 / 2。もう一度正解すると復習リストから外れます。';
  }
  return '';
}
function renderStats(){
  const days=Object.keys(data.logs).filter(k=>(data.logs[k]?.attempts||0)>0).length;
  const attempts=Object.values(data.logs).reduce((sum,log)=>sum+(log.attempts||0),0);
  const correct=Object.values(data.logs).reduce((sum,log)=>sum+(log.correct||0),0);
  $('#stat-items').textContent=data.items.length;$('#stat-days').innerHTML=`${days}<span class="stat-unit">日</span>`;$('#stat-attempts').textContent=attempts;$('#stat-accuracy').textContent=attempts?`${Math.round(correct/attempts*100)}%`:'—';
}
function buildCalendarGrid(year,month,container,{mini=false}={}){
  const first=new Date(year,month,1);const last=new Date(year,month+1,0);const start=first.getDay();const days=last.getDate();const prevDays=new Date(year,month,0).getDate();
  let html=['日','月','火','水','木','金','土'].map(x=>`<div class="day-name">${x}</div>`).join('');
  const cells=Math.ceil((start+days)/7)*7;
  for(let i=0;i<cells;i++){
    let day,other=false,date;
    if(i<start){day=prevDays-start+i+1;other=true;date=new Date(year,month-1,day);}
    else if(i>=start+days){day=i-(start+days)+1;other=true;date=new Date(year,month+1,day);}
    else{day=i-start+1;date=new Date(year,month,day);}
    const iso=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const done=!!(data.logs[iso]?.attempts);const isToday=iso===todayISO();const selected=iso===selectedDate;
    html+=`<div class="calendar-day ${other?'muted-day':''} ${done?'is-done':''} ${isToday?'is-today':''} ${selected&&!mini?'selected':''}" ${mini?'':'data-date="'+iso+'"'}>${day}</div>`;
  }
  container.innerHTML=`<div class="calendar-grid">${html}</div>`;
  if(!mini){$$('[data-date]',container).forEach(el=>el.addEventListener('click',()=>{selectedDate=el.dataset.date;renderCalendar();}));}
}
function renderMiniCalendar(){const now=new Date();buildCalendarGrid(now.getFullYear(),now.getMonth(),$('#mini-calendar'),{mini:true});}
function renderHome(){
  renderStats();renderMiniCalendar();renderReviewCounts();
  const recent=[...data.items].slice(-3).reverse();
  $('#recent-list').innerHTML=recent.length?recent.map((item,i)=>`<div class="recent-item"><span class="item-number">${String(data.items.length-i).padStart(2,'0')}</span><div><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.answerEn)}</small></div></div>`).join(''):'<div class="recent-empty">文法ノートに例文を追加すると、ここに表示されます。</div>';
}
function answerList(item,language){
  const primary=language==='en'?item.answerEn:item.answerJa;
  const alternatives=language==='en'?(item.altEn||[]):(item.altJa||[]);
  return [...new Set([primary,...alternatives].map(x=>String(x||'').trim()).filter(Boolean))];
}
function renderLibrary(){
  const query=$('#library-search').value.trim().toLowerCase();
  const filtered=data.items.filter(item=>[item.title,item.promptJa,...answerList(item,'en'),item.promptEn,...answerList(item,'ja')].join(' ').toLowerCase().includes(query));
  $('#library-count').textContent=`${filtered.length} ITEMS`;
  $('#grammar-grid').innerHTML=filtered.map((item,index)=>{const en=answerList(item,'en');const ja=answerList(item,'ja');return `<article class="grammar-card"><div class="grammar-card-top"><span class="grammar-chip">${escapeHTML(item.title)}</span><div class="card-actions"><button data-edit="${escapeHTML(item.id)}" aria-label="編集">編集</button><button data-delete="${escapeHTML(item.id)}" aria-label="削除">削除</button></div></div><h3>${escapeHTML(item.promptJa)}</h3><div class="grammar-example"><strong>EN</strong>${en.map(x=>`<div class="library-answer">${escapeHTML(x)}</div>`).join('')}</div><div class="grammar-example"><strong>JP</strong>${ja.map(x=>`<div class="library-answer">${escapeHTML(x)}</div>`).join('')}</div>${item.explanation?`<p class="grammar-explanation">${escapeHTML(item.explanation)}</p>`:''}</article>`;}).join('');
  $('#library-empty').classList.toggle('hidden',data.items.length!==0);
  $('#grammar-grid').classList.toggle('hidden',data.items.length===0);
  if(data.items.length&&filtered.length===0)$('#grammar-grid').innerHTML='<div class="recent-empty">検索に一致する文法がありません。</div>';
  $$('[data-edit]').forEach(btn=>btn.addEventListener('click',()=>openGrammarModal(btn.dataset.edit)));
  $$('[data-delete]').forEach(btn=>btn.addEventListener('click',()=>deleteGrammar(btn.dataset.delete)));
}
function renderCalendar(){
  const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth();
  $('#calendar-month-title').textContent=`${y}年${m+1}月`;
  buildCalendarGrid(y,m,$('#full-calendar'));
  const monthPrefix=`${y}-${String(m+1).padStart(2,'0')}`;
  const monthDays=Object.keys(data.logs).filter(k=>k.startsWith(monthPrefix)&&(data.logs[k]?.attempts||0)>0).length;
  $('#month-study-days').textContent=`${monthDays}日`;
  $('#selected-date-title').textContent=formatJapaneseDate(selectedDate);
  const log=data.logs[selectedDate];
  if(!log||!log.attempts){$('#selected-date-detail').innerHTML='<div class="empty-icon small">▦</div><p>この日の学習記録はありません。</p>';return;}
  const rate=Math.round((log.correct||0)/log.attempts*100);
  $('#selected-date-detail').innerHTML=`<div class="day-stat-line"><span>回答した問題</span><strong>${log.attempts}問</strong></div><div class="day-stat-line"><span>正解数</span><strong>${log.correct||0}問</strong></div><div class="day-stat-line"><span>正答率</span><strong>${rate}%</strong></div><p class="muted">${escapeHTML(log.note||'今日も学習を積み重ねました。')}</p>`;
}
function openGrammarModal(id=null){
  $('#grammar-form').reset();$('#grammar-id').value='';$('#grammar-modal-title').textContent=id?'文法を編集':'文法を追加';
  if(id){const item=data.items.find(x=>x.id===id);if(!item)return;$('#grammar-id').value=item.id;$('#grammar-title').value=item.title;$('#prompt-ja').value=item.promptJa;$('#answer-en').value=answerList(item,'en').join('\\n');$('#prompt-en').value=item.promptEn;$('#answer-ja').value=answerList(item,'ja').join('\\n');$('#grammar-explanation').value=item.explanation||'';}
  openModal('grammar-modal');
}
function openModal(id){$('#'+id).classList.remove('hidden');document.body.style.overflow='hidden';}
function closeModal(id){$('#'+id).classList.add('hidden');document.body.style.overflow='';}
function deleteGrammar(id){const item=data.items.find(x=>x.id===id);if(!item)return;if(!confirm(`「${item.title}」を削除しますか？`))return;data.items=data.items.filter(x=>x.id!==id);Object.keys(data.review||{}).forEach(key=>{if(data.review[key].itemId===id)delete data.review[key];});saveData();renderReviewCounts();renderLibrary();renderStats();showToast('文法を削除しました');}
function splitLines(value){return value.split('\n').map(x=>x.trim()).filter(Boolean);}
function startSession(direction){
  if(!data.items.length){showToast('先に文法ノートへ問題を追加してください');navigate('library');return;}
  $('#study-mode').value='normal';$('#study-direction').value=direction||'ja-en';navigate('study');refreshStudyModeUI();$('#study-settings').classList.remove('hidden');$('#question-panel').classList.add('hidden');$('#complete-panel').classList.add('hidden');
  if(direction)beginSession();
}
function startReviewSession(){
  navigate('study');$('#study-mode').value='review';refreshStudyModeUI();$('#study-settings').classList.remove('hidden');$('#question-panel').classList.add('hidden');$('#complete-panel').classList.add('hidden');beginSession();
}
function refreshStudyModeUI(){
  const reviewMode=$('#study-mode')?.value==='review';
  if($('#study-direction'))$('#study-direction').disabled=reviewMode;
  renderReviewCounts();
}
function beginSession(){
  const mode=$('#study-mode').value;const direction=$('#study-direction').value;const count=$('#study-count').value;
  let questions=[];
  if(mode==='review'){
    questions=getReviewEntries().sort((a,b)=>{
      const priorityB=(b.wrongCount||1)*3-(b.correctStreak||0)*2;
      const priorityA=(a.wrongCount||1)*3-(a.correctStreak||0)*2;
      return priorityB-priorityA||(b.lastWrongAt||0)-(a.lastWrongAt||0);
    }).map(entry=>({item:entry.item,direction:entry.direction,reviewKey:entry.key}));
    if(!questions.length){showToast('復習対象はありません。通常テストを進めてみましょう');return;}
  }else{
    data.items.forEach(item=>{if(direction==='ja-en'||direction==='mixed')questions.push({item,direction:'ja-en'});if(direction==='en-ja'||direction==='mixed')questions.push({item,direction:'en-ja'});});
    questions.sort(()=>Math.random()-.5);
  }
  const amount=count==='all'?questions.length:Math.min(Number(count),questions.length);
  session={questions:questions.slice(0,amount),index:0,correct:0,total:0,graded:false,current:null,mode};
  $('#study-settings').classList.add('hidden');$('#complete-panel').classList.add('hidden');$('#question-panel').classList.remove('hidden');showQuestion();
}
function showQuestion(){
  session.graded=false;session.current=session.questions[session.index];const {item,direction}=session.current;
  const total=session.questions.length;$('#question-direction-label').textContent=`${session.mode==='review'?'復習｜':''}${direction==='ja-en'?'日本語 → 英語':'英語 → 日本語'}`;
  $('#question-progress').textContent=`QUESTION ${String(session.index+1).padStart(2,'0')} / ${String(total).padStart(2,'0')}`;
  $('#progress-fill').style.width=`${session.index/total*100}%`;
  $('#question-tag').textContent=`${session.mode==='review'?'復習｜':''}${item.title}`;$('#question-text').textContent=direction==='ja-en'?item.promptJa:item.promptEn;
  $('#question-hint').textContent=direction==='ja-en'?'意味が自然に伝わる英文で答えてください。':'文の意味を自然な日本語で答えてください。';
  $('#answer-label').textContent=direction==='ja-en'?'YOUR ANSWER / 英語で入力':'YOUR ANSWER / 日本語で入力';
  $('#answer-input').value='';$('#answer-input').disabled=false;$('#submit-answer').disabled=false;$('#submit-answer').classList.remove('hidden');$('#result-panel').classList.add('hidden');$('#after-actions').classList.add('hidden');$('#model-answer-panel').classList.add('hidden');$('#model-answer-list').innerHTML='';$('#model-explanation').textContent='';$$('.grade-choice').forEach(button=>{button.disabled=false;button.classList.remove('selected');});
  $('#answer-input').focus();
}
function revealAnswers(){
  if(session.graded)return;
  const {item,direction}=session.current;
  const answers=answerList(item,direction==='ja-en'?'en':'ja');
  const list=$('#model-answer-list');
  list.innerHTML=answers.map(answer=>`<li>${escapeHTML(answer)}</li>`).join('');
  const explanation=$('#model-explanation');
  if(item.explanation){explanation.textContent=item.explanation;explanation.classList.remove('hidden');}
  else{explanation.textContent='';explanation.classList.add('hidden');}
  $('#model-answer-panel').classList.remove('hidden');
  $('#submit-answer').classList.add('hidden');
  $('#answer-input').disabled=true;
  $('#after-actions').classList.add('hidden');
}
function chooseSelfGrade(outcome){
  if(session.graded)return;
  if(!session.current || !session.current.item){
    showToast('現在の問題を確認できません。テストを最初から開始してください。');
    return;
  }
  session.graded=true;
  session.total++;
  if(outcome==='correct')session.correct++;
  const {item,direction}=session.current;
  const reviewNote=updateReviewQueue(item,direction,outcome);
  const log=data.logs[todayISO()]||(data.logs[todayISO()]={attempts:0,correct:0});
  log.attempts++;
  if(outcome==='correct')log.correct++;
  saveData();renderStats();renderMiniCalendar();renderReviewCounts();
  const labels={correct:'自分で「正解」と記録しました。',incorrect:'「不正解」として記録しました。',review:'「要復習」として記録しました。'};
  const panel=$('#result-panel');
  panel.className=`result-panel ${outcome==='correct'?'correct':outcome==='incorrect'?'incorrect':'review-result'}`;
  panel.textContent=[labels[outcome],reviewNote].filter(Boolean).join(' ');
  panel.classList.remove('hidden');
  $$('.grade-choice').forEach(button=>{button.disabled=true;button.classList.toggle('selected',button.dataset.grade===outcome);});
  $('#after-actions').classList.remove('hidden');
  $('#progress-fill').style.width=`${(session.index+1)/session.questions.length*100}%`;
}

// Navigation and view actions
$$('.nav-item[data-view]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.view)));
$$('[data-go]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.go)));
$$('[data-start-direction]').forEach(btn=>btn.addEventListener('click',()=>startSession(btn.dataset.startDirection)));
$('#start-study').addEventListener('click',beginSession);
$('#study-mode').addEventListener('change',refreshStudyModeUI);
$('#home-review-button').addEventListener('click',startReviewSession);
$('#submit-answer').addEventListener('click',()=>{if(!$('#answer-input').value.trim()){showToast('先に自分の回答を入力してください');$('#answer-input').focus();return;}revealAnswers();});

$('#quit-study').addEventListener('click',()=>{if(confirm('このテストを終了しますか？')){navigate('study');$('#question-panel').classList.add('hidden');$('#study-settings').classList.remove('hidden');}});
$('#next-question').addEventListener('click',nextQuestion);
// Self-grading buttons: delegated handler also supports mobile browsers and replaced DOM nodes.
document.addEventListener('click',event=>{
  const button=event.target.closest('.grade-choice');
  if(!button)return;
  event.preventDefault();
  event.stopPropagation();
  const outcome=button.dataset.grade;
  if(!['correct','incorrect','review'].includes(outcome))return;
  try{
    chooseSelfGrade(outcome);
  }catch(error){
    console.error('Self-grade error:',error);
    showToast('採点の記録に失敗しました。ページを再読み込みしてください。');
  }
});
$('#back-home').addEventListener('click',()=>navigate('home'));
$('#add-grammar-open').addEventListener('click',()=>openGrammarModal());
$('[data-action="add-grammar"]').addEventListener('click',()=>openGrammarModal());
$('#library-search').addEventListener('input',renderLibrary);
$('#grammar-form').addEventListener('submit',e=>{
  e.preventDefault();const id=$('#grammar-id').value||makeId();const enAnswers=splitLines($('#answer-en').value);const jaAnswers=splitLines($('#answer-ja').value);if(!enAnswers.length||!jaAnswers.length){showToast('英語と日本語の解答をそれぞれ1つ以上入力してください');return;}const item={id,title:$('#grammar-title').value.trim(),promptJa:$('#prompt-ja').value.trim(),answerEn:enAnswers[0],altEn:enAnswers.slice(1),promptEn:$('#prompt-en').value.trim(),answerJa:jaAnswers[0],altJa:jaAnswers.slice(1),explanation:$('#grammar-explanation').value.trim()};
  const existing=data.items.findIndex(x=>x.id===id);if(existing>=0)data.items[existing]=item;else data.items.push(item);saveData();closeModal('grammar-modal');renderLibrary();renderStats();showToast(existing>=0?'文法を更新しました':'文法を追加しました');
});
$$('[data-close]').forEach(btn=>btn.addEventListener('click',()=>closeModal(btn.dataset.close)));
$$('.modal-backdrop').forEach(backdrop=>backdrop.addEventListener('click',e=>{if(e.target===backdrop)closeModal(backdrop.id);}));
$('#month-prev').addEventListener('click',()=>{calendarCursor.setMonth(calendarCursor.getMonth()-1);renderCalendar();});
$('#month-next').addEventListener('click',()=>{calendarCursor.setMonth(calendarCursor.getMonth()+1);renderCalendar();});
$('#settings-open').addEventListener('click',()=>{openModal('settings-modal');});$('#settings-avatar').addEventListener('click',()=>openModal('settings-modal'));
$('#export-data').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),...data},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`grammar-lab-backup-${todayISO()}.json`;a.click();URL.revokeObjectURL(url);showToast('バックアップを書き出しました');});
$('#import-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{const parsed=JSON.parse(await file.text());if(!Array.isArray(parsed.items)||!parsed.logs||typeof parsed.logs!=='object')throw new Error('format');if(!confirm('現在の文法データと学習記録を、読み込む内容で置き換えますか？'))return;data={items:parsed.items.map(item=>({...item,altEn:Array.isArray(item.altEn)?item.altEn:[],altJa:Array.isArray(item.altJa)?item.altJa:[]})),logs:parsed.logs,review:parsed.review&&typeof parsed.review==='object'?parsed.review:{}};saveData();renderHome();renderLibrary();renderCalendar();renderReviewCounts();showToast('データを読み込みました');closeModal('settings-modal');}catch{showToast('JSONファイルを読み込めませんでした');}finally{e.target.value='';}});
$('#reset-data').addEventListener('click',()=>{if(!confirm('文法データと学習記録をすべて削除します。よろしいですか？'))return;data={items:[],logs:{},review:{}};saveData();renderHome();renderLibrary();renderCalendar();renderReviewCounts();closeModal('settings-modal');showToast('すべてのデータを削除しました');});

$('#today-label').textContent=formatJapaneseDate(todayISO());
$('#ai-status-side').textContent='自己採点モード';renderHome();
