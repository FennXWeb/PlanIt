import {initialState,uid,today,addDays,DEPARTMENTS,weekday} from './data.js';
import {createDay,taskBase,integrateTour} from './engine.js';
export function demoState(){
 const s=initialState();s.profile={name:'Jordan',leadId:'lead'};
 s.departments=DEPARTMENTS.filter(d=>['14','17','74'].includes(d.id));
 s.team=[{id:'lead',name:'Jordan',role:'Team lead',active:true,departments:[]},{id:'maya',name:'Maya',role:'Associate',active:true,departments:[]},{id:'alex',name:'Alex',role:'Associate',active:true,departments:[]},{id:'sam',name:'Sam',role:'Associate',active:true,departments:[]}];
 for(let i=1;i<=18;i++)s.aisles.push({id:`aisle-${i}`,label:`H${i}`,department:i<=6?'14':i<=12?'17':'74',topstock:i%4!==0,zoneMinutes:20+(i%3)*5,topMinutes:20});
 for(const id of ['bins','feature','prices','tags','rfid','modular'])s.settings.routines[id].enabled=true;
 s.settings.rfid={'14':{enabled:true,days:[1,3,5]},'17':{enabled:true,days:[1,3,5]}};
 s.settings.zoneWindow={start:780,end:900};s.settings.reshopWindows=[{start:600,end:660},{start:900,end:960}];
 const shifts=s.team.map((p,i)=>({personId:p.id,start:i===3?600:420,end:i===3?1140:960,mealStart:i===3?840:660+i*30,mealMinutes:60,breaks:[{start:i===3?720:540+i*15,minutes:15},{start:i===3?990:840+i*15,minutes:15}]}));
 for(let offset=-6;offset<=0;offset++){
  const date=addDays(today(),offset);
  let d=createDay(s,date,structuredClone(shifts));
  d.tasks.forEach((t,i)=>{if(offset<0&&i%7!==0||offset===0&&i<4){t.status='done';t.progress=100;t.actualMinutes=t.minutes+(i%3)*5;}else if(offset<0)t.progress=i%2?50:0;});
  d.reviewed=offset<0;s.days.push(d);
 }
 const d=s.days.at(-1);
 const note=taskBase({title:'Refresh the cookware endcap',kind:'custom',department:'14',minutes:35,priority:'high',notes:'Straighten presentation and bring available stock to the home.'});
 s.days[s.days.length-1]=integrateTour(s,d,[note]);
 s.modulars=[{id:uid(),department:'74',category:'0231',description:'Kitchen organization',sections:4,minutes:120,dueDate:addDays(today(),1),completed:false}];
 return s;
}
