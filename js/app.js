(() => {
"use strict";
const STORAGE_KEY = "student-life-data-v1";
const DAYS = ["日曜日","月曜日","火曜日","水曜日","木曜日","金曜日","土曜日"];
const $ = (id) => document.getElementById(id);
const todayISO = () => {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const defaultData = () => ({
  profile:{name:""}, theme:"light",
  tasks:[], events:[], tests:[],
  timetable:{ "月曜日":{},"火曜日":{},"水曜日":{},"木曜日":{},"金曜日":{},"土曜日":{} },
  timetableSettings:{mode:"normal", periodCount:6, periods:{}}
});

let data = loadData();
let currentPage = "dashboard";
let selectedDay = todayISO();
let calendarCursor = new Date();
let selectedWeekday = DAYS[(new Date()).getDay()];
let modalSubmitHandler = null;
let toastTimer = null;

function loadData(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultData();
    const parsed = JSON.parse(raw);
    const base = defaultData();
    return {
      ...base, ...parsed,
      profile:{...base.profile,...(parsed.profile||{})},
      tasks:Array.isArray(parsed.tasks)?parsed.tasks:[],
      events:Array.isArray(parsed.events)?parsed.events:[],
      tests:Array.isArray(parsed.tests)?parsed.tests:[],
      timetable:{...base.timetable,...(parsed.timetable||{})},
      timetableSettings:{
        ...base.timetableSettings,
        ...(parsed.timetableSettings||{}),
        mode: parsed.timetableSettings?.mode || "normal",
        periods:{...(parsed.timetableSettings?.periods||{})}
      }
    };
  } catch(e){ console.warn("保存データを読み込めませんでした",e); return defaultData(); }
}

function save(){
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify(data)); }
  catch(e){ showToast("保存できませんでした。ブラウザの空き容量を確認してください。"); }
  renderAll();
}

function showToast(message){
  const el=$("toast"); el.textContent=message; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2400);
}

function formatDate(iso, options={month:"numeric",day:"numeric"}){
  if(!iso) return "期限未設定";
  const d=new Date(`${iso}T00:00:00`);
  if(Number.isNaN(d.getTime())) return "日付不明";
  return new Intl.DateTimeFormat("ja-JP",options).format(d);
}

function dateCompare(a,b){ return (a||"9999-99-99").localeCompare(b||"9999-99-99"); }
function isPast(iso){ return !!iso && iso < todayISO(); }

