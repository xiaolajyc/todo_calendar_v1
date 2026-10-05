const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('/mnt/data/v171work/index.html','utf8');
const m=html.match(/<script id="v2-172-recurrence-authoritative-fix">([\s\S]*?)<\/script>/);
if(!m) throw Error('block missing');
let tasks=[]; let saved=0,renders=0; let promptQueue=[];
const window={};
const ctx={
 window, tasks,
 cloneObj:o=>JSON.parse(JSON.stringify(o)),
 parseDate:s=>new Date(s+'T00:00:00'),
 addDays:(s,n)=>{const d=new Date(s+'T00:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)},
 timeMin:s=>{const [h,m]=s.split(':').map(Number);return h*60+m},
 timeStr:m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`,
 recurring:t=>!!(t&&t.date&&(typeof t.repeat==='string'?t.repeat:(t.repeat?.type||'none'))!=='none'),
 repeatType:t=>typeof t.repeat==='string'?t.repeat:(t.repeat?.type||'none'),
 ensureRec:t=>{if(!t.exceptions)t.exceptions={deleted:[],completed:[],overrides:{}};t.exceptions.deleted??=[];t.exceptions.completed??=[];t.exceptions.overrides??={};return t.exceptions},
 recurrenceOrdinal:(t,ds)=>{let n=0; for(let d=t.date;d<=ds;d=ctx.addDays(d,1)){const dd=Math.round((ctx.parseDate(d)-ctx.parseDate(t.date))/86400000);let on=false;const r=typeof t.repeat==='string'?{type:t.repeat}:t.repeat; if(r.type==='daily')on=true; else if(r.type==='weekly')on=(new Date(d+'T00:00:00').getDay()===new Date(t.date+'T00:00:00').getDay()); if(on)n++;} return n},
 occurrenceData:(master,occDate)=>{ if(!ctx.recurring(master))return {...master,_occurrenceDate:master.date,date:master.date,_key:master.id}; const r=ctx.ensureRec(master); const rr=typeof master.repeat==='string'?{type:master.repeat}:master.repeat; const on=(()=>{if(occDate<master.date)return false;const dd=Math.round((ctx.parseDate(occDate)-ctx.parseDate(master.date))/86400000);if(rr.type==='daily')return true;if(rr.type==='weekly')return new Date(occDate+'T00:00:00').getDay()===new Date(master.date+'T00:00:00').getDay();return false})(); if(!on||r.deleted.includes(occDate))return null; const ov=r.overrides[occDate]||{}; const x={...JSON.parse(JSON.stringify(master)),...JSON.parse(JSON.stringify(ov)),_occurrenceDate:occDate,_masterId:master.id,_key:master.id+'@@'+occDate}; x.id=x._key;x._originalDate=occDate; if(r.completed.includes(occDate))x.completed=true; return x; },
 save:()=>saved++,render:()=>renders++,prompt:()=>promptQueue.shift()||null,alert:()=>{},confirm:()=>true,id:(()=>{let i=1;return()=>String(i++)})(),
};
ctx.global=ctx;vm.createContext(ctx);vm.runInContext(m[1],ctx);
function assert(c,msg){if(!c)throw Error(msg)}
// Whole-series move from middle occurrence: Oct 3 -> Oct 10 (+7d)
tasks.push({id:'A',title:'Daily',date:'2026-10-01',start:'09:00',end:'10:00',repeat:{type:'daily',endType:'date',endValue:'2026-10-07'},exceptions:{deleted:[],completed:['2026-10-03'],overrides:{}}});
promptQueue.push('3');ctx.window.moveOccurrence(tasks[0],'2026-10-03','2026-10-10','11:00','12:00');
let a=tasks[0];
console.log("AFTER MOVE",JSON.stringify(a,null,2));
assert(a.start==='11:00'&&a.end==='12:00','whole move master time should shift from selected occurrence');
assert(a.repeat.endValue==='2026-10-14','whole move end date should shift');
assert(a.exceptions.completed.includes('2026-10-10'),'completed middle occurrence should shift with series');
assert(ctx.occurrenceData(a,'2026-10-10').start==='11:00','moved selected occurrence should land at target');
// Delete future from middle: leave before occurrence only
let b={id:'B',title:'Daily',date:'2026-10-01',start:'09:00',end:'10:00',repeat:{type:'daily'},exceptions:{deleted:[],completed:[],overrides:{}}};tasks=[b];promptQueue.push('2');ctx.window.openOccurrenceDelete(b,'2026-10-03');
assert(b.repeat.endType==='date'&&b.repeat.endValue==='2026-10-02','delete future should end day before selected occurrence');
assert(ctx.occurrenceData(b,'2026-10-02'),'prior occurrence should remain');
assert(ctx.occurrenceData(b,'2026-10-03')===null,'selected occurrence should be gone');
assert(ctx.occurrenceData(b,'2026-10-05')===null,'future occurrence should be gone');
// selection dedupe
let calls=[];window.toggleCalendarSelect = k=>calls.push(k);let countBefore=calls.length;ctx.window.toggleCalendarSelect('A@@2026-10-03');ctx.window.toggleCalendarSelect('A@@2026-10-03');assert(calls.length===1,'duplicate selection toggle in same gesture should be ignored');setTimeout(()=>{},1);
console.log('PASS recurrence + selection tests', {saves:saved,renders:calls.length});
