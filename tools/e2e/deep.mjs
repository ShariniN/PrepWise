import fs from 'node:fs';
const log = fs.readFileSync(process.argv[2], 'utf8'); const BASE='http://localhost:4000';
const pwOf = (start) => { const line = log.split('\n').find((l) => l.includes(start)); return line.trim().split(/\s+/).pop(); };
class C{constructor(){this.cookie='';} async req(m,p,b){const r=await fetch(BASE+p,{method:m,headers:{'Content-Type':'application/json',...(this.cookie?{Cookie:this.cookie}:{})},body:b?JSON.stringify(b):undefined});for(const c of r.headers.getSetCookie?.()||[])if(c.startsWith('token='))this.cookie=c.split(';')[0];const t=await r.text();let d;try{d=JSON.parse(t)}catch{d=t}return{status:r.status,data:d};}}
const lect=new C(); await lect.req('POST','/api/auth/login',{email:'lecturer@email.com',password:pwOf('lecturer@email.com')});
const spw=pwOf('student@email.com');
const cs=(await lect.req('GET','/api/courses/mine')).data.courses; const courseId=cs[0].id||cs[0]._id; const cohortId=cs[0].cohorts[0].id||cs[0].cohorts[0]._id;
const s0=new C(); await s0.req('POST','/api/auth/login',{email:'student@email.com',password:spw});
const mcqs=(await s0.req('GET','/api/practice/questions?type=mcq')).data.questions.slice(0,4);
console.log('mcq questions:',mcqs.length, mcqs.map(q=>q.title).join(' | ').slice(0,200));
let sub=0, ok=0, bad=0, sample;
for(let i=1;i<=30;i++){
  const c=new C(); const e= i===1 ? 'student@email.com' : `student${String(i).padStart(2,'0')}@demo-a.test`;
  const l=await c.req('POST','/api/auth/login',{email:e,password:spw}); if(l.status!==200){console.log('login fail',e,l.status);continue;}
  for(const q of mcqs){ const id=q.id||q._id; const d=(await c.req('GET',`/api/practice/questions/${id}`)).data; const n=(d.question?.options||d.options||[]).length||4;
    const pick = (i%3===0)? 0 : (i%3===1)? 1 : 2; // spread of answers
    const r=await c.req('POST',`/api/practice/questions/${id}/submit`,{selected:[pick%n]}); sub++; if(r.status===200){ok++; sample=sample||r.data;} else bad++; }
}
console.log('submitted',sub,'ok',ok,'bad',bad,'sample',JSON.stringify(sample).slice(0,300));
const qs=`?courseId=${courseId}&cohortId=${cohortId}`;
const hm=await lect.req('GET',`/api/analytics/lecturer/topic-heatmap${qs}`); console.log('heatmap',hm.status,JSON.stringify(hm.data).slice(0,500));
const qq=await lect.req('GET',`/api/analytics/lecturer/question-quality${qs}`); console.log('quality',qq.status,JSON.stringify(qq.data).slice(0,500));
const need=await lect.req('GET',`/api/analytics/lecturer/students-needing-help${qs}`); console.log('needing help',need.status,JSON.stringify(need.data).slice(0,400));
const act=await lect.req('GET',`/api/analytics/lecturer/activity${qs}`); console.log('activity',act.status,JSON.stringify(act.data).slice(0,300));
const adm=new C(); await adm.req('POST','/api/auth/login',{email:'admin@email.com',password:pwOf('admin@email.com')}); const ov=await adm.req('GET','/api/analytics/admin/overview'); console.log('admin overview',JSON.stringify(ov.data).slice(0,500));
const car=new C(); await car.req('POST','/api/auth/login',{email:'careers@email.com',password:pwOf('careers@email.com')}); const rd=await car.req('GET','/api/analytics/careers/readiness'); console.log('readiness',JSON.stringify(rd.data).slice(0,400));
