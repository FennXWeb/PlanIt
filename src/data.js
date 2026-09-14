// Public reference labels. Store-specific mappings can be added or renamed locally.
export const DEPARTMENTS = [
 [1,'Candy & tobacco'],[2,'Health & beauty'],[3,'Stationery'],[4,'Paper goods'],[5,'Media & gaming'],[6,'Cameras & wireless'],[7,'Toys'],[8,'Pets'],[9,'Sporting goods'],[10,'Automotive'],[11,'Hardware'],[12,'Paint'],[13,'Household chemicals'],[14,'Kitchen & dining'],[15,'Health & wellness'],[16,'Lawn & garden'],[17,'Home décor'],[18,'Seasonal'],[19,'Fabrics & crafts'],[20,'Bath'],[21,'Books & magazines'],[22,'Bedding'],[23,'Menswear'],[24,'Boys’ apparel'],[25,'Shoes'],[26,'Infants & toddlers'],[27,'Ladies’ socks'],[28,'Hosiery'],[29,'Intimate apparel'],[30,'Foundations'],[31,'Accessories'],[32,'Jewelry'],[33,'Girls’ apparel'],[34,'Womenswear'],[35,'Plus size'],[36,'Outerwear'],[37,'Auto service'],[38,'Prescription pharmacy'],[39,'Consumer services'],[40,'OTC pharmacy'],[46,'Cosmetics'],[49,'Optical frames'],[50,'Optical lenses'],[56,'Live plants'],[57,'Hearing center'],[65,'Fuel'],[67,'Celebrations'],[71,'Furniture'],[72,'Electronics'],[74,'Storage & organization'],[77,'Large appliances'],[79,'Baby consumables'],[80,'Service deli'],[81,'Commercial bread'],[82,'Impulse'],[83,'Seafood'],[85,'Photo'],[86,'Financial services'],[87,'Wireless'],[90,'Dairy'],[91,'Frozen'],[92,'Dry grocery'],[93,'Meat'],[94,'Produce'],[95,'DSD grocery'],[96,'Adult beverages'],[97,'Deli wall'],[98,'Bakery'],[99,'Store supplies']
].map(([id,name])=>({id:String(id),name}));
export const ROUTINES = [
 {id:'pinpoint',name:'Pinpoint',minutes:30,description:'Review and work today’s Pinpoint items.',enabled:true},
 {id:'topstock',name:'Top stock',minutes:20,description:'Spread eligible aisles over working days, with a Friday finish.',enabled:true},
 {id:'bins',name:'Bin overstock',minutes:30,description:'Work the overstock binning on your plan.',enabled:false},
 {id:'reshops',name:'Reshops',minutes:30,description:'Assign a working associate inside each configured window.',enabled:true},
 {id:'zone',name:'Zoning',minutes:20,description:'Prioritize the aisles with the oldest completed zone.',enabled:true},
 {id:'feature',name:'Feature to home',minutes:30,description:'Replenish home locations from features.',enabled:false},
 {id:'prices',name:'Price changes',minutes:30,description:'Work approved price changes.',enabled:false},
 {id:'tags',name:'Digital tag errors',minutes:20,description:'Resolve shelf label issues flagged in your area.',enabled:false},
 {id:'swaps',name:'Item swaps',minutes:20,description:'Review and work item swaps.',enabled:false},
 {id:'discrepancies',name:'Feature discrepancies',minutes:20,description:'Review feature locations and discrepancies.',enabled:false},
 {id:'rfid',name:'RFID / deep outs',minutes:40,description:'Scan RFID departments on chosen days; deep outs every Tuesday for the rest.',enabled:false},
 {id:'modular',name:'Modulars',minutes:60,description:'Add pending modular categories to the daily plan.',enabled:false}
];
export const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export const SOURCES = [
 {title:'Department reference',publisher:'SPS Commerce / SupplyPike · July 28, 2020',url:'https://www.spscommerce.com/community/articles/walmart-departments-and-categories',note:'Public supplier reference for department numbers. Labels are a starter list and may be historical; confirm local mappings.'},
 {title:'Walmart product taxonomy',publisher:'Walmart supplier documentation',url:'https://developer.walmart.com/suppliers/docs/product-type-taxonomy-overview',note:'Explains how product types map to Walmart departments. Live supplier data requires authorized access; PlanIt does not connect to it.'},
 {title:'RFID in fresh departments',publisher:'Walmart · October 22, 2025',url:'https://corporate.walmart.com/news/2025/10/22/walmart-and-avery-dennison-collaborate-to-enhance-freshness-and-increase-operational-efficiency-using-rfid',note:'Describes RFID inventory work in meat, bakery, and deli. This is not a store scan calendar.'},
 {title:'Digital shelf labels',publisher:'Walmart',url:'https://corporate.walmart.com/about/everyday-affordability/digital-shelf-labels',note:'Describes electronic price labels and Stock to Light / Pick to Light.'}
];
export const uid = () => globalThis.crypto.randomUUID();
export function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function addDays(date,n){const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export const weekday = date => new Date(date+'T12:00:00').getDay();
export function monday(date){return addDays(date,-((weekday(date)+6)%7));}
export const toMinutes = time => {const [h,m]=time.split(':').map(Number);return h*60+m;};
export const toTime = minutes => `${String(Math.floor(minutes/60)%24).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
export const clockLabel = n => `${Math.floor(n/60)%12||12}:${String(n%60).padStart(2,'0')} ${Math.floor(n/60)%24<12?'am':'pm'}${n>=1440?' +1':''}`;
export const duration = n => n>=60 ? `${Math.floor(n/60)}h${n%60?' '+n%60+'m':''}` : `${n}m`;
export function initialState(){return {version:1,revision:0,profile:null,departments:[],aisles:[],team:[],days:[],repeats:[],modulars:[],settings:{routines:Object.fromEntries(ROUTINES.map(r=>[r.id,{enabled:r.enabled,minutes:r.minutes,days:[0,1,2,3,4,5,6]}])),rfid:{},zoneWindow:{start:840,end:960},reshopWindows:[{start:600,end:660},{start:780,end:840}],topstockDays:[1,2,3,4,5]},tourDraft:[]};}
export const deptName = (state,id) => state.departments.find(d=>d.id===id)?.name || DEPARTMENTS.find(d=>d.id===id)?.name || 'All departments';
