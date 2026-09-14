export const TIMELINE_SCALE=2.4;
export function dropStart(clientY,laneTop,dayStart,grabOffset=0){return dayStart+Math.round((clientY-laneTop-grabOffset)/TIMELINE_SCALE/5)*5;}
export function taskMenu(task,reviewed){
 const options=[{action:'edit',label:reviewed?'View task details':'Edit task'}];
 if(reviewed)return options;
 if(task.status==='pending')options.push({action:'start',label:'Mark in progress'});
 if(task.status!=='done')options.push({action:'complete',label:'Mark complete'});
 if(task.locked&&task.status==='pending')options.push({action:'unpin',label:'Unpin & auto-schedule'});
 options.push({action:'delete',label:'Delete task'});return options;
}

export function installPlannerInteractions(hooks){
 let gesture=null,menu=null,menuFocus=null,preview=null,label=null,frame=0,suppressClickUntil=0;
 const closeMenu=(restore=false)=>{menu?.remove();menu=null;if(restore&&menuFocus?.isConnected)menuFocus.focus();menuFocus=null;};
 const stop=()=>{cancelAnimationFrame(frame);gesture=null;preview?.remove();label?.remove();preview=null;label=null;document.body.classList.remove('planner-dragging');};
 const cancel=()=>{stop();closeMenu();};
 const taskElement=target=>target.closest?.('.schedule-task,.task-row');
 function showMenu(target,x,y){
  if(!hooks.active())return false;
  const element=taskElement(target),task=element&&hooks.task(element.dataset.task||element.dataset.id),lane=target.closest?.('.person-lane');
  if(!task&&!lane)return false;
  closeMenu();stop();menuFocus=element||document.activeElement;
  const day=hooks.day(),slot=lane?{personId:lane.dataset.person,start:dropStart(y,lane.getBoundingClientRect().top,Number(lane.dataset.start))}:null;
  const options=task?taskMenu(task,day.reviewed):day.reviewed?[]:[{action:'add',label:'Add task here'}];
  if(!options.length)return false;
  menu=document.createElement('div');menu.className='planner-context-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label',task?'Task actions':'Timeline actions');
  const heading=document.createElement('div');heading.className='planner-menu-heading';heading.textContent=task?task.title:hooks.time(slot.start);menu.append(heading);
  for(const option of options){const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.tabIndex=-1;button.textContent=option.label;button.className=option.action==='delete'?'danger':'';button.addEventListener('click',()=>{closeMenu();hooks.action(option.action,task?.id,slot);});menu.append(button);}
  document.body.append(menu);const rect=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(x,innerWidth-rect.width-8))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-rect.height-8))+'px';menu.querySelector('button')?.focus();return true;
 }
 function updatePreview(){
  if(!gesture?.dragging)return;
  const lane=document.elementFromPoint(gesture.x,gesture.y)?.closest('.person-lane');gesture.candidate=null;gesture.error='Drop inside an associate’s timeline.';
  if(lane){
   const start=dropStart(gesture.y,lane.getBoundingClientRect().top,Number(lane.dataset.start),gesture.offset);
   try{gesture.candidate=hooks.validate(gesture.id,lane.dataset.person,start);gesture.error='';}catch(error){gesture.error=error.message;}
   lane.append(preview);preview.hidden=false;preview.style.top=((start-Number(lane.dataset.start))*TIMELINE_SCALE)+'px';preview.style.height=Math.max(22,hooks.minutes(gesture.id)*TIMELINE_SCALE-3)+'px';preview.classList.toggle('invalid',!!gesture.error);
   preview.textContent=hooks.time(start);label.textContent=gesture.error||`${hooks.time(start)} · ${hooks.person(lane.dataset.person)} · release to move`;
  }else{preview.hidden=true;label.textContent=gesture.error;}
  label.style.left=Math.max(8,Math.min(gesture.x+16,innerWidth-320))+'px';label.style.top=Math.max(8,Math.min(gesture.y+20,innerHeight-90))+'px';
 }
 function scrollFrame(){
  if(!gesture?.dragging)return;
  const y=gesture.y,scroll=y<60?-12:y>innerHeight-60?12:0;if(scroll)window.scrollBy(0,scroll);
  const scroller=document.querySelector('.timeline-scroller');
  if(scroller){const box=scroller.getBoundingClientRect();if(y>=box.top&&y<=box.bottom){if(gesture.x<box.left+40)scroller.scrollLeft-=12;else if(gesture.x>box.right-40)scroller.scrollLeft+=12;}}
  updatePreview();frame=requestAnimationFrame(scrollFrame);
 }
 document.addEventListener('contextmenu',event=>{if(showMenu(event.target,event.clientX,event.clientY))event.preventDefault();});
 document.addEventListener('pointerdown',event=>{
  if(menu&&!menu.contains(event.target))closeMenu();
  if(event.button!==0||!event.isPrimary||!hooks.active())return;
  const element=event.target.closest('.schedule-task');if(!element)return;
  const task=hooks.task(element.dataset.task);if(!task||hooks.day().reviewed||task.status!=='pending')return;
  gesture={id:task.id,pointerId:event.pointerId,element,x:event.clientX,y:event.clientY,initialX:event.clientX,initialY:event.clientY,offset:event.clientY-element.getBoundingClientRect().top,dragging:false};
 });
 document.addEventListener('pointermove',event=>{
  if(!gesture||event.pointerId!==gesture.pointerId)return;
  gesture.x=event.clientX;gesture.y=event.clientY;
  if(!gesture.dragging&&Math.hypot(gesture.x-gesture.initialX,gesture.y-gesture.initialY)<6)return;
  event.preventDefault();
  if(!gesture.dragging){gesture.dragging=true;closeMenu();document.body.classList.add('planner-dragging');preview=document.createElement('div');preview.className='planner-drop-preview';label=document.createElement('div');label.className='planner-drag-label';label.setAttribute('role','status');document.body.append(label);scrollFrame();}
  updatePreview();
 },{passive:false});
 document.addEventListener('pointerup',event=>{
  if(!gesture||event.pointerId!==gesture.pointerId)return;
  if(!gesture.dragging){stop();return;}
  gesture.x=event.clientX;gesture.y=event.clientY;updatePreview();const {candidate,error}=gesture;suppressClickUntil=Date.now()+400;stop();
  if(candidate)hooks.move(candidate);else hooks.notice(error);
 });
 document.addEventListener('pointercancel',stop);
 document.addEventListener('click',event=>{if(Date.now()<suppressClickUntil&&event.detail!==0){event.preventDefault();event.stopImmediatePropagation();}},true);
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){if(gesture?.dragging)suppressClickUntil=Date.now()+400;stop();closeMenu(true);return;}
  if(menu){const items=[...menu.querySelectorAll('button')],index=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowUp'?-1:1)+items.length)%items.length]?.focus();}if(event.key==='Tab')closeMenu();return;}
  if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){const el=taskElement(document.activeElement);if(el){const box=el.getBoundingClientRect();if(showMenu(el,box.left+15,box.top+15))event.preventDefault();}}
 });
 window.addEventListener('blur',cancel);window.addEventListener('resize',cancel);document.addEventListener('scroll',()=>closeMenu(),true);
 return {cancel,isInteracting:()=>!!gesture||!!menu};
}