function setPage(page){
  if(!$(`page-${page}`)) return;
  currentPage=page;
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${page}`));
  document.querySelectorAll(".nav-item[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  const titles={dashboard:"ホーム",tasks:"課題管理",timetable:"時間割",calendar:"カレンダー",tests:"テスト管理",settings:"設定"};
  $("pageTitle").textContent=titles[page]||"ホーム";
  $("sidebar").classList.remove("open");
  if(page==="calendar") renderCalendar();
  if(page==="timetable") renderTimetable();
  window.scrollTo({top:0,behavior:"smooth"});
}

function openModal(title, fields, submitText, handler){
  $("modalTitle").textContent=title; $("modalSubmit").textContent=submitText||"保存する";
  $("modalFields").innerHTML=fields.join("");
  modalSubmitHandler=handler;
  $("modalBackdrop").classList.add("open"); $("modalBackdrop").setAttribute("aria-hidden","false");
  setTimeout(()=>$("modalFields").querySelector("input,select,textarea")?.focus(),40);
}

function closeModal(){ $("modalBackdrop").classList.remove("open"); $("modalBackdrop").setAttribute("aria-hidden","true"); modalSubmitHandler=null; }

function field(label,id,type="text",value="",placeholder="",required=false,extra=""){
  return `<div class="modal-field"><label for="${id}">${escapeHTML(label)}</label><input id="${id}" type="${type}" value="${escapeHTML(value)}" placeholder="${escapeHTML(placeholder)}" ${required?"required":""} ${extra}></div>`;
}
function selectField(label,id,options,value=""){
  return `<div class="modal-field"><label for="${id}">${escapeHTML(label)}</label><select id="${id}">${options.map(o=>`<option value="${escapeHTML(o.value)}" ${o.value===value?"selected":""}>${escapeHTML(o.label)}</option>`).join("")}</select></div>`;
}
function textareaField(label,id,value="",placeholder=""){
  return `<div class="modal-field"><label for="${id}">${escapeHTML(label)}</label><textarea id="${id}" placeholder="${escapeHTML(placeholder)}">${escapeHTML(value)}</textarea></div>`;
}

function addTask(existing=null){
  const t=existing||{};
  openModal(existing?"課題を編集":"課題を追加",[
    field("課題名","fTitle","text",t.title||"","例：数学の問題集 p.20",true,'maxlength="100"'),
    field("科目","fSubject","text",t.subject||"","例：数学",'','maxlength="40"'),
    field("提出期限","fDate","date",t.due||""),
    selectField("優先度","fPriority",[{value:"normal",label:"通常"},{value:"high",label:"高"},{value:"low",label:"低"}],t.priority||"normal"),
    textareaField("メモ","fNote",t.note||"","課題の範囲や補足など")
  ],"保存する",()=>{
    const title=$("fTitle").value.trim(); if(!title){showToast("課題名を入力してください。");return false;}
    const item={id:t.id||uid(),title,subject:$("fSubject").value.trim(),due:$("fDate").value,priority:$("fPriority").value,note:$("fNote").value.trim(),done:!!t.done,created:t.created||Date.now()};
    if(existing) data.tasks=data.tasks.map(x=>x.id===t.id?item:x); else data.tasks.push(item);
    save(); closeModal(); showToast(existing?"課題を更新しました。":"課題を追加しました。"); return true;
  });
}

function addEvent(existing=null){
  const e=existing||{};
  openModal(existing?"予定を編集":"予定を追加",[
    field("予定名","fTitle","text",e.title||"","例：部活動",true,'maxlength="100"'),
    field("日付","fDate","date",e.date||selectedDay||todayISO(),"",true),
    field("開始時刻（任意）","fTime","time",e.time||""),
    field("場所（任意）","fPlace","text",e.place||"","例：体育館",'','maxlength="80"'),
    textareaField("メモ","fNote",e.note||"","補足情報")
  ],"保存する",()=>{
    const title=$("fTitle").value.trim(); if(!title){showToast("予定名を入力してください。");return false;}
    const item={id:e.id||uid(),title,date:$("fDate").value,time:$("fTime").value,place:$("fPlace").value.trim(),note:$("fNote").value.trim()};
    if(existing) data.events=data.events.map(x=>x.id===e.id?item:x); else data.events.push(item);
    selectedDay=item.date; save(); closeModal(); showToast(existing?"予定を更新しました。":"予定を追加しました。"); return true;
  });
}

function addTest(existing=null){
  const t=existing||{};
  openModal(existing?"テストを編集":"テストを追加",[
    field("テスト名","fTitle","text",t.title||"","例：前期中間試験",true,'maxlength="100"'),
    field("科目","fSubject","text",t.subject||"","例：英語",'','maxlength="40"'),
    field("実施日","fDate","date",t.date||todayISO(),"",true),
    field("テスト範囲","fRange","text",t.range||"","例：教科書 p.10〜30",'','maxlength="120"'),
    textareaField("メモ","fNote",t.note||"","勉強する内容など")
  ],"保存する",()=>{
    const title=$("fTitle").value.trim(); if(!title){showToast("テスト名を入力してください。");return false;}
    const item={id:t.id||uid(),title,subject:$("fSubject").value.trim(),date:$("fDate").value,range:$("fRange").value.trim(),note:$("fNote").value.trim()};
    if(existing) data.tests=data.tests.map(x=>x.id===t.id?item:x); else data.tests.push(item);
    save(); closeModal(); showToast(existing?"テストを更新しました。":"テストを追加しました。"); return true;
  });
}

function getPeriodLabel(n, mode){
  if(mode === "kosen"){
    const pairs = { 1: "1-2限", 2: "3-4限", 3: "5-6限", 4: "7-8限", 5: "9-10限", 6: "11-12限" };
    return pairs[n] || `${(n-1)*2+1}-${n*2}限`;
  }
  return `${n}時間目`;
}

function editTimetable(){
  const day=selectedWeekday;
  const mode = data.timetableSettings?.mode || "normal";
  const count=Number(data.timetableSettings?.periodCount||6);
  const slots=Array.from({length:count},(_,i)=>i+1);

  const fields=[`<p class="muted" style="margin-bottom:15px">${escapeHTML(day)}の授業を登録します。</p>`];
  slots.forEach(n=>{
    const lesson=data.timetable[day]?.[n]||{};
    const label = getPeriodLabel(n, mode);
    fields.push(`<div class="modal-field"><label>${escapeHTML(label)}</label><input id="lesson${n}" value="${escapeHTML(lesson.name||"")}" placeholder="授業名（例：数学）" maxlength="50"><input id="teacher${n}" value="${escapeHTML(lesson.teacher||"")}" placeholder="教室・先生など（任意）" maxlength="60" style="margin-top:6px"></div>`);
  });
  openModal(`${day}の時間割`,fields,"保存する",()=>{
    data.timetable[day]=data.timetable[day]||{};
    slots.forEach(n=>{
      const name=$(`lesson${n}`).value.trim(), teacher=$(`teacher${n}`).value.trim();
      if(name) data.timetable[day][n]={name,teacher}; else delete data.timetable[day][n];
    });
    save(); closeModal(); showToast("時間割を保存しました。"); return true;
  });
}

function removeItem(collection,id,label){
  if(!confirm(`${label}を削除しますか？`))return;
  data[collection]=data[collection].filter(x=>x.id!==id);save();showToast(`${label}を削除しました。`);
}

function renderDashboard(){
  const active=data.tasks.filter(t=>!t.done),done=data.tasks.filter(t=>t.done);
  $("statTasks").textContent=active.length;$("statEvents").textContent=data.events.filter(e=>e.date===todayISO()).length;
  $("statTests").textContent=data.tests.length;$("statDone").textContent=done.length;
  $("taskNavCount").textContent=active.length;
  const total=data.tasks.length,rate=total?Math.round(done.length/total*100):0;
  $("progressText").textContent=`${rate}%`;$("progressBar").style.width=`${rate}%`;
  $("progressDone").textContent=`${done.length}件完了`;$("progressRemain").textContent=`${active.length}件残り`;
  $("welcomeDate").textContent=new Intl.DateTimeFormat("ja-JP",{year:"numeric",month:"long",day:"numeric",weekday:"long"}).format(new Date());
  $("userGreeting").textContent=data.profile.name?`、${data.profile.name}さん`:"";
  const events=data.events.filter(e=>e.date===todayISO()).sort((a,b)=>(a.time||"").localeCompare(b.time||""));
  $("todayEvents").innerHTML=events.length?events.map(e=>`<div class="list-item"><i class="list-marker"></i><div class="list-main"><strong>${escapeHTML(e.title)}</strong><small>${escapeHTML(e.place||"場所未設定")}</small></div><span class="list-meta">${escapeHTML(e.time||"時間未設定")}</span></div>`).join(""):`<div class="empty-state">今日の予定はありません。</div>`;
  const upcoming=[...active].filter(t=>t.due).sort((a,b)=>dateCompare(a.due,b.due)).slice(0,4);
  $("upcomingTasks").innerHTML=upcoming.length?upcoming.map(t=>`<div class="list-item"><i class="list-marker" style="background:${isPast(t.due)?'var(--red)':'var(--orange)'}"></i><div class="list-main"><strong>${escapeHTML(t.title)}</strong><small>${escapeHTML(t.subject||"科目未設定")}</small></div><span class="list-meta">${formatDate(t.due)}</span></div>`).join(""):`<div class="empty-state">期限が設定された未完了課題はありません。</div>`;
  const tests=[...data.tests].sort((a,b)=>dateCompare(a.date,b.date)).filter(t=>t.date>=todayISO()).slice(0,4);
  $("upcomingTests").innerHTML=tests.length?tests.map(t=>`<div class="list-item"><i class="list-marker" style="background:var(--purple)"></i><div class="list-main"><strong>${escapeHTML(t.title)}</strong><small>${escapeHTML(t.subject||"科目未設定")}</small></div><span class="list-meta">${formatDate(t.date)}</span></div>`).join(""):`<div class="empty-state">今後のテストは登録されていません。</div>`;
}

function renderTasks(){
  const q=$("taskSearch").value.trim().toLowerCase(),filter=$("taskFilter").value,sort=$("taskSort").value;
  let list=data.tasks.filter(t=>(!q||`${t.title} ${t.subject} ${t.note}`.toLowerCase().includes(q))&&(filter==="all"||(filter==="active"?!t.done:t.done)));
  if(sort==="deadline")list.sort((a,b)=>dateCompare(a.due,b.due));if(sort==="created")list.sort((a,b)=>b.created-a.created);if(sort==="subject")list.sort((a,b)=>(a.subject||"").localeCompare(b.subject||"","ja"));
  $("taskSummary").textContent=`${list.length}件の課題`;
  $("taskList").innerHTML=list.length?list.map(t=>`<div class="task-row ${t.done?"completed":""}"><input class="task-check" type="checkbox" data-task-check="${t.id}" ${t.done?"checked":""} aria-label="${escapeHTML(t.title)}を完了にする"><div class="task-info"><strong>${escapeHTML(t.title)}</strong><small>${escapeHTML(t.subject||"科目未設定")} · ${t.due?`期限 ${formatDate(t.due,{year:"numeric",month:"numeric",day:"numeric"})}`:"期限未設定"}${t.note?` · ${escapeHTML(t.note)}`:""}</small></div><span class="tag ${t.done?"done":isPast(t.due)?"late":""}">${t.done?"完了":isPast(t.due)?"期限超過":t.priority==="high"?"優先":"未完了"}</span><div class="row-actions"><button class="mini-action" data-edit-task="${t.id}">編集</button><button class="mini-action" data-delete-task="${t.id}">削除</button></div></div>`).join(""):`<div class="empty-state">課題はありません。右上の「課題を追加」から登録できます。</div>`;
}

function renderTimetable(){
  $("daySelector").innerHTML=DAYS.map(d=>`<button class="segment-button ${d===selectedWeekday?"active":""}" data-weekday="${d}">${d.slice(0,1)}</button>`).join("");
  const lessons=data.timetable[selectedWeekday]||{};
  const mode = data.timetableSettings?.mode || "normal";
  const count=Number(data.timetableSettings?.periodCount||6);

  const rows=Array.from({length:count},(_,i)=>i+1).map(n=>{
    const l=lessons[n], time=data.timetableSettings?.periods?.[n]||{};
    const timeText=(time.start||time.end)?`${time.start||"時刻未設定"} 〜 ${time.end||"時刻未設定"}`:"時刻未設定";
    const label = getPeriodLabel(n, mode);
    return `<div class="period-row"><div class="period-number">${escapeHTML(label)}<small class="period-time">${escapeHTML(timeText)}</small></div>${l?`<div class="lesson-card"><strong>${escapeHTML(l.name)}</strong><small>${escapeHTML(l.teacher||"詳細未設定")}</small></div>`:`<div class="lesson-card" style="border-color:var(--line);color:var(--muted)"><strong>授業未登録</strong><small>「時間割を編集」から登録できます。</small></div>`}</div>`;
  }).join("");
  $("timetableContent").innerHTML=rows;
}

function getItemsForDate(iso){
  const items=[];
  data.events.filter(e=>e.date===iso).forEach(e=>items.push({kind:"event",title:e.title,sub:[e.time,e.place].filter(Boolean).join(" · ")||"予定",id:e.id}));
  data.tasks.filter(t=>t.due===iso&&!t.done).forEach(t=>items.push({kind:"task",title:t.title,sub:`課題期限${t.subject?` · ${t.subject}`:""}`,id:t.id}));
  data.tests.filter(t=>t.date===iso).forEach(t=>items.push({kind:"test",title:t.title,sub:`テスト${t.subject?` · ${t.subject}`:""}`,id:t.id}));
  return items;
}

function renderCalendar(){
  const year=calendarCursor.getFullYear(),month=calendarCursor.getMonth();
  $("calendarMonth").textContent=`${year}年 ${month+1}月`;
  const first=new Date(year,month,1),start=new Date(year,month,1-first.getDay());
  let html="";
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);
    const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const items=getItemsForDate(iso);
    const kinds=[...new Set(items.map(x=>x.kind))];
    html+=`<button class="calendar-day ${d.getMonth()!==month?"other-month":""} ${iso===todayISO()?"today":""} ${iso===selectedDay?"selected":""}" data-calendar-date="${iso}"><span class="day-number">${d.getDate()}</span><span class="day-dots">${kinds.map(k=>`<i class="${k==="event"?"blue-dot":k==="task"?"orange-dot":"purple-dot"}"></i>`).join("")}</span></button>`;
  }
  $("calendarDays").innerHTML=html;renderSelectedDay();
}

function renderSelectedDay(){
  $("selectedDateTitle").textContent=new Intl.DateTimeFormat("ja-JP",{month:"long",day:"numeric",weekday:"short"}).format(new Date(`${selectedDay}T00:00:00`));
  const items=getItemsForDate(selectedDay);
  $("selectedDayItems").innerHTML=items.length?items.map(i=>`<div class="list-item"><i class="list-marker" style="background:${i.kind==="event"?"var(--primary)":i.kind==="task"?"var(--orange)":"var(--purple)"}"></i><div class="list-main"><strong>${escapeHTML(i.title)}</strong><small>${escapeHTML(i.sub)}</small></div><span class="list-meta">${i.kind==="event"?"予定":i.kind==="task"?"課題":"テスト"}</span></div>`).join(""):`<div class="empty-state">この日の登録内容はありません。</div>`;
}

function renderTests(){
  const list=[...data.tests].sort((a,b)=>dateCompare(a.date,b.date));
  $("testList").innerHTML=list.length?list.map(t=>`<div class="list-item"><i class="list-marker" style="background:var(--purple)"></i><div class="list-main"><strong>${escapeHTML(t.title)}</strong><small>${escapeHTML(t.subject||"科目未設定")} · ${escapeHTML(t.range||"範囲未設定")}${t.note?` · ${escapeHTML(t.note)}`:""}</small></div><span class="list-meta">${formatDate(t.date,{year:"numeric",month:"numeric",day:"numeric"})}</span><div class="row-actions"><button class="mini-action" data-edit-test="${t.id}">編集</button><button class="mini-action" data-delete-test="${t.id}">削除</button></div></div>`).join(""):`<div class="empty-state">テストはまだ登録されていません。</div>`;
}

function renderSettings(){
  $("displayName").value=data.profile.name||"";
  $("themeSelect").value=data.theme||"light";
  $("timetableMode").value=data.timetableSettings?.mode || "normal";
  $("periodCount").value=String(data.timetableSettings?.periodCount||6);
  renderPeriodTimeSettings();
}

function renderPeriodTimeSettings(){
  const count=Number($("periodCount")?.value||data.timetableSettings?.periodCount||6);
  const mode=$("timetableMode")?.value||data.timetableSettings?.mode||"normal";
  const periods=data.timetableSettings?.periods||{};

  $("periodTimeSettings").innerHTML=Array.from({length:count},(_,i)=>{
    const n=i+1, p=periods[n]||{};
    const label = getPeriodLabel(n, mode);
    return `<div class="period-setting-row"><strong>${escapeHTML(label)}</strong><label>開始<input type="time" data-period-start="${n}" value="${escapeHTML(p.start||"")}"></label><label>終了<input type="time" data-period-end="${n}" value="${escapeHTML(p.end||"")}"></label></div>`;
  }).join("");
}

function renderAll(){
  renderDashboard();renderTasks();renderTimetable();renderCalendar();renderTests();renderSettings();
}

function exportData(){
  const blob=new Blob([JSON.stringify({format:"STUDENT-LIFE-BACKUP",version:1,exportedAt:new Date().toISOString(),data},null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`student-life-backup-${todayISO()}.json`;a.click();URL.revokeObjectURL(url);showToast("バックアップを書き出しました。");
}

function importData(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const parsed=JSON.parse(reader.result),incoming=parsed.data||parsed;
      if(!incoming||!Array.isArray(incoming.tasks)||!Array.isArray(incoming.events)||!Array.isArray(incoming.tests)||!incoming.timetable)throw new Error("invalid");
      if(!confirm("現在のデータをバックアップの内容に置き換えます。よろしいですか？"))return;
      data={...defaultData(),...incoming,profile:{...defaultData().profile,...incoming.profile},};
      save();showToast("バックアップを読み込みました。");
    }catch(e){showToast("ファイルを読み込めません。正しいバックアップか確認してください。");}
    $("importData").value="";
  };
  reader.readAsText(file);
}

function init(){
  $("todayLabel").textContent=new Intl.DateTimeFormat("ja-JP",{month:"long",day:"numeric",weekday:"short"}).format(new Date());
  document.body.classList.toggle("dark",data.theme==="dark");
  renderAll();

  document.addEventListener("click",e=>{
    const page=e.target.closest("[data-page]")?.dataset.page;if(page){setPage(page);return;}
    const go=e.target.closest("[data-go]")?.dataset.go;if(go){setPage(go);return;}
    if(e.target.closest("[data-page-link]")){e.preventDefault();setPage("dashboard");return;}
    const wd=e.target.closest("[data-weekday]")?.dataset.weekday;if(wd){selectedWeekday=wd;renderTimetable();return;}
    const date=e.target.closest("[data-calendar-date]")?.dataset.calendarDate;if(date){selectedDay=date;const d=new Date(`${date}T00:00:00`);if(d.getMonth()!==calendarCursor.getMonth()||d.getFullYear()!==calendarCursor.getFullYear())calendarCursor=new Date(d.getFullYear(),d.getMonth(),1);renderCalendar();return;}
    const editTask=e.target.closest("[data-edit-task]")?.dataset.editTask;if(editTask){const t=data.tasks.find(x=>x.id===editTask);if(t)addTask(t);return;}
    const delTask=e.target.closest("[data-delete-task]")?.dataset.deleteTask;if(delTask){removeItem("tasks",delTask,"課題");return;}
    const editTest=e.target.closest("[data-edit-test]")?.dataset.editTest;if(editTest){const t=data.tests.find(x=>x.id===editTest);if(t)addTest(t);return;}
    const delTest=e.target.closest("[data-delete-test]")?.dataset.deleteTest;if(delTest){removeItem("tests",delTest,"テスト");return;}
    
    if(e.target.closest("#addTaskButton"))addTask();
    if(e.target.closest("#addEventButton"))addEvent();
    if(e.target.closest("#addTestButton"))addTest();
    if(e.target.closest("#editTimetableButton"))editTimetable();
  });

  document.addEventListener("change",e=>{
    if(e.target.matches("[data-task-check]")){const t=data.tasks.find(x=>x.id===e.target.dataset.taskCheck);if(t){t.done=e.target.checked;save();}}
  });

  $("taskSearch").addEventListener("input",renderTasks);$("taskFilter").addEventListener("change",renderTasks);$("taskSort").addEventListener("change",renderTasks);
  $("prevMonth").addEventListener("click",()=>{calendarCursor.setMonth(calendarCursor.getMonth()-1);renderCalendar();});
  $("nextMonth").addEventListener("click",()=>{calendarCursor.setMonth(calendarCursor.getMonth()+1);renderCalendar();});
  $("calendarToday").addEventListener("click",()=>{calendarCursor=new Date();selectedDay=todayISO();renderCalendar();});
  $("menuToggle").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
  $("modalClose").addEventListener("click",closeModal);$("modalCancel").addEventListener("click",closeModal);
  $("modalBackdrop").addEventListener("click",e=>{if(e.target===$("modalBackdrop"))closeModal();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});
  $("modalForm").addEventListener("submit",e=>{e.preventDefault();if(modalSubmitHandler)modalSubmitHandler();});
  
  $("saveProfile").addEventListener("click",()=>{data.profile.name=$("displayName").value.trim();save();showToast("プロフィールを保存しました。");});
  $("profileButton").addEventListener("click",()=>setPage("settings"));
  $("exportData").addEventListener("click",exportData);$("importData").addEventListener("change",e=>importData(e.target.files[0]));
  $("themeSelect").addEventListener("change",e=>{data.theme=e.target.value;document.body.classList.toggle("dark",data.theme==="dark");save();});
  
  $("periodCount").addEventListener("change",renderPeriodTimeSettings);
  $("timetableMode").addEventListener("change",renderPeriodTimeSettings);

  $("saveTimetableSettings").addEventListener("click",()=>{
    const mode = $("timetableMode").value;
    const count=Number($("periodCount").value);
    const periods={};
    for(let n=1;n<=count;n++){
      const start=document.querySelector(`[data-period-start="${n}"]`)?.value||"";
      const end=document.querySelector(`[data-period-end="${n}"]`)?.value||"";
      if(start&&end&&start>=end){showToast(`${n}番目の時限の終了時刻は開始時刻より後にしてください。`);return;}
      periods[n]={start,end};
    }
    data.timetableSettings={mode, periodCount:count, periods};
    save(); showToast("時間割の設定を保存しました。");
  });

  $("clearData").addEventListener("click",()=>{if(confirm("本当にすべてのデータを削除しますか？この操作は取り消せません。")){data=defaultData();save();document.body.classList.remove("dark");showToast("データを初期化しました。");}});
}

document.addEventListener("DOMContentLoaded",init);
})();