export function installRoutineOrdering({save}){
 let drag=null;
 const ids=list=>[...list.querySelectorAll('[data-routine-id]')].map(row=>row.dataset.routineId);
 const finish=commit=>{
  if(!drag)return;const {list,original,row}=drag;drag=null;row.classList.remove('routine-moving');
  if(!list.isConnected)return;
  const order=ids(list);
  if(!commit){for(const id of original)list.append(list.querySelector(`[data-routine-id="${id}"]`));}
  else if(order.some((id,i)=>id!==original[i]))save(order);
 };
 document.addEventListener('pointerdown',event=>{
  const handle=event.target.closest?.('.routine-handle');if(!handle||event.button!==0||!event.isPrimary)return;
  const row=handle.closest('[data-routine-id]'),list=row.parentElement;
  drag={row,list,original:ids(list),pointer:event.pointerId};handle.setPointerCapture(event.pointerId);row.classList.add('routine-moving');event.preventDefault();
 });
 document.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.pointer)return;event.preventDefault();
  const rows=[...drag.list.children].filter(row=>row!==drag.row);
  const before=rows.find(row=>{const box=row.getBoundingClientRect();return event.clientY<box.top+box.height/2;});
  drag.list.insertBefore(drag.row,before||null);
  if(event.clientY<70)window.scrollBy(0,-16);else if(event.clientY>innerHeight-70)window.scrollBy(0,16);
 },{passive:false});
 document.addEventListener('pointerup',event=>{if(drag&&event.pointerId===drag.pointer)finish(true);});
 document.addEventListener('pointercancel',()=>finish(false));window.addEventListener('blur',()=>finish(false));
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){finish(false);return;}
  const handle=event.target.closest?.('.routine-handle');if(!handle||!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  event.preventDefault();const row=handle.closest('[data-routine-id]'),list=row.parentElement,order=ids(list),at=order.indexOf(row.dataset.routineId);
  const to=event.key==='Home'?0:event.key==='End'?order.length-1:Math.max(0,Math.min(order.length-1,at+(event.key==='ArrowUp'?-1:1)));
  if(to===at)return;order.splice(at,1);order.splice(to,0,row.dataset.routineId);save(order);
  document.querySelector(`[data-routine-id="${row.dataset.routineId}"] .routine-handle`)?.focus();
 });
}
